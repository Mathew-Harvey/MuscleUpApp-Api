# Frontend Onboarding Flow — Post-Purchase

Instructions for the **mu-web** and **mu-landing** frontend teams.

---

## Overview of changes (API)

The API has been updated to support a seamless post-purchase onboarding flow. Key changes:

1. `POST /api/stripe/complete-signup` now **creates an authenticated session** and returns user data + a `needsPasswordSetup` flag.
2. `GET /api/auth/me` now includes `user.needs_password_setup` (boolean) on every response.
3. New endpoint `POST /api/auth/setup-password` lets an already-authenticated user set their password **without needing a token**.
4. Emails are now sending correctly (was broken by a Resend SDK import bug).
5. `set_password` tokens now last 7 days (was 1 hour).

---

## The Full Purchase → Onboarding Flow

### Step 1: Stripe Checkout

Landing page redirects user to Stripe via `GET /api/stripe/create-checkout` or `POST /api/stripe/create-checkout-session`.

After payment, Stripe redirects to:
```
https://muscleup-web.onrender.com/success?session_id={CHECKOUT_SESSION_ID}
```

### Step 2: Success Page (mu-web `/success`)

The web app's success page should:

```
1. Extract `session_id` from the URL query params
2. Call GET /api/stripe/verify-session?session_id={session_id}
   → Returns { email: "user@example.com" }
3. Show a "Complete your signup" form:
   - Name (text input, required)
   - Email (prefilled from verify-session, readonly)
4. On submit → call POST /api/stripe/complete-signup
```

**Request:**
```json
POST /api/stripe/complete-signup
Content-Type: application/json

{
  "session_id": "cs_live_...",
  "name": "John Doe",
  "email": "john@example.com"
}
```

**Response (201):**
```json
{
  "success": true,
  "needsPasswordSetup": true,
  "setPasswordToken": "abc123...hex...",
  "user": {
    "id": 42,
    "email": "john@example.com",
    "display_name": "John Doe",
    "current_level": 1,
    "theme": "dark"
  }
}
```

**Important:** This response sets an authenticated session cookie. The user is now logged in.

### Step 3: Password Setup (immediately after signup)

After receiving the `complete-signup` response, the frontend should **immediately** show a "Set your password" screen. Do NOT navigate to the dashboard first.

**Option A — Preferred (no token needed):**
```json
POST /api/auth/setup-password
Content-Type: application/json

{
  "newPassword": "their-chosen-password",
  "confirm_password": "their-chosen-password"
}
```

This endpoint uses the existing session (set in step 2). No token required.

**Response (200):**
```json
{
  "user": {
    "id": 42,
    "email": "john@example.com",
    "display_name": "John Doe",
    "current_level": 1,
    "theme": "dark"
  }
}
```

**Option B — Token-based (for email link flow):**
```json
POST /api/auth/set-password
Content-Type: application/json

{
  "token": "abc123...hex...",
  "newPassword": "their-chosen-password"
}
```

### Step 4: Welcome / Dashboard

After password is set, navigate to the main dashboard. The user is fully onboarded.

---

## Handling `needs_password_setup` on Every Page Load

On app init (or route guard), the frontend should call `GET /api/auth/me` and check:

```json
{
  "authenticated": true,
  "user": {
    "id": 42,
    "email": "john@example.com",
    "display_name": "John Doe",
    "current_level": 1,
    "theme": "dark",
    "needs_password_setup": true
  }
}
```

**If `user.needs_password_setup === true`**, redirect to a password-setup screen and block access to other pages until the password is set. This handles:
- Users who closed the browser before setting a password
- Users who arrive via the email link
- Users who were created by the Stripe webhook (background)

---

## Email Link Flow (backup path)

The user also receives an email with a link:
```
https://muscleup-web.onrender.com/set-password?token=abc123...
```

The `/set-password` page should:

1. Extract `token` from query params
2. Call `GET /api/auth/validate-set-password-token?token={token}`
   - This validates the token AND creates an authenticated session
   - Returns `{ user: {...} }`
3. Show the set-password form
4. On submit → `POST /api/auth/set-password` with `{ token, newPassword }`
5. Navigate to dashboard

---

## API Endpoint Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/stripe/verify-session?session_id=` | GET | No | Verify payment, get customer email |
| `/api/stripe/complete-signup` | POST | No | Create user, start session, send email |
| `/api/auth/me` | GET | Session | Get current user (includes `needs_password_setup`) |
| `/api/auth/setup-password` | POST | Session | Set password (first-time, no token needed) |
| `/api/auth/set-password` | POST | No | Set password using token (email link flow) |
| `/api/auth/validate-set-password-token?token=` | GET | No | Validate token, create session |
| `/api/auth/forgot-password` | POST | No | Send password reset email |

---

## Environment Variable Issues to Fix

### mu-api (Render)

**Must add:**
- `STRIPE_WEBHOOK_SECRET` — Get from Stripe Dashboard → Developers → Webhooks. Without this, the webhook endpoint returns 503 and the backup user-creation path is dead.
- `NOTIFY_EMAIL` — Your email address, to receive purchase notifications.

**Must update:**
- `SESSION_SECRET` — Currently set to `muscleup-dev-secret-change-me`. Generate a real secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### mu-landing (Render)

**Must fix:**
- `TRACKER_API_SECRET` — Currently `608805ab5dc0b69c6aa88ba7f4f48114` but the API has `5aa5142d32d2ffa31de334167e4e4d58`. These **must match** or the landing page cannot create users via the `/api/users` endpoint.

### Resend — Email Delivery (CRITICAL)

The sender address `onboarding@resend.dev` is Resend's **test-only sandbox sender**. It can **only deliver to the email address associated with your Resend account**. This means no customer will ever receive an email.

**To fix:**
1. Go to [Resend Dashboard](https://resend.com/domains) → Add your domain (e.g. `muscleup.app` or `thebodyweightgym.com`)
2. Add the DNS records Resend provides (SPF, DKIM, etc.)
3. Once verified, update env vars on both **mu-api** and **mu-landing**:
   ```
   RESEND_FROM="Muscle Up Tracker <noreply@yourdomain.com>"
   ```

---

## Sequence Diagram

```
User          Landing Page         Stripe          mu-api           mu-web
 |                |                   |               |                |
 |--Buy button--->|                   |               |                |
 |                |--create-checkout->|               |                |
 |                |                   |--redirect---->|                |
 |                |                   |  (payment)    |                |
 |<----------redirect to /success?session_id=xxx------|                |
 |                                                    |                |
 |-------------------------------------------------->|  /success page |
 |                                                    |                |
 |                                    GET /api/stripe/verify-session   |
 |                                    <----------{ email }-------------|
 |                                                    |                |
 |                                    [Show signup form: name + email] |
 |                                                    |                |
 |                                    POST /api/stripe/complete-signup |
 |                                    <--{ user, needsPasswordSetup }--|
 |                                         (session cookie set)       |
 |                                                    |                |
 |                                    [Show set-password form]        |
 |                                                    |                |
 |                                    POST /api/auth/setup-password   |
 |                                    <--------{ user }---------------|
 |                                                    |                |
 |                                    [Navigate to dashboard]         |
```
