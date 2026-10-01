// BJ121 Repeated* 放置门三件族补位（南瓜 254/珊瑚 81+贝堆 324/彩虹巨石 711）。
// 原版锚（1457 亲读;1458 同文 diff=same——Player.cs 四函数体 1457 :41682-41745 /
// 1458 :41680-41743,调用点 1457 :40090-40093 / 1458 :40088-40091）：
//   · Pumpkins（:41682-41698）：data.type==254 → 点击格 2×2（i=-1..0,j=0..1）逐格
//     !WorldGen.CanCutTile（WorldGen.cs:88111-88125：下方格界内 ∧ 自身墙≠350
//     UnbreakableBlockWall WallID.cs:769 ∧ 下方格型∉{78 陶盆/380 种植箱/579 石魔头}
//     ∧ 自身=254 时 frameX≥144）→ 拒。Origin(0,1)=Style2x2 基底（TileObjectData.cs
//     addBaseTile(Style2x2) Origin=new Point16(0,1)）⇒ tileTarget=物件左下 →
//     扫描区=整幅足印。tileCut[254]=true（Main.cs:10385）。
//   · CoralAndBeachPiles（:41719-41729）：data.type∈{81,324} → 点击格（1×1
//     Origin(0,0)=目标格）active ∧ ∈ tileCut∪BreakableWhenPlacing（TileID.cs:383
//     含 81/324）∪IsADripTile（TileID.cs:157 {373,374,375,461,709}）→ 拒。
//   · RainbowBoulders（:41700-41717）：data.type==711 → 点击格起 (i=0..1,j=0..1)
//     任一 active 711 → 拒。Origin(0,1) ⇒ 扫描区=足印底行+底下锚行（足印顶行不在
//     扫描域=原版本相 quirk）。tileCut[711]=true（Main.cs:7606）。
//   豁免族归属（登记核验）：454 tileCut（Main.cs:8460）/254 tileCut（:10385）/
//   711 tileCut（:7606）/81+324 BreakableWhenPlacing（TileID.cs:383）——四件全属
//   tileCut∪BreakableWhenPlacing 占位豁免族,无翻案。
// 判别力：重复拒放+异位可放+成熟株换植+墙 350 臂+扫描域钉位,消费面判据=removeHeld
//   调用计数（成功放置唯一消费点）;变异 ≥3（摘南瓜门/摘珊瑚门/摘巨石门/巨石扫描域
//   改全足印→红）。
//
// ★拍板#4A（2026-09-18）南瓜变体掷 + 红蓝-I 勘误备案（④ 块新增）：
//   原版玩家链放置 254 = CanPlace :791-792 `Main.rand.Next(RandomStyleRange=6)`
//   （TileObjectData.cs:3503）→ objectData.random（:851）→ Place 竖排（254 承
//   Style2x2 基档 StyleHorizontal=false,CopyFrom :1707 共享 style 模块）→
//   frameY=36×掷（:867-880 num3=FullHeight×num4）=六视觉变体;与 worldgen
//   PlacePumpkin（`frameY=genRand.Next(6)*36` :52903）同轴同布,Tiles_254 图幅
//   10 列×12 行=成长 5 段在 X/变体 6 档在 Y 三方互证。红蓝-I「新植随机 0-5,
//   4/5 立即成熟（CanCutTile 可换植+高掉落 quirk）」的【即植即熟】半已被推翻：
//   掷落在 frameY（变体）带而非 frameX（成长）带,新植恒 stage0 未熟——
//   「CanCutTile 可换植」quirk 实为【对已成熟株】换植收割（BJ121-① 既有测试钉位,
//   与放置掷无关）。负判别=本块「恒 stage0」+既有「重复拒放」测试。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { anchorSpecOf } from '../src/world/TileAnchorValidator';

const PUMPKIN = TILE_BY_KEY['v_254_pumpkin_plant']!;
const CORAL = TILE_BY_KEY['v_81_coral']!;
const SHELLS = TILE_BY_KEY['v_324_seashells']!;
const RBOULDER = TILE_BY_KEY['v_711_rainbow_boulder']!;
const STONE = TILE_BY_KEY['stone']!;
const GRASS = TILE_BY_KEY['grass']!;                     // 254 草族锚 {2,109,477,492}（Check2x2Style :52786 特支）
const TALLGRASS = TILE_BY_KEY['tallgrass']!;
const DRIP373 = TILE_INTERNAL_BY_SHEET.get(373)!;

const placeItem = (sheetKey: string) => {
  const def = ITEM_DEFS[ITEM_BY_KEY[`place_${sheetKey}`]!];
  expect(def?.tile).toBeTruthy();
  return def;
};

/** tryPlace 可驱动面最小桩（shell 形制同 tests/bj114-pigronata-tileface.test.ts;
 *  removeHeld 计数=放置成功判据——tryPlace 唯一消费点,门拒放不触） */
interface GShell {
  world: World;
  player: Record<string, unknown> & { useTime: number };
  smartCursor: { lockedContinuity: null; showing: boolean; x: number; y: number };
  chunks: { markDirtyArea: (...a: unknown[]) => void };
  sfx: { play: (name: string, v?: number, x?: number, y?: number) => void; playWavFile: (...a: unknown[]) => void };
  cb: { onInventoryChanged: () => void };
  entities: Record<string, unknown>;
  spawnParticles: (x: number, y: number, color: string, n: number, s?: number) => void;
  spawnDrop: (x: number, y: number, key: string, n: number, vx?: number, vy?: number) => unknown;
  recLog: (...a: unknown[]) => void;
  dumpChest: () => void;
  killTileDropBait: () => void;
  trackTile: number;
  flexWandCycle: number;   // ★X2:类字段（Game.ts:3311）壳上须显式补桩
  scene: unknown;
  hitTiles: { addDamage: () => number; clear: () => void };
  achievements: unknown;
  tryPlace: (x: number, y: number, def: unknown) => void;
  breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean) => void;
  checkFurnitureSupport: (x: number, y: number) => void;
}
function mkShell(seed = 11): { g: GShell; w: World; consumed: { n: number } } {
  const w = new World(40, 40, seed, 'bj121-repeated-gates');
  const consumed = { n: 0 };
  const g = Object.create(Game.prototype) as unknown as GShell;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { nextId: 1, add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = () => null;
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.trackTile = 0;
  g.flexWandCycle = 0;   // ★X2 补桩（2026-10-01）:BJ362（260f52a4）place_v 克隆退位→vid 275/2625 真件走 FlexibleTileWand 支,类字段壳上不初始化=NaN 解构炸
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    cx: 10 * 16 + 8, cy: 13 * 16 + 8, x: 10 * 16 + 2, y: 13 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false, dead: false, isGhostPhase: () => false,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0, slots: new Array(60).fill(null),
      heldItem: () => ({ id: -1, stack: 9 }),
      removeHeld: () => { consumed.n++; },
      removeAt: () => {}, countOf: () => 0,
    },
  };
  return { g, w, consumed };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ121-⓪ 数据面：豁免族归属（tileCut/BreakableWhenPlacing/IsADripTile）+ 锚形态', () => {
  it('四件全属 tileCut∪BreakableWhenPlacing 占位豁免族（Main.cs/TileID.cs 亲读值）', () => {
    expect(TILE_DEFS[PUMPKIN].vanilla?.sheet).toBe(254);
    expect(TILE_DEFS[CORAL].vanilla?.sheet).toBe(81);
    expect(TILE_DEFS[SHELLS].vanilla?.sheet).toBe(324);
    expect(TILE_DEFS[RBOULDER].vanilla?.sheet).toBe(711);
    // 豁免族数据面：tile-anchors Origin 与反编译逐值同（扫描域映射的前提）
    const p = anchorSpecOf(254)!; const r = anchorSpecOf(711)!;
    const c = anchorSpecOf(81)!; const s = anchorSpecOf(324)!;
    expect([p.w, p.h, p.ox, p.oy]).toEqual([2, 2, 0, 1]);   // Style2x2 基底 Origin(0,1)
    expect([r.w, r.h, r.ox, r.oy]).toEqual([2, 2, 0, 1]);
    expect([c.w, c.h, c.ox, c.oy]).toEqual([1, 1, 0, 0]);
    expect([s.w, s.h, s.ox, s.oy]).toEqual([1, 1, 0, 0]);
  });
});

describe('BJ121-① 南瓜 254：整幅足印 CanCutTile 门（Player.cs:41682-41698）', () => {
  it('空地可放（异位可放基线）：2×2 四格 + 帧格（frameX=dx*18 stage0/.frameY=36×掷带+dy*18）', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);    // 草地面（254 草族锚特支）
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
    expect(consumed.n).toBe(1);                          // 成功=消耗 1
    const band = st.frameY[st.idx(12, 11)];
    expect(band % 36).toBe(0);                           // 变体带基=36×掷（拍板#4A,0..180）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const i = st.idx(12 + dx, 11 + dy);
        expect(st.get(12 + dx, 11 + dy)).toBe(PUMPKIN);
        expect(st.frameX[i]).toBe(dx * 18);              // stage0（<144=未成熟）——掷只落 frameY 带
        expect(st.frameY[i]).toBe(band + dy * 18);       // 同件四格同带+行 18 步进
      }
    }
  });

  it('重复拒放（未成熟株上补位=吞株）：拒放零消耗+旧株四格完好', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
    expect(consumed.n).toBe(1);
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));   // 同位重放：足印全 254 未成熟
    expect(consumed.n).toBe(1);                          // 门拒=零消耗（清格相未吞旧株）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(st.get(12 + dx, 11 + dy)).toBe(PUMPKIN);  // 旧株完好
      }
    }
  });

  it('成熟株（frameX≥144）可换植=收割态补位本相：清旧写新（frameX 回 stage0）', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);
    // 手置成熟株（GrowPumpkin frameX+=36 逐级终态 stage4={144,162}）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        st.setTileSilent(12 + dx, 11 + dy, PUMPKIN, 144 + dx * 18, dy * 18);
      }
    }
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
    expect(consumed.n).toBe(1);                          // 门放行=成功
    expect(st.frameX[st.idx(12, 11)]).toBe(0);           // 新株 stage0（旧 144 已清）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        expect(st.get(12 + dx, 11 + dy)).toBe(PUMPKIN);
      }
    }
  });

  it('墙 350 臂（UnbreakableBlockWall）：足印任一格墙=350 拒放,清墙后可放', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);
    st.wall[st.idx(13, 12)] = 350;                       // 足印一格背后不可破坏墙
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
    expect(consumed.n).toBe(0);                          // CanCutTile false → 拒
    st.wall[st.idx(13, 12)] = 0;
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
    expect(consumed.n).toBe(1);
  });

  it('CanCutTile 下方格臂 1:1：下方∈{78 陶盆,380 种植箱,579 石魔头}→false;石→true;越界→false', () => {
    const { g, w } = mkShell();
    const st = w.store;
    const canCut = (g as unknown as { canCutTilePlacement: (s: unknown, x: number, y: number) => boolean }).canCutTilePlacement.bind(g);
    st.setTileSilent(12, 13, TILE_INTERNAL_BY_SHEET.get(380)!, 0, 0);   // 种植箱
    expect(canCut(st, 12, 12)).toBe(false);
    st.setTileSilent(12, 13, TILE_INTERNAL_BY_SHEET.get(78)!, 0, 0);    // 陶盆
    expect(canCut(st, 12, 12)).toBe(false);
    st.setTileSilent(12, 13, TILE_INTERNAL_BY_SHEET.get(579)!, 0, 0);   // 石魔头
    expect(canCut(st, 12, 12)).toBe(false);
    st.setTileSilent(12, 13, STONE, 0, 0);
    expect(canCut(st, 12, 12)).toBe(true);
    expect(canCut(st, 12, st.h - 1)).toBe(false);        // 下方越界=原版 tile null → false
  });
});

// ===========================================================================
// ④ 拍板#4A：南瓜变体掷（RandomStyleRange=6 → frameY 带）+ 红蓝-I「即植即熟」
//    推翻备案（证据链见文件头注）。判据：掷确定性 + 六带统计（6× 判例）+
//    恒 stage0 负判别 + 行归一不变式（growPumpkin/breakPumpkin 锚推导）。
// ===========================================================================
describe('BJ121-④ 拍板#4A 南瓜 254 变体掷（CanPlace :791-92 → frameY=36×掷）', () => {
  it('掷序确定性：rand=0.5 → 带 108（floor(0.5×6)=3）;frameX 恒 stage0、行 18 步进', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);
    const real = Math.random;
    Math.random = () => 0.5;
    try {
      g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
    } finally {
      Math.random = real;
    }
    expect(consumed.n).toBe(1);
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const i = st.idx(12 + dx, 11 + dy);
        expect(st.frameY[i]).toBe(108 + dy * 18);        // 36×3 变体带
        expect(st.frameX[i]).toBe(dx * 18);              // 成长档不受掷影响=恒新植 stage0
      }
    }
  });

  it('六变体统计（6× 判例）：600 次独立放置六带全命中', () => {
    const { g, w } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);    // 草地面（支撑锚）
    const bands = new Set<number>();
    for (let n = 0; n < 600; n++) {
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) st.setTileSilent(12 + dx, 11 + dy, 0, 0, 0);   // 清足印重试
      }
      (g.player as unknown as { useTime: number }).useTime = 0;
      g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
      bands.add(st.frameY[st.idx(12, 11)]);
    }
    expect(bands).toEqual(new Set([0, 36, 72, 108, 144, 180]));
  });

  it('负判别（红蓝-I「即植即熟」推翻）：任意掷值下 frameX<144=未熟——即植株重复放置门拒（换植收割仅对成熟株）', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
    expect(consumed.n).toBe(1);
    expect(st.frameX[st.idx(12, 11)]).toBeLessThan(144);  // 新植恒 stage0（最大带 180 也只写 frameY）
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant')); // 即植株上补位 → CanCutTile 假 → 拒
    expect(consumed.n).toBe(1);                           // 零追加消耗=门拒
  });

  it('行归一不变式：floor(frameY/18)%2 行恢复（breakPumpkin/growPumpkin 锚推导）对六带全成立', () => {
    const { g, w } = mkShell();
    const st = w.store;
    const real = Math.random;
    try {
      for (let band = 0; band < 6; band++) {
        for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, GRASS, 0, 0);
        for (let dx = 0; dx < 2; dx++) {
          for (let dy = 0; dy < 2; dy++) st.setTileSilent(12 + dx, 11 + dy, 0, 0, 0);
        }
        Math.random = () => band / 6 + 0.01;              // floor(×6)=band
        (g.player as unknown as { useTime: number }).useTime = 0;
        g.tryPlace(12, 12, placeItem('v_254_pumpkin_plant'));
        expect(st.frameY[st.idx(12, 11)]).toBe(36 * band);
        // 任意格反推锚=左上（breakPumpkin ax/ay 同式;WorldEvolution.growPumpkin 同式）
        const i1 = st.idx(13, 12);
        const ax = 13 - (Math.floor(st.frameX[i1] / 18) % 2);
        const ay = 12 - (Math.floor(st.frameY[i1] / 18) % 2);
        expect([ax, ay]).toEqual([12, 11]);
      }
    } finally {
      Math.random = real;
    }
  });
});

describe('BJ121-② 珊瑚 81/贝壳沙滩堆 324：目标格可清族门（Player.cs:41719-41729）', () => {
  it('空格可放基线：81 落格（锚=上空+下实心）', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, STONE, 0, 0);
    g.tryPlace(12, 12, placeItem('v_81_coral'));
    // ★X2 重锚（2026-10-01）:BJ362 后珊瑚=vanilla FlexibleTileWand.Coral 自体魔杖
    //  （FlexibleTileWand.cs:52 CreateSingleTileWand(275,81,0..5).WithoutAmmoConsumption
    //  ——消耗门 Player.cs:40493-40501 ConsumesAmmoItem=false 不扣件=原版本相;
    //  旧克隆件路径的 removeHeld 消费随克隆退役,判据改「落格+零消耗」）
    expect(consumed.n).toBe(0);
    expect(st.get(12, 12)).toBe(CORAL);
  });

  it('重复拒放：81 目标格 active（BreakableWhenPlacing 臂）→ 拒放零消耗旧件完好', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(10 + dx, 13, STONE, 0, 0);
    st.setTileSilent(12, 12, CORAL, 0, 0);               // 既置珊瑚
    g.tryPlace(12, 12, placeItem('v_81_coral'));
    expect(consumed.n).toBe(0);                          // 裸 CanPlace 对 BWP 族豁免,本门补位拒
    expect(st.get(12, 12)).toBe(CORAL);                  // 旧珊瑚未被清格相吞
  });

  it('tileCut 臂 + IsADripTile 臂：高草/滴管装饰占目标格同拒', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 8; dx++) st.setTileSilent(10 + dx, 13, STONE, 0, 0);
    st.setTileSilent(11, 12, TALLGRASS, 0, 0);           // 高草 ∈ tileCut
    g.tryPlace(11, 12, placeItem('v_81_coral'));
    expect(consumed.n).toBe(0);
    expect(st.get(11, 12)).toBe(TALLGRASS);              // 草未被吞
    st.setTileSilent(12, 12, DRIP373, 0, 0);             // 滴管装饰 ∈ IsADripTile
    g.tryPlace(12, 12, placeItem('v_81_coral'));
    expect(consumed.n).toBe(0);
    expect(st.get(12, 12)).toBe(DRIP373);
  });

  it('贝壳沙滩堆 324 同门同判：空格可放/既置 324 拒', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 8; dx++) st.setTileSilent(10 + dx, 13, STONE, 0, 0);
    g.tryPlace(11, 12, placeItem('v_324_seashells'));
    // ★X2 重锚（2026-10-01）:同珊瑚——Seashell=自体魔杖 WithoutAmmoConsumption
    //  （FlexibleTileWand.cs:54;消耗门 Player.cs:40493-40501）,放置/拒放均零消耗
    expect(consumed.n).toBe(0);
    expect(st.get(11, 12)).toBe(SHELLS);
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(11, 12, placeItem('v_324_seashells'));
    expect(consumed.n).toBe(0);                          // 拒=零追加消耗（放置本身亦零消耗）
    expect(st.get(11, 12)).toBe(SHELLS);
  });
});

describe('BJ121-③ 彩虹巨石 711：足印底行+锚行同型门（Player.cs:41700-41717）', () => {
  it('空地可放基线：2×2 四格+异位第二件可放（互不干扰）', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 14; dx++) st.setTileSilent(10 + dx, 13, STONE, 0, 0);
    g.tryPlace(12, 12, placeItem('v_711_rainbow_boulder'));
    expect(consumed.n).toBe(1);
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) expect(st.get(12 + dx, 11 + dy)).toBe(RBOULDER);
    }
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(15, 12, placeItem('v_711_rainbow_boulder'));   // 异位（x=15 射程内,扫描域无 711）
    expect(consumed.n).toBe(2);
    expect(st.get(15, 12)).toBe(RBOULDER);
  });

  it('重复拒放：同位重放（扫描域含旧件底行）拒放零消耗旧件完好', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 8; dx++) st.setTileSilent(10 + dx, 13, STONE, 0, 0);
    g.tryPlace(12, 12, placeItem('v_711_rainbow_boulder'));
    expect(consumed.n).toBe(1);
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(12, 12, placeItem('v_711_rainbow_boulder'));
    expect(consumed.n).toBe(1);                          // 门拒（扫描域 (12..13,12..13) 含旧底行 711）
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) expect(st.get(12 + dx, 11 + dy)).toBe(RBOULDER);
    }
  });

  it('扫描域钉位（原版 quirk 1:1）：足印【顶行】711 不在扫描域 → 放行不拒（改全足印判域=红）', () => {
    const { g, w, consumed } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 8; dx++) st.setTileSilent(10 + dx, 13, STONE, 0, 0);
    // 手置 711 仅在新件足印顶行位（Origin(0,1) ⇒ tileTarget=左下,门扫 (tx..tx+1,ty+1..ty+2)
    // =底行+锚行,顶行 (tx..tx+1,ty) 不入域——上提一格重叠原版不拦,重叠格走清格相）
    st.setTileSilent(12, 11, RBOULDER, 0, 0);
    st.setTileSilent(13, 11, RBOULDER, 0, 0);
    g.tryPlace(12, 12, placeItem('v_711_rainbow_boulder'));
    expect(consumed.n).toBe(1);                          // 门未拦=成功（扫描域钉位判据）
    expect(st.get(12, 12)).toBe(RBOULDER);               // 新件底行落位
  });
});
