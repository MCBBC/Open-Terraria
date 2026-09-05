import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';

// SW-AM1 2026-09-05：爆炸远端广播半边=发送侧掷后终伤（值同步——vanilla Damage()
// :12521 owner 结算 / Damage_PVP :14718 掷后 :14747 SendPlayerHurt 值同步;S1/AC1
// "被炸端本地结算=方差面 rig 近似"清偿）。sweater cap 发送侧算毕（:15131-15134, victim
// 自己的 sweater=msg5 代理镜像）/单机零广播对照/收端 bit1=dmgPreRolled 直读不再掷（旧端无位=基伤本地掷=改动前行为;本地面零变化由 AC1 既有测试钉值）。
// SW-AL2 2026-09-05（F-2）重基线：远端半边整面改 Damage_PVP 脸（:14637-14785——
// 1457 wiring 弹 108/164/1002 均 Main.myPlayer 生成,Wiring.cs:2043/:3093、
// WorldGen.cs:49178,非 owner 255 ⇒ 全弹域=PVP 脸）。值同步框架不变（SW-AM1 本支
// 仍成立）;变值三点=luck 源改投弹者正向（:14718,sweater cap/FixedSelf 表退役——
// 二者 SelfHurtPlayers 专属）+门组（:14639 damage>0/投弹者 hostile/pvpAllowed 房
// + :14646 victim hostile/team/immune）。壳补 policy/hostile/team/immune 访问器;
// 旧"108 毛衣恒 300"期望按 PVP 脸重钉（不截 300）。门组/luck 源判别钉面见
// sw-al2-redteam-clearance.test.ts。
const B = 24 * 16 + 8;
type G = Record<string, any>;
const mkGame = (net?: G) => {
  const g = Object.create(Game.prototype) as G;
  g.world = new World(48, 48, 7, 'am1');
  g.player = { cx: -9999, cy: -9999, w: 20, h: 42, luck: 0, hp: 100, dead: false, hostile: true, team: 0, lastDamageCause: null, equipStats: { deadMansSweater: false } };
  g.entities = { enemies: [], critters: [], npcs: [], drops: [], add: () => {} };
  g.sfxAt = () => {}; g.recLog = () => {}; g.breakTile = () => {};
  if (net) g.net = net; return g;
};
const mkNet = (sent: unknown[][], luck = 0): G => ({ active: true, mySlot: 0,
  players: new Map([[1, { active: true, x: B - 60, y: B, luck }]]),
  policy: { pvpAllowed: true },
  getProxyPvpImmuneRemaining: () => 0,
  sendStrikePlayer: (...a: unknown[]) => { sent.push(a); } });
const rp = (sweater = false, cx = B - 60): G => ({ cx, cy: B, w: 20, h: 42, dead: false, __netSlot: 1, hostile: true, team: 0, equipStats: { deadMansSweater: sweater } });

describe('SW-AM1 爆炸远端广播=发送侧掷后终值 + sweater cap', () => {
  it('发送侧 DV：28 弹 1000 → 40 爆广播∈[850,1150] 整数且 ≥3 档（旧径恒 1000）;flags=0x82', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent)); g.remotePlayerProxies = [rp()];
    for (let i = 0; i < 40; i++) g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(sent.length).toBe(40);
    for (const d of sent.map((a) => a[1] as number)) { expect(d).toBeGreaterThanOrEqual(850); expect(d).toBeLessThanOrEqual(1150); }
    expect(new Set(sent.map((a) => a[1])).size).toBeGreaterThanOrEqual(3);
    expect((sent[0][5] as number) & 0x82).toBe(0x82);
  });
  it('PVP 脸不吃 sweater cap（SW-AL2 F-2）：108 trap=true victim 佩毛衣 → 680..920 不截 300（cap=SelfHurtPlayers :15131 专属）;flags=0x82', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent)); g.remotePlayerProxies = [rp(true)];
    for (let i = 0; i < 12; i++) g.explodeAt(24, 24, 800, 0, false, 130, 0, 108, B, B, 0, 1);
    expect(sent.length).toBe(12);
    for (const d of sent.map((a) => a[1] as number)) { expect(d).toBeGreaterThanOrEqual(680); expect(d).toBeLessThanOrEqual(920); }
    expect(new Set(sent.map((a) => a[1])).size).toBeGreaterThanOrEqual(2);
    expect((sent[0][5] as number) & 0x82).toBe(0x82);
  });
  it('单机对照：net 未挂/未激活 → 零广播零异常（本地面不受远端改造影响）', () => {
    const solo = mkGame(); solo.remotePlayerProxies = [rp()];
    solo.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    const off = mkGame({ active: false, players: new Map(), sendStrikePlayer: () => { throw new Error('net 未激活不得广播'); } });
    off.remotePlayerProxies = [rp()]; off.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
  });
  it('scarab 773 同面：广播∈[425,575] 且 ≥3 档（旧径恒 500）;flags=0x82', () => {
    const sent: unknown[][] = [], g = mkGame(mkNet(sent)); g.remotePlayerProxies = [rp(false, B + 10)];
    for (let i = 0; i < 40; i++) g.scarabBombExplode(B, B, 500, 1);
    expect(sent.length).toBe(40);
    for (const d of sent.map((a) => a[1] as number)) { expect(d).toBeGreaterThanOrEqual(425); expect(d).toBeLessThanOrEqual(575); }
    expect(new Set(sent.map((a) => a[1])).size).toBeGreaterThanOrEqual(3);
    expect((sent[0][5] as number) & 0x82).toBe(0x82);
  });
  it('收端 bit7：bit1 置位→dmg 直读（40 次恒 300）;无位→基伤本地掷 ≥3 档（旧端降级=改动前行为）', () => {
    for (const [flags, flat] of [[0x82, true], [0x80, false]] as const) {
      const got: number[] = [], g = mkGame({ active: false, players: new Map([[1, { active: true, x: B - 60, y: B }]]) });
      g.damagePlayer = (d: number) => { got.push(d); return 0; };
      for (let i = 0; i < 40; i++) g.netApplyStrikePlayer(1, 300, 108, flags);
      expect(got.length).toBe(40);
      if (flat) expect(new Set(got)).toEqual(new Set([300])); else expect(new Set(got).size).toBeGreaterThanOrEqual(3);
    }
  });
});
