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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import userRoutes from './routes/users.js';
import { initializeDatabase } from './config/database.js';
import { initializeTwitterConfig } from './config/twitter.js';

// Initialize Twitter configuration after environment variables are loaded
initializeTwitterConfig();

const app = express();
const port = process.env.PORT || 3001;

// Debug middleware to log all requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url} - Headers:`, JSON.stringify(req.headers, null, 2));
  next();
});


// CORS options: allow requests with no Origin (OAuth callback), restrict others
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like OAuth callbacks)
    if (!origin) return callback(null, true);
    // Allow only whitelisted origins for API endpoints
    const allowed = process.env.CORS_ORIGINS?.split(',').map(o => o.trim());
    if (allowed && allowed.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: false, // Set to true if you use cookies/sessions
};

// Apply CORS only to /api routes except /api/auth/twitter/callback
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/twitter/callback') {
    // Skip CORS for OAuth callback
    return next();
  }
  // Apply CORS for other /api routes
  return cors(corsOptions)(req, res, next);
});

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
  max: 5,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalRateLimit);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
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
  },
  apis: ['./src/routes/*.js'],
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
