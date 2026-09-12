/**
 * Stub session/user list, shared between the local dev server (server/index.js)
 * and the Vercel serverless function (api/[...path].js). No real auth in this
 * prototype — see docs/PRD.md open questions for what a production login would need.
 */

const SESSION_USERS = [
  { id: 'admin.office', displayName: 'Niamh (Office Admin)', role: 'office-admin', permissions: ['ticket:read', 'ticket:create', 'ticket:update', 'site:read', 'voice-intake:use'] },
  { id: 'tech.field', displayName: 'Colm (Field Technician)', role: 'technician', permissions: ['ticket:read', 'ticket:update', 'site:read'] },
  { id: 'mgr.ops', displayName: 'Sile (Operations Manager)', role: 'manager', permissions: ['ticket:read', 'ticket:create', 'ticket:update', 'site:read', 'voice-intake:use', 'ticket:override'] },
];

module.exports = { SESSION_USERS };
