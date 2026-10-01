/* P5-3b：删掉 3 个混合测试里的试炼段落（自包含块，删后不影响其余断言）
 *   遗物测试.js / 环境测试.js 两处较大，另行处理。
 * 用法：node 其他/_p5l.js
 */
const fs = require('fs');
const path = require('path');
const BAK = path.join(__dirname, '备份');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let fails = 0;

function patch(file, rules) {
  const F = path.join(__dirname, '..', '测试', file);
  let s = fs.readFileSync(F, 'utf8');
  const nl = (s.match(/\r\n/g) || []).length > (s.match(/\n/g) || []).length ? '\r\n' : '\n';
  fs.writeFileSync(path.join(BAK, file + '.' + stamp + '.bak'), s);
  console.log('=== ' + file + '（备份 ' + file + '.' + stamp + '.bak）===');
  for (const [label, from, to] of rules) {
    const f = from.split('\n').join(nl);
    const t = (to || '').split('\n').join(nl);
    const n = s.split(f).length - 1;
    if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; continue; }
    s = s.split(f).join(t);
    console.log('ok ' + label);
  }
  fs.writeFileSync(F, s);
}

/* A. 增益测试.js：51-69 */
patch('增益测试.js', [[
  '试炼模式增益复制段',
  `    // 测试在试炼模式下的复制
    for (const bonus of fullBonusList) {
      resetStateForTest();
      chooseHero(0);
      await sleep(50);
      state.availableBonuses = [bonus];
      chooseBonus(0);
      await sleep(50);
      Trial.start();
      await sleep(300);
      if (state.trial.active) {
        const foundTrial = state.trial.bonuses.some(b => b.title === bonus.title);
        assert(foundTrial, \`试炼模式：增益“\${bonus.title}”已复制\`);
        Trial.exit();
        await sleep(100);
      } else {
        cLog(\`试炼模式：增益“\${bonus.title}”未能启动试炼\`, false);
      }
    }
`,
  `    // 试炼已关停（P5）：原先这里还有一段「增益在试炼里被复制」的验证，随试炼一并移除。
    // 想看那部分：老版的 测试/增益测试.js 里仍然完整。
`
]]);

/* B. 英雄多样性测试.js：128-143 */
patch('英雄多样性测试.js', [[
  '试炼启动验证段',
  `            // ===== 试炼启动验证 =====
            resetStateForTest();
            state.mode = 'heroSelect';
            chooseHero(i);
            await sleep(50);
            chooseBonus(0);
            await sleep(50);
            Trial.start();
            await sleep(300);
            if (state.trial.active) {
                assert(state.trial.hero.id === hero.id, \`试炼中英雄"\${hero.name}"正确\`);
                Trial.exit();
                await sleep(100);
            } else {
                cLog(\`英雄"\${hero.name}"试炼启动失败\`, false);
            }
`,
  `            // 试炼已关停（P5）：原先这里还有一段「该英雄在试炼里是否就位」的验证，随试炼一并移除。
`
]]);

/* C. 商品测试.js：90-126 */
patch('商品测试.js', [[
  '试炼商店测试段',
  `    // ---- 试炼商店测试（真实点击） ----
    resetStateForTest();
    chooseHero(0);
    await sleep(100);
    chooseBonus(0);
    await sleep(100);
    // 启动试炼
    Trial.start();
    await sleep(500);
    // 确保试炼激活
    if (!state.trial.active) {
      state.trial.active = true;
      state.trial.player = { hp: 100, maxHp: 100, attack: 10, shield: 0, potions: 5, gold: 0, strengthPotions: 0, xp: 0 };
    }
    state.trial.points = 200;
    // 打开试炼商店
    openTrialShop(false);
    await sleep(300);
    // 通过DOM点击购买第一个商品
    const shopItems = document.getElementById('trialShopItems');
    assert(shopItems, '试炼商店DOM存在');
    const firstItem = shopItems.querySelector('.condition-item:not(.achieved)');
    if (firstItem) {
      firstItem.click();
      await sleep(300);
      // 验证点数减少
      // 但实际点击后由游戏逻辑处理，我们只需检查是否已拥有或点数变化
      // 这里简单检查点数是否减少（假设购买成功）
      const pointsAfter = state.trial.points;
      assert(pointsAfter < 200, \`购买后点数减少（200->\${pointsAfter}）\`);
    } else {
      cLog('试炼商店无可购买商品', false);
    }

    closeTrialShop();
    await sleep(200);
    assert(document.getElementById('trialShopModal').classList.contains('hidden'), '试炼商店关闭');
`,
  `    // 试炼商店测试已随试炼关停移除（P5）：新版只有一个商店（2D 画内），
    // 它的目录与价格由 经典2D.js 提供，覆盖在 测试/2D引擎回归.html 与实机验证里。
`
]]);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
