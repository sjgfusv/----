/* P2-D：修两处真 bug
 *   ① 宿主 onRoom 改用引擎给的「列号」定位房间（同名房间连排时会认错）
 *   ② 引擎 notifyCheckpoint / notifyRoomAction 改成 bridge 与事件二选一（双发会做两遍）
 */
const fs = require('fs');
const path = require('path');
let fails = 0;

function patch(file, rules, crlf) {
  const F = path.join(__dirname, '..', file);
  let s = fs.readFileSync(F, 'utf8');
  console.log('=== ' + file + ' ===');
  for (const [label, from, to, expect] of rules) {
    const f = crlf ? from.split('\n').join('\r\n') : from;
    const t = crlf ? to.split('\n').join('\r\n') : to;
    const n = s.split(f).length - 1;
    const want = (expect == null) ? 1 : expect;
    if (n !== want) { console.log('!! ' + label + ' 命中 ' + n + '（期望 ' + want + '）'); fails++; continue; }
    s = s.split(f).join(t);
    console.log('ok ' + label);
  }
  fs.writeFileSync(F, s);
}

/* ---- 宿主：用列号定位 ---- */
patch('经典2D.js', [
  ['onRoom 列号定位',
`    var type = (p && p.type) || 'enemy';
    s.currentRoom = { type: type };
    // 引擎的房间顺序就是内核的房间顺序（planFromRooms 全权控制），按类型找最近的下标。
    // 从当前下标往后找：同名房间（一层里可能出现两次）不会被前面的那个抢走。
    var idx = -1;
    for (var i = 0; i < (s.rooms || []).length; i++) {
      if (s.rooms[i] && s.rooms[i].type === type && i >= (s.roomIndex || 0)) { idx = i; break; }
    }
    if (idx >= 0) s.roomIndex = idx;
    log('进房 ' + type + ' → 内核 roomIndex=' + s.roomIndex);`,
`    var type = (p && p.type) || 'enemy';
    s.currentRoom = { type: type };
    // 房间下标用引擎给的**列号**定位：宿主用 planFromRooms 把每间房单独放一列，
    // 于是 col 严格等于内核的房间下标（一一对应）。
    // ⚠️ 早先是"按类型 + 从当前下标往后找"，一层里出现两个同类型房间时会把后一个
    //    认成前一个（实测 rest 连排时中招：第 4 间被记成第 3 间），所以不能再用它做主判据。
    var col = (p && p.room && typeof p.room.col === 'number') ? p.room.col : -1;
    if (col >= 0 && col < (s.rooms || []).length) {
      s.roomIndex = col;
    } else {
      for (var i = 0; i < (s.rooms || []).length; i++) {
        if (s.rooms[i] && s.rooms[i].type === type && i >= (s.roomIndex || 0)) { s.roomIndex = i; break; }
      }
    }
    log('进房 ' + type + ' · 第 ' + (s.roomIndex + 1) + '/' + (s.rooms || []).length + ' 间');`]
], false);

/* ---- 引擎：bridge 与事件二选一 ---- */
patch('战斗2D.js', [
  ['notifyCheckpoint 二选一',
`    /** 把快照交给宿主落盘（宿主没接 bridge 就只是不发，不影响本局） */
    notifyCheckpoint(reason) {
      var snap = this.checkpointState(reason);
      this.emitRt('rt:checkpoint', snap);
      if (!hasBridge('checkpoint')) return false;
      callBridge('checkpoint', snap);
      return true;
    }`,
`    /**
     * 把快照交给宿主落盘
     * ⚠️ bridge 与事件**二选一**：两个都发会让"既接 bridge 又监听事件"的宿主收到两次
     *    （实测表现为同一处存档连写两遍）。
     */
    notifyCheckpoint(reason) {
      var snap = this.checkpointState(reason);
      if (hasBridge('checkpoint')) { callBridge('checkpoint', snap); return true; }
      return this.emitRt('rt:checkpoint', snap);
    }`],

  ['notifyRoomAction 二选一',
`      this.emitRt('rt:room-action', payload);
      if (hasBridge('roomAction')) { callBridge('roomAction', payload); return true; }
      // 宿主没接：至少给个可见反馈，不让玩家以为卡住
      this.showCenter('这里还没有人打理（宿主未接入）', '#ffd76a');
      this.finishRoomGoal();
      return false;`,
`      // 同 notifyCheckpoint：bridge 与事件二选一。
      // 两个都发的话，接了 bridge 的宿主会把画内面板开两遍（第二次先关再开，白闪一下）。
      if (hasBridge('roomAction')) { callBridge('roomAction', payload); return true; }
      if (this.emitRt('rt:room-action', payload)) return true;
      // 谁都没接：给个可见反馈，别让玩家以为卡住了
      this.showCenter('这里还没有人打理（宿主未接入）', '#ffd76a');
      this.finishRoomGoal();
      return false;`]
], true);

console.log(fails ? '\n有 ' + fails + ' 条未命中' : '\n全部命中');
