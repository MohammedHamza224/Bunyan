// Vercel Serverless Function entrypoint for Bunyan API
let app;
let initError = null;

try {
  const appModule = require('../packages/backend/dist/app');
  app = appModule.default || appModule;
} catch (err) {
  initError = err;
  console.error('[Vercel Serverless] Fatal backend initialization error:', err);
}

function handler(req, res) {
  if (initError || !app) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      success: false,
      error: {
        code: 'BACKEND_INIT_ERROR',
        message: initError ? initError.message : 'Backend application module not loaded',
        details: initError ? (initError.stack || initError.toString()) : undefined,
      },
    }));
  }

  // Normalize req.url if Vercel rewritten header contains the actual requested path
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
  if (matchedPath && typeof matchedPath === 'string' && matchedPath.startsWith('/api') && req.url !== matchedPath) {
    req.url = matchedPath;
  }
  return app(req, res);
}

module.exports = handler;
module.exports.default = handler;
