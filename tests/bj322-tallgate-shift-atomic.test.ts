// ★BJ322（2026-09-24）机关门右击残缺贴图+误掉落物 定谳落刀行为锁。
//  病灶：shiftTallGate 逐格 setTile 即时派发监听 → CheckTallGate 完整性在【半写态】
//  被评估：非 canonical 帧域（迁移漏网/旧档）或致动位门（②误用 nactive）判坏 →
//  killDecorTile 在写循环【中途】吃掉已写首格+掉 3240,余格继续写完 = 残缺贴图+1 掉落
//  （用户实报）。原版 ShiftTallGate（WorldGen.cs:52175-52231）整列 type 直写无逐格
//  TileFrame,写完才 TileFrame 面（:52224-52231）→「写完再评估」。
//  修刀：store.suppressListeners 裸写窗 + shiftTallGate(opts{forced,blocked,skipCell,
//  afterWrite}) 原版序（Validate:52196→SkipWire:52201→EmptyTile:52206→Sound:52213→
//  整列直写:52215→TileFrame 面:52224）+ ② nactive→hasTile（原版完整性只比帧）。
// shell 模式同 decor-support.test.ts（Object.create(Game.prototype)+桩）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { shiftTallGate, TALL_GATE_ROW_FY, type ShiftTallGateOpts } from '../src/world/Door';
import { TileStore } from '../src/world/TileStore';
import { Wiring } from '../src/world/Wiring';
import { deviceTable } from '../src/world/wiring/devices';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const CLOSED = TILE_BY_KEY['v_388_tall_gate_closed']!;
const OPEN = TILE_BY_KEY['v_389_tall_gate_open']!;
const STONE = TILE_BY_KEY['stone']!;

interface Drop { key: string; n: number }

/** Game 壳（decor-support mkShell 同款桩面） */
function mkShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & { world: World };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {}, playWavFile: () => {} };
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.killTileDropBait = () => {};
  g.entities = { add: () => {}, critters: [], drops: [] };
  g.trackTile = 0;
  g.scene = null;
  g.player = { inv: { countOf: () => 0 }, equipStats: { cordage: false, flowerBoots: false }, cx: 0, cy: 0 };
  return g as unknown as { checkDecorSquareFrame: (x: number, y: number) => void; world: World };
}

/** Game.ts:7071 同款监听装配（真实游戏恒在——半写态判坏面=本刀病灶的成立前提） */
function wireListeners(w: World, g: ReturnType<typeof mkShell>): void {
  w.store.onTileChanged((x, y) => g.checkDecorSquareFrame(x, y));
}

/** Game.toggleTallGate 同款 opts（blocked 桩=无实体;afterWrite=tallGateTileFrameFace 同式扫面） */
function gateOpts(g: ReturnType<typeof mkShell>): ShiftTallGateOpts {
  return {
    blocked: () => false,
    afterWrite: (ax, ay) => {
      for (let cy = ay - 1; cy <= ay + 5; cy += 2) g.checkDecorSquareFrame(ax, cy);
    },
  };
}

/** 门体合成：地面行 14、天花行 8（双锚 StrictSolid）,门列 x=10,净空 9..13 */
function setupGate(w: World, frames: readonly number[], type = CLOSED) {
  const st = w.store;
  for (let x = 8; x <= 12; x++) {
    st.setTileSilent(x, 14, STONE, 0, 0);
    st.setTileSilent(x, 8, STONE, 0, 0);
  }
  for (let dy = 0; dy < 5; dy++) st.setTileSilent(10, 9 + dy, type, 0, frames[dy]);
}

describe('BJ322 高门右击开合链（shiftTallGate 裸写窗 × afterWrite 扫面）', () => {
  it('canonical 闭→开（顶格/中格点击）与开→关：全列换型+帧逐格保留+零掉落零误杀', () => {
    for (const click of [9, 11]) {
      const w = new World(40, 40, 7, `bj322-ok-${click}`);
      const drops: Drop[] = [];
      const g = mkShell(w, drops);
      const st = w.store;
      setupGate(w, TALL_GATE_ROW_FY);
      wireListeners(w, g);
      const r = shiftTallGate(st, 10, click, false, undefined, gateOpts(g));
      expect(r).toEqual([10, 9]);
      for (let dy = 0; dy < 5; dy++) {
        expect(st.get(10, 9 + dy)).toBe(OPEN);
        expect(st.frameY[st.idx(10, 9 + dy)]).toBe(TALL_GATE_ROW_FY[dy]);
      }
      expect(drops).toEqual([]);
      const r2 = shiftTallGate(st, 10, 12, true, undefined, gateOpts(g));   // 反向关闭
      expect(r2).toEqual([10, 9]);
      for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(CLOSED);
      expect(drops).toEqual([]);
    }
  });

  it('老帧域 0/18/36/54/72（迁移漏网态）：右击 → 整件清+恰 1 掉 3240（原版 CheckTallGate 杀段 :52151-52163;不再残缺）', () => {
    const w = new World(40, 40, 7, 'bj322-legacy');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    setupGate(w, [0, 18, 36, 54, 72]);
      wireListeners(w, g);
    const r = shiftTallGate(st, 10, 9, false, undefined, gateOpts(g));
    expect(r).toEqual([10, 9]);                                  // 切换面照走（Validate 只验 active+type）
    for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(0);   // 整件清（修复前=首格残缺+余格半写）
    expect(drops).toEqual([{ key: 'vi_3240_TallGate', n: 1 }]);  // 恰 1（修复前同值但态残缺）
  });

  it('致动门（WIRE_ACTUATED）：右击 → 正常开合幸存（原版完整性 :52136-52145 只比帧,nactive 系 ShiftTallGate Validate 专有）', () => {
    const w = new World(40, 40, 7, 'bj322-actuated');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    setupGate(w, TALL_GATE_ROW_FY);
      wireListeners(w, g);
    for (let dy = 0; dy < 5; dy++) st.wire[st.idx(10, 9 + dy)] |= TileStore.WIRE_ACTUATED;
    const r = shiftTallGate(st, 10, 9, false, undefined, gateOpts(g));
    expect(r).toEqual([10, 9]);
    for (let dy = 0; dy < 5; dy++) {
      expect(st.get(10, 9 + dy)).toBe(OPEN);
      expect(st.wire[st.idx(10, 9 + dy)] & TileStore.WIRE_ACTUATED).toBeTruthy();   // 致动位保留（原版 type 直写同相）
    }
    expect(drops).toEqual([]);
  });

  it('实体占位门（EmptyTile ignoreTiles :52206-52212,forced=false）：关门时门列被占 → 拒切换零写入', () => {
    const w = new World(40, 40, 7, 'bj322-blocked');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    setupGate(w, TALL_GATE_ROW_FY, OPEN);
      wireListeners(w, g);
    const r = shiftTallGate(st, 10, 9, true, undefined, {
      blocked: (bx, by) => bx === 10 && by >= 9 && by <= 13,
      afterWrite: gateOpts(g).afterWrite,
    });
    expect(r).toBeNull();
    for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(OPEN);   // 原样
    expect(drops).toEqual([]);
  });

  it('★BJ343 原版序判别位：SkipWire(:52201)→EmptyTile(:52206)→Sound(:52213) 序互换应红', () => {
    // 三记录器同喂一个被占门列：占位拒切换时——
    //  · skips=5     ：SkipWire 先于 EmptyTile 早退（失败早退也照跳 = 原版本相；
    //                  若 blocked 臂被提到 skip 前 → skips=0 立红）
    //  · sfx=0 次    ：Sound 8 在 EmptyTile 之后（被拒不开声；若 sfx 提到 blocked
    //                  前 → sfx=1 立红）
    //  · 门列零写入  ：切换发生在 sfx 后（原版 :52213→:52215）
    //  forced=true 对照：跳过实体门 → skips=5 + sfx=1 + 全列换型（skip 仍在 sfx 前）
    const w = new World(40, 40, 7, 'bj343-order');
    const st = w.store;
    setupGate(w, TALL_GATE_ROW_FY, OPEN);
    const skips: Array<[number, number]> = [];
    const sfxs: string[] = [];
    const blockedOpts = {
      blocked: (bx: number, by: number) => bx === 10 && by >= 9 && by <= 13,
      skipCell: (sx: number, sy: number) => skips.push([sx, sy]),
      afterWrite: () => {},
    };
    expect(shiftTallGate(st, 10, 9, true, (n) => sfxs.push(n), blockedOpts)).toBeNull();
    expect(skips.length).toBe(5);
    expect(sfxs).toEqual([]);
    for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(OPEN);
    // forced 臂：实体门被跳过 → 序走到 sfx+写列
    skips.length = 0; sfxs.length = 0;
    expect(shiftTallGate(st, 10, 9, true, (n) => sfxs.push(n), { ...blockedOpts, blocked: undefined, forced: true }))
      .toEqual([10, 9]);
    expect(skips.length).toBe(5);
    expect(sfxs).toEqual(['door_open']);
    for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(CLOSED);
  });

  it('导线臂委托（Wiring.cs:1460 同函数面）：deviceTable case 388 → shiftTallGate（skipCell×5+afterWrite+areaEmpty 占位门）', () => {
    const w = new World(40, 40, 7, 'bj322-wire');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    setupGate(w, TALL_GATE_ROW_FY);
      wireListeners(w, g);
    const wr = new Wiring(st);
    const skips: Array<[number, number]> = [];
    wr.skipCell = (x, y) => skips.push([x, y]);
    const faces: Array<[number, number]> = [];
    const mkCtx = (areaEmpty: (x: number, y: number, w2: number, h2: number) => boolean) => ({
      dropItem: () => {}, spawnNpc: () => false, mechSpawnOk: () => true,
      areaEmpty,
      afterWrite: (ax: number, ay: number) => faces.push([ax, ay]),
    });
    // 占位（假实体占满门列）→ 拒（原版 Wiring 臂 forced=false 同门）
    expect(deviceTable(wr, mkCtx(() => false) as never, 388, 10, 11)).toBe(true);
    expect(st.get(10, 11)).toBe(CLOSED);
    expect(skips.length).toBe(5);        // SkipWire 先于 EmptyTile 早退（:52201→:52206 原版序）
    expect(faces).toEqual([]);
    // 空场 → 开
    expect(deviceTable(wr, mkCtx(() => true) as never, 388, 10, 11)).toBe(true);
    for (let dy = 0; dy < 5; dy++) expect(st.get(10, 9 + dy)).toBe(OPEN);
    expect(skips.length).toBe(10);       // 两轮各 5
    expect(faces).toEqual([[10, 9]]);    // 尾扫面收锚点
  });

  it('木门 10/11 免疫对照：checkDecorSquareFrame 不派发（DECOR_SUPPORT_KIND 无 10/11）→ 无中途判坏面', () => {
    const w = new World(40, 40, 7, 'bj322-wooddoor');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    const DC = TILE_BY_KEY['door_closed']!;
    for (let dy = 0; dy < 3; dy++) st.setTileSilent(10, 10 + dy, DC, 0, dy * 18);
    st.onTileChanged((x, y) => g.checkDecorSquareFrame(x, y));
    g.checkDecorSquareFrame(10, 11);
    for (let dy = 0; dy < 3; dy++) expect(st.get(10, 10 + dy)).toBe(DC);
    expect(drops).toEqual([]);
  });
});

// ================= ★BJ322 同族清偿：切换类多方块交互物裸写窗 =================
// 普查判据：帧翻转面 × DECOR_SUPPORT_KIND 完整性 kinds 的交——机关门 388/389（上组）
// /宝石锁 440（wallhang）/吊灯 34（hangs 3×3 帧比对 :53300-53310）/中式灯笼 95·
// 迪斯科球 126（hang2x2）尽数同病（探针实测 0 存活+误掉落）;木门 10/11、furniture
// kind（100/173/564/209/244…）、map 缺席位（207/405/406/411/452/506/546/557…）无派
// 发面=免疫。cure 统一=原版裸写语义（ToggleGemLock :46898-46902/ToggleChandelier
// :1754-1774/灯族 :1381-1387 frame 直赋无逐格 TileFrame）。

describe('BJ322 同族①宝石锁 440（ToggleGemLock :46872-46927）', () => {
  function mkLockShell(w: World, drops: Drop[]) {
    const g = mkShell(w, drops) as unknown as Record<string, unknown> & {
      checkDecorSquareFrame(x: number, y: number): void;
      toggleGemLock(x: number, y: number, on: boolean): void;
      wiring?: unknown;
    };
    g.wiring = undefined;
    return g as unknown as {
      checkDecorSquareFrame(x: number, y: number): void;
      toggleGemLock(x: number, y: number, on: boolean): void;
    };
  }
  function setupLock(w: World, on: boolean) {
    const st = w.store;
    const G = TILE_BY_KEY['v_440_gemlocks']!;
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      st.setWall(10 + dx, 10 + dy, 1);
      st.setTileSilent(10 + dx, 10 + dy, G, dx * 18, (on ? 54 : 0) + dy * 18);
    }
    return G;
  }
  it('右击开（off→on）：9 格全存活+带基 54+零掉落（修复前探针=0/9+双掉落）', () => {
    const w = new World(40, 40, 7, 'bj322-gemlock-on');
    const drops: Drop[] = [];
    const g = mkLockShell(w, drops);
    const st = w.store;
    const G = setupLock(w, false);
    st.onTileChanged((x, y) => g.checkDecorSquareFrame(x, y));
    g.toggleGemLock(10, 10, true);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      expect(st.get(10 + dx, 10 + dy)).toBe(G);
      expect(st.frameY[st.idx(10 + dx, 10 + dy)]).toBe(54 + dy * 18);
    }
    expect(drops).toEqual([]);
  });
  it('右击关（on→off）：9 格全存活+脱钩掉对应宝石（wasOn 支 :46908-46910）', () => {
    const w = new World(40, 40, 7, 'bj322-gemlock-off');
    const drops: Drop[] = [];
    const g = mkLockShell(w, drops);
    const st = w.store;
    const G = setupLock(w, true);
    st.onTileChanged((x, y) => g.checkDecorSquareFrame(x, y));
    g.toggleGemLock(10, 10, false);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      expect(st.get(10 + dx, 10 + dy)).toBe(G);
      expect(st.frameY[st.idx(10 + dx, 10 + dy)]).toBe(dy * 18);
    }
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[1526], n: 1 }]);   // style0=红玉 1526
  });
});

describe('BJ322 同族②导线灯族翻转（flipBlock/flipCell 裸写窗）', () => {
  const mkCtx = () => ({
    dropItem: () => {}, spawnNpc: () => false, mechSpawnOk: () => true,
    sfx: () => {}, toast: () => {}, worldSurface: 100,
  });
  it('吊灯 34（hangs 3×3 完整性 :53300-53310）导线开关：9 格全存活+帧 ±54+零掉落', () => {
    const w = new World(40, 40, 7, 'bj322-chand');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    const SN = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 1);
    const CH = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 34);
    for (let x = 8; x <= 12; x++) st.setTileSilent(x, 8, SN, 0, 0);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) st.setTileSilent(10 + dx, 9 + dy, CH, dx * 18, dy * 18);
    st.onTileChanged((x, y) => g.checkDecorSquareFrame(x, y));
    const wr = new Wiring(st);
    expect(deviceTable(wr, mkCtx() as never, 34, 10, 10)).toBe(true);
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
      expect(st.get(10 + dx, 9 + dy)).toBe(CH);
      expect(st.frameX[st.idx(10 + dx, 9 + dy)]).toBe(54 + dx * 18);   // on 带
    }
    expect(drops).toEqual([]);
  });
  it('中式灯笼 95（hang2x2 完整性）导线开关：4 格全存活+帧 ±36+零掉落', () => {
    const w = new World(40, 40, 7, 'bj322-lantern');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    const SN = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 1);
    const LT = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 95);
    for (let x = 8; x <= 12; x++) st.setTileSilent(x, 8, SN, 0, 0);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTileSilent(10 + dx, 9 + dy, LT, dx * 18, dy * 18);
    st.onTileChanged((x, y) => g.checkDecorSquareFrame(x, y));
    const wr = new Wiring(st);
    expect(deviceTable(wr, mkCtx() as never, 95, 10, 9)).toBe(true);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(st.get(10 + dx, 9 + dy)).toBe(LT);
      expect(st.frameX[st.idx(10 + dx, 9 + dy)]).toBe(36 + dx * 18);   // on 带
    }
    expect(drops).toEqual([]);
  });
});
