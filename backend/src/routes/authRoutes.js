'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/authController');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authMiddleware');
const v = require('../validators/authValidators');

/** El login se limita por IP como primera barrera contra fuerza bruta. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Demasiados intentos. Espere unos minutos.' } },
});

router.post('/login',   loginLimiter, validate({ body: v.loginSchema }),   controller.login);
router.post('/refresh', validate({ body: v.refreshSchema }),               controller.refresh);
router.post('/logout',  controller.logout);

router.get('/me',              authenticate, controller.me);
router.post('/logout-all',     authenticate, controller.logoutAll);
router.post('/change-password', authenticate,
  validate({ body: v.changePasswordSchema }), controller.changePassword);

module.exports = router;
