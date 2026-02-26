/* ── Helpers ── */

async function api(endpoint) {
  const res = await fetch('/api' + endpoint, { credentials: 'include' });
  if (!res.ok) {
    const err = new Error(`API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function esc(str) {
  if (str == null) return '';
  const el = document.createElement('span');
  el.textContent = String(str);
  return el.innerHTML;
}

/* ── Router ── */

function router() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  if (path === '/progress') return renderProgress();
  return renderHome();
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);

/* ── Home / Dashboard ── */

async function renderHome() {
  const app = document.getElementById('app');

  let dashboard;
  try {
    dashboard = await api('/dashboard');
  } catch (e) {
    app.innerHTML = `
      <div class="auth-prompt">
        <h2>Welcome to Muscle Up Tracker</h2>
        <p>Log in on the main app to view your dashboard here.</p>
      </div>`;
    return;
  }

  const user = dashboard.user;
  const logs = dashboard.recentLogs || [];
  const grads = dashboard.graduations || [];

  app.innerHTML = `
    <div class="home-container">
      <h1 class="home-greeting">Hey, ${esc(user.display_name)} 👋</h1>
      <p class="home-sub">Level ${user.current_level} · ${grads.length} level${grads.length !== 1 ? 's' : ''} graduated</p>

      <div class="home-stats">
        <div class="home-stat">
          <div class="home-stat-val">${dashboard.totalSessions}</div>
          <div class="home-stat-label">Sessions</div>
        </div>
        <div class="home-stat">
          <div class="home-stat-val">${dashboard.streak}</div>
          <div class="home-stat-label">Day Streak</div>
        </div>
        <div class="home-stat">
          <div class="home-stat-val">${logs.length}</div>
          <div class="home-stat-label">Recent Logs</div>
        </div>
      </div>

      <div class="home-cards">
        <a href="#/progress" class="home-card">
          <div class="home-card-icon">📊</div>
          <div class="home-card-body">
            <div class="home-card-title">Progress Dashboard</div>
            <div class="home-card-sub">Streaks, heatmap, personal bests &amp; more</div>
          </div>
          <span class="home-card-arrow">›</span>
        </a>
      </div>

      ${logs.length ? `
        <div style="margin-top:2rem">
          <div class="home-recent-title">Recent Activity</div>
          ${logs.slice(0, 8).map(l => `
            <div class="home-log">
              <span class="home-log-exercise">${esc(l.exercise_key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</span>
              <span class="home-log-detail">${l.sets_completed}×${esc(l.reps_or_duration)}</span>
              <span class="home-log-date">${l.session_date}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}
