/* P3-5d：两个修复
 *  ① 引擎 resolveRoomGoal：宿主**接了 roomAction** 时，祭坛也交给宿主
 *     （经典要用它做「献祭解除诅咒」；试炼没接 bridge，行为保持原样不受影响）
 *  ② 宿主 settleRoomGold：祭坛属于非战斗房，不该给战斗金币
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;
function patch(file, rules, crlf) {
  const F = path.join(__dirname, '..', file);
  let s = fs.readFileSync(F, 'utf8');
  console.log('=== ' + file + ' ===');
  for (const [label, from, to] of rules) {
    const f = crlf ? from.split('\n').join(CRLF) : from;
    const t = crlf ? to.split('\n').join(CRLF) : to;
    const n = s.split(f).length - 1;
    if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; continue; }
    s = s.split(f).join(t);
    console.log('ok ' + label);
  }
  fs.writeFileSync(F, s);
}

patch('战斗2D.js', [
  ['resolveRoomGoal 分流加 shrine',
`      if (g.kind === 'shop' || g.kind === 'rest' || g.kind === 'event') {
        if (g.awaiting) return;
        g.awaiting = true;
        this.notifyRoomAction(g.kind, g);
        return;
      }`,
`      // 祭坛（shrine）只在**宿主接了 roomAction** 时交出去 ——
      // 经典模式要用它做「献祭生命解除诅咒」；试炼没接 bridge，
      // 必须保持引擎原有的「走近祈祷回血」行为不变。
      var hostOwnsShrine = (g.kind === 'shrine' && hasBridge('roomAction'));
      if (g.kind === 'shop' || g.kind === 'rest' || g.kind === 'event' || hostOwnsShrine) {
        if (g.awaiting) return;
        g.awaiting = true;
        this.notifyRoomAction(g.kind, g);
        return;
      }`]
], true);

patch('经典2D.js', [
  ['settleRoomGold 把祭坛算作非战斗房',
`    } else if (roomType === 'shop' || roomType === 'rest' || roomType === 'event') {
      gain = 0;                                              // 非战斗房不给战斗金币`,
`    } else if (roomType === 'shop' || roomType === 'rest' || roomType === 'event' || roomType === 'shrine') {
      gain = 0;                                              // 非战斗房（含祭坛）不给战斗金币`]
], false);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
