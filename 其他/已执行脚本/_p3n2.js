/* P3-5c：放宽画内面板的卡片上限（4 → 6）
 * 商店是「内核上架的 4 件商品 + 净化」= 5 张，原来被 slice(0,4) 静默截掉，
 * 表现是净化明明上架了却点不到。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
const from = '      this.choiceCards = (data.cards || []).slice(0, 4);   // 最多 4 张（深渊印记把 3 变 4 也放得下）';
const to = [
  '      // 上限 6：商店是「4 件商品 + 净化」共 5 张，遗物 / 奖励最多 4 张（深渊印记）。',
  '      // 原来写死 4，第 5 张（净化）会被静默截掉 —— 表现是「明明上架了却点不到」。',
  '      this.choiceCards = (data.cards || []).slice(0, 6);'
].join(CRLF);
const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok 卡片上限 4 → 6');
