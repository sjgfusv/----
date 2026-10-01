/* P5-1c 第二步：把 #trial2DStage 搬出 #trialScreen
 * 为什么必须先做这步：规划 §7 写「删 #trialScreen」，但 2D 画布就在它内部，
 * 照做等于把主画面删掉。搬出来之后，容器才可以安全删除。
 * 搬迁安全性：宿主的 showStage 用 inline style 把 stage 钉成全屏 fixed，
 * 不依赖父级的定位/尺寸上下文 —— 所以换父节点不会改变它的表现。
 * 用法：node 其他/_p5f.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
const F = path.join(__dirname, '..', '主界面.html');
let s = fs.readFileSync(F, 'utf8');

const START = '<div id="trial2DStage"';
const a = s.indexOf(START);
if (a < 0) { console.log('!! 找不到 #trial2DStage'); process.exit(1); }

/* 从起点开始数 <div / </div> 的平衡，找到这一块的结尾 */
let i = a, depth = 0, end = -1;
while (i < s.length) {
  const no = s.indexOf('<div', i);
  const nc = s.indexOf('</div>', i);
  if (nc < 0) break;
  if (no >= 0 && no < nc) { depth++; i = no + 4; }
  else {
    depth--;
    i = nc + 6;
    if (depth === 0) { end = i; break; }
  }
}
if (end < 0) { console.log('!! div 平衡失败'); process.exit(1); }

/* 整块（连同它前面的缩进一起取出来） */
let blockStart = a;
while (blockStart > 0 && (s[blockStart - 1] === ' ' || s[blockStart - 1] === '\t')) blockStart--;
const block = s.slice(blockStart, end);
// 去掉整块原有的缩进（它要换父级，缩进层级跟着变）
const lines = block.split(CRLF);
const indent = (lines[0].match(/^\s*/) || [''])[0];
const dedented = lines.map(l => l.indexOf(indent) === 0 ? l.slice(indent.length) : l).join(CRLF);

/* 从原位置删除（连同该行的行尾） */
let delStart = blockStart;
let delEnd = end;
if (s.slice(delEnd, delEnd + CRLF.length) === CRLF) delEnd += CRLF.length;
s = s.slice(0, delStart) + s.slice(delEnd);

/* 插到 </body> 之前 */
const bodyEnd = s.lastIndexOf('</body>');
if (bodyEnd < 0) { console.log('!! 找不到 </body>'); process.exit(1); }
const INSERT = [
  '  <!-- 2D 画布层（P5：从 #trialScreen 里搬出来 —— 试炼关停后它就是主画面，',
  '       不再是"试炼界面的一部分"；也只有搬出来之后 #trialScreen 才能删） -->',
  dedented,
  ''
].join(CRLF);
s = s.slice(0, bodyEnd) + INSERT + s.slice(bodyEnd);

fs.writeFileSync(F, s);
console.log('ok #trial2DStage 已搬到 </body> 之前（块大小 ' + lines.length + ' 行）');
