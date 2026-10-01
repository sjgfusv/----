const fs = require('fs');
const har = JSON.parse(fs.readFileSync('D:\\ALL\\effervescent-puppy-941d9f.netlify.app.har', 'utf8'));
const bytes = (n) => n == null ? '?' : n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(1) + 'KB' : (n / 1048576).toFixed(2) + 'MB';
const name = (e) => { try { const u = new URL(e.request.url); return decodeURIComponent(u.pathname); } catch { return e.request.url; } };

for (const e of har.log.entries) {
  const h = {};
  for (const x of (e.response.headers || [])) h[x.name.toLowerCase()] = x.value;
  const rq = {};
  for (const x of (e.request.headers || [])) rq[x.name.toLowerCase()] = x.value;
  console.log('--------------------------------------------------');
  console.log(name(e), ' ', e.response.status, e.response.statusText);
  console.log('  httpVersion :', e.response.httpVersion, '| 优先级:', e._priority || e.priority || '-');
  console.log('  网络传输字节 bodySize:', bytes(e.response.bodySize), ' | 解压后 content.size:', bytes(e.response.content.size), ' | compression:', e.response.content.compression);
  console.log('  content-encoding:', h['content-encoding'] || '(无)');
  console.log('  content-type:', h['content-type'] || '(无)');
  console.log('  cache-control:', h['cache-control'] || '(无!)');
  console.log('  etag:', h['etag'] || '(无)', '| last-modified:', h['last-modified'] || '(无)');
  console.log('  age:', h['age'] || '-', '| vary:', h['vary'] || '-', '| server:', h['server'] || '-');
  console.log('  accept-encoding(请求):', rq['accept-encoding'] || '(无)');
  console.log('  user-agent:', (rq['user-agent'] || '').slice(0, 120));
  console.log('  timings: blocked', Math.round(e.timings.blocked), 'dns', Math.round(e.timings.dns), 'connect', Math.round(e.timings.connect), 'ssl', Math.round(e.timings.ssl), 'send', Math.round(e.timings.send), 'wait', Math.round(e.timings.wait), 'receive', Math.round(e.timings.receive));
  if (h['link']) console.log('  link:', h['link']);
}
console.log('\n=== 页面自定义字段 / 设备信息 ===');
console.log(JSON.stringify(har.log.pages, null, 2));
const c = har.log.creator || {};
console.log('creator:', JSON.stringify(c));
console.log('browser:', JSON.stringify(har.log.browser || {}));
console.log('comment:', har.log.comment || '-');
