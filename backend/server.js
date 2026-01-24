require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes and middleware
const leadRoutes = require('./src/routes/leads');
const webhookRoutes = require('./src/routes/webhooks');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/leads', leadRoutes);
app.use('/api/webhooks', webhookRoutes);

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

// Serve static files from frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});