/* 把选英雄/选增益搬进 2D 画面 · 第一步：能力层
 *   引擎：卡片布局支持换行（一行最多 5 张，9 位英雄排 2 行）+ 上限提到 12
 *   内核：把 chooseHero / chooseBonus / getBonusChoices 暴露到窄接口
 * 用法：node 其他/_in2d-a.js
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

/* ---------- 引擎：卡片上限 + 换行布局 ---------- */
patch('战斗2D.js', [
  ['卡片上限 6 → 12',
`      // 上限 6：商店是「4 件商品 + 净化」共 5 张，遗物 / 奖励最多 4 张（深渊印记）。
      // 原来写死 4，第 5 张（净化）会被静默截掉 —— 表现是「明明上架了却点不到」。
      this.choiceCards = (data.cards || []).slice(0, 6);`,
`      // 上限 12：商店 5 张 / 遗物 4 张 / **英雄选择 9 张**（搬进画布后要用）。
      // 原来写死 4，第 5 张（净化）会被静默截掉；写死 6 又装不下 9 位英雄。
      this.choiceCards = (data.cards || []).slice(0, 12);`],

  ['卡片布局支持换行',
`      var cardH = Math.max(64, Math.min(mini ? 126 : 150,
        py + ph - bottomPad - (actH ? actH + (mini ? 12 : 16) : 0) - cardTop));
      var cardW = Math.min(mini ? 142 : 168,
        Math.floor((pw - padX * 2 - gap * (n - 1)) / n));
      var totalW = cardW * n + gap * (n - 1);
      var x0 = Math.round(W / 2 - totalW / 2);

      cards.forEach(function (card, i) {
        self.craftChoiceCard(L, card, x0 + i * (cardW + gap), cardTop, cardW, cardH, mini);
      });`,
`      // 卡片区可用高度（动作按钮与内边距先扣掉）
      var areaH = py + ph - bottomPad - (actH ? actH + (mini ? 12 : 16) : 0) - cardTop;
      // 一行最多 5 张，超了就换行 —— 选英雄有 9 位，挤一行每张只有 68px，字全糊在一起
      var cols = Math.min(n, 5);
      var rows = Math.ceil(n / cols);
      var cardW = Math.min(mini ? 142 : 168,
        Math.floor((pw - padX * 2 - gap * (cols - 1)) / cols));
      var cardH = Math.max(52, Math.min(mini ? 126 : 150,
        Math.floor((areaH - gap * (rows - 1)) / rows)));
      var totalW = cardW * cols + gap * (cols - 1);
      var x0 = Math.round(W / 2 - totalW / 2);

      cards.forEach(function (card, i) {
        var c = i % cols, r = Math.floor(i / cols);
        self.craftChoiceCard(L, card, x0 + c * (cardW + gap), cardTop + r * (cardH + gap), cardW, cardH, mini);
      });`]
], true);

/* ---------- 内核：把选人 / 选增益暴露给宿主 ---------- */
patch('主程序.js', [
  ['内核接口加选人/选增益',
`  getRandomRelicByRarity: getRandomRelicByRarity,`,
`  getRandomRelicByRarity: getRandomRelicByRarity,
  // 选英雄 / 选增益（把这两个界面搬进 2D 画布后，由宿主调用）
  chooseHero: chooseHero,
  chooseBonus: chooseBonus,
  getBonusChoices: getBonusChoices,`]
], true);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
