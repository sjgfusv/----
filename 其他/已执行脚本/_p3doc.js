/* P3 进展文档：在 P4 小节前插入 P3-1/P3-2/P3-3 记录（规划文档是纯 LF） */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');

const ANCHOR = '### P4 · 系统对齐与风格统一';
const REC = [
  '#### P3 进展记录（P3-1 / P3-2 / P3-3 已完成）',
  '',
  '**P3-1 数值统一（平衡命门 · 风险 R1/R2/R3）**',
  '',
  '- 落点：引擎新增 `API.setEnemyScaler(fn)`（宿主算错或抛异常会自动退回内置曲线），宿主用经典公式实现。',
  '- 做法：**量级听经典、相对强弱听引擎** —— 经典公式只按 tier 给绝对量级（`base = floor*2+4`），',
  '  引擎内部的种类差异用「系数 = `def.baseHp` ÷ 该 tier 的引擎基准（普通 24 / 镜像 42 / 精英 72 / Boss 160）」保留。',
  '- 实测对照（normal 难度，走真实 `spawnEnemy` 路径）：',
  '',
  '| 层 | claw | skeleton | guard(精英) | lord(Boss) | 经典期望（普通 / Boss） |',
  '|---|---|---|---|---|---|',
  '| 1 | **6** | 8 | 12 | **16** | 6 / 16 |',
  '| 10 | **24** | 32 | 30 | **34** | 24 / 34 |',
  '| 50 | **104** | 139 | 110 | **114** | 104 / 114 |',
  '',
  '- 关键收益：Boss 从 hp 160（要砍 32 刀）降到 16（4 刀），与经典**逐项相等**；同时 skeleton 仍比 claw 厚、guard 仍比普通怪硬。',
  '- 攻击用**半强度种类系数**（`1 + (baseAtk/4 − 1) × 0.5`）折中：完全照搬引擎的相对差（lord 是 claw 的 3.5 倍）会让 Boss 一下秒人；完全抹平又丢掉「法师脆、守卫硬」的手感。',
  '',
  '**P3-2 结局面板（内核 13 种）**',
  '',
  '- 触发时机与内核 `advanceRoom()` 的越界判定完全一致：打完 Boss 且 `floor >= floorLimit`（999 或自定义 `floorCap`）。',
  '- 实测：把难度设成 `floorCap=1` → `经典2D.checkEnding()` → 面板 `kind=ending`、2 个可用结局（富豪 / 宝藏）；',
  '  选「富豪结局」→ `state.endResult=rich`、`mode=finished`、宿主退出接管、画布隐藏、**`records.clears 0→1`**、内核结局页正常渲染。',
  '',
  '**P3-3 遗物 24 件（规划 §3.4）**',
  '',
  '- 引擎侧：`RELIC_FX` 填满 24 条 + **`MECH_BASE` 基准快照 + `applyMechRelics()`**。',
  '  **设计要点**：18 件机制型遗物**不去改那几十处热路径读取点**，而是在下发遗物时按基准值整体重算机制常量 ——',
  '  读取点一行不动，反复下发也不会累加漂移（一律「基准 + 增量」或「基准 × 倍率」）。',
  '- 行为型钩子：护盾共鸣（`addShield` 全来源 +2）、不朽图腾（致命保 1 血 / 每层一次）、命运轮盘（清房随机 +金币或 −生命）、',
  '  处决者 + 猎杀标记（斩杀线 25% → 35% / 50%）、血之饥渴（吸血等级 +1）。',
  '  注意 `guardShield`（完美格挡给多少）与 `shieldGain`（所有护盾来源 +N）是两个 key —— 共用一个会让完美格挡吃两次加成。',
  '- 宿主侧：24 件池 + 权重抽取（走自定义难度的权重与黑名单）+ 精英/Boss 必掉 + 宝箱 45% + 三选一面板 + 跳过换 20 金币；',
  '  `state.relics` 只存 `{id,label,quality,description}`（不再带函数，顺带根治了「读档后 `apply` 变 undefined」的老问题）。',
  '- 实测机制常量 **15/15 全对**：`dodgePerfect 150→230`、`dodgeInvuln 320→440`、`dodgeSharp 3000→5000`、',
  '  `dodgeSharpMult 2.2→3`、`guardPerfect 200→280`、`guardCounterMult 2→3`、`guardShieldGain 3→6`、',
  '  `chainWindow 760→1010`、`chainSweepMult 1.4→2.1`、`diveMult 1.9→2.3`、`diveBury 0.38→0.5`、',
  '  `staminaMax 100→130`、`staminaRegen 58→75`、`furyKill 5→6`、`rangedPierce 2→3`。',
  '- 掉落实测：Boss 房清空 → 属性奖励 → **遗物面板（`kind=relic`）4 张卡**（装了深渊印记自动三选一变四选一）→ 选中后 `relics 1→2`。',
  '',
  '**本阶段踩到两个「查不出来」的坑（都值得记住）**',
  '',
  '1. **`var` 提升导致模块级常量顺序错误**：`MECH_BASE` 快照引用了定义在它后面 200 行的 `FURY`，',
  '   模块加载时 `FURY` 仍是 `undefined` → 访问 `.gainKill` 抛异常 → **整个引擎 IIFE 中断**，',
  '   表现是 `window.战斗2D` 根本不存在（而不是某个功能坏掉）。`node --check` 完全查不出来（语法合法）。',
  '   教训：模块级快照必须放在它引用的**所有**常量之后；排查这类问题先看最外层的存在性（`!!window.战斗2D`）。',
  '2. **`openRewardChoice` 把 kind 硬编码成 `\'reward\'`**：用它开遗物面板 → 宿主永远收不到 `kind === \'relic\'`，',
  '   表现是「Boss 房领完奖励又弹一次奖励面板、遗物根本没发出去」。要开别种类的面板必须走 `openEventPanel(kind, data)`。',
  '',
  ''
].join('\n');

const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
s = s.replace(ANCHOR, REC + ANCHOR);
fs.writeFileSync(F, s);
console.log('ok 已插入 P3 进展记录');
