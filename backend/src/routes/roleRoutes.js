'use strict';
const router = require('express').Router();
const controller = require('../controllers/roleController');
const validate = require('../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const { idParam } = require('../validators/userValidators');
const v = require('../validators/roleValidators');

router.use(authenticate, requirePasswordChanged);

// Cualquier usuario autenticado puede listar roles (los formularios los necesitan).
router.get('/', controller.list);
router.get('/:id', validate({ params: idParam }), controller.getById);

router.post('/', requireRole(ROLES.ADMIN),
  validate({ body: v.createRoleSchema }), controller.create);

router.put('/:id', requireRole(ROLES.ADMIN),
  validate({ params: idParam, body: v.updateRoleSchema }), controller.update);

router.delete('/:id', requireRole(ROLES.ADMIN),
  validate({ params: idParam }), controller.remove);

module.exports = router;
