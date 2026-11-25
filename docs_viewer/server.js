const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const VIEWER_DIR = __dirname;
const DOCS_DIR = path.resolve(VIEWER_DIR, '../docs');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.md': 'text/markdown',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/**
 * Dynamically generates the sidebar markdown content scanning the DOCS_DIR.
 */
function generateSidebar() {
  let content = '- [Home](README.md || /)\n';
  
  if (fs.existsSync(path.join(DOCS_DIR, 'architecture.md'))) {
    content += '- [Architecture](architecture.md)\n';
  }

  const functionalitiesDir = path.join(DOCS_DIR, 'functionalities');
  if (fs.existsSync(functionalitiesDir)) {
    content += '- Functionalities\n';
    const files = fs.readdirSync(functionalitiesDir)
      .filter(f => f.endsWith('.md') && f !== '_index.md')
      .sort();
    
    files.forEach(file => {
      const name = file.replace('.md', '').split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      content += `  - [${name}](functionalities/${file})\n`;
    });
  }

  const futureDir = path.join(DOCS_DIR, 'future');
  if (fs.existsSync(futureDir)) {
    content += '- Future Work\n';
    const files = fs.readdirSync(futureDir)
      .filter(f => f.endsWith('.md') && f !== '_index.md')
      .sort();
    
    files.forEach(file => {
      const name = file.replace('.md', '').split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ').split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      content += `  - [${name}](future/${file})\n`;
    });
  }

  return content;
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];

  // Intercept _sidebar.md requests
  if (urlPath === '/_sidebar.md') {
    res.writeHead(200, { 'Content-Type': 'text/markdown', 'Cache-Control': 'no-cache' });
    res.end(generateSidebar());
    return;
  }

  // Determine if the file is in VIEWER_DIR or DOCS_DIR
  let filePath;
  if (urlPath === '/' || urlPath === '/index.html' || urlPath === '/custom_style.css') {
    filePath = path.join(VIEWER_DIR, urlPath === '/' ? 'index.html' : urlPath);
  } else {
    filePath = path.join(DOCS_DIR, urlPath);
  }
  
  // Security check: ensure the file is within allowed directories
  if (!filePath.startsWith(VIEWER_DIR) && !filePath.startsWith(DOCS_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        process.stdout.write(`[404] Not Found: ${urlPath}\n`);
        res.writeHead(404);
        res.end('File Not Found');
      } else {
        process.stdout.write(`[500] Error reading ${urlPath}: ${err.code}\n`);
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 
      'Content-Type': MIME_TYPES[ext] || 'text/plain',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log('-------------------------------------------');
  console.log(`Smart Manuals Documentation Server Running`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log('-------------------------------------------');
  console.log('Press Ctrl+C to stop the server');
});
