(() => {
  const TOKEN_KEY = 'voxdesk_token';
  const PAGES = [
    'overview', 'agents', 'builder', 'simulate', 'calls', 'leads',
    'appointments', 'billing', 'integrations', 'settings',
  ];
  const TITLES = {
    overview: 'Overview',
    agents: 'Agents',
    builder: 'Agent builder',
    simulate: 'Test call',
    calls: 'Calls',
    leads: 'Leads',
    appointments: 'Appointments',
    billing: 'Billing',
    integrations: 'Integrations',
    settings: 'Settings',
  };

  const el = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  let token = localStorage.getItem(TOKEN_KEY) || qs.get('token') || '';
  let authMode = 'login';
  let simHistory = [];
  let loaded = null;
  let agentsCache = [];

  function headers() {
    return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  }
  async function api(path, opts = {}) {
    const res = await fetch('/api' + path, { headers: headers(), ...opts });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      token = '';
      localStorage.removeItem(TOKEN_KEY);
      show('auth');
      throw new Error('unauthorized');
    }
    return data;
  }
  function errText(data) {
    if (!data) return 'Request failed';
    if (data.message) return data.message;
    if (Array.isArray(data.details)) return data.details.join(', ');
    return data.error || JSON.stringify(data);
  }
  function item(title, meta, extra = '') {
    return `<div class="item"><b>${esc(title)}</b><div class="meta">${esc(meta)}</div>${extra}</div>`;
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  function empty(msg) {
    return `<div class="empty">${esc(msg)}</div>`;
  }

  function show(which) {
    el('view-landing').classList.toggle('hidden', which !== 'landing');
    el('view-auth').classList.toggle('hidden', which !== 'auth');
    el('view-app').classList.toggle('hidden', which !== 'app');
  }

  function route() {
    const hash = (location.hash || '#/').replace(/^#\/?/, '');
    if (!token) {
      if (hash === 'login' || hash === 'signup') {
        authMode = hash;
        renderAuth();
        show('auth');
        return;
      }
      show('landing');
      return;
    }
    const page = PAGES.includes(hash) ? hash : 'overview';
    if (location.hash !== '#/' + page) history.replaceState(null, '', '#/' + page);
    show('app');
    el('pageTitle').textContent = TITLES[page];
    document.querySelectorAll('.side .nav[data-route]').forEach((b) => {
      b.classList.toggle('on', b.dataset.route === page);
    });
    PAGES.forEach((p) => el('page-' + p).classList.toggle('hidden', p !== page));
    loadPage(page);
  }

  function renderAuth() {
    const signup = authMode === 'signup';
    el('authTitle').textContent = signup ? 'Create workspace' : 'Log in';
    el('authSub').textContent = signup
      ? 'Your organization is created with a trial plan.'
      : 'Use your workspace email, or the demo account.';
    el('signupFields').classList.toggle('hidden', !signup);
    el('authToggle').textContent = signup ? 'Have an account?' : 'Need an account?';
    el('authSubmit').textContent = signup ? 'Create workspace' : 'Log in';
    el('auPass').autocomplete = signup ? 'new-password' : 'current-password';
  }

  async function afterLogin(tok) {
    token = tok;
    localStorage.setItem(TOKEN_KEY, tok);
    location.hash = '#/overview';
    route();
    bootApp();
  }

  async function submitAuth() {
    el('authMsg').textContent = '';
    try {
      if (authMode === 'signup') {
        const data = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: el('auEmail').value,
            password: el('auPass').value,
            name: el('auName').value,
            orgName: el('auOrg').value,
          }),
        }).then((r) => r.json());
        if (!data.token) {
          el('authMsg').textContent = errText(data);
          return;
        }
        return afterLogin(data.token);
      }
      const data = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: el('auEmail').value, password: el('auPass').value }),
      }).then((r) => r.json());
      if (!data.token) {
        el('authMsg').textContent = data.error === 'invalid_credentials' ? 'Invalid email or password' : errText(data);
        return;
      }
      return afterLogin(data.token);
    } catch (e) {
      el('authMsg').textContent = (e && e.message) || 'Network error';
    }
  }

  async function demoLogin() {
    el('auEmail').value = 'owner@demo.voxdesk.local';
    el('auPass').value = 'DemoPass123';
    authMode = 'login';
    renderAuth();
    show('auth');
    await submitAuth();
  }

  async function bootApp() {
    try {
      const h = await fetch('/api/health').then((r) => r.json());
      el('healthPill').textContent = h.ok ? 'online' : 'error';
    } catch {
      el('healthPill').textContent = 'offline';
    }
    try {
      const me = await api('/auth/me');
      el('orgPill').textContent = me.org?.name || me.org?.id || 'workspace';
      el('planPill').textContent = 'plan ' + (me.org?.plan || 'trial');
    } catch { /* unauth handled */ }
    const t = await api('/templates');
    el('template').innerHTML = (t.templates || []).map((x) =>
      `<option value="${esc(x.id)}">${esc(x.name)} — ${esc(x.industry)}</option>`
    ).join('');
  }

  function fillAgentSelects() {
    const opts = agentsCache.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    el('simAgent').innerHTML = opts;
    el('editAgent').innerHTML = opts;
  }

  async function loadAgents() {
    const { agents } = await api('/agents');
    agentsCache = agents || [];
    fillAgentSelects();
    el('agents').innerHTML = agentsCache.length
      ? agentsCache.map((a) => item(
        a.name,
        `${a.status} · v${a.version} · ${a.id}`,
        a.status !== 'live'
          ? `<div style="margin-top:8px"><button class="sec" data-pub="${esc(a.id)}">Publish</button></div>`
          : '',
      )).join('')
      : empty('No agents yet. Create one from a template.');
    document.querySelectorAll('[data-pub]').forEach((b) => {
      b.onclick = async () => {
        await api('/agents/' + b.dataset.pub + '/publish', { method: 'POST' });
        loadAgents();
      };
    });
  }

  async function loadCallsList(target, limit = 40) {
    const { calls } = await api('/calls');
    const rows = (calls || []).slice().reverse().slice(0, limit);
    target.innerHTML = rows.length
      ? rows.map((c) => item(
        `${c.direction} ${c.from} → ${c.to}`,
        `${c.outcome || 'in progress'} · ${c.durationSec || 0}s · ${c.startedAt || ''}`,
      )).join('')
      : empty('No calls yet.');
    return calls || [];
  }

  async function loadLeadsList(target, limit = 40) {
    const { leads } = await api('/leads');
    const rows = (leads || []).slice().reverse().slice(0, limit);
    target.innerHTML = rows.length
      ? rows.map((l) => item(l.name || 'Unknown', `score ${l.score || 0} · ${l.service || ''} ${l.phone || ''}`)).join('')
      : empty('No leads yet.');
  }

  async function loadApts() {
    const { appointments } = await api('/appointments');
    const rows = (appointments || []).slice().reverse();
    el('apts').innerHTML = rows.length
      ? rows.map((a) => item(
        a.service,
        `${a.status} · ${a.startsAt}`,
        a.status !== 'cancelled'
          ? `<div style="margin-top:8px"><button class="danger" data-cancel="${esc(a.id)}">Cancel</button></div>`
          : '',
      )).join('')
      : empty('No appointments yet.');
    document.querySelectorAll('[data-cancel]').forEach((b) => {
      b.onclick = async () => {
        await api('/appointments/' + b.dataset.cancel + '/cancel', { method: 'POST' });
        loadApts();
      };
    });
  }

  async function loadOverview() {
    const an = await api('/analytics/summary');
    const t = an.totals || {};
    el('metrics').innerHTML = [
      ['Calls', t.calls ?? 0],
      ['Leads', t.leads ?? 0],
      ['Appointments', t.appointments ?? 0],
      ['Booking rate', (((an.rates || {}).bookingRate || 0) * 100).toFixed(0) + '%'],
    ].map(([k, v]) => `<div class="card metric"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('');
    loadCallsList(el('ovCalls'), 6);
    loadLeadsList(el('ovLeads'), 6);
  }

  async function loadBilling() {
    const s = await api('/billing/status');
    el('planPill').textContent = 'plan ' + (s.plan || 'trial');
    const u = s.usage || {};
    el('usage').innerHTML =
      `<p>Plan <b>${esc(s.plan)}</b></p>
       <p>Minutes ${(u.callMinutes || 0) + (u.outboundMinutes || 0)} / ${u.limits?.monthlyMinutes ?? '—'}</p>
       <p>Agents ${u.agents ?? '—'} · numbers ${u.numbers ?? '—'}</p>`;
    el('analytics').textContent = JSON.stringify(await api('/analytics/summary'), null, 2);
  }

  async function loadIntegrations() {
    const ints = await api('/integrations');
    el('ints').innerHTML = (ints.integrations || []).length
      ? ints.integrations.map((i) => item(i.type, i.connected ? 'connected' : 'incomplete')).join('')
      : empty('No integrations yet.');
  }

  async function loadSettings() {
    const m = await api('/org/members');
    el('members').innerHTML = (m.members || []).map((u) => item(u.email, `${u.role} · ${u.name || ''}`)).join('') || empty('No members.');
    const k = await api('/keys');
    el('keys').innerHTML = (k.keys || []).map((x) => item(x.name, x.prefix)).join('') || empty('No API keys.');
  }

  async function loadPage(page) {
    try {
      if (page === 'overview') return loadOverview();
      if (page === 'agents' || page === 'builder' || page === 'simulate') return loadAgents();
      if (page === 'calls') return loadCallsList(el('calls'));
      if (page === 'leads') return loadLeadsList(el('leads'));
      if (page === 'appointments') return loadApts();
      if (page === 'billing') return loadBilling();
      if (page === 'integrations') return loadIntegrations();
      if (page === 'settings') return loadSettings();
    } catch (e) {
      console.warn(e);
    }
  }

  function renderChat() {
    el('chat').innerHTML = simHistory.map((m) =>
      `<div class="msg ${m.role}"><b>${m.role === 'user' ? 'Caller' : 'Agent'}:</b> ${esc(m.content)}</div>`
    ).join('');
    el('chat').scrollTop = el('chat').scrollHeight;
  }

  // wiring
  el('goLogin').onclick = () => { location.hash = '#/login'; };
  el('goSignup').onclick = el('heroSignup').onclick = () => { location.hash = '#/signup'; };
  el('heroDemo').onclick = demoLogin;
  el('authToggle').onclick = () => {
    authMode = authMode === 'login' ? 'signup' : 'login';
    location.hash = '#/' + authMode;
    renderAuth();
  };
  el('authSubmit').onclick = submitAuth;
  el('auPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
  el('logout').onclick = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    token = '';
    localStorage.removeItem(TOKEN_KEY);
    location.hash = '#/';
    route();
  };
  document.querySelectorAll('.side .nav[data-route]').forEach((b) => {
    b.onclick = () => { location.hash = '#/' + b.dataset.route; };
  });

  el('createAgent').onclick = async () => {
    const body = { templateId: el('template').value };
    if (el('newAgentName').value.trim()) body.name = el('newAgentName').value.trim();
    const a = await api('/agents', { method: 'POST', body: JSON.stringify(body) });
    el('createMsg').textContent = a.id ? `Created ${a.name}` : errText(a);
    loadAgents();
  };

  el('loadAgent').onclick = async () => {
    const a = await api('/agents/' + el('editAgent').value);
    loaded = a;
    const d = a.definition;
    el('edName').value = a.name;
    el('edGreeting').value = d.greeting;
    el('edPersona').value = d.persona;
    el('edQuestions').value = (d.qualifyingQuestions || []).join('\n');
    el('edKb').value = (d.knowledgeBase || []).map((e) => e.question + ' | ' + e.answer).join('\n');
    el('edServices').value = (d.booking.services || []).join(', ');
    el('edTz').value = d.booking.timezone;
    el('edSlots').value = d.booking.slotMinutes;
    el('edCal').value = d.booking.provider;
    el('edLangs').value = (d.languages || []).join(', ');
    el('edTransfer').value = d.routing.transferNumber || '';
    el('builderMsg').textContent = `Loaded ${a.name} v${a.version}`;
  };

  el('saveAgent').onclick = async () => {
    if (!loaded) { el('builderMsg').textContent = 'Load an agent first.'; return; }
    const kb = el('edKb').value.split('\n').filter(Boolean).map((line) => {
      const i = line.indexOf('|');
      return { question: (i >= 0 ? line.slice(0, i) : line).trim(), answer: (i >= 0 ? line.slice(i + 1) : '').trim() };
    }).filter((e) => e.question && e.answer);
    const definition = {
      ...loaded.definition,
      greeting: el('edGreeting').value,
      persona: el('edPersona').value,
      qualifyingQuestions: el('edQuestions').value.split('\n').map((s) => s.trim()).filter(Boolean),
      knowledgeBase: kb,
      languages: el('edLangs').value.split(',').map((s) => s.trim()).filter(Boolean),
      booking: {
        ...loaded.definition.booking,
        enabled: el('edCal').value !== 'none',
        provider: el('edCal').value === 'none' ? 'in_memory' : el('edCal').value,
        services: el('edServices').value.split(',').map((s) => s.trim()).filter(Boolean),
        timezone: el('edTz').value || 'UTC',
        slotMinutes: Number(el('edSlots').value) || 30,
      },
      routing: {
        ...loaded.definition.routing,
        transferNumber: el('edTransfer').value || undefined,
        transferEnabled: Boolean(el('edTransfer').value),
      },
    };
    const res = await api('/agents/' + loaded.id, { method: 'PUT', body: JSON.stringify({ name: el('edName').value, definition }) });
    el('builderMsg').textContent = res.id ? `Saved v${res.version}` : errText(res);
    if (res.id) loaded = res;
    loadAgents();
  };

  el('publishAgent').onclick = async () => {
    if (!loaded) return;
    await api('/agents/' + loaded.id + '/publish', { method: 'POST' });
    el('builderMsg').textContent = 'Published';
    loadAgents();
  };

  el('send').onclick = async () => {
    const txt = el('simInput').value.trim();
    if (!txt) return;
    simHistory.push({ role: 'user', content: txt });
    el('simInput').value = '';
    renderChat();
    const res = await api('/agents/' + el('simAgent').value + '/simulate', {
      method: 'POST',
      body: JSON.stringify({ messages: simHistory }),
    });
    simHistory.push({ role: 'assistant', content: res.reply || `[${res.message || res.error || 'no reply'}]` });
    renderChat();
  };
  el('simAgent').onchange = () => { simHistory = []; renderChat(); };
  el('simInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') el('send').click(); });

  el('checkout').onclick = async () => {
    const res = await api('/billing/checkout', { method: 'POST', body: JSON.stringify({ plan: el('checkoutPlan').value }) });
    if (res.url) location.href = res.url;
    else el('billingMsg').textContent = errText(res);
  };
  el('portal').onclick = async () => {
    const res = await api('/billing/portal', { method: 'POST', body: '{}' });
    if (res.url) location.href = res.url;
    else el('billingMsg').textContent = errText(res);
  };
  el('googleAuth').onclick = async () => {
    const r = await api('/integrations/google/auth-url');
    if (r.authUrl) location.href = r.authUrl;
    else el('intMsg').textContent = errText(r);
  };
  el('outlookAuth').onclick = async () => {
    const r = await api('/integrations/outlook/auth-url');
    if (r.authUrl) location.href = r.authUrl;
    else el('intMsg').textContent = errText(r);
  };
  el('calConnect').onclick = async () => {
    const r = await api('/integrations/calcom/connect', {
      method: 'POST',
      body: JSON.stringify({ apiKey: el('calKey').value, eventTypeId: el('calEvent').value }),
    });
    el('intMsg').textContent = r.id ? 'Cal.com connected' : errText(r);
    loadIntegrations();
  };
  el('hsConnect').onclick = async () => {
    const r = await api('/integrations/hubspot/connect', {
      method: 'POST',
      body: JSON.stringify({ privateAppToken: el('hsToken').value }),
    });
    el('intMsg').textContent = r.id ? 'HubSpot connected' : errText(r);
    loadIntegrations();
  };
  el('inviteBtn').onclick = async () => {
    const r = await api('/org/invite', { method: 'POST', body: JSON.stringify({ email: el('inviteEmail').value, role: 'member' }) });
    el('inviteMsg').textContent = r.inviteToken ? `Invite token: ${r.inviteToken}` : errText(r);
    loadSettings();
  };
  el('newKey').onclick = async () => {
    const r = await api('/keys', { method: 'POST', body: JSON.stringify({ name: 'Console key' }) });
    el('keyMsg').textContent = r.token ? `Copy now: ${r.token}` : errText(r);
    loadSettings();
  };

  window.addEventListener('hashchange', route);
  if (qs.get('token')) localStorage.setItem(TOKEN_KEY, qs.get('token'));
  if (token) {
    show('app');
    bootApp().then(route);
  } else {
    route();
  }
})();
