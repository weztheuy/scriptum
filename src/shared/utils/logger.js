// web-app/src/shared/utils/logger.js
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', '..', 'storage', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function log(msg) {
  const line = `[${timestamp()}] ${msg}\n`;
  const file = path.join(LOG_DIR, `${new Date().toISOString().slice(0,10)}.log`);
  try {
    fs.appendFileSync(file, line, 'utf8');
  } catch (e) {
    // fallback to console
    console.error('Failed to write log', e);
  }
}

module.exports = { log };
