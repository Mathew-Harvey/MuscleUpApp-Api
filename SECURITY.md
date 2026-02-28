# Security notes

## SSL (rejectUnauthorized: false)

In production the API uses `rejectUnauthorized: false` for the Postgres connection because Render/Heroku Postgres and similar providers often use self-signed or platform certificates. The connection is still TLS-encrypted; this only disables strict certificate hostname verification. For stricter security, configure the database with a CA certificate and set `rejectUnauthorized: true` with the appropriate `ca` option.

## CSRF and SameSite

Session cookies use `sameSite: 'none'` in production to allow the frontend (e.g. on a different origin) to send credentials. With cross-origin cookies, consider adding CSRF protection (e.g. double-submit cookie or SameSite plus strict origin) for state-changing requests. Currently there is no CSRF token; the frontend and API should ideally be same-origin (e.g. same domain with a proxy) to avoid cross-site request issues.
