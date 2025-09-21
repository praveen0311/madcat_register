const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MADCAT Register Score API',
      version: '1.0.0',
      description: 'API documentation for the MADCAT Register Score service',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            twitter_id: {
              type: 'string',
              description: 'Twitter ID of the user'
            },
            twitter_username: {
              type: 'string',
              description: 'Twitter username'
            },
            twitter_name: {
              type: 'string',
              description: 'Twitter display name'
            },
            telegram_username: {
              type: 'string',
              description: 'Telegram username'
            },
            wallet_address: {
              type: 'string',
              description: 'Ethereum wallet address'
            }
          },
          required: ['twitter_id', 'telegram_username', 'wallet_address']
        },
        Score: {
          type: 'object',
          properties: {
            wallet_address: {
              type: 'string',
              description: 'Ethereum wallet address'
            },
            twitter_xp: {
              type: 'number',
              description: 'XP earned from Twitter activities'
            },
            telegram_xp: {
              type: 'number',
              description: 'XP earned from Telegram activities'
            },
            trading_xp: {
              type: 'number',
              description: 'XP earned from trading activities'
            },
            total_score: {
              type: 'number',
              description: 'Total combined score'
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js'], // Path to the API routes
};

const specs = swaggerJsdoc(options);
module.exports = specs;
