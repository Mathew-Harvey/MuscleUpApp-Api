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
        'SELECT id, email, display_name, current_level, created_at FROM muscleup_users WHERE id=$1',
        [req.session.userId]
      );
      const user = userResult.rows[0];
      if (!user) {
        return res.status(401).json({ error: 'Session invalid or user no longer exists.' });
      }
      const graduations = (await pool.query(
        'SELECT level, graduated_at FROM muscleup_graduations WHERE user_id=$1 ORDER BY level',
        [req.session.userId]
      )).rows;
      const recentLogs = (await pool.query(
        `SELECT id, level, exercise_key, sets_completed, reps_or_duration, hold_time_seconds, notes, session_date
         FROM muscleup_progress_logs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
        [req.session.userId]
      )).rows;
      const totalSessions = (await pool.query(
        'SELECT COUNT(DISTINCT session_date) as cnt FROM muscleup_progress_logs WHERE user_id=$1',
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
        `SELECT * FROM muscleup_progress_logs WHERE user_id=$1 AND level=$2 ORDER BY session_date DESC, created_at DESC LIMIT 50`,
        [req.session.userId, level]
      )).rows;
      const graduated = (await pool.query(
        'SELECT level, graduated_at FROM muscleup_graduations WHERE user_id=$1 AND level=$2',
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
        `INSERT INTO muscleup_progress_logs (user_id, level, exercise_key, sets_completed, reps_or_duration, hold_time_seconds, notes)
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
        'INSERT INTO muscleup_graduations (user_id, level) VALUES ($1,$2) ON CONFLICT (user_id, level) DO NOTHING',
        [req.session.userId, lvl]
      );
      const nextLevel = Math.min(lvl + 1, 6);
      await pool.query('UPDATE muscleup_users SET current_level=$1, updated_at=NOW() WHERE id=$2', [nextLevel, req.session.userId]);
      res.json({ ok: true, nextLevel });
    } catch (err) {
      console.error('Graduate error:', err);
      res.status(500).json({ error: 'Failed to save' });
    }
  });

  // Dashboard stats — all computed data for the progress dashboard
  router.get('/dashboard/stats', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;

      const userResult = await pool.query(
        'SELECT id, current_level, created_at FROM muscleup_users WHERE id=$1',
        [userId]
      );
      const user = userResult.rows[0];
      if (!user) {
        return res.status(401).json({ error: 'Session invalid or user no longer exists.' });
      }

      // Run all independent queries in parallel
      const [
        heatmapResult,
        weeklyVolumeResult,
        personalBestsResult,
        exerciseBreakdownResult,
        totalsResult,
        graduationsResult,
        streakDatesResult,
      ] = await Promise.all([
        // Heatmap: daily log counts for the past 182 days
        pool.query(
          `SELECT session_date::text AS date, COUNT(*)::int AS count
           FROM muscleup_progress_logs
           WHERE user_id = $1 AND session_date >= CURRENT_DATE - INTERVAL '182 days'
           GROUP BY session_date
           ORDER BY session_date`,
          [userId]
        ),

        // Weekly volume: sessions and sets per ISO week for the past 12 weeks
        pool.query(
          `SELECT TO_CHAR(DATE_TRUNC('week', session_date), 'IYYY-"W"IW') AS week,
                  COUNT(DISTINCT session_date)::int AS sessions,
                  COALESCE(SUM(sets_completed), 0)::int AS sets
           FROM muscleup_progress_logs
           WHERE user_id = $1 AND session_date >= CURRENT_DATE - INTERVAL '84 days'
           GROUP BY DATE_TRUNC('week', session_date)
           ORDER BY DATE_TRUNC('week', session_date)`,
          [userId]
        ),

        // Personal bests: best hold time per exercise (only timed exercises)
        pool.query(
          `SELECT DISTINCT ON (exercise_key)
                  exercise_key,
                  hold_time_seconds AS best_hold_seconds,
                  sets_completed AS best_sets,
                  session_date::text AS achieved_at
           FROM muscleup_progress_logs
           WHERE user_id = $1 AND hold_time_seconds IS NOT NULL AND hold_time_seconds > 0
           ORDER BY exercise_key, hold_time_seconds DESC, session_date DESC`,
          [userId]
        ),

        // Exercise breakdown: top 10 most practiced
        pool.query(
          `SELECT exercise_key, COUNT(*)::int AS total_logs
           FROM muscleup_progress_logs
           WHERE user_id = $1
           GROUP BY exercise_key
           ORDER BY total_logs DESC
           LIMIT 10`,
          [userId]
        ),

        // Totals: total logs, total sets, total sessions (distinct days)
        pool.query(
          `SELECT COUNT(*)::int AS total_logs,
                  COALESCE(SUM(sets_completed), 0)::int AS total_sets,
                  COUNT(DISTINCT session_date)::int AS total_sessions
           FROM muscleup_progress_logs
           WHERE user_id = $1`,
          [userId]
        ),

        // Graduations for level timeline
        pool.query(
          'SELECT level, graduated_at FROM muscleup_graduations WHERE user_id=$1 ORDER BY level',
          [userId]
        ),

        // All distinct session dates for streak calculation (current + longest)
        pool.query(
          'SELECT DISTINCT session_date FROM muscleup_progress_logs WHERE user_id=$1 ORDER BY session_date DESC',
          [userId]
        ),
      ]);

      // Compute streaks (current and longest) from session dates
      const streakDates = streakDatesResult.rows.map(r => {
        const d = new Date(r.session_date);
        d.setHours(0, 0, 0, 0);
        return d;
      });

      let currentStreak = 0;
      let longestStreak = 0;
      if (streakDates.length > 0) {
        // Current streak: count consecutive days from today backwards
        let expected = new Date();
        expected.setHours(0, 0, 0, 0);
        for (const d of streakDates) {
          if (Math.round((expected - d) / 86400000) <= 1) {
            currentStreak++;
            expected = d;
          } else break;
        }

        // Longest streak: scan all dates chronologically
        const chronological = [...streakDates].reverse();
        let runLength = 1;
        longestStreak = 1;
        for (let i = 1; i < chronological.length; i++) {
          const diff = Math.round((chronological[i] - chronological[i - 1]) / 86400000);
          if (diff === 1) {
            runLength++;
            if (runLength > longestStreak) longestStreak = runLength;
          } else {
            runLength = 1;
          }
        }
      }

      // Build level timeline from graduations
      const graduations = graduationsResult.rows;
      const userCreated = user.created_at;
      const levelTimeline = [];
      for (let lv = 1; lv <= 6; lv++) {
        const grad = graduations.find(g => g.level === lv);
        const prevGrad = graduations.find(g => g.level === lv - 1);
        const startedAt = lv === 1
          ? String(userCreated).slice(0, 10)
          : (prevGrad ? String(prevGrad.graduated_at).slice(0, 10) : null);
        levelTimeline.push({
          level: lv,
          started_at: startedAt,
          graduated_at: grad ? String(grad.graduated_at).slice(0, 10) : null,
        });
      }

      // Add display names to exercise breakdown
      const exerciseBreakdown = exerciseBreakdownResult.rows.map(row => ({
        exercise_key: row.exercise_key,
        total_logs: row.total_logs,
      }));

      const totals = totalsResult.rows[0];
      const memberSinceDays = Math.max(1, Math.floor((Date.now() - new Date(userCreated).getTime()) / 86400000));

      res.json({
        heatmap: heatmapResult.rows,
        weeklyVolume: weeklyVolumeResult.rows,
        personalBests: personalBestsResult.rows,
        levelTimeline,
        exerciseBreakdown,
        totals: {
          totalSessions: totals.total_sessions,
          totalSets: totals.total_sets,
          totalLogs: totals.total_logs,
          memberSinceDays,
        },
        streak: {
          current: currentStreak,
          longest: longestStreak,
        },
      });
    } catch (err) {
      console.error('Dashboard stats error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Delete log
  router.delete('/log/:id', requireAuth, async (req, res) => {
    try {
      const result = await pool.query('DELETE FROM muscleup_progress_logs WHERE id=$1 AND user_id=$2', [req.params.id, req.session.userId]);
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
    'SELECT DISTINCT session_date FROM muscleup_progress_logs WHERE user_id=$1 ORDER BY session_date DESC LIMIT 60',
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
