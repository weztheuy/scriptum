// web-app/src/modules/auth/auth.controller.js
const service = require('./auth.service');
const logger = require('../../shared/utils/logger');

async function register(req, res, next) {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ error: 'missing_fields' });
    await service.registerPending({ username, email, password });
    logger.log(`REGISTER_ATTEMPT ${email}`);
    return res.json({ ok: true });
  } catch (err) { next(err); }
}

async function verifyCode(req, res, next) {
  try {
    const { code, email } = req.body;
    if (!code || !email) return res.status(400).json({ error: 'missing_code_or_email' });
    const user = await service.verifyAndCreateUserByCode({ code, email });
    if (!user) return res.status(400).json({ error: 'invalid_code' });
    logger.log(`REGISTER_CONFIRMED ${user.email}`);
    return res.json({ ok: true, redirect: '/' });
  } catch (err) { next(err); }
}

async function resendCode(req, res, next) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'missing_email' });
    await service.resendVerification(email);
    logger.log(`RESEND_VERIFICATION ${email}`);
    return res.json({ ok: true });
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'missing_fields' });

    const token = await service.loginAndGetToken({ email, password });
    if (!token) return res.status(401).json({ error: 'invalid_credentials' });

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true // включить в production с HTTPS
    });
    logger.log(`LOGIN ${email}`);
    return res.json({ ok: true, redirect: '/' });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    res.clearCookie('token', { path: '/' });
    logger.log(`LOGOUT`);
    return res.json({ ok: true });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    const info = await service.getUserFromRequest(req);
    if (!info) return res.status(401).json({ error: 'unauthorized' });
    return res.json(info);
  } catch (err) { next(err); }
}

module.exports = { register, verifyCode, resendCode, login, logout, me };
