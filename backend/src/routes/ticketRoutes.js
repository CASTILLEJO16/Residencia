'use strict';
const router = require('express').Router();
const controller = require('../controllers/ticketController');
const validate = require('../middleware/validate');
const { authenticate, requirePasswordChanged } = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const { idParam } = require('../validators/userValidators');
const v = require('../validators/ticketValidators');

router.use(authenticate, requirePasswordChanged);

const CAN_READ = [ROLES.ADMIN, ROLES.ANALISTA, ROLES.CONSULTA, ROLES.AUDITORIA];
const CAN_EDIT = [ROLES.ADMIN, ROLES.ANALISTA];

router.get('/summary', requireRole(CAN_READ), controller.summary);
router.get('/', requireRole(CAN_READ), validate({ query: v.listTicketsSchema }), controller.list);
router.get('/:id', requireRole(CAN_READ), validate({ params: idParam }), controller.getById);
router.get('/:id/history', requireRole(CAN_READ), validate({ params: idParam }), controller.getHistory);

router.post('/', requireRole(CAN_EDIT), validate({ body: v.createTicketSchema }), controller.create);
router.put('/:id', requireRole(CAN_EDIT),
  validate({ params: idParam, body: v.updateTicketSchema }), controller.update);
router.post('/:id/assign', requireRole(CAN_EDIT),
  validate({ params: idParam, body: v.assignSchema }), controller.assign);
router.post('/:id/escalate', requireRole(CAN_EDIT),
  validate({ params: idParam, body: v.escalateSchema }), controller.escalate);
router.patch('/:id/status', requireRole(CAN_EDIT),
  validate({ params: idParam, body: v.statusSchema }), controller.changeStatus);
router.post('/:id/comments', requireRole(CAN_EDIT),
  validate({ params: idParam, body: v.commentSchema }), controller.addComment);

module.exports = router;
