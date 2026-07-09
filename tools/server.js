/**
 * Serveur local pour l'éditeur de positions.
 * Lance avec : node tools/server.js
 * Puis ouvre : http://localhost:3333/tools/position-editor/
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT    = 3333;
const ROOT    = path.join(__dirname, '..'); // racine du projet
const CONFIG  = path.join(ROOT, 'content', 'config.json');
const TEXTS   = path.join(ROOT, 'content', 'texts.html');

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Échappe le texte saisi pour un usage sûr en tant que contenu HTML
// (le nom d'ingrédient est inséré tel quel dans <h1 data-key="title">).
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  // CORS pour les requêtes locales
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── API : sauvegarde des positions ──────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/save-positions') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newPositions = JSON.parse(body); // [{id, x, y}, ...]
        const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

        newPositions.forEach(({ id, x, y }) => {
          const ingredient = config.ingredients.find(m => m.id === id);
          if (ingredient) {
            ingredient.position.x = x;
            ingredient.position.y = y;
          }
        });

        fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, saved: newPositions.length }));
        console.log(`✓ ${newPositions.length} positions sauvegardées dans config.json`);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── API : sauvegarde des noms d'ingrédients (dans texts.html) ───────────
  if (req.method === 'POST' && req.url === '/api/save-names') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const newNames = JSON.parse(body); // [{id, title}, ...]
        let html = fs.readFileSync(TEXTS, 'utf8');
        let saved = 0;

        newNames.forEach(({ id, title }) => {
          const re = new RegExp(
            `(<section data-ingredient="${escapeRegExp(id)}">[\\s\\S]*?<h1 data-key="title">)([\\s\\S]*?)(</h1>)`
          );
          if (re.test(html)) {
            html = html.replace(re, (_, before, _old, after) => before + escapeHtml(title.trim()) + after);
            saved++;
          }
        });

        fs.writeFileSync(TEXTS, html, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, saved }));
        console.log(`✓ ${saved} noms d'ingrédients sauvegardés dans texts.html`);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── Fichiers statiques ──────────────────────────────────────────────────
  let urlPath = req.url.split('?')[0];
  if (urlPath.endsWith('/') || urlPath === '') urlPath += 'index.html';

  const filePath = path.join(ROOT, urlPath);

  // Sécurité : pas de sortie hors du ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not found: ' + urlPath);
    } else {
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 Serveur LRDS démarré`);
  console.log(`   App principale   → http://localhost:${PORT}/`);
  console.log(`   Éditeur positions → http://localhost:${PORT}/tools/position-editor/\n`);
});
