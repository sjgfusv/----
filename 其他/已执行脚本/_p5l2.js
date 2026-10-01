/* P5-3b（第二版）：按行号删除 3 个混合测试里的试炼段落
 * 上一版用内容锚点，因为段落里含模板字符串（反引号 + ${}）转义对不上，3 条全没命中。
 * 行号是实测读出来的，直接按行删更可靠。
 * 用法：node 其他/_p5l2.js
 */
const fs = require('fs');
const path = require('path');
const BAK = path.join(__dirname, '备份');
if (!fs.existsSync(BAK)) fs.mkdirSync(BAK, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/* 行号均为 1-based、闭区间；注释行会替换掉第一行 */
const JOBS = [
  { file: '增益测试.js', from: 51, to: 69,
    note: '    // 试炼已关停（P5）：原先这里还有一段「增益在试炼里被复制」的验证，随试炼一并移除。' },
  { file: '英雄多样性测试.js', from: 128, to: 143,
    note: '            // 试炼已关停（P5）：原先这里还有一段「该英雄在试炼里是否就位」的验证，随试炼一并移除。' },
  { file: '商品测试.js', from: 90, to: 126,
    note: '    // 试炼商店测试已随试炼关停移除（P5）：新版只有一个商店（2D 画内），' }
];

let fails = 0;
JOBS.forEach(function (job) {
  const F = path.join(__dirname, '..', '测试', job.file);
  let s = fs.readFileSync(F, 'utf8');
  const nl = (s.match(/\r\n/g) || []).length > (s.match(/\n/g) || []).length ? '\r\n' : '\n';
  const lines = s.split(nl);

  // 校验边界（避免行号漂移后误删）
  const head = (lines[job.from - 1] || '').trim();
  const tail = (lines[job.to - 1] || '').trim();
  if (!/试炼|Trial|state\.trial|trialShop/.test(head)) {
    console.log('!! ' + job.file + ' 起始行不像试炼段落：' + head.slice(0, 50)); fails++; return;
  }
  if (!/^[}\])]|assert\(|closeTrialShop/.test(tail)) {
    console.log('!! ' + job.file + ' 结束行不像段落收尾：' + tail.slice(0, 50)); fails++; return;
  }

  fs.writeFileSync(path.join(BAK, job.file + '.' + stamp + '.bak'), s);
  const out = lines.slice(0, job.from - 1).concat([job.note]).concat(lines.slice(job.to));
  fs.writeFileSync(F, out.join(nl));
  console.log('ok ' + job.file + '：删 ' + (job.to - job.from + 1) + ' 行（' + head.slice(0, 24) + ' …）');
});

console.log(fails ? '\n有 ' + fails + ' 个未完成' : '\n全部完成');
