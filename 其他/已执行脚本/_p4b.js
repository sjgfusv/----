/* P4-1b：作弊面板 UI 改造
 *   HTML：删掉「试炼修改 / 永久解锁修改」两块，换成「实时战斗」区
 *   JS  ：加实时战斗区的绑定与处理（全部委托给 经典2D.cheat）
 * 用法：node 其他/_p4b.js
 */
const fs = require('fs');
const path = require('path');
const CRLF = '\r\n';
let fails = 0;

/* ================= HTML ================= */
{
  const F = path.join(__dirname, '..', '主界面.html');
  let s = fs.readFileSync(F, 'utf8');
  const a = s.indexOf('          <!-- 试炼修改 -->');
  const b = s.indexOf('          <!-- 关闭按钮 -->');
  if (a < 0 || b < 0 || b <= a) { console.log('!! HTML 区块定位失败 a=' + a + ' b=' + b); fails++; }
  else {
    const nl = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    const block = [
      '          <!-- 实时战斗（P4：替代原「试炼修改 / 永久解锁修改」两块） -->',
      '          <div class="cheat-section">',
      '            <h4 class="cheat-section-title">实时战斗</h4>',
      '            <div class="cheat-stats-grid">',
      '              <div class="cheat-stat-item"><label>生命</label><input id="cheatRtHp" type="number" min="0"></div>',
      '              <div class="cheat-stat-item"><label>生命上限</label><input id="cheatRtMaxHp" type="number" min="1"></div>',
      '              <div class="cheat-stat-item"><label>护盾</label><input id="cheatRtShield" type="number" min="0"></div>',
      '              <div class="cheat-stat-item"><label>攻击</label><input id="cheatRtAttack" type="number" min="1"></div>',
      '              <div class="cheat-stat-item" style="grid-column: span 2;">',
      '                <label>添加遗物（英文 id 或中文名，多个用逗号分隔）</label>',
      '                <input id="cheatRtRelicInput" type="text" placeholder="例如：immortalTotem,猎杀标记">',
      '              </div>',
      '              <div class="cheat-stat-item" style="grid-column: span 2;">',
      '                <label>添加诅咒（多个用逗号分隔）</label>',
      '                <input id="cheatRtCurseInput" type="text" placeholder="例如：脆弱,生命流失">',
      '              </div>',
      '              <div class="cheat-stat-item"><label>跳层</label><input id="cheatRtFloor" type="number" min="1" max="999"></div>',
      '              <div class="cheat-stat-item"><label>跳房（序号从 0 起）</label><input id="cheatRtRoom" type="number" min="0"></div>',
      '              <div class="cheat-stat-item" style="grid-column: span 2; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">',
      '                <label style="display:flex; align-items:center; gap:6px; margin:0;">',
      '                  <input id="cheatRtGod" type="checkbox" style="width:auto;"> 无敌',
      '                </label>',
      '                <button id="cheatRtApply" class="cheat-apply-btn">应用</button>',
      '                <button id="cheatRtClearCurses" class="cheat-apply-btn" style="background:var(--danger);">清除所有诅咒</button>',
      '              </div>',
      '            </div>',
      '          </div>',
      ''
    ].join(nl);
    s = s.slice(0, a) + block + s.slice(b);
    fs.writeFileSync(F, s);
    console.log('ok HTML 作弊面板已换成「实时战斗」区');
  }
}

/* ================= 主程序.js ================= */
{
  const F = path.join(__dirname, '..', '主程序.js');
  let s = fs.readFileSync(F, 'utf8');
  const from = [
    '  // 重置永久修改按钮',
    "  const resetPermBtn = document.getElementById('cheatResetPerm');",
    '  if (resetPermBtn) {',
    '    const newBtn = resetPermBtn.cloneNode(true);',
    '    resetPermBtn.parentNode.replaceChild(newBtn, resetPermBtn);',
    "    newBtn.addEventListener('click', resetCheatPerm);",
    '  }',
    '}'
  ].join(CRLF);
  const to = [
    '  // 重置永久修改按钮（元素已在 P4 移除 → 这里的 if 会静默跳过，留着不碍事）',
    "  const resetPermBtn = document.getElementById('cheatResetPerm');",
    '  if (resetPermBtn) {',
    '    const newBtn = resetPermBtn.cloneNode(true);',
    '    resetPermBtn.parentNode.replaceChild(newBtn, resetPermBtn);',
    "    newBtn.addEventListener('click', resetCheatPerm);",
    '  }',
    '',
    '  // ===== 实时战斗区（P4：替代原「试炼修改 / 永久解锁修改」两块）=====',
    '  bindCheatRealtimeEvents();',
    '}',
    '',
    '/**',
    ' * 实时战斗区的绑定（P4）',
    ' * 全部委托给宿主的 window.经典2D.cheat —— 内核不直接碰 2D 引擎的内部状态，',
    ' * 这样"哪些作弊项在实时模式下真的有效"只有一处实现，不会两边漂移。',
    ' */',
    'function bindCheatRealtimeEvents() {',
    '  function rb(id, ev, fn) {',
    '    const el = document.getElementById(id);',
    '    if (!el) return;',
    '    const nl = el.cloneNode(true);',
    '    el.parentNode.replaceChild(nl, el);',
    "    nl.addEventListener(ev, fn);",
    '  }',
    "  rb('cheatRtApply', 'click', applyCheatRealtime);",
    "  rb('cheatRtClearCurses', 'click', function () {",
    '    const c = realtimeCheat();',
    '    if (!c) return;',
    '    c.clearCurses();',
    "    addLog('（作弊）已清除所有诅咒');",
    '    renderLog();',
    "    showToast('已清除所有诅咒');",
    '  });',
    "  rb('cheatRtGod', 'change', function () {",
    '    const c = realtimeCheat();',
    '    if (!c) return;',
    '    const on = c.god(this.checked);',
    "    addLog('（作弊）无敌：' + (on ? '开' : '关'));",
    '    renderLog();',
    '  });',
    '}',
    '',
    '/** 取宿主的实时战斗接口；不在实时模式时给一句明确提示，而不是静默无效 */',
    'function realtimeCheat() {',
    '  if (window.经典2D && window.经典2D.cheat) return window.经典2D.cheat;',
    "  showToast('实时战斗尚未启动（当前是回合制界面）');",
    '  return null;',
    '}',
    '',
    '/** 应用实时战斗区的改动 */',
    'function applyCheatRealtime() {',
    '  const c = realtimeCheat();',
    '  if (!c) return;',
    '  const num = (id) => {',
    '    const el = document.getElementById(id);',
    "    if (!el || el.value === '') return null;",
    '    const v = Number(el.value);',
    '    return isFinite(v) ? v : null;',
    '  };',
    "  const hp = num('cheatRtHp');",
    "  const maxHp = num('cheatRtMaxHp');",
    "  const shield = num('cheatRtShield');",
    "  const attack = num('cheatRtAttack');",
    "  const floor = num('cheatRtFloor');",
    "  const room = num('cheatRtRoom');",
    '  // 先提上限再设当前值，否则「把血设成 999」会被旧上限截掉',
    '  if (maxHp != null) c.setMaxHp(maxHp);',
    '  if (hp != null) c.setHp(hp);',
    '  if (shield != null) c.setShield(shield);',
    '  if (attack != null) c.setAttack(attack);',
    "  const relicInput = document.getElementById('cheatRtRelicInput');",
    '  if (relicInput && relicInput.value.trim()) {',
    '    const names = relicInput.value.split(/[，,;；|]/).map(x => x.trim()).filter(Boolean);',
    '    let ok = 0;',
    '    names.forEach(n => { if (c.addRelic(n)) ok += 1; });',
    '    addLog(`（作弊）添加遗物 ${ok}/${names.length} 件`);',
    '  }',
    "  const curseInput = document.getElementById('cheatRtCurseInput');",
    '  if (curseInput && curseInput.value.trim()) {',
    '    const names = curseInput.value.split(/[，,;；|]/).map(x => x.trim()).filter(Boolean);',
    '    let ok = 0;',
    '    names.forEach(n => { if (c.addCurse(n)) ok += 1; });',
    '    addLog(`（作弊）添加诅咒 ${ok}/${names.length} 条`);',
    '  }',
    '  if (floor != null) c.gotoFloor(floor);',
    '  if (room != null) c.gotoRoom(room);',
    '  renderLog();',
    '  render();',
    '  saveGame();',
    "  showToast('实时战斗改动已应用');",
    '}'
  ].join(CRLF);
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! JS 锚点命中 ' + n); fails++; }
  else {
    fs.writeFileSync(F, s.split(from).join(to));
    console.log('ok JS 实时战斗区处理已接入');
  }
}

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
