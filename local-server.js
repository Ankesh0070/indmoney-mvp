/**
 * mvp-app/local-server.js
 * ─────────────────────────────────────────────────────────────────────────────
 * INDmoney — standalone investing MVP. Completely separate from the
 * dashboard/: its own local server, own port, own static files. It does not
 * import, modify, or depend on anything inside dashboard/ (including the
 * RAG review-assistant, which is dashboard-only), and dashboard/server.js
 * does not depend on this file either — each runs independently on its
 * own port.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 4000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png'
};

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  let filePath = parsed.pathname === '/' ? '/index.html' : parsed.pathname;
  filePath = path.join(PUBLIC_DIR, path.normalize(filePath).replace(/^(\.\.[\/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.writeHead(200);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`[INDmoney MVP] Running at http://localhost:${PORT}`);
});
