const express = require('express');
const cors = require('cors');
const dbFactory = require('../modules/storage/dbFactory');
const logger = require('../utils/logger');

const searchRoutes = require('./routes/searches');
const analyticsRoutes = require('./routes/analytics');
const nlSearchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to Database on startup
let isConnected = false;

async function connectDB() {
  if (!isConnected) {
    try {
      const db = await dbFactory.getDB();
      // Most adapters connect in constructor or implicitly, but if we need explicit connect:
      // await db.connect(); 
      // Our factory calls connect() already.
      isConnected = true;
      logger.info('API: Connected to Database');
    } catch (error) {
      logger.error('API: Failed to connect to Database', { error: error.message });
      throw error;
    }
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connected: isConnected,
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/searches', searchRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/search', nlSearchRoutes);
app.use('/api/auth', require('./routes/auth'));

// Error handler
app.use((err, req, res, next) => {
  logger.error('API Error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: err.message });
});

// Start server
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`API server running on http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    logger.error('Failed to start API server', { error: error.message });
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down API server...');
  try {
    const db = await dbFactory.getDB();
    await db.disconnect();
  } catch (err) {
    logger.warn('Error closing DB connection', err);
  }
  process.exit(0);
});

