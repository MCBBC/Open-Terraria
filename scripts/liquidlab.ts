// 液体浸润实验台:?liquidlab URL 参数 / window.__swLiquidLab() 控制台命令
// 在玩家附近生成测试区:各类方块以不同方位邻接【封闭水腔】(水不会流走),
// 用户开 F5 标注哪些位置仍有缝隙。
//
// 每个场景是一个密封水腔,测试方块是腔壁的一部分:
//   A 左右夹水:  [围]水[块块]水[围]     ← 测试块的左右两缘
//   B 上方有水:  [围][水水][围] / [块块]  ← 测试块的上缘
//   C 下方有水:  [块块] / [围][水水][围]  ← 测试块的下缘
//   D 右侧有水:  [块块][水水][围]        ← 测试块的右缘
//   E 左侧有水:  [围][水水][块块]        ← 测试块的左缘
// "围"=石块外壳(防漏),水腔除贴测试方块的面外全封闭。
// 每行两列:左=无墙(浸润应可见),右=有背景墙(原版行为对照)。
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const S = () => TILE_BY_KEY['stone']; // 外壳石块
const L = 255; // 满水

export function setupLiquidLab(game: import('../src/core/Game').Game): void {
  const st = game.world.store;
  const p = game.player;
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);

  // 每个水腔 3×2 内空间(内 2×2 水)+ 1 格外壳 = 5×4 格;场景间隔 2 格
  const CELL_W = 5, CELL_H = 4, GAP = 2;
  // 5 个场景一排,无墙/有墙两列 = 10 格位
  const COLS = 10;
  const ROWS = 8; // 8 种方块
  const W = COLS * (CELL_W + GAP) + 4;
  const H = ROWS * (CELL_H + GAP) + 4;
  const x0 = px - Math.floor(W / 2), y0 = py - H + 2;

  // 全区清空 + 外壳底板
  for (let x = x0 - 2; x < x0 + W + 2; x++) {
    for (let y = y0 - 2; y < y0 + H + 2; y++) {
      if (!st.inBounds(x, y)) continue;
      st.setTile(x, y, 0);
      st.setLiquid(x, y, 0, 0);
      st.setWall(x, y, 0);
    }
  }
  // 测试区外壳:底板 + 左右壁 + 顶板(防全区域水外泄)
  for (let x = x0 - 2; x < x0 + W + 2; x++) {
    st.setTile(x, y0 + H + 1, S());
    st.setTile(x, y0 - 2, S());
  }
  for (let y = y0 - 2; y < y0 + H + 2; y++) {
    st.setTile(x0 - 2, y, S());
    st.setTile(x0 + W + 1, y, S());
  }

  const blockTypes = ['stone', 'dirt', 'sand', 'wood', 'v_41_blue_brick', 'clay', 'snow', 'mud'];

  /** 构建一个密封水腔:位置 (cx,cy) 是 3×2 内空间的左上角 */
  const buildCell = (cx: number, cy: number, tid: number, scenario: 'A' | 'B' | 'C' | 'D' | 'E') => {
    // 内空间 3×2(cx..cx+2, cy..cy+1);水填满;测试方块替换特定内壁
    // 先放满水
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        st.setLiquid(cx + dx, cy + dy, L, 1);
      }
    }
    // 再放测试方块(替换水)
    const put = (dx: number, dy: number) => {
      st.setLiquid(cx + dx, cy + dy, 0, 0);
      st.setTile(cx + dx, cy + dy, tid);
    };
    switch (scenario) {
      case 'A': put(1, 0); put(1, 1); break; // 中间竖排(左右夹水)
      case 'B': put(0, 1); put(1, 1); put(2, 1); break; // 底排(上方水)
      case 'C': put(0, 0); put(1, 0); put(2, 0); break; // 顶排(下方水)
      case 'D': put(0, 0); put(0, 1); break; // 左竖排(右侧水)
      case 'E': put(2, 0); put(2, 1); break; // 右竖排(左侧水)
    }
    // 外壳(包裹内空间):底+顶+左右,但不覆盖已有测试方块
    const shell = (dx: number, dy: number) => {
      if (st.type[st.idx(cx + dx, cy + dy)] === tid) return; // 不覆盖测试块
      if (st.liquid[st.idx(cx + dx, cy + dy)] > 0) {
        st.setLiquid(cx + dx, cy + dy, 0, 0);
      }
      st.setTile(cx + dx, cy + dy, S());
    };
    for (let dx = -1; dx <= 3; dx++) { shell(dx, -1); shell(dx, 2); } // 顶底
    for (let dy = -1; dy <= 2; dy++) { shell(-1, dy); shell(3, dy); } // 左右
  };

  let ry = y0;
  for (const bt of blockTypes) {
    const tid = TILE_BY_KEY[bt];
    if (tid === undefined) continue;
    if (!TILE_DEFS[tid]) continue;

    let cx = x0 + 1;
    const scenarios: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E'];
    for (const sc of scenarios) {
      // 左列(无墙)
      buildCell(cx, ry, tid, sc);
      cx += CELL_W + GAP;
      // 右列(有墙)——同场景但加背景墙
      buildCell(cx, ry, tid, sc);
      for (let dx = -1; dx <= 3; dx++) {
        for (let dy = -1; dy <= 2; dy++) {
          if (st.inBounds(cx + dx, ry + dy)) st.setWall(cx + dx, ry + dy, 7);
        }
      }
      cx += CELL_W + GAP;
    }

    // 行首火把标记
    st.setTile(x0, ry, TILE_BY_KEY['torch']);
    ry += CELL_H + GAP;
  }

  // 玩家传到测试区中央(能同时看到左右两列)
  p.x = (x0 + W / 2) * 16;
  p.y = (y0 + H / 2) * 16;
  p.vx = 0; p.vy = 0;
  game.camera.x = p.cx;
  game.camera.y = p.cy;

  console.log('[液体实验台] 已生成', ROWS, '行(方块)×', COLS, '列(5 场景×无墙/有墙)');
  console.log('[液体实验台] 行序:', blockTypes.join(', '));
  console.log('[液体实验台] 场景: A=左右夹水 B=上方水 C=下方水 D=右侧水 E=左侧水');
  console.log('[液体实验台] 每场景左=无墙(浸润应可见) 右=有墙(对照)');
  console.log('[液体实验台] 按 F5 开启标注模式,点击标记缝隙位置');
}
