import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  port: parseInt(process.env.PGPORT || '5432'),
});

// Initialize database tables
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        twitter_id VARCHAR(255) UNIQUE NOT NULL,
        twitter_username VARCHAR(255) NOT NULL,
        twitter_name VARCHAR(255) NOT NULL,
        telegram_username VARCHAR(255) NOT NULL,
        wallet_address VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_profiles (
        id SERIAL PRIMARY KEY,
        wallet_address VARCHAR(42) NOT NULL,
        twitter_id VARCHAR(100) NOT NULL,
        twitter_username VARCHAR(100),
        twitter_name VARCHAR(200),
        telegram_username VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_user_profiles_twitter_id UNIQUE (twitter_id),
        CONSTRAINT uq_user_profiles_telegram_username UNIQUE (telegram_username),
        CONSTRAINT uq_user_profiles_wallet_address UNIQUE (wallet_address)
      );

      CREATE TABLE IF NOT EXISTS status_checks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_name VARCHAR(255) NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      -- Create indexes for user_profiles
      CREATE INDEX IF NOT EXISTS idx_user_profiles_wallet ON user_profiles(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_user_profiles_twitter_id ON user_profiles(twitter_id);
      CREATE INDEX IF NOT EXISTS idx_user_profiles_telegram_username ON user_profiles(telegram_username);

      -- Create trigger for updated_at
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';

      DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
      CREATE TRIGGER update_user_profiles_updated_at
          BEFORE UPDATE ON user_profiles
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `);
    console.log('Database tables initialized successfully');
  } finally {
    client.release();
  }
};

export { pool, initializeDatabase };
