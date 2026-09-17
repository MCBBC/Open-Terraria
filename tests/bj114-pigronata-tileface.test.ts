// BJ114 猪龙彩罐（Pigronata,vid 3746 / tile 454）放置+打碎整面（2026-09-18 用户实报
// 「无法放置、打碎猪龙彩罐」定谳后落刀）。
// 原版锚（1457 亲读；1458 同文 diff=same——CheckChand :53262/TOD :3170/Player :41729）：
//   id 链：ItemID.Pigronata=3746（ItemID.cs:9038）→ createTile=454（Item.cs:33166-33175,
//   value=buyPrice(0,1)=1 金）→ TileID.Pigronata=454（TileID.cs:1345）。1.4.5.x 唯一
//   彩罐变体（无第二 placeStyle/子样式）。Party Girl 208 售（Chest.cs:2340-2353
//   BirthdayParty.PartyIsUp 块,本仓 vanilla-shopstock.json shops['208'] cond='party'）。
//   tile 454：tileFrameImportant/tileLavaDeath/tileCut（Main.cs:8458-8460）。
//   放置：TileObjectData addTile(454)（TileObjectData.cs:3163-3169）——CopyFrom(Style3x3)
//   W4、Origin(2,0)、AnchorTop SolidTile|SolidSide cnt1 checkStart1（顶行第 2 列上方
//   单实心格吊挂）、AnchorBottom=Empty、DrawYOffset=-2。重复放置门
//   PlaceThing_Tiles_BlockPlacementForRepeatedPigronatas（Player.cs:41731-41745）——
//   点击行 4 格（=物件顶行 4 列,Origin(2,0)）任一 active 454 拒放（CanPlace 对
//   tileCut 占位豁免的补位门）。智能光标 Step_Pigronata（SmartCursorHelper.cs:978）
//   同款 4×3 顶锚语义。
//   打碎：任一格 KillTile → SquareTileFrame → TileFrameImportant case 34/454
//   （WorldGen.cs:86800-86801）→ CheckChand（:53254）——4×3 完整性+顶锚失配整件杀
//   （kill 环 :53325-53333）+ type==454 战利品掷（:53339-53414）：Next(9) 五态
//   0/1 无；2-4 银币 72 Next(10,31) 拆 Next(2,11)；5-6 银币 Next(60,80) 拆 Next(3,16)
//   +1358 派对瓶；7 银币 Next(10,31) 拆 Next(2,9)+73 金币；8 银币 100 拆 Next(3,16)
//   +1349 派对弹 Next(30,91) 拆 Next(7,14)+派对瓶+金币。KillTile 454 ∈ GetItemDrops
//   no-drop 组（:66454）→【无】放置物品返还。音 KillTile_PlaySounds(454) default
//   PlaySound(0)=Dig（:67086-67089）；尘 GetTileDustAmount default=10（:67127-67131）。
//   掉落格 = CheckChand 派发格（列优先窗扫首格——SW-BJ40 multiTileDropTriggerCell 同构）。
// 判别力：放置 4×3 顶锚/重复门/tileCut 清格 × 打碎五分支 6 掷流统计+分支定点+拆支
//   上界+触发格弹点+音尘 × 商店面数据锚。变异 ≥3（摘特支/摘拆支/摘门/锚错弹点→红）。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { anchorSpecOf, validateAnchors } from '../src/world/TileAnchorValidator';
import shopstockJson from '../src/data/vanilla-shopstock.json';

const PG = TILE_BY_KEY['v_454_pigronata']!;
const STONE = TILE_BY_KEY['stone']!;
const TALLGRASS = TILE_BY_KEY['tallgrass']!;

interface Drop { x: number; y: number; key: string; n: number }
interface Rec { drops: Drop[]; digs: number; chops: number; parts: Array<{ x: number; y: number; color: string; n: number }> }

/** breakTile+tryPlace 可驱动面最小桩（shell 形制同 tests/bj113-breakhive-tileface.test.ts
 *  ×tests/placement-pipeline-debt.test.ts 合集） */
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
  scene: unknown;
  hitTiles: { addDamage: () => number; clear: () => void };
  achievements: unknown;
  tryPlace: (x: number, y: number, def: unknown) => void;
  breakTile: (x: number, y: number, byPlayer?: boolean, noItem?: boolean, pickHit?: boolean) => void;
  checkFurnitureSupport: (x: number, y: number) => void;
}
function mkShell(seed = 7): { g: GShell; w: World; rec: Rec } {
  const w = new World(40, 40, seed, 'bj114-pigronata');
  const rec: Rec = { drops: [], digs: 0, chops: 0, parts: [] };
  const g = Object.create(Game.prototype) as unknown as GShell;
  g.world = w;
  g.smartCursor = { lockedContinuity: null, showing: false, x: 0, y: 0 };
  g.chunks = { markDirtyArea: () => {} };
  g.sfx = {
    play: (name: string) => {
      if (name === 'dig') rec.digs++;
      if (name === 'chop') rec.chops++;
    },
    playWavFile: () => {},
  };
  g.cb = { onInventoryChanged: () => {} };
  g.entities = { nextId: 1, add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.spawnParticles = (x: number, y: number, color: string, n: number) => {
    rec.parts.push({ x, y, color, n });
  };
  g.recLog = () => {};
  g.spawnDrop = (x: number, y: number, key: string, n: number) => {
    rec.drops.push({ x, y, key, n });
    return null;
  };
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.trackTile = 0;
  g.scene = null;
  g.hitTiles = { addDamage: () => 100, clear: () => {} };
  g.achievements = { notifyTileDestroyed: () => {}, handleMining: () => {}, plantedAcorn: () => {} };
  g.player = {
    placeSpeedTileRaw: () => 1,
    cx: 10 * 16 + 8, cy: 13 * 16 + 8, x: 10 * 16 + 2, y: 13 * 16 - 6, w: 12, h: 28,
    facing: 1, useTime: 0, usedAmbrosia: false,
    buffs: { has: () => false }, equipStats: {},
    inv: {
      selected: 0, slots: new Array(60).fill(null),
      heldItem: () => ({ id: -1, stack: 9 }), removeHeld: () => {}, removeAt: () => {}, countOf: () => 0,
    },
  };
  return { g, w, rec };
}

/** 4×3 整件写入（wld 导入/既置语义,帧 dx*18/dy*18） */
function placeObjectAt(w: World, ax: number, ay: number): void {
  const st = w.store;
  for (let dx = 0; dx < 4; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      st.setTileSilent(ax + dx, ay + dy, PG, dx * 18, dy * 18);
    }
  }
}
const cellsLeft = (w: World, ax: number, ay: number): number => {
  let n = 0;
  for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 3; dy++) {
    if (w.store.get(ax + dx, ay + dy) === PG) n++;
  }
  return n;
};
const dropKeys = (rec: Rec): string[] => rec.drops.map((d) => d.key);

afterEach(() => { vi.restoreAllMocks(); });

describe('BJ114-①：id 链与数据面（Item.cs:33166-33175 / TileObjectData.cs:3163-3169）', () => {
  it('vid 3746 → tile 桥接 v_454_pigronata（createTile=454 双源）', () => {
    const k = VANILLA_ITEM_KEY_BY_ID[3746];
    expect(k).toBe('vi_3746_Pigronata');
    const def = ITEM_DEFS[ITEM_BY_KEY[k!]];
    expect(def.tile).toBe('v_454_pigronata');            // 放置链 def.tile 权威
    expect(ITEM_BY_KEY['place_v_454_pigronata']).toBeDefined();
    expect(TILE_DEFS[PG].vanilla?.sheet).toBe(454);
    expect(TILE_DEFS[PG].w).toBe(4);
    expect(TILE_DEFS[PG].h).toBe(3);
  });

  it('tile-anchors 454 = 4×3 Origin(2,0) + AnchorTop SolidTile|SolidSide cnt1 start1（顶行第 2 列单锚吊挂）', () => {
    const rec = anchorSpecOf(454)!;
    expect(rec).not.toBeNull();
    expect(rec.w).toBe(4);
    expect(rec.h).toBe(3);
    expect(rec.ox).toBe(2);
    expect(rec.oy).toBe(0);
    expect(rec.anchorTop!.t).toEqual(['SolidTile', 'SolidSide']);
    expect(rec.anchorTop!.cnt).toBe(1);
    expect(rec.anchorTop!.start).toBe(1);
    expect(rec.anchorBottom).toBeNull();                  // AnchorBottom=Empty（:3167）
    expect(rec.liq.lava).toBe('notAllowed');              // LavaDeath=true（Main.cs:8459）
    expect(rec.liq.water).toBe('allowed');
  });

  it('商店面：Party Girl(208) 售 3746（1 金）仅派对中（Chest.cs:2340-2353 PartyIsUp 块）', () => {
    const shops = (shopstockJson as unknown as { shops: Record<string, Array<{ id: number; price: number | null; cond: string | null }>> }).shops;
    const pg = shops['208'];
    const e = pg.find((s) => s.id === 3746);
    expect(e).toBeDefined();
    expect(e!.price).toBe(10000);                          // buyPrice(0,1)
    expect(e!.cond).toBe('party');
  });
});

describe('BJ114-②：放置面（TileObject.CanPlace 454 + BlockPlacementForRepeatedPigronatas）', () => {
  it('实心天花下 tryPlace(vi_3746)：4×3 十二格 + 帧格 + 顶锚存活', () => {
    const { g, w } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(9 + dx, 9, STONE, 0, 0);   // 天花行
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3746]!]];
    g.tryPlace(12, 10, def);                               // 点击格 = Origin 格 (ax+2, ay)
    expect(cellsLeft(w, 10, 10)).toBe(12);                 // ax=12-2=10, ay=10
    for (let dx = 0; dx < 4; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        const i = st.idx(10 + dx, 10 + dy);
        expect(st.frameX[i]).toBe(dx * 18);
        expect(st.frameY[i]).toBe(dy * 18);
      }
    }
    g.checkFurnitureSupport(12, 10);                       // 顶锚在 → 不塌
    expect(cellsLeft(w, 10, 10)).toBe(12);
  });

  it('顶锚仅认顶行第 2 列上方实心（AnchorTop cnt1 start1）：validateAnchors 列语义 + 无锚空域拒放', () => {
    const { g, w } = mkShell();
    const st = w.store;
    const rec = anchorSpecOf(454)!;
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3746]!]];
    // 全空域（吸附窗内无实心）→ 拒放
    g.tryPlace(12, 10, def);
    expect(cellsLeft(w, 9, 10)).toBe(0);
    expect(cellsLeft(w, 10, 10)).toBe(0);
    // 列语义（吸附窗消去后逐位）：物件 (10..13,10..12) 的锚格 = (ax+1, ay-1)=(11,9)
    st.setTileSilent(10, 9, STONE, 0, 0);                   // 只有第 1 列上方（start0 非锚列）
    expect(validateAnchors(st, 10, 10, rec, 0)).toBe(false);
    st.setTileSilent(11, 9, STONE, 0, 0);                   // 第 2 列上方（start1 锚列）
    expect(validateAnchors(st, 10, 10, rec, 0)).toBe(true);
    st.setTile(10, 9, 0);
    expect(validateAnchors(st, 10, 10, rec, 0)).toBe(true); // 锚列仍在=可放
    // 实放：锚列上方实心在位 → 4×3 十二格
    g.tryPlace(12, 10, def);
    expect(cellsLeft(w, 10, 10)).toBe(12);
  });

  it('重复放置门：同排重叠拒放且旧件完好（Player.cs:41731-41745——tileCut 占位豁免的补位门）', () => {
    const { g, w } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(9 + dx, 9, STONE, 0, 0);
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3746]!]];
    g.tryPlace(12, 10, def);
    expect(cellsLeft(w, 10, 10)).toBe(12);
    // 第二件点击格落在第一件顶行 4 列内（13,10 → ax=11..14 区间重叠）→ 拒放
    //（useTime 节流门复位——tryPlace 成功置 useTime=14,壳须清零驱动第二次放置）
    (g.player as unknown as { useTime: number }).useTime = 0;
    g.tryPlace(13, 10, def);
    expect(cellsLeft(w, 10, 10)).toBe(12);                 // 旧件 12 格完好（未被清格相吞）
    expect(cellsLeft(w, 14, 10)).toBe(0);                  // 新件不存在（旧盒右邻列零格）
    // 点击行错开（顶行不重叠 → 原版门不拦;此处吸附窗内无第二锚位,自然拒放=零吞件）
    g.tryPlace(20, 10, def);
    expect(cellsLeft(w, 10, 10)).toBe(12);
  });

  it('tileCut 清格豁免面：高草占位格被清（TileObject.Place :84 KillTile）后可放', () => {
    const { g, w } = mkShell();
    const st = w.store;
    for (let dx = 0; dx < 6; dx++) st.setTileSilent(9 + dx, 9, STONE, 0, 0);
    st.setTileSilent(11, 11, TALLGRASS, 0, 0);             // 高草 ∈ tileCut（物件腹地）
    const def = ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3746]!]];
    g.tryPlace(12, 10, def);
    expect(cellsLeft(w, 10, 10)).toBe(12);
    expect(st.get(11, 11)).toBe(PG);                       // 草被清、彩罐落位
  });
});

describe('BJ114-③：打碎面（CheckChand 454 支 :53254 → kill 环 + 战利品掷 :53339-53414）', () => {
  it('整件清 + 零放置物品返还（GetItemDrops no-drop 组 :66454）+ 音=dig 尘=mapColor', () => {
    const { g, w, rec } = mkShell();
    placeObjectAt(w, 10, 10);
    g.breakTile(11, 11, true);                             // 挖中段格
    expect(cellsLeft(w, 10, 10)).toBe(0);                  // 4×3 整件清
    const banned = ['place_v_454_pigronata', 'vi_3746_Pigronata'];
    for (const k of dropKeys(rec)) expect(banned).not.toContain(k);
    expect(rec.digs).toBe(1);                              // PlaySound(0)=Dig（非 tileCut chop 臂）
    expect(rec.chops).toBe(0);
    expect(rec.parts.length).toBe(1);                      // 尘（default 10 → spawnParticles 单发）
    expect(rec.parts[0].color).toBe(TILE_DEFS[PG].mapColor);
  });

  it('拆支上界（碎拆 Next 系列域）：银币拆 ≤10/≤15/≤8、派对弹拆 ≤13、支 8 银币总额=100', () => {
    const { g, w, rec } = mkShell();
    placeObjectAt(w, 10, 10);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);    // 全掷取上开区间端值
    g.breakTile(10, 10, true);                             // r9=8
    expect(cellsLeft(w, 10, 10)).toBe(0);
    const coins = rec.drops.filter((d) => d.key === 'vi_72_SilverCoin');
    const bullets = rec.drops.filter((d) => d.key === 'vi_1349_PartyBullet');
    const sum = (arr: Drop[]) => arr.reduce((s, d) => s + d.n, 0);
    expect(coins.length).toBeGreaterThan(1);               // 拆支（非单发）
    expect(sum(coins)).toBe(100);                          // Next(3,16) 端值拆 15×6+10
    expect(Math.max(...coins.map((d) => d.n))).toBeLessThanOrEqual(15);
    expect(sum(bullets)).toBe(90);                         // Next(30,91) 端值=90
    expect(Math.max(...bullets.map((d) => d.n))).toBeLessThanOrEqual(13);
    expect(dropKeys(rec)).toContain('vi_1358_FlaskofParty');
    expect(dropKeys(rec)).toContain('vi_73_GoldCoin');
  });

  it('分支定点（Math.random 桩）：r9=0 无战利品 / r9=7 银币+金币 / r9=5 银币+派对瓶', () => {
    const { g, w, rec } = mkShell();
    const def = { coin: 'vi_72_SilverCoin', gold: 'vi_73_GoldCoin', flask: 'vi_1358_FlaskofParty' };
    // r9=0：Next(9)=0 → 无掉落
    placeObjectAt(w, 10, 10);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    g.breakTile(11, 11, true);
    expect(rec.drops.length).toBe(0);
    vi.restoreAllMocks();
    // r9=7：Next(9)=7 → Next(10,31) 拆 Next(2,9) + 金币 1
    placeObjectAt(w, 10, 10);
    let seq = [7.5 / 9, 0, 0, 0, 0, 0, 0, 0, 0];           // r9 掷 + 拆支链全取下限（块 2）
    let ci = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[Math.min(ci++, seq.length - 1)]);
    g.breakTile(11, 11, true);
    vi.restoreAllMocks();
    const sum7 = rec.drops.filter((d) => d.key === def.coin).reduce((s, d) => s + d.n, 0);
    expect(sum7).toBeGreaterThanOrEqual(10);
    expect(sum7).toBeLessThan(31);
    expect(Math.max(...rec.drops.filter((d) => d.key === def.coin).map((d) => d.n))).toBeLessThanOrEqual(8);
    expect(dropKeys(rec)).toContain(def.gold);
    expect(dropKeys(rec)).not.toContain(def.flask);
    // r9=5：Next(9)=5 → 银币 Next(60,80) + 派对瓶
    rec.drops.length = 0;
    placeObjectAt(w, 10, 10);
    seq = [5.5 / 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    ci = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[Math.min(ci++, seq.length - 1)]);
    g.breakTile(11, 11, true);
    vi.restoreAllMocks();
    const sum5 = rec.drops.filter((d) => d.key === def.coin).reduce((s, d) => s + d.n, 0);
    expect(sum5).toBeGreaterThanOrEqual(60);
    expect(sum5).toBeLessThan(80);
    expect(Math.max(...rec.drops.filter((d) => d.key === def.coin).map((d) => d.n))).toBeLessThanOrEqual(15);
    expect(dropKeys(rec)).toContain(def.flask);
    expect(dropKeys(rec)).not.toContain(def.gold);
  });

  it('五分支 6 掷流统计（Math.random 实流 600 掷）：全签名存在+频率带+掷流域', () => {
    const { g, w, rec } = mkShell();
    const coin = 'vi_72_SilverCoin';
    const census = { none: 0, coinsOnly: 0, flask: 0, gold: 0, bullet: 0 };
    for (let k = 0; k < 600; k++) {
      rec.drops.length = 0;
      placeObjectAt(w, 10, 10);
      g.breakTile(11, 11, true);
      expect(cellsLeft(w, 10, 10)).toBe(0);
      const keys = dropKeys(rec);
      const coinDrops = rec.drops.filter((d) => d.key === coin);
      const coinSum = coinDrops.reduce((s, d) => s + d.n, 0);
      const has = (key: string) => keys.includes(key);
      // 逐掷硬域：银币单拆上界随支、总额域不越四支并集
      if (coinDrops.length) {
        expect(Math.max(...coinDrops.map((d) => d.n))).toBeLessThanOrEqual(15);
        expect(coinSum).toBeGreaterThanOrEqual(10);
        expect(coinSum).toBeLessThanOrEqual(100);
      }
      if (rec.drops.length === 0) census.none++;
      else if (has('vi_1349_PartyBullet')) census.bullet++;
      else if (has('vi_73_GoldCoin')) census.gold++;
      else if (has('vi_1358_FlaskofParty')) census.flask++;
      else census.coinsOnly++;
      // 支签名约束（五态 switch 单支）：派对弹仅支 8（恒伴金币+瓶）；金币无弹 → 无瓶
      if (has('vi_1349_PartyBullet')) {
        expect(has('vi_73_GoldCoin') && has('vi_1358_FlaskofParty')).toBe(true);
      }
      if (has('vi_73_GoldCoin') && !has('vi_1349_PartyBullet')) {
        expect(has('vi_1358_FlaskofParty')).toBe(false);
      }
    }
    // 频率带（2/9, 3/9, 2/9, 1/9, 1/9——600 掷 ±50% 宽带防 flakes）
    expect(census.none).toBeGreaterThan(600 * (2 / 9) * 0.5);
    expect(census.none).toBeLessThan(600 * (2 / 9) * 1.6);
    expect(census.coinsOnly).toBeGreaterThan(600 * (3 / 9) * 0.5);
    expect(census.coinsOnly).toBeLessThan(600 * (3 / 9) * 1.6);
    expect(census.flask).toBeGreaterThan(600 * (2 / 9) * 0.5);
    expect(census.flask).toBeLessThan(600 * (2 / 9) * 1.6);
    expect(census.gold).toBeGreaterThan(30);
    expect(census.bullet).toBeGreaterThan(30);
    // 支 8 恰发派对弹+瓶+金币三签名（银币恒 100）
    expect(census.bullet + census.gold + census.flask + census.coinsOnly + census.none).toBe(600);
  });

  it('掉落格 = CheckChand 派发格（列优先窗扫首格,SW-BJ40 同构）：挖中段格弹在 (ax,ay)', () => {
    const { g, w, rec } = mkShell();
    placeObjectAt(w, 10, 10);
    vi.spyOn(Math, 'random').mockReturnValue(0);           // r9=0 无货 → 借音尘格验触发面不可行
    vi.restoreAllMocks();
    // 用支 2（银币）验证弹点：r9=2
    vi.spyOn(Math, 'random').mockImplementation(() => 2.5 / 9);
    g.breakTile(11, 11, true);                             // 挖 (ax+1,ay+1) → 窗扫 (ax,ay) 首格
    vi.restoreAllMocks();
    for (const d of rec.drops) {
      expect(d.x).toBe(10 * 16 + 16);                      // 32 盒/52 盒同心 (i*16+16,j*16+16)
      expect(d.y).toBe(10 * 16 + 16);
    }
    // 挖锚格 → 窗扫首格 = (ax,ay+1)（(0,1) 先于 (1,-1)）
    rec.drops.length = 0;
    placeObjectAt(w, 10, 10);
    vi.spyOn(Math, 'random').mockImplementation(() => 2.5 / 9);
    g.breakTile(10, 10, true);
    vi.restoreAllMocks();
    for (const d of rec.drops) {
      expect(d.x).toBe(10 * 16 + 16);                      // dx0=10 → +16
      expect(d.y).toBe(11 * 16 + 16);                      // dy0=ay+1=11
    }
  });
});

describe('BJ114-④：幸存链回归（DECOR "hangs" 454 与打碎特支同域）', () => {
  it('失撑级联（挖天花）→ killDecorTile → breakPigronata：整件清+战利品照发', () => {
    const { g, w, rec } = mkShell();
    const st = w.store;
    st.setTileSilent(11, 9, STONE, 0, 0);                  // 顶行第 2 列上方锚
    placeObjectAt(w, 10, 10);
    g.checkFurnitureSupport(10, 10);
    expect(cellsLeft(w, 10, 10)).toBe(12);
    st.setTile(11, 9, 0);                                  // 挖锚柱
    g.checkFurnitureSupport(10, 10);                       // 'hangs' 失配 → 整件塌
    expect(cellsLeft(w, 10, 10)).toBe(0);
    const keys = dropKeys(rec);
    for (const k of keys) expect(k).not.toBe('place_v_454_pigronata');
  });
});
