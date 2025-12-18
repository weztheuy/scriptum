// public/js/pages/register.js
(function () {
  const form = document.getElementById('register-form');
  if (!form) return;
  const err = document.getElementById('register-error');
  const verifyBox = document.getElementById('verify-box');
  const verifyStatus = document.getElementById('verify-status');
  const verifySubmit = document.getElementById('verify-submit');
  const resendBtn = document.getElementById('resend-code');

  function showError(message) { err.textContent = message || ''; }
  function setVerifyVisible(visible) {
    verifyBox.style.display = visible ? 'block' : 'none';
    verifyBox.setAttribute('aria-hidden', !visible);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const username = form.username.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    const password2 = form.password2.value;

    if (!username || username.length < 3) { showError('Логин минимум 3 символа.'); return; }
    if (!email || email.indexOf('@') === -1) { showError('Введите корректную почту.'); return; }
    if (password.length < 8) { showError('Пароль минимум 8 символов.'); return; }
    if (password !== password2) { showError('Пароли не совпадают.'); return; }

    try {
      const body = { username, email, password };
      await window.api.request('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setVerifyVisible(true);
      verifyStatus.textContent = 'Код отправлен. Проверьте почту.';
    } catch (err) {
      showError((err && err.body && err.body.error) ? err.body.error : 'Ошибка регистрации. Попробуйте позже.');
    }
  });

  verifySubmit && verifySubmit.addEventListener('click', async () => {
    const code = document.getElementById('verify-code').value.trim();
    const email = form.email.value.trim();
    if (!code || !email) { verifyStatus.textContent = 'Введите код и email.'; return; }

    verifyStatus.textContent = 'Отправка кода…';
    try {
      const data = await window.api.request('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email })
      });
      verifyStatus.textContent = 'Почта подтверждена. Перенаправление…';
      const redirect = (data && data.redirect) ? data.redirect : '/';
      setTimeout(() => window.location.href = redirect, 800);
    } catch (err) {
      verifyStatus.textContent = (err && err.body && err.body.error) ? err.body.error : 'Код неверен.';
    }
  });

  resendBtn && resendBtn.addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!email) { verifyStatus.textContent = 'Введите email для повторной отправки.'; return; }
    verifyStatus.textContent = 'Повторная отправка…';
    try {
      await window.api.request('/api/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      verifyStatus.textContent = 'Письмо отправлено ещё раз.';
    } catch (err) {
      verifyStatus.textContent = 'Не удалось отправить письмо. Попробуйте позже.';
    }
  });

  setVerifyVisible(false);
})();
