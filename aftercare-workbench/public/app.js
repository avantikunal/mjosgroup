/**
 * Workbench UI — vanilla ES module, no build step, no dependencies.
 *
 * Two rules kept throughout:
 *   1. Every triage value the user sees (party, priority, chargeable, explanation)
 *      comes from the server. The UI never re-derives or guesses a policy decision.
 *   2. All text is inserted as text nodes, never as innerHTML. Fault descriptions and
 *      voice transcripts are customer-controlled free text; building markup from them
 *      would turn a crafted description into stored XSS in the staff workbench.
 */

const state = {
  view: 'queue',
  currentUser: null,
  users: [],
  reference: null,
  sites: [],
  tickets: [],
  selectedTicketId: null,
  filters: { party: '', priority: '', state: '' },
  intake: { site: null, siteQuery: '', lastResult: null },
  voice: { transcript: '', draft: null, listening: false },
  // Per-tab "Run demo" narration, cleared/replaced as each demo button runs — see
  // demoNoteBanner(). queueExplainMode is a toggle rather than a static note because
  // the queue's own demo narrates whichever ticket is currently selected, which can
  // change after the demo button is clicked (picking a different ticket, overriding it).
  demoNote: null,
  queueExplainMode: false,
};

const $ = (sel) => document.querySelector(sel);
const main = () => $('#app');

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// -------------------------------------------------------------------------- bootstrap

async function boot() {
  const [session, reference, sitesResp, ticketsResp] = await Promise.all([
    api('/api/session'),
    api('/api/reference'),
    api('/api/sites'),
    api('/api/tickets'),
  ]);
  state.currentUser = session.currentUser;
  state.users = session.users;
  state.reference = reference;
  state.sites = sitesResp.sites;
  state.tickets = ticketsResp.tickets;
  if (state.tickets.length) state.selectedTicketId = state.tickets[0].ticketId;

  renderUserSwitch();
  wireTabs();
  render();
}

function renderUserSwitch() {
  const select = $('#user-select');
  select.textContent = '';
  for (const u of state.users) {
    select.appendChild(el('option', { value: u.id, text: `${u.displayName} — ${u.role}` }));
  }
  select.value = state.currentUser.id;
  select.addEventListener('change', () => {
    state.currentUser = state.users.find((u) => u.id === select.value);
    render();
  });
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
}

function render() {
  main().textContent = '';
  if (state.view === 'queue') main().appendChild(renderQueueView());
  else if (state.view === 'intake') main().appendChild(renderIntakeView());
  else if (state.view === 'voice') main().appendChild(renderVoiceView());
  else if (state.view === 'overview') main().appendChild(renderOverviewView());
}

// -------------------------------------------------------------------------- shared bits

// Renders the narration left by a tab's own "Run demo" button, only on the tab it
// belongs to — every other tab's render() calls this and gets null back until its
// own demo button is clicked. Not a tour overlay: each tab demos and explains itself.
function demoNoteBanner(view) {
  if (!state.demoNote || state.demoNote.view !== view) return null;
  return el('div', { class: 'callout callout-info' }, [
    el('strong', { text: state.demoNote.title }),
    el('span', { text: state.demoNote.text }),
  ]);
}

async function resetDemoData() {
  const { tickets } = await api('/api/reset', { method: 'POST' });
  state.tickets = tickets;
  state.selectedTicketId = tickets.length ? tickets[0].ticketId : null;
  state.intake = { site: null, siteQuery: '', lastResult: null };
  state.voice = { transcript: '', draft: null, listening: false };
  state.demoNote = null;
  state.queueExplainMode = false;
  render();
}

function priorityBadge(priorityId) {
  return el('span', { class: `badge badge-${priorityId.toLowerCase()}`, text: priorityId });
}

function partyLabel(partyId) {
  return state.reference.parties[partyId] ? state.reference.parties[partyId].label : partyId;
}

function chargeBadge(ticket) {
  if (ticket.chargeable === true) {
    return el('span', { class: 'badge badge-charge', text: `Chargeable (${ticket.chargeParty === 'builder' ? 'builder' : 'homeowner'})` });
  }
  if (ticket.chargeable === false) return el('span', { class: 'badge badge-nocharge', text: 'No charge' });
  return el('span', { class: 'badge badge-unknown', text: 'Charge: TBD' });
}

function faultLabel(faultTypeId) {
  const ft = state.reference.faultTypes[faultTypeId];
  return ft ? ft.label : faultTypeId;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// -------------------------------------------------------------------------- queue view

function renderQueueView() {
  const page = el('div', { class: 'stack' });

  page.appendChild(
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel-body' }, [
        el('div', { class: 'actions-row' }, [
          el('button', {
            class: 'btn secondary',
            onclick: () => {
              state.queueExplainMode = !state.queueExplainMode;
              if (state.queueExplainMode) {
                const candidate =
                  state.tickets.find((t) => t.dataQuality === 'incomplete') ||
                  state.tickets.find((t) => t.repeatFault) ||
                  state.tickets.find((t) => t.requiresSeniorPlumberSignOff) ||
                  state.tickets[0];
                if (candidate) state.selectedTicketId = candidate.ticketId;
              }
              render();
            },
            text: state.queueExplainMode ? '■ Stop explaining' : '▶ Run demo: explain this ticket',
          }),
          el('button', { class: 'btn secondary', onclick: () => resetDemoData(), text: 'Reset demo data' }),
        ]),
      ]),
    ])
  );
  const dn = demoNoteBanner('queue');
  if (dn) page.appendChild(dn);

  const wrap = el('div', { class: 'split' });
  page.appendChild(wrap);

  // ---- list panel
  const listPanel = el('div', { class: 'panel' });
  const filterBar = el('div', { class: 'filters' });

  const partySelect = el('select', { onchange: (e) => { state.filters.party = e.target.value; render(); } }, [
    el('option', { value: '', text: 'All parties' }),
    ...Object.entries(state.reference.parties).map(([id, p]) => el('option', { value: id, text: p.label, selected: state.filters.party === id || undefined })),
  ]);
  partySelect.value = state.filters.party;

  const prioritySelect = el('select', { onchange: (e) => { state.filters.priority = e.target.value; render(); } }, [
    el('option', { value: '', text: 'All priorities' }),
    ...Object.keys(state.reference.priorities).map((id) => el('option', { value: id, text: state.reference.priorities[id].label })),
  ]);
  prioritySelect.value = state.filters.priority;

  const stateSelect = el('select', { onchange: (e) => { state.filters.state = e.target.value; render(); } }, [
    el('option', { value: '', text: 'All states' }),
    ...state.reference.states.map((s) => el('option', { value: s, text: s })),
  ]);
  stateSelect.value = state.filters.state;

  filterBar.appendChild(partySelect);
  filterBar.appendChild(prioritySelect);
  filterBar.appendChild(stateSelect);
  listPanel.appendChild(filterBar);

  const filtered = state.tickets.filter(
    (t) =>
      (!state.filters.party || t.assignedParty === state.filters.party) &&
      (!state.filters.priority || t.priority === state.filters.priority) &&
      (!state.filters.state || t.state === state.filters.state)
  );

  const list = el('ul', { class: 'list' });
  if (filtered.length === 0) {
    list.appendChild(el('li', { class: 'empty-state', text: 'No tickets match these filters.' }));
  }
  for (const t of filtered) {
    const site = state.sites.find((s) => s.siteId === t.siteId);
    const item = el(
      'button',
      { class: `list-item${t.ticketId === state.selectedTicketId ? ' selected' : ''}`, onclick: () => { state.selectedTicketId = t.ticketId; render(); } },
      [
        el('div', { class: 'row1' }, [priorityBadge(t.priority), t.dataQuality === 'incomplete' ? el('span', { class: 'badge badge-incomplete', text: 'Incomplete' }) : null, t.repeatFault ? el('span', { class: 'badge badge-repeat', text: 'Repeat fault' }) : null]),
        el('div', { class: 'title', text: faultLabel(t.faultTypeId) }),
        el('div', { class: 'meta', text: `${site ? site.customerName : 'Unknown site'} · ${t.state} · ${partyLabel(t.assignedParty)}` }),
      ]
    );
    list.appendChild(el('li', {}, item));
  }
  listPanel.appendChild(list);
  wrap.appendChild(listPanel);

  // ---- detail panel
  const ticket = state.tickets.find((t) => t.ticketId === state.selectedTicketId);
  wrap.appendChild(renderTicketDetail(ticket));

  return page;
}

function renderTicketDetail(ticket) {
  const panel = el('div', { class: 'panel' });
  if (!ticket) {
    panel.appendChild(el('div', { class: 'panel-body' }, el('div', { class: 'empty-state', text: 'Select a ticket to see triage details.' })));
    return panel;
  }
  const site = state.sites.find((s) => s.siteId === ticket.siteId);

  panel.appendChild(
    el('div', { class: 'panel-header' }, [
      el('h2', { text: `${ticket.ticketId} — ${faultLabel(ticket.faultTypeId)}` }),
      priorityBadge(ticket.priority),
    ])
  );

  const body = el('div', { class: 'panel-body' });

  if (state.queueExplainMode) {
    body.appendChild(
      el('div', { class: 'callout callout-ok' }, [
        el('strong', { text: 'Say this' }),
        el('span', {
          text: `This ticket was assigned to "${partyLabel(ticket.assignedParty)}" automatically, by rule ${ticket.ruleId} — read the explanation below for why. The priority badge (top right) and charge badge further down are also rule-driven, not typed in by whoever answered the phone. Try the state dropdown or "Override party" below to see how a correction gets recorded rather than silently overwriting the original decision.`,
        }),
      ])
    );
  }

  // Explanation callout — the audit trail for the triage decision.
  const calloutClass = ticket.dataQuality === 'incomplete' ? 'callout-warn' : 'callout-info';
  body.appendChild(
    el('div', { class: `callout ${calloutClass}` }, [
      el('strong', { text: `${partyLabel(ticket.assignedParty)} — rule ${ticket.ruleId}` }),
      el('span', { text: ticket.explanation }),
    ])
  );

  if (ticket.requiresSeniorPlumberSignOff) {
    body.appendChild(
      el('div', { class: 'callout callout-warn' }, [
        el('strong', { text: 'Senior plumber sign-off required' }),
        el('span', { text: 'Heat pump faults are never auto-finalised — a senior plumber must confirm whether this is MOS\'s own hydraulic-side fault or a Heat Merchants supplier warranty matter before it is dispatched (Heat Pump Decision Tree).' }),
      ])
    );
  }

  if (ticket.dataQuality === 'incomplete') {
    body.appendChild(
      el('div', { class: 'callout callout-warn' }, [
        el('strong', { text: 'Missing required evidence' }),
        el('span', { text: `Follow up to collect: ${ticket.missingFields.join(', ')}. The ticket cannot be confidently billed or closed until this is attached.` }),
      ])
    );
  }

  body.appendChild(el('div', { class: 'section-title', text: 'Site & warranty' }));
  const mosWarrantyEnd = site && site.commissioningDate ? addMonthsIso(site.commissioningDate, site.mosWarrantyMonths ?? 12) : null;
  const builderWarrantyEnd = site && site.commissioningDate && site.builderWarrantyMonths ? addMonthsIso(site.commissioningDate, site.builderWarrantyMonths) : null;
  body.appendChild(
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Customer' }), el('dd', { text: site ? `${site.customerName} · ${site.phone}` : '—' }),
      el('dt', { text: 'Address' }), el('dd', { text: site ? site.address : '—' }),
      el('dt', { text: 'Builder' }), el('dd', { text: site ? site.builderName : '—' }),
      el('dt', { text: 'System' }), el('dd', { text: site ? `${site.systemType} — ${site.manufacturer} ${site.modelNumber}` : '—' }),
      el('dt', { text: 'Commissioned' }), el('dd', { text: site ? (site.commissioningDate || 'MISSING — see rule above') : '—' }),
      el('dt', { text: 'MOS plumbing warranty' }), el('dd', { text: mosWarrantyEnd ? `expires ${mosWarrantyEnd}` : '—' }),
      el('dt', { text: 'Builder warranty' }), el('dd', { text: builderWarrantyEnd ? `expires ${builderWarrantyEnd}` : 'none beyond MOS\'s' }),
    ])
  );

  body.appendChild(el('div', { class: 'section-title', text: 'Reported fault' }));
  const faultDl = [
    el('dt', { text: 'Channel' }), el('dd', { text: ticket.channel }),
    el('dt', { text: 'Builder (if known)' }), el('dd', { text: ticket.builderIfKnown || '—' }),
    el('dt', { text: 'Reported' }), el('dd', { text: fmtDate(ticket.openedAt) }),
    el('dt', { text: 'Error code' }), el('dd', { text: ticket.errorCode || '—' }),
    el('dt', { text: 'Serial number' }), el('dd', { text: ticket.serialNumber || '—' }),
    el('dt', { text: 'Photos attached' }), el('dd', { text: String((ticket.photos || []).length) }),
    el('dt', { text: 'Service certs provided' }), el('dd', { text: ticket.serviceCertsProvided ? 'Yes' : 'No' }),
    el('dt', { text: 'Symptoms' }), el('dd', { text: ticket.symptoms || '—' }),
    el('dt', { text: 'Charge' }), el('dd', {}, chargeBadge(ticket)),
  ];
  body.appendChild(el('dl', { class: 'kv' }, faultDl));

  body.appendChild(el('div', { class: 'section-title', text: 'Update ticket' }));
  const stateSelect = el(
    'select',
    { onchange: async (e) => { await api(`/api/tickets/${ticket.ticketId}`, { method: 'PATCH', body: JSON.stringify({ state: e.target.value }) }); await refreshTickets(); } },
    state.reference.states.map((s) => el('option', { value: s, text: s, selected: s === ticket.state || undefined }))
  );
  stateSelect.value = ticket.state;
  const actions = el('div', { class: 'actions-row' }, [stateSelect]);

  if (state.currentUser.permissions.includes('ticket:override')) {
    const overrideBtn = el('button', {
      class: 'btn secondary',
      onclick: async () => {
        const partyId = prompt('Reassign to party id (see queue filter dropdown for valid ids):', ticket.assignedParty);
        if (!partyId || partyId === ticket.assignedParty) return;
        const reason = prompt('Reason for override (recorded on the ticket):', '');
        if (!reason) return alert('A reason is required to override triage.');
        try {
          await api(`/api/tickets/${ticket.ticketId}`, { method: 'PATCH', body: JSON.stringify({ assignedParty: partyId, overrideReason: reason }) });
          await refreshTickets();
        } catch (err) {
          alert(err.message);
        }
      },
      text: 'Override party…',
    });
    actions.appendChild(overrideBtn);
  }
  body.appendChild(actions);

  panel.appendChild(body);
  return panel;
}

function addMonthsIso(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function refreshTickets() {
  const resp = await api('/api/tickets');
  state.tickets = resp.tickets;
  render();
}

// -------------------------------------------------------------------------- guided intake view

// Each demo maps to one documented rule path — see server/triage.js and
// docs/PRD.md §7 for the rule-by-rule citations back to MOS's own guides.
const INTAKE_DEMOS = [
  {
    id: 'builder-snagging',
    label: '▶ Demo: builder / snagging',
    customerName: 'Fiona Doyle',
    faultTypeId: 'LEAK-INGRESS',
    leakChecklist: { showerTraySealFailure: true },
    symptoms: 'Water pooling near the shower tray, seal looks like it has failed.',
    say: "Fiona Doyle's house is still inside MOS's warranty — but a shower tray seal failure is on the builder/snagging checklist. Watch: it goes to the Builder/Snagging Team regardless of warranty status, exactly as the Aftercare Call Triage Guide says: \"not our plumbing responsibility.\"",
  },
  {
    id: 'within-warranty',
    label: '▶ Demo: within MOS warranty',
    customerName: 'Aidan Byrne',
    faultTypeId: 'HEAT-PUMP-FAULT',
    errorCode: 'H12',
    serialNumber: 'PA-88213',
    symptoms: 'Heat pump not heating, controller showing H12.',
    say: "Aidan Byrne's heat pump is inside MOS's 1-year warranty, and the error code starts with H — hydraulic, per the Heat Pump Decision Tree's error code guide. Watch: it goes to MOS's own Plumbing Team, free of charge, pending a senior plumber's sign-off.",
  },
  {
    id: 'builder-recharge',
    label: '▶ Demo: builder recharge',
    customerName: 'Sean & Orla Whelan',
    faultTypeId: 'NO-HEATING',
    symptoms: 'No heating upstairs, radiators cold since last night.',
    say: "The Whelans are past MOS's 1-year plumbing warranty, but their builder, Kildare Meadows, gives a 2-year warranty. Watch: MOS still attends, but the call-out is chargeable to the builder, not the homeowner — \"Builders Warranties are longer than our 1 year Plumbing Warranty\" (Aftercare Call Guide, over 1 year).",
  },
  {
    id: 'chargeable-homeowner',
    label: '▶ Demo: chargeable to homeowner',
    customerName: 'Cian Murphy',
    faultTypeId: 'LEAK-INGRESS',
    leakChecklist: {},
    symptoms: 'Pipe leak under the kitchen sink, dripping steadily.',
    say: "Cian Murphy is past both MOS's and the builder's warranty windows, and this is a genuine internal plumbing leak — not a snagging item. Watch: it's flagged chargeable to the homeowner, and they're told the cost before anyone travels.",
  },
];

async function runIntakeDemo(cfg) {
  const site = state.sites.find((s) => s.customerName === cfg.customerName);
  if (!site) return;
  state.intake.site = site;
  state.intake.siteQuery = cfg.customerName;
  state.intake.lastFaultTypeId = cfg.faultTypeId;
  const payload = {
    siteId: site.siteId,
    channel: 'web-form',
    faultTypeId: cfg.faultTypeId,
    errorCode: cfg.errorCode || '',
    serialNumber: cfg.serialNumber || '',
    photos: ['demo-photo.jpg'],
    symptoms: cfg.symptoms || '',
    leakChecklist: cfg.leakChecklist || {},
    serviceCertsProvided: !!cfg.serviceCertsProvided,
    builderIfKnown: site.builderName,
  };
  const { ticket } = await api('/api/tickets', { method: 'POST', body: JSON.stringify(payload) });
  state.intake.lastResult = ticket;
  state.tickets.unshift(ticket);
  state.demoNote = { view: 'intake', title: 'Say this', text: cfg.say };
  render();
}

function renderIntakeView() {
  const page = el('div', { class: 'stack' });

  page.appendChild(
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel-body' }, [
        el('div', { class: 'actions-row' }, [
          ...INTAKE_DEMOS.map((cfg) =>
            el('button', {
              class: 'btn secondary',
              onclick: async () => {
                try {
                  await runIntakeDemo(cfg);
                } catch (err) {
                  alert(err.message);
                }
              },
              text: cfg.label,
            })
          ),
          el('button', { class: 'btn secondary', onclick: () => resetDemoData(), text: 'Reset demo data' }),
        ]),
      ]),
    ])
  );
  const dn = demoNoteBanner('intake');
  if (dn) page.appendChild(dn);

  const wrap = el('div', { class: 'split' });
  page.appendChild(wrap);

  // ---- step 1: find the house
  const searchPanel = el('div', { class: 'panel' });
  searchPanel.appendChild(el('div', { class: 'panel-header' }, el('h2', { text: '1 · Find the house' })));
  const searchBody = el('div', { class: 'panel-body stack' });
  const searchInput = el('input', {
    type: 'search',
    placeholder: 'Search by address, name or phone…',
    value: state.intake.siteQuery,
    oninput: (e) => { state.intake.siteQuery = e.target.value; renderIntakeResults(resultsList); },
  });
  searchBody.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Search' }), searchInput]));
  const resultsList = el('div', { class: 'stack' });
  searchBody.appendChild(resultsList);
  searchPanel.appendChild(searchBody);
  wrap.appendChild(searchPanel);
  renderIntakeResults(resultsList);

  // ---- step 2: guided fault form
  wrap.appendChild(renderIntakeForm());

  return page;
}

function renderIntakeResults(container) {
  container.textContent = '';
  const q = state.intake.siteQuery.toLowerCase();
  const matches = state.sites.filter(
    (s) => !q || s.address.toLowerCase().includes(q) || s.customerName.toLowerCase().includes(q) || s.phone.includes(q)
  );
  for (const site of matches.slice(0, 9)) {
    const card = el(
      'div',
      { class: `site-card${state.intake.site && state.intake.site.siteId === site.siteId ? ' selected' : ''}`, onclick: () => { state.intake.site = site; render(); } },
      [
        el('div', { class: 'name', text: site.customerName }),
        el('div', { class: 'addr', text: `${site.address} · ${site.phone}` }),
      ]
    );
    container.appendChild(card);
  }
  if (matches.length === 0) container.appendChild(el('div', { class: 'empty-state', text: 'No matching site.' }));
}

function renderIntakeForm() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-header' }, el('h2', { text: '2 · Log the fault' })));
  const body = el('div', { class: 'panel-body stack' });
  const site = state.intake.site;

  if (!site) {
    body.appendChild(el('div', { class: 'empty-state', text: 'Select a house on the left to continue.' }));
    panel.appendChild(body);
    return panel;
  }

  const mosWarrantyEnd = site.commissioningDate ? addMonthsIso(site.commissioningDate, site.mosWarrantyMonths ?? 12) : null;
  const builderWarrantyEnd = site.commissioningDate && site.builderWarrantyMonths ? addMonthsIso(site.commissioningDate, site.builderWarrantyMonths) : null;
  body.appendChild(
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'System' }), el('dd', { text: `${site.systemType} — ${site.manufacturer} ${site.modelNumber}` }),
      el('dt', { text: 'Builder' }), el('dd', { text: site.builderName }),
      el('dt', { text: 'Commissioned' }), el('dd', { text: site.commissioningDate || 'MISSING' }),
      el('dt', { text: 'MOS plumbing warranty' }), el('dd', { text: mosWarrantyEnd ? `expires ${mosWarrantyEnd}` : '—' }),
      el('dt', { text: 'Builder warranty' }), el('dd', { text: builderWarrantyEnd ? `expires ${builderWarrantyEnd}` : 'none beyond MOS\'s' }),
    ])
  );
  if (!site.commissioningDate) {
    body.appendChild(el('div', { class: 'callout callout-warn' }, [el('strong', { text: 'No commissioning date on file' }), el('span', { text: '"Always check warranty date before sending anyone" — this ticket will be routed for manual verification instead of an automatic party assignment.' })]));
  }

  const faultSelect = el(
    'select',
    { id: 'intake-fault', onchange: () => renderLeakOrHeatPumpFields() },
    Object.entries(state.reference.faultTypes).map(([id, ft]) => el('option', { value: id, text: ft.label, selected: id === state.intake.lastFaultTypeId || undefined }))
  );
  body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Main issue' }), faultSelect]));

  const extraFieldsContainer = el('div', { class: 'stack', id: 'intake-extra-fields' });
  body.appendChild(extraFieldsContainer);

  function renderLeakOrHeatPumpFields() {
    extraFieldsContainer.textContent = '';
    const faultTypeId = faultSelect.value;
    const faultType = state.reference.faultTypes[faultTypeId];

    if (faultTypeId === 'LEAK-INGRESS') {
      const checklistBox = el('div', { class: 'field' }, [
        el('label', { text: 'Builder / snagging checklist (Aftercare Call Triage Guide)' }),
        el('div', { class: 'hint', text: 'A "yes" to any of these means Builder/Snagging attends first, regardless of warranty.' }),
      ]);
      for (const [key, label] of Object.entries(state.reference.leakSnaggingChecklist)) {
        const cb = el('input', { type: 'checkbox', id: `leak-${key}` });
        cb.dataset.checklistKey = key;
        checklistBox.appendChild(el('div', { class: 'checkbox-row' }, [cb, el('label', { for: `leak-${key}`, text: label })]));
      }
      extraFieldsContainer.appendChild(checklistBox);
    }

    if (faultTypeId === 'HEAT-PUMP-FAULT') {
      extraFieldsContainer.appendChild(
        el('div', { class: 'field' }, [
          el('label', { text: 'Error code' }),
          el('input', { type: 'text', id: 'intake-error-code', placeholder: 'e.g. H12, F41' }),
          el('div', { class: 'hint', text: '"H-" = hydraulic, plumber required. "F-" or "F Gas" = warranty call required (Heat Pump Decision Tree).' }),
        ])
      );
      extraFieldsContainer.appendChild(
        el('div', { class: 'field' }, [el('label', { text: 'Serial number' }), el('input', { type: 'text', id: 'intake-serial', placeholder: 'From the unit data plate' })])
      );
      const certsCb = el('input', { type: 'checkbox', id: 'intake-service-certs' });
      extraFieldsContainer.appendChild(
        el('div', { class: 'field' }, [
          el('div', { class: 'checkbox-row' }, [certsCb, el('label', { for: 'intake-service-certs', text: 'Annual service certificates provided by the homeowner' })]),
          el('div', { class: 'hint', text: 'Required before a Heat Merchants supplier warranty call can be logged.' }),
        ])
      );
    }

    extraFieldsContainer.appendChild(
      el('div', { class: 'field' }, [
        el('label', { text: 'Photos / videos' }),
        el('input', { type: 'file', id: 'intake-photos', multiple: true, accept: 'image/*,video/*' }),
        el('div', { class: 'hint', text: faultType.examples ? `Examples: ${faultType.examples}` : '' }),
      ])
    );
  }
  renderLeakOrHeatPumpFields();

  body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Symptoms / customer description' }), el('textarea', { id: 'intake-symptoms', placeholder: 'What did the customer describe?' })]));
  body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Builder (if known)' }), el('input', { type: 'text', id: 'intake-builder', value: site.builderName || '', placeholder: 'Main contractor / developer' })]));

  const submitBtn = el('button', {
    class: 'btn',
    onclick: async () => {
      const faultTypeId = faultSelect.value;
      state.intake.lastFaultTypeId = faultTypeId;
      const leakChecklist = {};
      document.querySelectorAll('#intake-extra-fields input[type="checkbox"][data-checklist-key]').forEach((cb) => {
        if (cb.checked) leakChecklist[cb.dataset.checklistKey] = true;
      });
      const errorCodeInput = document.getElementById('intake-error-code');
      const serialInput = document.getElementById('intake-serial');
      const certsInput = document.getElementById('intake-service-certs');
      const photoInput = document.getElementById('intake-photos');
      const symptomsInput = document.getElementById('intake-symptoms');
      const builderInput = document.getElementById('intake-builder');

      const payload = {
        siteId: site.siteId,
        channel: 'web-form',
        faultTypeId,
        errorCode: errorCodeInput ? errorCodeInput.value.trim() : '',
        serialNumber: serialInput ? serialInput.value.trim() : '',
        photos: Array.from((photoInput && photoInput.files) || []).map((f) => f.name),
        symptoms: symptomsInput.value.trim(),
        leakChecklist,
        serviceCertsProvided: certsInput ? certsInput.checked : false,
        builderIfKnown: builderInput.value.trim(),
      };
      try {
        const { ticket } = await api('/api/tickets', { method: 'POST', body: JSON.stringify(payload) });
        state.intake.lastResult = ticket;
        state.tickets.unshift(ticket);
        render();
      } catch (err) {
        alert(err.message);
      }
    },
    text: 'Create ticket',
  });
  body.appendChild(el('div', { class: 'actions-row' }, [submitBtn]));

  if (state.intake.lastResult) {
    const t = state.intake.lastResult;
    body.appendChild(
      el('div', { class: 'callout callout-ok' }, [
        el('strong', { text: `Ticket ${t.ticketId} created — ${partyLabel(t.assignedParty)}` }),
        el('span', { text: t.explanation }),
      ])
    );
    body.appendChild(
      el('button', {
        class: 'btn secondary',
        onclick: () => { state.selectedTicketId = t.ticketId; state.intake = { site: null, siteQuery: '', lastResult: null }; document.querySelector('[data-view="queue"]').click(); },
        text: 'View in queue',
      })
    );
  }

  panel.appendChild(body);
  return panel;
}

// -------------------------------------------------------------------------- voice intake view

const VOICE_DEMOS = [
  {
    id: 'confident',
    label: '▶ Demo: confident match',
    transcript: "Hi it's Maura Kelly, no hot water since this morning, my number is 086 555 0102",
    say: 'This is what a phone-call transcript looks like. Watch: the house, fault type, and phone number are all extracted with confidence scores, ready for one-click review — never created as a ticket automatically.',
  },
  {
    id: 'snagging',
    label: '▶ Demo: snagging keyword',
    transcript: "Hi, it's Fiona Doyle, there is water coming in around the roof after the last storm, quite a lot of it",
    say: 'The word "roof" is on the builder/snagging checklist. Watch: the extractor flags it as a likely snagging item even from a rough transcript, so the office admin knows to route it to the builder before dispatching a plumber.',
  },
];

async function runVoiceDemo(cfg) {
  state.voice.transcript = cfg.transcript;
  state.voice.draft = await api('/api/voice-intake', { method: 'POST', body: JSON.stringify({ transcript: cfg.transcript }) });
  state.demoNote = { view: 'voice', title: 'Say this', text: cfg.say };
  render();
}

function renderVoiceView() {
  const page = el('div', { class: 'stack' });

  page.appendChild(
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel-body' }, [
        el('div', { class: 'actions-row' }, [
          ...VOICE_DEMOS.map((cfg) =>
            el('button', {
              class: 'btn secondary',
              onclick: async () => {
                try {
                  await runVoiceDemo(cfg);
                } catch (err) {
                  alert(err.message);
                }
              },
              text: cfg.label,
            })
          ),
          el('button', { class: 'btn secondary', onclick: () => resetDemoData(), text: 'Reset demo data' }),
        ]),
      ]),
    ])
  );
  const dn = demoNoteBanner('voice');
  if (dn) page.appendChild(dn);

  const wrap = el('div', { class: 'split' });
  page.appendChild(wrap);

  const left = el('div', { class: 'panel' });
  left.appendChild(el('div', { class: 'panel-header' }, el('h2', { text: 'Call / voice transcript' })));
  const leftBody = el('div', { class: 'panel-body stack' });

  leftBody.appendChild(
    el('div', { class: 'callout callout-info' }, [
      el('strong', { text: 'How this works' }),
      el('span', { text: 'Speak or paste what the customer said. This extracts a draft — it never creates a ticket on its own; an office admin reviews and confirms it first.' }),
    ])
  );

  const transcriptArea = el('textarea', {
    id: 'voice-transcript',
    placeholder: 'e.g. "Hi it\'s Maura Kelly, no hot water since this morning, my number is 086 555 0102"',
  });
  transcriptArea.value = state.voice.transcript;
  transcriptArea.addEventListener('input', (e) => { state.voice.transcript = e.target.value; });
  leftBody.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Transcript' }), transcriptArea]));

  const supportsSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  const micBtn = el('button', {
    class: 'btn secondary',
    disabled: !supportsSpeech || undefined,
    onclick: () => toggleSpeechRecognition(transcriptArea, micBtn),
    text: supportsSpeech ? (state.voice.listening ? 'Stop listening' : 'Start speaking') : 'Voice capture not supported in this browser',
  });
  const extractBtn = el('button', {
    class: 'btn',
    onclick: async () => {
      state.voice.draft = await api('/api/voice-intake', { method: 'POST', body: JSON.stringify({ transcript: transcriptArea.value }) });
      render();
    },
    text: 'Extract details',
  });
  leftBody.appendChild(el('div', { class: 'actions-row' }, [micBtn, extractBtn]));
  left.appendChild(leftBody);
  wrap.appendChild(left);

  wrap.appendChild(renderVoiceDraft());
  return page;
}

function toggleSpeechRecognition(textarea, button) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  if (!window.__recognition) {
    window.__recognition = new SpeechRecognition();
    window.__recognition.continuous = true;
    window.__recognition.interimResults = false;
    window.__recognition.onresult = (event) => {
      let text = textarea.value;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += (text ? ' ' : '') + event.results[i][0].transcript;
      }
      textarea.value = text;
      state.voice.transcript = text;
    };
    window.__recognition.onend = () => { state.voice.listening = false; button.textContent = 'Start speaking'; };
  }
  if (state.voice.listening) {
    window.__recognition.stop();
    state.voice.listening = false;
    button.textContent = 'Start speaking';
  } else {
    window.__recognition.start();
    state.voice.listening = true;
    button.textContent = 'Stop listening';
  }
}

function renderVoiceDraft() {
  const panel = el('div', { class: 'panel' });
  panel.appendChild(el('div', { class: 'panel-header' }, el('h2', { text: 'Extracted draft' })));
  const body = el('div', { class: 'panel-body stack' });
  const draft = state.voice.draft;

  if (!draft) {
    body.appendChild(el('div', { class: 'empty-state', text: 'Nothing extracted yet.' }));
    panel.appendChild(body);
    return panel;
  }

  const site = draft.site ? state.sites.find((s) => s.siteId === draft.site.siteId) : null;

  if (draft.leakChecklistHits && draft.leakChecklistHits.length > 0) {
    body.appendChild(
      el('div', { class: 'callout callout-warn' }, [
        el('strong', { text: 'Likely builder / snagging item' }),
        el('span', { text: `Mentions "${draft.leakChecklistHits.map((k) => state.reference.leakSnaggingChecklist[k]).join('", "')}" — on the Triage Guide's checklist. Confirm with the caller before dispatching a plumber.` }),
      ])
    );
  }

  const kv = [
    el('dt', { text: 'Matched site' }), el('dd', { text: site ? `${site.customerName} (${Math.round(draft.site.score * 100)}% confidence)` : 'No confident match' }),
    el('dt', { text: 'Main issue' }), el('dd', { text: `${faultLabel(draft.faultType.value)} (${Math.round(draft.faultType.score * 100)}% confidence)` }),
    el('dt', { text: 'Error code found' }), el('dd', { text: draft.errorCode || '—' }),
  ];
  if (draft.errorCodeMeaning) {
    kv.push(el('dt', { text: 'Error code meaning' }), el('dd', { text: draft.errorCodeMeaning }));
  }
  body.appendChild(el('dl', { class: 'kv' }, kv));

  if (draft.requiresHumanReview) {
    body.appendChild(
      el('div', { class: 'callout callout-warn' }, [
        el('strong', { text: 'Needs human review' }),
        el('span', { text: 'Confidence is low, or the site could not be confidently matched. An office admin must confirm the details below before a ticket is created.' }),
      ])
    );
  }

  const useBtn = el('button', {
    class: 'btn',
    disabled: !site || undefined,
    onclick: () => {
      state.intake.site = site;
      state.intake.siteQuery = site.customerName;
      state.intake.lastResult = null;
      document.querySelector('[data-view="intake"]').click();
      setTimeout(() => {
        const faultSelect = document.getElementById('intake-fault');
        if (faultSelect) {
          faultSelect.value = draft.faultType.value;
          faultSelect.dispatchEvent(new Event('change'));
        }
        setTimeout(() => {
          const errorCodeInput = document.getElementById('intake-error-code');
          const symptomsInput = document.getElementById('intake-symptoms');
          if (errorCodeInput && draft.errorCode) errorCodeInput.value = draft.errorCode;
          if (symptomsInput) symptomsInput.value = draft.transcript;
          for (const key of Object.keys(draft.leakChecklist || {})) {
            const cb = document.getElementById(`leak-${key}`);
            if (cb) cb.checked = true;
          }
        }, 0);
      }, 0);
    },
    text: 'Review in guided form →',
  });
  body.appendChild(el('div', { class: 'actions-row' }, [useBtn]));

  panel.appendChild(body);
  return panel;
}

// -------------------------------------------------------------------------- overview view

function renderOverviewView() {
  const wrap = el('div', { class: 'stack' });

  const open = state.tickets.filter((t) => t.state !== 'Closed' && t.state !== 'Resolved');
  const chargeableBuilder = state.tickets.filter((t) => t.chargeable === true && t.chargeParty === 'builder');
  const chargeableHomeowner = state.tickets.filter((t) => t.chargeable === true && t.chargeParty === 'homeowner');
  const incomplete = state.tickets.filter((t) => t.dataQuality === 'incomplete');
  const repeat = state.tickets.filter((t) => t.repeatFault);

  wrap.appendChild(
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel-body' }, [
        el('div', { class: 'actions-row' }, [
          el('button', {
            class: 'btn secondary',
            onclick: () => {
              state.demoNote = {
                view: 'overview',
                title: 'Say this',
                text: `Right now: ${open.length} open ticket(s), ${chargeableBuilder.length} chargeable to a builder, ${chargeableHomeowner.length} chargeable to a homeowner, ${incomplete.length} missing required evidence, and ${repeat.length} flagged as a repeat fault. This is the recharge position MOS's own pitch asks for at month end. These update live — go create or resolve a ticket on another tab and come back to watch these change.`,
              };
              render();
            },
            text: '▶ Run demo: explain these numbers',
          }),
          el('button', { class: 'btn secondary', onclick: () => resetDemoData(), text: 'Reset demo data' }),
        ]),
      ]),
    ])
  );
  const dn = demoNoteBanner('overview');
  if (dn) wrap.appendChild(dn);

  const cards = el('div', { class: 'card-grid' }, [
    statCard(open.length, 'Open tickets'),
    statCard(chargeableBuilder.length, 'Chargeable to builder'),
    statCard(chargeableHomeowner.length, 'Chargeable to homeowner'),
    statCard(incomplete.length, 'Missing evidence'),
    statCard(repeat.length, 'Repeat-fault flags'),
  ]);
  wrap.appendChild(cards);

  const byParty = {};
  for (const t of state.tickets) byParty[t.assignedParty] = (byParty[t.assignedParty] || 0) + 1;

  const tablePanel = el('div', { class: 'panel' });
  tablePanel.appendChild(el('div', { class: 'panel-header' }, el('h2', { text: 'Tickets by party' })));
  const table = el('table', { class: 'simple' }, [
    el('thead', {}, el('tr', {}, [el('th', { text: 'Party' }), el('th', { text: 'Tickets' })])),
    el(
      'tbody',
      {},
      Object.entries(byParty).map(([partyId, count]) => el('tr', {}, [el('td', { text: partyLabel(partyId) }), el('td', { text: String(count) })]))
    ),
  ]);
  tablePanel.appendChild(el('div', { class: 'panel-body' }, table));
  wrap.appendChild(tablePanel);

  const byHouse = {};
  for (const t of state.tickets) {
    const site = state.sites.find((s) => s.siteId === t.siteId);
    const key = site ? site.customerName : t.siteId;
    byHouse[key] = (byHouse[key] || 0) + 1;
  }
  const repeatHouses = Object.entries(byHouse).filter(([, count]) => count >= 2);
  if (repeatHouses.length > 0) {
    const repeatPanel = el('div', { class: 'panel' });
    repeatPanel.appendChild(el('div', { class: 'panel-header' }, el('h2', { text: 'Houses we keep going back to' })));
    const repeatTable = el('table', { class: 'simple' }, [
      el('thead', {}, el('tr', {}, [el('th', { text: 'House' }), el('th', { text: 'Calls' })])),
      el('tbody', {}, repeatHouses.map(([name, count]) => el('tr', {}, [el('td', { text: name }), el('td', { text: String(count) })]))),
    ]);
    repeatPanel.appendChild(el('div', { class: 'panel-body' }, repeatTable));
    wrap.appendChild(repeatPanel);
  }

  return wrap;
}

function statCard(num, label) {
  return el('div', { class: 'stat-card' }, [el('div', { class: 'num', text: String(num) }), el('div', { class: 'label', text: label })]);
}

boot().catch((err) => {
  main().appendChild(el('div', { class: 'callout callout-danger' }, [el('strong', { text: 'Failed to load' }), el('span', { text: err.message })]));
});
