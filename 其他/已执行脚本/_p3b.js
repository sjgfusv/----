/* P3-1b：镜像房的数值覆写让位给宿主（命名与标签仍照旧处理） */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');

const from = [
  "        if (e && key === 'mimic' && roomType === 'mirror') {",
  '          e.maxHp = Math.round(Math.max(36, self.hero.attack * 3 + self.hero.maxHp * 0.45));',
  '          e.hp = e.maxHp;',
  "          e.atk = Math.max(6, Math.round(self.hero.attack * 0.6));"
].join(CRLF);

const to = [
  "        if (e && key === 'mimic' && roomType === 'mirror') {",
  '          // 数值：宿主接了 enemyScaler 就由它算（tier===\'mirror\' 分支按玩家属性定标），',
  '          // 这里的硬覆写只在没有宿主时兜底 —— 否则会把宿主算好的数值又盖回去。',
  '          // 名字与标签始终照旧（那是"镜像"的表现，与数值来源无关）。',
  '          if (!HOST.enemyScaler) {',
  '            e.maxHp = Math.round(Math.max(36, self.hero.attack * 3 + self.hero.maxHp * 0.45));',
  '            e.hp = e.maxHp;',
  '            e.atk = Math.max(6, Math.round(self.hero.attack * 0.6));',
  '          }'
].join(CRLF);

const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok 镜像房覆写已加守卫');
