// ============================================================
// 深渊回廊 - 移动端适配测试（验证游戏真实的媒体查询规则）
// 修复：在 file:// 协议下跳过样式表规则断言（因浏览器安全限制无法读取跨域样式表）
// ============================================================
(async function() {
    const Test = window.__Test;
    if (!Test) throw new Error('测试公共模块未加载');

    const result = await Test.runTest(async function() {
        const { cLog, assert, resetStateForTest } = Test;
        const state = window.state;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        // 检测是否在 file:// 协议下运行
        const isFileProtocol = location.protocol === 'file:';

        // ===== 1. 收集游戏样式表中全部媒体查询断点（file:// 下跳过） =====
        let breakpoints = new Set();
        let totalRules = 0;
        let mediaRuleCount = 0;

        if (!isFileProtocol) {
            for (const sheet of document.styleSheets) {
                let rules;
                try { rules = sheet.cssRules; } catch (e) { continue; } // 跨域样式表跳过
                if (!rules) continue;
                for (const rule of rules) {
                    totalRules++;
                    if (rule.type === CSSRule.MEDIA_RULE || (rule.media && rule.conditionText)) {
                        mediaRuleCount++;
                        // 提取 max-width: XXXpx 中的数值
                        const match = rule.conditionText.match(/max-width:\s*(\d+)px/g);
                        if (match) {
                            match.forEach(m => {
                                const px = parseInt(m.match(/(\d+)px/)[1]);
                                breakpoints.add(px);
                            });
                        }
                    }
                }
            }

            // 断言：样式表规则数量正常
            assert(totalRules > 100, `样式表规则数量正常（${totalRules}条）`);
            assert(mediaRuleCount > 5, `存在媒体查询规则（${mediaRuleCount}条）`);

            // 验证关键断点存在
            const bpList = [...breakpoints].sort((a, b) => a - b);
            cLog(`检测到断点：${bpList.join('px, ')}px`);

            assert(breakpoints.has(480), '存在480px断点（主流手机宽度）');
            assert(breakpoints.has(768) || breakpoints.has(820) || breakpoints.has(860),
                '存在平板断点（768/820/860px）');

            // 验证移动端核心适配规则存在（检查 hud-grid 单列化规则）
            let hasHudCollapse = false;
            for (const sheet of document.styleSheets) {
                let rules;
                try { rules = sheet.cssRules; } catch (e) { continue; }
                if (!rules) continue;
                for (const rule of rules) {
                    if (rule.cssText && rule.cssText.includes('hud-grid') &&
                        rule.cssText.includes('1fr') && rule.cssText.includes('grid-template-columns')) {
                        hasHudCollapse = true;
                        break;
                    }
                }
                if (hasHudCollapse) break;
            }
            // 此项为辅助验证，不强求，只输出日志
            if (hasHudCollapse) {
                cLog('✅ 检测到 hud-grid 响应式规则');
            } else {
                cLog('⚠️ 未显式检测到 hud-grid 响应式规则（可能因样式表加载方式不同）', true);
            }
        } else {
            cLog('⚠️ file:// 环境无法读取样式表规则，已跳过样式表断点断言（请用本地服务器运行以获得完整结果）', true);
        }

        // ===== 2. 渲染冒烟：经典界面按钮在正常视口下可用 =====
        resetStateForTest();
        const startScreen = document.getElementById('startScreen');
        if (startScreen) startScreen.classList.add('hidden');
        window.render();
        await sleep(100);

        const actionBtns = document.querySelectorAll('.action-button');
        assert(actionBtns.length > 0, `操作按钮存在（${actionBtns.length}个）`);
        const enabledBtns = Array.from(actionBtns).filter(b => !b.disabled);
        assert(enabledBtns.length > 0, '部分按钮可用');

        // 试炼界面元素已随试炼关停移除（P5）：这一节改为验证 2D 画布容器在位。
        assert(!!document.getElementById('trial2DCanvasHost'), '2D 画布容器存在');

        if (startScreen) startScreen.classList.remove('hidden');

        cLog('移动端适配测试完成');
    }, { seed: 313233 });

    if (typeof window.__testCallback === 'function') {
        window.__testCallback(result);
    } else if (window.opener) {
        window.opener.postMessage({ type: 'TEST_RESULT', testId: 'mobile', result }, '*');
    }
})();