'use strict';
const router = require('express').Router();
const controller = require('../controllers/kpiController');
const validate = require('../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const { idParam } = require('../validators/userValidators');
const v = require('../validators/kpiValidators');

router.use(authenticate, requirePasswordChanged);

const CAN_READ = [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA, ROLES.AUDITORIA];
const CAN_EDIT = [ROLES.ADMIN, ROLES.ANALISTA];

// El dashboard va antes que /:id para que "dashboard" no se lea como un id.
router.get('/dashboard', requireRole(CAN_READ), controller.dashboard);

router.post('/validate', requireRole(CAN_EDIT),
  validate({ body: v.validateSchema }), controller.validateQuery);

router.post('/preview', requireRole(CAN_EDIT),
  validate({ body: v.previewSchema }), controller.preview);

router.get('/', requireRole(CAN_READ), validate({ query: v.listKpisSchema }), controller.list);
router.get('/:id', requireRole(CAN_READ), validate({ params: idParam }), controller.getById);
router.get('/:id/data', requireRole(CAN_READ), validate({ params: idParam }), controller.getData);
router.get('/:id/history', requireRole(CAN_READ), validate({ params: idParam }), controller.history);

router.post('/', requireRole(CAN_EDIT), validate({ body: v.createKpiSchema }), controller.create);
router.put('/:id', requireRole(CAN_EDIT),
  validate({ params: idParam, body: v.updateKpiSchema }), controller.update);
router.delete('/:id', requireRole(ROLES.ADMIN), validate({ params: idParam }), controller.remove);

module.exports = router;
