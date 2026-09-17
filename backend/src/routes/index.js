'use strict';
const router = require('express').Router();

router.use('/auth',       require('./authRoutes'));
router.use('/users',      require('./userRoutes'));
router.use('/roles',      require('./roleRoutes'));
router.use('/kpis',       require('./kpiRoutes'));
router.use('/thresholds', require('./thresholdRoutes'));
router.use('/alerts',     require('./alertRoutes'));
router.use('/tickets',    require('./ticketRoutes'));
router.use('/reports',    require('./reportRoutes'));
router.use('/audit',      require('./auditRoutes'));
router.use('/config',     require('./systemConfigRoutes'));

module.exports = router;
