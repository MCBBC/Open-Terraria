// SW-AL2 2026-09-05 红队七轮清偿回归（F-2/F-3）：
//  F-2 爆炸远端广播=Damage_PVP 脸（Projectile.cs:14637-14785）——门组 :14639
//  `damage<=0||!Main.player[myPlayer].hostile` 早退 + :14646 victim
//  `dead/immune/!hostile/team` 门（pvpAllowed=本仓 RoomPolicy 房策略等价物,
//  immune=getProxyPvpImmuneRemaining>0 ⇔ player.immune,2026-08-30 攻端门禁契约）
//  + DV :14718 投弹者本地活 luck【正向】+ FixedSelf 表/sweater cap 不吃
//  （SelfHurtPlayers :15113/:15131 专属）。1457 wiring 弹 108/164/1002 均
//  Main.myPlayer 生成（Wiring.cs:2043/:3093,WorldGen.cs:49178）非 owner 255
//  ⇒ 全弹域=PVP 脸（SW-AM1 旧 SelfHurtPlayers 式退役;值同步框架不变）。
//  F-3 DirtBallProj tileCollisionFaceClamp hoik 邻格坡门（Collision.cs:2412/:2432
//  逐字;TileCollision :2299 末参 hoik 缺省 true,aiStyle10 调用 6 参
//  Projectile.cs:17718 → 弹幕域生效）——左支身邻 (i−1,j) slope∈{2,4}/右支
//  (i+1,j) slope∈{1,3}（对调,勿并写）时整支跳过（含 num/num2 簿记）→ X 钳不达
//  =不 Kill 穿入。可达臂注：aiStyle10 削平链（:59045-59051）只削坡 1/2 → 右支
//  实际可达臂=坡 3、左支=坡 4（坡 3/4 不在 topSlope 削平域）;镜像平格对照案钉
//  门判别性。逐拍公式：release 拍无碰撞,次拍 x=x0∓12（vx=∓12）,y+0.41。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game, FIXED_SELF_DAMAGE_FOR_PLAYERS } from '../src/core/Game';
import { DirtBallProj } from '../src/entities/DirtBallProj';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const B = 24 * 16 + 8;
type G = Record<string, any>;

// ---- F-2 夹具（同 explosion-am1 框架,PVP 门字段齐备）----
const mkGame = (net?: G, playerOver: G = {}) => {
  const g = Object.create(Game.prototype) as G;
  g.world = new World(48, 48, 7, 'al2');
  g.player = { cx: -9999, cy: -9999, w: 20, h: 42, luck: 0, hp: 100, dead: false,
    hostile: true, team: 0, lastDamageCause: null, equipStats: { deadMansSweater: false }, ...playerOver };
  g.entities = { enemies: [], critters: [], npcs: [], drops: [], add: () => {} };
  g.sfxAt = () => {}; g.recLog = () => {}; g.breakTile = () => {};
  if (net) g.net = net; return g;
};
const mkNet = (sent: unknown[][], over: G = {}): G => ({ active: true, mySlot: 0,
  players: new Map(), policy: { pvpAllowed: true }, getProxyPvpImmuneRemaining: () => 0,
  sendStrikePlayer: (...a: unknown[]) => { sent.push(a); }, ...over });
const rp = (over: G = {}): G => ({ cx: B - 60, cy: B, w: 20, h: 42, dead: false,
  __netSlot: 1, hostile: true, team: 0, equipStats: { deadMansSweater: false }, ...over });

describe('SW-AL2 F-2：爆炸远端广播 Damage_PVP 门组（:14639/:14646）', () => {
  it('pvpAllowed=false 房 → 零广播（非 PvP 房远端不再吃爆炸）', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent, { policy: { pvpAllowed: false } }));
    g.remotePlayerProxies = [rp()];
    for (let i = 0; i < 3; i++) g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(sent).toEqual([]);
  });
  it('投弹者非 hostile → 零广播（:14639 早退域;单机自伤半边不受影响）', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent), { hostile: false });
    g.remotePlayerProxies = [rp()];
    for (let i = 0; i < 3; i++) g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(sent).toEqual([]);
  });
  it('damage<=0 → 零广播（:14639 首臂;102 中性化路径 damage=0 同域）', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent));
    g.remotePlayerProxies = [rp()];
    g.explodeAt(24, 24, 0, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(sent).toEqual([]);
  });
  it('victim 非 hostile → 该受害者跳过,hostile 对照位照收（:14646 !player.hostile）', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent));
    g.remotePlayerProxies = [rp({ __netSlot: 1, hostile: false }), rp({ __netSlot: 2, cx: B - 60 })];
    g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(sent.map((a) => a[0])).toEqual([2]);
  });
  it('team 门（:14646 逐字）:投弹者队 1 → 同队跳过,异队/无队照收', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent), { team: 1 });
    g.remotePlayerProxies = [
      rp({ __netSlot: 1, team: 1 }),   // 同队 → continue
      rp({ __netSlot: 2, team: 2 }),   // 异队 → 收
      rp({ __netSlot: 3, team: 0 }),   // 无队 → 收（门=投弹者队≠0 且相等）
    ];
    g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(sent.map((a) => a[0])).toEqual([2, 3]);
  });
  it('immune 门（:14646 player.immune）:getProxyPvpImmuneRemaining>0 跳过,余位照收', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent,
      { getProxyPvpImmuneRemaining: (slot: number) => (slot === 1 ? 5 : 0) }));
    g.remotePlayerProxies = [rp({ __netSlot: 1 }), rp({ __netSlot: 2 })];
    g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(sent.map((a) => a[0])).toEqual([2]);
  });
  // ★统计锚校准（2026-09-05 偶发红定谳）：旧 60 样本 + 1030/970 界仅 ~1.6σ（真实
  //  E[luck±0.9] = 0.9×min/max-of-two + 0.1×单掷 = 955/1045,单样本 σ≈71 →
  //  σ_mean(60)≈9.2,P(偶发越界)≈5%——交付报告"≈6.7σ"系误算）。现 N=300
  //  （σ_mean≈4.1）+ 界 1015/985：对正确语义 7.3σ 裕度,对错向(955/1045)仍
  //  ~14.6σ 判别;统计锚对 Math.random 相位免疫（分布不变）,与独跑/联跑无关。
  it('DV luck 源=投弹者正向（:14718）:投弹者/mirror 同 +0.9 → 均值显著高（旧 -mirror 式会塌向低档）', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent,
      { players: new Map([[1, { active: true, x: B - 60, y: B, luck: 0.9 }]]) }), { luck: 0.9 });
    g.remotePlayerProxies = [rp()];
    for (let i = 0; i < 300; i++) g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    const vals = sent.map((a) => a[1] as number);
    expect(vals.length).toBe(300);
    for (const d of vals) { expect(d).toBeGreaterThanOrEqual(850); expect(d).toBeLessThanOrEqual(1150); }
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    expect(mean).toBeGreaterThan(1015);           // luck +0.9 重掷取 max → E≈1045;旧式(-mirror=-0.9) E≈955
  });
  it('DV luck 源判别对称案:投弹者/mirror 同 −0.9 → 均值显著低（旧式(+0.9)会抬向高档）', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent,
      { players: new Map([[1, { active: true, x: B - 60, y: B, luck: -0.9 }]]) }), { luck: -0.9 });
    g.remotePlayerProxies = [rp()];
    for (let i = 0; i < 300; i++) g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    const vals = sent.map((a) => a[1] as number);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    expect(mean).toBeLessThan(985);               // E≈955;旧式(+0.9) E≈1045 → 必红
  });
  it('FixedSelf 表不吃（PVP 脸无 :15113 覆写）:133 表值 60,裸伤 1000 → 广播仍按 1000 档', () => {
    expect(FIXED_SELF_DAMAGE_FOR_PLAYERS[133]).toBe(60);
    const sent: unknown[][] = [], g = mkGame(mkNet(sent));
    g.remotePlayerProxies = [rp()];
    for (let i = 0; i < 8; i++) g.explodeAt(24, 24, 1000, 0, false, 64, 0, 133, B, B, 8, 1);
    for (const d of sent.map((a) => a[1] as number)) expect(d).toBeGreaterThanOrEqual(850);
  });
  it('scarab 773 同门组:pvpAllowed=false → 零广播（同 explodeAt PVP 脸）', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent, { policy: { pvpAllowed: false } }));
    g.remotePlayerProxies = [rp()];
    g.scarabBombExplode(B, B, 500, 1);
    expect(sent).toEqual([]);
  });
});

// ---- F-3 夹具（同 dirtball-embed-slope34 框架）----
const DIRT = TILE_INTERNAL_BY_SHEET.get(0)!;
interface Env { drops: Array<{ x: number; y: number; key: string }>; sfx: string[]; }
function mkEnv() {
  const w = new World(80, 120, 30, 'open');   // h−40=80 扫描端钳(Collision.cs:2317-2318)
  const env: Env = { drops: [], sfx: [] };
  const g = {
    world: w, player: null, enemies: () => [], critters: () => [],
    cutTile: () => {},
    playSfx: (name: string) => { env.sfx.push(name); },
    spawnDrop: (x: number, y: number, key: string) => { env.drops.push({ x, y, key }); return null; },
    spawnDust: () => null,
  } as unknown as GameHooks;
  const orig = Math.random;
  Math.random = () => 0.9;
  return { w, g, env, restore: () => { Math.random = orig; } };
}

describe('SW-AL2 F-3：tileCollisionFaceClamp hoik 邻格坡门（:2412/:2432）', () => {
  it('右支坡 3 身邻（:2432 slope∈{1,3}）→ 整支跳过不 Kill,穿入续行', () => {
    const { w, g, env, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT);
      w.store.setTileSilent(41, 40, DIRT);
      w.store.setSlope(41, 40, 3);                // 身邻坡 3（削平链不动 3/4）
      const p = new DirtBallProj(675, 646, -12, 0, () => null, 'v_2');
      // T1 release（无碰撞）→ T2 旧盒[658,668)×[641.41,651.41) 全在 (40,40) 右侧,
      // 新盒[646,656) 入格 → 右支 hoik:身邻 (41,40) slope 3 → 跳过 → 无钳不 Kill
      p.fixedUpdate(0, g); p.fixedUpdate(0, g); p.fixedUpdate(0, g);
      expect(p.dead).toBe(false);
      expect(env.sfx).toEqual([]);
      expect(w.store.get(40, 40)).toBe(DIRT);
      expect(w.store.slope[w.store.idx(41, 40)]).toBe(3);
    } finally { restore(); }
  });
  it('右支对照:身邻平格（slope 0）→ 门不豁 → X 钳 Kill', () => {
    const { w, g, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT);
      w.store.setTileSilent(41, 40, DIRT);
      const p = new DirtBallProj(675, 646, -12, 0, () => null, 'v_2');
      p.fixedUpdate(0, g); p.fixedUpdate(0, g);
      expect(p.dead).toBe(true);                  // rx=656−658=−2 → clamped → Kill
    } finally { restore(); }
  });
  it('左支坡 4 身邻（:2412 slope∈{2,4}）→ 整支跳过不 Kill,穿入续行', () => {
    const { w, g, env, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT);
      w.store.setTileSilent(39, 40, DIRT);
      w.store.setSlope(39, 40, 4);                // 身邻坡 4（左支族;与右支 {1,3} 对调）
      const p = new DirtBallProj(617, 646, 12, 0, () => null, 'v_2');
      // T2 旧盒[624,634)×[641.41,651.41) 全在 (40,40) 左侧,新盒[636,646) 入格
      // → 左支 hoik:身邻 (39,40) slope 4 → 跳过（(39,40) 本身 flag3 :2367 剪角放行）
      p.fixedUpdate(0, g); p.fixedUpdate(0, g); p.fixedUpdate(0, g);
      expect(p.dead).toBe(false);
      expect(env.sfx).toEqual([]);
      expect(w.store.get(40, 40)).toBe(DIRT);
      expect(w.store.slope[w.store.idx(39, 40)]).toBe(4);
    } finally { restore(); }
  });
  it('左支对照:身邻平格（slope 0）→ 门不豁 → X 钳 Kill', () => {
    const { w, g, restore } = mkEnv();
    try {
      w.store.setTileSilent(40, 40, DIRT);
      w.store.setTileSilent(39, 40, DIRT);
      const p = new DirtBallProj(617, 646, 12, 0, () => null, 'v_2');
      p.fixedUpdate(0, g); p.fixedUpdate(0, g);
      expect(p.dead).toBe(true);                  // rx=640−634=6 → clamped → Kill
    } finally { restore(); }
  });
});
