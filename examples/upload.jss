<html>
<head><title>Upload Test</title></head>
<body>
<h1>Welcome</h1>

<form method="POST" enctype="multipart/form-data">
  Name: <input type="text" name="username"><br>
  File: <input type="file" name="photo"><br>
  <input type="submit" value="Upload">
</form>

<?
echo("<h2>Hello, " + html_escape(_POST.username || 'guest') + "</h2>");


echo("<h5>, __dirname" + __dirname + "</h5>");
echo("<h5>, __filename" + __filename + "</h5>");



if (_FILES.photo) {
  echo("<p>Uploaded file: " + html_escape(_FILES.photo.name) + "</p>");
}
?>

<pre>$_REQUEST:
<?
echo(JSON.stringify(_REQUEST, null, 2));
?>




<?
// Count page views
_SESSION.count = (_SESSION.count || 0) + 1;
_SESSION.name = 'password';
echo("Page views: " + JSON.stringify(_SESSION));
_SESSION.count = _SESSION.count+1;
?>

<pre>$_FILES:
<?
echo(JSON.stringify(_FILES, null, 2));
?>


<pre>$_SERVER:
<?
echo(JSON.stringify(_SERVER, null, 2));
?>
</pre>
</body>
</html>
