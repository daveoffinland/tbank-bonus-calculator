const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database setup
let db;

function initDatabase() {
  const dbPath = '/tmp/bonus_calculator.db';
  db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS bonus_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT UNIQUE NOT NULL,
      rate REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    const defaultRates = [
      ['Level I', 0.00005],
      ['Level II', 0.000055],
      ['Level III', 0.00006]
    ];

    const stmt = db.prepare('INSERT OR IGNORE INTO bonus_rates (level, rate) VALUES (?, ?)');
    defaultRates.forEach(([level, rate]) => {
      stmt.run(level, rate);
    });
    stmt.finalize();
  });
}

initDatabase();

// Routes
app.get('/api/bonus-rates', (req, res) => {
  db.all('SELECT level, rate FROM bonus_rates ORDER BY level', (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Failed to fetch bonus rates' });
      return;
    }
    
    const rates = {};
    rows.forEach(row => {
      rates[row.level] = row.rate;
    });
    
    res.json(rates);
  });
});

app.post('/api/bonus-rates', (req, res) => {
  const { rates } = req.body;
  
  if (!rates || typeof rates !== 'object') {
    res.status(400).json({ error: 'Invalid rates data' });
    return;
  }

  const stmt = db.prepare('UPDATE bonus_rates SET rate = ?, updated_at = CURRENT_TIMESTAMP WHERE level = ?');
  
  let completed = 0;
  let hasError = false;
  const levels = Object.keys(rates);
  
  levels.forEach(level => {
    stmt.run(rates[level], level, function(err) {
      if (err && !hasError) {
        hasError = true;
        console.error('Database update error:', err);
        res.status(500).json({ error: 'Failed to update rates' });
        return;
      }
      
      completed++;
      if (completed === levels.length && !hasError) {
        stmt.finalize();
        res.json({ message: 'Rates updated successfully' });
      }
    });
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString() 
  });
});

// Handle all other routes
app.all('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
