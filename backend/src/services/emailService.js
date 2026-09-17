'use strict';
const nodemailer = require('nodemailer');
const config = require('../config/env');

let transporter = null;

function getTransporter() {
  if (!config.mail.enabled) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.password } : undefined,
  });
  return transporter;
}

/**
 * Envia un correo. Nunca lanza: una falla del servidor de correo no debe
 * impedir que se registre una alerta o se cree un ticket.
 */
async function send({ to, subject, html, text }) {
  const recipients = normalize(to);
  if (!recipients.length) return { sent: false, reason: 'sin_destinatarios' };

  const client = getTransporter();
  if (!client) {
    console.log(`[mail] deshabilitado; no se envio "${subject}" a ${recipients.join(', ')}`);
    return { sent: false, reason: 'deshabilitado' };
  }

  try {
    const info = await client.sendMail({
      from: config.mail.from,
      to: recipients.join(', '),
      subject,
      text: text || stripHtml(html),
      html,
    });
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('[mail] fallo el envio:', err.message);
    return { sent: false, reason: err.message };
  }
}

function normalize(to) {
  if (!to) return [];
  const list = Array.isArray(to) ? to : String(to).split(/[,;]/);
  return list.map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SEVERITY_COLOR = {
  low: '#4B7BA8', medium: '#B8860B', high: '#C2410C', critical: '#9B1C1C',
};

function layout(title, accent, bodyHtml) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;color:#16202C">
    <div style="border-left:4px solid ${accent};padding:12px 16px;background:#F2F4F7">
      <div style="font-size:17px;font-weight:600">${escape(title)}</div>
    </div>
    <div style="padding:16px">${bodyHtml}</div>
    <div style="padding:12px 16px;border-top:1px solid #D3DAE3;font-size:12px;color:#5A6B7C">
      Sistema de Inteligencia Operativa
    </div>
  </div>`;
}

function row(label, value) {
  return `<tr>
    <td style="padding:6px 12px 6px 0;color:#5A6B7C;font-size:13px;white-space:nowrap">${escape(label)}</td>
    <td style="padding:6px 0;font-size:14px">${escape(value)}</td>
  </tr>`;
}

/** Aviso de alerta disparada. */
async function sendAlertNotification(alert, threshold, recipients) {
  const accent = SEVERITY_COLOR[alert.severity] || '#5A6B7C';
  const body = `
    <p style="margin:0 0 14px;font-size:14px">${escape(alert.message)}</p>
    <table style="border-collapse:collapse">
      ${row('KPI', alert.kpi_name)}
      ${row('Umbral', threshold.name)}
      ${row('Valor actual', alert.current_value)}
      ${row('Severidad', alert.severity)}
      ${row('Detectada', new Date(alert.triggered_at).toLocaleString('es-MX'))}
    </table>`;
  return send({
    to: recipients,
    subject: `[SIO ${alert.severity}] ${alert.kpi_name}: ${threshold.name}`,
    html: layout(`Alerta en ${alert.kpi_name}`, accent, body),
  });
}

/** Aviso de asignacion de ticket. */
async function sendTicketAssigned(ticket, assignee) {
  const body = `
    <p style="margin:0 0 14px;font-size:14px">Se te asignó el ticket ${escape(ticket.ticket_number)}.</p>
    <table style="border-collapse:collapse">
      ${row('Título', ticket.title)}
      ${row('Prioridad', ticket.priority)}
      ${row('Estado', ticket.status)}
      ${ticket.due_date ? row('Vence', new Date(ticket.due_date).toLocaleString('es-MX')) : ''}
    </table>`;
  return send({
    to: assignee.email,
    subject: `[SIO] ${ticket.ticket_number}: ${ticket.title}`,
    html: layout(`Ticket asignado: ${ticket.ticket_number}`, '#1F5F8B', body),
  });
}

/** Aviso de escalado. */
async function sendTicketEscalated(ticket, target, reason) {
  const body = `
    <p style="margin:0 0 14px;font-size:14px">${escape(reason || 'El ticket fue escalado.')}</p>
    <table style="border-collapse:collapse">
      ${row('Ticket', ticket.ticket_number)}
      ${row('Título', ticket.title)}
      ${row('Prioridad', ticket.priority)}
      ${row('Nivel de escalado', ticket.escalation_level)}
    </table>`;
  return send({
    to: target.email,
    subject: `[SIO escalado] ${ticket.ticket_number}: ${ticket.title}`,
    html: layout(`Ticket escalado: ${ticket.ticket_number}`, '#C2410C', body),
  });
}

module.exports = { send, sendAlertNotification, sendTicketAssigned, sendTicketEscalated };
