/* P5-1d（第二版）：按规则块逐条删「纯试炼文字界面」的 CSS
 *   上一版按起止位置整段切，被安全检查拦住（区间内含 @media）。
 *   这一版改成**逐块解析**：
 *     · 跳过注释（注释里可能有 { } ）
 *     · 普通规则：选择器含 .trial- 且**不含** .trial2d- / .t2d- / body.realtime-trial → 删
 *     · @media / @supports：递归处理内部；内部空了才整体删
 *     · @keyframes / @font-face 等：一律保留（宁可少删，不动画与字体）
 * 用法：node 其他/_p5i.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主样式.css');
const BAK = path.join(__dirname, '备份');

function isTrialOnly(sel) {
  if (sel.indexOf('.trial2d-') >= 0) return false;
  if (sel.indexOf('.t2d-') >= 0) return false;
  if (sel.indexOf('body.realtime-trial') >= 0) return false;
  // 必须真的含试炼文字的类名（.trial-xxx），且不是别的 .trial 前缀
  return /\.trial-[a-z]/.test(sel);
}

let removed = 0;
function processCss(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    // 注释原样保留
    if (css[i] === '/' && css[i + 1] === '*') {
      const e = css.indexOf('*/', i + 2);
      if (e < 0) { out += css.slice(i); break; }
      out += css.slice(i, e + 2);
      i = e + 2;
      continue;
    }
    const braceStart = css.indexOf('{', i);
    if (braceStart < 0) { out += css.slice(i); break; }
    // 找配对的大括号
    let depth = 1, j = braceStart + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    }
    const selector = css.slice(i, braceStart);
    const body = css.slice(braceStart + 1, j - 1);
    const sel = selector.replace(/\/\*[\s\S]*?\*\//g, "").trim();

    if (/^@(media|supports)\b/.test(sel)) {
      const inner = processCss(body);
      if (inner.trim() === '') { removed++; }            // 内部全删光 → 整块去掉
      else out += selector + '{' + inner + '}';
    } else if (sel.charAt(0) === '@') {
      out += css.slice(i, j);                             // @keyframes / @font-face：原样保留
    } else if (isTrialOnly(sel)) {
      removed++;                                          // 删掉纯试炼规则
    } else {
      out += css.slice(i, j);
    }
    i = j;
  }
  return out;
}

let s = fs.readFileSync(F, 'utf8');
const before = s.length;
const beforeLines = s.split('\n').length;
const result = processCss(s);

if (result.length > before) { console.log('!! 结果比原文还长，中止'); process.exit(1); }

if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
fs.writeFileSync(path.join(BAK, '主样式.css.' + stamp + '.bak'), s);
console.log('已备份 → 主样式.css.' + stamp + '.bak');

fs.writeFileSync(F, result);
console.log('ok 删掉 ' + removed + ' 条纯试炼规则；' +
  beforeLines + ' 行 → ' + result.split('\n').length + ' 行');
