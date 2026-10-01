/* P4-4b（第二批）文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '### P5 · 试炼关停与回归';
const REC = [
  '**P4-4b 第二批 · 视觉令牌与统一收口层**',
  '',
  '- 先查清了"风格不统一"的**根源**：`主样式.css` 是分段追加出来的，`.panel` 与 `.action-button`',
  '  各有**两处**定义（179/3220、357/3356），后者覆盖前者；面板底色同时存在**三个值** ——',
  '  `:root --panel` 是 `rgba(18,24,40,.94)`、`.modal-content` 是 `rgba(15,22,44,.98)`、',
  '  画内面板是 `0x0f162c`(= `rgb(15,22,44)`)。后两者其实**本来就是同一套语言**，只是各写各的。',
  '- 做法：不在那 8000 行里逐处判断"有没有被后来的覆盖"（风险远高于收益），',
  '  而是把视觉常量提成令牌、在末尾**统一收口**，数值来源与画内面板对齐：',
  '  `--panel-modal`(=`UI.panel`) / `--panel-line`(=`panelLineAlpha` 0.12) /',
  '  `--radius-lg`(=`panelR` 18) / `--radius-md`(=`boxR` 10) / `--radius-sm` 6 /',
  '  `--shadow-modal` / `--shadow-card` / `--shadow-raise`。',
  '- 同时补上 craft-floor 的 states 一条：`:disabled` 与 `input:invalid:not(:placeholder-shown)`。',
  '- 实测（浏览器读**计算样式**）：令牌四项全部生效；`.modal-content` 圆角 **18px**、底色',
  '  `rgba(15,22,44,0.98)`、阴影 `0 20px 60px rgba(0,0,0,0.5)`；`.panel` 圆角 **18px**；',
  '  `.cheat-section` 圆角 **10px** + 阴影 `0 8px 24px`；`.action-button` / `.cheat-apply-btn` 圆角 **6px**；',
  '  受这套令牌控制的模态框共 **8 个**。',
  '- 阴影均带 offset + 软模糊（符合 craft-floor 的 Depth 一条，不是零偏移的装饰性光晕）。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P4-4b 第二批记录已插入');
