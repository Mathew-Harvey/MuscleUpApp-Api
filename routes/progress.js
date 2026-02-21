const express = require('express');
const { requireAuth } = require('../middleware/auth');
const LEVELS = require('../data/levels');
const router = express.Router();

module.exports = function (pool) {
  // Serve level definitions to the frontend
  router.get('/levels', (req, res) => res.json(LEVELS));

  // Dashboard data
  router.get('/dashboard', requireAuth, async (req, res) => {
    try {
      const userResult = await pool.query(
        'SELECT id, email, display_name, current_level, created_at FROM users WHERE id=$1',
        [req.session.userId]
      );
      const user = userResult.rows[0];
      if (!user) {
        return res.status(401).json({ error: 'Session invalid or user no longer exists.' });
      }
      const graduations = (await pool.query(
        'SELECT level, graduated_at FROM graduations WHERE user_id=$1 ORDER BY level',
        [req.session.userId]
      )).rows;
      const recentLogs = (await pool.query(
        `SELECT id, level, exercise_key, sets_completed, reps_or_duration, hold_time_seconds, notes, session_date
         FROM progress_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [req.session.userId]
      )).rows;
      const totalSessions = (await pool.query(
        'SELECT COUNT(DISTINCT session_date) as cnt FROM progress_logs WHERE user_id=$1',
        [req.session.userId]
      )).rows[0].cnt;
      const streak = await getStreak(pool, req.session.userId);
      res.json({ user, graduations, recentLogs, totalSessions: parseInt(totalSessions), streak });
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Level history
  router.get('/levels/:num/logs', requireAuth, async (req, res) => {
    const level = parseInt(req.params.num, 10);
    if (Number.isNaN(level) || level < 1 || level > 6) return res.status(400).json({ error: 'Invalid level' });
    try {
      const logs = (await pool.query(
        `SELECT * FROM progress_logs WHERE user_id=$1 AND level=$2 ORDER BY session_date DESC, created_at DESC LIMIT 50`,
        [req.session.userId, level]
      )).rows;
      const graduated = (await pool.query(
        'SELECT level, graduated_at FROM graduations WHERE user_id=$1 AND level=$2',
        [req.session.userId, level]
      )).rows[0] || null;
      res.json({ logs, graduated });
    } catch (err) {
      console.error('Level logs error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Log progress
  router.post('/log', requireAuth, async (req, res) => {
    const { level, exercise_key, sets_completed, reps_or_duration, hold_time_seconds, notes } = req.body;
    if (!level || !exercise_key) return res.status(400).json({ error: 'level and exercise_key required' });
    const levelNum = parseInt(level, 10);
    if (Number.isNaN(levelNum) || levelNum < 1 || levelNum > 6) return res.status(400).json({ error: 'level must be 1–6' });
    try {
      const result = await pool.query(
        `INSERT INTO progress_logs (user_id, level, exercise_key, sets_completed, reps_or_duration, hold_time_seconds, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.session.userId, levelNum, exercise_key, sets_completed || 0, reps_or_duration || '', hold_time_seconds || null, notes || '']
      );
      res.status(201).json({ log: result.rows[0] });
    } catch (err) {
      console.error('Log error:', err);
      res.status(500).json({ error: 'Failed to save' });
    }
  });

  // Graduate level
  router.post('/graduate', requireAuth, async (req, res) => {
    const lvl = parseInt(req.body.level, 10);
    if (Number.isNaN(lvl) || lvl < 1 || lvl > 6) return res.status(400).json({ error: 'Invalid level' });
    try {
      await pool.query(
        'INSERT INTO graduations (user_id, level) VALUES ($1,$2) ON CONFLICT (user_id, level) DO NOTHING',
        [req.session.userId, lvl]
      );
      const nextLevel = Math.min(lvl + 1, 6);
      await pool.query('UPDATE users SET current_level=$1, updated_at=NOW() WHERE id=$2', [nextLevel, req.session.userId]);
      res.json({ ok: true, nextLevel });
    } catch (err) {
      console.error('Graduate error:', err);
      res.status(500).json({ error: 'Failed to save' });
    }
  });

  // Delete log
  router.delete('/log/:id', requireAuth, async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM progress_logs WHERE id=$1 AND user_id=$2', [req.params.id, req.session.userId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Log not found' });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed' });
    }
  });

  return router;
};

async function getStreak(pool, userId) {
  const result = await pool.query(
    'SELECT DISTINCT session_date FROM progress_logs WHERE user_id=$1 ORDER BY session_date DESC LIMIT 60',
    [userId]
  );
  if (!result.rows.length) return 0;
  let streak = 0;
  let expected = new Date();
  expected.setHours(0, 0, 0, 0);
  for (const row of result.rows) {
    const d = new Date(row.session_date);
    d.setHours(0, 0, 0, 0);
    if (Math.round((expected - d) / 86400000) <= 1) {
      streak++;
      expected = d;
    } else break;
  }
  return streak;
}
