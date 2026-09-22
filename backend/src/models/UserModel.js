'use strict';
const { query } = require('../config/database');
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
     WHERE u.id = $1`,
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
     WHERE u.username = $1`,
    [username]
  );
  return result.recordset[0] || null;
}

async function findPasswordHash(id) {
  const result = await query(
    `SELECT password_hash FROM users WHERE id = $1`,
    [id]
  );
  return result.recordset[0]?.password_hash || null;
}

async function existsByUsernameOrEmail(username, email, excludeId = null) {
  const result = await query(
    `SELECT id FROM users
     WHERE (username = $1 OR email = $2)
       AND ($3 IS NULL OR id <> $3)
     LIMIT 1`,
    [username, email, excludeId]
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
    WHERE ($1 IS NULL OR u.username LIKE $1 OR u.full_name LIKE $1 OR u.email LIKE $1)
      AND ($2 IS NULL OR u.role_id = $2)
      AND ($3 IS NULL OR u.is_active = $3)`;

  const rows = await query(
    `SELECT ${PUBLIC_FIELDS}
     FROM users u INNER JOIN roles r ON r.id = u.role_id
     ${where}
     ORDER BY u.${column} ${direction}
     LIMIT $5 OFFSET $4`,
    params
  );

  const count = await query(
    `SELECT COUNT(*) AS total
     FROM users u INNER JOIN roles r ON r.id = u.role_id ${where}`,
    [search, roleId, isActive]
  );

  return { data: rows.recordset, meta: buildMeta(count.recordset[0].total, page, limit) };
}

async function create({ username, email, fullName, passwordHash, roleId, mustChangePassword = true }) {
  const result = await query(
    `INSERT INTO users (username, email, full_name, password_hash, role_id, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [username, email, fullName, passwordHash, roleId, mustChangePassword]
  );
  return findById(result.recordset[0].id);
}

async function update(id, { email, fullName, roleId, isActive }) {
  await query(
    `UPDATE users
     SET email      = COALESCE($2, email),
         full_name  = COALESCE($3, full_name),
         role_id    = COALESCE($4, role_id),
         is_active  = COALESCE($5, is_active)
     WHERE id = $1`,
    [id, email, fullName, roleId, isActive]
  );
  return findById(id);
}

async function setPassword(id, passwordHash, { mustChange = false } = {}) {
  await query(
    `UPDATE users
     SET password_hash = $2,
         must_change_password = $3,
         failed_login_attempts = 0,
         locked_until = NULL
     WHERE id = $1`,
    [id, passwordHash, mustChange]
  );
}

async function setActive(id, isActive) {
  await query(
    `UPDATE users SET is_active = $2 WHERE id = $1`,
    [id, isActive]
  );
  return findById(id);
}

async function registerSuccessfulLogin(id) {
  await query(
    `UPDATE users
     SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL
     WHERE id = $1`,
    [id]
  );
}

/** Incrementa el contador y bloquea la cuenta si se pasa del limite. */
async function registerFailedLogin(id, maxAttempts, lockoutMinutes) {
  const result = await query(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE
             WHEN failed_login_attempts + 1 >= $2
             THEN NOW() + INTERVAL '1 minute' * $3
             ELSE locked_until END
     WHERE id = $1
     RETURNING failed_login_attempts, locked_until`,
    [id, maxAttempts, lockoutMinutes]
  );
  return result.recordset[0];
}

async function unlock(id) {
  await query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
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
     WHERE u.id = $1`,
    [id]
  );
  return result.recordset[0] || null;
}

module.exports = {
  findById, findByUsernameWithSecret, findPasswordHash, existsByUsernameOrEmail,
  list, create, update, setPassword, setActive,
  registerSuccessfulLogin, registerFailedLogin, unlock, getAuthState,
};
