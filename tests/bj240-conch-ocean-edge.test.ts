// BJ240 2026-09-21 贝壳电话/魔法海螺「只能传送到左侧海洋」实报定谳 = 原版忠实（零修刀）。
// 金标：TeleportHelpers.cs:49-241（1458 diff=same）+ Player.MagicConch（Player.cs:56755-56830）
//       + WorldGen.InWorld（WorldGen.cs:9642-9648：x<fluff ∨ x≥maxTilesX-fluff → false）
//       + SolidOrSlopedTile(includePlatforms:true)（WorldGen.cs:70515-70538：平台=合法落位面）。
// 物证：/tmp/bj240-evidence.wld（用户微信地图,不入库,仅 /tmp;tools/_bj240-conch-wld.test.ts
//       SW_ORACLE=1 定谳仪）——w=6400 groundLevel=493,两缘人造平台甲板（type11/sheet19）：
//       右缘 [6354..6364]@y=414 干燥甲板（甲板外 [6365..6399] 才是水）、左缘 (40,312) 浸水
//       甲板（platform+liquid=127）。右洋爬行起点列 x=maxTilesX-40=6360 恰被甲板盖住 →
//       零爬行步（num10=0）直接落甲板顶 (6360,413) → InWorld(x≥w-40) 恒假 → 右洋尝试必败
//       → Player.MagicConch 回退臂落左洋 (40,311)。左洋起点 x=40 零爬行落位合法（40≥40）。
//       ⇒ 原版 InWorld 边界的左右不对称：左缘可「零爬行落位」、右缘必须 ≥1 爬行步。
//       自然世界（起点列=水,对照 bj43-b 档案）两洋皆可达 =「有的地图正常」。
// 锁面：本文件断言 = 原版语义。若有人「友好化」InWorld 边界 / 摘 includePlatforms 平台臂
//       / 改起点列,本文件爆红（变异 M1 边界放宽、M2 平台臂死码均翻红,已验）。
// ★BJ242（2026-09-21）：用户明令分歧已注册——Game.CONCH_RIGHT_OCEAN_COMPENSATION（缺省 ON=
//       补偿式内移重试 x=w-41,见 Game.ts 29814 登记注）。本文件=原版本相锁面 ⇒ 语义锁统一
//       转为「回滚口关闭态」断言（OFF=与原版逐字全等）;分歧开启态行为锁面在
//       tests/bj242-conch-right-ocean-compensation.test.ts。
import { describe, it, expect } from 'vitest';
import { Game } from '../src/core/Game';
import { Camera } from '../src/render/Camera';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';

/** 物证特征合成世界（w=600:右起点列 560 恰落干燥平台甲板 [554..565]@164;左起点列 40
 *  落浸水甲板 (40,112)=platform+liquid127）。groundLevel=200（甲板在地表线上方,同物证）。
 *  ★W 必须取数值宽（w.store.w）——World 对象参与算术=NaN=整段涂装静默空转（vacuous）。 */
function evidenceSignatureWorld(): World {
  const w = new World(600, 300, 7, 'bj240-ev');
  w.groundLevel = 200;
  const st = w.store;
  const W = st.w;
  const plat = TILE_BY_KEY['platform'];
  expect(TILE_DEFS_SHEET(plat)).toBe(19);
  // 右缘：干燥平台甲板 [W-46..W-35]@164（盖住起点列 W-40=560）+ 甲板外水 [W-34..W-1]@165..195
  paintRect(st, W - 46, W - 35, 164, 164, plat);
  paintWater(st, W - 34, W - 1, 165, 195);
  // 左缘：平台甲板行 [36..46]@112 + 水带 [30..60]×[112..143] + 起点格 (40,112) 浸水（物证 liquid=127）
  paintRect(st, 36, 46, 112, 112, plat);
  paintWater(st, 30, 60, 112, 143);
  st.setLiquid(40, 112, 127, LIQUID_TYPE.WATER);
  // 反 vacuous 几何断言：右起点列恰被干燥甲板盖住、左起点列下格=浸水甲板
  expect(st.flags[st.idx(W - 40, 164)]).toBe(1);
  expect(st.liquid[st.idx(W - 40, 164)]).toBe(0);
  expect(st.flags[st.idx(40, 112)]).toBe(1);
  expect(st.liquid[st.idx(40, 112)]).toBe(127);
  return w;
}

/** 自然世界对照（同一张图摘掉右缘甲板→起点列=水,加干燥泥架）：右洋可达。
 *  ★着陆架必须非窒息族：CanTileHurt 含 Suffocate（沙族 53,BJ43 同域判例）→
 *  沙架会被 danger-crawl 走避（bj43-b 实测游越整个沙滩 357 步落泥土）→ 用泥土。 */
function naturalSignatureWorld(): World {
  const w = evidenceSignatureWorld();
  const st = w.store;
  const W = st.w;
  const dirt = TILE_BY_KEY['dirt'];
  expect(TILE_DEFS_SHEET(dirt)).toBe(0);
  // 拆右缘甲板与甲板外水 → 右缘自然海洋：水 [W-50..W-1]×[165..195] + 海底 @196
  paintRect(st, W - 46, W - 35, 164, 164, 0);
  paintWater(st, W - 34, W - 1, 165, 195, 0);   // 清水（置 0 量）
  paintWater(st, W - 50, W - 1, 165, 195);
  paintRect(st, W - 50, W - 1, 196, 196, dirt);
  paintRect(st, W - 60, W - 51, 164, 196, dirt);   // 高出液面的干泥架（爬行左行 11 步着陆）
  // 反 vacuous：起点列已无甲板（水覆盖）、泥架在位
  expect(st.flags[st.idx(W - 40, 164)]).toBe(0);
  expect(st.liquid[st.idx(W - 40, 165)]).toBe(200);
  expect(st.flags[st.idx(W - 51, 164)]).toBe(1);
  return w;
}

function TILE_DEFS_SHEET(id: number): number {
  return TILE_DEFS[id]?.vanilla?.sheet ?? -1;
}

function paintRect(st: TileStore, x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
}
function paintWater(st: TileStore, x0: number, x1: number, y0: number, y1: number, amount = 200): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setLiquid(x, y, amount, LIQUID_TYPE.WATER);
}

function stubGame(world: World, px: number, py: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    player: Record<string, unknown>;
    world: World;
    requestMagicConchTeleportPosition: (r: boolean) => { x: number; y: number } | null;
  };
  const state = { removed: 0, grapples: 0, sounds: [] as string[] };
  g.world = world;
  g.player = {
    x: px, y: py, vx: 1, vy: 1, w: 20, h: 42, cx: px + 10, cy: py + 21,
    iframes: 0, fallStartY: 1234, team: 0,
    inv: { removeHeld: (n: number) => { state.removed += n; } },
    removeAllGrapplingHooks: () => { state.grapples++; },
    updateUnbreakableWallScan: () => {},
    equipStats: { fireWalk: false },
    buffs: null,
  };
  g.sfx = { play: (k: string) => { state.sounds.push(k); } };
  g.spawnParticles = () => {};
  g.camera = new Camera(800, 600);
  g.golfState = { tryGetCameraTrackingPosition: () => null };
  g.cb = {};
  g.net = null;
  g.spectatingSlot = -1;
  g.lastStripReq = '';
  return { g, state };
}

describe('BJ240 海螺右洋 InWorld40 边界（物证地图特征=原版忠实,零修刀锁面）', () => {
  it('物证特征世界：右洋尝试必败（起点列 w-40 落干燥甲板→零爬行→InWorld40）、左洋零爬行落位合法（x=40）〔回滚口关闭态=原版逐字〕', () => {
    const w = evidenceSignatureWorld();
    const g = stubGame(w, 0, 0).g;
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;   // ★BJ242：原版本相锁=回滚口关闭态
    try {
      // 右洋：落点 (560,163) → px=560 ≥ w-40=560 → WorldGen.InWorld 假 → null（原版同败）
      expect(g.requestMagicConchTeleportPosition(true)).toBeNull();
      // 左洋：落点 (40,111) 站浸水甲板 (40,112) → InWorld(40≥40) 真 → 原版同胜
      const dest = g.requestMagicConchTeleportPosition(false);
      expect(dest).not.toBeNull();
      expect(dest!.x).toBe(40 * TILE + 8 - 10);          // ToWorldCoordinates(8,16)−(w/2,h)
      expect(dest!.y).toBe(111 * TILE + 16 - 42);
    } finally {
      Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev;
    }
  });

  it('MagicConch 双尝试序（Player.cs:56785-56830）：物证特征世界两半场都只能落到左洋=用户实报原版本相〔回滚口关闭态〕', () => {
    const w = evidenceSignatureWorld();
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;   // ★BJ242：原版本相锁=回滚口关闭态
    try {
      // 玩家在左洋甲板上（左半场）→ 首选右洋败 → 回退左洋
      const s1 = stubGame(w, 40 * TILE, 110 * TILE);
      (s1.g as unknown as { fireRecallTeleport(c: unknown): void }).fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
      const p1 = s1.g.player as { x: number; y: number; vy: number };
      expect(p1.x).toBe(40 * TILE + 8 - 10);
      expect(p1.y).toBe(111 * TILE + 16 - 42);
      expect(p1.vy, '命中臂 velocity=Zero（Player.cs:56820）').toBe(0);
      // 玩家在右半场 → 首选即左洋（rightOcean=!leftHalf=false）→ 命中 → 也落左洋
      const s2 = stubGame(w, 570 * TILE, 100 * TILE);
      (s2.g as unknown as { fireRecallTeleport(c: unknown): void }).fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
      const p2 = s2.g.player as { x: number; y: number };
      expect(p2.x).toBe(40 * TILE + 8 - 10);
      expect(p2.y).toBe(111 * TILE + 16 - 42);
    } finally {
      Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev;
    }
  });

  it('自然世界对照（「有的地图正常」）：右缘起点列=水 → 液面爬行 11 步落干泥架 → 右洋可达〔回滚口关闭态〕', () => {
    // ★BJ281（2026-09-22）：本测原在缺省 ON 态跑（自然图两断言彼时与旗无关）。BJ281 把
    //   分歧开启态的左洋承位判据改为 includePlatforms=false（用户拍板「两洋均不落平台」）
    //   → 左洋浸水甲板落位仅存于原版相。本文件=原版本相锁面（BJ242 语义锁统一先例）⇒
    //   整测转 OFF 态钉原版逐字;分歧开启态的左洋新相锁面在
    //   tests/bj281-conch-no-platform-landing.test.ts。
    const w = naturalSignatureWorld();
    const g = stubGame(w, 0, 0).g;
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;
    try {
      const dest = g.requestMagicConchTeleportPosition(true);
      expect(dest, '自然右洋应成功（对照 bj43-b 档案同相）').not.toBeNull();
      expect(dest!.x).toBe((w.store.w - 51) * TILE + 8 - 10);   // 落 (W-51,163) 站泥架 @164
      expect(dest!.y).toBe(163 * TILE + 16 - 42);
      // 左洋原版相：浸水甲板=承位,零爬行落位（BJ281 分歧开启态不落平台,见 bj281 文件）
      const left = g.requestMagicConchTeleportPosition(false);
      expect(left).not.toBeNull();
      expect(left!.x).toBe(40 * TILE + 8 - 10);
    } finally {
      Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev;
    }
  });
});
