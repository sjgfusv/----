/* P4-4b（第一批）文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '### P5 · 试炼关停与回归';
const REC = [
  '**P4-4b DOM 面板 2D 风格化（第一批 · 调用了 `impeccable` 技能）**',
  '',
  '- 技能环境限制：`impeccable` 的引擎需要从 GitHub 下载，而本机访问不了 GitHub（与之前装 Electron 是同一个网络限制）。',
  '  按技能自己的指引（Launcher unavailable）改为**直接读项目已有的视觉真相**，不发明缺失的上下文；',
  '  本次是 **refinement**（保留现有视觉世界），所以缺 PRODUCT.md / DESIGN.md 不构成阻塞。',
  '- 读了技能的质量下限 `craft-floor.md`，据此做了两件**有明确边界**的事：',
  '  1. **内联样式收成类**：作弊面板里靠 `style="grid-column: span 2"` 等撑起来的布局 →',
  '     `.cheat-grid-wide` / `.cheat-inline-row` / `.cheat-check` / `.cheat-apply-btn.danger`。',
  '     内联样式不参与主题、也压不过媒体查询，是"改了这处、漏了那处"的根源。',
  '  2. **浏览器表面主题化**（craft-floor 里点名的"最便宜、也最容易被整片跳过"的一处）：`::selection` /',
  '     滚动条 / `caret-color` / `:focus-visible` 全部改用项目调色板（`--accent` / `--danger`）。',
  '     focus 只加 `outline`，不碰现有按钮的 `box-shadow` 反馈 —— 两者叠加只会更清楚，不会互相顶掉。',
  '- 实测（浏览器读**计算样式**，不是看代码）：`caretColor = rgb(115, 240, 180)`（= `--accent`）、',
  '  `scrollbar-width = thin`、`.cheat-inline-row` / `.cheat-check` 的 `display` 均为 `flex`、',
  '  `.danger` 按钮底色 `rgb(255, 93, 122)`（= `--danger`）、`.cheat-grid-wide` 命中 2 处、',
  '  **浏览器表面规则 12 条**已进样式表。',
  '- **剩余（P4-4b 第二批，需要专门一轮）**：设置 / 图鉴 / 存档管理 / 通关条件 / 教程等 DOM 面板的配色、圆角、',
  '  阴影、字号尚未逐面板统一；`主界面.html` 里还剩约 1 处旧内联样式（第 636 行，属于原有代码风格，不在本次范围）。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P4-4b 第一批记录已插入');
