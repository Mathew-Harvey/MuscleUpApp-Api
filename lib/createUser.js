/**
 * Shared logic to create or update a user and issue a set-password token.
 * Used by auth (create-user) and stripe (complete-signup).
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SET_PASSWORD_EXPIRY_HOURS = 7 * 24;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_MAX_LENGTH = 100;
const TEMP_PASSWORD_MIN_LENGTH = 8;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ email: string, name?: string, display_name?: string, temporaryPassword: string }} params
 * @returns {Promise<{ setPasswordToken: string, userId: string, created: boolean }>}
 * @throws Error with message for validation failures
 */
async function createUser(pool, params) {
  const { email, name, display_name, temporaryPassword } = params;
  let displayName = (name != null ? String(name) : display_name != null ? String(display_name) : '').trim();

  if (!email || !email.toString().trim()) throw new Error('Email is required.');
  if (!displayName) throw new Error('Name is required.');
  if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    displayName = displayName.slice(0, DISPLAY_NAME_MAX_LENGTH);
  }
  if (!temporaryPassword || typeof temporaryPassword !== 'string' || !temporaryPassword.trim()) {
    throw new Error('temporaryPassword is required.');
  }
  if (temporaryPassword.trim().length < TEMP_PASSWORD_MIN_LENGTH) {
    throw new Error('temporaryPassword must be at least 8 characters.');
  }
  const emailNorm = email.toString().trim().toLowerCase();
  if (!EMAIL_REGEX.test(emailNorm)) throw new Error('Invalid email format.');

  const tempPasswordHash = await bcrypt.hash(temporaryPassword.trim(), 12);
  const expiresAt = new Date(Date.now() + SET_PASSWORD_EXPIRY_HOURS * 60 * 60 * 1000);
  const token = generateToken();

  const exists = await pool.query('SELECT id, email, display_name, current_level FROM mu_users WHERE email=$1', [emailNorm]);

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
    return { setPasswordToken: token, userId: String(user.id), created: false };
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
  return { setPasswordToken: token, userId: String(user.id), created: true };
}

module.exports = { createUser };
