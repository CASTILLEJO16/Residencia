'use strict';
const UserModel = require('../models/UserModel');
const RoleModel = require('../models/RoleModel');
const RefreshTokenModel = require('../models/RefreshTokenModel');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const password = require('../utils/password');
const { audit } = require('../middleware/auditMiddleware');
const { ROLES } = require('../middleware/roleMiddleware');

/** GET /api/users */
const list = asyncHandler(async (req, res) => {
  const result = await UserModel.list(req.validatedQuery || req.query);
  res.json({ success: true, ...result });
});

/** GET /api/users/:id */
const getById = asyncHandler(async (req, res) => {
  const user = await UserModel.findById(req.params.id);
  if (!user) throw AppError.notFound('Usuario no encontrado');
  res.json({ success: true, data: user });
});

/** POST /api/users */
const create = asyncHandler(async (req, res) => {
  const { username, email, fullName, roleId, password: plain, mustChangePassword } = req.body;

  const role = await RoleModel.findById(roleId);
  if (!role) throw AppError.badRequest('El rol indicado no existe');

  if (await UserModel.existsByUsernameOrEmail(username, email)) {
    throw AppError.conflict('El usuario o el correo ya estan registrados');
  }

  const user = await UserModel.create({
    username, email, fullName, roleId,
    passwordHash: await password.hash(plain),
    mustChangePassword,
  });

  audit(res, {
    action: 'user.create', entityType: 'user', entityId: user.id,
    newValues: { username, email, fullName, role: role.name },
  });

  res.status(201).json({ success: true, data: user });
});

/** PUT /api/users/:id */
const update = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const before = await UserModel.findById(id);
  if (!before) throw AppError.notFound('Usuario no encontrado');

  const { email, fullName, roleId, isActive } = req.body;

  // Un administrador no puede quitarse a si mismo el rol ni desactivarse:
  // evita quedarse fuera del sistema por accidente.
  if (req.user.id === Number(id)) {
    if (isActive === false) throw AppError.badRequest('No puede desactivar su propia cuenta');
    if (roleId && roleId !== before.role_id) {
      throw AppError.badRequest('No puede cambiar su propio rol');
    }
  }

  if (roleId) {
    const role = await RoleModel.findById(roleId);
    if (!role) throw AppError.badRequest('El rol indicado no existe');
    if (before.role_name === ROLES.ADMIN && role.name !== ROLES.ADMIN) {
      await ensureAnotherAdminExists(id);
    }
  }

  if (email && await UserModel.existsByUsernameOrEmail(before.username, email, Number(id))) {
    throw AppError.conflict('El correo ya esta registrado por otro usuario');
  }

  const after = await UserModel.update(id, { email, fullName, roleId, isActive });

  // Si se desactiva o cambia de rol, las sesiones vigentes dejan de valer.
  if (isActive === false || (roleId && roleId !== before.role_id)) {
    await RefreshTokenModel.revokeAllForUser(Number(id));
  }

  audit(res, {
    action: 'user.update', entityType: 'user', entityId: id,
    oldValues: pickAuditable(before), newValues: pickAuditable(after),
  });

  res.json({ success: true, data: after });
});

/** PATCH /api/users/:id/status */
const setStatus = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const isActive = req.body.isActive === true;

  if (req.user.id === id && !isActive) {
    throw AppError.badRequest('No puede desactivar su propia cuenta');
  }

  const before = await UserModel.findById(id);
  if (!before) throw AppError.notFound('Usuario no encontrado');
  if (!isActive && before.role_name === ROLES.ADMIN) await ensureAnotherAdminExists(id);

  const after = await UserModel.setActive(id, isActive);
  if (!isActive) await RefreshTokenModel.revokeAllForUser(id);

  audit(res, {
    action: isActive ? 'user.activate' : 'user.deactivate',
    entityType: 'user', entityId: id,
    oldValues: { isActive: before.is_active }, newValues: { isActive },
  });

  res.json({ success: true, data: after });
});

/** POST /api/users/:id/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = await UserModel.findById(id);
  if (!user) throw AppError.notFound('Usuario no encontrado');

  const { newPassword, mustChangePassword } = req.body;
  await UserModel.setPassword(id, await password.hash(newPassword), {
    mustChange: mustChangePassword,
  });
  await RefreshTokenModel.revokeAllForUser(id);

  // La contrasena nueva jamas se escribe en la auditoria.
  audit(res, {
    action: 'user.password_reset', entityType: 'user', entityId: id,
    newValues: { mustChangePassword, resetBy: req.user.username },
  });

  res.json({ success: true, data: { message: 'Contrasena restablecida' } });
});

/** POST /api/users/:id/unlock */
const unlock = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const user = await UserModel.findById(id);
  if (!user) throw AppError.notFound('Usuario no encontrado');

  const after = await UserModel.unlock(id);
  audit(res, { action: 'user.unlock', entityType: 'user', entityId: id });
  res.json({ success: true, data: after });
});

/**
 * No se borran usuarios: se desactivan. Las llaves foraneas de tickets,
 * KPIs y auditoria dependen de que el registro siga existiendo.
 */
async function ensureAnotherAdminExists(excludeId) {
  const admins = await UserModel.list({ limit: 100, isActive: 'true' });
  const remaining = admins.data.filter(
    (u) => u.role_name === ROLES.ADMIN && u.id !== Number(excludeId)
  );
  if (remaining.length === 0) {
    throw AppError.conflict('Debe existir al menos un administrador activo');
  }
}

function pickAuditable(user) {
  if (!user) return null;
  return {
    email: user.email,
    fullName: user.full_name,
    roleId: user.role_id,
    role: user.role_name,
    isActive: user.is_active,
  };
}

module.exports = { list, getById, create, update, setStatus, resetPassword, unlock };
