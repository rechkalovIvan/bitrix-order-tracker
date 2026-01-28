require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes and middleware
const leadRoutes = require('./src/routes/leads');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/leads', leadRoutes);

// Health check endpoints (must be before static middleware)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'backend' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'api' });
});

// API catch-all handler (for better 404 responses on API routes)
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Legacy route for backward compatibility
app.get('/', (req, res) => {
  res.send(`
    <h1>Отслеживание лида</h1>
    <p>Пример ссылки: <a href="/track?key=a7x9k2m5">/track?key=a7x9k2m5</a></p>
    <p>API: <a href="/api/leads/a7x9k2m5">/api/leads/a7x9k2m5</a></p>
  `);
});

// Legacy track route for backward compatibility
app.get('/track', async (req, res) => {
  const { key } = req.query;
  if (!key) {
    return res.status(400).send('Не указан ключ доступа.');
  }
  
  // Redirect to frontend or serve legacy HTML
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  } else {
    // In development, provide a simple redirect
    res.send(`
      <html>
        <head><title>Redirect</title></head>
        <body>
          <h1>Redirecting to frontend...</h1>
          <p>Please use the frontend application at <a href="http://localhost:5173/track/${key}">http://localhost:5173/track/${key}</a></p>
        </body>
      </html>
    `);
  }
});

// Serve static files from frontend in production (only for non-API routes)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  
  // Frontend catch-all (only for non-API routes)
  app.get('*', (req, res, next) => {
    // Don't intercept API routes
    if (req.originalUrl.startsWith('/api/') || req.originalUrl === '/health') {
      return next();
    }
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});