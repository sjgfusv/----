/* 回退时把原因显示给玩家（手机看不到 console） */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '经典2D.js');
let s = fs.readFileSync(F, 'utf8');
const from = [
  "    warn('2D 引擎不可用，已回退回合制界面：', lastError || '(未知原因)');",
  '    var s = S();'
].join('\n');
const to = [
  "    warn('2D 引擎不可用，已回退回合制界面：', lastError || '(未知原因)');",
  '    // 手机上看不到 console —— 把原因直接说给玩家听，',
  '    // 否则"怎么突然变文字界面了"只能靠猜（这次就是靠用户反馈才定位到存档残留）。',
  '    try {',
  '      var k = kernel();',
  '      if (k && typeof k.showToast === "function") {',
  "        k.showToast('2D 画面启动失败，已切回文字模式：' + (lastError || '未知原因'));",
  '      }',
  '    } catch (e) { /* 忽略 */ }',
  '    var s = S();'
].join('\n');
const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok 回退时会显示原因');
