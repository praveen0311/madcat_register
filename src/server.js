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
  import swaggerJsdoc from 'swagger-jsdoc';
  import swaggerUi from 'swagger-ui-express';
  import userRoutes from './routes/users.js';
  import { initializeDatabase } from './config/database.js';
  import { initializeTwitterConfig } from './config/twitter.js';


  console.log('🔧 Initializing Twitter config...');
  try {
    initializeTwitterConfig();
    console.log('✅ Twitter config initialized');
  } catch (err) {
    console.error('❌ Failed to initialize Twitter config:', err);
  }

  const app = express();
  const port = process.env.PORT || 3001;

  // Debug middleware to log all requests
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - Headers:`, JSON.stringify(req.headers, null, 2));
    next();
  });

  // CORS middleware - must be first to handle preflight requests
  app.use((req, res, next) => {
    console.log(`🔄 ${req.method} ${req.path} from origin: ${req.headers.origin}`);
    
    const origin = req.headers.origin;
    
    // Set CORS headers for all requests
    res.header('Access-Control-Allow-Origin', origin || 'https://cat.blockmintlabs.com');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Cache-Control, X-Forwarded-For');
    res.header('Access-Control-Allow-Credentials', 'true'); // Set to false since we don't use sessions
    res.header('Access-Control-Max-Age', '86400');
    res.header('Vary', 'Origin');
    
    // Handle preflight OPTIONS requests immediately and return success
    if (req.method === 'OPTIONS') {
      console.log('✅ OPTIONS preflight handled for:', req.path, 'from:', origin);
      res.status(200).json({ message: 'CORS preflight successful' });
      return;
    }
    
    console.log('➡️ Passing request to next middleware');
    next();
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
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database initialized');

    const port = process.env.PORT || 3001;
    // Railway requires binding to 0.0.0.0, not localhost
    const host = '0.0.0.0';

    app.listen(port, host, () => {
      console.log(`🚀 Server is running on ${host}:${port}`);
      console.log(`📚 API Documentation: http://localhost:${port}/api-docs`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Global error handlers for unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

  startServer();
