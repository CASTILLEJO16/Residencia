'use strict';
const { query } = require('../config/database');

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
  const result = await query(`${BASE_SELECT} WHERE sc.id = $1`, [id]);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, is_secret: !!row.is_secret };
}

async function findByKey(keyName) {
  const result = await query(`${BASE_SELECT} WHERE sc.key_name = $1`, [keyName]);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, is_secret: !!row.is_secret };
}

async function create({ keyName, value, valueType, description, isSecret }) {
  const result = await query(
    `INSERT INTO system_config (key_name, value, value_type, description, is_secret)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [keyName, value, valueType, description, isSecret]
  );
  return findById(result.recordset[0].id);
}

async function update(id, { value, description, updatedBy }) {
  await query(
    `UPDATE system_config
     SET value = COALESCE($2, value),
         description = COALESCE($3, description),
         updated_by = $4
     WHERE id = $1`,
    [id, value, description, updatedBy]
  );
  return findById(id);
}

async function remove(id) {
  const result = await query(
    `DELETE FROM system_config WHERE id = $1`,
    [id]
  );
  return result.rowsAffected > 0;
}

module.exports = { findAll, findById, findByKey, create, update, remove };
