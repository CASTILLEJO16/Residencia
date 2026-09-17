'use strict';
const { sql, query } = require('../config/database');
const { parsePagination, buildMeta, safeSort } = require('../utils/pagination');

/** Columnas publicas: nunca se expone password_hash. */
const PUBLIC_FIELDS = `
  u.id, u.username, u.email, u.full_name, u.role_id, r.name AS role_name,
  u.is_active, u.must_change_password, u.last_login, u.created_at, u.updated_at`;

const SORTABLE = ['username', 'email', 'full_name', 'created_at', 'last_login'];

async function findById(id) {
  const result = await query(
    `SELECT ${PUBLIC_FIELDS}
     FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id
     WHERE u.id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

/** Incluye el hash y los campos de bloqueo. Solo para el flujo de login. */
async function findByUsernameWithSecret(username) {
  const result = await query(
    `SELECT u.id, u.username, u.email, u.full_name, u.password_hash, u.role_id,
            r.name AS role_name, u.is_active, u.must_change_password,
            u.failed_login_attempts, u.locked_until
     FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id
     WHERE u.username = @username`,
    [{ name: 'username', type: sql.NVarChar(50), value: username }]
  );
  return result.recordset[0] || null;
}

async function findPasswordHash(id) {
  const result = await query(
    `SELECT password_hash FROM dbo.users WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0]?.password_hash || null;
}

async function existsByUsernameOrEmail(username, email, excludeId = null) {
  const result = await query(
    `SELECT TOP 1 id FROM dbo.users
     WHERE (username = @username OR email = @email)
       AND (@excludeId IS NULL OR id <> @excludeId)`,
    [
      { name: 'username', type: sql.NVarChar(50), value: username },
      { name: 'email', type: sql.NVarChar(150), value: email },
      { name: 'excludeId', type: sql.Int, value: excludeId },
    ]
  );
  return result.recordset.length > 0;
}

async function list(queryParams) {
  const { page, limit, offset } = parsePagination(queryParams);
  const { column, direction } = safeSort(queryParams.sort, SORTABLE, 'created_at');
  const search = queryParams.search ? `%${queryParams.search}%` : null;
  const roleId = queryParams.roleId ? parseInt(queryParams.roleId, 10) : null;
  const isActive = queryParams.isActive === undefined || queryParams.isActive === ''
    ? null : queryParams.isActive === 'true';

  const params = [
    { name: 'search', type: sql.NVarChar(200), value: search },
    { name: 'roleId', type: sql.Int, value: roleId },
    { name: 'isActive', type: sql.Bit, value: isActive },
    { name: 'offset', type: sql.Int, value: offset },
    { name: 'limit', type: sql.Int, value: limit },
  ];

  const where = `
    WHERE (@search IS NULL OR u.username LIKE @search OR u.full_name LIKE @search OR u.email LIKE @search)
      AND (@roleId IS NULL OR u.role_id = @roleId)
      AND (@isActive IS NULL OR u.is_active = @isActive)`;

  const rows = await query(
    `SELECT ${PUBLIC_FIELDS}
     FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id
     ${where}
     ORDER BY u.${column} ${direction}
     OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    params
  );

  const count = await query(
    `SELECT COUNT(*) AS total
     FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id ${where}`,
    params.slice(0, 3)
  );

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create({ username, email, fullName, passwordHash, roleId, mustChangePassword = true }) {
  const result = await query(
    `INSERT INTO dbo.users (username, email, full_name, password_hash, role_id, must_change_password)
     OUTPUT INSERTED.id
     VALUES (@username, @email, @fullName, @passwordHash, @roleId, @mustChange)`,
    [
      { name: 'username', type: sql.NVarChar(50), value: username },
      { name: 'email', type: sql.NVarChar(150), value: email },
      { name: 'fullName', type: sql.NVarChar(150), value: fullName },
      { name: 'passwordHash', type: sql.NVarChar(255), value: passwordHash },
      { name: 'roleId', type: sql.Int, value: roleId },
      { name: 'mustChange', type: sql.Bit, value: mustChangePassword },
    ]
  );
  return findById(result.recordset[0].id);
}

async function update(id, { email, fullName, roleId, isActive }) {
  await query(
    `UPDATE dbo.users
     SET email      = COALESCE(@email, email),
         full_name  = COALESCE(@fullName, full_name),
         role_id    = COALESCE(@roleId, role_id),
         is_active  = COALESCE(@isActive, is_active)
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'email', type: sql.NVarChar(150), value: email ?? null },
      { name: 'fullName', type: sql.NVarChar(150), value: fullName ?? null },
      { name: 'roleId', type: sql.Int, value: roleId ?? null },
      { name: 'isActive', type: sql.Bit, value: isActive ?? null },
    ]
  );
  return findById(id);
}

async function setPassword(id, passwordHash, { mustChange = false } = {}) {
  await query(
    `UPDATE dbo.users
     SET password_hash = @hash,
         must_change_password = @mustChange,
         failed_login_attempts = 0,
         locked_until = NULL
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'hash', type: sql.NVarChar(255), value: passwordHash },
      { name: 'mustChange', type: sql.Bit, value: mustChange },
    ]
  );
}

async function setActive(id, isActive) {
  await query(
    `UPDATE dbo.users SET is_active = @isActive WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'isActive', type: sql.Bit, value: isActive },
    ]
  );
  return findById(id);
}

async function registerSuccessfulLogin(id) {
  await query(
    `UPDATE dbo.users
     SET last_login = SYSUTCDATETIME(), failed_login_attempts = 0, locked_until = NULL
     WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
}

/** Incrementa el contador y bloquea la cuenta si se pasa del limite. */
async function registerFailedLogin(id, maxAttempts, lockoutMinutes) {
  const result = await query(
    `UPDATE dbo.users
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE
             WHEN failed_login_attempts + 1 >= @maxAttempts
             THEN DATEADD(MINUTE, @lockout, SYSUTCDATETIME())
             ELSE locked_until END
     OUTPUT INSERTED.failed_login_attempts, INSERTED.locked_until
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'maxAttempts', type: sql.Int, value: maxAttempts },
      { name: 'lockout', type: sql.Int, value: lockoutMinutes },
    ]
  );
  return result.recordset[0];
}

async function unlock(id) {
  await query(
    `UPDATE dbo.users SET failed_login_attempts = 0, locked_until = NULL WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return findById(id);
}

/** Verificacion ligera en cada peticion: detecta desactivaciones al vuelo. */
async function getAuthState(id) {
  const result = await query(
    `SELECT u.id, u.username, u.is_active, u.must_change_password,
            u.role_id, r.name AS role_name
     FROM dbo.users u INNER JOIN dbo.roles r ON r.id = u.role_id
     WHERE u.id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.recordset[0] || null;
}

module.exports = {
  findById, findByUsernameWithSecret, findPasswordHash, existsByUsernameOrEmail,
  list, create, update, setPassword, setActive,
  registerSuccessfulLogin, registerFailedLogin, unlock, getAuthState,
};
