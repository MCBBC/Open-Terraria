// 门帧算法验证:对照原版 WorldGen.OpenDoor L22384 / CloseDoor L15901 的数学
import { TileStore } from '../src/world/TileStore.ts';
import { T, TILE_BY_KEY } from '../src/data/tiles.ts';
import { doorClosedFrame, doorStyleOf, placeDoorClosed, openDoor, closeDoor } from '../src/world/Door.ts';

const st = new TileStore(32, 32, 0);
const DOOR = TILE_BY_KEY['door_closed'];
console.assert(T.DOOR_CLOSED === DOOR, 'T.DOOR_CLOSED 应等于 door_closed 注册 id');

// 1. 关门帧:style 13(地牢)→ (0, 702);style 19(地狱)→ (0, 1026)
console.log('style13 frame:', doorClosedFrame(13), '(期望 [0,702])');
console.log('style19 frame:', doorClosedFrame(19), '(期望 [0,1026])');
console.log('style36 frame:', doorClosedFrame(36), '(期望 [54,0] —— 第二列)');

// 2. 放置 1×3 整扇门
placeDoorClosed(st, 10, 20, 13);
for (let dy = 0; dy < 3; dy++) {
  const i = st.idx(10, 20 + dy);
  console.log(`cell(10,${20 + dy}):`, st.type[i] === DOOR ? 'door' : 'MISSING', 'fx:', st.frameX[i], 'fy:', st.frameY[i]);
}

// 3. 开门 dir=+1(玩家朝右):原版 → 锚点不动,占 (10..11, 20..22),fx=0/18
console.log('open +1:', openDoor(st, 10, 21, 1)); // 点中间格也应工作
for (let dx = 0; dx < 2; dx++) {
  for (let dy = 0; dy < 3; dy++) {
    const i = st.idx(10 + dx, 20 + dy);
    console.log(`open cell(${10 + dx},${20 + dy}):`, st.type[i] === T.DOOR_OPEN ? 'open' : 'MISSING', 'fx:', st.frameX[i], 'fy:', st.frameY[i]);
  }
}

// 4. 关门:style 行 13 应保留,frameX ∈ {0,18,36} 三变体
console.log('close:', closeDoor(st, 11, 21)); // 点右侧列也应工作
for (let dy = 0; dy < 3; dy++) {
  const i = st.idx(10, 20 + dy);
  console.log(`closed cell(10,${20 + dy}):`, st.type[i] === DOOR ? 'closed' : 'MISSING', 'fx:', st.frameX[i], 'fy:', st.frameY[i]);
}
console.log('style roundtrip:', doorStyleOf(st.frameX[st.idx(10, 20)], st.frameY[st.idx(10, 20)]), '(期望 13)');
console.log('right col cleared:', st.get(11, 20) === 0 && st.get(11, 21) === 0 && st.get(11, 22) === 0);

// 5. dir=-1 开门:锚点应左移到 x-1=9,fx=36/54
placeDoorClosed(st, 15, 20, 19);
console.log('open -1:', openDoor(st, 15, 20, -1));
const a = st.idx(14, 20), b = st.idx(15, 20);
console.log('anchor(14,20) fx:', st.frameX[a], '(期望 36); (15,20) fx:', st.frameX[b], '(期望 54)');
console.log('close from anchor col:', closeDoor(st, 14, 21));
console.log('closed at 15:', st.get(15, 20) === DOOR, st.get(14, 20) === 0);
console.log('style after -1 roundtrip:', doorStyleOf(st.frameX[st.idx(15, 20)], st.frameY[st.idx(15, 20)]), '(期望 19)');

// 6. 阻挡:开门目标列有方块应失败并提示换向
placeDoorClosed(st, 25, 20, 0);
st.setTileSilent(26, 21, T.STONE);
console.log('blocked +1 should fail:', openDoor(st, 25, 20, 1) === false);
console.log('fallback -1 should succeed:', openDoor(st, 25, 20, -1) === true);
