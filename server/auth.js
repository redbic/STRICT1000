// Authentication module (CommonJS)
// Session-based authentication with login page

const { Router } = require('express');
const { normalizeSafeString } = require('./validation');

const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;
const loginRateLimiter = new Map(); // ip -> { count, resetAt }

// Read password at module load time
const PASSWORD = normalizeSafeString(process.env.APP_PASSWORD || '').toLowerCase();
console.log('[Auth] Password configured:', PASSWORD ? `yes (${PASSWORD.length} chars)` : 'NO - APP_PASSWORD not set!');

function createAuthRouter() {
  const router = Router();

  // Login route (must be before auth middleware)
  router.post('/login', (req, res) => {
    console.log('[Auth] Login attempt from:', req.ip);
    console.log('[Auth] Request body:', req.body);

    const now = Date.now();
    const ip = req.ip || 'unknown';
    const entry = loginRateLimiter.get(ip);
    if (entry && now < entry.resetAt) {
      entry.count += 1;
      if (entry.count > LOGIN_RATE_LIMIT_MAX) {
        console.log('[Auth] Rate limited:', ip);
        res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
        return res.status(429).json({ success: false, message: 'Too many attempts. Try again soon.' });
      }
    } else {
      loginRateLimiter.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
    }

    const { password } = req.body;
    const providedPassword = normalizeSafeString(password || '').toLowerCase();

    console.log('[Auth] Provided password:', providedPassword ? `"${providedPassword}" (${providedPassword.length} chars)` : 'empty');
    console.log('[Auth] Expected password:', PASSWORD ? `"${PASSWORD}" (${PASSWORD.length} chars)` : 'empty');
    console.log('[Auth] Match:', providedPassword === PASSWORD);

    if (providedPassword && providedPassword === PASSWORD) {
      req.session.authenticated = true;
      console.log('[Auth] Login SUCCESS, session:', req.session.id);
      loginRateLimiter.delete(ip);
      res.json({ success: true });
    } else {
      console.log('[Auth] Login FAILED');
      res.status(401).json({ success: false, message: 'Incorrect password' });
    }
  });

  return router;
}

// Auth middleware - protect all routes except login
function authMiddleware(req, res, next) {
  // Allow access to login page, login endpoint, health check, and static assets needed for login
  if (req.path === '/login.html' ||
      req.path === '/login' ||
      req.path === '/health' ||
      req.path.startsWith('/css/') ||
      req.path.startsWith('/fonts/')) {
    console.log('[Auth] Allowing unauthenticated access to:', req.path);
    return next();
  }

  // Check if user is authenticated
  if (req.session && req.session.authenticated) {
    return next();
  }

  // Redirect to login page
  console.log('[Auth] Redirecting to login, path was:', req.path, 'session:', req.session?.id);
  res.redirect('/login.html');
}

// Check if a session is authenticated (for WebSocket upgrade)
function isSessionAuthenticated(session) {
  return session && session.authenticated === true;
}

module.exports = {
  createAuthRouter,
  authMiddleware,
  isSessionAuthenticated,
};
