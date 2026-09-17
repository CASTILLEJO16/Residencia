'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('./env');

/** Token de acceso: corto (15 min), sin datos sensibles. */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role_name },
    config.jwt.secret,
    {
      expiresIn: config.jwt.accessTtl,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
  });
}

/**
 * Refresh token opaco. Se entrega en claro al cliente y en la base
 * solo se guarda su SHA-256, igual que una contrasena.
 */
function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  return { token, hash: hashToken(token) };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
