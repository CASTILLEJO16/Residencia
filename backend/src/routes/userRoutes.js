'use strict';
const router = require('express').Router();
const controller = require('../controllers/userController');
const validate = require('../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const v = require('../validators/userValidators');

router.use(authenticate, requirePasswordChanged);

// Consultar usuarios: admin y auditoria.
router.get('/', requireRole(ROLES.ADMIN, ROLES.AUDITORIA),
  validate({ query: v.listUsersSchema }), controller.list);

router.get('/:id', requireRole(ROLES.ADMIN, ROLES.AUDITORIA),
  validate({ params: v.idParam }), controller.getById);

// Modificar usuarios: solo admin.
router.post('/', requireRole(ROLES.ADMIN),
  validate({ body: v.createUserSchema }), controller.create);

router.put('/:id', requireRole(ROLES.ADMIN),
  validate({ params: v.idParam, body: v.updateUserSchema }), controller.update);

router.patch('/:id/status', requireRole(ROLES.ADMIN),
  validate({ params: v.idParam }), controller.setStatus);

router.post('/:id/reset-password', requireRole(ROLES.ADMIN),
  validate({ params: v.idParam, body: v.resetPasswordSchema }), controller.resetPassword);

router.post('/:id/unlock', requireRole(ROLES.ADMIN),
  validate({ params: v.idParam }), controller.unlock);

module.exports = router;
