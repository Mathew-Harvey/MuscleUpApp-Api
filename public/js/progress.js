/* ── Progress Dashboard ── */

const PD_EXERCISE_NAMES = {
  wrist_warmup: 'Wrist Warm-Up',
  ring_dead_hang: 'Ring Dead Hang',
  ring_rows: 'Ring Rows',
  push_ups: 'Push-Ups',
  scapula_pulls: 'Scapula Pull-Ups',
  ring_support: 'Ring Support Hold',
  wrist_warmup_2: 'Wrist Warm-Up',
  pull_ups: 'Pull-Ups',
  bar_dips: 'Bar Dips',
  false_grip_hang: 'False Grip Hang',
  transition_rows: 'Transition Rows',
  ring_support_2: 'Ring Support (Turnout)',
  wrist_warmup_3: 'False Grip Prep',
  false_grip_pullups: 'False Grip Pull-Ups',
  ring_dips: 'Ring Dips',
  false_grip_rows: 'False Grip Rows',
  bent_arm_hold: 'Bent Arm Hold',
  ring_support_turnout: 'Ring Support (Turnout)',
  wrist_warmup_4: 'Wrist Warm-Up + Mobility',
  false_grip_pullups_4: 'False Grip Pull-Ups (Chest)',
  negative_muscle_ups: 'Negative Muscle Ups',
  deep_ring_dips: 'Deep Ring Dips',
  russian_dips: 'Russian Dips',
  wrist_warmup_5: 'Wrist Warm-Up',
  false_grip_pull_high: 'False Grip Pull to Chest',
  muscle_up_attempts: 'Muscle Up Attempts',
  transition_catch: 'Low Ring Muscle Up',
  deep_dips_5: 'Deep Ring Dips',
  muscle_up_sets: 'Muscle Up Sets',
  muscle_up_emom: 'Muscle Up EMOM',
  ring_strength: 'Ring Strength Complex',
};

function pdExName(key) {
  return PD_EXERCISE_NAMES[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── Demo Data ── */

function pdMulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function pdGetISOWeek(d) {
  var date = new Date(d.valueOf());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  var week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function pdGenerateDemoStats(dashboard) {
  var rng = pdMulberry32(42);
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var heatmap = [];
  for (var i = 181; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    var bias = Math.max(0.3, 1 - (i / 30) * 0.1);
    var isWeekend = d.getDay() === 0 || d.getDay() === 6;
    var count = 0;
    if (rng() > 0.15) {
      if (rng() < bias) {
        count = isWeekend ? Math.floor(rng() * 3) + 4 : Math.floor(rng() * 3) + 1 + Math.floor(bias * 2);
      }
    }
    if (i === 0) count = Math.max(count, 1);
    if (count > 0) heatmap.push({ date: d.toISOString().slice(0, 10), count: count });
  }

  var weeklyVolume = [];
  for (var w = 11; w >= 0; w--) {
    var weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - w * 7);
    var weekLabel = weekStart.getFullYear() + '-W' + String(pdGetISOWeek(weekStart)).padStart(2, '0');
    var sessions = Math.floor(rng() * 4) + 3 + Math.floor((12 - w) * 0.15);
    var sets = sessions * (Math.floor(rng() * 4) + 3);
    if (w < 3) { sessions = Math.ceil(sessions * 1.2); sets = Math.ceil(sets * 1.2); }
    weeklyVolume.push({ week: weekLabel, sessions: sessions, sets: sets });
  }

  var userCreated = dashboard.user.created_at;
  var levelTimeline = [];
  for (var lv = 1; lv <= 6; lv++) {
    var grad = dashboard.graduations.find(function (g) { return g.level === lv; });
    var prevGrad = dashboard.graduations.find(function (g) { return g.level === lv - 1; });
    levelTimeline.push({
      level: lv,
      started_at: lv === 1 ? String(userCreated).slice(0, 10) : (prevGrad ? String(prevGrad.graduated_at).slice(0, 10) : null),
      graduated_at: grad ? String(grad.graduated_at).slice(0, 10) : null,
    });
  }

  var memberSinceDays = Math.max(1, Math.floor((today - new Date(userCreated)) / 86400000));
  return {
    heatmap: heatmap,
    weeklyVolume: weeklyVolume,
    personalBests: [
      { exercise_key: 'ring_dead_hang', best_hold_seconds: 75, best_sets: 5, achieved_at: '2025-11-15' },
      { exercise_key: 'false_grip_hang', best_hold_seconds: 45, best_sets: 4, achieved_at: '2026-01-10' },
      { exercise_key: 'ring_support', best_hold_seconds: 60, best_sets: 5, achieved_at: '2025-12-20' },
      { exercise_key: 'bent_arm_hold', best_hold_seconds: 15, best_sets: 5, achieved_at: '2026-02-05' },
      { exercise_key: 'ring_support_turnout', best_hold_seconds: 35, best_sets: 3, achieved_at: '2026-01-28' },
    ],
    levelTimeline: levelTimeline,
    exerciseBreakdown: [
      { exercise_key: 'pull_ups', total_logs: 47 },
      { exercise_key: 'ring_rows', total_logs: 42 },
      { exercise_key: 'false_grip_pullups', total_logs: 38 },
      { exercise_key: 'ring_dips', total_logs: 35 },
      { exercise_key: 'push_ups', total_logs: 33 },
    ],
    totals: { totalSessions: dashboard.totalSessions || 87, totalSets: weeklyVolume.reduce(function (s, w) { return s + w.sets; }, 0), totalLogs: 320, memberSinceDays: memberSinceDays },
    streak: { current: dashboard.streak || 12, longest: Math.max(dashboard.streak || 0, 23) },
  };
}

/* ── Main Render ── */

async function renderProgress() {
  var app = document.getElementById('app');
  // Default: show live data (only show demo when user explicitly set pd_live_data to '0')
  var useLiveData = localStorage.getItem('pd_live_data') !== '0';

  var dashboard, stats;
  try {
    dashboard = await api('/dashboard');
    stats = pdGenerateDemoStats(dashboard);
  } catch (e) {
    app.innerHTML = `
      <div class="auth-prompt">
        <h2>Sign in to view your progress</h2>
        <p>You need to be logged in to see your dashboard.</p>
        <a href="#/">← Back to Home</a>
      </div>`;
    return;
  }

  var todayStr = new Date().toISOString().slice(0, 10);
  var loggedToday = stats.heatmap.some(function (h) { return h.date === todayStr && h.count > 0; });
  var currentStreak = useLiveData ? (dashboard.streak != null ? dashboard.streak : 0) : stats.streak.current;
  var longestStreak = useLiveData ? Math.max(dashboard.streak != null ? dashboard.streak : 0, currentStreak) : stats.streak.longest;
  var totalSessions = useLiveData ? (dashboard.totalSessions != null ? dashboard.totalSessions : 0) : stats.totals.totalSessions;
  var memberSinceDays = useLiveData && dashboard.user.created_at
    ? Math.max(1, Math.floor((Date.now() - new Date(dashboard.user.created_at)) / 86400000))
    : stats.totals.memberSinceDays;

  var demoBannerHtml = useLiveData ? '' : `
      <div class="pd-demo-banner">
        <div class="pd-demo-banner-text">
          <strong>You're viewing demo data.</strong> Switch to your real progress to see your actual training stats.
        </div>
        <button class="pd-demo-banner-btn" id="pdSwitchLive">Show My Real Data</button>
      </div>`;

  app.innerHTML = `
    <div class="pd-container">
      <header class="pd-header">
        <h1 class="pd-title">Your Progress</h1>
        <p class="pd-subtitle">Hey ${esc(dashboard.user.display_name)} — here's your training journey so far</p>
      </header>
      ${demoBannerHtml}

      <section class="pd-section pd-hero" aria-label="Key statistics">
        <div class="pd-hero-grid">
          <div class="pd-stat-card pd-stat-streak">
            <div class="pd-stat-icon ${loggedToday ? 'pd-flame-active' : ''}">🔥</div>
            <div class="pd-stat-value pd-countup" data-target="${currentStreak}">0</div>
            <div class="pd-stat-label">Current Streak</div>
          </div>
          <div class="pd-stat-card">
            <div class="pd-stat-icon">⚡</div>
            <div class="pd-stat-value pd-countup" data-target="${longestStreak}">0</div>
            <div class="pd-stat-label">Longest Streak</div>
          </div>
          <div class="pd-stat-card">
            <div class="pd-stat-icon">💪</div>
            <div class="pd-stat-value pd-countup" data-target="${totalSessions}">0</div>
            <div class="pd-stat-label">Total Sessions</div>
          </div>
          <div class="pd-stat-card">
            <div class="pd-stat-icon">📅</div>
            <div class="pd-stat-value pd-countup" data-target="${memberSinceDays}">0</div>
            <div class="pd-stat-label">Days Since Joined</div>
          </div>
        </div>
      </section>

      <section class="pd-section pd-heatmap-section" aria-label="Activity heatmap">
        <h2 class="pd-section-title">Activity</h2>
        <div class="pd-heatmap-wrapper">
          <div class="pd-heatmap-months" id="pd-months"></div>
          <div class="pd-heatmap-body">
            <div class="pd-heatmap-days">
              <span></span><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span>
            </div>
            <div class="pd-heatmap-grid" id="pd-heatmap" role="grid"></div>
          </div>
        </div>
        <div class="pd-heatmap-legend">
          <span class="pd-legend-text">Less</span>
          <span class="pd-legend-cell" style="background:#161b22"></span>
          <span class="pd-legend-cell" style="background:#0e4429"></span>
          <span class="pd-legend-cell" style="background:#006d32"></span>
          <span class="pd-legend-cell" style="background:#26a641"></span>
          <span class="pd-legend-cell" style="background:#39d353"></span>
          <span class="pd-legend-text">More</span>
        </div>
        <div class="pd-tooltip" id="pd-tooltip"></div>
      </section>

      <section class="pd-section pd-chart-section" aria-label="Weekly training volume">
        <h2 class="pd-section-title">Weekly Volume</h2>
        <div class="pd-trend-badge" id="pd-trend"></div>
        <div class="pd-chart-container">
          <canvas id="pd-volume-chart" aria-hidden="true"></canvas>
        </div>
        <p class="sr-only" id="pd-chart-summary"></p>
      </section>

      <section class="pd-section pd-journey-section" aria-label="Level progression timeline">
        <h2 class="pd-section-title">Level Journey</h2>
        <div class="pd-journey-scroll">
          <div class="pd-journey" id="pd-journey"></div>
        </div>
      </section>

      <section class="pd-section pd-bests-section" aria-label="Personal bests">
        <h2 class="pd-section-title">Personal Bests</h2>
        <div class="pd-bests-grid" id="pd-bests"></div>
      </section>

      <section class="pd-section pd-practiced-section" aria-label="Most practiced exercises">
        <h2 class="pd-section-title">Most Practiced</h2>
        <div class="pd-practiced-list" id="pd-practiced"></div>
      </section>
    </div>
  `;

  pdRenderHeatmap(stats);
  pdRenderLevelJourney(stats, dashboard);
  pdRenderPersonalBests(stats);
  pdRenderMostPracticed(stats);

  setTimeout(function () { pdRenderVolumeChart(stats); }, 60);

  setTimeout(function () {
    document.querySelectorAll('.pd-countup').forEach(function (el) {
      pdCountUp(el, parseInt(el.dataset.target, 10), 1200);
    });
  }, 150);

  pdInitObserver();

  var switchBtn = document.getElementById('pdSwitchLive');
  if (switchBtn) {
    switchBtn.addEventListener('click', function () {
      localStorage.setItem('pd_live_data', '1');
      renderProgress();
    });
  }
}

/* ── Heatmap ── */

function pdRenderHeatmap(stats) {
  var grid = document.getElementById('pd-heatmap');
  var monthsContainer = document.getElementById('pd-months');
  var tooltip = document.getElementById('pd-tooltip');
  if (!grid) return;

  var dataMap = {};
  stats.heatmap.forEach(function (h) { dataMap[h.date] = h.count; });

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var dow = today.getDay();
  var mondayOffset = dow === 0 ? -6 : 1 - dow;
  var currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() + mondayOffset);

  var startMonday = new Date(currentMonday);
  startMonday.setDate(currentMonday.getDate() - 25 * 7);

  var months = {};

  for (var week = 0; week < 26; week++) {
    for (var day = 0; day < 7; day++) {
      var cellDate = new Date(startMonday);
      cellDate.setDate(startMonday.getDate() + week * 7 + day);
      var dateStr = cellDate.toISOString().slice(0, 10);
      var isFuture = cellDate > today;
      var count = isFuture ? -1 : (dataMap[dateStr] || 0);

      var cell = document.createElement('div');
      cell.className = 'pd-heatmap-cell';

      if (isFuture) {
        cell.classList.add('pd-heatmap-future');
      } else {
        var level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
        cell.classList.add('pd-heat-' + level);
        cell.dataset.date = dateStr;
        cell.dataset.count = count;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', count + ' logs on ' + pdFormatDate(cellDate));
      }

      grid.appendChild(cell);

      if (day === 0) {
        var monthKey = cellDate.toLocaleString('en', { month: 'short' });
        var monthYear = cellDate.getFullYear() + '-' + cellDate.getMonth();
        if (!months[monthYear]) {
          months[monthYear] = { label: monthKey, week: week };
        }
      }
    }
  }

  Object.values(months).forEach(function (m) {
    var span = document.createElement('span');
    span.className = 'pd-month-label';
    span.textContent = m.label;
    span.style.left = (m.week * 16) + 'px';
    monthsContainer.appendChild(span);
  });

  grid.addEventListener('mouseover', function (e) {
    if (!e.target.dataset.date) return;
    var c = e.target.dataset.count;
    tooltip.textContent = c + ' log' + (c !== '1' ? 's' : '') + ' on ' + pdFormatDate(new Date(e.target.dataset.date + 'T00:00:00'));
    tooltip.style.display = 'block';
    var rect = e.target.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 8) + 'px';
  });

  grid.addEventListener('mouseout', function (e) {
    if (e.target.dataset.date) tooltip.style.display = 'none';
  });
}

/* ── Volume Chart ── */

function pdRenderVolumeChart(stats) {
  var canvas = document.getElementById('pd-volume-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  var ctx = canvas.getContext('2d');
  var gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(88,166,255,0.28)');
  gradient.addColorStop(1, 'rgba(88,166,255,0)');

  var labels = stats.weeklyVolume.map(function (w) {
    return 'W' + parseInt(w.week.split('-W')[1], 10);
  });
  var data = stats.weeklyVolume.map(function (w) { return w.sets; });

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Sets',
        data: data,
        fill: true,
        backgroundColor: gradient,
        borderColor: '#58a6ff',
        borderWidth: 2,
        tension: 0.35,
        pointRadius: data.map(function (_, i) { return i === data.length - 1 ? 6 : 3; }),
        pointBackgroundColor: data.map(function (_, i) { return i === data.length - 1 ? '#f0883e' : '#58a6ff'; }),
        pointBorderColor: data.map(function (_, i) { return i === data.length - 1 ? '#f0883e' : '#58a6ff'; }),
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1c2128',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(48,54,61,0.5)' },
          ticks: { color: '#8b949e', font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(48,54,61,0.5)' },
          ticks: { color: '#8b949e', font: { size: 11 } },
        },
      },
    },
  });

  var trendEl = document.getElementById('pd-trend');
  if (data.length >= 6) {
    var recent3 = data.slice(-3).reduce(function (a, b) { return a + b; }, 0) / 3;
    var prev3 = data.slice(-6, -3).reduce(function (a, b) { return a + b; }, 0) / 3;
    if (recent3 > prev3) {
      trendEl.innerHTML = '<span class="pd-trend-up">↑ trending up</span>';
    } else if (recent3 < prev3) {
      trendEl.innerHTML = '<span class="pd-trend-down">↓ trending down</span>';
    }
  }

  var summaryEl = document.getElementById('pd-chart-summary');
  var total = data.reduce(function (a, b) { return a + b; }, 0);
  summaryEl.textContent = 'Weekly training volume chart showing ' + data.length + ' weeks. Total sets: ' + total + '. Average: ' + Math.round(total / data.length) + ' sets per week.';
}

/* ── Level Journey ── */

function pdRenderLevelJourney(stats, dashboard) {
  var container = document.getElementById('pd-journey');
  if (!container) return;

  var currentLevel = dashboard.user.current_level;
  var timeline = stats.levelTimeline;

  container.innerHTML = timeline.map(function (lvl, i) {
    var isDone = lvl.graduated_at !== null;
    var isCurrent = lvl.level === currentLevel && !isDone;

    var dotClass, dotContent, lineClass;

    if (isDone) {
      dotClass = 'pd-step-done';
      dotContent = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>';
      lineClass = 'pd-line-done';
    } else if (isCurrent) {
      dotClass = 'pd-step-current';
      dotContent = '<span>' + lvl.level + '</span>';
      lineClass = (i > 0 && timeline[i - 1].graduated_at) ? 'pd-line-done' : 'pd-line-future';
    } else {
      dotClass = 'pd-step-future';
      dotContent = '<span>' + lvl.level + '</span>';
      lineClass = 'pd-line-future';
    }

    var dateLabel = isDone
      ? '<div class="pd-step-date">' + pdFormatDateShort(new Date(lvl.graduated_at + 'T00:00:00')) + '</div>'
      : isCurrent
        ? '<div class="pd-step-date pd-step-date-current">In progress</div>'
        : '';

    return '<div class="pd-step">' +
      (i > 0 ? '<div class="pd-step-line ' + lineClass + '"></div>' : '') +
      '<div class="pd-step-dot ' + dotClass + '">' + dotContent + '</div>' +
      '<div class="pd-step-label">Level ' + lvl.level + '</div>' +
      dateLabel +
      '</div>';
  }).join('');
}

/* ── Personal Bests ── */

function pdRenderPersonalBests(stats) {
  var container = document.getElementById('pd-bests');
  if (!container) return;

  var bests = stats.personalBests.filter(function (b) { return b.best_hold_seconds > 0; });

  if (!bests.length) {
    container.innerHTML = '<div class="pd-empty">Keep logging — your PRs will appear here! 🎯</div>';
    return;
  }

  container.innerHTML = bests.map(function (b) {
    return '<div class="pd-best-card">' +
      '<div class="pd-best-trophy">🏆</div>' +
      '<div class="pd-best-name">' + esc(pdExName(b.exercise_key)) + '</div>' +
      '<div class="pd-best-value">' + pdFormatHoldTime(b.best_hold_seconds) + '</div>' +
      '<div class="pd-best-date">' + pdFormatDateShort(new Date(b.achieved_at + 'T00:00:00')) + '</div>' +
      '</div>';
  }).join('');
}

/* ── Most Practiced ── */

function pdRenderMostPracticed(stats) {
  var container = document.getElementById('pd-practiced');
  if (!container) return;

  var top5 = stats.exerciseBreakdown.slice(0, 5);

  if (!top5.length) {
    container.innerHTML = '<div class="pd-empty">Log some exercises to see your most practiced! 💪</div>';
    return;
  }

  var maxCount = top5[0].total_logs;

  container.innerHTML = top5.map(function (ex, i) {
    var pct = Math.round((ex.total_logs / maxCount) * 100);
    return '<div class="pd-practiced-row" style="--delay:' + (i * 0.1) + 's">' +
      '<span class="pd-practiced-rank">' + (i + 1) + '</span>' +
      '<span class="pd-practiced-name">' + esc(pdExName(ex.exercise_key)) + '</span>' +
      '<div class="pd-practiced-track"><div class="pd-practiced-bar" style="--w:' + pct + '%"></div></div>' +
      '<span class="pd-practiced-count">' + ex.total_logs + '</span>' +
      '</div>';
  }).join('');
}

/* ── Animations & Utilities ── */

function pdCountUp(el, target, duration) {
  var start = performance.now();
  var ease = function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; };
  (function frame(now) {
    var p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(ease(p) * target).toLocaleString();
    if (p < 1) requestAnimationFrame(frame);
  })(start);
}

function pdFormatHoldTime(seconds) {
  if (seconds < 60) return seconds + 's';
  var m = Math.floor(seconds / 60);
  var s = seconds % 60;
  return s === 0 ? m + 'm' : m + 'm ' + s + 's';
}

function pdFormatDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function pdFormatDateShort(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function pdInitObserver() {
  var sections = document.querySelectorAll('.pd-section');
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('pd-visible');
        obs.unobserve(entry.target);

        if (entry.target.classList.contains('pd-practiced-section')) {
          entry.target.querySelectorAll('.pd-practiced-bar').forEach(function (bar) {
            bar.classList.add('pd-bar-animate');
          });
        }
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  sections.forEach(function (s) { obs.observe(s); });
}
