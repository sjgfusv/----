/* 一次性改名脚本：试炼2D.js → 战斗2D.js 的机械替换
 * 用法：node 其他/_rename2d.js [--dry]
 * 只做字面量替换，不动行尾（文件是 CRLF、无 BOM，读写都按 utf8 原样保留）。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '战斗2D.js');
const dry = process.argv.indexOf('--dry') >= 0;

// 顺序敏感：先长后短，避免「试炼点数」被拆成「试炼金币」
const RULES = [
  ['试炼点数', '金币'],
  ['试炼点', '金币'],
  ['点数', '金币'],
  ['试炼2D', '战斗2D'],
  ['深渊试炼 · 第 1 层', '深渊回廊 · 第 1 层'],
  ['深渊回廊 · 试炼 2D 实时战斗 启动成功', '深渊回廊 · 2D 实时战斗引擎 启动成功'],
  ['活着撤离可多得 25%；金币可在商店换永久强化（试炼内生效）', '活着撤离可多得 25%；金币可在商店换取强化'],
  ['获得 3 点金币', '获得 3 金币'],
  ['名字与文字版试炼 / 经典模式完全一致', '名字与经典模式完全一致']
];

let s = fs.readFileSync(FILE, 'utf8');
const orig = s.length;
let total = 0;
const report = [];
for (const [from, to] of RULES) {
  const n = s.split(from).length - 1;
  if (n > 0) { s = s.split(from).join(to); total += n; }
  report.push(`  ${String(n).padStart(3)}  ${from}  ->  ${to}`);
}

console.log(report.join('\n'));
console.log(`\n合计替换 ${total} 处；长度 ${orig} -> ${s.length}`);

// 残留体检：还剩下的「试炼」字样逐条列出，人工确认是否该留
const lines = s.split('\r\n');
const left = [];
lines.forEach((ln, i) => { if (ln.indexOf('试炼') >= 0) left.push(`  ${i + 1}: ${ln.trim().slice(0, 110)}`); });
console.log(`\n剩余含「试炼」的行 ${left.length} 条：`);
console.log(left.join('\n'));

if (dry) { console.log('\n[dry-run] 未写回文件'); process.exit(0); }
fs.writeFileSync(FILE, s);
console.log(`\n已写回 ${FILE}`);
