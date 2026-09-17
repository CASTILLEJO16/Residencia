'use strict';
const AuditLogModel = require('../models/AuditLogModel');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/audit - consulta filtrada del registro de auditoria. */
const list = asyncHandler(async (req, res) => {
  const result = await AuditLogModel.list(req.query);
  res.json({ success: true, ...result });
});

module.exports = { list };
