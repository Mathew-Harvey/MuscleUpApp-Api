const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const Stripe = require('stripe');
const { createUser } = require('../lib/createUser');

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

/** Send "Your Muscle Up Tracker is ready" login email. Requires RESEND_API_KEY, RESEND_FROM, TRACKER_APP_URL. */
async function sendLoginEmail(userEmail, displayName, tempPassword, setPasswordToken) {
  const trackerOrigin = (process.env.TRACKER_APP_URL || process.env.TRACKER_LOGIN_URL || '').replace(/\/$/, '');
  if (!trackerOrigin || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return { ok: false };
  const loginLink = trackerOrigin + '/set-password?token=' + encodeURIComponent(setPasswordToken);
  const escapedName = (displayName || 'Customer').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedEmail = (userEmail || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0f1a;color:#e2e8f0;padding:40px;">
<div style="max-width:520px;margin:0 auto;background:#161d2f;border-radius:8px;padding:32px;">
  <h1 style="margin:0 0 16px 0;font-size:24px;">Your Muscle Up Tracker is ready</h1>
  <p style="margin:0 0 24px 0;">Hi ${escapedName},</p>
  <p style="margin:0 0 24px 0;">Use the button below to open the Progress Tracker. You'll log in with your email and the temporary password below, then set a new password on first sign-in.</p>
  <p style="margin:0 0 24px 0;"><a href="${loginLink}" style="display:inline-block;padding:14px 28px;background:#2d8bc9;color:#fff;text-decoration:none;border-radius:4px;font-weight:700;">Set your password &amp; log in</a></p>
  <div style="background:rgba(45,139,201,0.1);border-radius:4px;padding:20px;margin:24px 0;">
    <p style="margin:0 0 4px 0;"><strong>Email:</strong> ${escapedEmail}</p>
    <p style="margin:0;"><strong>Temporary password:</strong> <code style="background:rgba(0,0,0,0.2);padding:2px 8px;">${tempPassword}</code></p>
  </div>
  <p style="margin:24px 0 0 0;font-size:14px;color:#94a3b8;">— Muscle Up Tracker</p>
</div></body></html>`;
  const Resend = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM,
    to: [userEmail],
    subject: 'Your Muscle Up Tracker login',
    html,
  });
  return error ? { ok: false, error } : { ok: true };
}

/** Send "New purchase" notification to owner (you). Optional: set NOTIFY_EMAIL in env. */
async function sendOwnerNotificationEmail(customerEmail, customerName) {
  const to = (process.env.NOTIFY_EMAIL || process.env.OWNER_EMAIL || '').toString().trim();
  if (!to || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return;
  const escapedName = (customerName || 'Customer').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedEmail = (customerEmail || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const trackerUrl = (process.env.TRACKER_APP_URL || process.env.TRACKER_LOGIN_URL || '').replace(/\/$/, '');
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0a0f1a;color:#e2e8f0;padding:40px;">
<div style="max-width:520px;margin:0 auto;background:#161d2f;border-radius:8px;padding:32px;">
  <h1 style="margin:0 0 16px 0;font-size:24px;">New Muscle Up purchase</h1>
  <p style="margin:0 0 24px 0;">Someone just bought the Muscle Up ebook and signed up for the tracker.</p>
  <div style="background:rgba(45,139,201,0.1);border-radius:4px;padding:20px;margin:24px 0;">
    <p style="margin:0 0 4px 0;"><strong>Name:</strong> ${escapedName}</p>
    <p style="margin:0;"><strong>Email:</strong> ${escapedEmail}</p>
  </div>
  ${trackerUrl ? `<p style="margin:0;font-size:14px;color:#94a3b8;"><a href="${trackerUrl}" style="color:#60a5fa;">Open Muscle Up Tracker</a></p>` : ''}
  <p style="margin:24px 0 0 0;font-size:14px;color:#94a3b8;">— Muscle Up Tracker</p>
</div></body></html>`;
  const Resend = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM,
    to: [to],
    subject: 'New Muscle Up purchase — ' + (customerName || customerEmail),
    html,
  });
  if (error) console.error('Owner notification email failed:', error.message || error);
}

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

async function resolvePriceId(stripeClient) {
  if (process.env.STRIPE_PRICE_ID) return process.env.STRIPE_PRICE_ID;
  const productId = process.env.STRIPE_PRODUCT_ID;
  if (productId && stripeClient) {
    const prices = await stripeClient.prices.list({ product: productId, active: true, limit: 1 });
    if (prices.data.length) return prices.data[0].id;
  }
  return null;
}

module.exports = function (pool) {
  const router = express.Router();

  // Shared checkout session creation (used by both GET redirect and POST returning url)
  async function createCheckoutSession(successUrl, cancelUrl) {
    const priceId = await resolvePriceId(stripe);
    const params = {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl || successUrl.replace(/\?.*/, ''),
      allow_promotion_codes: true,
      line_items: [],
    };
    if (priceId) {
      params.line_items.push({ price: priceId, quantity: 1 });
    } else {
      const amount = Number(process.env.STRIPE_AMOUNT_CENTS) || 999;
      params.line_items.push({
        price_data: {
          currency: process.env.STRIPE_CURRENCY || 'usd',
          product_data: {
            name: process.env.STRIPE_PRODUCT_NAME || 'Muscle Up Tracker access',
          },
          unit_amount: amount,
        },
        quantity: 1,
      });
    }
    return stripe.checkout.sessions.create(params);
  }

  // GET /api/stripe/create-checkout — redirect to Stripe (Handstand-style: link or form GET)
  router.get('/stripe/create-checkout', sensitiveLimiter, async (req, res) => {
    if (!stripe) {
      return res.status(503).send('Checkout is not configured. Please try again later.');
    }
    const baseUrl = (process.env.STRIPE_SUCCESS_URL || '').replace(/\?.*$/, '').replace(/\/$/, '') || (process.env.TRACKER_APP_URL || process.env.TRACKER_LOGIN_URL || 'http://localhost:3000').replace(/\/$/, '');
    const successUrl = process.env.STRIPE_SUCCESS_URL || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${baseUrl}/#buy`;
    if (!successUrl.includes('{CHECKOUT_SESSION_ID}')) {
      return res.status(500).send('STRIPE_SUCCESS_URL must include {CHECKOUT_SESSION_ID}.');
    }
    try {
      const session = await createCheckoutSession(successUrl, cancelUrl);
      res.redirect(302, session.url);
    } catch (err) {
      console.error('Stripe create-checkout (GET) error:', err);
      res.status(500).send('Could not start checkout. Please try again.');
    }
  });

  // POST /api/stripe/create-checkout-session — return { url } for frontend redirect
  router.post('/stripe/create-checkout-session', sensitiveLimiter, async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured (STRIPE_SECRET_KEY).' });
    }
    const successUrl = req.body.success_url || process.env.STRIPE_SUCCESS_URL;
    const cancelUrl = req.body.cancel_url || process.env.STRIPE_CANCEL_URL;
    if (!successUrl || !successUrl.includes('{CHECKOUT_SESSION_ID}')) {
      return res.status(400).json({
        error: 'success_url is required and must include {CHECKOUT_SESSION_ID}. Set STRIPE_SUCCESS_URL or pass success_url in body.',
      });
    }
    try {
      const session = await createCheckoutSession(successUrl, cancelUrl);
      res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe create-checkout-session error:', err);
      res.status(500).json({ error: 'Could not create checkout session.' });
    }
  });

  // GET /api/stripe/verify-session?session_id= — Handstand parity: verify payment, return customer email for prefilling form
  router.get('/stripe/verify-session', sensitiveLimiter, async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: 'Checkout is not configured.' });
    }
    const sessionId = req.query.session_id || req.query.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing session_id' });
    }
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer_details'] });
      if (session.payment_status !== 'paid') {
        return res.status(403).json({ error: 'Payment not completed' });
      }
      const email = session.customer_details?.email || session.customer_email || null;
      res.json({ email: email || null });
    } catch (err) {
      if (err.code === 'resource_missing') {
        return res.status(404).json({ error: 'Invalid or expired session' });
      }
      console.error('Stripe verify-session error:', err);
      res.status(500).json({ error: 'Could not verify payment' });
    }
  });

  // POST /api/stripe/complete-signup — Handstand parity: body { session_id|sessionId, name, email }
  // Optional: temporaryPassword. If omitted, server generates one and emails set-password link (same as Handstand).
  router.post('/stripe/complete-signup', sensitiveLimiter, async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured (STRIPE_SECRET_KEY).' });
    }
    const { session_id, sessionId, email, name, display_name, temporaryPassword } = req.body;
    const sid = (session_id || sessionId || '').toString().trim();
    if (!sid) {
      return res.status(400).json({ error: 'session_id or sessionId is required.' });
    }
    const displayName = (name || display_name || '').toString().trim();
    if (!displayName) {
      return res.status(400).json({ error: 'name is required.' });
    }
    const userEmail = (email || '').toString().trim().toLowerCase();
    if (!userEmail) {
      return res.status(400).json({ error: 'email is required.' });
    }

    const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
    const trackerOrigin = (process.env.TRACKER_APP_URL || process.env.TRACKER_LOGIN_URL || '').replace(/\/$/, '');
    const handstandStyle = !temporaryPassword; // name + email only → we generate password and email link
    if (handstandStyle && (!hasResend || !trackerOrigin)) {
      return res.status(503).json({
        error: 'Login emails are not set up yet. Please contact support with your email and we\'ll send your Progress Tracker login details.',
      });
    }

    try {
      const existing = await pool.query(
        'SELECT user_id FROM mu_stripe_fulfillments WHERE checkout_session_id = $1',
        [sid]
      );
      if (existing.rows.length) {
        return res.status(400).json({
          error: 'This payment has already been used to create an account. Please log in or use forgot password.',
        });
      }

      const session = await stripe.checkout.sessions.retrieve(sid, { expand: ['customer_details'] });
      if (session.payment_status !== 'paid') {
        return res.status(403).json({ error: 'Payment not completed' });
      }
      const sessionEmail = session.customer_details?.email || session.customer_email;
      if (sessionEmail && sessionEmail.toLowerCase() !== userEmail) {
        return res.status(400).json({ error: 'Email does not match payment' });
      }

      const tempPassword = temporaryPassword || crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
      const result = await createUser(pool, {
        email: userEmail,
        name: displayName,
        temporaryPassword: tempPassword,
      });

      await pool.query(
        'INSERT INTO mu_stripe_fulfillments (checkout_session_id, user_id) VALUES ($1, $2)',
        [sid, result.userId]
      );

      if (handstandStyle) {
        const emailResult = await sendLoginEmail(userEmail, displayName, tempPassword, result.setPasswordToken);
        if (!emailResult.ok) {
          console.error('Stripe complete-signup email failed:', emailResult.error);
          return res.status(500).json({ error: 'Account created but we could not send the login email. Please use forgot password.' });
        }
      }
      await sendOwnerNotificationEmail(userEmail, displayName);

      if (handstandStyle) {
        res.status(200).json({ success: true });
      } else {
        res.status(result.created ? 201 : 200).json({
          setPasswordToken: result.setPasswordToken,
          set_password_token: result.setPasswordToken,
          userId: result.userId,
        });
      }
    } catch (err) {
      if (err.message && /required|Invalid|at least 8/.test(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      if (err.code === 'resource_missing') {
        return res.status(400).json({ error: 'Invalid session_id.' });
      }
      console.error('Stripe complete-signup error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // Webhook handler — must be called with raw body (see server.js)
  async function webhookHandler(req, res) {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET not set; webhook signature not verified.');
      return res.status(503).json({ error: 'Webhook not configured.' });
    }
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe not configured.' });
    }
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        const sessionId = session.id;
        const existing = await pool.query(
          'SELECT user_id FROM mu_stripe_fulfillments WHERE checkout_session_id = $1',
          [sessionId]
        );
        if (existing.rows.length === 0) {
          const fullSession = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['customer_details'] });
          const userEmail = (fullSession.customer_details?.email || fullSession.customer_email || '').toString().trim().toLowerCase();
          if (userEmail) {
            const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
            const trackerOrigin = (process.env.TRACKER_APP_URL || process.env.TRACKER_LOGIN_URL || '').replace(/\/$/, '');
            const displayName = (fullSession.customer_details?.name || 'Customer').toString().trim().slice(0, 100) || 'Customer';
            const tempPassword = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
            try {
              const result = await createUser(pool, {
                email: userEmail,
                name: displayName,
                temporaryPassword: tempPassword,
              });
              await pool.query(
                'INSERT INTO mu_stripe_fulfillments (checkout_session_id, user_id) VALUES ($1, $2)',
                [sessionId, result.userId]
              );
              if (hasResend && trackerOrigin) {
                const emailResult = await sendLoginEmail(userEmail, displayName, tempPassword, result.setPasswordToken);
                if (!emailResult.ok) {
                  console.error('Stripe webhook: login email failed for', userEmail, emailResult.error);
                }
              } else {
                console.warn('Stripe webhook: user created but login email not sent (RESEND/TRACKER_APP_URL not set).');
              }
            } catch (err) {
              console.error('Stripe webhook fulfillment error:', err);
              // Still return 200 so Stripe doesn't retry forever; we've logged it.
            }
          }
        }
      }
    }

    res.json({ received: true });
  }

  return { router, webhookHandler };
};
