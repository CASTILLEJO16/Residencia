'use strict';
const { query, getLastInsertId } = require('../config/database');

const BASE_SELECT = `
  SELECT sc.id, sc.key_name, sc.value, sc.value_type, sc.description, sc.is_secret,
         sc.updated_by, sc.updated_at,
         u.username AS updated_by_username
  FROM system_config sc
  LEFT JOIN users u ON sc.updated_by = u.id`;

async function findAll() {
  const result = await query(`${BASE_SELECT} ORDER BY sc.key_name`);
  return result.recordset.map(row => ({
    ...row,
    is_secret: !!row.is_secret,
  }));
}

async function findById(id) {
  const result = await query(`${BASE_SELECT} WHERE sc.id = ?`, [id]);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, is_secret: !!row.is_secret };
}

async function findByKey(keyName) {
  const result = await query(`${BASE_SELECT} WHERE sc.key_name = ?`, [keyName]);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, is_secret: !!row.is_secret };
}

async function create({ keyName, value, valueType, description, isSecret }) {
  await query(
    `INSERT INTO system_config (key_name, value, value_type, description, is_secret)
     VALUES (?, ?, ?, ?, ?)`,
    [keyName, value, valueType, description, isSecret]
  );
  const id = getLastInsertId();
  return findById(id);
}

async function update(id, { value, description, updatedBy }) {
  await query(
    `UPDATE system_config
     SET value = COALESCE(?, value),
         description = COALESCE(?, description),
         updated_by = ?
     WHERE id = ?`,
    [value, description, updatedBy, id]
  );
  return findById(id);
}

async function remove(id) {
  const result = await query(
    `DELETE FROM system_config WHERE id = ?`,
    [id]
  );
  return result.rowsAffected > 0;
}

module.exports = { findAll, findById, findByKey, create, update, remove };
