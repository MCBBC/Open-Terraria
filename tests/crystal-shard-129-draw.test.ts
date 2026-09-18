// ★G-129（2026-09-18）水晶碎块（tile 129）帧面回归——用户实报「原版是一长串，
// 我们是发散两个方块出来」定谳收口。
//
// 原版锚（Terarria1457）：
//   · 绘制面：TileDrawing.cs:4682-4690 case 129 `addFrY = 0` verbatim（纵向无动画带）；
//     大簇（frameX>=324）addFrX = ((n + tileFrame[129]) % 6 − n) × 18（n=(fx−324)/18），
//     六格横带 324..414 轮转；相位钟 = Main.cs:19287-19290（每 8tick 推进、>=6 回卷）。
//     旧实现：TILE_ANIM_PITCH[129]=38（默认档误罩）→ 源 sy 逐相位 +38 纵向下移
//     （row+2 侧向簇带 → row+4/6 辉光带（小簇=透明格整块消失/大簇=圆斑「方块」）→
//     越界回退 (0,0) 平铺第一格）；横向钟 animRot()（tick/6）与原版 8tick 相位率差 33%。
//   · 数据面：PlaceTile case 129（cs:60171-60180）只写 frameX，frameY 由 TileFrameImportant
//     case 129（cs:86339-86369）→ CheckAndAdjustMultiDirectionalTile（cs:60805-60855，
//     锚向优先 下>左>右>上 → frameY 0/54/36/18）落定；锚=ValidAnchorForMultiDirectionalTile
//     （cs:60788-60803：非 Boulders(:195)/非关门 10，按向 SolidTileAllow*Slope）且锚型
//     tileSolid && !tileSolidTop。掉落面：KillTile_GetItemDrops case 129（cs:65496-65504）
//     frameX>=324 → 4988（Gelatin Crystal）/否则 502（Crystal Shard）。
//
// 变异证红映射：
//   M1  TILE_ANIM_PITCH[129] 0→38           → T1 红（纵偏非 0）
//   M2  crystalShardAddFrX 钟回 animRot()    → T2 红（tick=24/40 相位率差）
//   M3  生长 frameY 恒 0（回退 place1 fy）   → T3 红（36/18 落向丢失）
//   M4  摘 killDependentAt 129/149 派发      → T4 红（锚死后碎块悬空不落）
//   M5  摘 killDropFace case 129            → T4 红（502/4988 掉落丢失）
//   M6  priority 改「按生长向直配」          → T3-D 红（下锚优先级丢失）
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { holidayLightVid, styleDropVidOfFrames } from '../src/data/vanillaStyleDrops';
import { RNG } from '../src/core/rng';
import {
  animYOffset, crystalShardAddFrX, tileAnim,
  TILE_ANIM_PITCH, TILE_ANIM_RATE, TILE_ANIM_FRAMES, volcanoFrame59x,
} from '../src/render/TileAnim';
import {
  SHARD_BASE_ALPHA, shardGlowTint, shardHslToRgb, drawAdjust, drawShardCell,
} from '../src/render/VanillaTiler';
import { genTileFrame } from '../src/world/gen/vanilla/FinalCleanupPass';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

interface DropRec { vid: number; x: number; y: number; stack: number }

function mkEvo(st: TileStore, seed: number, drops: DropRec[]): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed,
    worldSurface: 40, rockLevel: 20, dungeonX: 60, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: (vid, x, y, stack) => { drops.push({ vid, x, y, stack }); },
  };
  return new WorldEvolution(host);
}

/** 掷源桩：按队列出队（耗尽回退 1=恒不中） */
function stubRng(evo: WorldEvolution, queue: number[]): number[] {
  const q = [...queue];
  const consumed: number[] = [];
  (evo as unknown as { rng(): number }).rng = () => {
    const v = q.length > 0 ? q.shift()! : 1;
    consumed.push(v);
    return v;
  };
  return consumed;
}

/** 私有方法调用（this=实例） */
function invoke<T = void>(evo: WorldEvolution, name: string, ...args: unknown[]): T {
  return (evo as unknown as Record<string, (...a: unknown[]) => T>)[name](...args);
}

const setHard = (evo: WorldEvolution): void => {
  (evo as unknown as { hardMode: boolean }).hardMode = true;
};

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================ 绘制面（M1/M2）
describe('★G-129 绘制面：纵向零动画 + 横向六格轮转（TileDrawing.cs:4682-4690）', () => {
  it('M1：任意 tick 下 animYOffset(129) 恒 0（纵向下移走带=「发散两个方块」根因,复发即红）', () => {
    for (let t = 0; t < 48; t++) {           // 覆盖原版整周期（6 相位 × 8tick）
      tileAnim.tick = t;
      expect(animYOffset(129, 144)).toBe(0);
    }
  });

  it('M2：大簇 addFrX 六格横带轮转（相位钟=tileFrame[129] 每 8tick/6 帧回卷）', () => {
    // tick=4 → 相位 0：全带静止
    tileAnim.tick = 4;
    for (let n = 0; n < 6; n++) expect(crystalShardAddFrX(324 + n * 18)).toBe(0);
    // tick=12 → 相位 1：((n+1)%6−n)×18（n=0→+18 … n=5→−90,恒留在 324..414 带内）
    tileAnim.tick = 12;
    const expPhase1 = [18, 18, 18, 18, 18, -90];
    for (let n = 0; n < 6; n++) expect(crystalShardAddFrX(324 + n * 18)).toBe(expPhase1[n]);
    // tick=24 → 相位 3（animRot()=tick/6 会给 4——回归 animRot 即在此爆红）
    tileAnim.tick = 24;
    const expPhase3 = [54, 54, 54, -54, -54, -54];
    for (let n = 0; n < 6; n++) expect(crystalShardAddFrX(324 + n * 18)).toBe(expPhase3[n]);
    // tick=40 → 相位 5（animRot()=6%6=0——第二歧变点）
    tileAnim.tick = 40;
    const expPhase5 = [90, -18, -18, -18, -18, -18];
    for (let n = 0; n < 6; n++) expect(crystalShardAddFrX(324 + n * 18)).toBe(expPhase5[n]);
  });

  it('小簇（frameX<324）恒静止 addFrX=0', () => {
    for (let t = 0; t < 48; t += 3) {
      tileAnim.tick = t;
      for (const fx of [0, 18, 162, 306]) expect(crystalShardAddFrX(fx)).toBe(0);
    }
  });
});

// ============================================================ 数据面（M3/M6）
describe('★G-129 数据面：生长落向=CheckAndAdjust 优先向（下>左>右>上）', () => {
  it('M3：左侧生长、唯一锚=右块 → frameY=36（左伸）——旧恒 0 即红', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(5, 60, S(117), 0, 0);           // 珍珠石（生长源=右锚）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    setHard(evo);
    stubRng(evo, [0.01, 0.0, 0.0, 0.99]);            // 门过/向=左/样式 0/不 rare
    invoke(evo, 'hardUpdateWorld', 5, 60);
    expect(st.type[st.idx(4, 60)]).toBe(S(129));     // 碎块落在源块左侧
    expect(st.frameX[st.idx(4, 60)]).toBe(0);        // style 0
    expect(st.frameY[st.idx(4, 60)]).toBe(36);       // 右锚 → 36（旧实现恒 0）
  });

  it('M3：向下生长（挂垂）→ 唯一锚=上块 → frameY=18', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(5, 60, S(117), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    setHard(evo);
    stubRng(evo, [0.01, 0.75, 0.0, 0.99]);           // 向 index3=dirs[3]=[0,1] 向下
    invoke(evo, 'hardUpdateWorld', 5, 60);
    expect(st.type[st.idx(5, 61)]).toBe(S(129));
    expect(st.frameY[st.idx(5, 61)]).toBe(18);       // 上锚 → 垂挂（旧实现恒 0）
  });

  it('M6：左向生长但下方有块 → 优先级下>左 → frameY=0（非按生长向直配 54）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(5, 60, S(117), 0, 0);           // 右锚
    st.setTileSilent(4, 61, S(117), 0, 0);           // 下锚（优先级更高）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    setHard(evo);
    stubRng(evo, [0.01, 0.0, 5 / 18, 0.99]);         // 向=左/样式 5
    invoke(evo, 'hardUpdateWorld', 5, 60);
    expect(st.type[st.idx(4, 60)]).toBe(S(129));
    expect(st.frameX[st.idx(4, 60)]).toBe(5 * 18);
    expect(st.frameY[st.idx(4, 60)]).toBe(0);        // CheckAndAdjust 优先向下锚（cs:60838 先于左/右）
  });
});

// ============================================================ 运行时 TileFrame 面（M4/M5）
describe('★G-129 运行时面：锚亡杀+掉落（TileFrameImportant case 129 cs:86339-86369）', () => {
  it('M4/M5：锚块被挖 → 碎块级联清除并掉 502（普通簇）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(6, 60, S(117), 0, 0);           // 锚（右侧）
    st.setTileSilent(5, 60, S(129), 18, 36);         // 碎块 style1 frameY=36
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    invoke(evo, 'kill', 6, 60);                      // 挖锚 → 级联
    expect(st.type[st.idx(6, 60)]).toBe(0);
    expect(st.type[st.idx(5, 60)]).toBe(0);          // 碎块随锚清除（旧实现悬空残留）
    const shardDrops = drops.filter((d) => d.vid === 502);
    expect(shardDrops).toHaveLength(1);
    expect(shardDrops[0]).toMatchObject({ x: 5, y: 60 });
  });

  it('M5：大簇（frameX>=324）锚亡 → 掉 4988（Gelatin Crystal,cs:65496-65504）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(6, 60, S(117), 0, 0);
    st.setTileSilent(5, 60, S(129), 324, 0);         // 大簇 style18
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    invoke(evo, 'kill', 6, 60);
    expect(drops.filter((d) => d.vid === 4988)).toHaveLength(1);
    expect(drops.filter((d) => d.vid === 502)).toHaveLength(0);
  });

  it('重锚支：锚仍在 → 按优先向重落 frameY（原版无条件写,cs:86347-86362）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(5, 60, S(117), 0, 0);           // 右锚
    st.setTileSilent(4, 61, S(117), 0, 0);           // 下锚（优先级更高）
    st.setTileSilent(4, 60, S(129), 18, 36);         // 帧向存的是旧右锚向
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops);
    const written: Array<[number, number]> = [];
    (evo as unknown as { host: { afterSilentTileWrite?: unknown } }).host.afterSilentTileWrite =
      (x0: number, y0: number) => { written.push([x0, y0]); };
    const killed = invoke<boolean>(evo, 'killDependentAt', 4, 60);
    expect(killed).toBe(false);                      // 有锚不杀
    expect(st.frameY[st.idx(4, 60)]).toBe(0);        // 重落为优先向（下锚）
    expect(written).toContainEqual([4, 60]);         // 渲染脏标已发
  });
});

// ============================================================ ★BJ118① 质感层（2026-09-18）
// 变异证红映射：
//   Mα  SHARD_BASE_ALPHA 100/255 → 1      → T-α 红（半透明基底丢失）
//   Mhue shardGlowTint 0.16 → 0.32        → T-pulse 红（脉动周期 6.25s→3.125s）
//   Mhsl hue2rgb 分支回归                  → T-hsl 红（(0.7,1,0.5)=(51,0,255) 权威值）
describe('★BJ118① 碎块质感：半透明基底 + 大簇彩虹辉光（TileDrawing.cs:1101-1118/:1276-1293）', () => {
  it('T-α：基底恒 α100（(255,255,255,100)→100/255;大簇 Transparent+glow 重画净效果同）', () => {
    expect(SHARD_BASE_ALPHA).toBeCloseTo(100 / 255, 12);
  });

  it('T-hsl：Main.hslToRgb(hue2rgb) verbatim——hsl(0.7,1,0.5)=(51,0,255)（hue 252° 蓝紫）', () => {
    expect(shardHslToRgb(0.7, 1, 0.5)).toEqual([51, 0, 255]);
    expect(shardHslToRgb(0.0, 1, 0.5)).toEqual([255, 0, 0]);    // hue 0 = 红
    expect(shardHslToRgb(1 / 3, 1, 0.5)).toEqual([0, 255, 0]);  // hue 1/3 = 绿
    expect(shardHslToRgb(0.5, 0, 0.5)).toEqual([128, 128, 128]);// s=0 → 灰（Math.Round(0.5·255)）
  });

  it('T-glow：辉光 tint verbatim——A/=2×0.3=38、×0.3 截断；(0,0,0) 钟 → [15,0,76,38]', () => {
    expect(shardGlowTint(0, 0, 0)).toEqual([15, 0, 76, 38]);
    // ★绝对金标钉值（0.16 周率/0.7 中心/0.16 幅度任一被改即红;JS Math.round=floor(x+.5)）
    expect(shardGlowTint(1, 0, 0)).toEqual([76, 0, 75, 38]);
    expect(shardGlowTint(2, 0, 0)).toEqual([76, 0, 71, 38]);
    expect(shardGlowTint(3, 5, 9)).toEqual([0, 57, 76, 38]);
    // 全域采样：α 恒 38（127×0.3）、RGB ∈ [0,76]（≤255×0.3）、hue 域 0.7±0.16 不越 [0,1)
    for (let t = 0; t < 625; t += 7) {
      for (const [x, y] of [[0, 0], [17, 33], [104, 5], [999, 1234]]) {
        const [r, g, b, a] = shardGlowTint(t / 100, x, y);
        expect(a).toBe(38);
        expect(r).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(76);
        expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThanOrEqual(76);
        expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(76);
      }
    }
  });

  it('T-pulse：钟相位率 0.16 周/秒（周期 6.25s——Mhue 0.16→0.32 即红）+ 空间相位 x·0.3/y·0.7', () => {
    // 整周期回还：t 与 t+6.25 同色（sin(2π·0.16·t) 周期 = 1/0.16）
    expect(shardGlowTint(0, 0, 0)).toEqual(shardGlowTint(6.25, 0, 0));
    expect(shardGlowTint(1.3, 5, 9)).toEqual(shardGlowTint(7.55, 5, 9));
    // 空间相位：同钟异坐标 → 色相错相（x·0.3+y·0.7 项）
    expect(shardGlowTint(0, 1, 0)).not.toEqual(shardGlowTint(0, 0, 0));
    expect(shardGlowTint(0, 0, 1)).not.toEqual(shardGlowTint(0, 0, 0));
  });
});

// ============================================================ ★BJ118② 全表普查（2026-09-18）
// 变异证红映射：
//   Mp   TILE_ANIM_PITCH 270/572/660 回 38        → T-pitch0 + recon DRIFT 红
//   Mp2  TILE_ANIM_PITCH 480 族回 38/410 回 38    → T-pitch54/56 红
//   Mc   RATE/FRAMES 340-344 摘键               → T-livingfire 红（活火冻结面）
//   Mv   volcanoFrame59x 回 animRot()%8          → T-volcano 红（样式带 0..4 乱帧）
//   Mg   drawAdjust 门/钟逐单回退                 → T-gate 系红
describe('★BJ118② 普查定谳表：横移族 pitch=0 + 碑族 54/56 门面（GetTileDrawData 亲读）', () => {
  it('T-pitch0：270/572/660 pitch 恒 0（:5654/:5695/:5681 addFrY=0 verbatim）→ 任意 tick 纵偏恒 0', () => {
    for (const id of [270, 572, 660]) {
      expect(TILE_ANIM_PITCH[id]).toBe(0);
      for (let t = 0; t < 96; t++) {
        tileAnim.tick = t;
        expect(animYOffset(id, 216)).toBe(0);
      }
    }
  });

  it('T-pitch54/56：碑族 54/微光碑 54/月主碑 56/气球束 54（:6044/:6061/:6029/:5503）', () => {
    for (const id of [480, 509, 657, 720, 721, 725, 658, 456]) expect(TILE_ANIM_PITCH[id]).toBe(54);
    expect(TILE_ANIM_PITCH[410]).toBe(56);
  });

  it('T-gate：碑族 band0 静止档门 + 54/56 步距（drawAdjust :6044-6059/:6029-6042 verbatim）', () => {
    const st = new TileStore(40, 80);
    const sy = (sheet: number, fy: number, tick: number, fx = 0) => {
      tileAnim.tick = tick;
      return drawAdjust(sheet, fx, fy, 3, 4, 36, 486, st, 40).sy;
    };
    // 480 族（血月碑）：band0（fy<54）静止;band1 相位 0/1/回卷
    expect(sy(480, 0, 0)).toBe(0);
    expect(sy(480, 54, 0)).toBe(54);
    expect(sy(480, 54, 8)).toBe(108);   // animFrameIdx=1（RATE 8）
    expect(sy(480, 54, 64)).toBe(54);   // 8 帧回卷（64/8=8,8%8=0）
    // 410 月主碑：fy>=56 才动（56 步距）;fy==36 → sh=18（tileHeight 覆写 verbatim）
    const adj410 = drawAdjust(410, 0, 36, 3, 4, 144, 504, st, 40);
    expect(adj410.sy).toBe(36);
    expect(adj410.sh).toBe(18);
    expect(sy(410, 56, 0)).toBe(56);
    expect(sy(410, 56, 8)).toBe(112);
    // 658 微光碑：变体子表基 +486/+972（fy/54==1/2）
    expect(sy(658, 0, 0)).toBe(0);
    expect(sy(658, 54, 0)).toBe(540);     // 54+486+idx0
    expect(sy(658, 108, 0)).toBe(1080);   // 108+972
    expect(sy(658, 0, 4)).toBe(54);       // RATE 4 → 相位 1
    // 455 派对碑：无派对系统 → 恒静止（a.sy=fy 整替通用纵偏）
    expect(sy(455, 54, 100)).toBe(54);
    // 244/565：fx 越门列静止（style1 静态档）
    expect(sy(244, 0, 5)).toBe(36);       // fx=0 → RATE 5 相位 1 ×36
    expect(sy(244, 0, 5, 54)).toBe(0);    // fx=54 → 静止
    expect(sy(565, 0, 5)).toBe(36);
    expect(sy(565, 0, 5, 36)).toBe(0);
  });

  it('T-fly：萤火/魂/精灵瓶横移钟=tileFrame[270/660/572]（9tick/6帧、9tick/5帧、6tick/4帧）', () => {
    const st = new TileStore(40, 80);
    const sx = (sheet: number, tick: number, imgH: number) => {
      tileAnim.tick = tick;
      return drawAdjust(sheet, 0, 0, 1, 4, 108, imgH, st, 40);
    };
    // tick=0 相位 0：n=0+(1%6)=1 → sx=18、sy 不设（纵向零动画由 PITCH=0 承担）
    expect(sx(270, 0, 36).sx).toBe(18);
    expect(sx(270, 0, 36).sy).toBeUndefined();
    // tick=9 相位 1（原版每 9tick 推进——旧 animRot tick/6 在此给 tick=6 相位 1=率快 50%）
    expect(sx(270, 6, 36).sx).toBe(18);   // tick 6 → 相位仍 0（原版相）
    expect(sx(270, 9, 36).sx).toBe(36);   // 相位 1：n=1+1=2 → 36
    // 660：9tick/5 帧
    expect(sx(660, 9, 36).sx).toBe(36);
    // 572：6tick/4 帧（rate 6=原版 counter>=6 verbatim）
    expect(sx(572, 6, 216).sx).toBe(36);
    expect(sx(572, 5, 216).sx).toBe(18);
  });

  it('T-volcano：火山相位钟预热 1..8 → 恒 5..8 四相（Main.cs:19426-19438 verbatim）', () => {
    expect(volcanoFrame59x(4)).toBe(1);    // k=1（预热）
    expect(volcanoFrame59x(39)).toBe(8);   // k=8
    expect(volcanoFrame59x(44)).toBe(5);   // k=9 → 回卷 5
    expect(volcanoFrame59x(49)).toBe(6);
    expect(volcanoFrame59x(54)).toBe(7);
    expect(volcanoFrame59x(59)).toBe(8);
    expect(volcanoFrame59x(64)).toBe(5);   // k=13 → 5
    for (let t = 44; t < 400; t++) expect(volcanoFrame59x(t)).toBeGreaterThanOrEqual(5);
    // drawAdjust 面：fx<18 动画（18×5..8）、fx>=18 静止替纵偏;594 ×36/fx>=36
    const st = new TileStore(40, 80);
    tileAnim.tick = 44;
    expect(drawAdjust(593, 0, 0, 1, 4, 18, 234, st, 40).sy).toBe(90);
    expect(drawAdjust(593, 18, 54, 1, 4, 18, 234, st, 40)).toMatchObject({ sx: 0, sy: 54 });
    expect(drawAdjust(594, 18, 0, 1, 4, 36, 468, st, 40).sy).toBe(180);
    expect(drawAdjust(594, 36, 54, 1, 4, 36, 468, st, 40)).toMatchObject({ sx: 0, sy: 54 });
  });

  it('T-livingfire：340-344 活火族入表（for-loop 钟 rate5/4帧/p90,Main.cs:19173）', () => {
    for (const id of [340, 341, 342, 343, 344]) {
      expect(TILE_ANIM_RATE[id]).toBe(5);
      expect(TILE_ANIM_FRAMES[id]).toBe(4);
      expect(TILE_ANIM_PITCH[id]).toBe(90);
    }
    tileAnim.tick = 5;
    expect(animYOffset(341, 360)).toBe(90);   // 相位 1
    tileAnim.tick = 20;
    expect(animYOffset(341, 360)).toBe(0);    // 4 帧回卷
  });
});

// ============================================================ ★BJ118③ FinalCleanup 重落（2026-09-18）
// 变异证红映射：
//   Ms  frame129Sweep 摘重落支（回只杀不落）→ T-sweep-replace 红
//   Ms2 frame129Sweep 摘优先序（改任意锚直配）→ T-sweep-priority 红
describe('★BJ118③ FinalCleanup frame129Sweep 帧向重落（WorldGen.cs:86339-86369）', () => {
  function sweepAt(st: TileStore, x: number, y: number): void {
    genTileFrame(st, new RNG(7), x, y);
  }

  it('T-sweep-replace：旧朝向 frameY=54（左锚向）+ 唯一锚=下块 → 重落 frameY=0（旧只杀不落即红）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(10, 30, S(129), 0, 54);         // 碎块,残旧左锚向帧
    st.setTileSilent(10, 31, S(117), 0, 0);          // 唯一锚=下块
    sweepAt(st, 10, 30);
    expect(st.type[st.idx(10, 30)]).toBe(S(129));     // 有锚不杀
    expect(st.frameY[st.idx(10, 30)]).toBe(0);        // ★重落为下方锚向（旧实现残留 54）
  });

  it('T-sweep-priority：下锚+左锚并存 → 优先下（frameY=0 非 54;cs:60836-60854 序）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(10, 30, S(129), 0, 36);
    st.setTileSilent(10, 31, S(117), 0, 0);          // 下锚（优先）
    st.setTileSilent(9, 30, S(117), 0, 0);           // 左锚
    sweepAt(st, 10, 30);
    expect(st.frameY[st.idx(10, 30)]).toBe(0);
  });

  it('T-sweep-dirs：左锚独存→54 / 右锚独存→36 / 上锚独存→18（四向映射 cs:86347-86362）', () => {
    for (const [ax, ay, exp] of [[9, 30, 54], [11, 30, 36], [10, 29, 18]] as Array<[number, number, number]>) {
      const st = new TileStore(40, 80);
      st.setTileSilent(10, 30, S(129), 0, 0);
      st.setTileSilent(ax, ay, S(117), 0, 0);
      sweepAt(st, 10, 30);
      expect(st.type[st.idx(10, 30)]).toBe(S(129));
      expect(st.frameY[st.idx(10, 30)]).toBe(exp);
    }
  });

  it('T-sweep-kill：四向皆无锚 → 杀（原杀面保持,回归不丢）', () => {
    const st = new TileStore(40, 80);
    st.setTileSilent(10, 30, S(129), 0, 0);
    sweepAt(st, 10, 30);
    expect(st.type[st.idx(10, 30)]).toBe(0);
  });
});

// ============================================================ ★红蓝-G① 节日彩灯 149 掉落面（2026-09-18）
// 定谳：vanilla KillTile case 149（WorldGen.cs:66036-46）frameX∈{0,54}→596（Blue Light）/
// {18,72}→597（Green）/{36,90}→598（Red）;本仓 killDropFace 曾整缺该 case → 演化级联杀
// （锚亡/失撑链 killFlat 路径）拆彩灯零掉落（G-129 已给 149 三处锚定臂但掉落面漏配）。
// 玩家挖除面本就经 styleDropVidOfFrames→holidayLightVid（style-drop-restore.test 锁值）,
// 本域现同源 holidayLightVid 单源接入。修复映射（KillTile 默认参=带掉落两路）：
//   ML1 摘 killDropFace case 149            → T-149a/b/c 红（三色掉落整缺）
//   ML2 killDropFace 内错档（fx=0→597）      → T-149a 红（域内错色;holidayLightVid
//                                              单源未动,style-drop-restore 仍绿=判别面独立）
//   ML3 通道2 摘 styleDropVidOfFrames 149 门 → T-149c 红（双通道对拍断言;★红蓝-J2
//                                              补口 2026-09-18,通道1/2 同走单源）
describe('★红蓝-G① 彩灯掉落面：killDropFace case 149 三色帧域（cs:66036-46）', () => {
  const CASES: Array<[number, number]> = [
    [0, 596], [54, 596],      // 蓝灯正/反向带
    [18, 597], [72, 597],     // 绿灯正/反向带
    [36, 598], [90, 598],     // 红灯正/反向带
  ];

  it('T-149a：直接拆除（kill 默认参）六帧域三色逐档 1:1', () => {
    for (const [fx, vid] of CASES) {
      const st = new TileStore(40, 80);
      st.setTileSilent(8, 60, S(149), fx, 0);
      const drops: DropRec[] = [];
      const evo = mkEvo(st, 7, drops);
      invoke(evo, 'kill', 8, 60);
      expect(st.type[st.idx(8, 60)]).toBe(0);
      const got = drops.filter((d) => d.vid > 0);
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({ vid, x: 8, y: 60, stack: 1 });
    }
  });

  it('T-149b：锚亡级联（killFlat 路径）三色各掉本档', () => {
    for (const [fx, vid] of CASES) {
      const st = new TileStore(40, 80);
      st.setTileSilent(6, 60, S(117), 0, 0);           // 锚（右侧,ValidAnchor 域）
      st.setTileSilent(5, 60, S(149), fx, 36);         // 彩灯右锚左伸向
      const drops: DropRec[] = [];
      const evo = mkEvo(st, 7, drops);
      invoke(evo, 'kill', 6, 60);                      // 挖锚 → 级联
      expect(st.type[st.idx(5, 60)]).toBe(0);          // 彩灯随锚清除
      expect(drops.filter((d) => d.vid === vid)).toHaveLength(1);
      expect(drops.filter((d) => d.vid > 0 && d.vid !== vid)).toHaveLength(0);
    }
  });

  it('T-149c：单源对拍+域外不掉——killDropFace ≡ styleDropVidOfFrames ≡ holidayLightVid（fx 0..108 全域扫）', () => {
    for (let fx = 0; fx <= 108; fx++) {
      const st = new TileStore(40, 80);
      st.setTileSilent(8, 60, S(149), fx, 0);
      const drops: DropRec[] = [];
      const evo = mkEvo(st, 7, drops);
      invoke(evo, 'kill', 8, 60);
      const vids = drops.map((d) => d.vid).filter((v) => v > 0);
      const want = holidayLightVid(fx);
      if (want === 0) expect(vids).toEqual([]);        // 域外帧=原版 dropItem 0 不掉
      else expect(vids).toEqual([want]);
      // ★红蓝-J2 补口：双通道同走 holidayLightVid 单源对拍——通道1=本域 killDropFace
      // （上面已扫）;通道2=玩家挖除面 styleDropVidOfFrames(149,…)（cs:66036-46 只读
      // frameX,fy 四向 0/18/36/54 均无关）。任一通道私改分档/摘门即红。
      for (const fy of [0, 18, 36, 54]) {
        expect(styleDropVidOfFrames(149, fx, fy)).toBe(want);
      }
    }
  });
});

// ============================================================ ★红蓝-G② 碎块辉光绘序（2026-09-18）
// 定谳：TileDrawing.cs glow 段「先」tileBatch 4×(band+72) 色副本（:1290-1295）、「后」
// α100 基底（:1313 color2=(255,255,255,100) → !flag3 尾画）——16×18 核心叠域 4 副本
// 互叠+基底盖顶 source-over 不可交换（Δ=αB·w4·(基底−tint),w4=1-(1-αg)^4>0）。本仓曾
// 反序（先基底后副本）→ 核心域微弱色差,已按原版序调正（drawShardCell 副本先行）。
// 变异证红映射：
//   MO1 回滚绘序（基底先画）              → T-序 红（基底 drawImage 先于辉光副本）
//   MO2 副本调用 α 记录非 1/基底非 100/255 → T-序 红（逐调用 α 语义同锁）
describe('★红蓝-G② 碎块绘序：辉光副本先于 α100 基底（TileDrawing.cs:1290→:1313）', () => {
  /** 记录桩 ctx + Node 无 DOM 下 shardTintedCopy 的最小画布件 */
  function shardDrawRecs(fx: number): Array<{ tex: unknown; alpha: number; ex: number; fy: number }> {
    (globalThis as unknown as { document: unknown }).document = {
      createElement(): unknown {
        const cv: Record<string, unknown> = { width: 0, height: 0 };
        cv.getContext = () => ({
          drawImage: () => undefined,
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            const data = new Uint8ClampedArray(w * h * 4);
            for (let p = 0; p < data.length; p += 4) { data[p] = 200; data[p + 1] = 180; data[p + 2] = 160; data[p + 3] = 255; }
            return { data, width: w, height: h };
          },
          putImageData: () => undefined,
        });
        return cv;
      },
    };
    try {
      const img = { width: 512, height: 512 };
      const recs: Array<{ tex: unknown; alpha: number; ex: number; fy: number }> = [];
      const ctx = {
        globalAlpha: 1,
        drawImage(tex: unknown, _a: number, _b: number, _c: number, _d: number, e: number, f: number) {
          recs.push({ tex, alpha: ctx.globalAlpha, ex: e, fy: f });
        },
      };
      drawShardCell(ctx as unknown as CanvasRenderingContext2D,
        { img: img as unknown as HTMLCanvasElement, sx: 36, sy: 0, sw: 16, sh: 18 },
        36, 0, 100, 200, 9, 7, fx);
      return recs;
    } finally {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  }

  it('T-序：大簇 fx>=324 → 4 辉光副本先入（α=1,±2 四向）、α100 基底尾画盖顶', () => {
    const recs = shardDrawRecs(324);
    expect(recs).toHaveLength(5);
    for (const r of recs.slice(0, 4)) {
      expect(r.tex).not.toBe(recs[4].tex);           // 前四=染色副本画布
      expect(r.alpha).toBe(1);                       // 副本 α 由 tint 像素承载
    }
    expect([recs[0].ex - 100, recs[0].fy - 200]).toEqual([2, 0]);   // ToRotationVector2 四向
    expect([recs[1].ex - 100, recs[1].fy - 200]).toEqual([0, 2]);
    expect([recs[2].ex - 100, recs[2].fy - 200]).toEqual([-2, 0]);
    expect([recs[3].ex - 100, recs[3].fy - 200]).toEqual([0, -2]);
    expect(recs[4].alpha).toBeCloseTo(SHARD_BASE_ALPHA, 12);        // 基底 (255,255,255,100)
  });

  it('T-小簇：fx<324 → 仅基底单画（无辉光副本,早退语义保持）', () => {
    const recs = shardDrawRecs(18 * 17);             // 306 < 324
    expect(recs).toHaveLength(1);
    expect(recs[0].alpha).toBeCloseTo(SHARD_BASE_ALPHA, 12);
  });

  it('T-差：核心叠域调序前后像素差 >0（source-over 不可交换的直证;金标 α/tint 值）', () => {
    const ab = SHARD_BASE_ALPHA;                     // 100/255（T-α 金标锁定）
    const ag = 38 / 255;                             // tint α=38（T-glow 金标锁定）
    const B = [255, 255, 255];                       // 基底核域白（不透明纹素）
    const C = [15, 0, 76];                           // shardGlowTint(0,0,0) 金标值
    const w4 = 1 - Math.pow(1 - ag, 4);              // 4 副本累计覆盖权
    const copyFirst = B.map((b, i) => ab * b + (1 - ab) * (w4 * C[i]));   // 原版序：副本先、基底后
    const baseFirst = B.map((b, i) => w4 * C[i] + (1 - w4) * (ab * b));   // 旧反序：基底先、副本后
    const d = Math.max(...copyFirst.map((v, i) => Math.abs(v - baseFirst[i])));
    expect(d).toBeGreaterThan(0);                    // 理论值 ≈ ab·w4·max|B-C| ≈ 47.6
  });
});
