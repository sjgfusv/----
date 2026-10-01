/* P3-3f：修 reset() 的事件重复绑定隐患
 * 引擎实例不会被销毁，所以 reset() 不该清 booted / evBound ——
 * 清了会让下次 startRun 重新 init 并再绑一遍引擎事件（监听器翻倍、面板开两次）。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '经典2D.js');
let s = fs.readFileSync(F, 'utf8');

const from = [
  '  function reset() {',
  '    stop();',
  '    booted = false;',
  '    evBound = false;',
  '    retryCount = 0;',
  '    unavailable = false;',
  '    lastError = null;',
  '  }'
].join('\n');

const to = [
  '  function reset() {',
  '    stop();',
  '    // ⚠️ 不要清 booted / evBound：引擎实例并没有被销毁（引擎是全局单例），',
  '    //    清了会让下次 startRun 重新走 init 并再绑一遍引擎事件 ——',
  '    //    监听器翻倍，表现为"面板弹两次、存档写两遍"这类诡异现象。',
  '    retryCount = 0;',
  '    unavailable = false;',
  '    lastError = null;',
  '  }'
].join('\n');

const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok reset() 已修');
