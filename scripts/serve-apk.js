const http = require("http");
const fs = require("fs");

const file = process.env.USERPROFILE + "\\Desktop\\Mashrou3App-preview.apk";
const port = 8765;

const server = http.createServer((req, res) => {
  const stat = fs.statSync(file);
  res.writeHead(200, {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Length": stat.size,
    "Content-Disposition": 'attachment; filename="Mashrou3App.apk"',
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log("APK ready on port " + port);
});
