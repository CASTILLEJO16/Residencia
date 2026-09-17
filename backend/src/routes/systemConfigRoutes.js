'use strict';
const router = require('express').Router();
const controller = require('../controllers/systemConfigController');
const validate = require('../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const { idParam } = require('../validators/userValidators');
const v = require('../validators/systemConfigValidators');

router.use(authenticate, requirePasswordChanged);

// Solo admin puede gestionar configuración del sistema
router.get('/', requireRole(ROLES.ADMIN), controller.list);
router.get('/:id', requireRole(ROLES.ADMIN), validate({ params: idParam }), controller.getById);

router.post('/', requireRole(ROLES.ADMIN),
  validate({ body: v.createConfigSchema }), controller.create);

router.put('/:id', requireRole(ROLES.ADMIN),
  validate({ params: idParam, body: v.updateConfigSchema }), controller.update);

router.delete('/:id', requireRole(ROLES.ADMIN),
  validate({ params: idParam }), controller.remove);

module.exports = router;
