-- ============================================================
-- Muscle Up Tracker — Database Schema
-- PostgreSQL 16+
-- Uses mu_ prefix to share DB with other apps (e.g. Handstand)
-- ============================================================

-- Sessions table (required by connect-pg-simple)
CREATE TABLE IF NOT EXISTS "mu_session" (
  "sid" VARCHAR NOT NULL PRIMARY KEY,
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_mu_session_expire" ON "mu_session" ("expire");

-- Users
CREATE TABLE IF NOT EXISTS mu_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  current_level INTEGER DEFAULT 1 CHECK (current_level BETWEEN 1 AND 6),
  theme VARCHAR(20) DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Progress logs — one row per exercise per session
CREATE TABLE IF NOT EXISTS mu_progress_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES mu_users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
  exercise_key VARCHAR(50) NOT NULL,
  sets_completed INTEGER DEFAULT 0,
  reps_or_duration VARCHAR(100),
  hold_time_seconds INTEGER,
  notes TEXT,
  session_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mu_progress_user_date ON mu_progress_logs(user_id, session_date DESC);

-- Graduation records
CREATE TABLE IF NOT EXISTS mu_graduations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES mu_users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
  graduated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, level)
);

-- One-time tokens: set-password (from email link) and reset-password (forgot password)
CREATE TABLE IF NOT EXISTS mu_password_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES mu_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('set_password', 'reset_password')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mu_password_tokens_user_type ON mu_password_tokens (user_id, type);
CREATE INDEX IF NOT EXISTS idx_mu_password_tokens_expires ON mu_password_tokens(expires_at);
