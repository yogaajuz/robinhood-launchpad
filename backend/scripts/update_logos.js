const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await pool.query("UPDATE tokens SET logo_url = $1 WHERE symbol = $2", ["/uploads/logo_sampi.png", "SAMPI"]);
  await pool.query("UPDATE tokens SET logo_url = $1 WHERE symbol = $2", ["/uploads/logo_scat.png", "SCAT"]);
  const res = await pool.query("SELECT id, name, symbol, logo_url FROM tokens");
  console.log("Updated Neon tokens:", res.rows);
  await pool.end();
}

main().catch(err => {
  console.error("DB Update error:", err);
  pool.end();
});
