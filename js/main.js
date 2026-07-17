'use strict';

/* ═══════════════════════════════════════════════
   Thesis Repository Management System — main.js
   Frontend talks to Express API at /api/*
   ═══════════════════════════════════════════════ */

const IN_SUBFOLDER = window.location.pathname.includes('/student/') ||
                     window.location.pathname.includes('/admin/');
const ROOT = IN_SUBFOLDER ? '../' : '';

const API = {
  async call(method, endpoint, body) {
    const opts = {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch('/api' + endpoint, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  },
  get(ep)        { return this.call('GET',  ep);       },
  post(ep, body) { return this.call('POST', ep, body); },
};

let _sessionUser = null;
async function getUser() {
  if (_sessionUser) return _sessionUser;
  try {
    const data = await API.get('/auth/me');
    _sessionUser = data.user;
    return _sessionUser;
  } catch { return null; }
}

function showAlert(id, type, html) {
  const el = document.getElementById(id);
  if (!el) return;
  const icons = { success:'✔', danger:'✖', warning:'⚠', info:'ℹ' };
  el.className = 'alert alert-' + type;
  el.innerHTML = `<span class="alert-icon">${icons[type]||'ℹ'}</span><span>${html}</span>`;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function hideAlert(id) { const e = document.getElementById(id); if (e) e.classList.add('hidden'); }

function charCounter(inputId, counterId, max) {
  const el = document.getElementById(inputId);
  const ct = document.getElementById(counterId);
  if (!el || !ct) return;
  const upd = () => {
    ct.textContent = el.value.length + ' / ' + max;
    ct.style.color = el.value.length > max * 0.9 ? '#dc3545' : '#6c757d';
  };
  el.addEventListener('input', upd); upd();
}

function pwdToggle(inputId, btnId) {
  const i = document.getElementById(inputId), b = document.getElementById(btnId);
  if (!i || !b) return;
  b.addEventListener('click', () => {
    i.type = i.type === 'password' ? 'text' : 'password';
    b.textContent = i.type === 'password' ? '👁' : '🙈';
  });
}

async function sha256(file) {
  const buf  = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function fillTopbar(user) {
  const n = document.getElementById('tb-name');
  const r = document.getElementById('tb-role');
  if (n) n.textContent = user.name;
  if (r) r.textContent = user.role === 'admin' ? 'Admin' : 'Student';
}

function fmtDate(val) {
  if (!val) return '—';
  return new Date(val).toISOString().slice(0,16).replace('T',' ');
}

async function requireAuth(role) {
  const user = await getUser();
  if (!user) { window.location.href = ROOT + 'index.html'; return null; }
  if (role && user.role !== role) {
    window.location.href = user.role === 'admin'
      ? ROOT + 'admin/dashboard.html'
      : ROOT + 'student/dashboard.html';
    return null;
  }
  return user;
}

async function logout() {
  try { await API.post('/auth/logout'); } catch { /* ignore */ }
  window.location.href = ROOT + 'index.html';
}
window.logout = logout;
window.selectVersion = function(item) {
  document.querySelectorAll('.version-item').forEach(i => i.classList.remove('selected'));
  item.classList.add('selected');
  const r = item.querySelector('input[type="radio"]');
  if (r) r.checked = true;
};

/* ══ LOGIN ══ */
async function initLogin() {
  const existing = await getUser();
  if (existing) {
    window.location.href = existing.role === 'admin' ? 'admin/dashboard.html' : 'student/dashboard.html';
    return;
  }
  pwdToggle('password','toggle-pwd');
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('login-alert');
    const email = document.getElementById('email').value.trim().toLowerCase();
    const pass  = document.getElementById('password').value;
    if (!email||!pass) { showAlert('login-alert','danger','Please enter your email and password.'); return; }
    const btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const data = await API.post('/auth/login', { email, password: pass });
      _sessionUser = data.user;
      window.location.href = data.user.role === 'admin' ? 'admin/dashboard.html' : 'student/dashboard.html';
    } catch(err) {
      showAlert('login-alert','danger', err.message);
    } finally { btn.disabled = false; }
  });
}

/* ══ SIGNUP ══ */
function initSignup() {
  pwdToggle('password','toggle-pwd1');
  pwdToggle('confirm','toggle-pwd2');
  document.getElementById('signup-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('signup-alert');
    const name  = document.getElementById('full-name').value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const pass  = document.getElementById('password').value;
    const conf  = document.getElementById('confirm').value;
    if (!name||!email||!pass||!conf) { showAlert('signup-alert','danger','All fields are required.'); return; }
    if (pass.length < 6)  { showAlert('signup-alert','danger','Password must be at least 6 characters.'); return; }
    if (pass !== conf)    { showAlert('signup-alert','danger','Passwords do not match.'); return; }
    const btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await API.post('/auth/signup', { name, email, password: pass });
      showAlert('signup-alert','success','Account created! Redirecting to login…');
      setTimeout(() => { window.location.href = 'index.html'; }, 1500);
    } catch(err) {
      showAlert('signup-alert','danger', err.message);
    } finally { btn.disabled = false; }
  });
}

/* ══ STUDENT DASHBOARD ══ */
async function initStudentDashboard() {
  const user = await requireAuth('student'); if (!user) return;
  fillTopbar(user);
  const el = document.getElementById('welcome-name'); if (el) el.textContent = user.name;
  try {
    const [statsData, thesesData] = await Promise.all([
      API.get('/theses/stats/summary'),
      API.get('/theses'),
    ]);
    document.getElementById('stat-theses').textContent   = statsData.theses;
    document.getElementById('stat-versions').textContent = statsData.versions;
    document.getElementById('stat-last').textContent     = statsData.lastUpload ? fmtDate(statsData.lastUpload).split(' ')[0] : '—';
    const tbody  = document.getElementById('thesis-tbody');
    const theses = thesesData.theses || [];
    if (!theses.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="empty-icon">📭</span>No theses yet. <a href="register_thesis.html">Register your first thesis</a>.</div></td></tr>`;
      return;
    }
    const versionsMap = {};
    await Promise.all(theses.map(async t => {
      try { const vd = await API.get(`/versions/${t.id}`); versionsMap[t.id] = vd.versions || []; }
      catch { versionsMap[t.id] = []; }
    }));
    tbody.innerHTML = theses.map(t => {
      const vList  = versionsMap[t.id];
      const active = vList.find(v => v.is_active);
      return `<tr>
        <td style="color:var(--muted)">${t.id}</td>
        <td><strong>${t.title}</strong></td>
        <td class="text-center"><span class="badge badge-student">v${active?active.version_number:'—'} / ${vList.length}</span></td>
        <td><span class="hash" title="${active?active.content_hash:''}">${active?active.content_hash.substring(0,16)+'…':'—'}</span></td>
        <td style="color:var(--muted);font-size:.82rem">${active?fmtDate(active.uploaded_at):'—'}</td>
        <td><div class="actions">
          <a href="upload.html?thesis_id=${t.id}" class="btn btn-blue btn-sm">☁ Upload</a>
          <a href="history.html?thesis_id=${t.id}" class="btn btn-ghost btn-sm">🕓 History</a>
        </div></td>
      </tr>`;
    }).join('');
  } catch(err) {
    const tbody = document.getElementById('thesis-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-danger"><span class="alert-icon">✖</span><span>${err.message}</span></div></td></tr>`;
  }
}

/* ══ REGISTER THESIS ══ */
async function initRegisterThesis() {
  const user = await requireAuth('student'); if (!user) return;
  fillTopbar(user);
  charCounter('thesis-title','title-count',300);
  charCounter('thesis-abstract','abstract-count',2000);
  document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('register-alert');
    const title    = document.getElementById('thesis-title').value.trim();
    const abstract = document.getElementById('thesis-abstract').value.trim();
    if (!title)    { showAlert('register-alert','danger','Please enter a thesis title.'); return; }
    if (!abstract) { showAlert('register-alert','danger','Please enter an abstract.'); return; }
    const btn = document.getElementById('register-btn');
    btn.disabled = true;
    try {
      const data = await API.post('/theses', { title, abstract });
      showAlert('register-alert','success',`<strong>Thesis registered!</strong> ID: <strong>${data.thesisId}</strong>. Redirecting to upload…`);
      setTimeout(() => { window.location.href = `upload.html?thesis_id=${data.thesisId}`; }, 1800);
    } catch(err) {
      showAlert('register-alert','danger', err.message);
    } finally { btn.disabled = false; }
  });
}

/* ══ UPLOAD ══ */
async function initUpload() {
  const user = await requireAuth('student'); if (!user) return;
  fillTopbar(user);
  charCounter('thesis-title','title-count',300);
  charCounter('thesis-desc','desc-count',2000);
  const params   = new URLSearchParams(window.location.search);
  const thesisId = params.get('thesis_id') ? parseInt(params.get('thesis_id')) : null;
  let thesis = null;
  if (!thesisId) {
    showAlert('upload-alert','warning','No thesis selected. Please go to your <a href="dashboard.html">dashboard</a> and click the ☁ Upload button next to a thesis.');
  }
  if (thesisId) {
    try {
      const data = await API.get(`/theses/${thesisId}`);
      thesis = data.thesis;
      const ti = document.getElementById('thesis-title');
      if (ti) { ti.value = thesis.title; ti.readOnly = true; }
      const vd = await API.get(`/versions/${thesisId}`);
      const active = (vd.versions||[]).find(v => v.is_active);
      if (active) {
        const cv = document.getElementById('current-version'); if(cv) cv.textContent = 'v'+active.version_number;
        const ch = document.getElementById('current-hash');    if(ch) ch.textContent = active.content_hash;
        const cd = document.getElementById('current-date');    if(cd) cd.textContent = fmtDate(active.uploaded_at);
      }
    } catch(err) { showAlert('upload-alert','warning','Could not load thesis details: '+err.message); }
  }
  document.getElementById('upload-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('upload-alert');
    const title   = document.getElementById('thesis-title').value.trim();
    const fileInp = document.getElementById('thesis-file');
    const noteEl  = document.getElementById('thesis-desc');
    const btn     = document.getElementById('upload-btn');
    const spinner = document.getElementById('upload-spinner');
    if (!thesisId) { showAlert('upload-alert','danger','No thesis selected. Please go to your dashboard and click Upload next to a thesis.'); return; }
    if (!title)    { showAlert('upload-alert','danger','Please enter a thesis title.'); return; }
    if (!fileInp||!fileInp.files||fileInp.files.length===0) { showAlert('upload-alert','danger','Please select a PDF file to upload.'); return; }
    const file  = fileInp.files[0];
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type==='application/pdf';
    if (!isPdf) { showAlert('upload-alert','danger','Only PDF files are accepted.'); return; }
    if (file.size > 20*1024*1024) { showAlert('upload-alert','danger','File is too large. Maximum size is 20 MB.'); return; }
    btn.disabled = true;
    spinner.style.display = 'inline-flex';
    showAlert('upload-alert','info','Uploading and computing SHA-256 hash…');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (noteEl && noteEl.value.trim()) formData.append('changeNote', noteEl.value.trim());
      const res  = await fetch(`/api/versions/${thesisId}`, { method:'POST', credentials:'include', body: formData });
      const data = await res.json().catch(()=>({}));
      spinner.style.display = 'none';
      if (!res.ok) {
        if (res.status===409) showAlert('upload-alert','warning', data.error);
        else showAlert('upload-alert','danger', data.error||'Upload failed.');
        btn.disabled = false;
        return;
      }
      showAlert('upload-alert','success',
        `<strong>Version v${data.versionNumber} uploaded!</strong><br>`+
        `SHA-256: <code style="font-size:.75rem;word-break:break-all">${data.contentHash}</code><br>`+
        `<small>Redirecting to history…</small>`);
      setTimeout(() => { window.location.href = `history.html?thesis_id=${thesisId}`; }, 2200);
    } catch(err) {
      spinner.style.display = 'none';
      showAlert('upload-alert','danger','Upload failed: '+err.message);
    } finally { btn.disabled = false; }
  });
}

/* ══ HISTORY (student + admin) ══ */
async function initHistory() {
  const user = await requireAuth(); if (!user) return;
  fillTopbar(user);
  const params   = new URLSearchParams(window.location.search);
  const thesisId = parseInt(params.get('thesis_id'));
  if (!thesisId) {
    try {
      const data   = await API.get('/theses');
      const theses = data.theses || [];
      const thead = document.querySelector('#history-content table thead tr');
      if (thead) thead.innerHTML = `<th>#</th><th>Title</th>${user.role==='admin'?'<th>Student</th>':''}<th>Action</th>`;
      const head = document.getElementById('thesis-title-head');
      if (head) head.textContent = 'Select a thesis to view its version history';
      const statsRow = document.querySelector('.stats-row');
      if (statsRow) statsRow.style.display = 'none';
      const uploadLink = document.getElementById('upload-link');
      if (uploadLink) uploadLink.style.display = 'none';
      const colSpan = user.role==='admin' ? 4 : 3;
      document.getElementById('versions-tbody').innerHTML = theses.length
        ? theses.map(t=>`<tr>
            <td style="color:var(--muted)">${t.id}</td>
            <td><strong>${t.title}</strong></td>
            ${user.role==='admin'?`<td style="font-size:.82rem">${t.student_name||'—'}</td>`:''}
            <td><a href="history.html?thesis_id=${t.id}" class="btn btn-blue btn-sm">🕓 View History</a></td>
          </tr>`).join('')
        : `<tr><td colspan="${colSpan}"><div class="empty-state"><span class="empty-icon">📭</span>No theses found.</div></td></tr>`;
    } catch(err) {
      document.getElementById('versions-tbody').innerHTML =
        `<tr><td colspan="4"><div class="alert alert-danger"><span class="alert-icon">✖</span><span>${err.message}</span></div></td></tr>`;
    }
    return;
  }
  try {
    const data     = await API.get(`/versions/${thesisId}`);
    const versions = data.versions || [];
    const thesis   = data.thesis;
    const active   = versions.find(v => v.is_active);
    const hasBad   = versions.some(v => v.is_corrupted);
    const tHead = document.getElementById('thesis-title-head');
    const tStud = document.getElementById('thesis-student');
    if (tHead) tHead.textContent = thesis.title;
    if (tStud) tStud.textContent = '👤 '+(thesis.student_name||'—');
    document.getElementById('stat-total').textContent  = versions.length;
    document.getElementById('stat-active').textContent = active ? 'v'+active.version_number : '—';
    const si = document.getElementById('stat-integrity');
    if (si) { si.textContent = hasBad?'⚠ Issue':'✔ OK'; si.style.color = hasBad?'var(--red)':'var(--green)'; }
    const ul = document.getElementById('upload-link');
    if (ul) { if (user.role==='admin') ul.style.display='none'; else ul.href=`upload.html?thesis_id=${thesisId}`; }
    document.getElementById('versions-tbody').innerHTML = versions.map(v => {
      const rowCls  = v.is_active?'row-active':v.is_corrupted?'row-corrupted':'';
      const badge   = v.is_active ? '<span class="badge badge-active">✅ Active</span>'
                    : v.is_corrupted ? '<span class="badge badge-corrupted">⚠ Corrupted</span>'
                    : '<span class="badge badge-preserved">Preserved</span>';
      const evBadge = v.event_type==='rollback'?'<span class="badge badge-rollback" style="font-size:.6rem">rollback</span>':'';
      const dlBtn   = v.is_corrupted
        ? '<button class="btn btn-ghost btn-sm" disabled title="Corrupted">✖</button>'
        : `<a href="/api/versions/${thesisId}/download/${v.version_number}" class="btn btn-blue btn-sm" target="_blank">⬇ Download</a>`;
      const rbBtn   = user.role==='admin' && !v.is_active && !v.is_corrupted
        ? `<a href="rollback.html?thesis_id=${thesisId}&target_v=${v.version_number}" class="btn btn-ghost btn-sm">↩ Rollback</a>` : '';
      return `<tr class="${rowCls}">
        <td><strong>v${v.version_number}</strong> ${evBadge}</td>
        <td><span class="hash" title="${v.content_hash}">${v.content_hash.substring(0,18)}…</span></td>
        <td style="font-size:.82rem">${v.uploader_name||'—'}</td>
        <td style="font-size:.82rem;color:var(--muted)">${v.change_note||'—'}</td>
        <td style="font-size:.82rem;white-space:nowrap">${fmtDate(v.uploaded_at)}</td>
        <td>${badge}</td>
        <td><div class="actions">${dlBtn}${rbBtn}</div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📭</span>No versions uploaded yet.</div></td></tr>`;
  } catch(err) {
    document.getElementById('versions-tbody').innerHTML =
      `<tr><td colspan="7"><div class="alert alert-danger"><span class="alert-icon">✖</span><span>${err.message}</span></div></td></tr>`;
  }
}

/* ══ ADMIN DASHBOARD ══ */
async function initAdminDashboard() {
  const user = await requireAuth('admin'); if (!user) return;
  fillTopbar(user);
  try {
    const [statsData, thesesData] = await Promise.all([
      API.get('/theses/stats/summary'),
      API.get('/theses'),
    ]);
    document.getElementById('stat-users').textContent   = statsData.students;
    document.getElementById('stat-docs').textContent    = statsData.theses;
    document.getElementById('stat-vers').textContent    = statsData.versions;
    document.getElementById('stat-corrupt').textContent = statsData.corrupted;
    const theses = thesesData.theses || [];
    const versionsMap = {};
    await Promise.all(theses.map(async t => {
      try { const vd = await API.get(`/versions/${t.id}`); versionsMap[t.id] = vd.versions||[]; }
      catch { versionsMap[t.id] = []; }
    }));
    document.getElementById('admin-docs-tbody').innerHTML = theses.map(t => {
      const vList  = versionsMap[t.id];
      const active = vList.find(v => v.is_active);
      const hasBad = vList.some(v => v.is_corrupted);
      return `<tr class="${hasBad?'row-corrupted':''}">
        <td style="color:var(--muted)">${t.id}</td>
        <td><strong>${t.title}</strong></td>
        <td style="font-size:.82rem">${t.student_name||'—'}</td>
        <td class="text-center"><span class="badge badge-student">v${active?active.version_number:'—'} / ${vList.length}</span></td>
        <td style="font-size:.82rem;color:var(--muted)">${active?fmtDate(active.uploaded_at):'—'}</td>
        <td>${hasBad?'<span style="color:var(--red);font-weight:600">⚠ Issue</span>':'<span style="color:var(--green);font-weight:600">✔ OK</span>'}</td>
        <td><div class="actions">
          <a href="history.html?thesis_id=${t.id}" class="btn btn-blue btn-sm">🕓 History</a>
          <a href="rollback.html?thesis_id=${t.id}" class="btn btn-ghost btn-sm">↩ Rollback</a>
        </div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📭</span>No theses registered yet.</div></td></tr>`;
  } catch(err) { console.error(err); }
}

/* ══ MANAGE USERS ══ */
async function initManageUsers() {
  const user = await requireAuth('admin'); if (!user) return;
  fillTopbar(user);
  try {
    const data  = await API.get('/audit/users');
    const users = data.users || [];
    document.getElementById('admin-users-tbody').innerHTML = users.map(u => `
      <tr>
        <td style="color:var(--muted)">${u.id}</td>
        <td><strong>${u.name}</strong></td>
        <td style="font-size:.82rem">${u.email}</td>
        <td><span class="badge badge-student">Student</span></td>
        <td class="text-center">${u.thesis_count}</td>
        <td style="font-size:.82rem;color:var(--muted)">${fmtDate(u.created_at).split(' ')[0]}</td>
      </tr>`).join('') || `<tr><td colspan="6"><div class="empty-state"><span class="empty-icon">📭</span>No students found.</div></td></tr>`;
  } catch(err) { console.error(err); }
}

/* ══ VIEW DOCUMENTS ══ */
async function initViewDocuments() {
  const user = await requireAuth('admin'); if (!user) return;
  fillTopbar(user);
  try {
    const thesesData = await API.get('/theses');
    const theses     = thesesData.theses || [];
    const versionsMap = {};
    await Promise.all(theses.map(async t => {
      try { const vd = await API.get(`/versions/${t.id}`); versionsMap[t.id] = vd.versions||[]; }
      catch { versionsMap[t.id] = []; }
    }));
    document.getElementById('admin-docs-tbody').innerHTML = theses.map(t => {
      const vList  = versionsMap[t.id];
      const active = vList.find(v => v.is_active);
      const hasBad = vList.some(v => v.is_corrupted);
      return `<tr class="${hasBad?'row-corrupted':''}">
        <td style="color:var(--muted)">${t.id}</td>
        <td><strong>${t.title}</strong></td>
        <td style="font-size:.82rem">${t.student_name||'—'}</td>
        <td class="text-center"><span class="badge badge-student">v${active?active.version_number:'—'} / ${vList.length}</span></td>
        <td style="font-size:.82rem;color:var(--muted)">${active?fmtDate(active.uploaded_at):'—'}</td>
        <td>${hasBad?'<span style="color:var(--red);font-weight:600">⚠ Issue</span>':'<span style="color:var(--green);font-weight:600">✔ OK</span>'}</td>
        <td><div class="actions">
          <a href="history.html?thesis_id=${t.id}" class="btn btn-blue btn-sm">🕓 History</a>
          <a href="rollback.html?thesis_id=${t.id}" class="btn btn-ghost btn-sm">↩ Rollback</a>
        </div></td>
      </tr>`;
    }).join('') || `<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">📭</span>No theses registered yet.</div></td></tr>`;
  } catch(err) { console.error(err); }
}

/* ══ ROLLBACK ══ */
async function initRollback() {
  const user = await requireAuth('admin'); if (!user) return;
  fillTopbar(user);
  const params   = new URLSearchParams(window.location.search);
  const thesisId = parseInt(params.get('thesis_id'));
  const targetV  = parseInt(params.get('target_v'));
  const hl       = document.getElementById('history-link');
  if (!thesisId) {
    if (hl) hl.href = 'history.html';
    try {
      const thesesData  = await API.get('/theses');
      const theses      = thesesData.theses || [];
      const versionsMap = {};
      await Promise.all(theses.map(async t => {
        try { const vd = await API.get(`/versions/${t.id}`); versionsMap[t.id] = vd.versions||[]; }
        catch { versionsMap[t.id] = []; }
      }));
      const rbContent = document.getElementById('rb-content');
      if (rbContent) {
        rbContent.innerHTML = `
          <div class="card" style="margin-bottom:0">
            <div class="card-head">📄 Select a Thesis to Roll Back</div>
            <div class="card-body">
              <div class="alert alert-info" style="margin-bottom:1rem">
                <span class="alert-icon">ℹ</span>
                <span>Choose a thesis below, then select the version to restore.</span>
              </div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>Title</th><th>Student</th><th>Versions</th><th>Action</th></tr></thead>
                  <tbody>${theses.map(t => {
                    const vList  = versionsMap[t.id];
                    const active = vList.find(v => v.is_active);
                    return `<tr>
                      <td style="color:var(--muted)">${t.id}</td>
                      <td><strong>${t.title}</strong></td>
                      <td style="font-size:.82rem">${t.student_name||'—'}</td>
                      <td class="text-center"><span class="badge badge-student">v${active?active.version_number:'—'} / ${vList.length}</span></td>
                      <td><a href="rollback.html?thesis_id=${t.id}" class="btn btn-blue btn-sm">↩ Select</a></td>
                    </tr>`;
                  }).join('') || `<tr><td colspan="5"><div class="empty-state"><span class="empty-icon">📭</span>No theses found.</div></td></tr>`}
                  </tbody>
                </table>
              </div>
            </div>
          </div>`;
      }
    } catch(err) { console.error(err); }
    return;
  }
  if (hl) hl.href = `history.html?thesis_id=${thesisId}`;
  try {
    const data     = await API.get(`/versions/${thesisId}`);
    const versions = data.versions || [];
    const thesis   = data.thesis;
    const active   = versions.find(v => v.is_active);
    const tTitle   = document.getElementById('rb-thesis-title');
    if (tTitle) tTitle.textContent = thesis.title;
    const ai = document.getElementById('rb-active-info');
    if (ai) ai.textContent = active ? `v${active.version_number} — ${active.change_note||''} (${fmtDate(active.uploaded_at)})` : '—';
    document.getElementById('version-list').innerHTML = versions.map(v => {
      const disabled  = v.is_active || v.is_corrupted;
      const preselect = !disabled && v.version_number === targetV;
      const badge     = v.is_active ? '<span class="badge badge-active">Active</span>'
                      : v.is_corrupted ? '<span class="badge badge-corrupted">Corrupted</span>' : '';
      return `<li class="version-item ${disabled?'disabled-item':''} ${preselect?'selected':''}"
                 onclick="${disabled?'':'selectVersion(this)'}">
        <input type="radio" name="rb-version" value="${v.version_number}" ${preselect?'checked':''} ${disabled?'disabled':''}/>
        <div class="v-info">
          <div class="v-num">v${v.version_number} ${badge}</div>
          <div class="v-note">${v.change_note||'—'}</div>
          <div class="v-meta">${fmtDate(v.uploaded_at)} | <span class="hash" title="${v.content_hash}">${v.content_hash.substring(0,18)}…</span></div>
        </div>
      </li>`;
    }).join('') || '<li style="color:var(--muted);padding:1rem;text-align:center">No versions available.</li>';
    document.getElementById('restore-btn').addEventListener('click', async function() {
      const sel = document.querySelector('input[name="rb-version"]:checked');
      if (!sel) { showAlert('rb-alert','warning','Please select a version to restore.'); return; }
      const v   = parseInt(sel.value);
      const ver = versions.find(x => x.version_number === v);
      if (!confirm(`Restore to v${v}?\n\n"${ver?ver.change_note:''}"\n\nNo versions will be deleted.`)) return;
      this.disabled = true;
      try {
        await API.post(`/versions/${thesisId}/rollback`, { targetVersion: v });
        showAlert('rb-alert','success',`<strong>Rolled back to v${v}.</strong> Redirecting…`);
        setTimeout(() => { window.location.href = `history.html?thesis_id=${thesisId}`; }, 1800);
      } catch(err) {
        showAlert('rb-alert','danger', err.message);
        this.disabled = false;
      }
    });
  } catch(err) {
    const rbContent = document.getElementById('rb-content');
    if (rbContent) rbContent.innerHTML = `<div class="alert alert-danger"><span class="alert-icon">✖</span><span>${err.message}</span></div>`;
  }
}

/* ══ AUDIT ══ */
async function initAudit() {
  const user = await requireAuth('admin'); if (!user) return;
  fillTopbar(user);
  document.getElementById('run-audit-btn').addEventListener('click', async function() {
    const btn      = this;
    const progress = document.getElementById('audit-progress');
    const bar      = document.getElementById('audit-bar');
    const text     = document.getElementById('audit-text');
    const idle     = document.getElementById('audit-idle');
    const stats    = document.getElementById('audit-stats');
    btn.disabled = true;
    if (idle)     idle.style.display     = 'none';
    if (progress) progress.style.display = 'block';
    if (stats)    stats.style.display    = 'none';
    document.getElementById('audit-results').innerHTML = '';
    let pct = 0;
    const iv = setInterval(() => {
      pct = Math.min(pct+5, 90);
      bar.style.width  = pct+'%';
      text.textContent = `Auditing files… ${pct}%`;
    }, 150);
    try {
      const data = await API.post('/audit/run');
      clearInterval(iv);
      bar.style.width  = '100%';
      text.textContent = `Audit complete — ${data.passed} passed, ${data.failed} failed.`;
      if (stats) {
        stats.style.display = 'grid';
        document.getElementById('audit-stat-total').textContent  = data.total;
        document.getElementById('audit-stat-passed').textContent = data.passed;
        document.getElementById('audit-stat-failed').textContent = data.failed;
      }
      const rows = data.results.map(v => `
        <tr class="${v.isCorrupted?'row-corrupted':''}">
          <td style="font-size:.82rem">${v.thesisTitle}</td>
          <td style="font-size:.82rem">${v.studentName}</td>
          <td class="text-center"><span class="badge badge-preserved">v${v.versionNumber}</span></td>
          <td><span class="hash" title="${v.contentHash}">${v.contentHash.substring(0,20)}…</span></td>
          <td>${v.isCorrupted
            ? '<span style="color:var(--red);font-weight:700">✖ FAILED</span>'
            : '<span style="color:var(--green);font-weight:700">✔ PASSED</span>'}
          </td>
        </tr>`).join('');
      document.getElementById('audit-results').innerHTML = `
        <div class="card" style="margin-top:1rem">
          <div class="card-head">📋 Audit Report — ${new Date().toLocaleString()}</div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Thesis</th><th>Student</th><th>Version</th><th>SHA-256 Hash</th><th>Result</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
    } catch(err) {
      clearInterval(iv);
      text.textContent = 'Audit failed: '+err.message;
    } finally { btn.disabled = false; }
  });
}

/* ══ CONTACT ══ */
async function initContact() {
  const user = await requireAuth('student'); if (!user) return;
  fillTopbar(user);
}

/* ══ AUTO-INIT ══ */
document.addEventListener('DOMContentLoaded', () => {
  const page    = window.location.pathname.split('/').pop().replace(/\?.*/, '') || 'index.html';
  const isAdmin = IN_SUBFOLDER && window.location.pathname.includes('/admin/');
  const map = {
    'index.html':           initLogin,
    'signup.html':          initSignup,
    'dashboard.html':       isAdmin ? initAdminDashboard : initStudentDashboard,
    'register_thesis.html': initRegisterThesis,
    'upload.html':          initUpload,
    'history.html':         initHistory,
    'manage_users.html':    initManageUsers,
    'view_documents.html':  initViewDocuments,
    'rollback.html':        initRollback,
    'audit.html':           initAudit,
    'contact.html':         initContact,
  };
  if (map[page]) map[page]();
});
