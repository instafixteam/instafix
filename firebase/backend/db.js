// db.js
//dummy change
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

console.log('Creating Postgres pool with DATABASE_URL:', 
  process.env.DATABASE_URL ? 'URL present' : 'URL missing');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/'/g, ""),
  ssl: {
    rejectUnauthorized: false
  }
});

// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('✅ Connected to Neon database');
  }
});

export default pool;
