/* P2-B：把 Scene.rebuildFloorMap 暴露到引擎 API */
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', '战斗2D.js');
const CRLF = '\r\n';
let s = fs.readFileSync(F, 'utf8');

const from = [
  '    /** 楼层 / 房间序列由宿主决定（写法见 Scene.floorMapFromPlan）；传 null 恢复内置自造地图 */',
  '    setFloorPlan: function (plan) {'
].join(CRLF);
const to = [
  '    /** 换层后按新下发的规划重取本层地图（时序说明见 Scene.rebuildFloorMap） */',
  '    rebuildFloorMap: function () {',
  '      var s = state.scene;',
  '      if (!s || !s.ready) return false;',
  '      return s.rebuildFloorMap();',
  '    },',
  '',
  '    /** 楼层 / 房间序列由宿主决定（写法见 Scene.floorMapFromPlan）；传 null 恢复内置自造地图 */',
  '    setFloorPlan: function (plan) {'
].join(CRLF);

const n = s.split(from).length - 1;
if (n !== 1) { console.log('!! 锚点命中 ' + n + ' 次'); process.exit(1); }
fs.writeFileSync(F, s.split(from).join(to));
console.log('ok API.rebuildFloorMap 已暴露');
