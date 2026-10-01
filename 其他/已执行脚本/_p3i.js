/* P3-3g：修遗物面板的 kind
 * openRewardChoice 把 kind 硬编码成 'reward'，用它开遗物面板会让宿主的
 * kind==='relic' 分支永不命中（表现：Boss 房领完奖励后弹的仍是奖励面板）。
 * 改用 openEventPanel('relic', ...)，kind 由调用方决定。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '经典2D.js');
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(label, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; return; }
  s = s.split(from).join(to);
  console.log('ok ' + label);
}

rep('遗物面板用 openEventPanel',
  `    return e.openRewardChoice({
      title: '遗物',
      desc: reason + ' · 选一件带走（或跳过换 20 金币）',`,
  `    // ⚠️ 必须走 openEventPanel('relic', …)：openRewardChoice 把 kind 写死成 'reward'，
    //    用它开遗物面板的话宿主永远收不到 kind==='relic'（实测：Boss 房领完奖励后
    //    又弹了一次奖励面板，遗物根本没发出去）。
    return e.openEventPanel('relic', {
      title: '遗物',
      desc: reason + ' · 选一件带走（或跳过换 20 金币）',`);

rep('closeChoicePanel 清卡片缓存',
  `      this.destroyLayer('choiceLayer');
      if (this.panelButtons) this.panelButtons.choice = [];
      this.choiceRects = [];`,
  `      this.destroyLayer('choiceLayer');
      if (this.panelButtons) this.panelButtons.choice = [];
      this.choiceRects = [];
      this.choiceCards = [];   // 顺手清掉：否则 debug() 会读到上一块面板的卡片，排查时误导
      this.choiceData = null;`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
