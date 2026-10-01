/* P2-C：给宿主加决策日志 + onRoomCleared 改用引擎权威房型
 * 用法：node 其他/_p2c.js  （经典2D.js 是 LF）
 */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '经典2D.js');
let s = fs.readFileSync(F, 'utf8');
let fails = 0;
function rep(label, from, to, expect) {
  const n = s.split(from).length - 1;
  const want = (expect == null) ? 1 : expect;
  if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; return; }
  s = s.split(from).join(to);
  console.log('ok ' + label);
}

/* 1) onRoom 加日志（进房时把内核索引也打出来，便于对账） */
rep('onRoom 日志',
`  function onRoom(p) {
    var s = S();
    if (!s) return;
    var type = (p && p.type) || 'enemy';
    s.currentRoom = { type: type };
    // 引擎的房间顺序就是内核的房间顺序（planFromRooms 全权控制），按类型找最近的下标
    var idx = -1;
    for (var i = 0; i < (s.rooms || []).length; i++) {
      if (s.rooms[i] && s.rooms[i].type === type && i >= (s.roomIndex || 0)) { idx = i; break; }
    }
    if (idx >= 0) s.roomIndex = idx;`,
`  function onRoom(p) {
    var s = S();
    if (!s) return;
    var type = (p && p.type) || 'enemy';
    s.currentRoom = { type: type };
    // 引擎的房间顺序就是内核的房间顺序（planFromRooms 全权控制），按类型找最近的下标。
    // 从当前下标往后找：同名房间（一层里可能出现两次）不会被前面的那个抢走。
    var idx = -1;
    for (var i = 0; i < (s.rooms || []).length; i++) {
      if (s.rooms[i] && s.rooms[i].type === type && i >= (s.roomIndex || 0)) { idx = i; break; }
    }
    if (idx >= 0) s.roomIndex = idx;
    log('进房 ' + type + ' → 内核 roomIndex=' + s.roomIndex);`);

/* 2) onRoomCleared：房型以引擎的权威载荷为准 + 打日志 */
rep('onRoomCleared 房型权威化',
`  function onRoomCleared(p) {
    var s = S(), e = engine();
    if (!s) return;
    if (p && typeof p.hp === 'number') syncHp(p.hp);
    settleRoomGold((p && p.roomType) || (s.currentRoom && s.currentRoom.type) || 'enemy');
    if (s.gameOver) return;
    if (isCombatRoom(s.currentRoom && s.currentRoom.type)) openRewardPanel();
    else if (e && e.setPoints) e.setPoints(s.player.gold);
  }`,
`  function onRoomCleared(p) {
    var s = S(), e = engine();
    if (!s) return;
    if (p && typeof p.hp === 'number') syncHp(p.hp);
    // ⚠️ 房型一律以**引擎载荷**为准（p.roomType 来自引擎的 roomNode），
    //    不要信 s.currentRoom —— 它是宿主在 rt:room 里镜像出来的，
    //    遇到"引擎换了房而宿主还没收到 rt:room"的时序就会错，表现为该弹结算的房间
    //    错弹成奖励三选一（实测踩过）。
    var roomType = (p && p.roomType) || (s.currentRoom && s.currentRoom.type) || 'enemy';
    settleRoomGold(roomType);
    if (s.gameOver) return;
    var combat = isCombatRoom(roomType);
    log('清房 ' + roomType + ' → ' + (combat ? '弹奖励三选一' : '非战斗房，直接放行') +
        '（引擎 roomNode=' + roomType + '，宿主镜像=' + (s.currentRoom && s.currentRoom.type) + '）');
    if (combat) openRewardPanel();
    else if (e && e.setPoints) e.setPoints(s.player.gold);
  }`);

/* 3) onRoomAction 也打一行 */
rep('onRoomAction 日志',
`    var kind = (p && p.kind) || (s.currentRoom && s.currentRoom.type) || 'event';
    if (kind === 'shop') openShopPanel();`,
`    var kind = (p && p.kind) || (s.currentRoom && s.currentRoom.type) || 'event';
    log('房间交互 ' + kind);
    if (kind === 'shop') openShopPanel();`);

fs.writeFileSync(F, s);
console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
