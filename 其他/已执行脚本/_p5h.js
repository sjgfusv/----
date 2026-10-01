/* P5-1d：删掉纯「试炼文字界面」的 CSS
 *   保守原则：只要一条规则里出现 .trial2d- / .t2d- / body.realtime-trial，就一律保留
 *   （哪怕它挂在已失效的 .trial-screen 下 —— 删了收益为零，留着不影响任何东西）。
 *   只删「纯 .trial-* 文字界面」的连续区间。
 *   脚本内置三道安全检查，任一不过就中止，不写文件。
 * 用法：node 其他/_p5h.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主样式.css');
const BAK = path.join(__dirname, '备份');

let s = fs.readFileSync(F, 'utf8');
const NL = (s.match(/\r\n/g) || []).length > (s.match(/\n/g) || []).length ? '\r\n' : '\n';

/* 区间起点：试炼文字界面的第一条规则 */
const startMark = '.trial-screen > *:not(.abyss-bg) {';
const a = s.indexOf(startMark);
if (a < 0) { console.log('!! 找不到区间起点'); process.exit(1); }

/* 区间终点：.trial-footer 规则块的结尾 */
const footerMark = '.trial-footer {';
const fa = s.indexOf(footerMark, a);
if (fa < 0) { console.log('!! 找不到 .trial-footer'); process.exit(1); }
const fb = s.indexOf('}', fa);
if (fb < 0) { console.log('!! .trial-footer 块未闭合'); process.exit(1); }
let end = fb + 1;
if (s.slice(end, end + NL.length) === NL) end += NL.length;

/* 往前吃到行首 */
let start = a;
while (start > 0 && s[start - 1] !== '\n') start--;

const chunk = s.slice(start, end);
const lines = chunk.split(NL).length;

/* ---- 三道安全检查 ---- */
const checks = [
  ['区间内不应出现 .trial2d-', chunk.indexOf('.trial2d-') >= 0],
  ['区间内不应出现 .t2d-', chunk.indexOf('.t2d-') >= 0],
  ['区间内不应出现 body.realtime-trial', chunk.indexOf('body.realtime-trial') >= 0],
  ['区间内不应出现 @media', chunk.indexOf('@media') >= 0],
  ['区间内不应出现 .panel / .modal / .action-button / .conditions-list（共用类）',
    /\.panel\b|\.modal\b|\.action-button\b|\.conditions-list\b/.test(chunk)]
];
let bad = false;
checks.forEach(([label, hit]) => { if (hit) { console.log('!! 安全检查失败：' + label); bad = true; } });
if (bad) { console.log('\n已中止，未修改文件'); process.exit(1); }

/* 备份后删除 */
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(path.join(BAK, '主样式.css.' + stamp + '.bak'), s);
console.log('已备份 → 主样式.css.' + stamp + '.bak');

s = s.slice(0, start) + s.slice(end);
fs.writeFileSync(F, s);
console.log('ok 已删试炼文字界面样式（约 ' + lines + ' 行）；保留全部 .trial2d-* / .t2d-* / body.realtime-trial');
