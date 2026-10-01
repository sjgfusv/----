/* P5-1c：删掉开发者 `trial` 命令（规划 §7 明确列出的一项）
 * 为什么只删这一块：它是独立且自洽的（入口 = registerDevCommand('trial')，
 * 到 P4 新加的命令块为止），删掉不影响任何其它代码路径。
 * 而那几个试炼处理函数（applyCheatTrial / applyCheatPerm / applyTrialRelicEffect …）
 * **故意不删**：它们已经是永不执行的死代码（试炼 UI 与绑定都已移除，守卫会跳过），
 * 删了反而要同步改绑定与调用点 —— 收益为零、风险为正。
 * 用法：node 其他/_p5e.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
const F = path.join(__dirname, '..', '主程序.js');
let s = fs.readFileSync(F, 'utf8');

const startMark = "  registerDevCommand('trial', '试炼相关命令', (args) => {";
const endMark = '  /* ===== 实时战斗（2D）专用命令（P4）=====';

const a = s.indexOf(startMark);
const b = s.indexOf(endMark);
if (a < 0 || b < 0 || b <= a) { console.log('!! 定位失败 a=' + a + ' b=' + b); process.exit(1); }

const removedLines = s.slice(a, b).split(CRLF).length;
const NOTE = [
  '  // 试炼相关的开发者命令已随试炼关停一并移除（P5）。',
  '  // 想看老版的试炼调试：切到 老版2.6/ 用那边的开发者模式。',
  ''
].join(CRLF);
s = s.slice(0, a) + NOTE + s.slice(b);

fs.writeFileSync(F, s);
console.log('ok 已删开发者 trial 命令（约 ' + removedLines + ' 行）');
