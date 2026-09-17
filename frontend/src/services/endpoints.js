import api from './api';

const unwrap = (promise) => promise.then((r) => r.data.data);
const unwrapList = (promise) => promise.then((r) => ({ data: r.data.data, meta: r.data.meta }));

export const authApi = {
  login: (username, password) => unwrap(api.post('/auth/login', { username, password })),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  logoutAll: () => api.post('/auth/logout-all'),
  me: () => unwrap(api.get('/auth/me')),
  changePassword: (currentPassword, newPassword) =>
    unwrap(api.post('/auth/change-password', { currentPassword, newPassword })),
};

export const userApi = {
  list: (params) => unwrapList(api.get('/users', { params })),
  get: (id) => unwrap(api.get(`/users/${id}`)),
  create: (body) => unwrap(api.post('/users', body)),
  update: (id, body) => unwrap(api.put(`/users/${id}`, body)),
  setStatus: (id, isActive) => unwrap(api.patch(`/users/${id}/status`, { isActive })),
  resetPassword: (id, newPassword) =>
    unwrap(api.post(`/users/${id}/reset-password`, { newPassword, mustChangePassword: true })),
  unlock: (id) => unwrap(api.post(`/users/${id}/unlock`)),
};

export const roleApi = {
  list: () => unwrap(api.get('/roles')),
  create: (body) => unwrap(api.post('/roles', body)),
  update: (id, body) => unwrap(api.put(`/roles/${id}`, body)),
  remove: (id) => unwrap(api.delete(`/roles/${id}`)),
};

export const kpiApi = {
  list: (params) => unwrapList(api.get('/kpis', { params })),
  get: (id) => unwrap(api.get(`/kpis/${id}`)),
  create: (body) => unwrap(api.post('/kpis', body)),
  update: (id, body) => unwrap(api.put(`/kpis/${id}`, body)),
  remove: (id) => unwrap(api.delete(`/kpis/${id}`)),
  dashboard: (force) => unwrap(api.get('/kpis/dashboard', { params: { force } })),
  data: (id, force) => unwrap(api.get(`/kpis/${id}/data`, { params: { force } })),
  history: (id, params) => unwrap(api.get(`/kpis/${id}/history`, { params })),
  preview: (sqlQuery) => unwrap(api.post('/kpis/preview', { sqlQuery })),
  validate: (sqlQuery) => unwrap(api.post('/kpis/validate', { sqlQuery })),
};

export const thresholdApi = {
  list: (params) => unwrap(api.get('/thresholds', { params })),
  create: (body) => unwrap(api.post('/thresholds', body)),
  update: (id, body) => unwrap(api.put(`/thresholds/${id}`, body)),
  remove: (id) => unwrap(api.delete(`/thresholds/${id}`)),
  test: (id) => unwrap(api.post(`/thresholds/${id}/test`)),
};

export const alertApi = {
  list: (params) => unwrapList(api.get('/alerts', { params })),
  get: (id) => unwrap(api.get(`/alerts/${id}`)),
  summary: () => unwrap(api.get('/alerts/summary')),
  acknowledge: (id) => unwrap(api.post(`/alerts/${id}/acknowledge`)),
  resolve: (id) => unwrap(api.post(`/alerts/${id}/resolve`)),
  monitorStatus: () => unwrap(api.get('/alerts/monitor')),
  runMonitor: () => unwrap(api.post('/alerts/monitor/run')),
};

export const ticketApi = {
  list: (params) => unwrapList(api.get('/tickets', { params })),
  get: (id) => unwrap(api.get(`/tickets/${id}`)),
  summary: () => unwrap(api.get('/tickets/summary')),
  create: (body) => unwrap(api.post('/tickets', body)),
  update: (id, body) => unwrap(api.put(`/tickets/${id}`, body)),
  assign: (id, assignedTo) => unwrap(api.post(`/tickets/${id}/assign`, { assignedTo })),
  escalate: (id, escalatedTo, reason) =>
    unwrap(api.post(`/tickets/${id}/escalate`, { escalatedTo, reason })),
  changeStatus: (id, status, resolution) =>
    unwrap(api.patch(`/tickets/${id}/status`, { status, resolution })),
  comment: (id, comment) => unwrap(api.post(`/tickets/${id}/comments`, { comment })),
};

export const reportApi = {
  catalog: () => unwrap(api.get('/reports')),
  summary: () => unwrap(api.get('/reports/summary')),
  preview: (type, params) => unwrap(api.get(`/reports/${type}`, { params })),
};

export const auditApi = {
  list: (params) => unwrapList(api.get('/audit', { params })),
};

export const configApi = {
  list: () => unwrap(api.get('/config')),
  get: (id) => unwrap(api.get(`/config/${id}`)),
  create: (body) => unwrap(api.post('/config', body)),
  update: (id, body) => unwrap(api.put(`/config/${id}`, body)),
  remove: (id) => unwrap(api.delete(`/config/${id}`)),
};
