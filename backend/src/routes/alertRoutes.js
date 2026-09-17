'use strict';
const router = require('express').Router();
const controller = require('../controllers/alertController');
const validate = require('../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const { idParam } = require('../validators/userValidators');

router.use(authenticate, requirePasswordChanged);

const CAN_READ = [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA, ROLES.AUDITORIA];
const CAN_ACT = [ROLES.ADMIN, ROLES.ANALISTA];

router.get('/summary', requireRole(CAN_READ), controller.summary);
router.get('/monitor', requireRole(CAN_ACT), controller.monitorStatus);
router.post('/monitor/run', requireRole(ROLES.ADMIN), controller.runMonitor);

router.get('/', requireRole(CAN_READ), controller.list);
router.get('/:id', requireRole(CAN_READ), validate({ params: idParam }), controller.getById);
router.post('/:id/acknowledge', requireRole(CAN_ACT), validate({ params: idParam }), controller.acknowledge);
router.post('/:id/resolve', requireRole(CAN_ACT), validate({ params: idParam }), controller.resolve);

module.exports = router;
