'use strict';
const { sql, query } = require('../config/database');

const BASE_SELECT = `
  SELECT sc.id, sc.key_name, sc.value, sc.value_type, sc.description, sc.is_secret,
         sc.updated_by, sc.updated_at,
         u.username AS updated_by_username
  FROM dbo.system_config sc
  LEFT JOIN dbo.users u ON sc.updated_by = u.id`;

async function findAll() {
  const result = await query(`${BASE_SELECT} ORDER BY sc.key_name`);
  return result.recordset.map(row => ({
    ...row,
    is_secret: !!row.is_secret,
  }));
}

async function findById(id) {
  const result = await query(`${BASE_SELECT} WHERE sc.id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, is_secret: !!row.is_secret };
}

async function findByKey(keyName) {
  const result = await query(`${BASE_SELECT} WHERE sc.key_name = @keyName`,
    [{ name: 'keyName', type: sql.NVarChar(100), value: keyName }]);
  const row = result.recordset[0];
  if (!row) return null;
  return { ...row, is_secret: !!row.is_secret };
}

async function create({ keyName, value, valueType, description, isSecret }) {
  const result = await query(
    `INSERT INTO dbo.system_config (key_name, value, value_type, description, is_secret)
     OUTPUT INSERTED.id
     VALUES (@keyName, @value, @valueType, @description, @isSecret)`,
    [
      { name: 'keyName', type: sql.NVarChar(100), value: keyName },
      { name: 'value', type: sql.NVarChar(sql.MAX), value: value ?? null },
      { name: 'valueType', type: sql.NVarChar(20), value: valueType },
      { name: 'description', type: sql.NVarChar(255), value: description ?? null },
      { name: 'isSecret', type: sql.Bit, value: isSecret ? 1 : 0 },
    ]
  );
  return findById(result.recordset[0].id);
}

async function update(id, { value, description, updatedBy }) {
  await query(
    `UPDATE dbo.system_config
     SET value = COALESCE(@value, value),
         description = COALESCE(@description, description),
         updated_by = @updatedBy
     WHERE id = @id`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'value', type: sql.NVarChar(sql.MAX), value: value ?? null },
      { name: 'description', type: sql.NVarChar(255), value: description ?? null },
      { name: 'updatedBy', type: sql.Int, value: updatedBy },
    ]
  );
  return findById(id);
}

async function remove(id) {
  const result = await query(
    `DELETE FROM dbo.system_config WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.rowsAffected[0] > 0;
}

module.exports = { findAll, findById, findByKey, create, update, remove };
