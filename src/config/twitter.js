import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

// These will be initialized after environment variables are loaded
let TWITTER_API_KEY;
let TWITTER_API_SECRET;
let oauth = null;

const TWITTER_REQUEST_TOKEN_URL = "https://api.twitter.com/oauth/request_token";
const TWITTER_AUTHORIZE_URL = "https://api.twitter.com/oauth/authorize";
const TWITTER_ACCESS_TOKEN_URL = "https://api.twitter.com/oauth/access_token";
const TWITTER_USER_INFO_URL = "https://api.twitter.com/1.1/account/verify_credentials.json";

// Function to initialize Twitter configuration after env vars are loaded
function initializeTwitterConfig() {
  TWITTER_API_KEY = process.env.TWITTER_API_KEY;
  TWITTER_API_SECRET = process.env.TWITTER_API_SECRET;
  
  console.log('Initializing Twitter config...');
  //console.log('TWITTER_API_KEY:', TWITTER_API_KEY ? 'FOUND' : 'NOT FOUND');
  //console.log('TWITTER_API_SECRET:', TWITTER_API_SECRET ? 'FOUND' : 'NOT FOUND');

  if (!TWITTER_API_KEY || !TWITTER_API_SECRET) {
    console.warn('Warning: Twitter API credentials not found. Using demo mode.');
    return false;
  }

  // Initialize OAuth 1.0a
  oauth = new OAuth({
    consumer: {
      key: TWITTER_API_KEY,
      secret: TWITTER_API_SECRET
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto
        .createHmac('sha1', key)
        .update(base_string)
        .digest('base64');
    }
  });
  
  console.log('Twitter OAuth configured successfully');
  return true;
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export {
  initializeTwitterConfig,
  oauth,
  TWITTER_API_KEY,
  TWITTER_API_SECRET,
  TWITTER_REQUEST_TOKEN_URL,
  TWITTER_AUTHORIZE_URL,
  TWITTER_ACCESS_TOKEN_URL,
  TWITTER_USER_INFO_URL,
  FRONTEND_URL
};
