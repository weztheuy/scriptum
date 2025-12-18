// src/shared/pageRoutes.js
const path = require('path');

const PUBLIC = path.join(__dirname, '..', '..', '..', 'public');

function page(file) {
  return (req, res) => {
    res.sendFile(path.join(PUBLIC, 'pages', file));
  };
}

module.exports = {
  index: (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')),
  login: page('login.html'),
  register: page('register.html'),
  settings: page('settings.html'),
  authorSearch: page('authorsSearch.html'),
  workSearch: page('worksSearch.html'),
};
