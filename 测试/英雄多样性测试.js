// ============================================================
// 深渊回廊 - 英雄多样性测试（遍历所有英雄 + 差异化验证）
// 修复：不同英雄的被动技能挂在不同的钩子上（onCombatStart/onAttack/onDefend/onVictory）
// ============================================================
(async function() {
    const Test = window.__Test;
    if (!Test) throw new Error('测试公共模块未加载');

    const result = await Test.runTest(async function() {
        const { cLog, assert, resetStateForTest } = Test;
        const state = window.state;
        const heroOptions = window.heroOptions;
        const chooseHero = window.chooseHero;
        const chooseBonus = window.chooseBonus;
        const attackEnemy = window.attackEnemy;
        const enemyTurn = window.enemyTurn;
        const startCombat = window.startCombat;
        const Trial = window.Trial;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        // 辅助：进入一场属性清零的确定性战斗
        function enterCleanCombat() {
            state.currentRoom = { type: 'enemy' };
            state.mode = 'event';
            startCombat(false, 'enemy');
            const e = state.combat.enemy;
            e.dodge = 0; e.thorn = 0; e.vampire = 0; e.combo = 0; e.crit = 0;
            return e;
        }

        for (let i = 0; i < heroOptions.length; i++) {
            const hero = heroOptions[i];
            resetStateForTest();
            state.mode = 'heroSelect';
            chooseHero(i);
            await sleep(50);

            // ===== 基础验证 =====
            assert(state.hero.id === hero.id, `英雄"${hero.name}"选择成功`);
            assert(state.player.maxHp === hero.stats.hp, `英雄"${hero.name}"生命上限正确（${state.player.maxHp}）`);
            assert(state.player.attack === hero.stats.attack, `英雄"${hero.name}"攻击正确（${state.player.attack}）`);

            // ===== 技能钩子验证（不同英雄钩子不同）=====
            const sk = state.hero.skill;
            const hasHook = !!(sk.onCombatStart || sk.onAttack || sk.onDefend || sk.onVictory);
            assert(sk && hasHook, `英雄"${hero.name}"有被动技能（${sk.name}）`);
            assert(!!sk.active, `英雄"${hero.name}"有主动技能（${sk.active.name}）`);

            // ===== 差异化技能验证 =====
            switch (hero.id) {
                case 'warrior': // 坚韧之盾：战斗开始+3护盾
                case 'paladin': { // 圣光护盾：战斗开始+4护盾
                    const gain = hero.id === 'warrior' ? 3 : 4;
                    state.player.shield = 0;
                    enterCleanCombat();
                    assert(state.player.shield === gain,
                        `${hero.name}被动：开战护盾+${gain}（实际${state.player.shield}）`);
                    break;
                }
                case 'rogue': { // 迅捷突袭：首回合攻击+2
                    const e = enterCleanCombat();
                    e.hp = 100; e.maxHp = 100;
                    state.luckyLevel = 0; state.comboLevel = 0;
                    Test.forceNext(0.5, 0.99); // 伤害随机取中，不连击
                    const hpBefore = e.hp;
                    attackEnemy();
                    await sleep(200);
                    // 基础攻击7 + 随机0~2 + 首回合2 = 9~11
                    const dmg = hpBefore - e.hp;
                    assert(dmg >= 9 && dmg <= 11,
                        `刺客被动：首回合伤害含+2（实际${dmg}）`);
                    break;
                }
                case 'shadow': { // 暗影步：首回合必暴击
                    const e = enterCleanCombat();
                    e.hp = 100; e.maxHp = 100;
                    state.luckyLevel = 0; state.comboLevel = 0;
                    Test.forceNext(0.99); // 无普通暴击干扰（等级为0本就不触发）
                    const hpBefore = e.hp;
                    attackEnemy();
                    await sleep(200);
                    // 基础8，暴击150% → 随机0~2后乘1.5，范围12~15
                    const dmg = hpBefore - e.hp;
                    assert(dmg >= 12 && dmg <= 15,
                        `暗影被动：首回合暴击伤害（实际${dmg}）`);
                    break;
                }
                case 'berserker': { // 嗜血狂暴：半血以下攻击+2
                    const e = enterCleanCombat();
                    e.hp = 100; e.maxHp = 100;
                    state.luckyLevel = 0; state.comboLevel = 0;
                    state.player.hp = Math.floor(state.player.maxHp / 2); // 半血
                    Test.forceNext(0.5, 0.99);
                    const hpBefore = e.hp;
                    attackEnemy();
                    await sleep(200);
                    // 基础5 + 随机0~2 + 狂暴2 = 7~9
                    const dmg = hpBefore - e.hp;
                    assert(dmg >= 7 && dmg <= 9,
                        `狂战士被动：半血攻击+2（实际${dmg}）`);
                    break;
                }
                case 'guardian': { // 坚壁防御：防御时额外+2护盾
                    state.player.shield = 0;
                    enterCleanCombat();
                    state.combat.enemy.attack = 0;
                    Test.forceNext(0.99); // 不闪避
                    window.defend();
                    await sleep(200);
                    // 防御+3 + 坚壁+2 = 5（敌人0攻不消耗护盾）
                    assert(state.player.shield === 5,
                        `守护者被动：防御共+5护盾（实际${state.player.shield}）`);
                    break;
                }
                default: {
                    // 其余英雄进入普通战斗验证不报错即可
                    const e = enterCleanCombat();
                    const hpBefore = e.hp;
                    attackEnemy();
                    await sleep(200);
                    assert(!state.combat || state.combat.enemy.hp < hpBefore || state.mode !== 'combat',
                        `英雄"${hero.name}"战斗正常`);
                    break;
                }
            }

            // 试炼已关停（P5）：原先这里还有一段「该英雄在试炼里是否就位」的验证，随试炼一并移除。
        }

        cLog('英雄多样性测试通过');
    }, { seed: 252627 });

    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'heroDiversity', result }, '*');
    }
})();
