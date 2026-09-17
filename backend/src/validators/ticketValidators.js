'use strict';
const { z } = require('zod');

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in_progress', 'escalated', 'on_hold', 'closed'];

const createTicketSchema = z.object({
  title: z.string().trim().min(5, 'El titulo es demasiado corto').max(200),
  description: z.string().trim().max(10000).optional(),
  alertId: z.coerce.number().int().positive().optional(),
  priority: z.enum(PRIORITIES),
  assignedTo: z.coerce.number().int().positive().optional(),
  dueDate: z.coerce.date().optional(),
});

const updateTicketSchema = z.object({
  title: z.string().trim().min(5).max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: z.coerce.date().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Debe enviar al menos un campo' });

const assignSchema = z.object({
  assignedTo: z.coerce.number().int().positive().nullable(),
});

const escalateSchema = z.object({
  escalatedTo: z.coerce.number().int().positive(),
  reason: z.string().trim().min(5, 'Explique el motivo del escalado').max(1000),
});

const statusSchema = z.object({
  status: z.enum(STATUSES),
  resolution: z.string().trim().max(10000).optional(),
});

const commentSchema = z.object({
  comment: z.string().trim().min(1, 'El comentario no puede estar vacio').max(10000),
});

const listTicketsSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignedTo: z.coerce.number().int().positive().optional(),
  createdBy: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
  mine: z.enum(['true', 'false']).optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  sort: z.string().max(50).optional(),
});

module.exports = {
  PRIORITIES, STATUSES, createTicketSchema, updateTicketSchema, assignSchema,
  escalateSchema, statusSchema, commentSchema, listTicketsSchema,
};
