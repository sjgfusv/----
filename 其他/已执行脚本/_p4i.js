/* P4-4b（第二批）：视觉令牌 + 统一收口层 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主样式.css');
const s = fs.readFileSync(F, 'utf8');
const nl = (s.indexOf('\r\n') >= 0) ? '\r\n' : '\n';

const CSS = [
  '',
  '/* ============================================================',
  '   P4-4b · 视觉令牌 + 统一收口层',
  '   ------------------------------------------------------------',
  '   为什么是"收口层"而不是回头去改上面那 8000 行：这份样式表是分段追加出来的，',
  '   `.panel` 与 `.action-button` 各有两处定义（179/3220、357/3356），后者覆盖前者。',
  '   直接改老规则必须逐处判断"有没有被后来的覆盖"，风险远高于收益；',
  '   这里把**视觉常量**提成令牌并在末尾统一收口。',
  '',
  '   数值的来源不是新发明的，而是与**画内面板**对齐：引擎 UI.panel = 0x0f162c、',
  '   panelR = 18、boxR = 10、panelLineAlpha = 0.12 —— 两边本来就是同一套设计语言，',
  '   只是之前各写各的（`:root --panel` 还是第三个值 rgba(18,24,40,.94)）。',
  '   ============================================================ */',
  ':root {',
  '    --panel-modal: rgba(15, 22, 44, 0.98);   /* 模态框底（= 画内 UI.panel） */',
  '    --panel-card: rgba(18, 24, 40, 0.74);    /* 面板内嵌卡片（= 画内 UI.box） */',
  '    --panel-line: rgba(255, 255, 255, 0.12); /* 面板描边（= 画内 panelLineAlpha） */',
  '    --radius-lg: 18px;                       /* 面板圆角（= 画内 panelR） */',
  '    --radius-md: 10px;                       /* 卡片圆角（= 画内 boxR） */',
  '    --radius-sm: 6px;                        /* 控件圆角（= 画内动作按钮的上限） */',
  '    --shadow-modal: 0 20px 60px rgba(0, 0, 0, 0.5);',
  '    --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.32);',
  '    --shadow-raise: 0 2px 8px rgba(0, 0, 0, 0.24);',
  '}',
  '',
  '/* 模态框：同底色 / 同描边 / 同圆角 / 同阴影 */',
  '.modal-content {',
  '    background: var(--panel-modal);',
  '    border: 1px solid var(--panel-line);',
  '    border-radius: var(--radius-lg);',
  '    box-shadow: var(--shadow-modal);',
  '}',
  '',
  '/* 圆角阶梯：面板 > 卡片 > 控件 */',
  '.panel { border-radius: var(--radius-lg); }',
  '.cheat-section { border-radius: var(--radius-md); }',
  '.cheat-apply-btn,',
  '.cheat-add-btn,',
  '.action-button { border-radius: var(--radius-sm); }',
  '.cheat-stat-item input,',
  '.cheat-stat-item select,',
  'input[type="number"],',
  'input[type="text"],',
  'textarea,',
  'select { border-radius: var(--radius-sm); }',
  '',
  '/* 交互反馈：抬升用同一档阴影，别每个按钮各写一个 */',
  '.action-button:not(:disabled):hover { box-shadow: var(--shadow-raise); }',
  '.cheat-section { box-shadow: var(--shadow-card); }',
  '',
  '/* 空/错状态：让控件自己说清问题（craft-floor 的 states 一条） */',
  'input:invalid:not(:placeholder-shown) { border-color: var(--danger); }',
  'input:disabled, select:disabled, textarea:disabled { opacity: 0.5; cursor: not-allowed; }',
  ''
].join(nl);

fs.appendFileSync(F, CSS);
console.log('ok 主样式.css 已追加视觉令牌与收口层');
