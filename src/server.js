import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables - try multiple paths for Railway
const envPaths = [
  join(__dirname, '.env'),
  join(__dirname, '../.env'),
  '.env'
];

for (const envPath of envPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error) {
    console.log(`✅ Environment loaded from: ${envPath}`);
    break;
  }
}

// Log environment status (remove in production)
if (process.env.NODE_ENV !== 'production') {
  console.log('Current working directory:', process.cwd());
  console.log('PORT:', process.env.PORT);
  console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
}

// Import other modules
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import userRoutes from './routes/users.js';
import { initializeDatabase } from './config/database.js';
import { initializeTwitterConfig } from './config/twitter.js';

// Initialize Twitter configuration after environment variables are loaded
initializeTwitterConfig();

const app = express();
const port = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const generalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalRateLimit);

// CORS middleware - Production-ready cross-domain session support
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.path} from origin: ${req.headers.origin}`);
  
  const allowedOrigins = [
    'http://localhost:5173', 
    'http://localhost:3000',
    'http://localhost:5000',
    'https://cat.blockmintlabs.com',
    'https://poetic-pothos-ea5bb5.netlify.app', // Your frontend URL
    'https://madcatsuite-production-7b53.up.railway.app' // Your backend URL
  ];
  
  // Add custom origins from environment variables
  if (process.env.CORS_ORIGINS) {
    allowedOrigins.push(...process.env.CORS_ORIGINS.split(',').map(o => o.trim()));
  }
  
  // Add frontend URL from environment
  if (process.env.FRONTEND_URL && !allowedOrigins.includes(process.env.FRONTEND_URL)) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }
  
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  const isAllowed = !origin || 
    allowedOrigins.includes(origin) || 
    (process.env.NODE_ENV !== 'production') ||
    (origin && (origin.includes('.railway.app') || origin.includes('.netlify.app') || 
                origin.includes('.vercel.app') || origin.includes('.herokuapp.com') ||
                origin.includes('.render.com') || origin.includes('.github.io')));
  
  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    console.warn('CORS blocked origin:', origin);
    // Still allow for common deployment platforms health checks
    if (origin && (origin.includes('.railway.app') || origin.includes('.netlify.app') ||
                  origin.includes('.vercel.app') || origin.includes('.herokuapp.com'))) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Set-Cookie');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie, Authorization');
  res.header('Vary', 'Origin');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request for origin:', origin);
    return res.status(204).end();
  }
  
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware with enhanced cross-domain production support
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-for-dev-only',
  resave: false,
  saveUninitialized: false, // Changed to false to prevent unnecessary sessions
  name: 'madcat_session',
  rolling: true, // Reset expiry on activity
  cookie: {
    secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== 'false', // HTTPS only in production
    httpOnly: false, // Allow client-side access for debugging (can be true for production)
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // Critical for cross-domain
    maxAge: 2 * 60 * 60 * 1000, // 2 hours - longer for OAuth flow
    domain: process.env.COOKIE_DOMAIN || undefined // Allow setting custom cookie domain
  }
}));

// Session debugging middleware
app.use((req, res, next) => {
  if (req.path.includes('/auth/')) {
    console.log('Session debug:', {
      sessionId: req.sessionID,
      hasOauthSecret: !!req.session.oauth_token_secret,
      sessionKeys: Object.keys(req.session || {}),
      cookies: req.headers.cookie
    });
  }
  next();
});

// Apply auth rate limiting to auth endpoints
app.use('/api/auth', authRateLimit);

// Routes
app.use('/api', userRoutes);

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({ 
    message: 'MADCAT Register Score API',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Swagger documentation
import { resolve } from 'path';
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MADCAT Register Score API',
      version: '1.0.0',
      description: 'API for Twitter authentication and user registration',
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://madcatsuite-production-7b53.up.railway.app'
          : 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'User ID'
            },
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
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Last update timestamp'
            }
          },
          required: ['twitter_id', 'telegram_username', 'wallet_address']
        }
      }
    }
  },
  apis: [resolve(__dirname, 'routes', '*.js')],
};

const specs = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Start server
const startServer = async () => {
  try {
    await initializeDatabase();
    
    // Railway requires binding to 0.0.0.0, not localhost
    const host = '0.0.0.0';
    
    app.listen(port, host, () => {
      console.log(`🚀 Server is running on ${host}:${port}`);
      console.log(`📚 API Documentation: http://localhost:${port}/api-docs`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
