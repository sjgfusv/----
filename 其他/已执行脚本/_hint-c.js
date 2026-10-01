/* ① 延后队列保留 toast 类型 ② "已继承 2.6 存档"也走同一个让路机制
   注意：主程序.js 是 CRLF，多行锚点必须带 \r\n；
   锚点里含模板字符串，所以一律用数组 join 拼，避免 ${} 被提前求值。 */
const fs = require('fs');
let fails = 0;
const L = (arr) => arr.join('\n');
function nl(s, crlf) { return crlf ? s.split('\n').join('\r\n') : s; }
function patch(file, reps, crlf) {
  let s = fs.readFileSync(file, 'utf8');
  reps.forEach(function (r) {
    const from = nl(L(r[0]), crlf), to = nl(L(r[1]), crlf);
    const n = s.split(from).length - 1;
    if (n !== 1) { console.log('!! ' + r[2] + ' 命中 ' + n + ' @' + file.split('\\').pop()); fails++; return; }
    s = s.split(from).join(to);
    console.log('ok ' + r[2]);
  });
  if (crlf) {
    const bare = (s.match(/(?<!\r)\n/g) || []).length;
    if (bare) { console.log('!! 写入前发现 ' + bare + ' 个裸 LF，已中止'); fails++; return; }
  }
  fs.writeFileSync(file, s);
}

patch('D:\\深渊回廊\\经典2D.js', [
  [[
    '  function deferToast(msg) {',
    '    var s = S();',
    '    if (!s) return false;',
    "    if (s.mode !== 'heroSelect' && s.mode !== 'bonusSelect') return false;",
    '    if (!booted) return false;                 // 画布没起来 → 让内核照常弹',
    '    pendingToasts.push(String(msg));',
    '    if (pendingToasts.length > 4) pendingToasts.shift();   // 只留最近几条，别无限堆',
  ], [
    '  function deferToast(msg, type) {',
    '    var s = S();',
    '    if (!s) return false;',
    "    if (s.mode !== 'heroSelect' && s.mode !== 'bonusSelect') return false;",
    '    if (!booted) return false;                 // 画布没起来 → 让内核照常弹',
    '    // 类型一起留着：info 之类的样式不能丢，否则补弹出来和原来长得不一样',
    '    pendingToasts.push({ msg: String(msg), type: type || null });',
    '    if (pendingToasts.length > 4) pendingToasts.shift();   // 只留最近几条，别无限堆',
  ], 'deferToast 带类型'],

  [[
    '    for (var i = 0; i < list.length; i++) {',
    '      try { k.showToast(list[i]); } catch (e) { /* 忽略 */ }',
    '    }',
  ], [
    '    for (var i = 0; i < list.length; i++) {',
    '      var it = list[i];',
    '      try { k.showToast(it.msg, it.type || undefined); } catch (e) { /* 忽略 */ }',
    '    }',
  ], 'flush 传类型'],
], false);

patch('D:\\深渊回廊\\主程序.js', [
  [[
    '    setTimeout(() => {',
    "      showToast(`📂 已继承 2.6 存档（${NS_INHERITED_KEYS} 项）· 新版与老版进度各自独立`, 'info');",
    '    }, 700);',
  ], [
    '    setTimeout(() => {',
    '      // 同样避开「选英雄」画内面板：这条 700ms 后弹，正好落在面板刚开出来的时候',
    '      const inheritMsg = `📂 已继承 2.6 存档（${NS_INHERITED_KEYS} 项）· 新版与老版进度各自独立`;',
    "      const inheritedDeferred = window.经典2D && typeof window.经典2D.deferToast === 'function'",
    "        && window.经典2D.deferToast(inheritMsg, 'info');",
    '      if (!inheritedDeferred) showToast(inheritMsg, \'info\');',
    '    }, 700);',
  ], '继承存档 toast 让路'],
], true);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
