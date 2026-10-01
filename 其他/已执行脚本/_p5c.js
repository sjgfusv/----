/* P5-1b 第二步：删 state.trial 的定义与重置块
 * 前提（已完成）：所有无守卫的 state.trial.active 都已改成可选链，
 * 因此剩下的 state.trial.* 访问全部处在「永不执行」的分支里（active 恒 false）。
 * 项目没有版本控制 → 先自动备份原文件到 其他/备份/。
 * 用法：node 其他/_p5c.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
const F = path.join(__dirname, '..', '主程序.js');
const BAK = path.join(__dirname, '备份');

let s = fs.readFileSync(F, 'utf8');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bakFile = path.join(BAK, '主程序.js.' + stamp + '.bak');
fs.writeFileSync(bakFile, s);
console.log('已备份 → ' + path.basename(bakFile));

let fails = 0;

/* ① 删 state 里的 trial 定义块 */
{
  const startMark = '  trial: {' + CRLF + '    active: false,';
  const a = s.indexOf(startMark);
  if (a < 0) { console.log('!! 找不到 trial 定义块起点'); fails++; }
  else {
    const b = s.indexOf(CRLF + '  },', a);
    if (b < 0) { console.log('!! 找不到 trial 定义块终点'); fails++; }
    else {
      const removed = s.slice(a, b + CRLF.length + 4).split(CRLF).length;
      s = s.slice(0, a) + s.slice(b + CRLF.length + 4);
      console.log('ok 已删 state.trial 定义块（约 ' + removed + ' 行）');
    }
  }
}

/* ② 删重置块（state.trial.xxx = ... 那一串） */
{
  const rStart = '    state.trial.active = false;';
  const rEnd = '    state.trial._backup = null;';
  const c = s.indexOf(rStart);
  if (c < 0) { console.log('!! 找不到重置块起点'); fails++; }
  else {
    const d = s.indexOf(rEnd, c);
    if (d < 0) { console.log('!! 找不到重置块终点'); fails++; }
    else {
      const end = d + rEnd.length;
      const removed = s.slice(c, end).split(CRLF).length;
      s = s.slice(0, c) + s.slice(end);
      console.log('ok 已删 state.trial 重置块（约 ' + removed + ' 行）');
    }
  }
}

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 步未完成（文件已写回，请检查）' : '\n全部完成');
