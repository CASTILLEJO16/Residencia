import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : parseISO(String(value));
  return isValid(date) ? date : null;
}

export function dateTime(value) {
  const date = toDate(value);
  return date ? format(date, "d MMM yyyy, HH:mm", { locale: es }) : '—';
}

export function dateOnly(value) {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy', { locale: es }) : '—';
}

export function timeOnly(value) {
  const date = toDate(value);
  return date ? format(date, 'HH:mm:ss') : '—';
}

export function relative(value) {
  const date = toDate(value);
  if (!date) return '—';
  return formatDistanceToNow(date, { addSuffix: true, locale: es });
}

/** Cifras compactas para los widgets: 1.2 M en vez de 1200000. */
export function compactNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)} B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(1)} k`;
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n);
}

export function number(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: decimals }).format(Number(value));
}

/** Los valores de una celda de tabla pueden venir de cualquier tipo SQL. */
export function cell(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (typeof value === 'number') return number(value);
  if (value instanceof Date) return dateTime(value);
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return dateTime(str);
  return str;
}

export function isOverdue(dueDate, status) {
  if (!dueDate || status === 'closed') return false;
  const date = toDate(dueDate);
  return date ? date < new Date() : false;
}
