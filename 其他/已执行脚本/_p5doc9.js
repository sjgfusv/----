/* P5-1e 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '## 5. 风险与对策（最高优先的 10 条）';
const REC = [
  '**P5-1e 清理全部 `Trial.*` 调用 + 删空壳 —— 已完成并验证（达成 P5 第一条验收）**',
  '',
  '- 实测调用点 **16 处**（比早先估的 42 少 —— 删开发者 `trial` 命令时，那些命令内部的调用一起没了）：',
  '  · **最关键是「重置流程里无守卫的 `Trial.init`」** —— 它就是"先删空壳会导致游戏进不去"的唯一真凶；',
  '  · 另有 2 处**带守卫**的 `Trial.init` 块、`render()` 与 `handleAction()` 的试炼分流、',
  '    以及 5 处散落的 `Trial.render()`（2 处 `if` 单行形式 + 3 处独立语句）。',
  '- 一次性清理（A 无守卫 init / B、C 守卫 init 块 / D `render` 分流 / E `handleAction` 分流 /',
  '  F 单行 ×2 / G 独立 ×3），随后删掉 19 行空壳。每一步都自动备份到 `其他/备份/`。',
  '- 实测：**`typeof window.Trial === "undefined"`**（全局彻底消失）、`mode = "classic2d"`、`hero = "warrior"`、',
  '  宿主 running、**零错误**；再自动跑一局到 floor 2，面板序列',
  '  `rest / reward / relic / event / rift / shop(5)` 全部正常，**零错误**。',
  '- ✅ **规划 §4 P5 的第一条验收「新版全局搜索无 `Trial.` 裸调」现已达成** ——',
  '  全库仅剩 **3 处注释**里提到 Trial（纯说明文字，不是调用）。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P5-1e 记录已插入');
