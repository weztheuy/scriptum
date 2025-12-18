// public/js/header.js
(function () {
  const container = document.getElementById('header-user');
  if (!container) return;

  // initial placeholder remains until fetch resolves
  async function renderGuest() {
    container.classList.remove('user-loaded');
    container.innerHTML = `
      <a class="btn minimal" href="/login">Вход</a>
      <a class="btn primary" href="/register">Регистрация</a>
    `;
  }

  async function renderUser(user) {
    container.classList.add('user-loaded');
    // sanitize username for display - minimal (server should ensure safe names)
    const name = String(user.username || user.name || user.email).slice(0, 30);
    container.innerHTML = `
      <a class="btn minimal" href="/profile">${escapeHtml(name)}</a>
      <button id="logout-btn" class="btn outline">Выход</button>
    `;
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn && logoutBtn.addEventListener('click', async () => {
      try {
        await window.api.request('/api/logout', { method: 'POST' });
      } catch (e) {
        // ignore errors on logout
      } finally {
        // перезагрузим страницу, чтобы состояние обновилось
        window.location.reload();
      }
    });
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // fetch /api/me
  (async function () {
    try {
      const user = await window.api.request('/api/me', { method: 'GET' });
      if (user && user.username) {
        renderUser(user);
      } else {
        renderGuest();
      }
    } catch (err) {
      // if 401 or network error — show guest
      renderGuest();
    }
  })();
})();
