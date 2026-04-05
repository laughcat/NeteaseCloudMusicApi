// Vercel Serverless Function - wraps NeteaseCloudMusicApi Express app
const path = require('path');
const fs = require('fs');
const express = require('express');
const fileUpload = require('express-fileupload');
const { cookieToJson } = require('../util/index');
const decode = require('safe-decode-uri-component');

// Build the Express app (reusing consturctServer logic from server.js)
const app = express();
app.set('trust proxy', true);

// CORS
app.use((req, res, next) => {
  if (req.path !== '/' && !req.path.includes('.')) {
    res.set({
      'Access-Control-Allow-Credentials': true,
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Headers': 'X-Requested-With,Content-Type',
      'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
      'Content-Type': 'application/json; charset=utf-8',
    });
  }
  req.method === 'OPTIONS' ? res.status(204).end() : next();
});

// Cookie parser
app.use((req, _, next) => {
  req.cookies = {};
  (req.headers.cookie || '').split(/;\s+|(?<!\s)\s+$/g).forEach((pair) => {
    let crack = pair.indexOf('=');
    if (crack < 1 || crack == pair.length - 1) return;
    req.cookies[decode(pair.slice(0, crack)).trim()] = decode(pair.slice(crack + 1)).trim();
  });
  next();
});

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(fileUpload());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Cache
try {
  const cache = require('../util/apicache').middleware;
  app.use(cache('5 minutes'));
} catch (e) {}

// Load all modules dynamically
const modulesPath = path.join(__dirname, '..', 'module');
const moduleFiles = fs.readdirSync(modulesPath).filter(f => f.endsWith('.js'));

moduleFiles.forEach((file) => {
  const moduleName = file.replace(/\.js$/, '');
  const route = '/' + moduleName.replace(/_/g, '/');
  const handler = require(path.join(modulesPath, file));

  app.get(route, async (req, res) => {
    try {
      const query = Object.assign({}, req.query, req.body);
      if (typeof query.cookie === 'string') {
        query.cookie = cookieToJson(query.cookie);
      }
      const result = await handler({
        ...query,
        cookie: query.cookie || req.cookies || {},
      }, require('../util/request'));
      res.append('Set-Cookie', result.cookie || []);
      res.status(result.status || 200).send(result.body);
    } catch (err) {
      console.error(`Error in ${route}:`, err);
      res.status(500).json({ code: 500, message: err.message });
    }
  });

  // Also handle POST
  app.post(route, async (req, res) => {
    try {
      const query = Object.assign({}, req.query, req.body);
      if (typeof query.cookie === 'string') {
        query.cookie = cookieToJson(query.cookie);
      }
      const result = await handler({
        ...query,
        cookie: query.cookie || req.cookies || {},
      }, require('../util/request'));
      res.append('Set-Cookie', result.cookie || []);
      res.status(result.status || 200).send(result.body);
    } catch (err) {
      console.error(`Error in ${route}:`, err);
      res.status(500).json({ code: 500, message: err.message });
    }
  });
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', modules: moduleFiles.length, name: 'NeteaseCloudMusicApi' });
});

module.exports = app;
