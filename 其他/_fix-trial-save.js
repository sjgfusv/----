/* 修：旧存档里的 state.trial 残留导致永远回退文字模式
 *   试炼的代码已删，但 state.trial 是**存档里的纯数据** ——
 *   loadGame() 用 Object.assign(state, savedData) 会把它带回来，
 *   而 shouldTakeOver() 里那句 `if (s.trial && s.trial.active) return false;`
 *   会让「试炼进行中」的旧档永远判 false → 一路回退文字模式。
 *   我这边没这个存档所以没复现出来，是用户在两台设备上同时撞到的。
 * 用法：node 其他/_fix-trial-save.js
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

/* ① 判定里去掉 trial 检查 */
rep('shouldTakeOver 去掉 trial 判定',
`    if (s.gameOver) return false;
    if (s.trial && s.trial.active) return false;`,
`    if (s.gameOver) return false;
    // ⚠️ 这里**不能**再判 state.trial.active：试炼的代码已经删了，但 state.trial 是
    //    **存档里的纯数据**，loadGame 的 Object.assign 会把它带回来 ——
    //    一份「试炼进行中」的旧档会让本函数永远返回 false，玩家在两台设备上都会
    //    一路回退到文字模式（实测就是这么撞到的）。`);

/* ② 接管时顺手清掉残留 */
rep('render 清理残留 state.trial',
`    var s = S();
    if (!s) return false;
    if (!shouldTakeOver()) return false;`,
`    var s = S();
    if (!s) return false;
    // 旧存档带回来的 state.trial 是纯数据残留（试炼代码已删）——顺手清掉，
    // 免得它继续干扰判定；delete 失败也不影响（判定那边已经不看它了）。
    if (s.trial) { try { delete s.trial; } catch (e) { s.trial = undefined; } }
    if (!shouldTakeOver()) return false;`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
