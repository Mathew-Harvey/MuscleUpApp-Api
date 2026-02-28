const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const SET_PASSWORD_EXPIRY_HOURS = 1;
const RESET_PASSWORD_EXPIRY_HOURS = 1;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_MAX_LENGTH = 100;
const TEMP_PASSWORD_MIN_LENGTH = 8;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function requireTrackerApiSecret(req, res, next) {
  const secret = process.env.TRACKER_API_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      return res.status(503).json({ error: 'Create-user API is not configured (TRACKER_API_SECRET).' });
    }
    return next();
  }

  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];
  const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const provided = bearer || apiKey;
  if (!provided) {
    return res.status(401).json({ error: 'Missing or invalid API secret.' });
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Missing or invalid API secret.' });
  }
  next();
}

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

module.exports = function (pool) {
  // Check auth status
  router.get('/auth/me', async (req, res) => {
    if (!req.session || !req.session.userId) {
      return res.json({ authenticated: false });
    }
    try {
      const result = await pool.query(
        'SELECT id, email, display_name, current_level, theme, created_at FROM mu_users WHERE id=$1',
        [req.session.userId]
      );
      if (!result.rows.length) return res.json({ authenticated: false });
      res.json({ authenticated: true, user: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Create-user handler (landing page post-purchase)
  async function createUserHandler(req, res) {
    const { email, name, display_name, temporaryPassword, forcePasswordChange } = req.body;
    let displayName = (name != null ? String(name) : display_name != null ? String(display_name) : '').trim();
    if (!email || !email.toString().trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    if (!displayName) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      displayName = displayName.slice(0, DISPLAY_NAME_MAX_LENGTH);
    }
    if (!temporaryPassword || typeof temporaryPassword !== 'string' || !temporaryPassword.trim()) {
      return res.status(400).json({ error: 'temporaryPassword is required.' });
    }
    if (temporaryPassword.trim().length < TEMP_PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ error: 'temporaryPassword must be at least 8 characters.' });
    }
    const emailNorm = email.toString().trim().toLowerCase();
    if (!EMAIL_REGEX.test(emailNorm)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    const tempPasswordHash = await bcrypt.hash(temporaryPassword.trim(), 12);
    try {
      const exists = await pool.query('SELECT id, email, display_name, current_level FROM mu_users WHERE email=$1', [emailNorm]);
      const expiresAt = new Date(Date.now() + SET_PASSWORD_EXPIRY_HOURS * 60 * 60 * 1000);
      const token = generateToken();

      if (exists.rows.length) {
        const user = exists.rows[0];
        await pool.query(
          'UPDATE mu_users SET display_name = $1, password_hash = $2, updated_at = NOW() WHERE id = $3',
          [displayName, tempPasswordHash, user.id]
        );
        await pool.query(
          'INSERT INTO mu_password_tokens (user_id, token_hash, type, expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, type) DO UPDATE SET token_hash=$2, expires_at=$4',
          [user.id, hashToken(token), 'set_password', expiresAt]
        );
        return res.status(200).json({
          setPasswordToken: token,
          set_password_token: token,
          userId: String(user.id),
        });
      }

      const result = await pool.query(
        'INSERT INTO mu_users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id, email, display_name, current_level',
        [emailNorm, tempPasswordHash, displayName]
      );
      const user = result.rows[0];
      await pool.query(
        'INSERT INTO mu_password_tokens (user_id, token_hash, type, expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, type) DO UPDATE SET token_hash=$2, expires_at=$4',
        [user.id, hashToken(token), 'set_password', expiresAt]
      );
      res.status(201).json({
        setPasswordToken: token,
        set_password_token: token,
        userId: String(user.id),
      });
    } catch (err) {
      console.error('Create-user error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  }

  router.post('/users', sensitiveLimiter, requireTrackerApiSecret, createUserHandler);
  router.post('/auth/create-user', sensitiveLimiter, requireTrackerApiSecret, createUserHandler);

  // Register
  router.post('/auth/register', async (req, res) => {
    const { email, password, confirm_password, display_name } = req.body;
    if (!email || !password || !confirm_password || !display_name) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    if (!display_name.trim()) {
      return res.status(400).json({ error: 'Display name cannot be empty.' });
    }
    try {
      const exists = await pool.query('SELECT id FROM mu_users WHERE email=$1', [email.toLowerCase()]);
      if (exists.rows.length) {
        return res.status(409).json({ error: 'Email already registered.' });
      }
      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        'INSERT INTO mu_users (email, password_hash, display_name, theme) VALUES ($1,$2,$3,$4) RETURNING id, email, display_name, current_level, theme',
        [email.toLowerCase(), hash, display_name.trim(), 'dark']
      );
      const user = result.rows[0];
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => { if (err) reject(err); else resolve(); });
      });
      req.session.userId = user.id;
      req.session.displayName = user.display_name;
      res.status(201).json({ user });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // Login
  router.post('/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    try {
      const result = await pool.query(
        'SELECT id, email, display_name, current_level, theme, password_hash FROM mu_users WHERE email=$1',
        [email.toLowerCase()]
      );
      if (!result.rows.length) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => { if (err) reject(err); else resolve(); });
      });
      req.session.userId = user.id;
      req.session.displayName = user.display_name;
      res.json({
        user: { id: user.id, email: user.email, display_name: user.display_name, current_level: user.current_level, theme: user.theme }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // Logout (requireAuth so only authenticated users can clear their session)
  router.post('/auth/logout', requireAuth, (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  // Validate set-password token
  router.get('/auth/validate-set-password-token', async (req, res) => {
    const token = req.query.token || req.query.set_password_token;
    if (!token) return res.status(400).json({ error: 'Token required' });
    try {
      const r = await pool.query(
        `SELECT u.id, u.email, u.display_name, u.current_level FROM mu_users u
         JOIN mu_password_tokens pt ON pt.user_id = u.id
         WHERE pt.token_hash = $1 AND pt.type IN ('set_password', 'reset_password') AND pt.expires_at > NOW()`,
        [hashToken(token)]
      );
      if (!r.rows.length) return res.status(400).json({ error: 'Invalid or expired token' });
      const row = r.rows[0];
      const user = { id: row.id, email: row.email, display_name: row.display_name, current_level: row.current_level };
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => { if (err) reject(err); else resolve(); });
      });
      req.session.userId = user.id;
      req.session.displayName = user.display_name;
      res.json({ user });
    } catch (err) {
      console.error('Validate set-password token error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Set password using token
  router.post('/auth/set-password', sensitiveLimiter, async (req, res) => {
    const { token, newPassword, password } = req.body;
    const pwd = newPassword ?? password;
    if (!token) return res.status(400).json({ error: 'Token required' });
    if (!pwd) return res.status(400).json({ error: 'newPassword is required.' });
    if (pwd.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    try {
      const r = await pool.query(
        `SELECT user_id, type FROM mu_password_tokens
         WHERE token_hash = $1 AND type IN ('set_password', 'reset_password') AND expires_at > NOW()`,
        [hashToken(token)]
      );
      if (!r.rows.length) return res.status(400).json({ error: 'Invalid or expired token' });
      const userId = r.rows[0].user_id;
      const hash = await bcrypt.hash(pwd, 12);
      await pool.query('UPDATE mu_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
      await pool.query("DELETE FROM mu_password_tokens WHERE user_id = $1 AND type IN ('set_password', 'reset_password')", [userId]);
      const userResult = await pool.query(
        'SELECT id, email, display_name, current_level FROM mu_users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => { if (err) reject(err); else resolve(); });
      });
      req.session.userId = user.id;
      req.session.displayName = user.display_name;
      res.json({ user });
    } catch (err) {
      console.error('Set-password error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // Forgot password
  router.post('/auth/forgot-password', sensitiveLimiter, async (req, res) => {
    const { email } = req.body;
    const emailNorm = email != null ? String(email).trim().toLowerCase() : '';
    if (!emailNorm) return res.status(400).json({ error: 'Email is required.' });
    if (!EMAIL_REGEX.test(emailNorm)) return res.status(400).json({ error: 'Invalid email format.' });
    const baseUrl = process.env.TRACKER_APP_URL || process.env.TRACKER_LOGIN_URL || '';
    const canSendEmail = !!(process.env.RESEND_API_KEY && baseUrl && process.env.RESEND_FROM);
    try {
      const userResult = await pool.query('SELECT id FROM mu_users WHERE email = $1', [emailNorm]);
      if (userResult.rows.length === 0) {
        return res.json({ ok: true });
      }
      const userId = userResult.rows[0].id;
      const token = generateToken();
      const expiresAt = new Date(Date.now() + RESET_PASSWORD_EXPIRY_HOURS * 60 * 60 * 1000);
      await pool.query(
        'INSERT INTO mu_password_tokens (user_id, token_hash, type, expires_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, type) DO UPDATE SET token_hash=$2, expires_at=$4',
        [userId, hashToken(token), 'reset_password', expiresAt]
      );
      const setPasswordUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/set-password?token=${token}` : null;

      if (canSendEmail) {
        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
          from: process.env.RESEND_FROM,
          to: [emailNorm],
          subject: 'Reset your Muscle Up Tracker password',
          html: `Use this link to set a new password (valid for ${RESET_PASSWORD_EXPIRY_HOURS} hour(s)): <a href="${setPasswordUrl}">${setPasswordUrl}</a>`,
        });
        if (error) {
          console.error('Forgot-password email failed:', error.message || error);
          if (process.env.NODE_ENV !== 'production') {
            return res.json({ ok: true, devResetToken: token });
          }
        }
      }

      const isProduction = process.env.NODE_ENV === 'production';
      if (!isProduction && !canSendEmail) {
        return res.json({ ok: true, devResetToken: token });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Forgot-password error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // Reset password using token
  router.post('/auth/reset-password', async (req, res) => {
    const { token, password, confirm_password } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });
    if (!password) return res.status(400).json({ error: 'Password is required.' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (password !== (confirm_password ?? password)) return res.status(400).json({ error: 'Passwords do not match.' });
    try {
      const r = await pool.query(
        `SELECT user_id FROM mu_password_tokens
         WHERE token_hash = $1 AND type = 'reset_password' AND expires_at > NOW()`,
        [hashToken(token)]
      );
      if (!r.rows.length) return res.status(400).json({ error: 'Invalid or expired token' });
      const userId = r.rows[0].user_id;
      const hash = await bcrypt.hash(password, 12);
      await pool.query('UPDATE mu_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
      await pool.query("DELETE FROM mu_password_tokens WHERE user_id = $1 AND type = 'reset_password'", [userId]);
      const userResult = await pool.query(
        'SELECT id, email, display_name, current_level FROM mu_users WHERE id = $1',
        [userId]
      );
      const user = userResult.rows[0];
      await new Promise((resolve, reject) => {
        req.session.regenerate((err) => { if (err) reject(err); else resolve(); });
      });
      req.session.userId = user.id;
      req.session.displayName = user.display_name;
      res.json({ user });
    } catch (err) {
      console.error('Reset-password error:', err);
      res.status(500).json({ error: 'Something went wrong.' });
    }
  });

  // Change password
  router.post('/auth/change-password', requireAuth, async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;
    if (!current_password || !new_password || !confirm_password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (new_password !== confirm_password) {
      return res.status(400).json({ error: 'New passwords do not match.' });
    }
    try {
      const result = await pool.query('SELECT password_hash FROM mu_users WHERE id=$1', [req.session.userId]);
      if (!result.rows.length) {
        return res.status(404).json({ error: 'User not found.' });
      }
      const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
      const hash = await bcrypt.hash(new_password, 12);
      await pool.query('UPDATE mu_users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.session.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Failed to change password.' });
    }
  });

  // Update settings
  router.put('/auth/settings', requireAuth, async (req, res) => {
    const { theme, display_name } = req.body;
    try {
      const updates = [];
      const values = [];
      let paramNum = 1;
      if (theme && ['light', 'dark'].includes(theme)) {
        updates.push(`theme=$${paramNum++}`);
        values.push(theme);
      }
      if (display_name && display_name.trim()) {
        updates.push(`display_name=$${paramNum++}`);
        values.push(display_name.trim());
      }
      if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }
      values.push(req.session.userId);
      const result = await pool.query(
        `UPDATE mu_users SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${paramNum} RETURNING id, email, display_name, current_level, theme`,
        values
      );
      res.json({ user: result.rows[0] });
    } catch (err) {
      console.error('Settings update error:', err);
      res.status(500).json({ error: 'Failed to update settings.' });
    }
  });

  // Reset all progress
  router.post('/auth/reset-progress', requireAuth, async (req, res) => {
    try {
      await pool.query('DELETE FROM mu_progress_logs WHERE user_id=$1', [req.session.userId]);
      await pool.query('DELETE FROM mu_graduations WHERE user_id=$1', [req.session.userId]);
      await pool.query('UPDATE mu_users SET current_level=1, updated_at=NOW() WHERE id=$1', [req.session.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error('Reset progress error:', err);
      res.status(500).json({ error: 'Failed to reset progress.' });
    }
  });

  // Unlock all levels
  router.post('/auth/unlock-all', requireAuth, async (req, res) => {
    try {
      for (let level = 1; level <= 6; level++) {
        await pool.query(
          'INSERT INTO mu_graduations (user_id, level) VALUES ($1,$2) ON CONFLICT (user_id, level) DO NOTHING',
          [req.session.userId, level]
        );
      }
      await pool.query('UPDATE mu_users SET current_level=6, updated_at=NOW() WHERE id=$1', [req.session.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error('Unlock all error:', err);
      res.status(500).json({ error: 'Failed to unlock levels.' });
    }
  });

  // Verify session for ebook access - returns ok if user is authenticated (mounted under /api so path is /api/verify-session)
  router.get('/verify-session', (req, res) => {
    if (req.session && req.session.userId) {
      res.json({ verified: true, userId: req.session.userId });
    } else {
      res.status(401).json({ verified: false, error: 'Not authenticated' });
    }
  });

  return router;
};
