# node-cgi

# CGI Node Framework Documentation

This framework allows `.jss` or `.js` files to be executed as CGI scripts using Node.js under Apache and any webserver implementing a the cgi 1.1 spec. It replicates a PHP-style CGI environment including `_GET`, `_POST`, `_FILES`, `_SERVER`, and `_SESSION`.

- cgiNode.js is the main script handling the varaible creation file transfer, query to variable mappings etc... 
- exec.js is the executing script, creating the context or evaluating the user script. It has 3 modes. 
	1. evaluation mode where the target script is run in same space as exec.js
 	2. sandbox mode where target script is run in a new isolated process
  	3. cached script, where initial run of script is translated and stored to be run in sandbox mode by node.

## 📁 File Structure
Example setup
```
└── libs/
    └── cgi-node/
        ├── cgiNode.js
        ├── exec.js
		├── uploads/
		├── sessions/
                └── jss_cache/
public_html/
├── test.jss
└── upload.jss

```
folders
   cgiNode.js creates 3 folders or assumes them to exist. (paths should and can be updated to your liking.
uploads/		# are where the uploaded files will stored to be passed to the executing script/
sessions/		# this is by default where 
jss_cache/		#(optional) folder where the translated scripts will live, in order to take advantage of nodejs compile, this is only valid if evCompiled() 
---

## 📘 cgiNode.js

The `cgiNode.js` module provides PHP-style CGI variable emulation and utilities for building CGI handlers or interpreters in Node.js.

### ✅ Exported Globals

| Variable     | Type     | Description |
|--------------|----------|-------------|
| `_GET`       | Object   | Parsed query string parameters (e.g., `?a=1&b=2`) |
| `_POST`      | Object   | Parsed body data for `application/x-www-form-urlencoded` or `multipart/form-data` |
| `_FILES`     | Object   | Uploaded files metadata for multipart form uploads |
| `_REQUEST`   | Object   | Union of `_GET` and `_POST` |
| `_SERVER`    | Object   | Environment variables and request metadata (e.g., `SCRIPT_FILENAME`, `HTTP_USER_AGENT`, etc.) |
| `_SESSION`   | Object   | Session storage (file-based) that persists across requests using a cookie |

---

### ✅ Functions

#### `parse(callback)`

**Purpose**: Initializes the CGI environment and calls the provided callback once parsing is done.

```js
  // Access query params
  const name = _GET.name || "Guest";
  echo(`Hello ${html_escape(name)}!`);

```

---

#### `header(str)`

**Purpose**: Adds a raw HTTP header. Call before `echo()` or `exit()`.

```js
header("Content-Type: application/json");
header("X-Custom-Header: Powered-By-Node");
```

---

#### `echo(str)`

**Purpose**: Appends content to the HTTP response body.

```js
echo("<h1>Welcome</h1>");
echo("<p>Page loaded successfully.</p>");
```

---

#### `exit([optionalString])`

**Purpose**: Sends the accumulated headers and body, finalizes session, and terminates the script.

```js
exit();               // Flush headers + body
exit("Done.");        // Also write additional text immediately
```

---

#### `html_escape(str)`

**Purpose**: Escapes special HTML characters for safe display in the browser.

```js
const unsafe = "<script>alert('XSS');</script>";
echo("Sanitized: " + html_escape(unsafe));
```

---

### ✅ File Upload Example

Assuming a form like:

```html
<form method="POST" enctype="multipart/form-data">
  <input type="file" name="profile_picture">
  <input type="submit">
</form>
```

Access the uploaded file:

Example:

```js
{
  profile_picture: {
    name: "image.jpg",
    tmp_name: "/tmp/12345_image.jpg",
    size: 493002,
    type: "image/jpeg",
    error: 0
  }
}
```

```js

  const file = _FILES.profile_picture;
  if (file) {
    echo(`Uploaded ${file.name}, saved to ${file.tmp_name}`);
  }
  
```

---

### ✅ Session Example

```js

  _SESSION.counter = (_SESSION.counter || 0) + 1;
  echo("You have visited this page " + _SESSION.counter + " times.");

```

---

## 📘 exec.js

The `exec.js` script is a CGI handler used with Apache's `Action` directive to run `.jss` files (PHP-style server pages).

### 🔧 How It Works

1. Apache maps `.jss` → `exec.js` using:
   ```apache
   AddHandler jss-script .jss
   Action jss-script /cgi-bin/exec.js
   ```

2. Apache sets `PATH_TRANSLATED` to the requested `.jss` file
3. `exec.js` reads and parses the `.jss`, evaluates `<? ... ?>` blocks using `eval()`

---

### ✅ Example `.jss` File

```html
<h1>Welcome!</h1>
<p>
<? 
  const time = new Date();
  echo("Server time: " + time.toLocaleString());
?>
</p>
```

### ✅ Using with Sessions in `.jss`

```js
<? 
  _SESSION.visits = (_SESSION.visits || 0) + 1;
  echo("Visit number: " + _SESSION.visits);
  exit();
?>
```

---

## 🛠 Apache Setup Example

### VirtualHost Snippet:

```apache
<VirtualHost *:443>
  ServerName www.example.com
  DocumentRoot /home/example/public_html

  <Directory /home/example/public_html>
    Options +ExecCGI
    RemoveHandler .jss
    AddHandler jss-script .jss
    Action jss-script /cgi-bin/exec.js
    Require all granted
  </Directory>

  ScriptAlias /cgi-bin/ /home/libs/cgi-node/
  <Directory /home/libs/cgi-node>
    Options +ExecCGI
    SetHandler cgi-script
    Require all granted
  </Directory>
</VirtualHost>
```

---

## ⚠️ Security Considerations

- **Never eval user input**
- Use `html_escape()` when outputting user-submitted content
- Monitor disk usage of session and upload directories
- Consider file size limits for uploads

---

## ✅ Requirements

- Node.js v16 or later
- Apache with `mod_cgid` or `mod_cgi` enabled
- Correct permissions on session and upload directories

---

**Author:** Shpend Gjonbalaj  
**License:** MIT  
