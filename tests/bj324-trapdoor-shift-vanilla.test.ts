// ★BJ324（2026-09-24）活板门 ShiftTrapdoor 完整移植行为锁（BJ322 登记债清偿）。
//  病灶（BJ322 定谳）：旧 devices.shiftTrapdoorFlip 一行写对 2×2 开态本身几何残缺
//  （BJ250 帧近似：只写单行 2 格、无折翼臂、无 Validate、无尾 TileFrame 面），右键/
//  导线翻转时逐格 setTile 即时派发把【半写态】交 CheckTrapDoor 完整性复查中途判坏
//  （探针=半件翻转+掉 3239）。cure=完整移植原版 ShiftTrapdoor（WorldGen.cs:51897-52048,
//  1457 与 1458 逐字节全等）——单加裸写窗只会把半件翻转变成「判坏整件清」，非治愈。
//  原版语义锚（亲读定谳）：
//  · 386→387（关）两折翼臂：styleX=frameX/36；styleX=0 清【顶】行写 387 于【底】行
//    （:51905-51943）/ styleX=1 清【底】行写 387 于【顶】行（:51947-51984）；关位行恒
//    =原关行（CheckTrapDoor 386 锚行 styleX0→底行 / styleX1→顶行 :52064-52069 首尾自洽）。
//  · 387→386（开）方向=玩家相对高度：playerAbove→折翼向下（行 y..y+1,frameX=列*18+36
//    即 styleX=1）:52022-52027 / !playerAbove→向上（行 y-1..y,styleX=0）。
//  · 无折翼动画：全文无动画面——瞬时直写+一声 SoundID 8（两向同声;SoundID.cs:39
//    DoorOpen=8）;无臂可走尾流 SoundID 9（DoorClosed=9,:52045-52047）,臂内失败静默。
//  · 门序：386 臂 Validate→SkipWire→EmptyTile 实体门→Sound→ClearTile→写→TileFrame;
//    387 臂 CanKillTile 门→Validate→折翼行可砍门→SkipWire→Sound→砍切 KillTile→写
//    （漆/涂层 BlockColorAndCoating 逐列缓存 UseBlockColors 还原）→TileFrame。
// shell 模式同 bj322-tallgate-shift-atomic.test.ts（Object.create(Game.prototype)+桩）。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { shiftTrapdoor, type ShiftTrapdoorOpts } from '../src/world/Door';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { deviceTable } from '../src/world/wiring/devices';

const OPEN = TILE_BY_KEY['v_386_trapdooropen']!;
const CLOSED = TILE_BY_KEY['v_387_trap_door_closed']!;
const STONE = TILE_BY_KEY['stone']!;
const PLANT = TILE_BY_KEY['v_3_forest_short_plants']!;   // sheet 3 = tileCut 白名单

interface Drop { key: string; n: number }

/** Game 壳（bj322 mkShell 同款桩面+活板门右键面所需 player/input） */
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
  g.entities = { add: () => {}, critters: [], drops: [], enemies: [], npcs: [], projectiles: [] };
  g.trackTile = 0;
  g.scene = null;
  g.input = { rightDown: true };
  // 玩家站远处（cy 决定 playerAbove：cy < ty*16 → playerAbove=true 折翼向下）
  // ★BJ343：+dead/isGhostPhase（EmptyTile 谓词玩家臂 :1368 豁免判据,真实 Player API 面）
  g.player = {
    x: -500, y: -500, w: 20, h: 42, cx: -490, cy: -479,
    dead: false, isGhostPhase: () => false,
    inv: { countOf: () => 0 }, equipStats: { cordage: false, flowerBoots: false },
  };
  return g as unknown as {
    checkDecorSquareFrame: (x: number, y: number) => void;
    toggleTrapdoor: (x: number, y: number) => void;
    input: { rightDown: boolean };
  };
}

/** Game.ts:7092 同款监听装配（真实游戏恒在——半写态判坏面=本刀病灶的成立前提） */
function wireListeners(w: World, g: ReturnType<typeof mkShell>): void {
  w.store.onTileChanged((x, y) => g.checkDecorSquareFrame(x, y));
}

/** 活板门合成：关行 y=12（格 (10,12),(11,12) frameX 0/18）、左右侧锚实心 (9,12)/(12,12)。
 *  锚行不变式：CheckTrapDoor 386 锚行=关行（styleX0 底行/styleX1 顶行）→ 开后完整性自洽 */
function setupClosed(w: World): void {
  const st = w.store;
  for (const sx of [9, 12]) st.setTileSilent(sx, 12, STONE, 0, 0);
  st.setTileSilent(10, 12, CLOSED, 0, 0);
  st.setTileSilent(11, 12, CLOSED, 18, 0);
}

/** 开态合成（锚行不变式：CheckTrapDoor 386 锚行=关位行 12——styleX0（向上折态）
 *  行 11..12 关位=底行 12 / styleX1（向下折态）行 12..13 关位=顶行 12） */
function setupOpen(w: World, styleX: 0 | 1): void {
  const st = w.store;
  const bx = styleX === 0 ? 0 : 36;
  const ay = styleX === 0 ? 11 : 12;
  for (const sx of [9, 12]) st.setTileSilent(sx, 12, STONE, 0, 0);
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    st.setTileSilent(10 + dx, ay + dy, OPEN, bx + dx * 18, dy * 18);
  }
}

describe('BJ324 纯核 shiftTrapdoor（WorldGen.cs:51897-52048 1:1）', () => {
  it('关→开 playerAbove=true：折翼向下（行 12..13,frameX 36/54=styleX1,frameY 0/18）零掉落', () => {
    const w = new World(40, 40, 7, 'bj324-open-down');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    setupClosed(w);
    wireListeners(w, g);
    expect(shiftTrapdoor(w.store, 10, 12, true, {
      tileFrame: (x, y) => g.checkDecorSquareFrame(x, y),
    })).toBe(true);
    const st = w.store;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = st.idx(10 + dx, 12 + dy);
      expect(st.get(10 + dx, 12 + dy)).toBe(OPEN);                    // :52024 type=386
      expect(st.frameX[i]).toBe(36 + dx * 18);                        // :52025 +playerAbove*36
      expect(st.frameY[i]).toBe(dy * 18);                             // :52026 row7*18
    }
    expect(drops).toEqual([]);                                        // 完整件零误杀零掉落
  });

  it('关→开 playerAbove=false：折翼向上（行 11..12,frameX 0/18=styleX0）', () => {
    const w = new World(40, 40, 7, 'bj324-open-up');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    setupClosed(w);
    wireListeners(w, g);
    expect(shiftTrapdoor(w.store, 10, 12, false, {
      tileFrame: (x, y) => g.checkDecorSquareFrame(x, y),
    })).toBe(true);
    const st = w.store;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = st.idx(10 + dx, 11 + dy);
      expect(st.get(10 + dx, 11 + dy)).toBe(OPEN);
      expect(st.frameX[i]).toBe(0 + dx * 18);
      expect(st.frameY[i]).toBe(dy * 18);
    }
    expect(drops).toEqual([]);
  });

  it('开→关两臂：styleX1 清底行写顶行 / styleX0 清顶行写底行——关位恒回原关行 12', () => {
    for (const styleX of [0, 1] as const) {
      const w = new World(40, 40, 7, `bj324-close-${styleX}`);
      const drops: Drop[] = [];
      const g = mkShell(w, drops);
      setupOpen(w, styleX);
      wireListeners(w, g);
      expect(shiftTrapdoor(w.store, 10, 12, true, {
        tileFrame: (x, y) => g.checkDecorSquareFrame(x, y),
      })).toBe(true);
      const st = w.store;
      // 387 落在关位行 12（styleX1 臂写顶行 ay=12 / styleX0 臂写底行 ay+1=12）
      for (let dx = 0; dx < 2; dx++) {
        const i = st.idx(10 + dx, 12);
        expect(st.get(10 + dx, 12)).toBe(CLOSED);                     // :51931/:51973 type=387
        expect(st.frameX[i]).toBe(dx * 18);                           // :51932 j*18
        expect(st.frameY[i]).toBe(0);                                 // :51933 styleY*18（36px 帧面 styleY 恒 0）
        // 非关位行清空（styleX1 底行 13 / styleX0 顶行 11）
        const cy = styleX === 1 ? 13 : 11;
        expect(st.get(10 + dx, cy)).toBe(0);                          // :51923 ClearTile / :51966
      }
      expect(drops).toEqual([]);
    }
  });

  it('点击右列/底行任意格：GetTopLeftAndStyles 锚归一（:51902/:51987）整件操作', () => {
    const w = new World(40, 40, 7, 'bj324-anchor');
    const g = mkShell(w, []);
    setupClosed(w);
    // 右列点击开门 → 全 2×2 开
    expect(shiftTrapdoor(w.store, 11, 12, true, {})).toBe(true);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(10 + dx, 12 + dy)).toBe(OPEN);
    }
    // 底行右列点击关门（styleX1 开态）→ 整件关
    expect(shiftTrapdoor(w.store, 11, 12, true, {})).toBe(true);
    for (let dx = 0; dx < 2; dx++) {
      expect(w.store.get(10 + dx, 12)).toBe(CLOSED);
      expect(w.store.get(10 + dx, 13)).toBe(0);
    }
  });

  it('实体占位门（EmptyTile ignoreTiles :51915-51919/:51957-51961）：关门目标行被占 → 静默拒+零写入（SkipWire 照跳=原版序）', () => {
    const w = new World(40, 40, 7, 'bj324-blocked');
    const g = mkShell(w, []);
    setupOpen(w, 1);
    wireListeners(w, g);
    const skips: Array<[number, number]> = [];
    const sfx: string[] = [];
    const opts: ShiftTrapdoorOpts = {
      blocked: (bx, by) => bx >= 10 && bx <= 11 && by === 12,   // 关位行 12 被占
      skipCell: (sx, sy) => skips.push([sx, sy]),
      sfx: (n) => sfx.push(n),
    };
    expect(shiftTrapdoor(w.store, 10, 12, true, opts)).toBe(false);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(10 + dx, 12 + dy)).toBe(OPEN);          // 原样（styleX1 开态=行 12..13）
    }
    expect(skips).toEqual([[10, 11], [10, 12], [11, 11], [11, 12]]);  // styleX1 臂跳 ay-1..ay（:51949-51955 ★含门外上一行）
    expect(sfx).toEqual([]);                                     // 臂内失败静默（:52045 尾流只归无臂可走）
  });

  it('折翼行门（:51998-52002）：实心拒开/可砍格放行并碎掉（tileCut KillTile 近似）;开门臂无实体门', () => {
    // 实心拒（playerAbove=false 折翼行 11 有石头）
    const w1 = new World(40, 40, 7, 'bj324-fold-solid');
    setupClosed(w1);
    w1.store.setTileSilent(10, 11, STONE, 0, 0);
    expect(shiftTrapdoor(w1.store, 10, 12, false, {})).toBe(false);
    expect(w1.store.get(10, 12)).toBe(CLOSED);                   // 原样
    expect(shiftTrapdoor(w1.store, 10, 12, true, {})).toBe(true); // 反向（向下）不受影响
    // 可砍格放行+碎掉（sheet3 短草=tileCut）
    const w2 = new World(40, 40, 7, 'bj324-fold-cut');
    setupClosed(w2);
    w2.store.setTileSilent(10, 11, PLANT, 0, 0);
    w2.store.setTileSilent(11, 11, PLANT, 18, 0);
    expect(shiftTrapdoor(w2.store, 10, 12, false, {})).toBe(true);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w2.store.get(10 + dx, 11 + dy)).toBe(OPEN);         // 草被开态覆盖（:52012-52017 KillTile→写）
    }
  });

  it('CanKillTile 门（:51990-51992）：关门件本体不可毁 → 拒开静默', () => {
    const w = new World(40, 40, 7, 'bj324-cankill');
    setupClosed(w);
    expect(shiftTrapdoor(w.store, 10, 12, true, { canKill: () => false })).toBe(false);
    expect(w.store.get(10, 12)).toBe(CLOSED);
    expect(shiftTrapdoor(w.store, 10, 12, true, { canKill: () => true })).toBe(true);
  });

  it('漆/涂层传承（:52020 BlockColorAndCoating→:52029 UseBlockColors）：开态 2×2 全承关格块侧漆;关门底行漆存活', () => {
    const w = new World(40, 40, 7, 'bj324-paint');
    const st = w.store;
    setupClosed(w);
    const iL = st.idx(10, 12);
    st.paint[iL] = 7;
    st.coat[iL] |= TileStore.COAT_FULLBRIGHT_BLOCK;
    st.paint[st.idx(11, 12)] = 7;
    st.coat[st.idx(11, 12)] |= TileStore.COAT_FULLBRIGHT_BLOCK;   // 逐列缓存（:52020 列内 cache）——两列都要给
    expect(shiftTrapdoor(st, 10, 12, true, {})).toBe(true);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = st.idx(10 + dx, 12 + dy);
      expect(st.paint[i]).toBe(7);                               // 开态全体继承
      expect(st.coat[i] & TileStore.COAT_FULLBRIGHT_BLOCK).toBeTruthy();
    }
    // 反向关门：387 承开态底行（关格本体 active→active）漆
    expect(shiftTrapdoor(st, 10, 12, true, {})).toBe(true);
    for (let dx = 0; dx < 2; dx++) {
      expect(st.paint[st.idx(10 + dx, 12)]).toBe(7);
    }
  });

  it('音效面：成功恒 SoundID 8 两向同声（door_open）;无臂可走尾流 SoundID 9（door_close）;臂内失败静默', () => {
    const w = new World(40, 40, 7, 'bj324-sfx');
    setupClosed(w);
    const sfx: string[] = [];
    expect(shiftTrapdoor(w.store, 10, 12, true, { sfx: (n) => sfx.push(n) })).toBe(true);
    expect(sfx).toEqual(['door_open']);                          // :52010（SoundID 8=DoorOpen legacy 8）
    expect(shiftTrapdoor(w.store, 10, 12, true, { sfx: (n) => sfx.push(n) })).toBe(true);
    expect(sfx).toEqual(['door_open', 'door_open']);             // 关臂同声 :51919/:51961
    // 非活板门格 → 尾流 buzz（SoundID 9=DoorClosed,:52045-52047）
    sfx.length = 0;
    expect(shiftTrapdoor(w.store, 5, 5, true, { sfx: (n) => sfx.push(n) })).toBe(false);
    expect(sfx).toEqual(['door_close']);
  });

  it('onlyCloseOrOpen（MessageBuffer.cs:1314/:1317）：1=只许开跳过 386 关臂 / 0=只许关跳过 387 开臂——被跳侧落尾流', () => {
    const w = new World(40, 40, 7, 'bj324-oc');
    setupClosed(w);
    const sfx: string[] = [];
    // 关门件 + onlyCloseOrOpen=0（只许关）→ 387 开臂被跳 → 尾流
    expect(shiftTrapdoor(w.store, 10, 12, true, { onlyCloseOrOpen: 0, sfx: (n) => sfx.push(n) })).toBe(false);
    expect(sfx).toEqual(['door_close']);
    expect(w.store.get(10, 12)).toBe(CLOSED);
    // 关门件 + onlyCloseOrOpen=1（只许开）→ 正常开
    expect(shiftTrapdoor(w.store, 10, 12, true, { onlyCloseOrOpen: 1 })).toBe(true);
    // 开门件 + onlyCloseOrOpen=1（只许开）→ 386 关臂被跳 → 尾流
    sfx.length = 0;
    expect(shiftTrapdoor(w.store, 10, 12, true, { onlyCloseOrOpen: 1, sfx: (n) => sfx.push(n) })).toBe(false);
    expect(sfx).toEqual(['door_close']);
    expect(w.store.get(10, 12)).toBe(OPEN);
  });

  it('残件免疫（ValidateTileSquareIsActiveAndOfType :51905/:51947/:51994）：缺格开态拒切换零写入零误杀', () => {
    const w = new World(40, 40, 7, 'bj324-partial');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    const st = w.store;
    // 旧 shiftTrapdoorFlip 病灶遗留态：单行 2 格 386（2×2 缺底行）
    for (const sx of [9, 12]) st.setTileSilent(sx, 12, STONE, 0, 0);
    st.setTileSilent(10, 12, OPEN, 0, 0);
    st.setTileSilent(11, 12, OPEN, 18, 0);
    wireListeners(w, g);
    expect(shiftTrapdoor(st, 10, 12, true, {
      tileFrame: (x, y) => g.checkDecorSquareFrame(x, y),
    })).toBe(false);                                             // Validate 静默拒（无写入=无派发=无误杀）
    expect(st.get(10, 12)).toBe(OPEN);
    expect(drops).toEqual([]);
  });
});

// ================= 右键面（Player.cs:32535-32548 → Game.toggleTrapdoor） =================

describe('BJ324 右键面 toggleTrapdoor（Game shell+真实监听）', () => {
  it('开/合/开全链：整件存活+零掉落+右键恒消费（flag2=true :32537）', () => {
    const w = new World(40, 40, 7, 'bj324-rc');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    setupClosed(w);
    wireListeners(w, g);
    g.toggleTrapdoor(10, 12);                                    // cy=-479 < 192 → playerAbove=true 向下开
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(10 + dx, 12 + dy)).toBe(OPEN);
    }
    expect(drops).toEqual([]);
    g.toggleTrapdoor(11, 13);                                    // 开态任意格右键 → 关（styleX1 臂清底行写顶行）
    for (let dx = 0; dx < 2; dx++) {
      expect(w.store.get(10 + dx, 12)).toBe(CLOSED);
      expect(w.store.get(10 + dx, 13)).toBe(0);
    }
    expect(drops).toEqual([]);
    expect(g.input.rightDown).toBe(false);                       // :32537 flag2=true 恒消费
  });

  it('实体占位（areaEmptyAt）：关门时目标行被敌怪占 → 静默拒零写入（BJ250 占位门单源）', () => {
    const w = new World(40, 40, 7, 'bj324-rc-blocked');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    setupOpen(w, 1);
    wireListeners(w, g);
    (g as unknown as { entities: { enemies: unknown[] } }).entities.enemies
      .push({ x: 10 * 16, y: 12 * 16, w: 16, h: 16 });           // 关位行 12 占位
    g.toggleTrapdoor(10, 12);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(10 + dx, 12 + dy)).toBe(OPEN);          // 原样（styleX1 开态=行 12..13）
    }
    expect(drops).toEqual([]);
  });
});

// ================= 导线面（Wiring.cs:1443-1449 → devices case 386/387） =================

describe('BJ324 导线面 deviceTable case 386/387（双掷重试+SkipWire+尾 TileFrame 面）', () => {
  function mkWr(w: World) {
    const wr = new Wiring(w.store);
    const skips: Array<[number, number]> = [];
    wr.skipCell = (x, y) => skips.push([x, y]);
    return { wr, skips };
  }
  function mkCtx(w: World, g: ReturnType<typeof mkShell>, areaEmpty: (x: number, y: number, w2: number, h2: number) => boolean) {
    const faces: Array<[number, number]> = [];
    return {
      ctx: {
        dropItem: () => {}, spawnNpc: () => false, mechSpawnOk: () => true,
        itemSpawnOk: () => true, countProjectiles: () => 0,
        areaEmpty,
        sfx: () => {},
        tileFrame: (x: number, y: number) => { faces.push([x, y]); g.checkDecorSquareFrame(x, y); },
      },
      faces,
    };
  }

  it('case 387 关→开（向下折首掷成功）：skipCell×4+尾面 16 格+整件零掉落', () => {
    const w = new World(40, 40, 7, 'bj324-wire-open');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    setupClosed(w);
    wireListeners(w, g);
    const { wr, skips } = mkWr(w);
    const { ctx, faces } = mkCtx(w, g, () => true);
    expect(deviceTable(wr, ctx as never, 387, 10, 12)).toBe(true);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(10 + dx, 12 + dy)).toBe(OPEN);
    }
    expect(skips).toEqual([[10, 12], [10, 13], [11, 12], [11, 13]]);  // :52004-52008 关行+折翼行
    expect(faces.length).toBe(16);                                     // :52034-52040 4×4 全在界
    expect(drops).toEqual([]);
  });

  it('case 386 开→关（styleX0 臂）：skipCell×4+尾面 12 格+整件零掉落', () => {
    const w = new World(40, 40, 7, 'bj324-wire-close');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    setupOpen(w, 0);
    wireListeners(w, g);
    const { wr, skips } = mkWr(w);
    const { ctx, faces } = mkCtx(w, g, () => true);
    expect(deviceTable(wr, ctx as never, 386, 10, 11)).toBe(true);
    for (let dx = 0; dx < 2; dx++) {
      expect(w.store.get(10 + dx, 12)).toBe(CLOSED);
      expect(w.store.get(10 + dx, 11)).toBe(0);
    }
    expect(skips).toEqual([[10, 11], [10, 12], [11, 11], [11, 12]]);  // :51907-51913 2×2
    expect(faces.length).toBe(12);                                     // :51925-51929 4×3
    expect(drops).toEqual([]);
  });

  it('反向重试（Wiring.cs:1446-1449 同 Player 双掷）：向下折翼行被实心占 → 首掷败二掷向上成', () => {
    const w = new World(40, 40, 7, 'bj324-wire-retry');
    const g = mkShell(w, []);
    setupClosed(w);
    wireListeners(w, g);
    w.store.setTileSilent(10, 13, STONE, 0, 0);                  // 折翼行 13（向下）实心
    w.store.setTileSilent(11, 13, STONE, 0, 0);
    const { wr } = mkWr(w);
    const { ctx } = mkCtx(w, g, () => true);
    expect(deviceTable(wr, ctx as never, 387, 10, 12)).toBe(true);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(10 + dx, 11 + dy)).toBe(OPEN);          // 向上开（frameX 0/18）
      expect(w.store.frameX[w.store.idx(10 + dx, 11 + dy)]).toBe(dx * 18);
    }
  });

  it('关门占位拒（areaEmpty=false）：静默拒+SkipWire 照跳（原版序先于占位门 :51907→:51915）', () => {
    const w = new World(40, 40, 7, 'bj324-wire-blocked');
    const drops: Drop[] = [];
    const g = mkShell(w, drops);
    setupOpen(w, 0);
    wireListeners(w, g);
    const { wr, skips } = mkWr(w);
    const { ctx } = mkCtx(w, g, () => false);
    expect(deviceTable(wr, ctx as never, 386, 10, 11)).toBe(true);   // deviceTable 恒 true（器件命中面）
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      expect(w.store.get(10 + dx, 11 + dy)).toBe(OPEN);          // 原样
    }
    expect(skips.length).toBe(8);                                // 双掷各 4（:1446-1449 重试面;vanilla Set 去重=4 唯一键）
    expect(new Set(skips.map(([a, b]) => `${a},${b}`)).size).toBe(4);  // 唯一键=styleX0 臂 2×2
    expect(drops).toEqual([]);
  });
});

// BJ324 变异回归主试金石：上组「关→开 playerAbove=true」+「右键面开/合/开」——
// 摘 suppressListeners 裸写窗 → 半写态派发 → CheckTrapDoor 中途判坏 killDecorTile
// → 掉 3239 + 件残缺 = 两测试爆红（逐字节还原后复绿）。
