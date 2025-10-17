const dotenv = require('dotenv');
dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  WAPP_CLIENT_ID: required('WAPP_CLIENT_ID'),
  DATABASE_URL: required('DATABASE_URL'),
};
