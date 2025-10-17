const pino = require('pino');
const { LOG_LEVEL, NODE_ENV } = require('./env');

const logger = pino({
  level: LOG_LEVEL,
  transport: NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

module.exports = logger;
