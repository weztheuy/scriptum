// web-app/src/app.js
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const logger = require('./shared/utils/logger');
const authRoutes = require('./modules/auth/auth.routes');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static files (CSS, JS, assets)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Healthcheck
app.get('/health', (req, res) => res.json({ ok: true }));

// --- Page Routes ---
const PUBLIC = path.join(__dirname, '..', 'public');

function page(file) {
  return (req, res) => res.sendFile(path.join(PUBLIC, 'pages', file));
}

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/login', page('login.html'));
app.get('/register', page('register.html'));
app.get('/settings', page('settings.html'));
app.get('/authors', page('authorSearch.html'));
app.get('/works', page('workSearch.html'));
app.get('/author/:id', page('author.html'));    // пример страницы автора
app.get('/work/:id', page('work.html'));        // пример страницы произведения
app.get('/chapter/:id', page('chapter.html'));  // пример страницы главы

// --- API Routes ---
app.use('/api', authRoutes);

// --- 404 fallback for pages ---
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) return next(); // API errors handled below
  // res.status(404).sendFile(path.join(PUBLIC, 'pages', '404.html')); // можно создать простую 404.html
});

// --- Error handler ---
app.use((err, req, res, next) => {
  logger.log(`ERROR ${req.method} ${req.url} ${err.message}`);
  console.error(err);
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
  res.status(500).send('Internal Server Error');
});

module.exports = app;