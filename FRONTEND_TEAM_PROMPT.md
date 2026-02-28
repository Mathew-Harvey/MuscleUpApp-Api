# Frontend team — update MuscleUpApp-Web to match API and UX fixes

Apply the following changes in the **MuscleUpApp-Web** repo so the live site works with the updated API and fixes reported issues.

---

## 1. API base and verify-session

- **Verify-session** is now at `GET /api/verify-session` (no double `/api/api/`). Ensure the frontend calls exactly `/api/verify-session` with credentials (e.g. `fetch(API_BASE + '/verify-session', { credentials: 'include' })` if `API_BASE` is `/api`).
- No other API paths changed; auth, dashboard, log, graduate, levels, settings, reset-progress, unlock-all all stay under `/api` as before.

---

## 2. Auth and logout

- **Logout** now requires an authenticated session. The API returns 401 if an unauthenticated request hits `POST /api/auth/logout`. The frontend should only show or call logout when the user is logged in; handle 401 by redirecting to login and clearing local state.
- **Session regeneration**: After login, register, set-password, reset-password, and validate-set-password-token, the API regenerates the session (fixes session fixation). No frontend change required; keep using the session cookie as before.

---

## 3. Progress dashboard — show real data by default

- **Default to live data.** The progress dashboard must show the user’s real stats (current streak, total sessions, days since joined) by default, not demo/mock data.
- **Implementation**: Use the same logic as in this repo’s `public/js/progress.js`:
  - Treat “use live data” as the default (e.g. `const useLiveData = localStorage.getItem('pd_live_data') !== '0';` so only an explicit `'0'` turns it off).
  - Hero stats: current streak = `dashboard.streak`, total sessions = `dashboard.totalSessions`, days since joined = derived from `dashboard.user.created_at`. Longest streak can be the max of current streak and any stored value, or from a future API.
  - Keep mock/demo data only as an optional “View demo data” (or “Preview with sample data”) that sets `pd_live_data` to `'0'` when enabled and back to `'1'` or remove when disabled.
- Remove or invert any existing “Show my real data” default so that **real data is shown by default** and demo is opt-in.

---

## 4. Exercise images (29 of 31 not rendering)

- **Problem**: Image map keys (e.g. in `EXERCISE_IMAGES` / `EXERCISE_PROGRESSION_IMAGES` or equivalent) do not match the **exercise keys** in `data/levels.js` (and thus from the API `GET /api/levels`).
- **Fix**: Align image map keys with the level data keys. Use the exact `key` values from the levels payload (e.g. `pull_ups`, `bar_dips`, `false_grip_pullups`, `transition_rows`, `ring_rows`, `ring_dead_hang`, `negative_muscle_ups`, `tempo_eccentric_ring_muscle_up`, `muscle_up_sets`, `ring_muscle_up`, etc.). Either:
  - Replace the keys in the image map with these exact strings, or
  - Add a small **fallback mapping** from level keys to existing image keys (e.g. `pull_ups` → `pull_up`, `bar_dips` → `bar_dip`) so `getImagesForExercise(exerciseKey)` resolves correctly for all 31 exercises.
- **Reference**: In this API repo, `data/levels.js` is the source of truth for exercise keys. The Web app should use the same keys for any image lookup.

---

## 5. Set-password / unauthenticated root — hide nav until auth

- **Problem**: Visiting the live site shows the “Set your password” modal (or similar) with the full authenticated nav (Ebook, Progress, Settings, Log out) visible before the user is authenticated.
- **Fix**: On the root route (or any route that can show set-password or login):
  - Do **not** render the main app nav (Ebook, Progress, Settings, Log out) until the user is authenticated (e.g. after successful login or after `GET /api/auth/me` returns `authenticated: true`).
  - Show only the set-password or login UI (and any minimal header/footer you need) until then. After auth, show the full nav and the rest of the app.

---

## 6. Theme and heatmap

- **applyTheme**: If you have logic that sets `data-theme` for dark/light, ensure it’s consistent on load and navigation so there’s no flash of the wrong theme (e.g. apply theme as soon as the app boots from saved preference and set `data-theme` explicitly in both settings and global applyTheme).
- **Heatmap colours**: If the progress dashboard has a heatmap, avoid hardcoding colours that only look good on dark background. Use CSS variables or theme-aware colours so the same heatmap works in light mode (e.g. green shades that contrast on both light and dark).

---

## 7. Optional cleanup (if present in Web repo)

- **Handstand images**: If the Web repo has a `public/images/` (or similar) directory with Handstand-only assets (e.g. chesttowallhandstand01.png, handstandkickup01.png) that are not used by the Muscle Up UI, remove that directory to avoid shipping unused assets.
- **Duplicate PDF**: If “Ring Muscle Up Program (4).pdf” (or similar) exists both at repo root and under `assets/`, keep only the copy under `assets/` (or wherever the download route serves from) and delete the duplicate at root.
- **Coverage**: Add `coverage/` to `.gitignore` and stop committing the coverage directory.

---

## 8. Summary of API-side changes (for reference)

- All DB tables now use the **`mu_`** prefix (e.g. `mu_users`, `mu_session`, `mu_progress_logs`, `mu_graduations`, `mu_password_tokens`). No frontend API contract change; only backend.
- Reset progress, unlock all, and validate-set-password-token now use the correct tables and work in production.
- Verify-session route is `GET /api/verify-session` (single prefix).
- Logout requires auth; session is regenerated after login/register/set-password/reset-password.
- Streak is computed in UTC for consistent behaviour across timezones.

Use this document as the single prompt for updating the frontend; implement the sections that apply to MuscleUpApp-Web.
