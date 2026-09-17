'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const routes = require('./routes');
const { auditMiddleware } = require('./middleware/auditMiddleware');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Necesario para obtener la IP real detras de IIS / nginx.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(auditMiddleware);

app.get('/api/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', env: config.env, time: new Date().toISOString() } });
});

app.use('/api', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
