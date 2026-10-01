/* P5-1e 收尾：删掉 Trial 空壳本体（调用点已在上一步全部清理） */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
const F = path.join(__dirname, '..', '主程序.js');
let s = fs.readFileSync(F, 'utf8');

const startMark = 'if (!window.Trial) {';
const endMark = '    rollEnv: function () { return null; }' + CRLF + '  };' + CRLF + '}';
const a = s.indexOf(startMark);
const b = s.indexOf(endMark, a);
if (a < 0 || b < 0) { console.log('!! 找不到空壳 a=' + a + ' b=' + b); process.exit(1); }

const removed = s.slice(a, b + endMark.length).split(CRLF).length;
s = s.slice(0, a) + '// Trial 空壳已删除：调用点全部清理完毕（P5）。' + s.slice(b + endMark.length);

fs.writeFileSync(F, s);
console.log('ok 已删 Trial 空壳（' + removed + ' 行）');
console.log('剩余 Trial. 出现次数：' + (s.match(/Trial\./g) || []).length);
console.log('剩余 Trial 出现次数（任意形式）：' + (s.match(/Trial/g) || []).length);
