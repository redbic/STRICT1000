# STRICT1000

Browser-based multiplayer top-down adventure game.

## Quick Start

```bash
npm ci
cp .env.example .env   # Set APP_PASSWORD
npm run dev
```

Open `http://localhost:3000` and login with your `APP_PASSWORD`.

## Stack

- **Frontend:** Vanilla JS + HTML5 Canvas
- **Backend:** Node.js + Express + WebSocket (`ws`)
- **Database:** PostgreSQL (optional in dev)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_PASSWORD` | Yes | Login password |
| `SESSION_SECRET` | Production | Session signing key |
| `DATABASE_URL` | Production | PostgreSQL connection string |
| `APP_ORIGIN` | Production | WebSocket origin allowlist |
| `PORT` | No | Server port (default: 3000) |

## Project Structure

```
server.js           # HTTP + WebSocket server
server/             # Auth, rooms, currency, validation
public/js/          # Game client
public/data/zones/  # Zone JSON files
public/tools/       # Environment builder
```

## Deployment

See `DEPLOYMENT.md` for Render deployment instructions.
