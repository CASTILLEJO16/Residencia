'use strict';
const router = require('express').Router();
const controller = require('../controllers/thresholdController');
const validate = require('../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const { idParam } = require('../validators/userValidators');
const v = require('../validators/thresholdValidators');

router.use(authenticate, requirePasswordChanged);

const CAN_READ = [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA, ROLES.AUDITORIA];
const CAN_EDIT = [ROLES.ADMIN, ROLES.ANALISTA];

router.get('/', requireRole(CAN_READ), controller.list);
router.get('/:id', requireRole(CAN_READ), validate({ params: idParam }), controller.getById);

router.post('/', requireRole(CAN_EDIT),
  validate({ body: v.createThresholdSchema }), controller.create);
router.put('/:id', requireRole(CAN_EDIT),
  validate({ params: idParam, body: v.updateThresholdSchema }), controller.update);
router.delete('/:id', requireRole(CAN_EDIT), validate({ params: idParam }), controller.remove);
router.post('/:id/test', requireRole(CAN_EDIT), validate({ params: idParam }), controller.test);

module.exports = router;
