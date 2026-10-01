/* P5-1b 第一步：给 state.trial.active 加可选链（纯防御性，行为不变）
 * 为什么先做这步：主程序里有 12 处**无守卫**的 state.trial.active 直接访问，
 * 一旦删掉 state.trial 定义就会抛 Cannot read properties of undefined。
 * 先加可选链 → 删定义时才安全。这一步不改变任何现有行为
 *（state.trial 一直存在，?. 只在它为 null/undefined 时才起作用）。
 * 用法：node 其他/_p5b.js
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '主程序.js');
let s = fs.readFileSync(F, 'utf8');

// 排除赋值（state.trial.active = ...）：那是在写，不能加可选链
const re = /state\.trial\.active(?!\s*=)/g;
const before = (s.match(re) || []).length;
s = s.replace(re, 'state.trial?.active');
const after = (s.match(/state\.trial\.active(?!\s*=)/g) || []).length;

fs.writeFileSync(F, s);
console.log('已改为可选链：' + before + ' 处；剩余无守卫的：' + after);
console.log('（赋值形式的 state.trial.active = 保持不变，共 ' + (s.match(/state\.trial\.active\s*=/g) || []).length + ' 处）');
