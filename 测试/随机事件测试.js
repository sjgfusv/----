// ============================================================
// 深渊回廊 - 随机事件测试（forceNext 精确控制随机分支）
// ============================================================
(async function() {
    const Test = window.__Test;
    if (!Test) throw new Error('测试公共模块未加载');

    const result = await Test.runTest(async function() {
        const { cLog, assert, resetStateForTest, forceNext } = Test;
        const state = window.state;
        const ALL_EVENT_OPTIONS = window.ALL_EVENT_OPTIONS;
        const chooseHero = window.chooseHero;
        const chooseBonus = window.chooseBonus;
        const chooseEvent = window.chooseEvent;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        resetStateForTest();
        state.mode = 'heroSelect';
        chooseHero(1);
        await sleep(50);
        chooseBonus(0);
        await sleep(50);

        // 统一初始资源
        function resetResources() {
            state.player.hp = 30;
            state.player.maxHp = 50;
            state.player.attack = 5;
            state.player.shield = 0;
            state.player.gold = 50;
            state.player.potions = 1;
            state.player.xp = 30;
            state.relics = [];
            state.vampireLevel = 0;
            state.thornLevel = 0;
            state.luckyLevel = 0;
        }

        function snapshot() {
            const p = state.player;
            return {
                hp: p.hp, maxHp: p.maxHp, attack: p.attack, shield: p.shield,
                gold: p.gold, potions: p.potions, xp: p.xp,
                relics: state.relics.length
            };
        }

        // 执行事件（真实 chooseEvent 路径）
        function runEvent(event) {
            resetResources();
            state.rooms = [{ type: 'treasure' }];   // ← 隔离：下一间为宝箱房，不触发战斗
            state.roomIndex = 0;
            const before = snapshot();
            state.eventOptions = [event];
            state.mode = 'eventChoice';
            chooseEvent(0);
            return before;
        }


        // ===== 确定性分支测试（forceNext 控制概率走向）=====

        // 隐秘宝箱：金币分支（0.3 < 0.6）
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '隐秘宝箱');
            forceNext(0.3);
            const before = runEvent(ev);
            assert(state.player.gold === before.gold + 18,
                `隐秘宝箱-金币分支：金币+18（${before.gold}->${state.player.gold}）`);
        }
        // 隐秘宝箱：陷阱分支（0.9 >= 0.6）
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '隐秘宝箱');
            forceNext(0.9);
            const before = runEvent(ev);
            assert(state.player.hp === before.hp - 4,
                `隐秘宝箱-陷阱分支：HP-4（${before.hp}->${state.player.hp}）`);
        }

        // 暗影洞穴：药水分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '暗影洞穴');
            forceNext(0.2);
            const before = runEvent(ev);
            assert(state.player.potions === before.potions + 1,
                `暗影洞穴-补给分支：药水+1`);
        }
        // 暗影洞穴：毒烟分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '暗影洞穴');
            forceNext(0.8);
            const before = runEvent(ev);
            assert(state.player.hp === before.hp - 5,
                `暗影洞穴-毒烟分支：HP-5`);
        }

        // 古树祝福（无随机）
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '古树祝福');
            const before = runEvent(ev);
            assert(state.player.hp === before.hp + 7 && state.player.shield === before.shield + 2,
                '古树祝福：HP+7护盾+2');
        }

        // 商队劫掠（无随机）
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '商队劫掠');
            const before = runEvent(ev);
            assert(state.player.gold === before.gold + 20 && state.player.hp === before.hp - 3,
                '商队劫掠：金币+20，HP-3');
        }

        // 诅咒之井：血量充足分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '诅咒之井');
            const before = runEvent(ev); // hp=30 > 10
            assert(state.player.hp === before.hp - 10 && state.player.gold === before.gold + 40,
                '诅咒之井：HP-10，金币+40');
        }
        // 诅咒之井：血量不足分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '诅咒之井');
            forceNext(0.5); // 占位（无随机消耗也无妨）
            const before = runEvent(ev);
            state.player.hp = 8; // 手动压血
            state.player.gold = 50;
            const before2 = snapshot();
            state.eventOptions = [ev];
            state.mode = 'eventChoice';
            chooseEvent(0);
            assert(state.player.hp === Math.max(1, 8 - 3) && state.player.gold === 50 + 12,
                '诅咒之井-血量不足：HP-3，金币+12');
        }

        // 智慧圣殿：攻击分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '智慧圣殿');
            forceNext(0.3);
            const before = runEvent(ev);
            assert(state.player.attack === before.attack + 1, '智慧圣殿-攻击分支：攻击+1');
        }
        // 智慧圣殿：生命分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '智慧圣殿');
            forceNext(0.7);
            const before = runEvent(ev);
            assert(state.player.maxHp === before.maxHp + 3, '智慧圣殿-生命分支：上限+3');
        }

        // 幸运骰子：赢分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '幸运骰子');
            forceNext(0.3);
            const before = runEvent(ev);
            assert(state.player.gold === before.gold + 20, '幸运骰子-赢：金币+20');
        }
        // 幸运骰子：输分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '幸运骰子');
            forceNext(0.7);
            const before = runEvent(ev);
            assert(state.player.gold === before.gold - 10, '幸运骰子-输：金币-10');
        }

        // 恶魔低语：坏分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '恶魔低语');
            forceNext(0.3);
            const before = runEvent(ev);
            assert(state.player.gold === before.gold - 10 && state.player.hp === before.hp - 8,
                '恶魔低语-坏分支：金币-10，HP-8');
        }
        // 恶魔低语：好分支
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '恶魔低语');
            forceNext(0.7);
            const before = runEvent(ev);
            assert(state.player.gold === before.gold + 10 && state.player.maxHp === before.maxHp + 8,
                '恶魔低语-好分支：金币+10，上限+8');
        }

        // 神秘商人：金币充足
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '神秘商人');
            const before = runEvent(ev); // gold=50 >= 30
            assert(state.player.gold === before.gold - 30 && state.relics.length === before.relics + 1,
                '神秘商人：金币-30，获得1件遗物');
        }
        // 神秘商人：金币不足
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '神秘商人');
            resetResources();              // relics = []
            state.player.gold = 10;
            state.rooms = [{ type: 'treasure' }];
            state.eventOptions = [ev];
            state.mode = 'eventChoice';
            chooseEvent(0);
            assert(state.player.gold === 10 && state.relics.length === 0, '神秘商人-金币不足：无变化');
        }

        // 暗影交易：HP-20 换 5 遗物（真实路径）
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '暗影交易');
            const before = runEvent(ev); // hp=30 > 20
            assert(state.player.hp === before.hp - 20,
                `暗影交易：HP-20（${before.hp}->${state.player.hp}）`);
            assert(state.relics.length === 5,
                `暗影交易：获得5件遗物（实际${state.relics.length}）`);
        }

        // 知识祭坛：经验充足
        {
            const ev = ALL_EVENT_OPTIONS.find(e => e.label === '知识祭坛');
            forceNext(0.5); // 不触发古神眷顾（本来也没有）
            const before = runEvent(ev);
            assert(state.player.xp === before.xp - 20 && state.relics.length >= 1,
                '知识祭坛：经验-20，获得遗物');
        }

        // ===== 全事件冒烟测试（不崩即可，含分支覆盖之外的）=====
        for (const ev of ALL_EVENT_OPTIONS) {
            runEvent(ev);
            assert(state.mode !== 'eventChoice', `事件"${ev.label}"执行完成`);
            await sleep(50);
        }

        cLog('随机事件测试完成');
    }, { seed: 131415 });

    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'event', result }, '*');
    }
})();
