const Auth = {
  getToken() { return localStorage.getItem('token'); },
  getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; },
  setSession(token, user) { localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user)); },
  logout() { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/entrance.html'; },
  isLoggedIn() { return !!this.getToken(); },
  async apiRequest(url, options = {}) {
    const token = this.getToken();
    if (token) { options.headers = options.headers || {}; options.headers['Authorization'] = 'Bearer ' + token; }
    options.headers = { 'Content-Type': 'application/json', ...options.headers };
    const res = await fetch(url, options);
    if (res.status === 401) { this.logout(); return; }
    return res.json();
  },
  updateNavbar() {
    const user = this.getUser();
    document.querySelectorAll('.profile-btn,.login-btn').forEach(btn => {
      if (!btn) return;
      if (user) { btn.textContent = user.username; btn.onclick = () => window.location.href = '/profile.html'; }
      else btn.onclick = () => window.location.href = '/entrance.html';
    });
  }
};
document.addEventListener('DOMContentLoaded', () => Auth.updateNavbar());
