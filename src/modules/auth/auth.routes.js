// web-app/src/modules/auth/auth.routes.js
const express = require('express');
const router = express.Router();
const controller = require('./auth.controller');

router.post('/register', controller.register);               // { username,email,password }
router.post('/verify', controller.verifyCode);               // { code }
router.post('/resend-verification', controller.resendCode);  // { email? optionally }
router.post('/login', controller.login);                     // { email,password }
router.post('/logout', controller.logout);                   // clears cookie
router.get('/me', controller.me);                            // returns user info if authenticated

module.exports = router;
