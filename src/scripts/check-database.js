import dotenv from 'dotenv';
import { pool } from '../config/database.js';

// Load environment variables
dotenv.config();

const checkDatabase = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking database schema...');
    
    // Check what columns exist in user_profiles table
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user_profiles' 
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📊 Current user_profiles table structure:');
    console.table(result.rows);
    
    // Check if telegram_username column exists
    const telegramUsernameExists = result.rows.some(row => row.column_name === 'telegram_username');
    const telegramIdExists = result.rows.some(row => row.column_name === 'telegram_id');
    
    console.log(`\n🔍 Column check:`);
    console.log(`telegram_id exists: ${telegramIdExists}`);
    console.log(`telegram_username exists: ${telegramUsernameExists}`);
    
    if (telegramIdExists && !telegramUsernameExists) {
      console.log('\n⚠️  Database has telegram_id but code expects telegram_username');
      console.log('💡 Need to update database schema to match current code.');
      
      // Update database to use telegram_username
      console.log('\n🔄 Updating database to use telegram_username...');
      await client.query('ALTER TABLE user_profiles RENAME COLUMN telegram_id TO telegram_username;');
      
      // Fix constraint name if it exists
      try {
        await client.query('ALTER TABLE user_profiles RENAME CONSTRAINT uq_user_profiles_telegram_id TO uq_user_profiles_telegram_username;');
      } catch (e) {
        console.log('Constraint rename skipped (may not exist)');
      }
      
      // Fix index name if it exists
      try {
        await client.query('ALTER INDEX idx_user_profiles_telegram_id RENAME TO idx_user_profiles_telegram_username;');
      } catch (e) {
        console.log('Index rename skipped (may not exist)');
      }
      
      console.log('✅ Database updated to use telegram_username');
    } else if (telegramUsernameExists && !telegramIdExists) {
      console.log('\n✅ Database correctly uses telegram_username - matches current code');
    } else if (!telegramUsernameExists && !telegramIdExists) {
      console.log('\n⚠️  Neither column exists - table may need initialization');
    } else {
      console.log('\n❌ Both columns exist - this is unexpected');
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  } finally {
    client.release();
    process.exit(0);
  }
};

checkDatabase();
