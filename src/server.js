const express = require('express');
const path = require('path');
const itemsRoutes = require('./itemsRoutes');

const app = express();

app.use(express.json());

// Serve static UI
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/items', itemsRoutes);

// GitHub webhook handler
app.post('/git/webhooks/github', (req, res) => {
  console.log('GitHub webhook received:', req.body);
  // Handle webhook payload here
  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('API:  GET/POST/DELETE http://localhost:%d/api/items', PORT);
  console.log('Webhook: POST http://localhost:%d/git/webhooks/github', PORT);
});

