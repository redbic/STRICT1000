# HANDOFF

## What Changed
- Hardened WebSocket ingress in `server.js`:
  - Message type allowlist
  - Connection cap per IP
  - Optional origin allowlist via `APP_ORIGIN`
  - Enemy sync payload length guard
- Added host-only game start enforcement.
- Added graceful shutdown handlers for `SIGINT`/`SIGTERM`.
- Added baseline security headers for HTTP responses.
- Added production environment validation (`DATABASE_URL` required).

## Operational Notes
- In production, set `APP_ORIGIN` to the exact public game origin.
- If you run behind a proxy/CDN, ensure `x-forwarded-for` is passed correctly.

## Known Architectural Gaps
- Enemy state remains host-authoritative (not fully server-authoritative).
- `enemy_killed` can still be client-forged; needs server-side combat validation.
- Client networking protocol is stringly-typed and unversioned.

## Suggested Next Work (Priority)
1. Move enemy simulation and kill validation fully server-side.
2. Add protocol schema validation (e.g., zod/ajv).
3. Introduce interpolation for remote players and snapshot cadence controls.
4. Add linting/formatting + CI (`eslint`, `prettier`, `npm audit`).
