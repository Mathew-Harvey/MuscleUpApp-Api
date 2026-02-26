const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const PORT = 4001;
const API_TARGET = process.env.API_URL || 'http://localhost:4000';

app.use(express.static(path.join(__dirname, 'public')));

app.use(['/api', '/health'], (req, res) => {
  const parsed = new URL(API_TARGET);
  const options = {
    hostname: parsed.hostname,
    port: parsed.port,
    path: req.originalUrl,
    method: req.method,
    headers: { ...req.headers, host: parsed.host },
  };

  const proxy = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', () => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'API unavailable — is the API server running on port 4000?' });
    }
  });

  req.pipe(proxy, { end: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dashboard → http://localhost:${PORT}`);
  console.log(`Proxying API → ${API_TARGET}`);
});
