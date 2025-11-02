const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ["https://fermi-market-game.vercel.app", "https://fermi-market-game-git-main.vercel.app"]
    : "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Serve static files from React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Simple API endpoints for health checks and basic functionality

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

module.exports = app;