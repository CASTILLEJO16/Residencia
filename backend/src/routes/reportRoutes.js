'use strict';
const router = require('express').Router();
const controller = require('../controllers/reportController');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

router.use(authenticate, requirePasswordChanged);

const CAN_READ = [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA, ROLES.AUDITORIA];

router.get('/', requireRole(CAN_READ), controller.catalog);
router.get('/summary', requireRole(CAN_READ), controller.summary);
router.get('/:type', requireRole(CAN_READ), controller.preview);
router.get('/:type/export', requireRole(CAN_READ), controller.exportReport);

module.exports = router;
