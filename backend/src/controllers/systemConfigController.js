'use strict';
const SystemConfigModel = require('../models/SystemConfigModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { audit } = require('../middleware/auditMiddleware');

const list = asyncHandler(async (req, res) => {
  const configs = await SystemConfigModel.findAll();
  // Ocultar valores secretos
  const safeConfigs = configs.map(c => ({
    ...c,
    value: c.is_secret ? '******' : c.value,
  }));
  res.json({ success: true, data: safeConfigs });
});

const getById = asyncHandler(async (req, res) => {
  const config = await SystemConfigModel.findById(req.params.id);
  if (!config) throw AppError.notFound('Configuración no encontrada');
  
  // Ocultar valor secreto
  const safeConfig = {
    ...config,
    value: config.is_secret ? '******' : config.value,
  };
  res.json({ success: true, data: safeConfig });
});

const create = asyncHandler(async (req, res) => {
  const { keyName, value, valueType, description, isSecret } = req.body;
  
  if (await SystemConfigModel.findByKey(keyName)) {
    throw AppError.conflict('Ya existe una configuración con esa clave');
  }

  const config = await SystemConfigModel.create({
    keyName,
    value,
    valueType,
    description,
    isSecret,
  });
  
  audit(res, {
    action: 'config.create',
    entityType: 'system_config',
    entityId: config.id,
    newValues: { keyName, valueType, description, isSecret },
  });
  
  res.status(201).json({ success: true, data: config });
});

const update = asyncHandler(async (req, res) => {
  const before = await SystemConfigModel.findById(req.params.id);
  if (!before) throw AppError.notFound('Configuración no encontrada');

  const { value, description } = req.body;
  const after = await SystemConfigModel.update(req.params.id, {
    value,
    description,
    updatedBy: req.user.id,
  });
  
  audit(res, {
    action: 'config.update',
    entityType: 'system_config',
    entityId: req.params.id,
    oldValues: { keyName: before.key_name, value: before.is_secret ? '******' : before.value },
    newValues: { keyName: after.key_name, value: after.is_secret ? '******' : after.value },
  });
  
  res.json({ success: true, data: after });
});

const remove = asyncHandler(async (req, res) => {
  const config = await SystemConfigModel.findById(req.params.id);
  if (!config) throw AppError.notFound('Configuración no encontrada');

  await SystemConfigModel.remove(req.params.id);
  
  audit(res, {
    action: 'config.delete',
    entityType: 'system_config',
    entityId: req.params.id,
    oldValues: { keyName: config.key_name },
  });
  
  res.json({ success: true, data: { message: 'Configuración eliminada' } });
});

module.exports = { list, getById, create, update, remove };
