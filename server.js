/**
 * Deploy Platform - Pure Node.js Server (zero external deps)
 * Handles: static files, multipart file upload, SSE deploy streams, API
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(os.tmpdir(), 'deploy-uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// In-memory deploy jobs store
const jobs = new Map();

// ─── MIME Types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.zip':  'application/zip',
};

// ─── Multipart Parser (no multer needed) ──────────────────────────────────────
function parseMultipart(req, callback) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(.+)$/);
  if (!boundaryMatch) return callback(new Error('No boundary'), null);

  const boundary = '--' + boundaryMatch[1];
  const chunks = [];

  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    try {
      const body = Buffer.concat(chunks);
      const parts = [];
      const boundaryBuf = Buffer.from('\r\n' + boundary);
      
      // Find all parts
      let start = body.indexOf(boundary) + boundary.length + 2; // skip \r\n after first boundary
      
      while (start < body.length) {
        const end = body.indexOf('\r\n' + boundary, start);
        if (end === -1) break;
        
        const part = body.slice(start, end);
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) { start = end + boundaryBuf.length + 2; continue; }
        
        const headerStr = part.slice(0, headerEnd).toString('utf8');
        const data = part.slice(headerEnd + 4);
        
        const nameMatch = headerStr.match(/name="([^"]+)"/);
        const filenameMatch = headerStr.match(/filename="([^"]+)"/);
        const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i);
        
        if (nameMatch) {
          parts.push({
            name: nameMatch[1],
            filename: filenameMatch ? filenameMatch[1] : null,
            contentType: ctMatch ? ctMatch[1].trim() : 'text/plain',
            data: data
          });
        }
        
        start = end + ('\r\n' + boundary).length + 2;
        if (body.slice(end + ('\r\n' + boundary).length, end + ('\r\n' + boundary).length + 2).toString() === '--') break;
      }
      
      callback(null, parts);
    } catch (e) {
      callback(e, null);
    }
  });
  
  req.on('error', err => callback(err, null));
}

// ─── Deploy Simulators ────────────────────────────────────────────────────────
const PLATFORMS = {
  netlify: {
    name: 'Netlify', emoji: '🔺', color: '#00ad9f',
    domain: 'netlify.app',
    steps: ['Parsing project...', 'Optimizing assets...', 'Deploying to CDN...', 'Setting up SSL...', 'Live!'],
    timing: [800, 1200, 1500, 800, 400],
  },
  vercel: {
    name: 'Vercel', emoji: '▲', color: '#ffffff',
    domain: 'vercel.app',
    steps: ['Analyzing framework...', 'Building project...', 'Uploading to Edge...', 'Assigning domain...', 'Ready!'],
    timing: [600, 2000, 1000, 600, 300],
  },
  github: {
    name: 'GitHub Pages', emoji: '🐙', color: '#8957e5',
    domain: 'github.io',
    steps: ['Creating repo...', 'Pushing files...', 'Enabling Pages...', 'Building site...', 'Published!'],
    timing: [1000, 1500, 800, 1200, 400],
  },
  surge: {
    name: 'Surge.sh', emoji: '⚡', color: '#f75c00',
    domain: 'surge.sh',
    steps: ['Connecting...', 'Uploading files...', 'Publishing...', 'Done!'],
    timing: [400, 1800, 600, 300],
  },
  cloudflare: {
    name: 'Cloudflare Pages', emoji: '🌤', color: '#f48120',
    domain: 'pages.dev',
    steps: ['Authenticating...', 'Uploading assets...', 'Deploying globally...', 'Purging cache...', 'Live on Edge!'],
    timing: [700, 1600, 1200, 500, 300],
  },
  render: {
    name: 'Render', emoji: '🔴', color: '#46e3b7',
    domain: 'onrender.com',
    steps: ['Cloning...', 'Installing deps...', 'Building...', 'Starting service...', 'Running!'],
    timing: [500, 2500, 2000, 800, 400],
  },
};

// Simulate real deploy to a platform
async function simulateDeploy(platform, fileName, jobId, sendEvent) {
  const config = PLATFORMS[platform];
  if (!config) return { success: false, error: 'Unknown platform' };

  const projectSlug = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 20)
    .replace(/-+$/, '');
  
  const suffix = crypto.randomBytes(3).toString('hex');
  const deployUrl = `${projectSlug}-${suffix}.${config.domain}`;

  let totalTime = 0;
  let progress = 0;
  
  for (let i = 0; i < config.steps.length; i++) {
    const step = config.steps[i];
    const time = config.timing[i];
    progress = Math.round(((i + 1) / config.steps.length) * 100);
    
    sendEvent({ platform, type: 'progress', step, progress });
    await sleep(time);
  }

  // 95% success rate simulation
  const success = Math.random() > 0.05;
  
  if (success) {
    sendEvent({ platform, type: 'done', url: deployUrl, progress: 100 });
    return { success: true, url: deployUrl, platform };
  } else {
    sendEvent({ platform, type: 'error', message: 'Deploy failed - try again' });
    return { success: false, error: 'Deploy failed' };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Request Body Parser (JSON) ───────────────────────────────────────────────
function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => {
    try { callback(null, JSON.parse(body)); }
    catch(e) { callback(null, {}); }
  });
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200); res.end(); return;
  }

  // ── API: Upload File ─────────────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/upload') {
    parseMultipart(req, (err, parts) => {
      if (err) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        return res.end(JSON.stringify({ error: 'Upload failed: ' + err.message }));
      }
      
      const filePart = parts && parts.find(p => p.name === 'file' && p.filename);
      if (!filePart) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        return res.end(JSON.stringify({ error: 'No file found in upload' }));
      }
      
      const fileId = crypto.randomUUID();
      const ext = path.extname(filePart.filename) || '.zip';
      const safeName = filePart.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const savePath = path.join(UPLOAD_DIR, fileId + ext);
      
      fs.writeFile(savePath, filePart.data, (writeErr) => {
        if (writeErr) {
          res.writeHead(500, {'Content-Type': 'application/json'});
          return res.end(JSON.stringify({ error: 'Failed to save file' }));
        }
        
        const sizeMB = (filePart.data.length / (1024 * 1024)).toFixed(2);
        console.log(`[UPLOAD] ${safeName} (${sizeMB} MB) → ${fileId}`);
        
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          success: true,
          fileId,
          fileName: safeName,
          size: filePart.data.length,
          path: savePath
        }));
      });
    });
    return;
  }

  // ── API: Start Deploy (SSE) ──────────────────────────────────────────────
  if (req.method === 'POST' && pathname === '/api/deploy') {
    parseBody(req, async (err, body) => {
      const { fileId, fileName, platforms: selectedPlatforms } = body || {};
      
      if (!fileId || !selectedPlatforms || !selectedPlatforms.length) {
        res.writeHead(400, {'Content-Type': 'application/json'});
        return res.end(JSON.stringify({ error: 'Missing fileId or platforms' }));
      }
      
      // SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      
      const sendEvent = (data) => {
        try {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch(e) {}
      };
      
      sendEvent({ type: 'start', platforms: selectedPlatforms });
      
      // Deploy to all platforms concurrently
      const deployPromises = selectedPlatforms.map(platform =>
        simulateDeploy(platform, fileName || 'project', fileId, sendEvent)
      );
      
      try {
        const results = await Promise.all(deployPromises);
        sendEvent({ type: 'complete', results });
      } catch(e) {
        sendEvent({ type: 'error', message: e.message });
      }
      
      res.end();
    });
    return;
  }

  // ── API: Platforms List ──────────────────────────────────────────────────
  if (req.method === 'GET' && pathname === '/api/platforms') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    const list = Object.entries(PLATFORMS).map(([id, p]) => ({
      id, name: p.name, emoji: p.emoji, color: p.color, domain: p.domain
    }));
    res.end(JSON.stringify(list));
    return;
  }

  // ── Static Files ─────────────────────────────────────────────────────────
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // Try index.html fallback
      filePath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(filePath, (e, data) => {
        if (e) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(data);
      });
      return;
    }
    
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║     🚀 Deploy Platform - Running!        ║
║     http://localhost:${PORT}                 ║
╚══════════════════════════════════════════╝
  `);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use. Try PORT=3001 node server.js`);
  } else {
    console.error('Server error:', err);
  }
});
