#!/usr/local/bin/node

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  _GET, _POST, _FILES, _REQUEST, _SERVER, _SESSION,
  echo, header, exit, parse, html_escape
} = require('./cgiNode.js');

const CACHE_DIR = path.join(__dirname, "jss_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

process.on('uncaughtException', err => {
  header("Content-Type: text/html");
  header("Status: 500 Internal Server Error");
  exit(`<h1 style="color:red;">Fatal Error</h1><pre>${html_escape(err.stack)}</pre>`);
});

/**
 * Returns the path to the cached compiled JS file for a given .jss script
 */
function getCachePath(jssPath) {
  const hash = Buffer.from(jssPath).toString('base64').replace(/[/+=]/g, '_');
  return path.join(CACHE_DIR, `${hash}.cache.js`);
}

// Capture output internally
function evaluateEvalBlocks(content, debugMode = false) {
  const blocks = [];
  let lastIndex = 0;

  const regex = /<\?(.*?)\?>/gs;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const staticHTML = content.slice(lastIndex, match.index);
    if (staticHTML) {
      blocks.push(`echo(${JSON.stringify(staticHTML)});`);
    }

    blocks.push(match[1].trim());
    lastIndex = regex.lastIndex;
  }

  const remaining = content.slice(lastIndex);
  if (remaining) {
    blocks.push(`echo(${JSON.stringify(remaining)});`);
  }

  const fullScript = blocks.join('\n');

  let output = '';
  const echo = str => output += str;

  try {
    eval(fullScript);
  } catch (e) {
    if (debugMode) {
	  header("Content-Type: text/html");
      header("Status: 500 Internal Server Error");
      const escapedMessage = html_escape(e.message);
      const escapedStack = html_escape(e.stack);

      // Try to extract the error line number
      const matchLine = e.stack.match(/<anonymous>:(\d+):\d+/);
      const errorLine = matchLine ? parseInt(matchLine[1], 10) : null;

      const numbered = fullScript.split('\n').map((line, idx) => {
        const lineNum = idx + 1;
        const highlight = (lineNum === errorLine) ? 'background: #fee;' : '';
        return `<div style="white-space: pre; ${highlight}"><span style="color:gray;">${lineNum.toString().padStart(4)}:</span> ${html_escape(line)}</div>`;
      }).join('');

      return `
        <h2 style="color:#a00;">Script Error</h2>
        <pre><b>${escapedMessage}</b></pre>
        <h3>Stack Trace:</h3>
        <pre>${escapedStack}</pre>
        <h3>Evaluated Script with Line Numbers:</h3>
        <div style="font-family:monospace; font-size:0.9em;">${numbered}</div>
      `;
    } else {
      throw new Error("Internal error: "+ e.message);
    }
  }

  return output;
}
//------------------------------------------------------
function evaluateSandBox(content, debugMode = false) {
  const blocks = [];
  let lastIndex = 0;

  const regex = /<\?(.*?)\?>/gs;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const staticHTML = content.slice(lastIndex, match.index);
    if (staticHTML) {
      blocks.push(`echo(${JSON.stringify(staticHTML)});`);
    }

    blocks.push(match[1].trim());
    lastIndex = regex.lastIndex;
  }

  const remaining = content.slice(lastIndex);
  if (remaining) {
    blocks.push(`echo(${JSON.stringify(remaining)});`);
  }

  const fullScript = blocks.join('\n');

  let output = '';
  const echo = str => output += str;

  // Create isolated context with allowed globals
  const sandbox = {
    echo,
    _GET,_POST,_REQUEST,_FILES,_SERVER,_SESSION,
    html_escape,console,
	process,Buffer,module,exports,require,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
	__dirname: path.dirname(_SERVER['PATH_TRANSLATED']),
	__filename: _SERVER['PATH_TRANSLATED']
  };

  try {
    const context = vm.createContext(sandbox);
    const script = new vm.Script(fullScript, { filename: _SERVER['SCRIPT_NAME'] || "script.jss" });
    script.runInContext(context);
    return output;

  } catch (e) {
    if (debugMode) {
      const escapedStack = html_escape(e.stack);
      const numbered = fullScript.split('\n').map((line, idx) => {
        const ln = idx + 1;
        return `<div style="white-space: pre;"><span style="color:gray;">${ln.toString().padStart(4)}:</span> ${html_escape(line)}</div>`;
      }).join('');

      return `
        <h2 style="color:#a00;">Script Error</h2>
        <pre><b>${html_escape(e.message)}</b></pre>
        <h3>Stack Trace:</h3>
        <pre>${escapedStack}</pre>
        <h3>Evaluated Script:</h3>
        <div style="font-family:monospace;">${numbered}</div>
      `;
    } else {
      throw new Error("Internal error:" + e.message);
    }
  }
}
//------------------------------------------------------
function parseJSSBlocks(content) {
  const blocks = [];
  let lastIndex = 0;

  const regex = /<\?(.*?)\?>/gs;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const html = content.slice(lastIndex, match.index);
    if (html) blocks.push(`echo(${JSON.stringify(html)});`);

    blocks.push(match[1].trim());
    lastIndex = regex.lastIndex;
  }

  const rest = content.slice(lastIndex);
  if (rest) blocks.push(`echo(${JSON.stringify(rest)});`);

  return blocks;
}

function evaluateJSSwithCache(jssPath, context, debugMode = false) {
  const jssMtime = fs.statSync(jssPath).mtimeMs;
  const cachePath = getCachePath(jssPath);
  let fullScript;

  let useCache = false;
  if (fs.existsSync(cachePath)) {
    const cacheStat = fs.statSync(cachePath);
    if (cacheStat.mtimeMs >= jssMtime) {
      fullScript = fs.readFileSync(cachePath, 'utf8');
      useCache = true;
    }
  }

  if (!useCache) {
    const rawContent = fs.readFileSync(jssPath, 'utf8');
    const blocks = parseJSSBlocks(rawContent);
    fullScript = blocks.join('\n');
    fs.writeFileSync(cachePath, fullScript);
  }

  context.output = '';
  context.echo = str => context.output += str;

  try {
    const script = new vm.Script(fullScript, { filename: path.basename(jssPath) });
    script.runInContext(context);
    return context.output;

  } catch (e) {
    if (debugMode) {
		header("Content-Type: text/html");
		header("Status: 500 Internal Server Error");
      const escapedStack = html_escape(e.stack);
      const numbered = fullScript.split('\n').map((line, idx) => {
        const ln = idx + 1;
        return `<div style="white-space: pre;"><span style="color:gray;">${ln.toString().padStart(4)}:</span> ${html_escape(line)}</div>`;
      }).join('');

      return `
        <h2 style="color:#a00;">Script Error</h2>
        <pre><b>${html_escape(e.message)}</b></pre>
        <h3>Stack Trace:</h3>
        <pre>${escapedStack}</pre>
        <h3>Evaluated Script:</h3>
        <div style="font-family:monospace;">${numbered}</div>
      `;
    } else {
      throw e;
    }
  }
}
//------------------------------------------------------
function evEval()
{
	try {
    const scriptPath = _SERVER['PATH_TRANSLATED'] || _SERVER['SCRIPT_FILENAME'];      
   //_SERVER['PATH_TRANSLATED'];
	
    if (!scriptPath) {
      throw new Error("PATH_TRANSLATED not set");
    }
	header("Content-Type: text/html");

	const debug = _GET.debug === '1' || process.env.DEBUG === '1';
    const rawContent = fs.readFileSync(scriptPath, 'utf8');
    const renderedOutput =  evaluateEvalBlocks(rawContent, debug);

    
    exit(renderedOutput);

  } catch (err) {
    // Error handler block
    header("Content-Type: text/html");
    header("Status: 500 Internal Server Error");
    const safeMsg = html_escape(err.message);
    exit(`
      <html>
      <head><title>Script Error</title></head>
      <body style="font-family:sans-serif;color:#c00;">
        <h1>Execution Error</h1>
        <pre>${safeMsg}</pre>
      </body>
      </html>
    `);
  }
}
//------------------------------------------------------
function evSandBox()
{
	try {
    const scriptPath = _SERVER['PATH_TRANSLATED'] || _SERVER['SCRIPT_FILENAME'];      
   //_SERVER['PATH_TRANSLATED'];
	
    if (!scriptPath) {
      throw new Error("PATH_TRANSLATED not set");
    }
	header("Content-Type: text/html");

	const debug = _GET.debug === '1' || process.env.DEBUG === '1';
    const rawContent = fs.readFileSync(scriptPath, 'utf8');
    const renderedOutput =  evaluateSandBox(rawContent, debug);// evaluateEvalBlocks(rawContent, debug);

    
    exit(renderedOutput);

  } catch (err) {
    // Error handler block
    header("Content-Type: text/html");
    header("Status: 500 Internal Server Error");
    const safeMsg = html_escape(err.message);
    exit(`
      <html>
      <head><title>Script Error</title></head>
      <body style="font-family:sans-serif;color:#c00;">
        <h1>Execution Error</h1>
        <pre>${safeMsg}</pre>
      </body>
      </html>
    `);
  }
}
//------------------------------------------------------
function evCompiled()
{
	try {
    const scriptPath = _SERVER['PATH_TRANSLATED'] || _SERVER['SCRIPT_FILENAME'];      
    const debug = _GET.debug === '1' || process.env.DEBUG === '1';


    const context = vm.createContext({
      echo: str => {},
      header,exit, html_escape,module: {},exports: {},
      _GET, _POST, _REQUEST, _FILES, _SERVER, _SESSION,
      require,console,process,Buffer,
	  setTimeout,clearTimeout,setInterval,clearInterval,
	  __dirname: path.dirname(scriptPath),
      __filename: scriptPath,
    });

	header("Content-Type: text/html");
    const output = evaluateJSSwithCache(scriptPath, context, debug);
    
    exit(output);

  } catch (e) {
    header("Content-Type: text/html");
    header("Status: 500 Internal Server Error");
    exit(`<pre style="color:red;">${html_escape(e.stack)}</pre>`);
  }
}

// Main CGI parse block
parse(() => {
  //evSandBox();
  //evEval();
  evCompiled();
});