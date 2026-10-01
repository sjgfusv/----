/* P5-1d 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '**P5-1d CSS 清理：按规划尝试后「安全中止」（记录原因与正确施工法）**',
  '',
  '- 按 §7 删「试炼文字界面样式」时，脚本内置的**安全检查拦住了**：',
  '  目标区间（`.trial-screen > *:not(.abyss-bg)` → `.trial-footer`，约 **730 行**）**内部含 `@media`**',
  '  （试炼界面的响应式规则与普通规则交错）。',
  '- 为什么中止而不是硬删：按起止位置整段切会**连带切掉 @media 的花括号**，',
  '  造成后续 CSS 全部错位 —— 而这种破坏是**静默的**（页面照样能开，只是样式大面积走形），',
  '  排查成本远高于"多留 700 行死 CSS"。脚本因此拒绝写文件（已实测：中止后 `主样式.css` 未被修改）。',
  '- **正确的施工法**（留给专门一轮）：按**规则块**逐条删 —— 分别解析 `选择器 { ... }` 与 `@media { ... }` 两种块，',
  '  遇到选择器里含 `.trial2d-` / `.t2d-` / `body.realtime-trial` 的一律跳过。',
  '',
  '- 顺带一个值得记的发现：CSS 里有 **28 处 `.trial-screen` 选择器已经失效**（容器已删），',
  '  其中 `.trial-screen.realtime-mode .trial2d-stage` 这类还管着画布的布局。',
  '  它在容器删除后失效、而画布**依然正常**，靠的正是 `showStage` 用 inline style 接管了定位与尺寸 ——',
  '  **这反过来验证了当初那个设计选择的韧性**：画布的表现不依赖任何 CSS 上下文，',
  '  所以父容器怎么搬、怎么删，它都不会挪位。',
  '',
  '**P5-1d 的第二项（删 `Trial` 空壳）同样不能做 —— 已核对理由**：',
  '`initGame()` 里有**无守卫**的 `Trial.init({...})`（两处），另有 40+ 处 `Trial.xxx` 调用。',
  '空壳一旦删掉，`initGame()` 直接 ReferenceError，**游戏根本进不去**。',
  '正确顺序：先逐处清理那 42 处调用（大部分落在 `state.trial?.active` 恒 false 的死分支里，删起来是安全的，',
  '但要逐处确认守卫），**然后**才能删空壳。顺序反了就是整局崩。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-1d 记录已插入');
