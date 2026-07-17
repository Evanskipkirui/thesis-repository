'use strict';

/* ═══════════════════════════════════════════════════
   UoN Thesis Repository — main.js
   All pages call the real Node.js API at /api/...
   ═══════════════════════════════════════════════════ */

const BASE = '';   // API lives on same origin (http://localhost:3333)

/* ─── Utilities ────────────────────────────────── */
function showAlert(id, type, html) {
  const el = document.getElementById(id);
  if (!el) return;
  const icons = { success:'✔', danger:'✖', warning:'⚠', info:'ℹ' };
  el.className = 'alert alert-' + type;
  el.innerHTML = `<span class="alert-icon">${icons[type]||'ℹ'}</span><span>${html}</span>`;
  el.classList.remove('hidden');
  el.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function hideAlert(id) { const e=document.getElementById(id); if(e) e.classList.add('hidden'); }

function charCounter(inputId, counterId, max) {
  const el = document.getElementById(inputId);
  const ct = document.getElementById(counterId);
  if (!el||!ct) return;
  const upd = () => {
    ct.textContent = el.value.length + ' / ' + max;
    ct.style.color = el.value.length > max * .9 ? '#dc3545' : '#6c757d';
  };
  el.addEventListener('input', upd); upd();
}

function pwdToggle(inputId, btnId) {
  const i = document.getElementById(inputId);
  const b = document.getElementById(btnId);
  if (!i||!b) return;
  b.addEventListener('click', () => {
    i.type = i.type==='password' ? 'text' : 'password';
    b.textContent = i.type==='password' ? '👁' : '🙈';
  });
}

async function sha256(file) {
  const buf  = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function fillTopbar(user) {
  const n = document.getElementById('tb-name');
  const r = document.getElementById('tb-role');
  if (n) n.textContent = user.name;
  if (r) r.textContent = user.role === 'admin' ? 'Admin' : 'Student';
}

/* ─── Auth guard — checks /api/auth/me ─────────── */
async function requireAuth(role) {
  try {
    const res  = await fetch(BASE + '/api/auth/me', { credentials:'include' });
    if (!res.ok) { window.location.href = '/index.html'; return null; }
    const data = await res.json();
    const user = data.user;
    if (role && user.role !== role) {
      window.location.href = user.role === 'admin'
        ? '/admin/dashboard.html'
        : '/student/dashboard.html';
      return null;
    }
    fillTopbar(user);
    return user;
  } catch {
    window.location.href = '/index.html';
    return null;
  }
}

function logout() {
  fetch(BASE + '/api/auth/logout', { method:'POST', credentials:'include' })
    .finally(() => { window.location.href = '/index.html'; });
}

/* ═══════════════════════════════════════════════════
   PAGE: index.html  — LOGIN
   ═══════════════════════════════════════════════════ */
function initLogin() {
  pwdToggle('password', 'toggle-pwd');
  document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('login-alert');
    const email = document.getElementById('email').value.trim();
    const pass  = document.getElementById('password').value;
    if (!email||!pass) { showAlert('login-alert','danger','Please enter your email and password.'); return; }

    const res  = await fetch(BASE+'/api/auth/login', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { showAlert('login-alert','danger', data.error || 'Login failed.'); return; }

    window.location.href = data.user.role === 'admin'
      ? '/admin/dashboard.html'
      : '/student/dashboard.html';
  });
}

/* ═══════════════════════════════════════════════════
   PAGE: signup.html  — REGISTER
   ═══════════════════════════════════════════════════ */
function initSignup() {
  pwdToggle('password','toggle-pwd1');
  pwdToggle('confirm','toggle-pwd2');
  document.getElementById('signup-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('signup-alert');
    const name  = document.getElementById('full-name').value.trim();
    const email = document.getElementById('email').value.trim();
    const pass  = document.getElementById('password').value;
    const conf  = document.getElementById('confirm').value;
    if (!name||!email||!pass||!conf) { showAlert('signup-alert','danger','All fields are required.'); return; }
    if (pass.length < 6)  { showAlert('signup-alert','danger','Password must be at least 6 characters.'); return; }
    if (pass !== conf)    { showAlert('signup-alert','danger','Passwords do not match.'); return; }

    const res  = await fetch(BASE+'/api/auth/signup', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password: pass })
    });
    const data = await res.json();
    if (!res.ok) { showAlert('signup-alert','danger', data.error || 'Signup failed.'); return; }

    showAlert('signup-alert','success','Account created! Redirecting to login…');
    setTimeout(() => { window.location.href = '/index.html'; }, 1500);
  });
}

/* ═══════════════════════════════════════════════════
   PAGE: student/dashboard.html
   ═══════════════════════════════════════════════════ */
async function initStudentDashboard() {
  const user = await requireAuth('student'); if (!user) return;
  const wn = document.getElementById('welcome-name'); if(wn) wn.textContent = user.name;

  const [statsRes, thesesRes] = await Promise.all([
    fetch(BASE+'/api/theses/stats/summary', { credentials:'include' }),
    fetch(BASE+'/api/theses',               { credentials:'include' }),
  ]);
  const stats  = await statsRes.json();
  const thData = await thesesRes.json();

  document.getElementById('stat-theses').textContent   = stats.theses   || 0;
  document.getElementById('stat-versions').textContent = stats.versions  || 0;
  document.getElementById('stat-last').textContent     = stats.lastUpload
    ? new Date(stats.lastUpload).toLocaleDateString() : '—';

  const tbody  = document.getElementById('thesis-tbody');
  const theses = thData.theses || [];
  if (!theses.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><span class="empty-icon">📭</span>No theses yet. <a href="register_thesis.html">Register your first thesis</a>.</div></td></tr>`;
    return;
  }

  const allV = await fetch(BASE+'/api/theses', { credentials:'include' });
  tbody.innerHTML = theses.map(t => {
    return `<tr>
      <td style="color:var(--muted)">${t.id}</td>
      <td><strong>${t.title}</strong></td>
      <td class="text-center"><span class="badge badge-student">Loading…</span></td>
      <td><span class="hash">—</span></td>
      <td style="color:var(--muted);font-size:.82rem">—</td>
      <td><div class="actions">
        <a href="upload.html?thesis_id=${t.id}" class="btn btn-blue btn-sm">☁ Upload</a>
        <a href="history.html?thesis_id=${t.id}" class="btn btn-ghost btn-sm">🕓 History</a>
      </div></td>
    </tr>`;
  }).join('');

  // Load version details for each thesis
  theses.forEach(async (t) => {
    const vRes = await fetch(BASE+`/api/versions/${t.id}`, { credentials:'include' });
    const vData = await vRes.json();
    const versions = vData.versions || [];
    const active = versions.find(v => v.is_active);
    const row = tbody.querySelectorAll('tr')[theses.indexOf(t)];
    if (!row) return;
    row.cells[2].innerHTML = `<span class="badge badge-student">v${active?active.version_number:'—'} / ${versions.length}</span>`;
    row.cells[3].innerHTML = active ? `<span class="hash" title="${active.content_hash}">${active.content_hash.substring(0,16)}…</span>` : '—';
    row.cells[4].textContent = active ? new Date(active.uploaded_at).toLocaleString() : '—';
  });
}

/* ═══════════════════════════════════════════════════
   PAGE: student/register_thesis.html
   ═══════════════════════════════════════════════════ */
async function initRegisterThesis() {
  const user = await requireAuth('student'); if (!user) return;
  charCounter('thesis-title',    'title-count',    300);
  charCounter('thesis-abstract', 'abstract-count', 2000);

  document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideAlert('register-alert');
    const title    = document.getElementById('thesis-title').value.trim();
    const abstract = document.getElementById('thesis-abstract').value.trim();
    if (!title)    { showAlert('register-alert','danger','Please enter a thesis title.'); return; }
    if (!abstract) { showAlert('register-alert','danger','Please enter an abstract.'); return; }

    const res  = await fetch(BASE+'/api/theses', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ title, abstract })
    });
    const data = await res.json();
    if (!res.ok) { showAlert('register-alert','danger', data.error||'Failed.'); return; }

    showAlert('register-alert','success',`<strong>Thesis registered!</strong> ID: <strong>${data.thesisId}</strong>. Redirecting to upload…`);
    setTimeout(() => { window.location.href = `upload.html?thesis_id=${data.thesisId}`; }, 1800);
  });
}
