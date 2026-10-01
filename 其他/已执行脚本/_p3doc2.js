/* P3-4 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '**本阶段踩到两个「查不出来」的坑（都值得记住）**';
const REC = [
  '**P3-4 诅咒系统（深渊裂隙 · 规划 §3.5）**',
  '',
  '- 数据放宿主的 `state._rtCurses`（纯字符串数组，存档安全），**效果由引擎既有的 10 条实时化诅咒承担**',
  '  （每 5 秒一次腐化脉冲结算，见引擎 `RT_CURSES`）。',
  '- 分级：轻 = 脆弱 / 护甲腐蚀 / 药水衰减 / 迟钝；重 = 荆棘诅咒 / 易伤 / 生命流失 / 虚弱 / 吸血反噬 / 贪婪。',
  '- 触发链：清完层主房 → 属性奖励 → 遗物 → **深渊裂隙三选一** →（结局判定）→ 传送门。',
  '  用 `_riftDoneThisFloor` 挡住递归 —— `advanceToNextRoom` 会被裂隙选择的结果再次调到，不挡会在同层无限弹。',
  '- ⚠️ 池子必须**开局下发全部 10 条**（`setCursePool`）：引擎的诅咒池是**白名单**，表外名字静默丢弃（风险 R9，不报错也不生效）。',
  '- 实测一整条链：Boss 房 → 属性奖励(`reward`) → 遗物(`relic`, 3 张) → **裂隙(`rift`, light/deep/refuse)** →',
  '  选「沉沦」→ **`_rtCurses = ["迟钝","贪婪"]`**（1 轻 + 1 重，符合「至少 1 条重」）、**金币 +8**（= 层数 × 8）→',
  '  再弹一次遗物 → `relics 1→2`；引擎侧 `curseState().curses` 同步为同样两条，**腐化脉冲随之启动**（`pulse.interval=4300`）。',
  '- 净化（商店商品）与祭坛解除诅咒放在 P3-5 的商店 / 祭坛面板里一起做。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P3-4 记录已插入');
