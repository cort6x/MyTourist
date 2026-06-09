const Auth = {
  getToken() { return localStorage.getItem('token'); },
  getUser() { const v = localStorage.getItem('user'); return v ? JSON.parse(v) : null; },
  setSession(token, user) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); location.href = '/entrance.html'; },
  isLoggedIn() { return !!this.getToken(); },
  async apiRequest(url, options = {}) {
    const headers = { ...(options.headers || {}), 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url, { ...options, headers });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return { error: text }; }
  },
  updateNavbar() {
    const user = this.getUser();
    document.querySelectorAll('.login-btn, .profile-btn').forEach(btn => {
      if (!btn) return;
      if (user) {
        btn.textContent = user.username;
        btn.onclick = () => location.href = '/profile.html';
      } else {
        btn.onclick = () => location.href = '/entrance.html';
      }
    });
    document.querySelectorAll('a[href="profile.html"]').forEach(a => {
      if (user) a.textContent = 'Кабинет';
    });
  }
};
document.addEventListener('DOMContentLoaded', () => Auth.updateNavbar());
function needLogin(next) { if (!Auth.isLoggedIn()) { sessionStorage.setItem('redirectAfterLogin', next); location.href='/entrance.html'; return true; } return false; }
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
