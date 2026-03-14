const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const tokenize = require('./tokenizer');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node server.js <path-to-html-file-or-directory>');
  process.exit(1);
}

const resolvedPath = path.resolve(inputPath);
const stat = fs.statSync(resolvedPath);
const htmlPath = stat.isDirectory()
  ? path.join(resolvedPath, 'index.html')
  : resolvedPath;
const htmlDir = stat.isDirectory()
  ? resolvedPath
  : path.dirname(resolvedPath);
const editorHtmlPath = path.join(htmlDir, 'editor.html');

if (!fs.existsSync(htmlPath)) {
  console.error(`Error: HTML file not found at ${htmlPath}`);
  process.exit(1);
}

const PORT = 3456;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

const EDITOR_CSS = `.editor-editable { transition: outline 0.15s ease, background 0.15s ease; cursor: text; }
.editor-editable:hover { outline: 2px dashed rgba(59, 130, 246, 0.5); outline-offset: 2px; }
.editor-editable.editor-active { outline: 2px solid #3b82f6; outline-offset: 2px; background: rgba(59, 130, 246, 0.05); }
.editor-toolbar { position: absolute; display: none; background: #1f2937; border-radius: 6px; padding: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10001; gap: 2px; }
.editor-toolbar.editor-toolbar-visible { display: flex; }
.editor-toolbar button { background: none; border: none; color: #fff; padding: 4px 10px; cursor: pointer; border-radius: 4px; font-size: 14px; font-weight: 700; }
.editor-toolbar button:hover { background: rgba(255,255,255,0.15); }
.editor-save-bar { position: fixed; bottom: 20px; right: 20px; z-index: 10000; display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.editor-save-bar .editor-save-btn { background: #3b82f6; color: #fff; border: none; padding: 8px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 600; }
.editor-save-bar .editor-save-btn:disabled { background: #9ca3af; cursor: not-allowed; }
.editor-save-bar .editor-save-btn:not(:disabled):hover { background: #2563eb; }
.editor-save-bar .editor-save-status { font-size: 13px; color: #6b7280; }
.editor-image-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 10002; }
.editor-image-input { width: 100%; max-width: 500px; padding: 12px; border: 2px solid #3b82f6; border-radius: 6px; font-size: 14px; outline: none; }
[data-llm] { background: rgba(168, 85, 247, 0.25); border-bottom: 2px dotted rgba(168, 85, 247, 0.6); position: relative; cursor: help; border-radius: 3px; padding: 1px 2px; }
[data-llm]::before { content: 'M'; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; font-style: normal; font-family: sans-serif; color: #fff; background: #a855f7; width: 14px; height: 14px; border-radius: 3px; margin-right: 3px; vertical-align: middle; line-height: 1; flex-shrink: 0; }
[data-llm]:hover::after { content: attr(data-llm); position: absolute; bottom: calc(100% + 6px); left: 0; background: #1f2937; color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 12px; font-weight: 400; font-style: normal; line-height: 1.4; white-space: nowrap; max-width: 300px; overflow: hidden; text-overflow: ellipsis; z-index: 10003; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.editor-mark-popup { position: absolute; z-index: 10002; background: #1f2937; border-radius: 8px; padding: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); display: flex; gap: 6px; align-items: center; }
.editor-mark-popup input { background: #374151; border: 1px solid #4b5563; color: #fff; padding: 6px 10px; border-radius: 4px; font-size: 13px; min-width: 220px; outline: none; }
.editor-mark-popup input:focus { border-color: #a855f7; }
.editor-mark-popup input::placeholder { color: #9ca3af; }
.editor-mark-popup button { background: #a855f7; color: #fff; border: none; padding: 6px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.editor-mark-popup button:hover { background: #9333ea; }
.editor-toolbar button.editor-mark-btn { color: #c084fc; }
.editor-toolbar button.editor-mark-btn:hover { background: rgba(168, 85, 247, 0.3); }
.editor-toolbar button.editor-unmark-btn { color: #f87171; font-size: 12px; }
.editor-toolbar button.editor-unmark-btn:hover { background: rgba(248, 113, 113, 0.3); }
.editor-toolbar button.editor-unmark-btn[hidden] { display: none; }`;

function build() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const map = tokenize(html);
  const editorCore = fs.readFileSync(path.join(__dirname, 'editor-core.js'), 'utf8');
  const injection = `<script id="editor-map">window.EDITOR_MAP = ${JSON.stringify(map)};</script>` +
    `<style id="editor-css">${EDITOR_CSS}</style>` +
    `<script id="editor-script">${editorCore}</script>`;

  const bodyMatch = html.match(/<\/body>/i);
  const output = bodyMatch
    ? html.slice(0, bodyMatch.index) + injection + html.slice(bodyMatch.index)
    : html + injection;

  fs.writeFileSync(editorHtmlPath, output, 'utf8');
}

build();

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const changes = payload.changes || {};

        let file = fs.readFileSync(htmlPath, 'utf8');
        const map = tokenize(file);
        const sorted = Object.entries(changes)
          .map(([id, newContent]) => {
            const entry = map[Number(id)];
            if (!entry) return null;
            return { ...entry, newContent };
          })
          .filter(item => item && item.innerHTMLStart != null)
          .sort((a, b) => b.innerHTMLStart - a.innerHTMLStart);

        for (const { innerHTMLStart, innerHTMLEnd, newContent } of sorted) {
          file = file.slice(0, innerHTMLStart) + newContent + file.slice(innerHTMLEnd);
        }

        fs.writeFileSync(htmlPath, file, 'utf8');
        build();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    const ext = path.extname(editorHtmlPath);
    const mime = MIME[ext] || 'application/octet-stream';
    fs.readFile(editorHtmlPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET') {
    const urlPath = req.url.split('?')[0];
    const filePath = path.join(htmlDir, urlPath);
    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': mime });
      res.end(data);
    });
    return;
  }

  res.writeHead(405);
  res.end('Method not allowed');
});

server.listen(PORT, () => {
  console.log(`Editor running at http://localhost:${PORT}`);
  try { execSync('open http://localhost:3456'); } catch (e) {}
});
