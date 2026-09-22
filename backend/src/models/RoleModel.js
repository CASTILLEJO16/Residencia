'use strict';
const { query, getLastInsertId } = require('../config/database');

const BASE_SELECT = `
  SELECT r.id, r.name, r.description, r.created_at, r.updated_at,
         (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count
  FROM roles r`;

async function findAll() {
  const result = await query(`${BASE_SELECT} ORDER BY r.name`);
  return result.recordset;
}

async function findById(id) {
  const result = await query(`${BASE_SELECT} WHERE r.id = ?`, [id]);
  return result.recordset[0] || null;
}

async function findByName(name) {
  const result = await query(`${BASE_SELECT} WHERE r.name = ?`, [name]);
  return result.recordset[0] || null;
}

async function create({ name, description }) {
  await query(
    `INSERT INTO roles (name, description)
     VALUES (?, ?)`,
    [name, description]
  );
  const id = getLastInsertId();
  return findById(id);
}

async function update(id, { name, description }) {
  await query(
    `UPDATE roles
     SET name = COALESCE(?, name),
         description = COALESCE(?, description)
     WHERE id = ?`,
    [name, description, id]
  );
  return findById(id);
}

async function remove(id) {
  const result = await query(
    `DELETE FROM roles WHERE id = ?`,
    [id]
  );
  return result.rowsAffected > 0;
}

module.exports = { findAll, findById, findByName, create, update, remove };
