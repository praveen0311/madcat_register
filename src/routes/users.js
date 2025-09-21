import express from 'express';
import fetch from 'node-fetch';
import { body, validationResult } from 'express-validator';
import { pool } from '../config/database.js';
import {
  oauth,
  TWITTER_REQUEST_TOKEN_URL,
  TWITTER_AUTHORIZE_URL,
  TWITTER_ACCESS_TOKEN_URL,
  TWITTER_USER_INFO_URL,
  FRONTEND_URL
} from '../config/twitter.js';

const router = express.Router();

/**
 * @swagger
 * /api/auth/twitter:
 *   get:
 *     tags: [Authentication]
 *     summary: Initiates Twitter OAuth flow
 *     description: Starts the Twitter OAuth process by getting a request token
 *     responses:
 *       200:
 *         description: Successfully initiated OAuth flow
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 auth_url:
 *                   type: string
 *                   description: URL to redirect user for Twitter authorization
 *       500:
 *         description: OAuth initiation failed
 */

// Twitter OAuth Flow
router.get('/auth/twitter', async (req, res) => {
  try {
    // Check if we have valid Twitter API credentials
    if (!oauth) {
      return res.status(500).json({ 
        error: 'Twitter API credentials not configured. Please add TWITTER_API_KEY and TWITTER_API_SECRET to your environment variables.' 
      });
    }

    console.log('Starting Twitter OAuth flow...');
    // Use environment-based callback URL for development/production
    let baseUrl = process.env.NODE_ENV === 'production' 
      ? process.env.BACKEND_URL || 'https://your-deployed-backend.onrender.com'
      : 'http://localhost:3001';
    
    // Clean the base URL to avoid duplicates
    baseUrl = baseUrl.replace(/\/+$/, ''); // Remove trailing slashes
    if (baseUrl.includes('/api')) {
      // If BACKEND_URL accidentally includes path, extract just the domain
      baseUrl = baseUrl.split('/api')[0];
    }
    
    const callback_url = `${baseUrl}/api/auth/twitter/callback`;
    console.log('Base URL:', baseUrl);
    console.log('Callback URL:', callback_url);
    
    const requestData = {
      url: TWITTER_REQUEST_TOKEN_URL,
      method: 'POST',
      data: { oauth_callback: callback_url }
    };

    console.log('OAuth request data:', requestData);
    const authHeader = oauth.authorize(requestData);
    console.log('OAuth authorization generated');
    
    const headers = oauth.toHeader(authHeader);
    console.log('Request headers prepared');

    console.log('Making request to Twitter API...');
    const response = await fetch(TWITTER_REQUEST_TOKEN_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ oauth_callback: callback_url })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Twitter API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`Failed to get request token: ${errorText}`);
    }

    const text = await response.text();
    const tokenData = new URLSearchParams(text);
    const oauth_token = tokenData.get('oauth_token');
    const oauth_token_secret = tokenData.get('oauth_token_secret');

    if (!oauth_token || !oauth_token_secret) {
      throw new Error('Invalid response from Twitter');
    }

    // Store token secret temporarily in a Map instead of session (for simplicity)
    // In production, you might want to use Redis or another storage solution
    global.tempTokenStorage = global.tempTokenStorage || new Map();
    global.tempTokenStorage.set(oauth_token, oauth_token_secret);
    
    const auth_url = `${TWITTER_AUTHORIZE_URL}?oauth_token=${oauth_token}`;
    res.json({ auth_url });
  } catch (error) {
    console.error('OAuth initiation failed:', error);
    res.status(500).json({ error: error.message });
  }
});



// Handle GET callback from Twitter (redirect from Twitter OAuth)
router.get('/auth/twitter/callback', async (req, res) => {
  try {
    const { oauth_token, oauth_verifier } = req.query;

    if (!oauth_token || !oauth_verifier) {
      return res.redirect(`${FRONTEND_URL}?error=missing_oauth_params`);
    }

    // Get token secret from temporary storage instead of session
    const oauth_token_secret = global.tempTokenStorage?.get(oauth_token);
    if (!oauth_token_secret) {
      return res.redirect(`${FRONTEND_URL}?error=invalid_token`);
    }

    // Clean up temporary storage
    global.tempTokenStorage?.delete(oauth_token);

    // Exchange for access token
    const requestData = {
      url: TWITTER_ACCESS_TOKEN_URL,
      method: 'POST',
      data: { oauth_verifier }
    };

    const token = {
      key: oauth_token,
      secret: oauth_token_secret
    };

    const headers = oauth.toHeader(oauth.authorize(requestData, token));
    const response = await fetch(TWITTER_ACCESS_TOKEN_URL, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ oauth_verifier })
    });

    if (!response.ok) {
      return res.redirect(`${FRONTEND_URL}?error=access_token_failed`);
    }

    const text = await response.text();
    const accessData = new URLSearchParams(text);
    const access_token = accessData.get('oauth_token');
    const access_token_secret = accessData.get('oauth_token_secret');

    if (!access_token || !access_token_secret) {
      return res.redirect(`${FRONTEND_URL}?error=invalid_access_token`);
    }

    // Get user info
    const userRequestData = {
      url: TWITTER_USER_INFO_URL,
      method: 'GET'
    };

    const userToken = {
      key: access_token,
      secret: access_token_secret
    };

    const userHeaders = oauth.toHeader(oauth.authorize(userRequestData, userToken));
    const userResponse = await fetch(TWITTER_USER_INFO_URL, {
      headers: userHeaders
    });

    if (!userResponse.ok) {
      return res.redirect(`${FRONTEND_URL}?error=user_info_failed`);
    }

    const userData = await userResponse.json();
    
    console.log('Twitter OAuth callback - received user data:', userData);
    
    // Instead of storing in session, redirect with user data as URL parameters
    const userParams = new URLSearchParams({
      auth: 'success',
      twitter_id: userData.id_str,
      twitter_username: userData.screen_name,
      twitter_name: userData.name,
      profile_image: userData.profile_image_url_https
    });

    // Redirect back to frontend with user data
    res.redirect(`${FRONTEND_URL}?${userParams.toString()}`);
  } catch (error) {
    console.error('Callback processing failed:', error);
    res.redirect(`${FRONTEND_URL}?error=callback_failed`);
  }
});

// Validation middleware for registration
const validateRegistration = [
  body('twitter_id')
    .notEmpty()
    .withMessage('Twitter ID is required')
    .isNumeric()
    .withMessage('Twitter ID must be numeric')
    .isLength({ min: 1, max: 20 })
    .withMessage('Twitter ID must be between 1 and 20 characters'),
  
  body('twitter_username')
    .optional()
    .isLength({ min: 1, max: 25 })
    .withMessage('Twitter username must be between 1 and 15 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Twitter username can only contain letters, numbers, and underscores'),
   
  body('telegram_username')
    .notEmpty()
    .withMessage('Telegram username is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Telegram username must be between 1 and 50 characters')
    .trim(),
  
  body('wallet_address')
    .notEmpty()
    .withMessage('Wallet address is required')
    .isLength({ min: 42, max: 42 })
    .withMessage('Wallet address must be exactly 42 characters')
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid Ethereum wallet address format')
];

/**
 * @swagger
 * /api/register:
 *   post:
 *     tags: [Users]
 *     summary: Register a new user
 *     description: Register a user with Twitter and Telegram information
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - twitter_id
 *               - telegram_username
 *               - wallet_address
 *             properties:
 *               twitter_id:
 *                 type: string
 *                 description: Twitter ID of the user
 *               twitter_username:
 *                 type: string
 *                 description: Twitter username
 *               twitter_name:
 *                 type: string
 *                 description: Twitter display name
 *               telegram_username:
 *                 type: string
 *                 description: Telegram username
 *               wallet_address:
 *                 type: string
 *                 description: Ethereum wallet address
 *     responses:
 *       200:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: User already registered
 *       500:
 *         description: Registration failed
 */
// User Registration
router.post('/register', validateRegistration, async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const client = await pool.connect();
  try {
    const { twitter_id, twitter_username, twitter_name, telegram_username, wallet_address } = req.body;

    console.log('Registration request:', { twitter_id, twitter_username, twitter_name, telegram_username, wallet_address });

    // Additional server-side validation for security
    if (!twitter_id || !telegram_username || !wallet_address) {
      return res.status(400).json({ 
        error: 'Missing required fields: twitter_id, telegram_username, and wallet_address are required' 
      });
    }

    // Check if user exists by any unique identifier
    const existingUser = await client.query(
      'SELECT * FROM user_profiles WHERE twitter_id = $1 OR telegram_username = $2 OR wallet_address = $3',
      [twitter_id, telegram_username, wallet_address]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already registered with this Twitter, Telegram, or wallet address' });
    }

    // Create new user in user_profiles table
    const result = await client.query(
      `INSERT INTO user_profiles (twitter_id, twitter_username, twitter_name, telegram_username, wallet_address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [twitter_id, twitter_username, twitter_name, telegram_username, wallet_address]
    );

    console.log('User registered successfully:', result.rows[0]);
    res.json({ 
      success: true,
      message: 'User registered successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Registration failed:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'User already registered' });
    } else {
      res.status(500).json({ error: error.message });
    }
  } finally {
    client.release();
  }
});

// Validation middleware for admin authentication
const validateAdmin = [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .trim()
    .escape(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
];

/**
 * @swagger
 * /api/users:
 *   post:
 *     tags: [Users]
 *     summary: Get all registered users (Admin only)
 *     description: Retrieve a list of all registered users - requires admin authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Admin username
 *               password:
 *                 type: string
 *                 description: Admin password
 *     responses:
 *       200:
 *         description: List of users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - Invalid admin credentials
 *       500:
 *         description: Failed to fetch users
 */
// Get All Users - Admin Only
router.post('/users', validateAdmin, async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }

  const { username, password } = req.body;
  
  // Check admin credentials against environment variables
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    console.log(`Failed admin login attempt from IP: ${req.ip}, Username: ${username}`);
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid admin credentials'
    });
  }
  
  console.log(`Admin access granted to: ${username} from IP: ${req.ip}`);
  
  const client = await pool.connect();
  try {
    // Query the correct table name (user_profiles instead of users)
    const result = await client.query('SELECT * FROM user_profiles ORDER BY created_at DESC');
    res.json({ 
      success: true,
      users: result.rows,
      count: result.rows.length,
      message: `Retrieved ${result.rows.length} registered users`
    });
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Status Check Routes
router.post('/status', async (req, res) => {
  const client = await pool.connect();
  try {
    const { client_name } = req.body;
    const result = await client.query(
      'INSERT INTO status_checks (client_name) VALUES ($1) RETURNING *',
      [client_name]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create status check:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

router.get('/status', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM status_checks');
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch status checks:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// Demo User Route
router.get('/demo/user', (req, res) => {
  res.json({
    success: true,
    user: {
      twitter_id: "demo_user_123",
      twitter_username: "demouser",
      twitter_name: "Demo User",
      profile_image: "https://via.placeholder.com/64"
    }
  });
});



export default router;
