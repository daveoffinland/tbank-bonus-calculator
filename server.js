const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite database
// Note: Heroku has ephemeral filesystem - database resets on restart
// For production, consider using Heroku Postgres add-on
const db = new sqlite3.Database(':memory:'); // Using in-memory for Heroku

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS bonus_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT UNIQUE NOT NULL,
    rate REAL NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Insert default rates
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

// API Routes
app.get('/api/bonus-rates', (req, res) => {
  console.log('GET /api/bonus-rates called');
  
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
    
    console.log('Returning rates:', rates);
    res.json(rates);
  });
});

app.post('/api/bonus-rates', (req, res) => {
  console.log('POST /api/bonus-rates called with:', req.body);
  
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
        console.log('Rates updated successfully');
        res.json({ message: 'Rates updated successfully' });
      }
    });
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    message: 'TBank Bonus Calculator running on Heroku!',
    port: PORT
  });
});

// Serve main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TBank Bonus Calculator running on port ${PORT}`);
  console.log(`🗄️ Database initialized (in-memory for Heroku)`);
});
