'use strict';
const router = require('express').Router();
const controller = require('../controllers/auditController');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

router.use(authenticate, requirePasswordChanged);
router.get('/', requireRole(ROLES.ADMIN, ROLES.AUDITORIA), controller.list);

module.exports = router;
