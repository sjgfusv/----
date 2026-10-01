/* 文字界面（DOM）的选英雄 / 选增益页加提示。
   主程序.js 是 CRLF：多行锚点必须带 \r\n。 */
const fs = require('fs');
const F = 'D:\\深渊回廊\\主程序.js';
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
const L = (a) => a.join('\r\n');
function rep(label, from, to) {
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; return; }
  s = s.split(from).join(to);
  console.log('ok ' + label);
}

rep('选英雄页提示',
  L([
    "    refs.eventTitle.textContent = '选择英雄';",
    "    refs.eventText.textContent = '从十一位英雄中选择一位，每个英雄拥有专属属性与技能。';",
  ]),
  L([
    "    refs.eventTitle.textContent = '选择英雄';",
    "    // 英雄数量按 heroOptions 实数走：这里原来写死“十一位”，早就和实际对不上了",
    "    refs.eventText.textContent = `从 ${heroOptions.length} 位英雄中选择一位，每个英雄拥有专属属性与技能。` +",
    "      '选完英雄和增益后才能进入实时战斗哦。';",
  ]));

rep('选增益页提示',
  L([
    "    refs.eventTitle.textContent = '选择开局增益';",
    "    refs.eventText.textContent = '从三种开局增益中选择一个，启动本次冒险。';",
  ]),
  L([
    "    refs.eventTitle.textContent = '选择开局增益';",
    "    refs.eventText.textContent = '从三种开局增益中选择一个。选完这一项就进入实时战斗哦。';",
  ]));

if (fails) { console.log('有未命中，未写入'); process.exit(1); }
const bare = (s.match(/(?<!\r)\n/g) || []).length;
if (bare) { console.log('发现 ' + bare + ' 个裸 LF，已中止'); process.exit(1); }
fs.writeFileSync(F, s);
console.log('已写入 · CRLF=' + (s.match(/\r\n/g) || []).length);
