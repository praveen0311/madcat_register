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
import { fileURLToPath } from 'url';
import { dirname } from 'path';
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
  max: 5,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(generalRateLimit);

// CORS middleware for production
app.use((req, res, next) => {
  const allowedOrigins = process.env.CORS_ORIGINS ? 
    process.env.CORS_ORIGINS.split(',') : 
    ['http://localhost:5173'];
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.header('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session middleware with secure configuration for production
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-for-dev-only',
  resave: false,
  saveUninitialized: false, // Changed to false for production
  name: 'madcat_session',
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent XSS
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  }
}));

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
          ? 'madcatsuite-production.up.railway.app'
          : 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
  },
  apis: [resolve(__dirname, 'routes', '*.js')],
};

const specs = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// Replace the existing CORS middleware (around line 170) with this:

app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.path} from origin: ${req.headers.origin}`);
  
  // Allow origins based on environment
  const allowedOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://your-frontend-domain.com' // Add your frontend domain when ready
  ];
  
  // In production, also allow Railway health checks
  if (process.env.NODE_ENV === 'production') {
    allowedOrigins.push('https://*.railway.app');
  }
  
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.some(allowed => 
    allowed.includes('*') ? origin.includes(allowed.replace('*', '')) : allowed === origin
  )) {
    res.header('Access-Control-Allow-Origin', origin || 'http://localhost:5173');
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie');
  res.header('Access-Control-Expose-Headers', 'Set-Cookie');
  res.header('Vary', 'Origin');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return res.status(200).end();
  }
  
  next();
});

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
