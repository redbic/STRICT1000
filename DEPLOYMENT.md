# Deployment Guide for STRICT Adventure

## Prerequisites
- A GitHub account
- A Render.com account (free tier)
- A Neon.tech account (free tier)

## Step 1: Set up Neon.tech Database

1. Go to [Neon.tech](https://neon.tech) and sign up/log in
2. Click "Create Project"
3. Name your project (e.g., "strict-adventure")
4. Select a region close to your target audience
5. Click "Create Project"
6. Copy the connection string that appears (it starts with `postgresql://`)
   - Format: `postgresql://username:password@hostname/dbname`
7. Save this connection string for later use

## Step 2: Deploy to Render.com

### Option A: Using the Render Dashboard

1. Go to [Render.com](https://render.com) and sign up/log in
2. Click "New +" and select "Web Service"
3. Connect your GitHub repository
   - If not connected, click "Connect GitHub" and authorize Render
   - Select the `redbic/STRICT` repository
4. Configure the service:
   - **Name**: strict-adventure (or your preferred name)
   - **Environment**: Node
   - **Region**: Choose closest to your audience
   - **Branch**: Select your main branch
   - **Build Command**: `npm ci`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. Add Environment Variables:
   - Click "Advanced" → "Add Environment Variable"
   - Add `NODE_ENV` with value `production`
   - Add `DATABASE_URL` with your Neon.tech connection string
6. Click "Create Web Service"
7. Wait for the deployment to complete (usually 2-5 minutes)

### Option B: Using render.yaml (Recommended)

1. The repository already includes a `render.yaml` file
2. Go to [Render.com](https://render.com) and sign up/log in
3. Click "New +" and select "Blueprint"
4. Connect your GitHub repository
5. Select the repository and branch
6. Render will automatically detect the `render.yaml` file
7. Add the `DATABASE_URL` environment variable:
   - Click on the service
   - Go to "Environment" tab
   - Add `DATABASE_URL` with your Neon.tech connection string
8. Click "Apply" to deploy

## Step 3: Verify Deployment

1. Once deployed, Render will provide a URL (e.g., `https://strict-adventure.onrender.com`)
2. Verify the server is running: visit `https://your-domain/health` — should return `{"status":"ok"}`
3. Open the URL in your browser
4. Test the following:
   - Enter a username and click **Confirm**
   - Create a lobby or join an existing one
   - Start adventure and explore zones

## Step 4: Database Initialization

The database tables will be created automatically when the server starts for the first time. You can verify this by:

1. Going to your Neon.tech dashboard
2. Selecting your project
3. Going to the SQL Editor
4. Running: `SELECT * FROM players;` and `SELECT * FROM game_results;`

## Troubleshooting

### Database Connection Issues

If you see database errors:
1. Check that the `DATABASE_URL` is set correctly in Render.com
2. Ensure the connection string includes `?sslmode=require` if needed
3. Verify your Neon.tech database is active

### Application Not Starting

1. Check the logs in Render.com dashboard
2. Verify all environment variables are set
3. Ensure the build completed successfully

### WebSocket Issues

1. WebSocket connections use the same domain as HTTP
2. Ensure your browser allows WebSocket connections
3. Check browser console for connection errors

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |
| `PORT` | Server port (auto-set by Render) | `3000` |

## Free Tier Limitations

### Render.com Free Tier
- Services spin down after 15 minutes of inactivity
- First request may take 30-60 seconds to wake up
- 750 hours/month of runtime
- Automatic HTTPS included

### Neon.tech Free Tier
- 10 GB storage
- 1 project
- Automatic backups included
- Auto-suspend after 5 minutes of inactivity

## Monitoring

### Render.com Dashboard
- View logs: Click on your service → "Logs" tab
- Monitor metrics: Click on your service → "Metrics" tab
- View events: Click on your service → "Events" tab

### Database Monitoring
- Neon.tech dashboard shows:
  - Storage usage
  - Query performance
  - Connection count
  - Database activity

## Updating the Application

### Automatic Deployment
1. Push changes to your GitHub repository
2. Render will automatically detect changes
3. New deployment starts automatically
4. Zero-downtime deployment on Render

### Manual Deployment
1. Go to Render.com dashboard
2. Click on your service
3. Click "Manual Deploy" → "Deploy latest commit"

## Custom Domain (Optional)

1. Go to your service in Render.com
2. Click "Settings" tab
3. Scroll to "Custom Domain"
4. Add your domain
5. Update DNS records as instructed
6. HTTPS is automatically configured

## Support

- Render.com Documentation: https://render.com/docs
- Neon.tech Documentation: https://neon.tech/docs
- GitHub Issues: https://github.com/redbic/STRICT/issues

## Cost Considerations

Both services offer free tiers that are sufficient for:
- Development and testing
- Small projects with moderate traffic
- Hobby projects
- Portfolio demonstrations

Consider upgrading if you need:
- Always-on services (no spin-down)
- Increased storage or bandwidth
- Better performance
- Production-level support
