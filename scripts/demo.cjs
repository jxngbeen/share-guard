// 데모 파일만 제공하며 프로젝트 상위의 개인 파일에는 접근하지 않습니다.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = {'/qa.html':['qa.html','text/html'],'/qa.js':['qa.js','text/javascript'],'/': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/demo.js': ['demo.js', 'text/javascript'], '/rich.html': ['rich.html', 'text/html'], '/frame.html': ['frame.html', 'text/html'], '/naver-fixture.html': ['naver-fixture.html','text/html'], '/naver-fixture.js': ['naver-fixture.js','text/javascript']};
http.createServer((req, res) => {
  if (req.url === '/favicon.ico') {res.writeHead(204); res.end(); return;}
  const entry = files[req.url];
  if (!entry) {res.writeHead(404); res.end('Not found'); return;}
  res.writeHead(200, {'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store'});
  res.end(fs.readFileSync(path.join(__dirname, '../demo', entry[0])));
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', function () { console.log('Demo: http://127.0.0.1:' + this.address().port); });
