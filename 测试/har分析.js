// 分析 Netlify HAR：找出加载慢的真实原因
const fs = require('fs');
const harPath = process.argv[2] || 'D:\\ALL\\effervescent-puppy-941d9f.netlify.app.har';
const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
const entries = har.log.entries;

const bytes = (n) => {
  if (n == null) return '?';
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'KB';
  return (n / 1024 / 1024).toFixed(2) + 'MB';
};

const t0 = new Date(entries[0].startedDateTime).getTime();
const name = (e) => {
  try { const u = new URL(e.request.url); return u.pathname === '/' ? '/' : decodeURIComponent(u.pathname); }
  catch { return e.request.url; }
};

console.log('=== 总览 ===');
console.log('请求数:', entries.length);
const lastEnd = Math.max(...entries.map(e => new Date(e.startedDateTime).getTime() - t0 + e.time));
console.log('整条瀑布结束:', (lastEnd / 1000).toFixed(2) + 's');
const sumSize = entries.reduce((a, e) => a + (e.response.content.size || e.response.bodySize || 0), 0);
console.log('传输总量(粗略):', bytes(sumSize));
console.log('HAR 记录的页面:', har.log.pages ? har.log.pages.map(p => p.title + ' @ ' + p.startedDateTime).join(' | ') : '无');

console.log('\n=== 按开始时间排序的前 60 条（时间轴） ===');
const rows = entries.map(e => {
  const start = new Date(e.startedDateTime).getTime() - t0;
  const size = e.response.content.size || e.response.bodySize || 0;
  return { start, end: start + e.time, time: e.time, size, url: name(e), status: e.response.status, type: e._resourceType || e.response.content.mimeType };
}).sort((a, b) => a.start - b.start);

for (const r of rows.slice(0, 60)) {
  console.log(
    String(r.start).padStart(6) + 'ms  ' +
    String(Math.round(r.time)).padStart(6) + 'ms  ' +
    bytes(r.size).padStart(9) + '  ' +
    String(r.status).padStart(3) + '  ' +
    r.url.slice(0, 90)
  );
}

console.log('\n=== 耗时最长的 25 条 ===');
for (const r of [...rows].sort((a, b) => b.time - a.time).slice(0, 25)) {
  console.log(
    String(Math.round(r.time)).padStart(7) + 'ms  起始 ' + String(r.start).padStart(6) + 'ms  ' +
    bytes(r.size).padStart(9) + '  ' + String(r.status).padStart(3) + '  ' + r.url.slice(0, 80)
  );
}

console.log('\n=== 体积最大的 25 条 ===');
for (const r of [...rows].sort((a, b) => b.size - a.size).slice(0, 25)) {
  console.log(
    bytes(r.size).padStart(9) + '  耗时 ' + String(Math.round(r.time)).padStart(6) + 'ms  ' +
    '起始 ' + String(r.start).padStart(6) + 'ms  ' + r.url.slice(0, 80)
  );
}

console.log('\n=== 按主机分组 ===');
const hosts = {};
for (const e of entries) {
  let h = '?';
  try { h = new URL(e.request.url).host; } catch {}
  hosts[h] = hosts[h] || { n: 0, size: 0, time: 0 };
  hosts[h].n++;
  hosts[h].size += e.response.content.size || e.response.bodySize || 0;
  hosts[h].time += e.time;
}
for (const [h, v] of Object.entries(hosts).sort((a, b) => b[1].time - a[1].time)) {
  console.log(String(v.n).padStart(4) + ' 个  ' + bytes(v.size).padStart(10) + '  累计耗时 ' + (v.time / 1000).toFixed(1) + 's  ' + h);
}

console.log('\n=== 缓存/压缩情况 ===');
let noCache = 0, gzip = 0, noGzip = 0, fromCache = 0;
for (const e of entries) {
  const h = {};
  for (const hh of (e.response.headers || [])) h[hh.name.toLowerCase()] = hh.value;
  if (!h['cache-control']) noCache++; else if (/max-age=0|no-store|no-cache/.test(h['cache-control'])) noCache++;
  const enc = h['content-encoding'] || '';
  if (enc.includes('br') || enc.includes('gzip')) gzip++; else noGzip++;
  if (e.cache && Object.keys(e.cache).length) fromCache++;
}
console.log('无有效缓存头/禁止缓存:', noCache, ' 已压缩:', gzip, ' 未压缩:', noGzip);

console.log('\n=== 慢请求明细（>500ms） ===');
for (const r of rows.filter(r => r.time > 500).sort((a, b) => b.time - a.time)) {
  const e = entries.find(x => name(x) === r.url && new Date(x.startedDateTime).getTime() - t0 === r.start);
  const tim = e ? e.timings : {};
  console.log(
    String(Math.round(r.time)).padStart(7) + 'ms  ' + r.url.slice(0, 70) +
    '  [dns ' + Math.round(tim.dns || 0) + ' conn ' + Math.round(tim.connect || 0) +
    ' ssl ' + Math.round(tim.ssl || 0) + ' wait(TTFB) ' + Math.round(tim.wait || 0) +
    ' recv ' + Math.round(tim.receive || 0) + ']'
  );
}
