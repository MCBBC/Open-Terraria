// SW-AU1 2026-09-05 爆炸伤玩家「双脸」交叠域统一裁决（钉面测试）。
//
// 拓扑考古结论（Terarria1457/Terraria/Projectile.cs 亲读）：
//  · Damage() :12521-12530 路由——`owner == Main.myPlayer` → Damage_PVE+Damage_PVP；
//    `Main.netMode != 2` → Damage_EVP（hostile 弹打结算机本地玩家,pvp:false 字面）。
//  · SelfHurtPlayers :15104-15152——victim 恒 = 结算机本地玩家；调用点全树恰 3 处：
//    :71790（aiStyle16 弹 Kill,flag4=friendly&&!npcProj&&!RocketsSkipDamageForPlayers
//    ×flag5=owner==myPlayer||owner==255||getGoodWorld）、:43579（AI_184 恶运火把 949,
//    owner==myPlayer）、:71961（1117 雷击液体导电,owner==myPlayer）。pvp 参 =
//    :15124 `!hostile && type != 949`（949=TorchGod 火把神,非 DD2;非 hostile 却被
//    字面划出 pvp 档 → 事件伤不吃 8t 免疫/pvpDeath,Player.cs:38674/:38862）。
//  · Damage_PVP :14637-14785——入口 :14639 `damage<=0 || !Main.player[Main.myPlayer]
//    .hostile`（【投弹者】hostile,Main.myPlayer 在结算机=投弹者本人,非 victim）；
//    victim 环 :14643 `i == owner → continue`（owner 本人在 PVP 脸不可达）+
//    :14646 victim active/dead/immune/【victim.hostile】/team 门；Hurt 第 4 参
//    pvp:true 字面 :14747-14748；netMode!=0 → SendPlayerHurt(:14747) 广播,收端
//    msg117（MessageBuffer.cs:3882-3895,1457 无 26 号 hurt 活路）以 quiet:Hurt 重放,
//    pvp 位随信同步。
//  · 两脸按受害对【互斥】：SelfHurtPlayers victim ∈ {本地玩家}（owner∈{myPlayer,255}
//    ∪getGood）；Damage_PVP victim ∈ {i≠owner}。真交叠 = SelfHurtPlayers×Damage_EVP
//    （hostile 弹同拍同 victim 两达,108/164/1002 friendly+hostile 双置位）,原版由
//    调用序（:71790 SelfHurt 先于 :71792 Damage()）+ Hurt 冷却门（Player.cs
//    :38494-38497 `!flag && … → return 0`）吸收,非互斥结构。
//  · hostile 陷阱 {108,164,1002} 的跨端受害对在原版【不经 PVP 脸】：164/1002 服务端
//    spawn（Wiring.cs:3087 ExplodeMine `netMode!=1`/:3093、WorldGen.cs:49174/:49178,
//    服务端 Main.myPlayer≡255 → owner=255,PVP 脸在服务端 :14639 即死/客户端不进
//    :12522）→ 各端受害玩家由自持 SelfHurtPlayers（flag5 owner==255 臂 :71787）
//    pvp:false 结算;108 电路炸药 :2042（HitWireSingle 内无 netMode 门）=各端自持
//    副本 owner=各自 myPlayer → 受害端自持 SelfHurtPlayers（第一臂）先落。
//    ⇒ bit7 跨端面的 pvp 旗按表极性（=hostile 极性）还原首结算脸极性,裁决正确。
//  · 本仓裁决（verdict a + b 局部修）：两脸映射正确,唯 scarabBombExplode 本地自伤
//    半边漏传 pvp 参（773 非 hostile ⇒ :15124 flag=true）——本批已修（SW-AU1 标记）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';

const B = 24 * 16 + 8;
type G = Record<string, any>;

const mkGame = (net?: G) => {
  const g = Object.create(Game.prototype) as G;
  g.world = new World(48, 48, 7, 'au1');
  g.player = {
    cx: B, cy: B, x: B - 10, y: B - 21, w: 20, h: 42, luck: 0, hp: 100,
    dead: false, hostile: true, team: 0, lastDamageCause: null,
    equipStats: { deadMansSweater: false },
  };
  g.entities = { enemies: [], critters: [], npcs: [], drops: [], add: () => {} };
  g.sfxAt = () => {};
  g.recLog = () => {};
  g.breakTile = () => {};
  if (net) g.net = net;
  return g;
};

const mkNet = (sent: unknown[][], over: G = {}): G => ({
  active: true, mySlot: 0,
  players: new Map([[1, { active: true, x: B - 60, y: B }]]),
  policy: { pvpAllowed: true },
  getProxyPvpImmuneRemaining: () => 0,
  sendStrikePlayer: (...a: unknown[]) => { sent.push(a); },
  ...over,
});

const rp = (over: G = {}): G => ({
  cx: B, cy: B, w: 20, h: 42, dead: false, __netSlot: 1, hostile: true, team: 0,
  equipStats: { deadMansSweater: false }, ...over,
});

describe('SW-AU1 裁决①：两脸受害域互斥（同一爆炸,本地玩家与远端代理同盒各被恰一脸结算）', () => {
  it('explodeAt:本地半边只打 this.player（一次）,跨端环只发远端代理（一次）,无双达无双扣', () => {
    const sent: unknown[][] = [];
    const g = mkGame(mkNet(sent));
    const local: Array<{ dmg: number; pvp: boolean }> = [];
    g.damagePlayer = (dmg: number, _sx: number, _sy: number, _a: unknown, _c: boolean, pvp: boolean) => {
      local.push({ dmg, pvp });
      return 0;
    };
    g.remotePlayerProxies = [rp()];                       // 代理与本地玩家同在爆心盒内
    g.explodeAt(24, 24, 1000, 0, false, 64, 0, 28, B, B, 8, 1);
    expect(local).toHaveLength(1);                        // 本地半边单结算
    expect(sent).toHaveLength(1);                         // 跨端半边单发送
    expect(sent[0]![0]).toBe(1);                          // 目标=远端代理槽位（绝非本地玩家）
    expect((sent[0]![5] as number) & 0x80).toBe(0x80);    // bit7 爆炸意向位
  });
});

describe('SW-AU1 裁决②：owner==victim 本地自伤半边 pvp 旗 ≡ :15124 `!hostile && type!=949`', () => {
  // 表外非 hostile → pvp:true（SelfHurtPlayers flag=true,Hurt :38674 8t 免疫档+
  // pvpDeath 计数）;表内 hostile 陷阱 → pvp:false。单机（net 缺省）隔离本地半边。
  const MATRIX: Array<[number, boolean]> = [
    [28, true], [30, true], [37, true], [133, true], [516, true], [773, true],
    [108, false], [164, false], [1002, false],
  ];
  for (const [type, expectedPvp] of MATRIX) {
    it(`explodeAt 本地半边 projId=${type} → damagePlayer pvp=${expectedPvp}（单结算）`, () => {
      const g = mkGame();
      const calls: boolean[] = [];
      g.damagePlayer = (_d: number, _sx: number, _sy: number, _a: unknown, _c: boolean, pvp: boolean) => {
        calls.push(pvp);
        return 0;
      };
      g.explodeAt(24, 24, 500, 0, false, 130, 0, type, B, B, 0, 1);
      expect(calls).toEqual([expectedPvp]);
    });
  }
  it('scarab 773 本地半边 → pvp=true（SW-AU1 verdict b 修：漏参补齐,与 explodeAt 同式）', () => {
    const g = mkGame();
    const calls: boolean[] = [];
    g.damagePlayer = (_d: number, _sx: number, _sy: number, _a: unknown, _c: boolean, pvp: boolean) => {
      calls.push(pvp);
      return 0;
    };
    g.scarabBombExplode(B, B, 500, 1);
    expect(calls).toEqual([true]);
  });
  it('FR2-F 广播分道：selfPvp=true（28）→ GA4 显式 reportPlayerHurt 恰一次;selfPvp=false（108）→ 不显式发（auto 通道承载）', () => {
    for (const [type, selfPvp, expectedReports] of [[28, true, 1], [108, false, 0]] as const) {
      const g = mkGame();
      const reports: unknown[][] = [];
      g.reportPlayerHurt = (...a: unknown[]) => { reports.push(a); };
      g.damagePlayer = (_d: number, _sx: number, _sy: number, _a: unknown, _c: boolean, _pvp: boolean) => {
        g.player.hp -= 10;                                // 实扣>0 → 进 GA4 分支
        return 10;
      };
      g.explodeAt(24, 24, 500, 0, false, 130, 0, type, B, B, 0, 1);
      expect(reports.length).toBe(expectedReports);
      void selfPvp;
    }
  });
});

describe('SW-AU1 裁决③：owner!=victim 跨端 face（bit7 收端）pvp 旗 ≡ 首结算脸极性', () => {
  // 非 hostile 弹 → 原版投弹者 Damage_PVP pvp:true 字面（:14747-14748）→ true;
  // hostile 陷阱 {108,164,1002} → 原版受害端自持 SelfHurtPlayers（owner==255/第一臂）
  // pvp=:15124 !hostile=false → false;75/102/949 为表内护栏位（本 face 实际不可达,
  // 逐字收录）。flags 0x82 = bit7+bit1(dmgPreRolled)。
  const MATRIX: Array<[number, boolean]> = [
    [28, true], [30, true], [37, true], [773, true],
    [108, false], [164, false], [1002, false], [75, false], [102, false], [949, false],
  ];
  for (const [type, expectedPvp] of MATRIX) {
    it(`bit7 收端 weaponId=${type} → damagePlayer pvp=${expectedPvp}（单结算）`, () => {
      const g = mkGame(mkNet([]));
      const calls: boolean[] = [];
      g.damagePlayer = (_d: number, _sx: number, _sy: number, _a: unknown, _c: boolean, pvp: boolean) => {
        calls.push(pvp);
        return 0;
      };
      g.netApplyStrikePlayer(1, 300, type, 0x82);
      expect(calls).toEqual([expectedPvp]);
    });
  }
});

describe('SW-AU1 裁决④：发送侧门组（composite 现行为钉面——PVP 脸门组施于全弹域,含 108 冗余载波备案）', () => {
  const mkGateGame = (net: G, proxies: G[]) => {
    const g = mkGame(net);
    g.damagePlayer = () => 0;                             // 本地半边静音（门组仅观察发送面）
    g.remotePlayerProxies = proxies;
    return g;
  };
  it('PvP 房+双方 hostile：28 与 108 均广播（108=受端本地半边先落/immune 吸收的冗余载波,非双扣）', () => {
    for (const type of [28, 108]) {
      const sent: unknown[][] = [];
      const g = mkGateGame(mkNet(sent), [rp()]);
      g.explodeAt(24, 24, 500, 0, false, 130, 0, type, B, B, 0, 1);
      expect(sent).toHaveLength(1);
      expect((sent[0]![5] as number) & 0x82).toBe(0x82);
    }
  });
  it('非 PvP 房（pvpAllowed=false）→ :14639 早退域,28/108 皆零广播', () => {
    for (const type of [28, 108]) {
      const sent: unknown[][] = [];
      const g = mkGateGame(mkNet(sent, { policy: { pvpAllowed: false } }), [rp()]);
      g.explodeAt(24, 24, 500, 0, false, 130, 0, type, B, B, 0, 1);
      expect(sent).toEqual([]);
    }
  });
  it('投弹者未开 hostile → :14639 入口早退零广播（伤害面 hostile 剥除墙双保险同向）', () => {
    const sent: unknown[][] = [];
    const g = mkGateGame(mkNet(sent), [rp()]);
    g.player.hostile = false;
    g.explodeAt(24, 24, 500, 0, false, 130, 0, 108, B, B, 0, 1);
    expect(sent).toEqual([]);
  });
  it('victim 未开 hostile → :14646 早退;同队 → :14646 team 门;immune 窗 → :14646', () => {
    for (const proxy of [rp({ hostile: false }), rp({ team: 1 })]) {
      const sent: unknown[][] = [];
      const g = mkGateGame(mkNet(sent), [proxy]);
      g.player.team = proxy.team === 1 ? 1 : 0;           // team 门只在双方同队且非 0
      g.explodeAt(24, 24, 500, 0, false, 130, 0, 28, B, B, 0, 1);
      expect(sent).toEqual([]);
    }
    const sent2: unknown[][] = [];
    const g2 = mkGateGame(mkNet(sent2, { getProxyPvpImmuneRemaining: () => 5 }), [rp()]);
    g2.explodeAt(24, 24, 500, 0, false, 130, 0, 28, B, B, 0, 1);
    expect(sent2).toEqual([]);
  });
  it('RocketsSkipDamageForPlayers 豁免集（862）→ 调用侧豁免零广播（:71786 flag4 第三因子）', () => {
    const sent: unknown[][] = [];
    const g = mkGateGame(mkNet(sent), [rp()]);
    g.explodeAt(24, 24, 500, 0, false, 130, 0, 862, B, B, 0, 1);
    expect(sent).toEqual([]);
  });
});

describe('SW-AU1 引注锚：949=TorchGod（非 DD2）,aiStyle 184,非 hostile——:15124 字面排除即 pvp:false', () => {
  it('表内恒含 949（护栏位）且 949 不在 EXPLODE_TRAP_PROJS（trap=false → sweater cap 惰性）', () => {
    expect(Game.SELF_HURT_NON_PVP_PROJS.has(949)).toBe(true);
    expect(Game.EXPLODE_TRAP_PROJS.has(949)).toBe(false);
    expect(Game.EXPLODE_TRAP_PROJS.has(108)).toBe(true);
    expect(Game.EXPLODE_TRAP_PROJS.has(1002)).toBe(true);
    expect(Game.EXPLODE_TRAP_PROJS.has(164)).toBe(false);   // 164 地雷 trap 未置位（:2528-2537 块无 trap 行）
  });
  it('弹半径域内两脸共用同一判集（本地半边 selfPvp 与收端 pvpHit 同表——分极一致性）', () => {
    const HOSTILE = new Set([75, 102, 108, 164, 1002, 949]);   // 1457 SetDefaults :1555/:1903/:1961/:2534/:9531 + 949 字面臂
    for (const id of [28, 30, 37, 108, 164, 1002, 773, 949, 75, 102, 516, 588]) {
      expect(Game.SELF_HURT_NON_PVP_PROJS.has(id)).toBe(HOSTILE.has(id));
    }
  });
});
