/* P5-1d CSS 清理 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '**P5-1d CSS 清理（第二版：按规则块逐条删）—— 已完成并验证**',
  '',
  '- 第一版按起止位置整段切，被安全检查拦住（区间内含 `@media`）；这一版改成**块解析器**：',
  '  跳过注释、普通规则按选择器判定、`@media` / `@supports` 递归处理、`@keyframes` / `@font-face` 一律保留',
  '  （宁可少删，不动画与字体）。判据：选择器含 `.trial-` 且**不含** `.trial2d-` / `.t2d-` / `body.realtime-trial` 才删。',
  '- **第一次跑**：删 198 条（8054 → 6915 行）。但残留 25 条纯试炼规则。',
  '  定位到原因：**选择器前面挂着注释**（形如 `/* 修复试炼模式… */ @media (max-width: 768px)`），',
  '  判断前没剥注释 → `@media` 识别失败 → 整块被原样保留。这是**漏删，属于安全方向**（不是误删）。',
  '- **修正后跑**：又删 95 条（6915 → 6506 行）。纯试炼规则残留从 25 降到 **1**',
  '  （那 1 处是含 `.trial2d-` 的组合选择器，按设计保留）。',
  '- 总计 **8054 → 6506 行（-1548 行，293 条规则）**；三次改动前都自动备份到 `其他/备份/`。',
  '- 实测（浏览器）：CSS 仍可解析（**709** 条顶层规则）、三档令牌 `--accent` / `--radius-lg` / `--panel-modal` 全在、',
  '  `.modal-content` 圆角 **18px**、`caretColor` 仍为 accent、`mode = "classic2d"`、',
  '  画布 **1910×990** 全屏、**零错误**。',
  '- 保住了全部 `.trial2d-*` / `.t2d-*` / `body.realtime-trial`（逐项确认）—— 画布与布局编辑器不受影响。',
  '',
  '**P5-1d 剩余：删 `Trial` 空壳仍不可做** —— `initGame()` 里有**无守卫**的 `Trial.init({...})`（两处），',
  '另有 40+ 处 `Trial.xxx` 调用。正确顺序仍是：先逐处清理那 42 处调用（多数落在恒 false 的死分支里，',
  '删起来是安全的，但要逐处确认守卫），**然后**才能删空壳。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-1d CSS 清理记录已插入');
