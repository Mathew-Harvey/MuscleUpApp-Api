# Muscle Up landing page — developer handoff

**Audience:** Developer building the Muscle Up **landing page** (the site where users buy access to the Muscle Up Tracker web app via Stripe).

**Summary:** Stripe checkout and account creation live on the **Muscle Up API**. The landing page only needs to link to the API and call it from your thank-you page. No Stripe keys or backend required on the landing page.

---

## 1. Flow overview

1. User clicks **“Buy” / “Get access”** on the landing page → they go to the **API** checkout URL → API redirects them to **Stripe Checkout**.
2. After payment, Stripe redirects to **your thank-you page** with `?session_id=cs_xxx` in the URL (this URL is configured in the API’s env).
3. Thank-you page reads `session_id`, optionally prefills the form with the payer’s email, then user submits **name + email**.
4. Your page sends that to the API → API creates their Tracker account and **emails them a login link** (set password + log in).
5. You show a success message: “Check your email for your Progress Tracker login.”

Same flow as the Handstand landing page; the only difference is that for Muscle Up the **API** does Stripe and user creation, so your site only talks to the API.

---

## 2. What you need from the API team

- **API base URL**  
  Example: `https://muscleup-api.onrender.com` (no trailing slash).  
  You’ll use this for all links and requests below.

- **Thank-you URL**  
  The exact URL of your thank-you page, e.g. `https://muscleup-landing.example.com/thank-you` or `https://muscleup-landing.example.com/success`.  
  The API team will set this as `STRIPE_SUCCESS_URL` (with `?session_id={CHECKOUT_SESSION_ID}`) so Stripe redirects here after payment.

- **CORS**  
  The API must allow your landing origin in `ALLOWED_ORIGINS` (e.g. `https://muscleup-landing.example.com`) so the thank-you page can call the API from the browser. Ask the API team to add your production (and if needed, staging) origin.

---

## 3. Buy button / CTA

Send the user to the API’s checkout endpoint. It will redirect them to Stripe.

**URL:** `GET {API_BASE_URL}/api/stripe/create-checkout`

Examples:

- HTML link:  
  `<a href="https://muscleup-api.onrender.com/api/stripe/create-checkout">Get Ebook + Tracker access</a>`
- Or use your API base URL from config:  
  `<a href="{{ API_BASE_URL }}/api/stripe/create-checkout">Get Ebook + Tracker access</a>`

Use **GET** and the **full URL**; no request body. The user will leave your site and come back to your thank-you URL after payment.

---

## 4. Thank-you page

Stripe will send the user to your thank-you URL with a query parameter:

- **Query param:** `session_id` (e.g. `?session_id=cs_xxxxx`)

Your thank-you page should:

1. **Read `session_id`** from the URL (e.g. `URLSearchParams` or your router).
2. If `session_id` is missing, show a message like: “Missing payment session. If you just paid, try refreshing. Otherwise return to the homepage to purchase.”
3. **Optional — prefill email:**  
   Request: `GET {API_BASE_URL}/api/stripe/verify-session?session_id={session_id}`  
   - 200: body is `{ "email": "customer@example.com" }` or `{ "email": null }`.  
   - Use `email` to prefill the email field.  
   - On 403/404/5xx, you can still show the form; just don’t prefill.
4. **Form:**  
   - Fields: **Name** (required), **Email** (required).  
   - No password field; the API will email a login link and temporary password.
5. **Submit form:**  
   - Request: `POST {API_BASE_URL}/api/stripe/complete-signup`  
   - Headers: `Content-Type: application/json`  
   - Body (JSON):  
     `{ "sessionId": "<session_id from URL>", "name": "<name>", "email": "<email>" }`  
     You can send `session_id` instead of `sessionId`; the API accepts both.
6. **Response handling:**  
   - **200 + `{ "success": true }`** → Show: “Check your email for your Progress Tracker login. You’ll set a new password on first sign-in.” (and hide or disable the form).  
   - **4xx/5xx** → Show `body.error` if present, or a generic “Something went wrong. Please try again or contact support.”

Use **credentials: 'include'** only if the API is on the same origin as your landing page; for a different origin, a simple `fetch(url, { method, headers, body })` is enough (no cookies needed for this endpoint).

---

## 5. API contract reference

| Action              | Method | URL / body | Notes |
|---------------------|--------|------------|--------|
| Start checkout      | GET    | `{API_BASE}/api/stripe/create-checkout` | Redirects to Stripe. |
| Verify session      | GET    | `{API_BASE}/api/stripe/verify-session?session_id=cs_xxx` | Returns `{ "email": "..." \| null }`. |
| Complete signup     | POST   | `{API_BASE}/api/stripe/complete-signup` | Body: `{ "sessionId", "name", "email" }`. Returns `{ "success": true }` or error. |

All responses that indicate an error (4xx/5xx) have a JSON body with an `error` string when applicable.

---

## 6. Environment / config on the landing page

You only need the **API base URL** (e.g. from env or build config):

- **Production:** `MUSCLEUP_API_URL` or `API_BASE_URL` = e.g. `https://muscleup-api.onrender.com`
- **Local/dev:** same variable pointing at e.g. `http://localhost:4000` (with API running locally)

Do **not** put any Stripe keys or API secrets on the landing page. Stripe and user creation are handled entirely by the API.

---

## 7. Optional: “Already bought?” link

Add a link to the Tracker web app (the app they get access to after purchase), e.g.:

- “Already bought? [Open your Muscle Up Tracker →](https://muscleup-web.example.com)”

Use the same URL the API team uses for “set password” emails (their `TRACKER_APP_URL` / `TRACKER_LOGIN_URL`).

---

## 8. Checklist for the landing page dev

- [ ] Buy CTA links to `GET {API_BASE}/api/stripe/create-checkout`.
- [ ] Thank-you URL is agreed with API team and set as `STRIPE_SUCCESS_URL` on the API.
- [ ] Thank-you page reads `session_id` from the URL and shows an error if it’s missing.
- [ ] Optional: GET verify-session to prefill email.
- [ ] Form has name + email; submit sends POST complete-signup with `sessionId`, `name`, `email`.
- [ ] Success: show “Check your email…”; errors: show `error` from response.
- [ ] Landing origin is added to API `ALLOWED_ORIGINS` for CORS.
- [ ] “Already bought?” link to Tracker app if desired.

---

## 9. Reference

- **Stripe/API setup (for API maintainers):** [STRIPE_SETUP.md](./STRIPE_SETUP.md) in this repo.
- **Handstand thank-you flow:** If you have access to the Handstand landing repo, `thank-you.html` is a working reference (same flow; Handstand calls its own backend, you call the Muscle Up API).
