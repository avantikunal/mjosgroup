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
  if (ticket.chargeable === true) return el('span', { class: 'badge badge-charge', text: 'Chargeable' });
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
                  state.tickets.find((t) => t.requiresHumanCallback) ||
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
  const calloutClass = ticket.aiMode === 'prohibited' ? 'callout-danger' : ticket.dataQuality === 'incomplete' ? 'callout-warn' : 'callout-info';
  body.appendChild(
    el('div', { class: `callout ${calloutClass}` }, [
      el('strong', { text: `${partyLabel(ticket.assignedParty)} — rule ${ticket.ruleId}` }),
      el('span', { text: ticket.explanation }),
    ])
  );

  if (ticket.requiresHumanCallback) {
    body.appendChild(
      el('div', { class: 'callout callout-danger' }, [
        el('strong', { text: 'Human callback required' }),
        el('span', { text: 'This category can never be closed by automation. A person must phone the customer back.' }),
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
  body.appendChild(
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Customer' }), el('dd', { text: site ? `${site.customerName} · ${site.phone}` : '—' }),
      el('dt', { text: 'Address' }), el('dd', { text: site ? site.address : '—' }),
      el('dt', { text: 'System' }), el('dd', { text: site ? `${site.systemType} — ${site.manufacturer} ${site.modelNumber}` : '—' }),
      el('dt', { text: 'Installed by' }), el('dd', { text: site ? site.installedBy : '—' }),
      el('dt', { text: 'Commissioned' }), el('dd', { text: site ? (site.commissioningDate || 'MISSING — see rule above') : '—' }),
      el('dt', { text: 'Warranty (parts/labour)' }), el('dd', { text: site ? `${site.warrantyPartsMonths}mo / ${site.warrantyLabourMonths}mo` : '—' }),
      el('dt', { text: 'Service contract' }), el('dd', { text: site && site.serviceContract.active ? `Active — ${site.serviceContract.plan}` : 'None' }),
    ])
  );

  body.appendChild(el('div', { class: 'section-title', text: 'Reported fault' }));
  body.appendChild(
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Channel' }), el('dd', { text: ticket.channel }),
      el('dt', { text: 'Reported' }), el('dd', { text: fmtDate(ticket.openedAt) }),
      el('dt', { text: 'Error code' }), el('dd', { text: ticket.errorCode || '—' }),
      el('dt', { text: 'Photos attached' }), el('dd', { text: String(ticket.photos.length) }),
      el('dt', { text: 'Symptoms' }), el('dd', { text: ticket.symptoms || '—' }),
      el('dt', { text: 'Charge' }), el('dd', {}, chargeBadge(ticket)),
    ])
  );

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

async function refreshTickets() {
  const resp = await api('/api/tickets');
  state.tickets = resp.tickets;
  render();
}

// -------------------------------------------------------------------------- guided intake view

const INTAKE_DEMOS = [
  {
    id: 'data-gap',
    label: '▶ Demo: data-gap safeguard',
    customerName: 'Grainne Lynch',
    faultTypeId: 'MVHR-FILTER',
    symptoms: 'Ventilation unit making noise, unsure if still under warranty.',
    say: "Grainne Lynch's house has no commissioning date on file — a real gap the spreadsheet process leaves open today. Watch: instead of guessing a warranty outcome, the ticket is routed to back-office for manual verification.",
  },
  {
    id: 'mfr-warranty',
    label: '▶ Demo: manufacturer warranty',
    customerName: 'Aidan Byrne',
    faultTypeId: 'HP-FAULT',
    errorCode: 'E4',
    symptoms: 'Outdoor unit flashing red light, no heat.',
    say: "Aidan Byrne's heat pump has an error code and is still inside its parts warranty window. Watch: it's automatically assigned as a manufacturer warranty claim — not billed to MOS or the customer.",
  },
  {
    id: 'chargeable',
    label: '▶ Demo: chargeable repair',
    customerName: 'Sean & Orla Whelan',
    faultTypeId: 'HEAT-INTERMIT',
    symptoms: 'Heating cuts out intermittently, especially in the evening.',
    say: "The Whelans' heat pump is out of warranty with no service contract — a common source of billing disputes today. Watch: it's correctly flagged chargeable up front, before anyone drives out to the job.",
  },
];

async function runIntakeDemo(cfg) {
  const site = state.sites.find((s) => s.customerName === cfg.customerName);
  if (!site) return;
  state.intake.site = site;
  state.intake.siteQuery = cfg.customerName;
  const payload = {
    siteId: site.siteId,
    channel: 'web-form',
    faultTypeId: cfg.faultTypeId,
    errorCode: cfg.errorCode || '',
    photos: [],
    symptoms: cfg.symptoms || '',
    gasSmell: false,
    coAlarm: false,
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
  for (const site of matches.slice(0, 8)) {
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

  body.appendChild(
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'System' }), el('dd', { text: `${site.systemType} — ${site.manufacturer} ${site.modelNumber}` }),
      el('dt', { text: 'Installed by' }), el('dd', { text: site.installedBy }),
      el('dt', { text: 'Commissioned' }), el('dd', { text: site.commissioningDate || 'MISSING' }),
      el('dt', { text: 'Warranty (parts/labour)' }), el('dd', { text: `${site.warrantyPartsMonths}mo / ${site.warrantyLabourMonths}mo` }),
      el('dt', { text: 'Service contract' }), el('dd', { text: site.serviceContract.active ? `Active — ${site.serviceContract.plan}` : 'None' }),
    ])
  );
  if (!site.commissioningDate) {
    body.appendChild(el('div', { class: 'callout callout-warn' }, [el('strong', { text: 'No commissioning date on file' }), el('span', { text: 'This ticket will be routed for manual warranty verification instead of an automatic party assignment.' })]));
  }
  if (site.vulnerableOccupant) {
    body.appendChild(el('div', { class: 'callout callout-info' }, [el('strong', { text: 'Vulnerable occupant flag' }), el('span', { text: 'Prioritise a no-heat/no-hot-water report from this address.' })]));
  }

  const faultSelect = el(
    'select',
    { id: 'intake-fault' },
    Object.entries(state.reference.faultTypes).map(([id, ft]) => el('option', { value: id, text: ft.label }))
  );
  const errorCodeInput = el('input', { type: 'text', id: 'intake-error-code', placeholder: 'e.g. E7, F28' });
  const photoInput = el('input', { type: 'file', id: 'intake-photos', multiple: true, accept: 'image/*' });
  const symptomsInput = el('textarea', { id: 'intake-symptoms', placeholder: 'What did the customer describe?' });
  const gasCheckbox = el('input', { type: 'checkbox', id: 'intake-gas' });
  const coCheckbox = el('input', { type: 'checkbox', id: 'intake-co' });

  body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Fault type' }), faultSelect]));
  body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Error code (if shown on the unit)' }), errorCodeInput]));
  body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Photos' }), photoInput, el('div', { class: 'hint', text: 'Attach photos of the fault display or the affected area where possible.' })]));
  body.appendChild(el('div', { class: 'field' }, [el('label', { text: 'Symptoms / customer description' }), symptomsInput]));
  body.appendChild(
    el('div', { class: 'field' }, [
      el('div', { class: 'checkbox-row danger' }, [gasCheckbox, el('label', { for: 'intake-gas', text: 'Customer reports a gas smell' })]),
      el('div', { class: 'checkbox-row danger' }, [coCheckbox, el('label', { for: 'intake-co', text: 'Carbon monoxide alarm has activated' })]),
    ])
  );

  const submitBtn = el('button', {
    class: 'btn',
    onclick: async () => {
      const payload = {
        siteId: site.siteId,
        channel: 'web-form',
        faultTypeId: faultSelect.value,
        errorCode: errorCodeInput.value.trim(),
        photos: Array.from(photoInput.files || []).map((f) => f.name),
        symptoms: symptomsInput.value.trim(),
        gasSmell: gasCheckbox.checked,
        coAlarm: coCheckbox.checked,
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
    transcript: "Hi it's Maura Kelly, no hot water since this morning, my number is 087 555 0102",
    say: 'This is what a phone-call transcript looks like. Watch: the house, fault type, and phone number are all extracted with confidence scores, ready for one-click review — never created as a ticket automatically.',
  },
  {
    id: 'safety',
    label: '▶ Demo: safety gate',
    transcript: 'I think I can smell gas near the boiler, please send someone',
    say: 'This is the one that matters most: what happens when gas is mentioned. Watch: it is blocked from automation entirely, regardless of how confident the fault-type match is.',
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
    style: null,
    placeholder: 'e.g. "Hi it\'s Maura Kelly, no hot water since this morning at 087 555 0102"',
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

  if (draft.safetyFlags.gasSmell || draft.safetyFlags.coAlarm) {
    body.appendChild(
      el('div', { class: 'callout callout-danger' }, [
        el('strong', { text: 'Safety flag detected' }),
        el('span', { text: 'A gas smell or CO alarm was mentioned. This can never be auto-processed — end the call by advising the customer to follow gas-safety guidance, and escalate to the on-call engineer immediately.' }),
      ])
    );
  }

  const site = draft.site ? state.sites.find((s) => s.siteId === draft.site.siteId) : null;
  body.appendChild(
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Matched site' }), el('dd', { text: site ? `${site.customerName} (${Math.round(draft.site.score * 100)}% confidence)` : 'No confident match' }),
      el('dt', { text: 'Fault type' }), el('dd', { text: `${faultLabel(draft.faultType.value)} (${Math.round(draft.faultType.score * 100)}% confidence)` }),
      el('dt', { text: 'Error code found' }), el('dd', { text: draft.errorCode || '—' }),
    ])
  );

  if (draft.requiresHumanReview) {
    body.appendChild(
      el('div', { class: 'callout callout-warn' }, [
        el('strong', { text: 'Needs human review' }),
        el('span', { text: 'Confidence is low, the site could not be confidently matched, or a safety flag was raised. An office admin must confirm the details below before a ticket is created.' }),
      ])
    );
  }

  const useBtn = el('button', {
    class: 'btn',
    disabled: (!site || draft.safetyFlags.gasSmell || draft.safetyFlags.coAlarm) || undefined,
    onclick: () => {
      state.intake.site = site;
      state.intake.siteQuery = site.customerName;
      state.intake.lastResult = null;
      state.view = 'intake';
      document.querySelector('[data-view="intake"]').click();
      setTimeout(() => {
        const faultSelect = document.getElementById('intake-fault');
        const errorCodeInput = document.getElementById('intake-error-code');
        const symptomsInput = document.getElementById('intake-symptoms');
        if (faultSelect) faultSelect.value = draft.faultType.value;
        if (errorCodeInput && draft.errorCode) errorCodeInput.value = draft.errorCode;
        if (symptomsInput) symptomsInput.value = draft.transcript;
      }, 0);
    },
    text: draft.safetyFlags.gasSmell || draft.safetyFlags.coAlarm ? 'Blocked — handle as emergency call' : 'Review in guided form →',
  });
  body.appendChild(el('div', { class: 'actions-row' }, [useBtn]));

  panel.appendChild(body);
  return panel;
}

// -------------------------------------------------------------------------- overview view

function renderOverviewView() {
  const wrap = el('div', { class: 'stack' });

  const open = state.tickets.filter((t) => t.state !== 'Closed' && t.state !== 'Resolved');
  const p1 = state.tickets.filter((t) => t.priority === 'P1');
  const chargeable = state.tickets.filter((t) => t.chargeable === true);
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
                text: `Right now: ${open.length} open ticket(s), ${p1.length} at P1 emergency, ${chargeable.length} flagged chargeable, ${incomplete.length} missing required evidence, and ${repeat.length} flagged as a repeat fault. These update live — go create or resolve a ticket on another tab and come back to watch these change.`,
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
    statCard(p1.length, 'P1 emergencies'),
    statCard(chargeable.length, 'Chargeable repairs'),
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

  return wrap;
}

function statCard(num, label) {
  return el('div', { class: 'stat-card' }, [el('div', { class: 'num', text: String(num) }), el('div', { class: 'label', text: label })]);
}

boot().catch((err) => {
  main().appendChild(el('div', { class: 'callout callout-danger' }, [el('strong', { text: 'Failed to load' }), el('span', { text: err.message })]));
});
