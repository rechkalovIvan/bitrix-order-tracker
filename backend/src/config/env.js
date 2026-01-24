require('dotenv').config();

const config = {
  port: process.env.PORT || 10000,
  nodeEnv: process.env.NODE_ENV || 'development',
  bitrix: {
    webhookUrl: process.env.BITRIX_WEBHOOK_URL,
    webhookToken: process.env.WEBHOOK_TOKEN
  }
};

// Validate required environment variables
if (!config.bitrix.webhookUrl) {
  throw new Error('BITRIX_WEBHOOK_URL is required');
}

if (!config.bitrix.webhookToken) {
  throw new Error('WEBHOOK_TOKEN is required');
}

module.exports = config;