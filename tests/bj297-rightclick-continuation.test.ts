// ★BJ297（2026-09-23）右键交互全表对照续批——首批（BJ250）后剩余面落刀：
//   ① 411 起爆器 frameX<36 按下态门（Player.cs:32581——旧臂缺门=压住连点重复触发）；
//   ② 139 八音盒右键收窄（:32473 仅 139;35 南瓜灯右键翻面系 1.3 世代语义,
//      1.4 三基准 1457/1456/1405 均无,35 仅导线 case 35 可翻——越权支摘除）；
//   ③ 314 矿车右键族（:33524-33539 + 邻域扫描 :32213-32250）：
//      gravDir==1f 整支门 / 骑乘（非矿车）TryDismount 下坐支 / 骑矿车下车不重上 /
//      ±2 邻域"盲瞄轨道"扫描（TryInteractingWithMinecartTrackInNearbyArea 全支新接）。
// 行为锁 = shell 直驱 interactAt / rightClickTileNpcDispatch / minecartTrackInteraction
// + 结构锁（Game.ts 源码臂标记,无法直驱的 updateUse 两臂 gravDir 门以源码锚钉死）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY, T } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { Wiring } from '../src/world/Wiring';
import { smartInteractTileFrame } from '../src/core/SmartInteractTiles';

const C314 = TILE_BY_KEY['v_314_minecart_track'];
const C411 = TILE_BY_KEY['v_411_detonator'];
const C139 = TILE_BY_KEY['v_139_musicboxes'];
const C35 = TILE_BY_KEY['v_35_jackolanterns'];

function mkWorld(): World {
  return new World(80, 60, 7, 'bj297');
}

interface Shell {
  g: Record<string, unknown> & {
    interactAt(tx: number, ty: number): void;
    rightClickTileNpcDispatch(tx: number, ty: number, heldDef: null): boolean;
    minecartTrackInteraction(tx: number, ty: number): boolean;
    input: { rightDown: boolean };
    player: Record<string, unknown>;
    minecart: unknown;
    tileInteractHappened: boolean;
    smartInteractNpcId: number;
  };
  sfx: string[];
  hitSwitchCalls: Array<[number, number]>;
  tryDismountCalls: number[];
  mountCalls: Array<[number, number]>;
}

function bjShell(w: World, ptx = 30, pty = 30): Shell {
  const g = Object.create(Game.prototype) as Shell['g'];
  const hitSwitchCalls: Array<[number, number]> = [];
  const tryDismountCalls: number[] = [];
  const mountCalls: Array<[number, number]> = [];
  const sfx: string[] = [];
  const wiring = new Wiring(w.store);
  (wiring as unknown as { hitSwitch: unknown }).hitSwitch = (x: number, y: number) => { hitSwitchCalls.push([x, y]); };
  g.world = w;
  g.wiring = wiring;
  g.input = { rightDown: true };
  g.netCanEditTile = () => true;
  g.entities = { projectiles: [], enemies: [], npcs: [], critters: [], add: () => {} };
  const px = ptx * TILE + 8, py = pty * TILE + 8;
  g.player = {
    cx: px, cy: py, x: px - 6, y: py - 14, w: 12, h: 28,
    gravDir: 1,
    ridingMount: false,
    mount: { tryDismount: () => { tryDismountCalls.push(1); return true; } },
    buffs: { apply: () => {}, has: () => false },
    inv: { slots: [], heldItem: () => null, miscEquips: [] },
  };
  g.inTileRange = (x: number, y: number) => Math.abs(x - ptx) <= 5 && Math.abs(y - pty) <= 3;
  g.camera = { screenToWorld: (x: number, y: number): [number, number] => [x, y] };
  g.playSfxFile = (name: string) => { sfx.push(name); };
  g.sfxAt = (name: string) => { sfx.push(name); };
  g.sfx = { play: () => {} };
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  g._prevRightDown = false;
  // Object.create(Game.prototype) 跳过构造器=字段初始化器全缺——本测触及面显式补齐
  g.trackTile = C314;
  g.smartInteractNpcId = -1;
  g.tileInteractHappened = false;
  // mountMinecartAt 间谍（真体照跑,记录候选锚）
  const realMount = (Game.prototype as unknown as { mountMinecartAt: (x: number, y: number, m: number) => boolean }).mountMinecartAt;
  g.mountMinecartAt = function (x: number, y: number, m: number) {
    mountCalls.push([x, y]);
    return realMount.call(this, x, y, m);
  };
  return { g, sfx, hitSwitchCalls, tryDismountCalls, mountCalls };
}

// ============================================================
// ① 411 起爆器 frameX<36 门（Player.cs:32581）
// ============================================================
describe('BJ297 行为锁：411 起爆器按下态门（Player.cs:32581）', () => {
  it('未按下（frameX 0）右键 → HitSwitch 触发 + 消费 rightDown', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, C411, 0, 0);
    const { g, hitSwitchCalls } = bjShell(w, 11, 21);
    g.interactAt(10, 20);
    expect(hitSwitchCalls).toEqual([[10, 20]]);
    expect(g.input.rightDown).toBe(false);
  });

  it('按下态（frameX 36）右键 → 整支不进：不触发 + 不消费（vanilla :32581 门）', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, C411, 36, 0);
    const { g, hitSwitchCalls } = bjShell(w, 11, 21);
    g.interactAt(10, 20);
    expect(hitSwitchCalls).toEqual([]);
    expect(g.input.rightDown).toBe(true);   // 不消费=交谈臂语义同 vanilla 分支未进
  });
});

// ============================================================
// ② 139 收窄（右键仅 139;35 南瓜灯仅导线可翻）
// ============================================================
describe('BJ297 行为锁：139 八音盒右键收窄（Player.cs:32473 仅 139）', () => {
  it('139 右键 → Sound 28 + 2×2 frameX ±36 翻面', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) {
      st.setTileSilent(10 + c, 20 + r, C139, c * 18, r * 18);
    }
    const { g, sfx } = bjShell(w, 12, 22);
    g.interactAt(10, 20);
    expect(sfx).toContain('mech');
    expect(st.frameX[st.idx(10, 20)]).toBe(36);
    expect(st.frameX[st.idx(11, 21)]).toBe(36 + 18);
  });

  it('35 南瓜灯右键 → 无翻面无声不消费（分支整支不进,1.4 三基准同相）', () => {
    const w = mkWorld();
    const st = w.store;
    for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) {
      st.setTileSilent(10 + c, 20 + r, C35, c * 18, r * 18);
    }
    const { g, sfx } = bjShell(w, 12, 22);
    g.interactAt(10, 20);
    expect(sfx).toEqual([]);
    expect(st.frameX[st.idx(10, 20)]).toBe(0);           // 不翻
    expect(st.frameX[st.idx(11, 21)]).toBe(18);
    expect(g.input.rightDown).toBe(true);                // 分支未进不消费
  });
});

// ============================================================
// ③-1 314 分支体（minecartTrackInteraction 单源 :33524-33539）
// ============================================================
describe('BJ297 行为锁：314 分支体（骑矿车下车不重上 / 骑坐骑先下坐再上车）', () => {
  it('骑矿车 → 下车【不重上】（mount.Cart flag17=false :33530-33533）,返回 true', () => {
    const w = mkWorld();
    w.store.setTileSilent(32, 30, C314, 0, 0);
    const { g, mountCalls } = bjShell(w, 30, 30);
    const cart = { x: 1, y: 2, vx: 3, vy: 4, w: 24, h: 24, mounted: true, dead: false };
    g.minecart = cart;
    const ret = g.minecartTrackInteraction(32, 30);
    expect(ret).toBe(true);
    expect(g.minecart).toBeNull();                       // 已下车
    expect((cart as { dead: boolean }).dead).toBe(true);
    expect(g.player.ridingCart).toBe(false);
    expect(mountCalls).toEqual([]);                      // 未重上
  });

  it('骑非矿车坐骑 → TryDismount（:33534,结果不检）后照发上车（vanilla 403 到轨 SetMount 净语义）', () => {
    const w = mkWorld();
    w.store.setTileSilent(32, 30, C314, 0, 0);
    const { g, tryDismountCalls } = bjShell(w, 30, 30);
    g.player.ridingMount = true;
    const ret = g.minecartTrackInteraction(32, 30);
    expect(tryDismountCalls).toEqual([1]);
    expect(ret).toBe(true);
    expect(g.minecart).toBeTruthy();                     // 矿车已建
    expect(g.player.ridingCart).toBe(true);
  });

  it('无坐骑 → 直接上车（默认木质车）', () => {
    const w = mkWorld();
    w.store.setTileSilent(32, 30, C314, 0, 0);
    const { g } = bjShell(w, 30, 30);
    expect(g.minecartTrackInteraction(32, 30)).toBe(true);
    expect(g.minecart).toBeTruthy();
  });
});

// ============================================================
// ③-2 ±2 邻域盲瞄轨道扫描（TryInteractingWithMinecartTrackInNearbyArea :32213-32250）
// ============================================================
describe('BJ297 行为锁：±2 邻域轨道扫描（:32213-32250 全支新接）', () => {
  it('光标悬空格、±2 内有轨道 → 上车 + 消费 rightDown（flag2 分支入口置旗面）', () => {
    const w = mkWorld();
    w.store.setTileSilent(32, 30, C314, 0, 0);
    const { g } = bjShell(w, 30, 30);
    g.rightClickTileNpcDispatch(30, 30, null);
    expect(g.minecart).toBeTruthy();
    expect(g.input.rightDown).toBe(false);
  });

  it('扫描序 x 外层/y 内层升序——首个命中候选胜出（:32220-32248 双层 for 同序）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(32, 30, C314, 0, 0);
    st.setTileSilent(30, 31, C314, 0, 0);
    const { g, mountCalls } = bjShell(w, 30, 30);
    g.rightClickTileNpcDispatch(30, 30, null);
    expect(mountCalls.length).toBe(1);
    expect(mountCalls[0]![0]).toBe(30);                  // ix=30 先于 ix=32
    expect(mountCalls[0]![1]).toBe(31);                  // iy=31（同列先中）
  });

  it('gravDir=-1 → 整支不进（:32215/:33524 双重门）：不上车不消费', () => {
    const w = mkWorld();
    w.store.setTileSilent(32, 30, C314, 0, 0);
    const { g } = bjShell(w, 30, 30);
    g.player.gravDir = -1;
    g.rightClickTileNpcDispatch(30, 30, null);
    expect(g.minecart).toBeUndefined();                  // 未上车
    expect(g.input.rightDown).toBe(true);
  });

  it('tileInteractionHappened（光标臂已命中:212 雪球发射器支置旗不吞 rightDown）→ 扫描跳过（:32215 首门）', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(32, 30, C314, 0, 0);
    st.setTileSilent(30, 30, TILE_BY_KEY['v_212_snowballlauncher'], 0, 0);
    const { g } = bjShell(w, 30, 30);
    g.player.snowballLauncherInteractionCooldown = 0;
    g.rightClickTileNpcDispatch(30, 30, null);
    expect(g.tileInteractHappened).toBe(true);           // 212 支置旗（:32372→:33551）
    expect(g.minecart).toBeUndefined();                  // 扫描被旗压=不误上车
    expect(g.input.rightDown).toBe(true);                // 212 不吞（连喷语义）
  });

  it('智能交互候选在场（NPC 候选/tile 候选胜出）→ 扫描跳过（:32215 SmartInteract 门族）', () => {
    const w = mkWorld();
    w.store.setTileSilent(32, 30, C314, 0, 0);
    const { g } = bjShell(w, 30, 30);
    g.smartInteractNpcId = 5;
    g.rightClickTileNpcDispatch(30, 30, null);
    expect(g.minecart).toBeUndefined();
    const prev = smartInteractTileFrame.tileWon;
    smartInteractTileFrame.tileWon = true;               // SmartInteractShowingGenuine 镜像
    try {
      g.rightClickTileNpcDispatch(30, 30, null);
      expect(g.minecart).toBeUndefined();
    } finally {
      smartInteractTileFrame.tileWon = prev;
    }
  });

  it('骑矿车 + 光标非轨道、±2 内有轨道 → 下车（邻域下车支）+ 消费', () => {
    const w = mkWorld();
    w.store.setTileSilent(32, 30, C314, 0, 0);
    const { g } = bjShell(w, 30, 30);
    const cart = { x: 1, y: 2, vx: 0, vy: 0, w: 24, h: 24, mounted: true, dead: false };
    g.minecart = cart;
    g.rightClickTileNpcDispatch(30, 30, null);
    expect(g.minecart).toBeNull();
    expect((cart as { dead: boolean }).dead).toBe(true);
    expect(g.input.rightDown).toBe(false);
  });

  it('光标格=箱体（箱臂已消费 rightDown）→ 扫描跳过不误上车', () => {
    const w = mkWorld();
    const st = w.store;
    st.setTileSilent(32, 30, C314, 0, 0);
    st.setTileSilent(30, 30, T.CHEST, 0, 0);
    const { g } = bjShell(w, 30, 30);
    g.rightClickTileNpcDispatch(30, 30, null);
    expect(g.minecart).toBeUndefined();
  });

  it('候选超射程（inTileRange 门 :32224）→ 不上车', () => {
    const w = mkWorld();
    w.store.setTileSilent(38, 30, C314, 0, 0);           // 距玩家 8 格 > tileRange 5
    const { g } = bjShell(w, 30, 30);
    g.rightClickTileNpcDispatch(33, 30, null);           // 光标 33 在扫描域内,(38,30) 不在 ±2
    expect(g.minecart).toBeUndefined();
  });

  it('光标在世界缘带（<10,InWorld(cursor,10) 门 :32215）→ 扫描整支不进', () => {
    const w = mkWorld();
    w.store.setTileSilent(9, 30, C314, 0, 0);
    const { g } = bjShell(w, 9, 30);
    g.rightClickTileNpcDispatch(8, 30, null);
    expect(g.minecart).toBeUndefined();
    expect(g.input.rightDown).toBe(true);
  });
});

// ============================================================
// ④ 结构锁（updateUse 两臂 gravDir 门无法 shell 直驱,以源码锚钉死）
// ============================================================
describe('BJ297 结构锁：314 右键臂 gravDir 门（:33524 整支门两处落位）', () => {
  const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

  it('直接臂（updateUse 右键轨道上车臂）带 gravDir==1 门', () => {
    expect(src).toContain('if (inp.rightDown && this.player.gravDir === 1 && !this.minecart');
  });

  it('骑乘下车臂（矿车块内）带 gravDir==1 门', () => {
    expect(src).toContain('if (inp.rightDown && this.player.gravDir === 1 && mType === this.trackTile');
  });

  it('邻域扫描臂落位（interactAt 链后/交谈臂前）+ 候选消费 flag2 面', () => {
    expect(src).toContain('TryInteractingWithMinecartTrackInNearbyArea');
    expect(src).toContain('this.minecartTrackInteraction(ix, iy);');
    expect(src).toContain('&& !smartInteractTileFrame.tileWon');
  });
});
