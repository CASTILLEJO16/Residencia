'use strict';
const { sql, query } = require('../config/database');

const BASE_SELECT = `
  SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at,
         (SELECT COUNT(*) FROM dbo.users u WHERE u.role_id = r.id) AS user_count
  FROM dbo.roles r`;

async function findAll() {
  const result = await query(`${BASE_SELECT} ORDER BY r.name`);
  return result.recordset;
}

async function findById(id) {
  const result = await query(`${BASE_SELECT} WHERE r.id = @id`,
    [{ name: 'id', type: sql.Int, value: id }]);
  return result.recordset[0] || null;
}

async function findByName(name) {
  const result = await query(`${BASE_SELECT} WHERE r.name = @name`,
    [{ name: 'name', type: sql.NVarChar(50), value: name }]);
  return result.recordset[0] || null;
}

async function create({ name, description }) {
  const result = await query(
    `INSERT INTO dbo.roles (name, description)
     OUTPUT INSERTED.id
     VALUES (@name, @description)`,
    [
      { name: 'name', type: sql.NVarChar(50), value: name },
      { name: 'description', type: sql.NVarChar(255), value: description },
    ]
  );
  return findById(result.recordset[0].id);
}

async function update(id, { name, description }) {
  await query(
    `UPDATE dbo.roles
     SET name = COALESCE(@name, name),
         description = COALESCE(@description, description)
     WHERE id = @id AND is_system = 0`,
    [
      { name: 'id', type: sql.Int, value: id },
      { name: 'name', type: sql.NVarChar(50), value: name ?? null },
      { name: 'description', type: sql.NVarChar(255), value: description ?? null },
    ]
  );
  return findById(id);
}

async function remove(id) {
  const result = await query(
    `DELETE FROM dbo.roles WHERE id = @id AND is_system = 0`,
    [{ name: 'id', type: sql.Int, value: id }]
  );
  return result.rowsAffected[0] > 0;
}

module.exports = { findAll, findById, findByName, create, update, remove };
