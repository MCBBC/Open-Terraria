// ★BJ361（2026-09-25）门开关「贴图不变化」回归定谳落刀行为锁。
//  病灶：BJ322/BJ324 裸写窗（store.suppressListeners）把整批写入的监听派发一并吃掉,
//  其中含渲染 mark 主通道——ChunkCache 构造期订阅 onTileChanged→markDirtyAround
//  （ChunkCache.ts:300,chunk 烘焙失效唯一口）。窗后 afterWrite/tileFrame 收口面只做
//  DECOR 完整性裁决（门完整时既不杀也不 mark）→ tile.type/frame 已切换、碰撞/逻辑
//  全对,但门所在 chunk 零 markDirty → 烘焙画布停留旧 type 像素 = 门开关贴图不变化
//  （用户实报）。BJ361 探针定谳（scripts/_bj361-door-render-mark.mjs）：修复前 toggle
//  后门 chunk (4,3) 零 markDirty（仅背景噪声）,修复后每次 toggle 门域 mark 7 次。
//  修刀：TileStore.notifyChanged(x,y) 手动补派发原语 + Door.shiftTallGate/shiftTrapdoor
//  三臂裸写窗 finally 后对【写入域】逐格补派发（整件已完整→Check* 不判坏,BJ322
//  半写态病灶不复发;监听全族恢复原版「逐格直写监听即时派发」语义）。
//  判别面：监听替身（=ChunkCache.markDirtyAround 订阅同位）必须【恰收到写入域坐标
//  各一次】——窗内逐格派发会造成半写态多收（BJ322 病灶复活）;窗后零派发=贴图不变化
//  （本回归）。两向皆可判（变异删补派发→零收红;挪进窗内→半写态收红）。
// shell 模式同 bj322-tallgate-shift-atomic.test.ts。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { shiftTallGate, shiftTrapdoor, TALL_GATE_ROW_FY } from '../src/world/Door';
import { TileStore } from '../src/world/TileStore';

const CLOSED = TILE_BY_KEY['v_388_tall_gate_closed']!;
const OPEN = TILE_BY_KEY['v_389_tall_gate_open']!;
const TP_OPEN = TILE_BY_KEY['v_386_trapdooropen']!;
const TP_CLOSED = TILE_BY_KEY['v_387_trap_door_closed']!;
const STONE = TILE_BY_KEY['stone']!;

/** 渲染 mark 主通道替身：ChunkCache.ts:300 `onTileChanged((x,y)=>markDirtyAround(x,y))`
 *  同位订阅,记录收到的坐标序（判别面唯一真值源） */
function markSpy(st: TileStore): Array<[number, number]> {
  const calls: Array<[number, number]> = [];
  st.onTileChanged((x, y) => calls.push([x, y]));
  return calls;
}

/** 高门合成：地面行 14、天花行 8（双锚 StrictSolid）,门列 x=10,净空 9..13 */
function setupGate(w: World, type = CLOSED) {
  const st = w.store;
  for (let x = 8; x <= 12; x++) {
    st.setTileSilent(x, 14, STONE, 0, 0);
    st.setTileSilent(x, 8, STONE, 0, 0);
  }
  for (let dy = 0; dy < 5; dy++) st.setTileSilent(10, 9 + dy, type, 0, TALL_GATE_ROW_FY[dy]);
}

describe('BJ361 门裸写窗后的渲染 mark 补派发（onTileChanged 写入域恰达）', () => {
  it('高门开（388→389）：监听替身恰收门列 5 格各一次（窗内零半写态派发+窗后整域派发）', () => {
    const w = new World(40, 40, 7, 'bj361-gate-open');
    const st = w.store;
    setupGate(w);
    const marks = markSpy(st);
    const r = shiftTallGate(st, 10, 11, false);
    expect(r).toEqual([10, 9]);
    for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(OPEN);
    // 写入域恰达：门列 5 格、各恰一次、序=写入序
    expect(marks).toEqual([[10, 9], [10, 10], [10, 11], [10, 12], [10, 13]]);
  });

  it('高门关（389→388）：同域恰达', () => {
    const w = new World(40, 40, 7, 'bj361-gate-close');
    const st = w.store;
    setupGate(w, OPEN);
    const marks = markSpy(st);
    const r = shiftTallGate(st, 10, 9, true);
    expect(r).toEqual([10, 9]);
    for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(CLOSED);
    expect(marks).toEqual([[10, 9], [10, 10], [10, 11], [10, 12], [10, 13]]);
  });

  it('活板门关（386→387 styleX0 底行）：监听替身恰收 2×2 写入域（清顶行 2+写底行 2）', () => {
    const w = new World(40, 40, 7, 'bj361-tp-s0');
    const st = w.store;
    // 开态 386 2×2（styleX0=frameX 0/18,styleY0）置于 (20,20)..(21,21),底锚 StrictSolid
    st.setTileSilent(20, 20, TP_OPEN, 0, 0);
    st.setTileSilent(21, 20, TP_OPEN, 18, 0);
    st.setTileSilent(20, 21, TP_OPEN, 0, 18);
    st.setTileSilent(21, 21, TP_OPEN, 18, 18);
    st.setTileSilent(20, 22, STONE, 0, 0);
    st.setTileSilent(21, 22, STONE, 0, 0);
    const marks = markSpy(st);
    expect(shiftTrapdoor(st, 20, 20, true)).toBe(true);
    expect(st.get(20, 21)).toBe(TP_CLOSED);
    expect(st.get(21, 21)).toBe(TP_CLOSED);
    expect(st.get(20, 20)).toBe(0);
    expect(st.get(21, 20)).toBe(0);
    // 写入域=(20..21,20..21) 4 格（清 2+写 2）,各恰一次（列优先序=补派发循环序）
    expect(marks).toEqual([[20, 20], [20, 21], [21, 20], [21, 21]]);
  });

  it('活板门开（387→386,playerAbove 两态）：监听替身恰收开态写入 2×2 域', () => {
    for (const playerAbove of [true, false]) {
      const w = new World(40, 40, 7, `bj361-tp-open-${playerAbove}`);
      const st = w.store;
      // 关态 387 2×1（styleY0）置于 (20,21)..(21,21)——折翼行（下折=22 行/上折=20 行）
      // 须保持空气（foldRowBlocked 对不可砍件正确拒开）
      st.setTileSilent(20, 21, TP_CLOSED, 0, 0);
      st.setTileSilent(21, 21, TP_CLOSED, 18, 0);
      const marks = markSpy(st);
      expect(shiftTrapdoor(st, 20, 21, playerAbove)).toBe(true);
      const wy0 = 21 - (playerAbove ? 0 : 1);
      for (let col = 0; col < 2; col++) {
        expect(st.get(20 + col, wy0)).toBe(TP_OPEN);
        expect(st.get(20 + col, wy0 + 1)).toBe(TP_OPEN);
      }
      expect(marks).toEqual([
        [20, wy0], [20, wy0 + 1],
        [21, wy0], [21, wy0 + 1],
      ]);
    }
  });
});
