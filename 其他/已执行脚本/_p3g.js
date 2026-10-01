/* P3-3e：把 MECH_BASE 快照移到所有机制常量定义之后
 * 原因：它引用了 FURY（定义在 372 行），而它被插在了 250 行 ——
 * var 会提升声明但不提升赋值，模块加载时 FURY 还是 undefined，直接抛异常，
 * 整个引擎 IIFE 中断（表现是 window.战斗2D 不存在），而 node --check 查不出来。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
let s = fs.readFileSync(F, 'utf8');
const lines = s.split('\r\n');

let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('机制常量的「基准值」快照') >= 0) {
    for (let j = i; j >= 0; j--) {
      if (lines[j].trim().indexOf('/* =====') === 0) { start = j; break; }
    }
    break;
  }
}
if (start < 0) { console.log('!! 找不到 MECH_BASE 注释块起点'); process.exit(1); }

let end = -1;
for (let i = start; i < lines.length; i++) {
  if (lines[i] === '  };' && lines[i + 1] === '') { end = i; break; }
}
if (end < 0) { console.log('!! 找不到 MECH_BASE 块尾'); process.exit(1); }

const block = lines.slice(start, end + 1);
console.log('提取 ' + block.length + ' 行：' + block[0].trim().slice(0, 30) + ' … ' + block[block.length - 1]);

// 从原处删除（连它后面的空行一起）
const rest = lines.slice(0, start).concat(lines.slice(end + 1));
// 插到 ROOM_TYPES 之前
let anchor = -1;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '  var ROOM_TYPES = {') { anchor = i; break; }
}
if (anchor < 0) { console.log('!! 找不到 ROOM_TYPES 锚点'); process.exit(1); }

const out = rest.slice(0, anchor).concat(block).concat(['']).concat(rest.slice(anchor));
fs.writeFileSync(F, out.join('\r\n'));
console.log('ok MECH_BASE 已移动到 ROOM_TYPES 之前（第 ' + (anchor + 1) + ' 行附近）');
