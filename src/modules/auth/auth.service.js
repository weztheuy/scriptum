// web-app/src/modules/auth/auth.service.js
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const logger = require('../../shared/utils/logger');

const STORAGE = path.join(__dirname, '..', '..', '..', 'storage');
const EMAILS_DIR = path.join(STORAGE, 'emails');
const USERS_FILE = path.join(STORAGE, 'db', 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_EXPIRES = '7d';

const { randomInt } = require('crypto');

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }

function sanitizeEmailDir(email) { return encodeURIComponent(email.toLowerCase()); }

function genCode() { return String(Math.floor(10000 + Math.random() * 90000)); }

async function writeEmailCode(email, code) {
  const dir = path.join(EMAILS_DIR, sanitizeEmailDir(email));
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, 'code.txt'), code, 'utf8');
  await fs.writeFile(path.join(dir, `${Date.now()}.txt`), `code:${code}\nemail:${email}\nts:${new Date().toISOString()}`, 'utf8');
}

async function savePending(email, data) {
  const dir = path.join(EMAILS_DIR, sanitizeEmailDir(email));
  await ensureDir(dir);
  await fs.writeFile(path.join(dir, 'pending.json'), JSON.stringify(data, null, 2), 'utf8');
}

async function readPending(email) {
  const dir = path.join(EMAILS_DIR, sanitizeEmailDir(email));
  const pendingFile = path.join(dir, 'pending.json');
  try { return JSON.parse(await fs.readFile(pendingFile, 'utf8')); } catch (e) { return null; }
}

async function readCodeFile(email) {
  const dir = path.join(EMAILS_DIR, sanitizeEmailDir(email));
  try { return (await fs.readFile(path.join(dir, 'code.txt'), 'utf8')).trim(); } catch { return null; }
}

async function ensureUsersFile() {
  const dir = path.dirname(USERS_FILE);
  await ensureDir(dir);
  try { await fs.access(USERS_FILE); } catch { await fs.writeFile(USERS_FILE, '[]', 'utf8'); }
}

async function readUsers() { await ensureUsersFile(); return JSON.parse(await fs.readFile(USERS_FILE, 'utf8') || '[]'); }
async function writeUsers(users) { await ensureUsersFile(); await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8'); }
async function findUserByEmail(email) { const users = await readUsers(); return users.find(u => u.email.toLowerCase() === email.toLowerCase()); }

async function registerPending({ username, email, password }) {
  const code = genCode();
  const passwordHash = await bcrypt.hash(password, 10);
  await savePending(email, { username, email, passwordHash, createdAt: new Date().toISOString() });
  await writeEmailCode(email, code);
  logger.log(`VERIFICATION_CODE_GENERATED ${email} code=${code}`);
  return true;
}

async function verifyAndCreateUserByCode({ code, email }) {
  const pending = await readPending(email);
  if (!pending) return null;
  const actualCode = await readCodeFile(email);
  if (actualCode !== String(code).trim()) return null;

  const exists = await findUserByEmail(email);
  if (exists) return null;

  const users = await readUsers();
  const user = {
    id: Date.now(),
    username: pending.username,
    email: pending.email,
    passwordHash: pending.passwordHash,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  await writeUsers(users);
  logger.log(`USER_CREATED ${user.email}`);

  // cleanup
  const dir = path.join(EMAILS_DIR, sanitizeEmailDir(email));
  await fs.rm(path.join(dir, 'pending.json'), { force: true });
  await fs.rm(path.join(dir, 'code.txt'), { force: true });

  return { id: user.id, username: user.username, email: user.email };
}

async function resendVerification(email) {
  const pending = await readPending(email);
  if (!pending) throw new Error('no_pending');
  const code = genCode();
  await writeEmailCode(email, code);
  logger.log(`VERIFICATION_CODE_RESENT ${email} code=${code}`);
  return true;
}

function signToken(user) {
  const payload = { sub: user.id, email: user.email, username: user.username };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

async function loginAndGetToken({ email, password }) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return signToken(user);
}

async function getUserFromRequest(req) {
  const token = (req.cookies && req.cookies.token) || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = await readUsers();
    return users.find(u => u.id === payload.sub) || null;
  } catch { return null; }
}

module.exports = {
  registerPending,
  verifyAndCreateUserByCode,
  resendVerification,
  loginAndGetToken,
  getUserFromRequest
};
