/* P5-3b（第三版）：遗物测试段落 + 移动端测试的试炼断言 + 测试面板条目标注 */
const fs = require('fs');
const path = require('path');
const BAK = path.join(__dirname, '备份');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
let fails = 0;

/* ① 遗物测试.js：删第三部分（128-159，按行号 + 边界校验） */
{
  const F = path.join(__dirname, '..', '测试', '遗物测试.js');
  let s = fs.readFileSync(F, 'utf8');
  const nl = (s.match(/\r\n/g) || []).length > (s.match(/\n/g) || []).length ? '\r\n' : '\n';
  const lines = s.split(nl);
  const head = (lines[127] || '').trim();
  const tail = (lines[158] || '').trim();
  if (head.indexOf('第三部分') < 0 || tail.indexOf('试炼未能启动') < 0) {
    console.log('!! 遗物测试边界不符：' + head.slice(0, 40) + ' / ' + tail.slice(0, 40)); fails++;
  } else {
    fs.writeFileSync(path.join(BAK, '遗物测试.js.' + stamp + '.bak'), s);
    const note = '        cLog("========== 第三部分：试炼遗物解锁注入（已随试炼关停移除）==========");';
    const out = lines.slice(0, 127).concat([note]).concat(lines.slice(159));
    fs.writeFileSync(F, out.join(nl));
    console.log('ok 遗物测试.js：删 32 行（第三部分：试炼遗物解锁注入）');
  }
}

/* ② 移动端适配测试.js：删「试炼界面元素存在性」3 行（纯文本锚点，无模板串） */
{
  const F = path.join(__dirname, '..', '测试', '移动端适配测试.js');
  let s = fs.readFileSync(F, 'utf8');
  const nl = (s.match(/\r\n/g) || []).length > (s.match(/\n/g) || []).length ? '\r\n' : '\n';
  const from = [
    '        // ===== 3. 试炼界面元素存在性 =====',
    "        assert(!!document.getElementById('trialScreen'), '试炼界面元素存在');",
    "        assert(!!document.getElementById('trialShopItems'), '试炼商店容器存在');"
  ].join(nl);
  const to = '        // 试炼界面元素已随试炼关停移除（P5）：这一节改为验证 2D 画布容器在位。\n' +
    "        assert(!!document.getElementById('trial2DCanvasHost'), '2D 画布容器存在');";
  const n = s.split(from).length - 1;
  if (n !== 1) { console.log('!! 移动端测试锚点命中 ' + n); fails++; }
  else {
    fs.writeFileSync(path.join(BAK, '移动端适配测试.js.' + stamp + '.bak'), s);
    fs.writeFileSync(F, s.split(from).join(to.split('\n').join(nl)));
    console.log('ok 移动端适配测试.js：试炼元素断言 → 2D 画布容器断言');
  }
}

/* ③ 测试面板：3 个已删除的试炼测试条目改标注（保留条目、指向老版） */
{
  const F = path.join(__dirname, '..', '测试', '测试面板.html');
  let s = fs.readFileSync(F, 'utf8');
  const pairs = [
    ["name: '试炼界面测试（老版专属）'", "name: '试炼界面测试（已迁至老版）'"],
    ["name: '试炼商店同步测试（老版专属）'", "name: '试炼商店同步测试（已迁至老版）'"],
    ["name: '诅咒测试（老版专属）'", "name: '诅咒测试（已迁至老版）'"]
  ];
  let hit = 0;
  pairs.forEach(function (p) { if (s.indexOf(p[0]) >= 0) { s = s.split(p[0]).join(p[1]); hit++; } });
  fs.writeFileSync(F, s);
  console.log('ok 测试面板：' + hit + '/3 个条目改标注（文件已从新版移除，指向 老版2.6/测试/）');
}

console.log(fails ? '\n有 ' + fails + ' 条未完成' : '\n全部完成');
