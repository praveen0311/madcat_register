# MadCat Register Score API Backend

A Node.js Express API backend for Twitter authentication and user registration system.

## Features

- 🐦 Twitter OAuth 1.0a authentication
- 👤 User registration with Twitter, Telegram, and wallet address
- 🔐 Admin panel for user management
- 📊 PostgreSQL database integration
- 📚 Swagger API documentation
- 🚀 Production-ready with security middleware

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**Important Environment Variables:**

```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# Twitter OAuth (Get from Twitter Developer Console)
TWITTER_API_KEY=your_twitter_consumer_key
TWITTER_API_SECRET=your_twitter_consumer_secret

# App Configuration
NODE_ENV=development
PORT=3001

# Backend URL for OAuth callbacks (IMPORTANT: Just domain, no paths!)
BACKEND_URL=https://your-app.railway.app

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
```

### 3. Database Setup

Ensure your PostgreSQL database is accessible and run:

```bash
npm run start
```

The application will automatically create the required tables.

### 4. Development

```bash
npm run dev  # Start with nodemon for auto-reload
npm start    # Start production server
```

## API Endpoints

- `GET /api/auth/twitter` - Start Twitter OAuth flow
- `GET /api/auth/twitter/callback` - Twitter OAuth callback
- `POST /api/register` - Register new user
- `POST /api/users` - Get all users (Admin only)
- `GET /api-docs` - Swagger documentation

## Deployment

### Railway Deployment

1. **Set Environment Variables** in Railway dashboard:
   ```
   BACKEND_URL=https://your-app.railway.app
   TWITTER_API_KEY=your_key
   TWITTER_API_SECRET=your_secret
   DATABASE_URL=(automatically provided by Railway PostgreSQL)
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=secure_password
   FRONTEND_URL=https://your-frontend.vercel.app
   ```

2. **Twitter Developer Console Setup**:
   - Add callback URL: `https://your-app.railway.app/api/auth/twitter/callback`

### Common Issues

**URL Duplication Error**: If you see URLs like `domain.com/api-docs/domain.com/api/auth/twitter`:
- Ensure `BACKEND_URL` contains only the domain: `https://your-app.railway.app`
- NOT: `https://your-app.railway.app/api` or `https://your-app.railway.app/`

## Database Schema

The application creates these tables automatically:

### user_profiles
- `id` (SERIAL PRIMARY KEY)
- `twitter_id` (VARCHAR UNIQUE)
- `twitter_username` (VARCHAR)
- `twitter_name` (VARCHAR)
- `telegram_username` (VARCHAR UNIQUE)
- `wallet_address` (VARCHAR UNIQUE)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### status_checks
- `id` (SERIAL PRIMARY KEY)
- `client_name` (VARCHAR)
- `created_at` (TIMESTAMP)

## Security Features

- Rate limiting on all endpoints
- Input validation and sanitization
- CORS configuration
- Helmet security headers
- Environment-based configuration

## License

MIT License
