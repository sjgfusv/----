/* P5-1c 第三步：删试炼的三个 DOM 块
 *   前提（已完成）：#trial2DStage 已搬出 #trialScreen → 容器可以安全删除了。
 *   删： #trialScreen / #trialShopModal / #trialRewardBanner
 *   引用检查：主程序.js 里只有 `if (trialScreen) trialScreen.classList.add('hidden')`（有守卫），
 *             trialShopModal / trialRewardBanner 零引用 → 删掉安全。
 * 用法：node 其他/_p5g.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主界面.html');
const BAK = path.join(__dirname, '备份');

let s = fs.readFileSync(F, 'utf8');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bakFile = path.join(BAK, '主界面.html.' + stamp + '.bak');
fs.writeFileSync(bakFile, s);
console.log('已备份 → ' + path.basename(bakFile));

const NL = s.indexOf('\r\n') >= 0 && (s.match(/\r\n/g) || []).length > (s.match(/\n/g) || []).length ? '\r\n' : '\n';
console.log('主流行尾: ' + (NL === '\r\n' ? 'CRLF' : 'LF'));

/* 按 id 找到元素起点，再用 <div / </div> 平衡定位整块 */
function findBlock(src, id) {
  let a = src.indexOf('<div id="' + id + '"');
  if (a < 0) return null;
  // 往前吃掉行首缩进
  while (a > 0 && (src[a - 1] === ' ' || src[a - 1] === '\t')) a--;
  let i = a, depth = 0, end = -1;
  while (i < src.length) {
    const no = src.indexOf('<div', i);
    const nc = src.indexOf('</div>', i);
    if (nc < 0) break;
    if (no >= 0 && no < nc) { depth++; i = no + 4; }
    else { depth--; i = nc + 6; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  // 连行尾一起吃掉
  if (src.slice(end, end + NL.length) === NL) end += NL.length;
  return { start: a, end: end, lines: src.slice(a, end).split(NL).length };
}

let fails = 0;
['trialShopModal', 'trialRewardBanner', 'trialScreen'].forEach(function (id) {
  const blk = findBlock(s, id);
  if (!blk) { console.log('!! 找不到 #' + id); fails++; return; }
  s = s.slice(0, blk.start) + s.slice(blk.end);
  console.log('ok 已删 #' + id + '（' + blk.lines + ' 行）');
});

/* 把删掉试炼界面后的位置留一句说明 */
const note = [
  '    <!-- 试炼文字界面已随试炼关停整体移除（P5 · 规划 §7）。',
  '         2D 画布层不在这里 —— 它已经搬到 </body> 之前，现在它就是主画面。 -->',
  ''
].join(NL);
const anchor = s.indexOf('    <!-- 试炼界面 -->');
if (anchor >= 0) {
  let lineEnd = s.indexOf(NL, anchor);
  s = s.slice(0, anchor) + note + s.slice(lineEnd + NL.length);
  console.log('ok 原位留了说明');
}

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 块未删' : '\n全部完成');
