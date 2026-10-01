/* P4-4a 文档记录 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '待做', '2.7规划.md');
let s = fs.readFileSync(F, 'utf8');
const ANCHOR = '### P5 · 试炼关停与回归';
const REC = [
  '**P4-4a 音频场景补齐**',
  '',
  '- 先查了 `AbyssAudio` 的现状：场景 API 是 `setScene()`（不是 `setBgmScene`），已支持',
  '  `menu/explore/battle/boss/elite/mirror/shop/rest/**ending**` —— **结局场景本来就有**，直接复用。',
  '- 真正缺的只有「层间抉择」：`SCENES` 新增 `choice`，复用 `CHORDS_TENSE` + 持续低鸣，只调编排参数、不做新曲（规划要求）。',
  '- 引擎暴露 `API.setBgmScene(scene)` 作为宿主的合法入口（内部就是转发到 `AbyssAudio.setScene`）；',
  '  宿主在开「深渊裂隙」时切 `choice`、开结局面板时切 `ending`、开遗物 / 奖励面板时切 `shop`；',
  '  关闭面板后不需要手动恢复 —— 进下一个房间时引擎会自己 `setBgmScene(bgmForRoom(...))`。',
  '- 实测：`setBgmScene("choice")` / `("ending")` / 传**不存在的场景名** 都返回 true 且**零异常**',
  '  （不认识的名字由 `AbyssAudio` 自己忽略，这是它原有的容错，宿主不需要额外判空）。',
  '',
  ''
].join('\n');
const n = s.split(ANCHOR).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.replace(ANCHOR, REC + ANCHOR));
console.log('ok P4-4a 记录已插入');
