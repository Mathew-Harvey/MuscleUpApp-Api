-- One-time migration: rename muscleup_* tables to mu_* for shared-DB naming.
-- Run this once if you have existing muscleup_* tables (e.g. from before the mu_ prefix change).
-- Safe to run multiple times (uses DO block to rename only if old table exists).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'muscleup_session') THEN
    ALTER TABLE muscleup_session RENAME TO mu_session;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'muscleup_users') THEN
    ALTER TABLE muscleup_users RENAME TO mu_users;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'muscleup_progress_logs') THEN
    ALTER TABLE muscleup_progress_logs RENAME TO mu_progress_logs;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'muscleup_graduations') THEN
    ALTER TABLE muscleup_graduations RENAME TO mu_graduations;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'muscleup_password_tokens') THEN
    ALTER TABLE muscleup_password_tokens RENAME TO mu_password_tokens;
  END IF;
END $$;
