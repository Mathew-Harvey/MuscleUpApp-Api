# Motivational Progress Dashboard — Build Guide

> **Purpose**: Instructions for an AI to build a Motivational Progress Dashboard for a fitness training web app. This was originally built for HandstandApp and should be adapted for the Ring Muscle-Up app (or any progressive training app with levels/exercises).

---

## 1. Architecture Overview

This is a **vanilla JavaScript SPA** with no build step. The pattern:

- **Single HTML entry** (`public/index.html`) with hash-based routing
- **Vanilla JS** render functions called from a `router()` function in `app.js`
- **Separate CSS files** per feature (avoids cache staleness — learned the hard way)
- **Chart.js v4** loaded via CDN for the volume chart
- **No framework** — everything is plain DOM manipulation and template literals

### Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `public/js/progress.js` | **Create** | All dashboard logic: mock data, rendering, heatmap, chart, animations |
| `public/css/progress.css` | **Create** | All dashboard styling, fully self-contained |
| `public/index.html` | **Edit** | Add `<link>` to progress.css, `<script>` for Chart.js CDN + progress.js, add nav icon |
| `public/js/app.js` | **Edit** | Add route for `/progress`, add dashboard card linking to it |

### Script load order in index.html

```html
<link rel="stylesheet" href="/css/style.css">
<link rel="stylesheet" href="/css/progress.css">
<!-- ... -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
<script src="/js/progress.js"></script>
<script src="/js/app.js"></script>
```

`progress.js` must load **before** `app.js` because the router calls `renderProgress()` which is defined in `progress.js`.

---

## 2. API Contract

The dashboard fetches from the existing dashboard endpoint and generates mock data for the stats endpoint.

### GET /api/dashboard (existing, real)

```json
{
  "user": { "id": 1, "display_name": "Mat", "current_level": 3, "created_at": "2025-09-14T..." },
  "graduations": [
    { "level": 1, "graduated_at": "2025-10-01T..." },
    { "level": 2, "graduated_at": "2025-12-15T..." }
  ],
  "recentLogs": [
    { "id": 1, "level": 3, "exercise_key": "heel_pulls", "sets_completed": 3, "reps_or_duration": "10 reps", "hold_time_seconds": null, "session_date": "2026-02-26" }
  ],
  "totalSessions": 87,
  "streak": 12
}
```

### GET /api/dashboard/stats (mock for now, build endpoint later)

```json
{
  "heatmap": [
    { "date": "2026-02-26", "count": 3 },
    { "date": "2026-02-25", "count": 1 }
  ],
  "weeklyVolume": [
    { "week": "2026-W08", "sessions": 5, "sets": 22 }
  ],
  "personalBests": [
    { "exercise_key": "hang", "best_hold_seconds": 45, "best_sets": 5, "achieved_at": "2026-01-10" }
  ],
  "levelTimeline": [
    { "level": 1, "started_at": "2025-09-14", "graduated_at": "2025-10-01" },
    { "level": 2, "started_at": "2025-10-01", "graduated_at": "2025-12-15" },
    { "level": 3, "started_at": "2025-12-15", "graduated_at": null }
  ],
  "exerciseBreakdown": [
    { "exercise_key": "heel_pulls", "name": "Heel Pulls", "total_logs": 34 }
  ],
  "totals": { "totalSessions": 87, "totalSets": 412, "totalLogs": 193, "memberSinceDays": 165 },
  "streak": { "current": 12, "longest": 23 }
}
```

---

## 3. Page Layout (top to bottom, single scroll)

### 3.1 Hero Stats Row

Four cards in a grid: **Current Streak**, **Longest Streak**, **Total Sessions**, **Days Since Joined**.

- **Grid**: `repeat(4, 1fr)` on desktop, `repeat(2, 1fr)` on mobile (<640px)
- **Count-up animation**: Numbers animate from 0 → actual value over ~1.2s using `requestAnimationFrame` with easeInOutQuad
- **Glow**: Each card has `box-shadow: 0 0 20px rgba(88,166,255,0.05)`, stat numbers have `text-shadow` glow
- **Streak pulse**: If the user logged today, the fire emoji icon pulses with a CSS `scale(1) → scale(1.2)` animation
- **Streak card**: Uses amber accent instead of teal — `rgba(240,136,62,...)` for shadow and text-shadow

### 3.2 Activity Heatmap

GitHub-style contribution grid for last 26 weeks (~6 months).

- **CSS Grid**: `grid-template-rows: repeat(7, 13px)`, `grid-auto-flow: column`, `grid-auto-columns: 13px`, `gap: 3px`
- **7 rows** = Mon–Sun, **26 columns** = one per week
- **Cell colors by count**: 0 → `#161b22`, 1 → `#0e4429`, 2 → `#006d32`, 3-4 → `#26a641`, 5+ → `#39d353`
- **Future dates**: transparent, `pointer-events: none`
- **Tooltip**: Single fixed-position `div`, shown via event delegation on `mouseover`/`mouseout`. Content: "N logs on 26 Feb 2026"
- **Month labels**: Absolutely positioned `<span>` elements in a `position: relative` container above the grid. Positioned at `left: week * 16px` (cell 13px + gap 3px)
- **Day labels**: Separate grid to the left showing Mon, Wed, Fri (alternating with empty spans)
- **Mobile**: `overflow-x: auto` on the scroll container
- **Legend**: `Less [■■■■■] More` aligned right below the grid
- **Accessibility**: Each cell has `aria-label` with date and count, `role="gridcell"`

#### Date calculation algorithm

```
1. Get today's date, zero out time
2. Find Monday of current week (dayOfWeek === 0 ? -6 : 1 - dayOfWeek)
3. Go back 25 weeks from that Monday → startMonday
4. For week 0..25, for day 0..6:
   cellDate = startMonday + (week * 7 + day) days
   Look up count from heatmap data map
   If cellDate > today → mark as future/empty
```

### 3.3 Weekly Volume Chart

Area chart showing sets per week for the last 12 weeks.

- **Library**: Chart.js v4 (UMD build via CDN)
- **Type**: `line` with `fill: true`
- **Gradient fill**: `createLinearGradient(0, 0, 0, 220)` from `rgba(88,166,255,0.28)` → `rgba(88,166,255,0)`
- **Line**: `borderColor: '#58a6ff'`, `borderWidth: 2`, `tension: 0.35`
- **Points**: 3px radius, last point highlighted at 6px in amber (`#f0883e`)
- **Scales**: Dark grid lines `rgba(48,54,61,...)`, gray tick labels `#8b949e`
- **Tooltip**: Dark themed (`#1c2128` bg, `#30363d` border)
- **Trend badge**: Compare average of last 3 weeks vs previous 3. If higher, show "↑ trending up" in green
- **Container**: Fixed `height: 220px` with `responsive: true, maintainAspectRatio: false`
- **Screen reader**: Hidden canvas (`aria-hidden="true"`), separate `sr-only` paragraph with text summary

### 3.4 Level Journey

Horizontal stepper/timeline with N nodes (one per level). Adapt the number of levels to your app.

- **Layout**: `display: flex` container, each step has `flex: 1`
- **Min-width**: `420px` (scrollable on mobile via parent `overflow-x: auto`)
- **Connecting lines**: `::before` pseudo-element on each step (except first), spanning from previous center to current center:
  - `left: calc(-50% + 18px)`, `right: calc(50% + 18px)`, `top: 17px`, `height: 2px`
  - Done → Done / Done → Current: solid `#58a6ff`
  - Current → Future / Future → Future: `border-top: 2px dashed #30363d`
- **Dot states**:
  - **Done**: Filled circle `background: #58a6ff` with SVG checkmark, graduation date below
  - **Current**: Pulsing ring `border: 2.5px solid #58a6ff` with `box-shadow` pulse animation, level number inside
  - **Future**: Dimmed outline `border: 2px solid #30363d`, gray number

### 3.5 Personal Bests

Grid of compact cards showing best hold times.

- **Grid**: `repeat(3, 1fr)` on desktop, `repeat(2, 1fr)` on tablet, `1fr` on mobile
- **Each card**: Trophy emoji 🏆, exercise name, hold time formatted as "45s" or "1m 30s" or "2m", date achieved
- **Filter**: Only show exercises where `best_hold_seconds > 0`
- **Empty state**: "Keep logging — your PRs will appear here! 🎯"
- **Hold time formatting**: `seconds < 60 → "Xs"`, else `"Xm Ys"` (omit seconds if zero)

### 3.6 Most Practiced

Ranked horizontal bar chart showing top 5 exercises by total logs.

- **Layout**: Stacked rows, each with rank number, exercise name (fixed width), bar track, count
- **Bar fill**: `linear-gradient(90deg, #58a6ff, #3b82f6)`, width proportional to max count
- **Animation**: Bars start at `width: 0%` and animate to target when section scrolls into view, using CSS custom property `--w` and transition. Staggered delays: 0s, 0.1s, 0.2s, 0.3s, 0.4s

---

## 4. Visual Design Tokens

```
Page background:    #0d1117
Card background:    #161b22
Card border:        #30363d
Card radius:        12px
Card shadow:        0 0 20px rgba(88, 166, 255, 0.05)

Primary accent:     #58a6ff (teal-blue)
Amber accent:       #f0883e (streaks/fire)
Success green:      #3fb950

Text primary:       #e6edf3
Text secondary:     #8b949e
Text muted:         #484f58

Heading font:       'Plus Jakarta Sans', sans-serif
Body font:          'Source Sans 3', sans-serif

Hero stat numbers:  2.5rem+ bold, tabular-nums, text-shadow glow
```

**Dark theme only for now.** All colors are hardcoded, not CSS variables.

---

## 5. Animations

### Count-up (JS)
```javascript
function pdCountUp(el, target, duration) {
  const start = performance.now();
  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  (function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(ease(p) * target).toLocaleString();
    if (p < 1) requestAnimationFrame(frame);
  })(start);
}
```
Triggered 150ms after DOM render. Duration: 1200ms.

### Fade-in-up (CSS + IntersectionObserver)
```css
.pd-section { opacity: 0; transform: translateY(24px); transition: opacity 0.6s ease-out, transform 0.6s ease-out; }
.pd-section.pd-visible { opacity: 1; transform: translateY(0); }
```
Observer: `threshold: 0.08, rootMargin: '0px 0px -40px 0px'`. Unobserve after first intersection.

### Pulse (CSS)
```css
@keyframes pd-flame-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }
@keyframes pd-ring-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(88,166,255,0.35); } 50% { box-shadow: 0 0 0 8px rgba(88,166,255,0); } }
```

---

## 6. Mock Data Strategy

Use a **seeded PRNG** (Mulberry32) for consistent data across page reloads:

```javascript
function pdMulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = pdMulberry32(42); // fixed seed
```

### Heatmap mock (182 days)
- Loop from 181 days ago to today
- Activity bias increases for recent months: `bias = max(0.3, 1 - monthsAgo * 0.1)`
- Today always has count >= 1 (to trigger active streak pulse)
- Weekends slightly more active (count 4-6 vs weekday 3-5 at high activity)
- ~15-20% chance of zero activity days for realism

### Weekly volume mock (12 weeks)
- Base sessions: 3-6 per week with slight upward trend
- Sets = sessions × (3-6 per session)
- Last 3 weeks boosted by 1.2× to show positive trend

### Other mock data
- **Personal bests**: Hardcode 5-6 exercises with realistic hold times
- **Level timeline**: Derived from real `graduations` data from the dashboard API
- **Exercise breakdown**: Hardcoded top 10 exercises sorted by total_logs desc

---

## 7. Routing Integration

### In the router function (app.js)
```javascript
if (path === '/progress') return renderProgress();
```

### Nav icon (index.html)
```html
<a href="#/progress" class="nav-icon" title="Progress">📊</a>
```

### Dashboard card (in renderDashboard function)
Add a card linking to the progress page, similar to the ebook/training guide card:
```html
<section class="ebook-dashboard-card">
  <a href="#/progress" class="ebook-dashboard-link">
    <div class="ebook-dashboard-icon">📊</div>
    <div class="ebook-dashboard-body">
      <div class="ebook-dashboard-title">Progress Dashboard</div>
      <div class="ebook-dashboard-sub">Streaks, heatmap, personal bests &amp; more</div>
    </div>
    <span class="ebook-dashboard-arrow">›</span>
  </a>
</section>
```

---

## 8. Exercise Key → Display Name Mapping

Adapt this mapping to whatever exercises your app has. The pattern is:

```javascript
const PD_EXERCISE_NAMES = {
  exercise_key: 'Display Name',
  // ...
};

function pdExName(key) {
  return PD_EXERCISE_NAMES[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
```

The fallback auto-formats unknown keys by replacing underscores with spaces and title-casing.

---

## 9. Accessibility Checklist

- [ ] Heatmap cells have `aria-label` with date and count, `role="gridcell"`
- [ ] Chart canvas has `aria-hidden="true"`, paired with `sr-only` text summary
- [ ] Hero stats section has `aria-label="Key statistics"`
- [ ] Each section has a descriptive `aria-label`
- [ ] Color contrast: all text meets WCAG AA against dark backgrounds
- [ ] Heatmap legend provides context for color meaning
- [ ] `sr-only` class uses `!important` to guarantee screen-reader-only hiding

---

## 10. Responsive Breakpoints

| Viewport | Hero Grid | Bests Grid | Heatmap | Journey |
|----------|-----------|------------|---------|---------|
| ≥640px | 4 columns | 3 columns | inline | inline |
| 480-639px | 2 columns | 2 columns | h-scroll | h-scroll |
| <480px | 2 columns | 1 column | h-scroll | h-scroll |

---

## 11. Key Gotchas & Lessons Learned

1. **CSS caching**: If you append styles to an existing CSS file, browsers may serve stale cache. Use a **separate CSS file** for the progress dashboard to guarantee fresh loading.

2. **Chart.js init timing**: The canvas must be in the DOM with layout dimensions before creating the chart. Use `setTimeout(() => initChart(), 60)` after setting innerHTML.

3. **Template literals and `esc()`**: The app uses an `esc()` function for XSS safety. Always pass user-generated strings through it in template literals.

4. **Global function scope**: Since there's no build system, all functions are global. Prefix progress-dashboard functions with `pd` to avoid naming collisions with app.js globals.

5. **Cookie-based auth**: API calls use `credentials: 'include'` for session cookies, not Bearer tokens. The `api()` helper handles this automatically.

6. **Heatmap date alignment**: Start from the Monday of the week 25 weeks ago, not just "182 days ago". This ensures columns align to calendar weeks.

7. **IntersectionObserver**: Unobserve after first intersection to prevent re-triggering animations on scroll back up.

---

## 12. Swapping Mock Data for Real API

When the `/api/dashboard/stats` endpoint is built, replace this one line in `renderProgress()`:

```javascript
// Current (mock):
const stats = pdGenerateMockStats(dashboard);

// Future (real):
const stats = await api('/dashboard/stats');
```

The mock generator produces data in the exact same shape as the API contract, so no other changes needed.
