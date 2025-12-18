// public/js/core.js
window.api = (function () {
  async function request(url, opts = {}) {
    const res = await fetch(url, Object.assign({
      credentials: 'same-origin',
      headers: Object.assign({ 'Accept': 'application/json' }, opts.headers || {})
    }, opts));
    const contentType = res.headers.get('content-type') || '';
    let body = null;
    if (contentType.includes('application/json')) {
      body = await res.json().catch(() => null);
    } else {
      body = await res.text().catch(() => null);
    }
    if (!res.ok) {
      const err = new Error(body && body.error ? body.error : 'network');
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  return { request };
})();
