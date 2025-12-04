// db.js
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in environment variables');
  process.exit(1);
}

console.log('Creating Postgres pool with DATABASE_URL:',
  process.env.DATABASE_URL ? 'URL present' : 'URL missing');


const pool = new Pool({
  connectionString: process.env.DATABASE_URL?.replace(/'/g, ""),
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, // maximum number of clients in the pool
  idleTimeoutMillis: 30000, // close idle clients after 30 seconds  
  connectionTimeoutMillis: 5000, // return an error after 2 seconds if connection could not be established
});


pool.connect().then(client => {
  return client.query('SELECT NOW()')
    .then(res => {
      client.release()
      console.log('✅ Connected to Neon database at', res.rows[0].now)
    })
    .catch(err => {
      client.release()
      console.error('Database connection error:', err.stack)
    })
})
  .catch(err => {
    console.error('Database connection error:', err.stack)
    process.exit(1);
  });

/*
// Test the connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('✅ Connected to Neon database');
  }
});
*/


export default pool;
