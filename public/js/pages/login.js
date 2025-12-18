// public/js/pages/login.js
(function () {
  const form = document.getElementById('login-form');
  if (!form) return;
  const err = document.getElementById('login-error');

  function showError(message) { err.textContent = message || ''; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || email.indexOf('@') === -1) { showError('Введите корректную почту (должна содержать "@").'); return; }
    if (!password) { showError('Введите пароль.'); return; }

    try {
      const data = await window.api.request('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const redirect = (data && data.redirect) ? data.redirect : '/';
      window.location.href = redirect;
    } catch (err) {
      showError((err && err.body && err.body.error) ? err.body.error : 'Неверная почта или пароль.');
    }
  });
})();
