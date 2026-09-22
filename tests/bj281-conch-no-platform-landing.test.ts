// BJ281 2026-09-22 用户二次实报+拍板：海螺传送应落「离海最近的自然物块」,两洋均不落平台
// （连续两次实报同一预期——BJ242/275 海螺友好化分歧的扩展,总旗 Game.CONCH_RIGHT_OCEAN_COMPENSATION
// 语义升级=「海螺不落平台」,回滚口不变,OFF 态仍=原版逐字）。
// 物证：behavior-log-天真的钴最高点-2026-09-22T08-33-28-284Z.json（seed 118606602）时间线：
//   t=3105 玩家 (98040,6603)px=tile(6127.5,412.7)=右洋水线岸（BJ275 落点）;t=3119 use
//   vi_4263_magic_conch;t=3165 玩家 (650,4971)px=tile(40.6,310.7)=左洋平台甲板——cells
//   (36..63,312)=[11,0,0,1,0] isPlatform=1（甲板 T11@312 浸水 L127,铺 36..170）。定谳仪
//   tools/_bj281-wld-evidence.test.ts（SW_ORACLE=1）：LIVE 刀前 left=(40,311)=甲板=实报病灶;
//   金标 inclPlat=false 左洋落 (171,311)=甲板内端自然沙岸承位（T22 沙升至水线 312）=用户预期;
//   右洋 (6127,413) 不变。
// 落刀：分歧开启态下两洋承位判据统一 includePlatforms=false（左洋主路径+右洋首试+补偿重试
//   +竖降/爬行/落点终扫全调用点;Game.ts inclPlat 单点）。自然实心+水面（liquid>0）保留承位;
//   浸水平台格走原版液面臂（liquid>0∧!SolidOrSloped→爬行）穿过;干平台=空气臂竖降穿过。
// 金标：TeleportHelpers.cs:49-241 + WorldGen.cs:70515-70540（includePlatforms:false 语义=
//   WorldGen.cs:70520-70523 tileSolidTop 即 false）。
import { describe, it, expect, beforeEach } from 'vitest';
import { Game } from '../src/core/Game';
import { Camera } from '../src/render/Camera';
import { World } from '../src/world/World';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';

function TILE_DEFS_SHEET(id: number): number {
  return TILE_DEFS[id]?.vanilla?.sheet ?? -1;
}
function paintRect(st: TileStore, x0: number, x1: number, y0: number, y1: number, type: number): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setTileSilent(x, y, type);
}
function paintWater(st: TileStore, x0: number, x1: number, y0: number, y1: number, amount = 200): void {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) st.setLiquid(x, y, amount, LIQUID_TYPE.WATER);
}
/** ★物证镜像双洋世界（w=600,对齐用户图两缘形态,深度比例缩小）：
 *  左洋（=用户图左缘）：浸水甲板 [36..170]@112（格内水 L127,起点列 40 物证同值）+
 *    水体 [30..170]@[112..143] + 自然沙岸 [171..180]@[112..196]（顶=水线行 112,
 *    对齐物证 (171,312) 沙 AT 水面行）。
 *  右洋（=用户图右缘形态,BJ275 同款）：干甲板 [W-170..W-36]@112 + 水体 [W-170..W-30]@
 *    [113..143]（水在甲板下一行）+ 西岸 [W-180..W-171]@[112..196]（顶高出水线一行）。 */
function evidenceMirrorWorld(): World {
  const w = new World(600, 300, 7, 'bj281-ev');
  w.groundLevel = 200;
  const st = w.store;
  const W = st.w;
  const plat = TILE_BY_KEY['platform'];
  const shell = TILE_BY_KEY['v_495_shell_pile_block'];
  expect(TILE_DEFS_SHEET(plat)).toBe(19);
  expect(TILE_DEFS_SHEET(shell)).toBe(495);   // 物证岸线=T128(495 贝壳堆)非沙（沙=窒息族,原版 dangerCrawl 同样走避）
  // 左洋：甲板+水体+浸水面
  paintRect(st, 36, 170, 112, 112, plat);
  paintWater(st, 30, 170, 112, 143);
  for (let x = 36; x <= 170; x++) st.setLiquid(x, 112, 127, LIQUID_TYPE.WATER);   // 物证：甲板格 L127
  paintRect(st, 171, 180, 112, 196, shell);  // 自然岸（顶=水线行,物证 (171,312)=T128）
  // 右洋：干甲板+下层水体+西岸
  paintRect(st, W - 170, W - 36, 112, 112, plat);
  paintWater(st, W - 170, W - 30, 113, 143);
  paintRect(st, W - 180, W - 171, 112, 196, shell);
  // 反 vacuous：两缘起点列被甲板盖住、左甲板浸水、两岸承位在位
  expect(st.flags[st.idx(40, 112)]).toBe(1);
  expect(st.liquid[st.idx(40, 112)]).toBe(127);
  expect(st.flags[st.idx(W - 40, 112)]).toBe(1);
  expect(st.liquid[st.idx(W - 40, 112)]).toBe(0);
  expect(st.flags[st.idx(171, 112)]).toBe(1);
  expect(st.flags[st.idx(W - 171, 112)]).toBe(1);
  return w;
}
type ConchFn = (rightOcean: boolean, inwardRetry?: boolean) => { x: number; y: number } | null;
function stubGame(world: World, px: number, py: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    player: Record<string, unknown>;
    world: World;
    requestMagicConchTeleportPosition: ConchFn;
  };
  g.world = world;
  g.player = {
    x: px, y: py, vx: 1, vy: 1, w: 20, h: 42, cx: px + 10, cy: py + 21,
    iframes: 0, fallStartY: 1234, team: 0,
    inv: { removeHeld: () => {} },
    removeAllGrapplingHooks: () => {},
    updateUnbreakableWallScan: () => {},
    equipStats: { fireWalk: false },
    buffs: null,
  };
  g.sfx = { play: () => {} };
  g.spawnParticles = () => {};
  g.camera = new Camera(800, 600);
  g.golfState = { tryGetCameraTrackingPosition: () => null };
  g.cb = {};
  g.net = null;
  g.spectatingSlot = -1;
  g.lastStripReq = '';
  return g as unknown as {
    player: { x: number; y: number; vy: number };
    world: World;
    requestMagicConchTeleportPosition: ConchFn;
  };
}
function spyRequest(g: ReturnType<typeof stubGame>): Array<[boolean, boolean]> {
  const calls: Array<[boolean, boolean]> = [];
  const proto = Game.prototype as unknown as { requestMagicConchTeleportPosition: ConchFn };
  g.requestMagicConchTeleportPosition = (ro: boolean, inward?: boolean) => {
    calls.push([ro, inward === true]);
    return proto.requestMagicConchTeleportPosition.call(g, ro, inward);
  };
  return calls;
}
function fire(g: ReturnType<typeof stubGame>, px: number): { x: number; y: number; vy: number } {
  (g as unknown as { fireRecallTeleport(c: unknown): void }).fireRecallTeleport({ vid: 4263, kind: 'ocean', triggerAt: 45, consume: false });
  return g.player;
}

describe('BJ281 海螺不落平台=两洋承位判据统一 includePlatforms:false（用户二次拍板「落离海最近自然物块」）', () => {
  beforeEach(() => { Game.CONCH_RIGHT_OCEAN_COMPENSATION = true; });   // 缺省=分歧开启

  it('①左洋甲板场景（物证镜像,缺省 ON）：竖降穿浸水甲板→液面爬行→落甲板内端自然沙岸 (171,111),非平台', () => {
    const w = evidenceMirrorWorld();
    const st = w.store;
    const g = stubGame(w, 0, 0);
    const dest = g.requestMagicConchTeleportPosition(false);
    expect(dest, 'ON:平台不作承位→落自然沙岸').not.toBeNull();
    expect(dest!.x).toBe(171 * TILE + 8 - 10);
    expect(dest!.y).toBe(111 * TILE + 16 - 42);
    // 落位面=自然贝壳堆（非平台非窒息族）：脚底格 (171,112) 物证同款 T128(495)
    const px = 171, py = 111;
    expect(st.flags[st.idx(px, py + 1)]).toBe(1);
    const d = TILE_DEFS[st.type[st.idx(px, py + 1)]];
    expect(d?.vanilla?.sheet).toBe(495);
    expect(d?.platform ?? false).toBe(false);
    // OFF 态边界：原版逐字=平台算承位,零爬行落甲板 (40,111)（=实报病灶相,回滚口语义）
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;
    try {
      const gOff = stubGame(w, 0, 0);
      const off = gOff.requestMagicConchTeleportPosition(false);
      expect(off, 'OFF:平台算承位→零爬行落甲板（原版逐字）').not.toBeNull();
      expect(off!.x).toBe(40 * TILE + 8 - 10);
      expect(off!.y).toBe(111 * TILE + 16 - 42);
    } finally {
      Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev;
    }
  });

  it('②右洋甲板场景（缺省 ON）：首试穿干甲板→液面爬行→对岸承位,单脚直达无补偿重试;OFF=InWorld quirk null', () => {
    const w = evidenceMirrorWorld();
    const W = w.store.w;
    const g = stubGame(w, 0, 0);
    const calls = spyRequest(g);
    const dest = g.requestMagicConchTeleportPosition(true);
    expect(dest, 'ON:首试直达对岸承位').not.toBeNull();
    expect(dest!.x).toBe((W - 171) * TILE + 8 - 10);
    expect(dest!.y).toBe(111 * TILE + 16 - 42);
    expect(calls, 'BJ281 后右洋首试已可达（BJ275 时代需 [true,false]+[true,true] 两脚）')
      .toEqual([[true, false]]);
    // fire 面：左半场玩家 → 首选右洋 → 单脚命中（velocity=Zero 命中臂）
    const g2 = stubGame(w, 40 * TILE, 110 * TILE);
    const calls2 = spyRequest(g2);
    const p = fire(g2, 40 * TILE);
    expect(p.x).toBe((W - 171) * TILE + 8 - 10);
    expect(p.y).toBe(111 * TILE + 16 - 42);
    expect(p.vy, '命中臂 velocity=Zero').toBe(0);
    expect(calls2).toEqual([[true, false]]);
    // OFF 态：平台算承位→零爬行落甲板 (W-40,111)→InWorld 拒=原版 null
    const prev = Game.CONCH_RIGHT_OCEAN_COMPENSATION;
    Game.CONCH_RIGHT_OCEAN_COMPENSATION = false;
    try {
      const gOff = stubGame(w, 0, 0);
      expect(gOff.requestMagicConchTeleportPosition(true), 'OFF:右洋恒败=原版 quirk').toBeNull();
    } finally {
      Game.CONCH_RIGHT_OCEAN_COMPENSATION = prev;
    }
  });

  it('③干平台竖降穿过=includePlatforms:false 空气臂语义：无岸时游出带外失败,补自然岸即落岸', () => {
    // 干平台（格内无水）既非承位（平台臂拒）也不触液面臂（liquid=0）→ 空气臂竖降穿过
    const w = new World(300, 240, 7, 'bj281-dry');
    w.groundLevel = 128;
    const st = w.store;
    const plat = TILE_BY_KEY['platform'];
    const shell = TILE_BY_KEY['v_495_shell_pile_block'];
    paintRect(st, 36, 46, 112, 112, plat);      // 干平台（无水）
    paintWater(st, 30, 60, 113, 143);           // 平台下一行起的水带
    const g = stubGame(w, 0, 0);
    expect(g.requestMagicConchTeleportPosition(false), '无自然岸：穿平台游出水带=失败（原版 noFloor 同败）').toBeNull();
    // 补自然岸 [61..70]@112（贝壳堆,非窒息族）→ 爬行到岸落 (61,111)（=「离海最近自然物块」）
    paintRect(st, 61, 70, 112, 196, shell);
    const g2 = stubGame(w, 0, 0);
    const dest = g2.requestMagicConchTeleportPosition(false);
    expect(dest, 'ON:干平台不作承位→落补种的自然沙岸').not.toBeNull();
    expect(dest!.x).toBe(61 * TILE + 8 - 10);
    expect(dest!.y).toBe(111 * TILE + 16 - 42);
  });

  it('④实心构筑物不受影响（缺省 ON）：自然实心仍承位,左洋实心塔顶照落', () => {
    const w = new World(300, 240, 7, 'bj281-tower');
    w.groundLevel = 128;
    const st = w.store;
    const dirt = TILE_BY_KEY['dirt'];
    paintWater(st, 30, 60, 113, 143);
    paintRect(st, 40, 41, 100, 196, dirt);      // 左洋双列实心塔（顶@100,高出水线）
    const g = stubGame(w, 0, 0);
    const dest = g.requestMagicConchTeleportPosition(false);
    expect(dest, '实心承位不受 BJ281 影响').not.toBeNull();
    expect(dest!.x).toBe(40 * TILE + 8 - 10);
    expect(dest!.y).toBe(99 * TILE + 16 - 42);
  });
});
