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
//     case 129（cs:85727-85752）→ CheckAndAdjustMultiDirectionalTile（cs:60805-60855，
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
import {
  animYOffset, crystalShardAddFrX, tileAnim,
} from '../src/render/TileAnim';

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
describe('★G-129 运行时面：锚亡杀+掉落（TileFrameImportant case 129 cs:85727-85752）', () => {
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

  it('重锚支：锚仍在 → 按优先向重落 frameY（原版无条件写,cs:85739-85750）', () => {
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
