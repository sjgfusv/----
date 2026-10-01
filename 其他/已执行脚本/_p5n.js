/* P5-3b（第四版）：删掉环境测试.js 的第九部分（试炼模式环境接入，497-598） */
const fs = require('fs');
const path = require('path');
const BAK = path.join(__dirname, '备份');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const F = path.join(__dirname, '..', '测试', '环境测试.js');
let s = fs.readFileSync(F, 'utf8');
const nl = (s.match(/\r\n/g) || []).length > (s.match(/\n/g) || []).length ? '\r\n' : '\n';
const lines = s.split(nl);

const head = (lines[496] || '').trim();
const tail = (lines[597] || '').trim();
const next = (lines[599] || '').trim();
if (head.indexOf('第九部分') < 0) { console.log('!! 起点不符：' + head.slice(0, 40)); process.exit(1); }
if (tail !== '}') { console.log('!! 终点不是块闭合：' + tail.slice(0, 40)); process.exit(1); }
if (next.indexOf('第十部分') < 0) { console.log('!! 终点之后不是第十部分：' + next.slice(0, 40)); process.exit(1); }

fs.writeFileSync(path.join(BAK, '环境测试.js.' + stamp + '.bak'), s);
const note = '// ---------- 第九部分：试炼模式环境接入 —— 已随试炼关停移除（P5）----------' + nl +
  '// 原先这一节验证「治疗抑制在试炼战斗中把药水 8 点减半为 4」。' +
  '试炼关停后该路径不存在；' +
  '同样的治疗抑制逻辑在新版由引擎的腐化脉冲承担，覆盖在 测试/2D引擎回归.html 与实机验证里。' + nl +
  '// 想看原测试：老版 测试/环境测试.js 里仍然完整。' + nl;

const out = lines.slice(0, 496).concat(note.split(nl)).concat(lines.slice(598));
fs.writeFileSync(F, out.join(nl));
console.log('ok 环境测试.js：删 ' + (598 - 497 + 1) + ' 行（第九部分：试炼模式环境接入）');
