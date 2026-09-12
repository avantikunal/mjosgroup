/**
 * MOS Mechanical Aftercare Workbench — server.
 *
 * Plain Node http, zero npm dependencies. `node server/index.js` is the whole
 * deployment: no build step, no framework, nothing to `npm install` before it runs.
 * That is a deliberate choice for a small trades business with no in-house dev team —
 * see docs/PRD.md "Why this stack".
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const { REFERENCE } = require('./reference');
const { classifyIntake } = require('./classifier');
const { SESSION_USERS } = require('./session');
const store = require('./store');

const PORT = process.env.PORT || 4173;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    // Strict CSP: same-origin scripts/styles only, no inline execution, no framing.
    // The client never builds HTML from server data (see public/app.js), so this is
    // defence in depth rather than the only line of protection.
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const safePath = path.normalize(relative).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(content);
  });
}

async function handleApi(req, res, pathname, query) {
  if (pathname === '/api/session' && req.method === 'GET') {
    return sendJson(res, 200, { currentUser: SESSION_USERS[0], users: SESSION_USERS });
  }

  if (pathname === '/api/reference' && req.method === 'GET') {
    return sendJson(res, 200, REFERENCE);
  }

  if (pathname === '/api/sites' && req.method === 'GET') {
    return sendJson(res, 200, { sites: store.listSites(query.q) });
  }

  const siteMatch = pathname.match(/^\/api\/sites\/([^/]+)$/);
  if (siteMatch && req.method === 'GET') {
    const site = store.getSite(siteMatch[1]);
    if (!site) return sendJson(res, 404, { error: 'Site not found' });
    return sendJson(res, 200, { site });
  }

  if (pathname === '/api/tickets' && req.method === 'GET') {
    return sendJson(res, 200, { tickets: store.listTickets({ party: query.party, priority: query.priority, state: query.state }) });
  }

  if (pathname === '/api/tickets' && req.method === 'POST') {
    const body = await readBody(req);
    try {
      const ticket = store.createTicket(body);
      return sendJson(res, 201, { ticket });
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message });
    }
  }

  const ticketMatch = pathname.match(/^\/api\/tickets\/([^/]+)$/);
  if (ticketMatch && req.method === 'GET') {
    const ticket = store.getTicket(ticketMatch[1]);
    if (!ticket) return sendJson(res, 404, { error: 'Ticket not found' });
    return sendJson(res, 200, { ticket });
  }
  if (ticketMatch && req.method === 'PATCH') {
    const body = await readBody(req);
    try {
      const ticket = store.updateTicket(ticketMatch[1], body);
      if (!ticket) return sendJson(res, 404, { error: 'Ticket not found' });
      return sendJson(res, 200, { ticket });
    } catch (err) {
      return sendJson(res, err.status || 400, { error: err.message });
    }
  }

  if (pathname === '/api/voice-intake' && req.method === 'POST') {
    const body = await readBody(req);
    const sites = store.listSites();
    const result = classifyIntake(body.transcript || '', sites);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/reset' && req.method === 'POST') {
    const tickets = store.resetToSeed();
    return sendJson(res, 200, { tickets });
  }

  sendJson(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(req, res, pathname, parsed.query);
    } catch (err) {
      sendJson(res, 500, { error: 'Internal error', detail: String(err.message || err) });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`MOS Aftercare Workbench listening on http://localhost:${PORT}`);
});
