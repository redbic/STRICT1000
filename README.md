# STRICT1000

Browser-based multiplayer top-down adventure game set in a hostile, shifting hotel.

## Stack
- Frontend: Vanilla JavaScript + HTML5 Canvas
- Backend: Node.js + Express
- Realtime: `ws`
- Persistence: PostgreSQL (`pg`)

## Quick Start
1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Run development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Environment Variables
- `PORT` (default `3000`)
- `NODE_ENV` (`development` or `production`)
- `DATABASE_URL` (required in production)
- `APP_ORIGIN` (required for strict WebSocket origin allowlist in production)

## Multiplayer Model (Current)
- Room host is authoritative for enemy simulation broadcast (`enemy_sync`).
- Server is authoritative for room membership, zone filtering, and currency crediting.
- Enemy kill rewards are debounced per room+zone+enemy key.

## Security Controls (Current)
- HTTP rate limiting on `/api/*`
- WebSocket message rate limiting per connection
- WebSocket payload size limit (64KB)
- WebSocket connection cap per IP
- Request/body input sanitization + validation
- Basic response security headers

## Important Directories
- `server.js`: HTTP + WebSocket entrypoint
- `server/`: currency, room management, validation
- `public/js/`: game/client runtime
- `public/css/`: styling

## Deployment
See `DEPLOYMENT.md`.
