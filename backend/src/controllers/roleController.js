'use strict';
const RoleModel = require('../models/RoleModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../middleware/auditMiddleware');

const list = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await RoleModel.findAll() });
});

const getById = asyncHandler(async (req, res) => {
  const role = await RoleModel.findById(req.params.id);
  if (!role) throw AppError.notFound('Rol no encontrado');
  res.json({ success: true, data: role });
});

const create = asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (await RoleModel.findByName(name)) throw AppError.conflict('Ya existe un rol con ese nombre');

  const role = await RoleModel.create({ name, description });
  audit(res, { action: 'role.create', entityType: 'role', entityId: role.id, newValues: { name, description } });
  res.status(201).json({ success: true, data: role });
});

const update = asyncHandler(async (req, res) => {
  const before = await RoleModel.findById(req.params.id);
  if (!before) throw AppError.notFound('Rol no encontrado');
  if (before.is_system) throw AppError.forbidden('Los roles del sistema no se pueden modificar');

  const after = await RoleModel.update(req.params.id, req.body);
  audit(res, {
    action: 'role.update', entityType: 'role', entityId: req.params.id,
    oldValues: { name: before.name, description: before.description },
    newValues: { name: after.name, description: after.description },
  });
  res.json({ success: true, data: after });
});

const remove = asyncHandler(async (req, res) => {
  const role = await RoleModel.findById(req.params.id);
  if (!role) throw AppError.notFound('Rol no encontrado');
  if (role.is_system) throw AppError.forbidden('Los roles del sistema no se pueden eliminar');
  if (role.user_count > 0) {
    throw AppError.conflict(`El rol tiene ${role.user_count} usuario(s) asignado(s)`);
  }

  await RoleModel.remove(req.params.id);
  audit(res, {
    action: 'role.delete', entityType: 'role', entityId: req.params.id,
    oldValues: { name: role.name },
  });
  res.json({ success: true, data: { message: 'Rol eliminado' } });
});

module.exports = { list, getById, create, update, remove };
