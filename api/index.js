// Vercel Serverless Function entrypoint for Bunyan API
const appModule = require('../packages/backend/dist/app');
const app = appModule.default || appModule;

function handler(req, res) {
  // Normalize req.url if Vercel rewritten header contains the actual requested path
  const matchedPath = req.headers['x-matched-path'] || req.headers['x-forwarded-uri'];
  if (matchedPath && typeof matchedPath === 'string' && matchedPath.startsWith('/api') && req.url !== matchedPath) {
    req.url = matchedPath;
  }
  return app(req, res);
}

module.exports = handler;
module.exports.default = handler;
