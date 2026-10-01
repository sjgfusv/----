/* P3-5a：内核房间池加入祭坛房（shrine）
 * 经典原本没有祭坛房，但 2D 引擎有现成的祭坛，而规划 §3.5 要用它承载
 * 「献祭生命解除一条诅咒」—— 诅咒系统的解除途径之一。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主程序.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
const from = "      const pool = ['enemy', 'mirror', 'rest', 'treasure', 'shop', 'event'];";
const to = [
  '      // shrine（祭坛）：2.7 新增。经典原本没有祭坛房，但 2D 引擎有现成的祭坛，',
  '      // 而诅咒系统需要一条「献祭生命解除诅咒」的解除途径（规划 §3.5）。',
  "      const pool = ['enemy', 'mirror', 'rest', 'treasure', 'shop', 'event', 'shrine'];"
].join(CRLF);
const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok 内核房间池已加 shrine');
