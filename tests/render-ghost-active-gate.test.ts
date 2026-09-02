// 幽灵保域渲染门（2026-09-03）回归：flags bit0（active 位）过滤
// 背景：幽灵保域批移除 finalize 出口净化（x86 对齐,残型必须保留）后,渲染路径
// 不得按 type 直画幽灵格（flags=0,type≠0）——否则新世界小地图显形雪楔/沙漠蛋/
// 矿石散点"化石层"。本套件锁六条渲染面：
//   ① 小地图全量(fillBand) ② 小地图增量(colorFor/flushDirty) ③ 生成预览(mapColor24)
//   ④ 液体渲染实心判定(LiquidCache.IsSolid = SolidOrSlopedTile 的 active() 门)
//   ⑤ 帧邻查路径(mask8/auto 帧回退;仙人掌贴图沙型扫描)
//   ⑥ 真实生成世界渲染缓存(幽灵残型零像素权重——清除残型缓存逐位不变)
// 墙面不查 active（幽灵格 wall 仍有效,同 MapHelper 模型）——一并锁死防回归。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Minimap } from '../src/render/Renderer';
import { mapColor24 } from '../src/render/MapColors';
import { T, TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { drawVanillaLiquids } from '../src/render/VanillaLiquidRenderer';
import { mask8, cactusTextureFor } from '../src/render/VanillaTiler';
import { generateWorld } from '../src/world/gen/WorldGen';
import type { SpriteAtlas } from '../src/assets/SpriteAtlas';

function makeWorld(): { w: World; st: TileStore } {
  const w = new World(48, 130, 7, 'open');
  // 正常分层参数（fillBand 的 surf/rock 门在退化档有历史边角差,给真实值消除伪差异）
  w.groundLevel = 40; w.rockLevel = 80;
  return { w, st: w.store };
}

describe('幽灵保域渲染门：小地图 fillBand（全量重建）', () => {
  it('幽灵残型不画成实体；幽灵格的墙仍显示（墙不查 active）', () => {
    const { w, st } = makeWorld();
    st.setTile(6, 100, T.STONE);            // 活性实体
    st.setTile(20, 100, T.STONE);           // → 幽灵化（active(false) 保残型）
    st.deactivateTile(20, 100);
    st.setTile(20, 101, T.STONE);           // 幽灵 + 墙：跳过 tile 支后应落到墙色
    st.deactivateTile(20, 101);
    st.setWall(20, 101, 4);
    st.setWall(25, 100, 4);                 // 纯墙参照格（无 tile）
    const mm = new Minimap(w);              // 同步全量（fillBand 热循环）
    const p = mm.p32!;
    const at = (x: number, y: number) => p[st.idx(x, y)];
    expect(at(6, 100)).not.toBe(at(30, 100));            // 活性石照画（≠岩层底色）
    expect(at(20, 100)).toBe(at(30, 100));               // 幽灵石 → 岩层底色（不显形）
    expect(at(20, 101)).toBe(at(25, 100));               // 幽灵格墙色仍画（wall 有效）
    expect(st.type[st.idx(20, 100)]).toBe(T.STONE);      // 保域本体未回退：残型仍在
    expect(st.flags[st.idx(20, 100)]).toBe(0);           // active 位仍 0
  });
});

describe('幽灵保域渲染门：小地图增量（colorFor/flushDirty）与全量一致性', () => {
  it('幽灵化后 flushDirty 与全量重建逐位一致；挖除正确更新', () => {
    const { w, st } = makeWorld();
    const mm = new Minimap(w, true);
    mm.redrawAll();
    st.setTile(6, 60, T.STONE);
    mm.flushDirty();
    // 挖掉一块实体方块 → 增量回到背景色
    st.setTile(6, 60, 0);
    mm.flushDirty();
    const ref = new Minimap(w);
    const a = new Uint32Array(mm.pix!.buffer), b = new Uint32Array(ref.pix!.buffer);
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    expect(diff).toBe(0);
    // colorFor 语义：幽灵 → 非实体色（与全量同一门）
    st.setTile(20, 60, T.STONE);
    st.deactivateTile(20, 60);
    const ghostC = mm.colorFor(20, 60);
    const airC = mm.colorFor(21, 60);
    expect(ghostC).toBe(airC);
    // 重建对照：幽灵格在 fillBand 侧同样不显形
    const mm2 = new Minimap(w);
    expect(new Uint32Array(mm2.pix!.buffer)[st.idx(20, 60)])
      .toBe(new Uint32Array(mm2.pix!.buffer)[st.idx(21, 60)]);
  });
});

describe('幽灵保域渲染门：生成预览 mapColor24', () => {
  it('幽灵残型不显形（落到墙/液体/背景优先级）', () => {
    const { st } = makeWorld();
    st.setTile(3, 100, T.STONE);
    st.deactivateTile(3, 100);
    st.setWall(3, 100, 1);
    st.setTile(5, 100, T.STONE);
    st.deactivateTile(5, 100);              // 幽灵无墙 → 背景色（非石灰）
    const ghostWall = mapColor24(st, 3, 100);
    const wallOnly = (() => { const { st: s2 } = makeWorld(); s2.setWall(3, 100, 1); return mapColor24(s2, 3, 100); })();
    const ghostBare = mapColor24(st, 5, 100);
    const airRef = (() => { const { st: s2 } = makeWorld(); return mapColor24(s2, 5, 100); })();
    expect(ghostWall).toBe(wallOnly);       // 幽灵格墙仍有效
    expect(ghostBare).toBe(airRef);         // 幽灵石 → 背景而非石灰色
    expect(ghostBare).not.toBe(0x808080);
    // 活性格照画
    st.setTile(7, 100, T.STONE);
    expect(mapColor24(st, 7, 100)).toBe(0x808080);
  });
});

describe('幽灵保域渲染门：液体渲染实心判定（LiquidCache.IsSolid）', () => {
  // 桩 ctx：逐调用记录（drawImage 参数序列 = 准备管线产物指纹）
  function recordingCtx(): { ctx: CanvasRenderingContext2D; seq: string[] } {
    const seq: string[] = [];
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(t, prop) {
        if (prop in t) return t[prop as string];
        return (...args: unknown[]) => {
          if (prop === 'drawImage') seq.push(args.map((a) => String(a)).join('|'));
          if (prop === 'getTransform') return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; // 恒等变换（a=d=1）
          if (prop === 'getImageData') return { data: new Uint8ClampedArray(4) };
          return undefined;
        };
      },
      set(t, prop, v) { t[prop as string] = v; return true; },
    };
    return { ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D, seq };
  }

  /** 一池水 + 边界格 (61,39) 三态（空气/幽灵石/活性石）的 store */
  function lakeStore(edge: 'air' | 'ghost' | 'solid'): TileStore {
    const st = new TileStore(120, 80);
    const dirt = TILE_DEFS.findIndex((d) => d?.key === 'dirt');
    const put = (x: number, y: number, t: number, liquid = 0, lt = 1) => {
      const i = st.idx(x, y);
      st.type[i] = t; st.flags[i] = t ? 1 : 0;
      st.liquid[i] = liquid; st.liquidType[i] = lt;
    };
    for (let x = 0; x < 120; x++) put(x, 40, dirt);
    for (let x = 20; x <= 60; x++) for (let y = 30; y <= 39; y++) put(x, y, 0, 255, 1);
    if (edge === 'solid') put(61, 39, dirt);
    else if (edge === 'ghost') { put(61, 39, dirt); st.deactivateTile(61, 39); }
    return st;
  }

  function drawSeq(st: TileStore): string[] {
    // 液面贴图桩尺寸须容纳源窗（16 帧×80px=1280 高 + 角填充 fy 偏移;宽 96 容 fx32+sw16）
    const atlas = { width: 96, height: 1440, ensureVImage: () => ({ width: 96, height: 1440 }) } as unknown as SpriteAtlas;
    const { ctx, seq } = recordingCtx();
    drawVanillaLiquids(ctx, atlas, st, 30, 5, 5, 100, 55, 1000, false, 0, 0,
      undefined, false, undefined, undefined);
    return seq;
  }

  it('幽灵实心邻格按非实心渲染（== 空气侧序列；≠ 活性实心侧）', () => {
    const air = drawSeq(lakeStore('air'));
    const ghost = drawSeq(lakeStore('ghost'));
    const solid = drawSeq(lakeStore('solid'));
    expect(ghost).toEqual(air);      // 幽灵残型不算实心（active() 门）
    expect(solid).not.toEqual(air);  // 实体确有形态差（对照非退化）
    expect(air.length).toBeGreaterThan(0);
  });
});

describe('幽灵保域渲染门：帧邻查路径（mask8 auto 帧回退）', () => {
  it('幽灵邻格不算同型连接（原版 active() 门）：U 位与 UL/UR 角位清零', () => {
    const { st } = makeWorld();
    const t = T.STONE;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) st.setTile(10 + dx, 50 + dy, t);
    }
    const same = (v: number) => v === t;
    expect(mask8(st, 10, 50, t, same)).toBe(255);          // 全连接基线
    st.deactivateTile(10, 49);                             // 上邻 → 幽灵残型（type 保留）
    expect(st.type[st.idx(10, 49)]).toBe(t);
    // vanilla 位序 U=1 UL=16 UR=32：幽灵上邻 = 空气 = 暴露边（type-only 旧读会误连 255）
    expect(mask8(st, 10, 50, t, same)).toBe(255 - 1 - 16 - 32);
    // 恢复 active 后回到全连接（门只作用 flags=0 的格）
    st.setTile(10, 49, t);
    expect(mask8(st, 10, 50, t, same)).toBe(255);
  });
});

describe('幽灵保域渲染门：仙人掌贴图沙型扫描（cactusTextureFor）', () => {
  it('幽灵沙不定沙型（视同空气继续扫）；活性沙照定', () => {
    const { st } = makeWorld();
    const CACT = TILE_BY_KEY['v_80_cactus']!;
    const EBON = TILE_BY_KEY['v_112_ebonsand_block']!;
    st.setTile(5, 40, CACT);
    st.setTile(5, 41, EBON);
    const atlas = { ensureVImage: (n: string) => ({ name: n }) } as never as Parameters<typeof cactusTextureFor>[0];
    expect((cactusTextureFor(atlas, st, 5, 40) as { name: string }).name).toBe('vanilla/Evil_Cactus.png');
    st.deactivateTile(5, 41);                              // 幽灵黑檀沙
    expect((cactusTextureFor(atlas, st, 5, 40) as { name: string }).name).toBe('vanilla/Tiles_80.png');
  });
});

describe('幽灵保域渲染门：真实生成世界渲染缓存', () => {
  it('幽灵残型零像素权重：批量清除残型后 fillBand 缓存逐位不变', async () => {
    const world = await generateWorld({ width: 2100, height: 600, seedText: '9293480', evil: 0 });
    const st = world.store;
    // 幽灵普查（非退化门）：保域后 flags=0 && type≠0 必须存在（x86 对齐行为本体）
    let ghosts = 0;
    for (let i = 0; i < st.w * st.h; i++) if (st.flags[i] === 0 && st.type[i] !== 0) ghosts++;
    expect(ghosts).toBeGreaterThan(0);
    const mm = new Minimap(world);                         // 同步全量 fillBand
    const before = mm.p32!.slice();
    // 抽样 300 个幽灵格批量清除残型：渲染缓存不得有任何像素变化
    //（幽灵格若被按 type 直画,清除其 type 必然改变该格颜色 = 本断言抓的就是那条 bug）
    let sampled = 0;
    outer: for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] === 0 && st.type[i] !== 0) {
          st.setTile(x, y, 0);
          if (++sampled >= 300) break outer;
        }
      }
    }
    expect(sampled).toBeGreaterThan(0);
    for (let k = 0; k < 40; k++) mm.flushDirty();          // 24 chunk/次,40 次必排空
    expect(Array.from(mm.p32!)).toEqual(Array.from(before));
  }, 240000);
});
