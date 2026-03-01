# Connecting MuscleUpApp to Stripe

You have a Stripe account; follow these steps to take payments and create user accounts after checkout.

**Where do Stripe vars go?** All Stripe configuration (`STRIPE_SECRET_KEY`, `STRIPE_PRODUCT_ID`, `STRIPE_PRICE_ID`, `STRIPE_SUCCESS_URL`, etc.) goes in the **API** `.env` (MuscleUpApp-Api), not the frontend. The frontend only links to the API or calls it; it never sees Stripe keys.

**Landing page dev:** Use **[LANDING_PAGE_DEVELOPER_PROMPT.md](./LANDING_PAGE_DEVELOPER_PROMPT.md)** for the Muscle Up landing page (buy CTA, thank-you page, API calls). No Stripe keys on the landing page.

---

## 1. Get your API keys

1. Log in at [dashboard.stripe.com](https://dashboard.stripe.com).
2. **Developers → API keys**.
3. Copy:
   - **Publishable key** (`pk_test_...` or `pk_live_...`) — used by the frontend only; this API uses only the secret key.
   - **Secret key** (`sk_test_...` or `sk_live_...`) — used by this API. Use **Test** keys while developing.

Add to your `.env`:

```env
STRIPE_SECRET_KEY=sk_test_xxxxxxxx
```

For production, use `sk_live_...` and set `STRIPE_SECRET_KEY` in your host’s environment.

---

## 2. Product and price (same as Handstand)

**Option A — Use a Price ID**

1. In Stripe **Product catalog** → your product (e.g. “Muscle Up Ebook”) → open the **Price**.
2. Copy the **Price ID** (e.g. `price_1ABC...`).

```env
STRIPE_PRICE_ID=price_xxxxxxxx
```

**Option B — Use a Product ID (API resolves the price)**

If you have only the **Product** ID (e.g. Muscle Up ebook `prod_U49XS6OIZN69Kr`), set:

```env
STRIPE_PRODUCT_ID=prod_U49XS6OIZN69Kr
```

The API will use the product’s first active price. The product must have at least one price in the Dashboard.

**Option C — No product/price in Dashboard**

Leave both unset and use `STRIPE_AMOUNT_CENTS` and `STRIPE_PRODUCT_NAME` (see `routes/stripe.js`) for ad‑hoc price_data.

---

## 3. Create a Checkout Session (aligned with Handstand)

**Handstand-style (link or GET):** Use a direct link so the API redirects to Stripe:

- **`GET /api/stripe/create-checkout`** — creates a session and **redirects** to Stripe (same as Handstand’s `GET /api/create-checkout`). Requires `STRIPE_SUCCESS_URL` and optionally `STRIPE_CANCEL_URL` in env. Promotion codes are enabled.

**Frontend (POST + redirect):**

1. Frontend calls **`POST /api/stripe/create-checkout-session`** (optionally with `success_url`, `cancel_url` in the body).
2. API creates a Stripe Checkout Session and returns **`{ url }`**.
3. Frontend redirects the user to `url` (Stripe’s hosted checkout page).
4. User pays; Stripe redirects to your `success_url` (e.g. `https://yoursite.com/success?session_id={CHECKOUT_SESSION_ID}`).

No card data touches your server; Stripe handles PCI. **Promotion codes** are enabled (same as Handstand).

---

## 4. After payment: complete signup (Handstand-style)

Same flow as Handstand: success page verifies session, shows form (name + email only), API creates user and emails login link.

1. **Prefill email:** Success page calls **`GET /api/stripe/verify-session?session_id=xxx`** → API returns `{ email }` so you can prefill the form.
2. User enters **name** and **email** (no password on the form).
3. Frontend calls **`POST /api/stripe/complete-signup`** with body: `{ session_id` or `sessionId`, `name`, `email` }.
4. API:
   - Verifies the Stripe session is paid, creates the user, generates a temporary password, and **sends an email** (Resend) with a "Set your password & log in" link. If **NOTIFY_EMAIL** (or **OWNER_EMAIL**) is set, you also get a "New Muscle Up purchase" email with the customer’s name and email. Returns **`{ success: true }`**.
5. User checks email, clicks the link → tracker app `/set-password?token=...` → sets password and is logged in.

Requires **RESEND_API_KEY**, **RESEND_FROM**, and **TRACKER_APP_URL** (or **TRACKER_LOGIN_URL**) in the API env. Set **NOTIFY_EMAIL** to your own address to receive a notification on each new purchase/signup. Optional: if the frontend sends **`temporaryPassword`** in the body, the API skips sending the email and returns **`set_password_token`**.

---

## 5. Webhooks (so Stripe can notify you)

Webhooks are used to:

- **Send the invite email automatically** — When Stripe sends `checkout.session.completed` (or `checkout.session.async_payment_succeeded`), the API creates the user and sends the “Your Muscle Up Tracker login” email. So the buyer gets the invite even if they never visit the thank-you page (same behaviour as the Handstand app).
- Fulfill orders reliably (even if the user closes the browser before hitting your success page).
- Handle delayed payment methods (e.g. bank debits) via `checkout.session.async_payment_succeeded`.

You need an endpoint that Stripe can call:

**Production**

1. **Developers → Webhooks → Add endpoint**.
2. URL: `https://your-api-domain.com/api/stripe/webhook`.
3. Events to send: **`checkout.session.completed`** and **`checkout.session.async_payment_succeeded`** (for delayed payments).
4. After creating the endpoint, open it and reveal **Signing secret** (`whsec_...`).

Add to production env:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxx
```

**Local testing**

1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli).
2. Run:
   ```bash
   stripe login
   stripe listen --forward-to http://localhost:4000/api/stripe/webhook
   ```
3. The CLI prints a **webhook signing secret** (e.g. `whsec_...`). Put that in `.env` as `STRIPE_WEBHOOK_SECRET` while testing.

The API uses this secret to verify that incoming webhook requests really come from Stripe.

For webhook-triggered invite emails to work, the same env as complete-signup is required: **RESEND_API_KEY**, **RESEND_FROM**, and **TRACKER_APP_URL** (or **TRACKER_LOGIN_URL**). Stripe Checkout must collect the customer’s email (default).

---

## 6. Environment variables summary

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Secret key from Dashboard (test or live). |
| `STRIPE_PRICE_ID` | One of these | Price ID (e.g. `price_1ABC...`) from Dashboard → Product → Price. |
| `STRIPE_PRODUCT_ID` | One of these | Product ID (e.g. `prod_U49XS6OIZN69Kr` for Muscle Up ebook); API uses the product’s first active price. |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhooks | Signing secret from Webhooks dashboard or `stripe listen`. |
| `STRIPE_SUCCESS_URL` | Yes for checkout | Where to send the user after payment (must include `{CHECKOUT_SESSION_ID}`). |
| `STRIPE_CANCEL_URL` | Optional | Where to send the user if they cancel (e.g. `https://yoursite.com/#buy`). |
| `NOTIFY_EMAIL` or `OWNER_EMAIL` | Optional | Your email; you get a “New Muscle Up purchase” notification when someone completes signup after buying (same Resend config as customer emails). |

If both `STRIPE_PRICE_ID` and `STRIPE_PRODUCT_ID` are set, `STRIPE_PRICE_ID` is used.

---

## 7. Frontend flow (summary)

**Option A — Handstand-style:** “Buy” link points to `GET /api/stripe/create-checkout` → user is redirected to Stripe → after payment, Stripe redirects to your success page with `session_id`.

**Option B — SPA:** User clicks “Buy” → frontend calls `POST /api/stripe/create-checkout-session` → redirect to `response.url` → same as above.

Then (same for both):

3. Success page shows a short form (email, name, temporary password).
4. Frontend calls `POST /api/stripe/complete-signup` with `session_id` + form data.
5. API returns `set_password_token` (+ `userId`) → frontend redirects to `/set-password?token=...` so the user sets their real password and is logged in.

---

## 8. Security notes

- **Secret key**: Never expose `STRIPE_SECRET_KEY` in the frontend or in git. Only the API server uses it.
- **Webhook signature**: The webhook handler verifies `Stripe-Signature` using `STRIPE_WEBHOOK_SECRET`; do not skip this in production.
- **Idempotency**: Each Checkout Session can only be used once for signup; the API stores fulfilled session IDs and rejects reuse.

---

## 9. Going live

1. In Stripe Dashboard, complete **Activate your account** (identity and bank details).
2. Create a **live** product/price if you didn’t already.
3. Switch to **Live** mode (toggle in Dashboard).
4. Replace test keys with live keys in production env: `STRIPE_SECRET_KEY=sk_live_...`.
5. Add the production webhook endpoint (see step 5) and set `STRIPE_WEBHOOK_SECRET` to the **live** endpoint’s signing secret.
6. Set `STRIPE_SUCCESS_URL` and `STRIPE_CANCEL_URL` to your real domain.

You can keep using test keys and `stripe listen` in development.
