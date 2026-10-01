/* P3-3h：引擎 closeChoicePanel 顺手清掉卡片缓存（避免 debug 读到旧面板的卡片） */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
const from = [
  "      this.destroyLayer('choiceLayer');",
  '      if (this.panelButtons) this.panelButtons.choice = [];',
  '      this.choiceRects = [];'
].join(CRLF);
const to = [
  "      this.destroyLayer('choiceLayer');",
  '      if (this.panelButtons) this.panelButtons.choice = [];',
  '      this.choiceRects = [];',
  '      this.choiceCards = [];   // 顺手清掉：否则 debug() 会读到上一块面板的卡片，排查时误导',
  '      this.choiceData = null;'
].join(CRLF);
const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok closeChoicePanel 已清缓存');
