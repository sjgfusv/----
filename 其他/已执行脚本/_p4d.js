/* P4-2b：修 curse / relic 命令的多值切分
 * 开发者命令行按空格切参数，用户写「curse 脆弱,生命流失」时整段是一个参数，
 * 必须再按逗号拆一次（与作弊面板的输入框行为保持一致）。
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主程序.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(label, from, to) {
  const f = from.split('\n').join(CRLF);
  const t = to.split('\n').join(CRLF);
  const n = s.split(f).length - 1;
  if (n !== 1) { console.log('!! ' + label + ' 命中 ' + n); fails++; return; }
  s = s.split(f).join(t);
  console.log('ok ' + label);
}

rep('relic 支持多值',
`    if (!args.length) return devLog('用法: relic <id|中文名>，例如 relic 猎杀标记');
    const ok = c.addRelic(args.join(' '));
    devLog(ok ? \`已获得遗物：\${args.join(' ')}\` : \`没找到这件遗物：\${args.join(' ')}\`);`,
`    if (!args.length) return devLog('用法: relic <id|中文名>，多个用逗号分隔');
    // 命令行按空格切参数，所以「relic A,B」到这里是一整段 —— 再按逗号拆一次
    const names = args.join(' ').split(/[，,;；|]/).map(x => x.trim()).filter(Boolean);
    let ok = 0;
    names.forEach(n => { if (c.addRelic(n)) ok += 1; });
    devLog(\`已获得 \${ok}/\${names.length} 件遗物\` + (ok ? '' : '（检查名称是否正确）'));`);

rep('curse 支持多值',
`    if (args[0] === 'clear') { c.clearCurses(); return devLog('已清除所有诅咒'); }
    let ok = 0;
    args.forEach(n => { if (c.addCurse(n)) ok += 1; });
    devLog(\`已施加 \${ok}/\${args.length} 条诅咒（表外名字会被忽略）\`);`,
`    if (args[0] === 'clear') { c.clearCurses(); return devLog('已清除所有诅咒'); }
    const names = args.join(' ').split(/[，,;；|]/).map(x => x.trim()).filter(Boolean);
    let ok = 0;
    names.forEach(n => { if (c.addCurse(n)) ok += 1; });
    devLog(\`已施加 \${ok}/\${names.length} 条诅咒（表外名字会被忽略）\`);`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
