/**
 * Vercel serverless entry point — same routes as server/index.js's handleApi(),
 * adapted to Vercel's (req, res) function signature instead of a persistent
 * http.createServer(). The route logic and every business module (reference,
 * triage, classifier, store) are shared unchanged with the local dev server.
 *
 * Serverless caveat: store.js's JSON-file persistence is best-effort here (see
 * its persist() function) because a serverless filesystem is read-only outside
 * /tmp and instances don't share disk. Ticket data created in this deployment
 * lives only in that invocation's in-memory store and can reset on a cold start
 * or differ between concurrent instances — fine for a demo, not for production.
 * See README.md "Deploying to Vercel" and docs/PRD.md §10/§12.
 */

const url = require('url');

const { REFERENCE } = require('../server/reference');
const { classifyIntake } = require('../server/classifier');
const { SESSION_USERS } = require('../server/session');
const store = require('../server/store');

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
};

function send(res, status, data) {
  res.status(status);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
  res.json(data);
}

module.exports = async (req, res) => {
  // Derived from req.url rather than req.query.path: the catch-all query param's
  // exact shape has proven inconsistent across Vercel CLI/runtime versions, while
  // req.url (the actual requested path) is always reliable.
  const parsed = url.parse(req.url, true);
  const sub = parsed.pathname.replace(/^\/api/, '') || '/';
  const query = parsed.query;
  const method = req.method;
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  try {
    if (sub === '/session' && method === 'GET') {
      return send(res, 200, { currentUser: SESSION_USERS[0], users: SESSION_USERS });
    }

    if (sub === '/reference' && method === 'GET') {
      return send(res, 200, REFERENCE);
    }

    if (sub === '/sites' && method === 'GET') {
      return send(res, 200, { sites: store.listSites(query.q) });
    }

    const siteMatch = sub.match(/^\/sites\/([^/]+)$/);
    if (siteMatch && method === 'GET') {
      const site = store.getSite(siteMatch[1]);
      if (!site) return send(res, 404, { error: 'Site not found' });
      return send(res, 200, { site });
    }

    if (sub === '/tickets' && method === 'GET') {
      return send(res, 200, { tickets: store.listTickets({ party: query.party, priority: query.priority, state: query.state }) });
    }

    if (sub === '/tickets' && method === 'POST') {
      try {
        const ticket = store.createTicket(body);
        return send(res, 201, { ticket });
      } catch (err) {
        return send(res, err.status || 400, { error: err.message });
      }
    }

    const ticketMatch = sub.match(/^\/tickets\/([^/]+)$/);
    if (ticketMatch && method === 'GET') {
      const ticket = store.getTicket(ticketMatch[1]);
      if (!ticket) return send(res, 404, { error: 'Ticket not found' });
      return send(res, 200, { ticket });
    }
    if (ticketMatch && method === 'PATCH') {
      try {
        const ticket = store.updateTicket(ticketMatch[1], body);
        if (!ticket) return send(res, 404, { error: 'Ticket not found' });
        return send(res, 200, { ticket });
      } catch (err) {
        return send(res, err.status || 400, { error: err.message });
      }
    }

    if (sub === '/voice-intake' && method === 'POST') {
      const sites = store.listSites();
      const result = classifyIntake(body.transcript || '', sites);
      return send(res, 200, result);
    }

    if (sub === '/reset' && method === 'POST') {
      const tickets = store.resetToSeed();
      return send(res, 200, { tickets });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    return send(res, 500, { error: 'Internal error', detail: String((err && err.message) || err) });
  }
};
