
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

let _GET = {};
let _POST = {};
let _FILES = {};
let _REQUEST = {};
let _SERVER = {};
let _SESSION = {};
let sessionId = null;

let headersSent = false;
let headerBuffer = '';
let bodyBuffer = '';

const sessionDir = path.join(__dirname, 'sessions');
if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

function header(str) {
  if (headersSent) return;
  headerBuffer += str.endsWith('\r\n') ? str : str + '\r\n';
}

function echo(str) {
  bodyBuffer += str;
}

function exit(msg = '') {
  if (!headersSent) {
    process.stdout.write(headerBuffer + '\r\n');
    headersSent = true;
  }
  if (msg) process.stdout.write(msg);
  process.stdout.write(bodyBuffer);
  saveSession();
  
  process.stdout.end();
  process.exit(0);
}

function populateServerVars() {
  const env = process.env;
  for (let key in env) {
    _SERVER[key] = env[key];
  }
  
  _SERVER['REQUEST_TIME'] = Date.now();
  _SERVER['SCRIPT_FILENAME'] = process.env.SCRIPT_FILENAME || __filename;
  _SERVER['DOCUMENT_ROOT'] = process.env.DOCUMENT_ROOT || path.dirname(__filename);
}

function parseCookies() {
  const cookieStr = _SERVER['HTTP_COOKIE'] || '';
  const cookies = {};
  cookieStr.split(';').forEach(cookie => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) cookies[key] = value;
  });
  return cookies;
}

function generateSessionId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadSession() {
  const cookies = parseCookies();
  sessionId = cookies.PHPSESSID || generateSessionId();
  const sessionFile = path.join(sessionDir, `session_${sessionId}.json`);
  if (fs.existsSync(sessionFile)) {
    try {
      const data = fs.readFileSync(sessionFile);
      Object.assign(_SESSION, JSON.parse(data));
    } catch {}
  }
  header(`Set-Cookie: PHPSESSID=${sessionId}; Path=/`);
}

function saveSession() {
  if (!sessionId) return;
  const sessionFile = path.join(sessionDir, `session_${sessionId}.json`);
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(_SESSION));
  } catch {}
}

function parseGetVars() {
  const query = process.env.QUERY_STRING || '';
  const params = new URLSearchParams(query);
  for (const [key, val] of params) _GET[key] = val;
}

function parseMultipart(body, contentType) {
  const boundaryMatch = contentType.match(/boundary=(.*)$/);
  if (!boundaryMatch) return;

  const boundary = '--' + boundaryMatch[1];
  const parts = body.split(boundary).slice(1, -1);

  parts.forEach(part => {
    const [header, content] = part.split('\r\n\r\n');
    if (!header || !content) return;
    const nameMatch = header.match(/name="([^"]+)"/);
    const filenameMatch = header.match(/filename="([^"]+)"/);
    const name = nameMatch && nameMatch[1];
    const value = content.trimEnd();

    if (filenameMatch) {
      _FILES[name] = {
        name: filenameMatch[1],
        content: value
      };
    } else if (name) {
      _POST[name] = value;
    }
  });
}


// Add this to cgiNode.js near other parsing functions
function parseUrlEncodedBody(buffer) {
  const body = buffer.toString();
  const parsed = querystring.parse(body);
  for (const key in parsed) {
    _POST[key] = parsed[key];
  }
}

// === POST body handling ===
function readBody(callback) {
  const method = process.env.REQUEST_METHOD || 'GET';
  if (method !== 'POST') return callback();

  const contentLength = parseInt(process.env.CONTENT_LENGTH || '0', 10);
  const contentType = process.env.CONTENT_TYPE || '';

  const chunks = [];
  let received = 0;

  process.stdin.on('data', chunk => {
    chunks.push(chunk);
    received += chunk.length;
    if (received >= contentLength) {
      const buffer = Buffer.concat(chunks);
      if (contentType.startsWith('multipart/form-data')) {
        const boundary = contentType.split('boundary=')[1];
        if (boundary) parseMultipartBody(buffer, boundary);
      } else if (contentType === 'application/x-www-form-urlencoded') {
        parseUrlEncodedBody(buffer);
      }
      callback();
    }
  });

  process.stdin.on('end', () => {
    if (received < contentLength) callback();
  });
}

// === multipart/form-data ===
function parseMultipartBody(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];

  let start = buffer.indexOf(boundaryBuffer) + boundaryBuffer.length + 2;
  while (start < buffer.length) {
    const nextBoundary = buffer.indexOf(boundaryBuffer, start);
    if (nextBoundary === -1) break;

    const part = buffer.slice(start, nextBoundary - 2);
    parts.push(part);
    start = nextBoundary + boundaryBuffer.length + 2;
  }

  for (const part of parts) {
    const sep = Buffer.from('\r\n\r\n');
    const headerEnd = part.indexOf(sep);
    if (headerEnd === -1) continue;

    const rawHeaders = part.slice(0, headerEnd).toString();
    const content = part.slice(headerEnd + sep.length);

    const nameMatch = rawHeaders.match(/name="([^"]+)"/);
    const filenameMatch = rawHeaders.match(/filename="([^"]*)"/);
    const contentTypeMatch = rawHeaders.match(/Content-Type:\s*(.+)/i);

    const name = nameMatch?.[1];
    const filename = filenameMatch?.[1];
    const contentType = contentTypeMatch?.[1];

    if (filename && filename !== '') {
      const safeFilename = path.basename(filename);
      const tmpPath = path.join(uploadDir, `${Date.now()}_${safeFilename}`);
      fs.writeFileSync(tmpPath, content);
      _FILES[name] = {
        name: safeFilename,
        type: contentType,
        size: content.length,
        tmp_name: tmpPath,
        error: 0
      };
    } else if (name) {
      _POST[name] = content.toString();
    }
  }
}


function populateRequestVars() {
	Object.assign(_REQUEST, _GET, _POST);
  // Already populated via readBody and parseGetVars
}

function parse(callback) {
  populateServerVars();
  loadSession();
  parseGetVars();
  readBody(() => {
    populateRequestVars();
    callback();
  });
}

/**
 * Escape a string for safe HTML output (like PHP's htmlspecialchars)
 * @param {string} str
 * @returns {string}
 */
function html_escape(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[c]);
}

module.exports = {
  _GET,
  _POST,
  _FILES,
  _REQUEST,
  _SERVER,
  _SESSION,
  echo,
  header,
  exit,
  parse,
  html_escape
};
