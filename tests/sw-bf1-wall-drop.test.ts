// SW-BF1 2026-09-06：锤背景墙不掉落墙物品（用户实报）回归。
// 原版语义（Terarria1457）：玩家锤墙 Player.PickWall :46330-46351 → KillWall :60859-60899
//   ① KillWall_CheckFailure :60901-60912：wallDungeon（Main.cs:10507-10515 {7,8,9,94-99}）
//      需 downedBoss3、87 蜥蜴墙需 downedGolemBoss → fail 时墙保持原状、不掉物（尘/音照放）；
//   ② KillWall_DropItems :60934-60941 → KillWall_GetItemDrops :60943-61834：表内墙掉对应
//      物品 ×1（Item.NewItem stack 缺省 1），表外墙=0 不掉（自然土/黑檀石/Cave/草墙 Unsafe 族）。
// 消费面：玩家锤墙（Game.tryMine 锤支）/ 钻头坐骑（Mount.cs:3172 → 同一 PickWall）/
//   ReplaceWall 换墙（WorldGen.cs:63054 内联 DropItems）。
// 测试分层：A=表权威（独立行状态机重推导,与提取器互异算法,防表腐烂）+ 1458 零漂移；
//   B=纯函数 fail 门；C=行为面（锤/钻头/换墙/非玩家清墙）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { HitTile } from '../src/core/HitTile';
import { World } from '../src/world/World';
import { WALL_DROPS, killWallCheckFailure, wallDropItemVid, WALL_DUNGEON_WALLS } from '../src/data/wallDrops';
import { VI } from '../src/data/itemKeys';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// ---------- A. 表权威：独立重推导（行状态机,与 wallDrops.ts 生成的正则 matchAll 族算法互异） ----------
/** 独立解析 KillWall_GetItemDrops：跟踪 pending case 组 / if 条件 wall 集，赋值行结算。 */
function parseKillWallGetItemDrops(path: string): Map<number, number> {
  const lines = readFileSync(path, 'utf8').split('\n');
  const s = lines.findIndex((l) => l.includes('private static int KillWall_GetItemDrops'));
  expect(s, `${path} 缺 KillWall_GetItemDrops`).toBeGreaterThan(0);
  let e = -1;
  for (let i = s + 1; i < lines.length; i++) if (lines[i] === '\t}') { e = i; break; }
  expect(e, 'KillWall_GetItemDrops 收口未找到').toBeGreaterThan(0);
  const map = new Map<number, number>();
  let curCases: number[] = [];
  let curIfWalls: number[] = [];
  for (let i = s + 1; i < e; i++) {
    const L = lines[i].trim();
    const cm = /^case (\d+):$/.exec(L);
    if (cm) { curCases.push(Number(cm[1])); continue; }
    const im = /^(?:\} )?(?:else )?if \((.*)\)$/.exec(L);
    if (im && /tileCache\.wall/.test(im[1])) {
      curIfWalls = [];
      for (const x of im[1].matchAll(/tileCache\.wall == (\d+)/g)) curIfWalls.push(Number(x[1]));
      const rg = /tileCache\.wall >= (\d+) && tileCache\.wall <= (\d+)/.exec(im[1]);
      if (rg) for (let w = Number(rg[1]); w <= Number(rg[2]); w++) curIfWalls.push(w);
      continue;
    }
    const am = /^(?:return|result =) (\d+)(?: \+ tileCache\.wall - (\d+))?;$/.exec(L);
    if (am) {
      const val = Number(am[1]);
      const off = am[2] !== undefined ? Number(am[2]) : null;
      for (const w of (curCases.length ? curCases : curIfWalls)) map.set(w, off !== null ? val + w - off : val);
      curCases = [];
      curIfWalls = [];
    }
  }
  return map;
}

describe('SW-BF1 A. WALL_DROPS 表权威（KillWall_GetItemDrops 独立重推导）', () => {
  it('A1. 1457 源码逐值全等（双向：源→表与表→源）', () => {
    const derived = parseKillWallGetItemDrops(`${ROOT}/Terarria1457/Terraria/WorldGen.cs`);
    const table = new Map(Object.entries(WALL_DROPS).map(([w, v]) => [Number(w), v]));
    expect(derived.size, '源码侧墙数').toBe(table.size);
    for (const [w, v] of derived) expect(table.get(w), `wall ${w}`).toBe(v);
    for (const [w, v] of table) expect(derived.get(w), `wall ${w}`).toBe(v);
  });

  it('A2. 1458 零漂移（同函数同表,WallID 无数值面变更）', () => {
    const d1458 = parseKillWallGetItemDrops(`${ROOT}/Terarria1458/Terraria/WorldGen.cs`);
    const d1457 = parseKillWallGetItemDrops(`${ROOT}/Terarria1457/Terraria/WorldGen.cs`);
    expect(d1458.size).toBe(d1457.size);
    for (const [w, v] of d1457) expect(d1458.get(w), `wall ${w}`).toBe(v);
  });

  it('A3. 代表值抽检（放置墙 16→DirtWall 30 / 天然石墙 1→StoneWall 26 / 87 蜥蜴→1102 / 地牢 7→135）', () => {
    expect(wallDropItemVid(16)).toBe(30);
    expect(wallDropItemVid(1)).toBe(26);
    expect(wallDropItemVid(87)).toBe(1102);
    expect(wallDropItemVid(7)).toBe(135);
    // 不掉集合代表（GetItemDrops 未列 → 0）
    for (const w of [2, 3, 54, 62, 63, 69, 81, 170, 187, 216, 349, 350]) {
      expect(wallDropItemVid(w), `wall ${w} 应不掉`).toBe(0);
    }
    // 掉落物品必须已注册（VI('') 才会静默丢件——全覆盖防呆）
    for (const vid of Object.values(WALL_DROPS)) {
      expect(VI(vid), `物品 ${vid} 未注册`).not.toBe('');
    }
  });
});

describe('SW-BF1 B. killWallCheckFailure（KillWall_CheckFailure :60901-60912）', () => {
  it('B1. wallDungeon 墙需骷髅王；87 需石巨人；普通墙恒过', () => {
    for (const w of WALL_DUNGEON_WALLS) {
      expect(killWallCheckFailure(w, false, false), `wall ${w} 未败骷髅王应 fail`).toBe(true);
      expect(killWallCheckFailure(w, true, false), `wall ${w} 已败骷髅王应过`).toBe(false);
    }
    expect(killWallCheckFailure(87, true, false)).toBe(true);
    expect(killWallCheckFailure(87, true, true)).toBe(false);
    expect(killWallCheckFailure(16, false, false)).toBe(false);
  });
});

// ---------- C. 行为面 ----------
type Drop = { x: number; y: number; key: string; n: number };
interface HG {
  netCanEditTile: () => boolean;
  world: World;
  hitTiles: HitTile;
  tickCount: number;
  lastMineHitTick: number;
  mining: unknown;
  hardnessCache: number;
  hammerPoundRelease: boolean;
  player: Record<string, unknown>;
  smartCursor: Record<string, unknown>;   // BJ10 smartCursor 门 stub（tryPlaceWall 不读,兜面）
  inTileRange: (...a: unknown[]) => boolean;
  spawnParticles: (...a: unknown[]) => void;
  sfx: { play: (...a: unknown[]) => void };
  spawnDrop: (x: number, y: number, key: string, n: number, vx?: number, vy?: number) => null;
  drops: Drop[];
  pruneHitTiles: () => void;
  tryMine: (x: number, y: number, p: number, t: 'hammer', s: number, u?: number) => void;
  drillPickWall: (x: number, y: number) => void;
}

function mkGame(): { g: HG; st: World['store']; w: World } {
  const w = new World(48, 64, 20, 'open');
  const drops: Drop[] = [];
  const g = Object.create(Game.prototype) as unknown as HG;
  g.netCanEditTile = () => true;
  g.world = w;
  g.hitTiles = new HitTile();
  g.tickCount = 0;
  g.lastMineHitTick = -999;
  g.mining = null;
  g.hardnessCache = 0;
  g.hammerPoundRelease = false;
  g.player = { buffs: { has: () => false, wellFedTier: 0, hungerPickSpeed: 0 }, usedAmbrosia: false, equipStats: {}, inv: { removeHeld: () => true } };
  // ★SW-BJ12 2026-09-07 重钉：BJ10 smartCursor 门缺 stub（tryPlaceWall 不读,兜面）
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.inTileRange = () => true;
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x, y, key, n) => { drops.push({ x, y, key, n }); return null; };
  g.drops = drops;
  g.pruneHitTiles = () => {};
  return { g, st: w.store, w };
}

describe('SW-BF1 C1. 玩家锤墙掉落（tryMine 锤支 → PickWall/KillWall 全语义）', () => {
  it('C1a. 房墙（Dirt 16）：拆墙掉 Dirt Wall ×1 @格中心', () => {
    const { g, st } = mkGame();
    st.setWall(24, 40, 16);
    g.tryMine(24, 40, 67, 'hammer', 20);   // floor(67×1.5)=100 一击拆
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(g.drops).toHaveLength(1);
    expect(g.drops[0]).toMatchObject({ key: VI(30), n: 1, x: 24 * 16 + 8, y: 40 * 16 + 8 });
  });

  it('C1b. 不掉集合（天然土墙 2 DirtUnsafe）：墙拆但不掉物', () => {
    const { g, st } = mkGame();
    st.setWall(24, 40, 2);
    g.tryMine(24, 40, 67, 'hammer', 20);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(g.drops).toHaveLength(0);
  });

  it('C1c. 地牢墙 fail 门（7 蓝地牢墙）：未败骷髅王墙保持原状不掉物；败后拆+掉 135', () => {
    const { g, st, w } = mkGame();
    st.setWall(24, 40, 7);
    g.tryMine(24, 40, 67, 'hammer', 20);
    expect(st.wall[st.idx(24, 40)]).toBe(7);        // fail：墙保持（KillWall :60890-60892 早退）
    expect(g.drops).toHaveLength(0);
    expect(g.hitTiles.getDamage(24, 40, 2)).toBe(0); // PickWall :46333 已先 Clear
    w.flags.downedSkeletron = true;
    g.tickCount = 100;
    g.tryMine(24, 40, 67, 'hammer', 20);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(g.drops).toHaveLength(1);
    expect(g.drops[0]).toMatchObject({ key: VI(135), n: 1 });
  });

  it('C1d. 蜥蜴墙 87 fail 门（石巨人 245）', () => {
    const { g, st, w } = mkGame();
    st.setWall(24, 40, 87);
    g.tryMine(24, 40, 67, 'hammer', 20);
    expect(st.wall[st.idx(24, 40)]).toBe(87);
    expect(g.drops).toHaveLength(0);
    w.flags['downed_245'] = true;
    g.tickCount = 100;
    g.tryMine(24, 40, 67, 'hammer', 20);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(g.drops.map((d) => d.key)).toEqual([VI(1102)]);
  });
});

describe('SW-BF1 C2. 钻头坐骑拆墙（drillPickWall → Mount.cs:3172 → PickWall 同语义）', () => {
  it('C2a. 表内墙：一击拆（210≥100）+ 掉 1 件', () => {
    const { g, st } = mkGame();
    st.setWall(24, 40, 16);
    g.drillPickWall(24, 40);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(g.drops).toHaveLength(1);
    expect(g.drops[0]).toMatchObject({ key: VI(30), n: 1 });
  });

  it('C2b. 不掉集合墙：拆但不掉', () => {
    const { g, st } = mkGame();
    st.setWall(24, 40, 2);
    g.drillPickWall(24, 40);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(g.drops).toHaveLength(0);
  });

  it('C2c. fail 门：未败骷髅王钻头也拆不动地牢墙（原版同链 PickWall :46339）', () => {
    const { g, st } = mkGame();
    st.setWall(24, 40, 7);
    g.drillPickWall(24, 40);
    expect(st.wall[st.idx(24, 40)]).toBe(7);
    expect(g.drops).toHaveLength(0);
  });
});

describe('SW-BF1 C3. 换墙掉旧墙物（tryPlaceWall 替换支 → ReplaceWall :63054 内联 DropItems）', () => {
  it('C3. 旧墙 16 换铺墙 1：掉 Dirt Wall ×1，旧墙物≠新墙物', () => {
    const { g, st, w } = mkGame();
    st.setWall(24, 40, 16);
    st.setWall(25, 40, 16);   // 邻接门（PlaceThing 四邻至少一格 active 或 wall>0）
    (g as unknown as Record<string, unknown>).cb = { onInventoryChanged: () => {} };
    (g as unknown as Record<string, unknown>).paintWallSpeed = () => 1;
    (g as unknown as { tryPlaceWall: (x: number, y: number, d: { wallId: number }) => void })
      // ★SW-BJ12：换墙冷却取 itemDef useTime（:40137）——def 补 vi_ 键供 vid 反解
      .tryPlaceWall(24, 40, { wallId: 1, key: 'vi_30_stone_wall' } as { wallId: number });
    expect(st.wall[st.idx(24, 40)]).toBe(1);
    const keys = g.drops.map((d) => d.key);
    expect(keys).toContain(VI(30));            // 旧墙 Dirt Wall 掉落
    expect(keys).not.toContain(VI(26));        // 新墙 Stone Wall 不因换墙凭空掉
  });
});

describe('SW-BF1 C4. 非玩家清墙不掉（世界生成/网络 op 面 setWall(0) 无掉落）', () => {
  it('C4. TileStore.setWall/setWallSilent 直接清墙零掉落（掉落只挂玩家拆除面）', () => {
    const { g, st } = mkGame();
    st.setWall(24, 40, 16);
    st.setWall(24, 40, 0);
    st.setWallSilent(25, 40, 16);
    st.setWallSilent(25, 40, 0);
    expect(st.wall[st.idx(24, 40)]).toBe(0);
    expect(g.drops).toHaveLength(0);
  });
});

// ---------- SW-BL1 2026-09-06 D. 爆炸清墙（ExplodeTiles wallSplode 支 Projectile.cs:80485-80492 →
//  WorldGen.KillWall 全语义）——掉落+fail 门与锤墙/钻头面同构。桩形制=ghost-place-swap shell()
//  （真实 Game 原型 + 最小消费面,player 远离爆心走零自伤）。 ----------
interface BoomShell {
  explodeAt: (tx: number, ty: number, dmg: number, r: number, dest: boolean,
    hb?: number, pen?: number, pid?: number) => void;
}
function mkBoomGame(): { g: Record<string, unknown> & BoomShell; st: World['store']; w: World;
  drops: Array<{ key: string; n: number }> } {
  const w = new World(40, 40, 7, 'open');
  const drops: Array<{ key: string; n: number }> = [];
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & BoomShell;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = { play: () => {} };
  g.entities = { critters: [], enemies: [], npcs: [], projectiles: [] };
  g.spawnParticles = () => {};
  g.recLog = () => {};
  g.spawnDrop = (_x: unknown, _y: unknown, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {} };
  g.player = {
    cx: -500, cy: -500, x: -510, y: -521, w: 12, h: 28,   // 远离爆心 → 自伤支不达
    facing: 1, buffs: { has: () => false }, equipStats: {}, hp: 100, luck: 0,
  };
  return { g, st: w.store, w, drops };
}

describe('SW-BL1 D. 爆炸清墙 KillWall 全语义（explodeAt destroyTiles=true）', () => {
  it('D1. 房墙 16：爆区墙清除且掉 Dirt Wall ×1 @格中心；爆区外墙原样', () => {
    const { g, st, drops } = mkBoomGame();
    for (let y = 16; y <= 24; y++) {
      for (let x = 16; x <= 24; x++) st.setTileSilent(x, y, 1);   // 石体（tile 1=stone）
    }
    for (let y = 16; y <= 24; y++) for (let x = 16; x <= 24; x++) st.setWallSilent(x, y, 16);
    st.setWallSilent(19, 19, 0);                                  // 无墙口袋（ShouldWallExplode 预扫需任一 disc 格无墙）
    st.setWallSilent(2, 2, 16);                                   // 爆区外负对照
    (g as unknown as { explodeAt: (...a: unknown[]) => void }).explodeAt(20, 20, 100, 3, true);
    expect(st.wall[st.idx(20, 20)]).toBe(0);
    expect(st.wall[st.idx(17, 23)]).toBe(0);                      // 邻域带边缘（17-23 全覆盖）
    expect(st.wall[st.idx(2, 2)]).toBe(16);
    const woodDrops = drops.filter((d) => d.key === VI(30));
    expect(woodDrops.length).toBeGreaterThanOrEqual(20);          // 邻域清墙窗 (17-23)²=49 格
    expect(woodDrops.every((d) => d.n === 1)).toBe(true);
  });

  it('D2. fail 门：未败骷髅王爆炸拆不动地牢墙 7（墙保持+零掉落）；败后同场景照清照掉 135', () => {
    const { g, st, w, drops } = mkBoomGame();
    for (let y = 16; y <= 24; y++) {
      for (let x = 16; x <= 24; x++) {
        st.setTileSilent(x, y, 1);
        st.setWallSilent(x, y, 7);
      }
    }
    st.setWallSilent(19, 19, 0);                                  // 无墙口袋（同 D1 预扫面）
    (g as unknown as { explodeAt: (...a: unknown[]) => void }).explodeAt(20, 20, 100, 3, true);
    expect(st.wall[st.idx(20, 20)]).toBe(7);                      // fail：爆心墙保持原状
    expect(st.wall[st.idx(18, 21)]).toBe(7);
    expect(drops.filter((d) => d.key === VI(135))).toHaveLength(0);
    w.flags.downedSkeletron = true;
    (g as unknown as { explodeAt: (...a: unknown[]) => void }).explodeAt(20, 20, 100, 3, true);
    expect(st.wall[st.idx(20, 20)]).toBe(0);
    expect(drops.filter((d) => d.key === VI(135)).length).toBeGreaterThan(0);
  });
});
