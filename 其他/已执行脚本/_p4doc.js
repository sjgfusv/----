/* P4-1 / P4-2 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '### P5 · 试炼关停与回归';
const REC = [
  '#### P4 进展记录（P4-1 / P4-2 已完成）',
  '',
  '**P4-1 作弊面板改造**',
  '',
  '- DOM：删掉「试炼修改」与「永久解锁修改」两块（`cheatTrialPoints` 等输入已不存在），换成「实时战斗」区：',
  '  生命 / 生命上限 / 护盾 / 攻击 / 添加遗物 / 添加诅咒 / 跳层 / 跳房 / **无敌** / 清除所有诅咒。',
  '- 能力层：引擎加 `setGodMode`（`damageHero` 开头直接免疫，不动任何数值）与 `gotoRoom(index)`（不走地图连线直接进第 n 间）；',
  '  宿主加 `经典2D.cheat` 统一接口（`snapshot/setHp/setMaxHp/setShield/setAttack/addRelic/addCurse/clearCurses/gotoFloor/gotoRoom/god`）。',
  '- 设计要点：内核的作弊处理**全部委托宿主** ——「面板上能改的」与「命令里能改的」是同一套实现，不会两边漂移；',
  '  宿主在每次写入后统一 `pushStats() / pushRelics() / pushCursesEnv()`，保证画布上立刻看得到变化。',
  '- 实测：一次应用把 `hp 28→180 / maxHp 28→200 / shield 6→25 / attack 4→30`，**引擎侧同步为 180/200/25/30**；',
  '  输入 `immortalTotem,猎杀标记,不存在的遗物` → 实得 **2 件**且引擎 `relicFx.perk.totem=true`、`executeSet=0.5`；',
  '  输入 `脆弱,生命流失,表外诅咒` → 实得 **2 条**（表外的被白名单挡掉，这正是风险 R9 的可观测表现）。',
  '- 无敌实测（带对照）：开启后 `press("kill")`（999999 伤害）→ **hp 180 不变、dead=false**；关闭后同一操作立刻 `dead=true`。',
  '',
  '**P4-2 开发者命令改造**',
  '',
  '- 新增 8 条（`?dev=true` 下可用）：`room` / `floor` / `relic` / `curse` / `rtdebug` / `god2d` / `ending` / `relics`。',
  '  同样全部委托宿主接口；`rtdebug` 会打印 `ready/running/floor/room/hp/敌数/面板` + `mech`（机制常量）+ `relicFx` + 脉冲节拍。',
  '- 复用了既有的 `devLog(message, level)`（10795 行）而不是新造一个 —— 命令输出在控制台与开发者日志两处都有。',
  '- 实测：`relic 猎杀标记,不朽图腾` → 实得 2 件；`curse 脆弱,生命流失` → 实得 2 条；`god2d on` → `god=true`；`floor 3` → `floor=3`。',
  '- **踩坑**：开发者命令行按**空格**切参数，用户写 `curse 脆弱,生命流失` 时整段是**一个**参数 ——',
  '  命令内必须再按逗号拆一次，否则 `addCurse` 收到一整串、白名单匹配失败、**静默无效**（实测踩到，已修）。',
  '- `trial` 命令按 §7 清单留到 P5 与试炼一起删：P4 只做加法，避免破坏仍在运行的试炼调试路径。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P4-1/P4-2 记录已插入');
