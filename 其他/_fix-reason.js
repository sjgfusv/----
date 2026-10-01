/* debug() 暴露「为什么没接管」——只返回一个 false 没法定位 */
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

rep('加 takeOverReason 函数',
`  function debug() {`,
`  /**
   * 没接管时，指出**到底是哪一条**不满足
   * 只回一个 false 的话，"回退文字模式"就没法定位 —— 实测用户反馈时，
   * 光看 debug() 的 takeOver:false 完全看不出是 hero 没了还是模式不对。
   */
  function takeOverReason() {
    var s = S();
    if (!enabled()) return 'disabled';
    if (unavailable) return 'engine-unavailable';
    if (!s) return 'no-state';
    if (!s.hero) return 'no-hero';
    if (s.gameOver) return 'gameOver=true';
    if (s.mode === 'heroSelect') return 'mode=heroSelect';
    if (s.mode === 'bonusSelect') return 'mode=bonusSelect';
    if (s.mode === 'start') return 'mode=start';
    if (s.mode === 'gameover') return 'mode=gameover';
    if (s.mode === 'finished') return 'mode=finished';
    if (!s.currentRoom) return 'currentRoom=null';
    if (running) return null;
    return 'ready-to-start';
  }

  function debug() {`);

rep('debug 输出 reason',
`      engine: d,
      takeOver: shouldTakeOver()`,
`      engine: d,
      takeOver: shouldTakeOver(),
      takeOverReason: takeOverReason()   // null = 条件都满足（已在接管或可接管）`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
