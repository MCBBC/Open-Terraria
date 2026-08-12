// F11 像素方块群导入回归:放置扫描 / 透明跳过 / RGB 编码往返 / 存档序列化往返
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';
import { findArtPlacement, placeArt, type ArtGrid } from '../src/dev/PixelArtImport';

const PIX = TILE_BY_KEY['pixel_block']!;
const DIRT = TILE_BY_KEY['dirt']!;

function grid2x2(colors: Array<[number, number, number, number]>): ArtGrid {
  // 2×2 RGBA 手工构造(绕开 DOM canvas):colors 顺序 [tl, tr, bl, br]
  const rgba = new Uint8ClampedArray(16);
  colors.forEach((c, i) => { rgba.set(c, i * 4); });
  return { w: 2, h: 2, rgba };
}

function ground(st: TileStore, y: number, from = 0, to = 40): void {
  for (let x = from; x < to; x++) st.setTileSilent(x, y, DIRT);
}

describe('像素方块群导入', () => {
  it('放置扫描:平地 → 底边贴地表', () => {
    const st = new TileStore(60, 60);
    ground(st, 40);
    const pos = findArtPlacement(st, 20, 10, 4, 3);
    expect(pos).toEqual({ x: 20, y: 37 }); // 底行 39 = 地表上一格
  });

  it('放置扫描:地面有障碍 → 逐格抬升到矩形全空', () => {
    const st = new TileStore(60, 60);
    ground(st, 40);
    st.setTileSilent(21, 38, DIRT); // 地表上方 2 格处一坨障碍
    st.setTileSilent(21, 39, DIRT);
    const pos = findArtPlacement(st, 20, 10, 4, 3);
    expect(pos).not.toBeNull();
    // 4×3 矩形须完全避开障碍:底边最多 38 → y = 35
    expect(pos!.y).toBeLessThanOrEqual(35);
    for (let y = pos!.y; y < pos!.y + 3; y++) {
      for (let x = pos!.x; x < pos!.x + 4; x++) {
        expect(st.flags[st.idx(x, y)]).toBe(0);
      }
    }
  });

  it('放置扫描:找不到全空位(整柱实心) → null', () => {
    const st = new TileStore(60, 60);
    for (let y = 0; y < 60; y++) st.setTileSilent(20, y, DIRT);
    expect(findArtPlacement(st, 20, 10, 4, 3)).toBeNull();
  });

  it('placeArt:透明格跳过 / 已占用格跳过 / RGB 编码往返', () => {
    const st = new TileStore(60, 60);
    ground(st, 50);
    const g = grid2x2([
      [255, 0, 0, 255],      // 红
      [0, 0, 0, 0],          // 透明(跳过)
      [0, 255, 0, 255],      // 绿
      [10, 20, 30, 255],     // 深色(量化后 8,16,24? 本测试不量化,手工值直编码)
    ]);
    st.setTileSilent(10, 45, DIRT); // (10,45) 已占用 → 跳过
    const n = placeArt(st, g, { x: 10, y: 45 });
    expect(n).toBe(2); // 红/绿放置,透明与占用跳过(深色落在占用格)
    // 编码往返:2×2 格位 tl(10,45)=红→占用跳过;tr(11,45)=透明;bl(10,46)=绿;br(11,46)=深色
    const gi = st.idx(10, 46);
    expect(st.type[gi]).toBe(PIX);
    // 绿 (0,255,0):fx = ((0||1)<<8)|(255||1) = 511;解码 r=fx>>8=1(纯0红||1), g=fx&255=255, b=fy=1
    expect(st.frameX[gi]).toBe(511);
    expect(st.frameX[gi] & 255).toBe(255);
    expect(st.frameX[gi] >> 8).toBe(1);
    expect(st.frameY[gi]).toBe(1);
    // 深色格
    const di = st.idx(11, 46);
    expect(st.type[di]).toBe(PIX);
    expect((st.frameX[di] >> 8)).toBe(10);
    expect(st.frameX[di] & 255).toBe(20);
    expect(st.frameY[di]).toBe(30);
  });

  it('存档序列化往返:pixel_block 的 type+frameX/Y 持久化', async () => {
    const { serializeSave } = await import('../src/save/serialize');
    const { loadSaveData } = await import('../src/save/SaveFile');
    type SaveData = import('../src/save/SaveFile').SaveData;
    const st = new TileStore(60, 60);
    ground(st, 50);
    const g = grid2x2([[255, 0, 0, 255], [0, 0, 255, 255], [0, 255, 0, 255], [255, 255, 0, 255]]);
    const n = placeArt(st, g, { x: 10, y: 45 });
    expect(n).toBe(4);
    const data = serializeSave({
      width: 60, height: 60, store: st,
      header: { name: 't', seed: 1, width: 60, height: 60, spawn: [30, 40] as [number, number], groundLevel: 30, rockLevel: 60, created: 0, playTimeMs: 0 },
      clock: { timeOfDay: 0.3, dayCount: 1 },
      player: { hp: 100, x: 100, y: 100, inventory: [], selected: 0 },
    } as never);
    expect((data as SaveData).tiles).toBeTruthy();
    const st2 = new TileStore(60, 60);
    loadSaveData(data as SaveData, st2);
    let count = 0;
    for (let i = 0; i < st2.type.length; i++) {
      if (st2.type[i] === PIX) {
        count++;
        // 帧坐标非零(编码存在)
        expect(st2.frameX[i] | st2.frameY[i]).toBeGreaterThan(0);
      }
    }
    expect(count).toBe(4);
  });
});
