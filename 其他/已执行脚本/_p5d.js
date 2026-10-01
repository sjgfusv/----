/* P5-1b 第三步：删掉试炼入口按钮（DOM + 绑定）
 * 同时记录一个**规划隐患**：#trial2DStage（2D 画布）就在 #trialScreen 内部，
 * 所以规划 §7 里"删 #trialScreen(754-926)"这一条**不能照做** —— 删了就没画布了。
 * 用法：node 其他/_p5d.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;

/* ① HTML：删入口按钮那一行 */
{
  const F = path.join(__dirname, '..', '主界面.html');
  let s = fs.readFileSync(F, 'utf8');
  const line = '          <button id="trialButton" class="ghost-button" style="border-color: var(--danger);">进入试炼</button>';
  const nl = s.indexOf('\r\n') >= 0 ? CRLF : '\n';
  const n = s.split(line).length - 1;
  if (n !== 1) { console.log('!! HTML 入口按钮命中 ' + n); fails++; }
  else {
    s = s.split(line + nl).join('');   // 连行尾一起删，不留空行
    fs.writeFileSync(F, s);
    console.log('ok 已删 #trialButton（DOM）');
  }
}

/* ② JS：删绑定块 */
{
  const F = path.join(__dirname, '..', '主程序.js');
  let s = fs.readFileSync(F, 'utf8');
  const from = [
    '  const trialBtn = document.getElementById(\'trialButton\');',
    '  if (trialBtn) {',
    '    trialBtn.addEventListener(\'click\', Trial.start);',
    '  }'
  ].join(CRLF);
  const to = [
    '  // 试炼入口已关停（P5）：#trialButton 与它的绑定一并移除。',
    '  // 注意这里没有留"兜底绑定"—— Trial.start 现在是空壳，绑上去只会多一个假入口。'
  ].join(CRLF);
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! JS 绑定块命中 ' + n); fails++; }
  else {
    fs.writeFileSync(F, s.split(from).join(to));
    console.log('ok 已删 #trialButton 的绑定');
  }
}

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
