'use strict';
const { query, getLastInsertId } = require('../config/database');
const { parsePagination, buildMeta, safeSort } = require('../utils/pagination');

/** Columnas publicas: nunca se expone password_hash. */
const PUBLIC_FIELDS = `
  u.id, u.username, u.email, u.full_name, u.role_id, r.name AS role_name,
  u.is_active, u.must_change_password, u.last_login, u.created_at, u.updated_at`;

const SORTABLE = ['username', 'email', 'full_name', 'created_at', 'last_login'];

async function findById(id) {
  const result = await query(
    `SELECT ${PUBLIC_FIELDS}
     FROM users u INNER JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [id]
  );
  return result.recordset[0] || null;
}

/** Incluye el hash y los campos de bloqueo. Solo para el flujo de login. */
async function findByUsernameWithSecret(username) {
  const result = await query(
    `SELECT u.id, u.username, u.email, u.full_name, u.password_hash, u.role_id,
            r.name AS role_name, u.is_active, u.must_change_password,
            u.failed_login_attempts, u.locked_until
     FROM users u INNER JOIN roles r ON r.id = u.role_id
     WHERE u.username = ?`,
    [username]
  );
  return result.recordset[0] || null;
}

async function findPasswordHash(id) {
  const result = await query(
    `SELECT password_hash FROM users WHERE id = ?`,
    [id]
  );
  return result.recordset[0]?.password_hash || null;
}

async function existsByUsernameOrEmail(username, email, excludeId = null) {
  const result = await query(
    `SELECT id FROM users
     WHERE (username = ? OR email = ?)
       AND (? IS NULL OR id <> ?)
     LIMIT 1`,
    [username, email, excludeId, excludeId]
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

  const params = [search, roleId, isActive, offset, limit];

  const where = `
    WHERE (? IS NULL OR u.username LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)
      AND (? IS NULL OR u.role_id = ?)
      AND (? IS NULL OR u.is_active = ?)`;

  const rows = await query(
    `SELECT ${PUBLIC_FIELDS}
     FROM users u INNER JOIN roles r ON r.id = u.role_id
     ${where}
     ORDER BY u.${column} ${direction}
     LIMIT ? OFFSET ?`,
    [search, search, search, search, roleId, roleId, isActive, isActive, limit, offset]
  );

  const count = await query(
    `SELECT COUNT(*) AS total
     FROM users u INNER JOIN roles r ON r.id = u.role_id ${where}`,
    [search, search, search, search, roleId, roleId, isActive, isActive]
  );

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create({ username, email, fullName, passwordHash, roleId, mustChangePassword = true }) {
  await query(
    `INSERT INTO users (username, email, full_name, password_hash, role_id, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [username, email, fullName, passwordHash, roleId, mustChangePassword]
  );
  const id = getLastInsertId();
  return findById(id);
}

async function update(id, { email, fullName, roleId, isActive }) {
  await query(
    `UPDATE users
     SET email      = COALESCE(?, email),
         full_name  = COALESCE(?, full_name),
         role_id    = COALESCE(?, role_id),
         is_active  = COALESCE(?, is_active)
     WHERE id = ?`,
    [email, fullName, roleId, isActive, id]
  );
  return findById(id);
}

async function setPassword(id, passwordHash, { mustChange = false } = {}) {
  await query(
    `UPDATE users
     SET password_hash = ?,
         must_change_password = ?,
         failed_login_attempts = 0,
         locked_until = NULL
     WHERE id = ?`,
    [passwordHash, mustChange, id]
  );
}

async function setActive(id, isActive) {
  await query(
    `UPDATE users SET is_active = ? WHERE id = ?`,
    [isActive, id]
  );
  return findById(id);
}

async function registerSuccessfulLogin(id) {
  await query(
    `UPDATE users
     SET last_login = datetime('now'), failed_login_attempts = 0, locked_until = NULL
     WHERE id = ?`,
    [id]
  );
}

/** Incrementa el contador y bloquea la cuenta si se pasa del limite. */
async function registerFailedLogin(id, maxAttempts, lockoutMinutes) {
  await query(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE
             WHEN failed_login_attempts + 1 >= ?
             THEN datetime('now', '+' || ? || ' minutes')
             ELSE locked_until END
     WHERE id = ?`,
    [maxAttempts, lockoutMinutes, id]
  );
  const result = await query(
    `SELECT failed_login_attempts, locked_until FROM users WHERE id = ?`,
    [id]
  );
  return result.recordset[0];
}

async function unlock(id) {
  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
    [id]
  );
  return findById(id);
}

/** Verificacion ligera en cada peticion: detecta desactivaciones al vuelo. */
async function getAuthState(id) {
  const result = await query(
    `SELECT u.id, u.username, u.is_active, u.must_change_password,
            u.role_id, r.name AS role_name
     FROM users u INNER JOIN roles r ON r.id = u.role_id
     WHERE u.id = ?`,
    [id]
  );
  return result.recordset[0] || null;
}

module.exports = {
  findById, findByUsernameWithSecret, findPasswordHash, existsByUsernameOrEmail,
  list, create, update, setPassword, setActive,
  registerSuccessfulLogin, registerFailedLogin, unlock, getAuthState,
};
