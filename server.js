require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.SESSION_SECRET) {
  console.error('Fatal: SESSION_SECRET must be set in production.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4000;

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Auto-init schema
(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('Database schema ready');
  } catch (err) {
    console.error('Schema init warning:', err.message);
  }
})();

// Log when forgot-password email cannot be sent
(function checkForgotPasswordEmailConfig() {
  const hasResend = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
  const hasBaseUrl = !!(process.env.TRACKER_APP_URL || process.env.TRACKER_LOGIN_URL);
  if (!hasResend || !hasBaseUrl) {
    console.warn(
      'Forgot-password emails will NOT be sent: set RESEND_API_KEY, RESEND_FROM, and TRACKER_APP_URL (or TRACKER_LOGIN_URL) in the environment.'
    );
  }
})();

// CORS — allow the web frontend
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.set('trust proxy', 1);
app.use(cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(session({
  store: new pgSession({ pool, tableName: 'muscleup_session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'muscleup-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    httpOnly: true,
  },
}));

// Routes — all under /api
app.use('/api', require('./routes/auth')(pool));
app.use('/api', require('./routes/progress')(pool));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Muscle Up API running on port ${PORT}`));
