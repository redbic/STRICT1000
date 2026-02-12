# Deployment (Render)

## Render Service Settings
- **Environment:** Node
- **Build command:** `npm ci`
- **Start command:** `npm start`
- **Health endpoint:** `/health`

## Required Environment Variables
- `NODE_ENV=production`
- `DATABASE_URL=<postgres-connection-string>`
- `APP_ORIGIN=https://<your-public-domain>`

## Why `APP_ORIGIN` Matters
WebSocket upgrades are origin-checked. If `APP_ORIGIN` is missing or incorrect, browser WS connections from your deployed client will be rejected.

## Post-Deploy Validation
Run these checks after deploy:

```bash
curl -fsS https://<your-service>/health
```

Then open the game in browser and verify:
- WebSocket connects successfully
- Room listing works
- Join/start game works
- Enemy kill rewards update balance

## Troubleshooting
- **WS closes immediately:** verify `APP_ORIGIN` exactly matches scheme + host.
- **500s on profile/inventory APIs:** verify `DATABASE_URL` and DB schema (`players`, `wallet_ledger`).
- **Unexpected disconnects:** check WS rate-limit thresholds against client send cadence.
