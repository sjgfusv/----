/* 主程序.js 是 CRLF —— 多行锚点必须带上 \r\n，否则永远匹配不到（上一版就栽在这） */
const fs = require('fs');
const F = 'D:\\深渊回廊\\主程序.js';
let s = fs.readFileSync(F, 'utf8');

const from = [
  `        if (state._sessionId && state._sessionId !== window._sessionId) {`,
  `          showToast('⚠️ 此存档曾被其他页面/标签页修改过，可能存在进度覆盖');`,
  `        }`,
].join('\r\n');

const to = [
  `        if (state._sessionId && state._sessionId !== window._sessionId) {`,
  `          // 选英雄 / 选增益阶段，画布面板几乎占满屏，而 toast 层压在画布上面 ——`,
  `          // 这条警告会正好糊在卡片上。交给宿主延后到开打后再弹（见 经典2D.js 的 deferToast）。`,
  `          const conflictWarn = '⚠️ 此存档曾被其他页面/标签页修改过，可能存在进度覆盖';`,
  `          const deferred = window.经典2D && typeof window.经典2D.deferToast === 'function'`,
  `            && window.经典2D.deferToast(conflictWarn);`,
  `          if (!deferred) showToast(conflictWarn);`,
  `        }`,
].join('\r\n');

const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 命中 ' + n + ' 次，未写入'); process.exit(1); }
s = s.split(from).join(to);
fs.writeFileSync(F, s);

// 复核：CRLF 没有被破坏
const after = fs.readFileSync(F, 'utf8');
console.log('ok 已写入 · CRLF=' + (after.match(/\r\n/g) || []).length +
  ' 裸LF=' + (after.match(/(?<!\r)\n/g) || []).length);
