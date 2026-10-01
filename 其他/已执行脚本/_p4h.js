/* P4-4b（第一批）：面板细节 + 浏览器表面主题化
 *  ① 作弊面板里靠内联 style 撑的布局收成类（内联样式无法参与主题、也无法被媒体查询覆盖）
 *  ② 浏览器自己的表面（::selection / 滚动条 / caret / focus-visible）用项目调色板主题化
 * 用法：node 其他/_p4h.js
 */
const fs = require('fs');
const path = require('path');
let fails = 0;

/* ---------- ① CSS 追加 ---------- */
{
  const F = path.join(__dirname, '..', '主样式.css');
  const s = fs.readFileSync(F, 'utf8');
  const nl = (s.indexOf('\r\n') >= 0) ? '\r\n' : '\n';
  const CSS = [
    '',
    '/* ============================================================',
    '   P4-4b · 面板细节与浏览器表面（2D 风格统一）',
    '   ------------------------------------------------------------',
    '   1) 作弊面板里原来靠内联 style 撑的布局，收成类。内联样式不参与主题、',
    '      也压不过媒体查询，是"改了这处、漏了那处"的根源。',
    '   2) 浏览器自己画的那几处表面（选中高亮 / 滚动条 / 插入符 / 焦点环）默认',
    '      不属于任何设计系统。用同一套调色板把它们主题化，是"这片界面被设计过"',
    '      最便宜、也最容易被整片跳过的一处。',
    '   ============================================================ */',
    '.cheat-grid-wide { grid-column: span 2; }',
    '.cheat-inline-row {',
    '    grid-column: span 2;',
    '    display: flex;',
    '    gap: 8px;',
    '    align-items: center;',
    '    flex-wrap: wrap;',
    '}',
    '.cheat-check {',
    '    display: flex;',
    '    align-items: center;',
    '    gap: 6px;',
    '    margin: 0;',
    '    cursor: pointer;',
    '}',
    '.cheat-check input[type="checkbox"] { width: auto; margin: 0; }',
    '.cheat-apply-btn.danger { background: var(--danger); }',
    '.cheat-apply-btn.danger:hover { background: #ff7590; }',
    '',
    '/* ===== 浏览器表面 ===== */',
    '::selection { background: var(--accent); color: #04170f; }',
    '::-moz-selection { background: var(--accent); color: #04170f; }',
    '* { caret-color: var(--accent); }',
    '/* 只用 outline：现有按钮的焦点反馈是 box-shadow，两者叠加只会更清楚，不会互相顶掉 */',
    '*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }',
    '* { scrollbar-width: thin; scrollbar-color: rgba(115, 240, 180, 0.28) transparent; }',
    '::-webkit-scrollbar { width: 10px; height: 10px; }',
    '::-webkit-scrollbar-track { background: transparent; }',
    '::-webkit-scrollbar-thumb {',
    '    background: rgba(115, 240, 180, 0.22);',
    '    border-radius: 999px;',
    '    border: 2px solid transparent;',
    '    background-clip: padding-box;',
    '}',
    '::-webkit-scrollbar-thumb:hover { background: rgba(115, 240, 180, 0.45); background-clip: padding-box; }',
    ''
  ].join(nl);
  fs.appendFileSync(F, CSS);
  console.log('ok 主样式.css 已追加面板类与浏览器表面');
}

/* ---------- ② HTML：内联 style → 类 ---------- */
{
  const F = path.join(__dirname, '..', '主界面.html');
  let s = fs.readFileSync(F, 'utf8');
  const RULES = [
    ['宽格 ×2', 'class="cheat-stat-item" style="grid-column: span 2;"', 'class="cheat-stat-item cheat-grid-wide"', 2],
    ['内联行', 'class="cheat-stat-item" style="grid-column: span 2; display:flex; gap:8px; align-items:center; flex-wrap:wrap;"',
      'class="cheat-stat-item cheat-inline-row"', 1],
    ['复选框标签', 'style="display:flex; align-items:center; gap:6px; margin:0;"', 'class="cheat-check"', 1],
    ['复选框宽度', ' type="checkbox" style="width:auto;"', ' type="checkbox"', 1],
    ['危险按钮', 'class="cheat-apply-btn" style="background:var(--danger);"', 'class="cheat-apply-btn danger"', 1]
  ];
  for (const [label, from, to, expect] of RULES) {
    const n = s.split(from).length - 1;
    if (n !== expect) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + expect + '）'); fails++; continue; }
    s = s.split(from).join(to);
    console.log('ok ' + label + ' ×' + n);
  }
  fs.writeFileSync(F, s);
}

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
