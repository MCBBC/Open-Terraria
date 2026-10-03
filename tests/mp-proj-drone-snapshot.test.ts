// ============================================================================
// ★X4 清偿刀G（2026-09-29）MP 弹幕快照 1020/1105（msg27 kind=11）判别测试：
//   原版 MP 语义定谳（Terarria1457 亲读）=【owner 权威输入 + 全端分布式物理】：
//     · AI_195/205 owner==myPlayer 支把 LocalInputCache 打包进 ai[0]、变化即
//       netUpdate=true（Projectile.cs:41679-41687 / :38794-38824）；
//     · Msg27 携 ai[0]/ai[1]+pos+vel（NetMessage.cs:777-828 写 / MessageBuffer.cs
//       :1701-1744 读 ai[] 直赋 + proj2.position=position4 硬重锚）；
//     · AI 本体在 owner 门【外】——非 owner 端照跑（输入取快照 ai[0]、姿态取
//       ai[1]），非主机权威逐拍推流；localAI[0..2] 不同步（计时器/音档/音槽各端自持）；
//     · Kill 死亡门 player.dead 全端共读（:41660-41663/:38776-38779）；成就门
//       owner==Main.myPlayer（:71981-71985）。
//   本仓等价：kind11 真类重建 + 傀儡本地 AI 照跑 + ai0/rotation/位置随快照硬重锚
//   （DroneBase.netDroneSync）+ 输入翻转绕过位移差分门强制出快照（netProjLast.ai0）。
// 覆盖矩阵：
//   - 广播分类：1020/1105 → kind11（此前漏分类被 projId 通判抢进 kind1=回旋镖误分类）
//   - 输入翻转强制出快照（贴墙顶住位移门不放行也即时上行）
//   - 工厂 case11 反序列化 round-trip 逐值（ai0/rotation/盒径/ownerDeadProbe 接线）
//   - netDroneSync 硬重锚 + NaN 拒收 + &63 掩码
//   - apply 链 upsert：netApplyProjSnaps kind11 → 傀儡入桶+netPuppet+快照态落位
//   - 端到端：傀儡本地 AI 照跑（同 ai0 双端位置收敛=分布式物理；ai0 翻转即时传导；
//     owner 死亡镜像坠毁；RCCar 墙爬 bit5 走快照）
//   - 消亡链：alive-sweep 出 msg28 + destroy 背板停循环音
//   - 成就 owner 门：傀儡消亡不触发 / 本地消亡触发 / 旧调用面（flags 缺省）零影响
//   - 全链 wire round-trip：编帧 → 服务器中继（排除发送者）→ 接收 → 工厂真类重建
//   - 降级矩阵：旧 server 白名单（kind>12）剥条；hostile 位剥除墙不回潮
//   - 单机零影响：本地弹 killNow 恒 ownerLocal=true 投影 / net 未激活零快照
// 桩口径：广播/工厂/应用 = rain-cloud-mp.test.ts（Object.create(Game.prototype)）；
//         服务器中继 = mp-net-camera-target.test.ts（Room 真件 + fake ws）。
// ============================================================================
import { describe, it, expect } from 'vitest';
import { NetWriter, NetReader, Msg } from '../src/net/protocol';
import { ClientNet } from '../src/net/ClientNet';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { JimsDroneProj, RemoteControlCarProj, DroneBase } from '../src/entities/DroneProjs';
import { ITEM_DEFS } from '../src/data/items';
import type { GameHooks } from '../src/entities/types';
import type { ProjSnap } from '../src/net/ClientNet';

/** 本地弹需过 HeldItem 门（:41671-41673/:38787-38789）——给玩家装上对应机件 */
function armDroneItem(hooks: GameHooks, vid: 5451 | 5738): void {
  const inv = (hooks as unknown as { player: { inv: { slots: unknown[]; selected: number } } }).player.inv;
  const id = Object.keys(ITEM_DEFS).find((k) => (ITEM_DEFS as unknown as Record<string, { vid?: number }>)[Number(k)]?.vid === vid);
  if (id !== undefined) inv.slots[inv.selected] = { id: Number(id), stack: 1 };
}

const protGame = (): Record<string, any> => Object.create(Game.prototype) as Record<string, any>;

// ---------------------------------------------------------------------------
// 广播桩（rain-cloud-mp broadcastShell 同构）
// ---------------------------------------------------------------------------
function broadcastShell(proj: DroneBase) {
  const g = protGame();
  g.tickCount = 100;
  g.netProjLast = new Map<number, { x: number; y: number; t: number; ai0?: number }>();
  g.netProjCursor = 0;
  g.netProjForce = new Set<number>();
  const despawns: number[] = [];
  const batches: ProjSnap[][] = [];
  proj.id = 7;
  g.player = new Player(proj.x - 300, proj.y, new Inventory());
  g.player.hostile = false;
  (g.player as { buffs: unknown }).buffs = {};
  g.entities = { projectiles: [proj] };
  g.sfx = { playFiles: () => false, play: () => {} };   // onProjectileDeath 音口（真实 Game 方法）
  g.net = {
    active: true, mySlot: 0,
    policy: { pvpAllowed: false },
    sendProjectileBatch: (snaps: ProjSnap[]) => { if (snaps.length) batches.push(snaps); },   // 空批不上行（=ClientNet 真件 !snaps.length 门）
    sendProjDespawn: (ids: number[]) => { despawns.push(...ids); },
    sendNpcSnapshot: () => {},
  };
  const broadcast = () => (g as unknown as { netProjBroadcast: () => void }).netProjBroadcast();
  return { g, batches, despawns, broadcast };
}

/** 首见即入批：预置差分基准（600px 外 + 70t 前；ai0 给值时=输入基准位） */
function primeSeen(shell: ReturnType<typeof broadcastShell>, proj: DroneBase, ai0?: number) {
  shell.g.netProjLast.set(proj.id, { x: proj.x - 600, y: proj.y, t: shell.g.tickCount - 70, ai0 });
}

const mkProj = (s: Record<string, unknown>): DroneBase | null =>
  (protGame() as unknown as { netMakeProj: (s: Record<string, unknown>) => DroneBase | null })
    .netMakeProj(s);

/** netApplyProjSnaps 真链桩：建傀儡→netSnapTo→vx/vy 透传→kind11 netDroneSync */
function applyShell() {
  const g = protGame();
  g.tickCount = 500;
  g.netProjPuppets = new Map();
  const added: DroneBase[] = [];
  g.entities = { add: (e: DroneBase) => { added.push(e); } };
  g.net = { players: new Map() };
  return {
    g,
    added,
    apply: (snaps: ProjSnap[]) =>
      (g as unknown as { netApplyProjSnaps: (s: ProjSnap[]) => void }).netApplyProjSnaps(snaps),
  };
}

/** AI 面世界带（rain-cloud mkHooks 缩形；20-70 行清空=开阔空域） */
function mkHooks(playerDead = false) {
  const w = new World(60, 200, 1, 'drone-mp');
  for (let x = 0; x < 60; x++) {
    for (let y = 20; y <= 70; y++) w.store.setTileSilent(x, y, 0, 0, 0);
  }
  const deaths: Array<{ projId: number; flags?: { ownerLocal?: boolean } }> = [];
  const hooks = {
    world: w,
    player: new Player(30 * 16, 20 * 16, new Inventory()),
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    addLightAt: () => {},
    spawnDust: () => null,
    startTrackedLoop: () => null,
    droneCameraTrack: () => {},
    onProjectileDeath: (projId: number, _x: number, _y: number, _w?: number, _h?: number,
      _ovx?: number, _ovy?: number, _dmg?: number, flags?: { ownerLocal?: boolean }) => {
      deaths.push({ projId, flags });
    },
  };
  (hooks.player as { dead: boolean }).dead = playerDead;
  return { hooks: hooks as unknown as GameHooks, deaths };
}

// ---------------------------------------------------------------------------
// ① 广播分类（此前漏分类=kind1 回旋镖误分类的回归锁）
// ---------------------------------------------------------------------------
describe('刀G 广播分类：kind11（1020/1105）', () => {
  it('①JimsDroneProj → kind11：tag=`1020,rotMilli`/aux=ai0/无 bit6·bit7（不落 kind1）', () => {
    const d = new JimsDroneProj(480, 352, 3, -2);
    d.ai0 = 5;                                   // bit0|bit2=right+up（:41674-41682 位包）
    d.rotation = 1.234;
    const shell = broadcastShell(d);
    primeSeen(shell, d);
    shell.broadcast();
    expect(shell.batches.length).toBe(1);
    expect(shell.batches[0].length).toBe(1);
    const s = shell.batches[0][0];
    expect(s.kind).toBe(11);                     // 非 1（Boomerang 误分类回归锁）
    expect(s.kind & 0xc0).toBe(0);               // 无 PvP/hostile 位（damage=0 无结算面）
    expect(s.tag).toBe(`1020,${Math.round(1.234 * 1000)}`);
    expect(s.aux).toBe(5);
    expect(s.dmg).toBe(0);                       // SetDefaults 无 damage 行（:9661-9667）
    expect(s.x).toBe(d.x); expect(s.y).toBe(d.y);
    expect(s.vx).toBe(3); expect(s.vy).toBe(-2);
  });

  it('①b RemoteControlCarProj 同支：tag=`1105,…`/aux 携 bit4·bit5（jump+墙爬）', () => {
    const d = new RemoteControlCarProj(480, 352, 1, 0);
    d.ai0 = 16 | 32;                             // controlJump + mode（:38791-38824 位包）
    const shell = broadcastShell(d);
    primeSeen(shell, d);
    shell.broadcast();
    expect(shell.batches[0][0].kind).toBe(11);
    expect(shell.batches[0][0].tag.startsWith('1105,')).toBe(true);
    expect(shell.batches[0][0].aux).toBe(48);
  });

  it('②输入翻转强制出快照：位移<1px 且 <60t 但 ai0 变化 → 照发（原版 netUpdate=true 同相）', () => {
    const d = new JimsDroneProj(480, 352, 0, 0);
    d.ai0 = 0;
    const shell = broadcastShell(d);
    primeSeen(shell, d, 0);
    shell.broadcast();                           // 远位基准首拍 → 出批（位移门）
    expect(shell.batches.length).toBe(1);
    shell.broadcast();                           // 无变化+无位移+<60t → 不发
    expect(shell.batches.length).toBe(1);
    d.ai0 = 4;                                   // up 按下（贴墙顶住=位移门永不放行的场景）
    shell.broadcast();
    expect(shell.batches.length).toBe(2);        // 输入翻转绕过位移门强制出快照
    expect(shell.batches[1][0].aux).toBe(4);
    shell.broadcast();
    expect(shell.batches.length).toBe(2);        // ai0 稳定后回差分门 → 不再发
  });

  it('②b 单机零影响：本地弹（ownerPlayer 置位）AI 走 owner 门+消亡投影 ownerLocal=true（零 net 交互）', () => {
    const a = mkHooks();
    armDroneItem(a.hooks, 5451);                             // 过 HeldItem 门（:41671-41673）
    const own = new JimsDroneProj(480, 800, 0, 0);           // y-h=788>640：不触发出膛自毁
    (own as unknown as { ownerPlayer: unknown }).ownerPlayer = a.hooks.player;
    for (let t = 0; t < 30; t++) own.fixedUpdate(1 / 60, a.hooks);
    expect(own.dead).toBe(false);
    own.killNow(a.hooks);                                    // 收回（TryDestroyingDrones 面）
    expect(a.deaths.length).toBe(1);
    expect(a.deaths[0].flags?.ownerLocal).toBe(true);        // 单机恒本机弹（成就门零影响）
  });
});

// ---------------------------------------------------------------------------
// ③ 工厂反序列化 round-trip + netDroneSync
// ---------------------------------------------------------------------------
describe('刀G 工厂 case11：真类重建 round-trip', () => {
  it('③1020：ai0/rotation 逐值回填+盒 12×12+ownerDeadProbe 接线', () => {
    const rot = -2.418;
    const built = mkProj({ kind: 11, netId: (2 << 24) | 7, tag: `1020,${Math.round(rot * 1000)}`,
      aux: 9, dmg: 0, x: 100, y: 200, vx: 1.5, vy: -0.5 });
    expect(built).toBeInstanceOf(JimsDroneProj);
    expect(built!.projId).toBe(1020);
    expect(built!.ai0).toBe(9);
    expect(built!.rotation).toBeCloseTo(rot, 6);
    expect(built!.w).toBe(12); expect(built!.h).toBe(12);
    expect(built!.x).toBe(100); expect(built!.y).toBe(200);   // 快照=盒左上直落（ctor 中心参已换算）
    expect(built!.vx).toBe(1.5); expect(built!.vy).toBe(-0.5);
    // ownerDeadProbe = Main.player[owner].dead 镜像读口（Game.netMakeProj case 11 接线）
    const probe = (built as unknown as { ownerDeadProbe?: (s: number) => boolean }).ownerDeadProbe!;
    expect((built as unknown as { netOwnerSlot?: number }).netOwnerSlot).toBe(2);
    expect(probe(2)).toBe(false);                // 无镜像数据=未亡（保守缺省）
  });

  it('③b 1105：盒 26×26；畸形 tag 兜底 1020/rot=0（rotMilli 缺失）', () => {
    const built = mkProj({ kind: 11, netId: 8, tag: '1105,-1570', aux: 32, dmg: 0, x: 5, y: 6, vx: 0, vy: 0 });
    expect(built).toBeInstanceOf(RemoteControlCarProj);
    expect(built!.w).toBe(26); expect(built!.h).toBe(26);
    expect(built!.rotation).toBeCloseTo(-1.57, 6);
    const bad = mkProj({ kind: 11, netId: 9, tag: 'garbage', aux: 0, dmg: 0, x: 1, y: 2, vx: 0, vy: 0 });
    expect(bad).toBeInstanceOf(JimsDroneProj);
    expect(bad!.projId).toBe(1020);
    expect(bad!.rotation).toBe(0);
  });

  it('③c netDroneSync：ai0&63 掩码+rotation/位置硬重锚；NaN 拒收（S6 清洗）', () => {
    const d = new JimsDroneProj(0, 0, 0, 0);
    d.netDroneSync(200, 3.3, 40.5, 60.25);       // 200&63=8（输入字节净值域 0..63）
    expect(d.ai0).toBe(8);
    expect(d.rotation).toBeCloseTo(3.3);
    expect(d.x).toBe(40.5); expect(d.y).toBe(60.25);
    d.netDroneSync(Number.NaN, Number.NaN, Number.NaN, Number.NaN);
    expect(d.ai0).toBe(8);                        // 非有限值拒收=原值保持
    expect(d.rotation).toBeCloseTo(3.3);
    expect(d.x).toBe(40.5);
  });

  it('③d apply 链：netApplyProjSnaps kind11 → 傀儡入桶+netPuppet+快照态落位；同 netId upsert 不重建', () => {
    const snap: ProjSnap = { netId: (1 << 24) | 42, kind: 11, tag: '1105,785', aux: 33, dmg: 0,
      x: 300.5, y: 400.25, vx: 0.5, vy: 0 };
    const a = applyShell();
    a.apply([snap]);
    expect(a.added.length).toBe(1);
    const pup = a.added[0];
    expect(pup).toBeInstanceOf(RemoteControlCarProj);
    expect(pup.netPuppet).toBe(true);
    expect(pup.netId).toBe(snap.netId);
    expect(pup.ai0).toBe(33);
    expect(pup.rotation).toBeCloseTo(0.785, 6);
    expect(pup.x).toBe(300.5); expect(pup.y).toBe(400.25);   // 硬重锚非插值起点
    expect(pup.vx).toBe(0.5); expect(pup.vy).toBe(0);
    // 二到快照 upsert：同 netId 复用傀儡（Map 命中分支,无重复入桶）
    a.g.tickCount = 600;
    a.apply([snap]);
    expect(a.added.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ④ 端到端：傀儡本地 AI 照跑（分布式物理）+ 死亡镜像
// ---------------------------------------------------------------------------
describe('刀G 傀儡 AI 面：快照输入驱动本地模拟', () => {
  it('④同 ai0 双端位置收敛（非 owner 端照跑 AI 本体=Projectile.cs owner 门外共段）', () => {
    const a = mkHooks();
    const b = mkHooks();
    // 拥有端：本地弹（ownerPlayer 置位）开阔空域静止释放（ai0=0,vy=0 起步）
    // ★出膛位 y=800：y-h=788>640（:41667-41670 相机上界自毁门——480 处必 Kill,非缺陷）
    armDroneItem(a.hooks, 5451);                 // 过 HeldItem 门（:41671-41673）
    const own = new JimsDroneProj(30 * 16, 800, 0, 0);
    (own as unknown as { ownerPlayer: unknown }).ownerPlayer = a.hooks.player;
    // 傀儡端：同快照出生态重建（净零输入）
    const pup = mkProj({ kind: 11, netId: (1 << 24) | 7, tag: '1020,0', aux: 0, dmg: 0,
      x: own.x, y: own.y, vx: own.vx, vy: own.vy })!;
    pup.netPuppet = true;
    for (let t = 0; t < 90; t++) {
      own.fixedUpdate(1 / 60, a.hooks);
      pup.fixedUpdate(1 / 60, b.hooks);
    }
    expect(own.dead).toBe(false);                // 坠地前均存活（开阔空域 90t 内）
    expect(pup.dead).toBe(false);
    expect(pup.cx).toBeCloseTo(own.cx, 6);       // 分布式同构模拟逐位收敛
    expect(pup.cy).toBeCloseTo(own.cy, 6);
    expect(pup.vy).toBeCloseTo(own.vy, 6);
  });

  it('④b 快照 ai0 翻转即时传导：up 推力在傀儡端起效（ai0=快照同步的输入字节）', () => {
    const b = mkHooks();
    const mk = () => mkProj({ kind: 11, netId: 7, tag: '1020,0', aux: 0, dmg: 0,
      x: 30 * 16 - 6, y: 30 * 16 - 6, vx: 0, vy: 0 })!;
    const pup = mk();
    pup.netPuppet = true;
    const baseline = mk();
    baseline.netPuppet = true;
    pup.netDroneSync(4, 0, pup.x, pup.y);        // up 位（:41697 flag5）
    for (let t = 0; t < 30; t++) {
      pup.fixedUpdate(1 / 60, b.hooks);
      baseline.fixedUpdate(1 / 60, b.hooks);
    }
    expect(baseline.vy).toBeGreaterThan(0);      // 无输入=重力下坠
    expect(pup.cy).toBeLessThan(baseline.cy);    // up 推力反向 → 傀儡高于基线
  });

  it('④c owner 死亡镜像坠毁（AI 头 player.dead 全端共读 :41660-41663）+ killNow 携 ownerLocal=false', () => {
    const b = mkHooks(false);                    // 傀儡端本地玩家活着
    const pup = mkProj({ kind: 11, netId: (3 << 24) | 9, tag: '1020,0', aux: 0, dmg: 0,
      x: 30 * 16 - 6, y: 30 * 16 - 6, vx: 0, vy: 0 })!;
    pup.netPuppet = true;
    const deaths: Array<{ projId: number; flags?: { ownerLocal?: boolean } }> = [];
    const hooks = {
      ...b.hooks,
      onProjectileDeath: (projId: number, x: number, y: number, w?: number, h?: number,
        ovx?: number, ovy?: number, dmg?: number, flags?: { ownerLocal?: boolean }) => {
        void x; void y; void w; void h; void ovx; void ovy; void dmg;
        deaths.push({ projId, flags });
      },
    } as unknown as GameHooks;
    (pup as unknown as { ownerDeadProbe?: (s: number) => boolean })
      .ownerDeadProbe = (slot) => slot === 3;    // owner slot3 已亡（镜像）
    pup.fixedUpdate(1 / 60, hooks);
    expect(pup.dead).toBe(true);
    expect(deaths.length).toBe(1);
    expect(deaths[0].flags?.ownerLocal).toBe(false);   // 成就门投影：非本机弹
  });

  it('④d RCCar 墙爬 bit5 走快照：ai0 bit5 置位+中心入墙 → 墙爬支落位（frame 钉 4/dir=1）', () => {
    const b = mkHooks();
    const w = (b.hooks as unknown as { world: World }).world;
    w.store.setTileSilent(30, 30, 0, 0, 0);
    w.store.setWall(30, 30, 1);                  // 中心格造墙（:38839-38841 wall>0 门）
    const pup = mkProj({ kind: 11, netId: 11, tag: '1105,0', aux: 32, dmg: 0,
      x: 30 * 16 - 13, y: 30 * 16 - 13, vx: 0, vy: 0 })!;   // 中心恰在 (30,30)
    pup.netPuppet = true;
    pup.netDroneSync(32, 0, pup.x, pup.y);       // bit5=mode（:38822）
    pup.fixedUpdate(1 / 60, b.hooks);
    expect(pup.frame).toBe(4);                   // 落墙过渡（:38852-38861 frame<4 → 4）
    expect((pup as RemoteControlCarProj).dir).toBe(1);
    expect((pup as RemoteControlCarProj).spriteDir).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 消亡链：alive-sweep 出 msg28 + destroy 背板停循环音
// ---------------------------------------------------------------------------
describe('刀G 消亡链', () => {
  it('⑤拥有端消亡 → 下拍广播出 msg28 netId（死弹不再产快照）', () => {
    const d = new JimsDroneProj(480, 352, 3, -2);
    const shell = broadcastShell(d);
    primeSeen(shell, d);
    shell.broadcast();
    expect(shell.batches.length).toBe(1);
    d.killNow(shell.g as unknown as GameHooks);  // 拥有端收回（TryDestroyingDrones 面）
    shell.g.entities.projectiles.length = 0;     // 真轮=EntityManager.compact 剔除死弹（壳内手动同相）
    shell.broadcast();
    expect(shell.batches.length).toBe(1);        // 死弹不产快照
    expect(shell.despawns).toEqual([7]);         // makeNetId(slot0,id7)=7
  });

  it('⑤b killNow/destroy 双口停循环音（netRemoveProjPuppets 置 dead 不走 killNow 的音泄漏口）', () => {
    let stopped = 0;
    const d = new RemoteControlCarProj(480, 352, 1, 0);
    (d as unknown as { loop: unknown }).loop = { stop: () => { stopped++; } };
    d.destroy();
    expect(stopped).toBe(1);
    d.destroy();                                 // 幂等（loop 已 null）
    expect(stopped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 成就 owner 门（Projectile.cs:71981-71985）
// ---------------------------------------------------------------------------
describe('刀G 成就门：owner==Main.myPlayer 投影（onProjectileDeath flags.ownerLocal）', () => {
  const call = (flags?: { ownerLocal?: boolean }, y = 600, h = 12) => {
    const g = protGame();
    const done: string[] = [];
    g.achievements = { completeFlag: (k: string) => done.push(k) };
    g.sfx = { playFiles: () => false, play: () => {} };    // Item_62 音口（真实 Game 方法）
    (g as unknown as { onProjectileDeath: (p: number, x: number, y: number, w?: number, h?: number,
      ovx?: number, ovy?: number, dmg?: number, f?: { ownerLocal?: boolean }) => void })
      .onProjectileDeath(1020, 100, y, 12, h, 0, 0, 0, flags);
    return done;
  };

  it('⑥傀儡消亡（ownerLocal=false）→ 不触发；本地消亡（true）→ 触发', () => {
    expect(call({ ownerLocal: false })).toEqual([]);
    expect(call({ ownerLocal: true })).toEqual(['TO_INFINITY_AND_BEYOND']);
  });

  it('⑥b 旧调用面（flags 缺省）→ 恒触发（单机零影响）', () => {
    expect(call(undefined)).toEqual(['TO_INFINITY_AND_BEYOND']);
  });

  it('⑥c 1105 无成就面（:71981 仅 1020 支）', () => {
    const g = protGame();
    const done: string[] = [];
    g.achievements = { completeFlag: (k: string) => done.push(k) };
    g.sfx = { playFiles: () => false, play: () => {} };
    (g as unknown as { onProjectileDeath: (p: number, x: number, y: number, w?: number, h?: number) => void })
      .onProjectileDeath(1105, 100, 600, 26, 26);
    expect(done).toEqual([]);
  });

  it('⑥d 640 门：y-h=640 边界照发;>640 吞（:71981 position.Y - height <= 640,★BJ468 销案锚）', () => {
    expect(call(undefined, 652, 12)).toEqual(['TO_INFINITY_AND_BEYOND']);   // 652-12=640 边界
    expect(call(undefined, 653, 12)).toEqual([]);                            // 641 > 640 吞（摘门→此腿红）
  });
});

// ---------------------------------------------------------------------------
// ⑦ 全链 wire round-trip + 服务器中继（room.ts msg27 白名单 >12）
// ---------------------------------------------------------------------------
// 测试基建（mp-net-camera-target 同款）
function fakeWs() {
  const sent: Uint8Array[] = [];
  const ws = {
    sent,
    readyState: 1,
    bufferedAmount: 0,
    send: (data: ArrayBuffer | Uint8Array) => { sent.push(new Uint8Array(data as ArrayBuffer)); },
    close: () => { ws.readyState = 3; },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  };
  return ws;
}
function framesRaw(sent: Uint8Array[], msgId: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (const f of sent) {
    let p = 0;
    while (p + 3 <= f.length) {
      const len = f[p] | (f[p + 1] << 8);
      if (f[p + 2] === msgId) out.push(f.subarray(p, p + len));
      p += len;
    }
  }
  return out;
}
function feedNet(net: ClientNet, frame: Uint8Array): void {
  (net as unknown as { handle(msgId: number, r: NetReader): void })
    .handle(frame[2], new NetReader(frame.subarray(3)));
}
type NetPriv = { ws: { sent: Uint8Array[] } };
const wsOf = (net: ClientNet) => (net as unknown as NetPriv).ws;
function mkNet(mySlot: number) {
  const net = new ClientNet(
    {
      player: {
        appearance: null, hostile: false, team: 0,
        inv: { slots: [], armor: [], dye: [], selected: 0 },
        x: 0, y: 0, vx: 0, vy: 0, facing: 1, dead: false, sleeping: false,
        inputX: 0, inputJump: false, inputDown: false, inputUp: false,
        hp: 100, maxHp: 100, deathsPve: 0, deathsPvp: 0, mana: 50, maxMana: 100, luck: 0,
      },
    } as never,
    { onWorldReady: () => {} } as never,
  );
  net.mySlot = mySlot;
  net.active = true;
  (net as unknown as NetPriv).ws = fakeWs();
  return net;
}
/** 定位 msg13（盲端门：接收端 lastPosAt 新鲜度——aoiBlind 需要） */
function posFrame(slot: number, x: number, y: number): Uint8Array {
  const w = new NetWriter(Msg.PlayerState);
  w.u8(slot); w.u8(64).u8(4).u8(0);            // ctrl/flag(bit2=hasVelocity)/sel
  w.f32(x).f32(y).f32(0).f32(0);
  w.u8(0);                                     // team
  return w.finish();
}
function droneSnapFrame(netId: number, kind: number, d: DroneBase): Uint8Array {
  const w = new NetWriter(Msg.SyncProjectile);
  w.u16(1);
  w.u32(netId); w.u8(kind); w.str(d.netTag);
  w.i16(0); w.i16(d.netAux);
  w.f32(d.x); w.f32(d.y); w.f32(d.vx); w.f32(d.vy);
  return w.finish();
}
interface RcStub {
  ws: { sent: Uint8Array[]; readyState: number };
  slot: number; state: number; isHost: boolean;
  [k: string]: unknown;
}
interface RoomStub {
  handle(c: RcStub, msgId: number, r: NetReader): void;
  flushOutbox(): void;
  newClient(ws: unknown): RcStub;
  readonly clients: Set<RcStub>;
}
async function mkRig(): Promise<{ room: RoomStub; rc: Record<'a' | 'b', RcStub>; relay: (c: RcStub, msgId: number, frame: Uint8Array) => void }> {
  const { Room } = await import('../../server/src/room');
  const worldMod = await import('../src/world/World');
  const room = new Room(new worldMod.World(400, 60, 42, 'drone-snap-room')) as unknown as RoomStub;
  const mkClient = (slot: number, isHost = false) => {
    const c = room.newClient(fakeWs());
    c.slot = slot; c.state = 10; c.isHost = isHost;
    room.clients.add(c);
    return c;
  };
  const relay = (c: RcStub, msgId: number, frame: Uint8Array) => {
    room.handle(c, msgId, new NetReader(frame.subarray(3)));
    room.flushOutbox();
  };
  return { room, rc: { a: mkClient(1), b: mkClient(2) }, relay };
}

describe('刀G 全链 wire round-trip + 服务器白名单', () => {
  it('⑦上行 kind11 → 服务器中继（排除发送者）→ 接收解帧 → 工厂真类重建', async () => {
    const rig = await mkRig();
    const a = mkNet(1);
    const b = mkNet(2);
    const received: ProjSnap[][] = [];
    (b as unknown as { hooks: unknown }).hooks = { onProjectileSync: (s: ProjSnap[]) => received.push(s) };
    // 接收端位置新鲜度（aoiBlind 门）——弹位 (480,352) 在 b avatar (0,0) 内径 1536 内
    rig.relay(rig.rc.b, Msg.PlayerState, posFrame(2, 0, 0));
    const d = new JimsDroneProj(480, 352, 3, -2);
    d.ai0 = 5; d.rotation = 0.5;
    rig.relay(rig.rc.a, Msg.SyncProjectile, droneSnapFrame((1 << 24) | 7, 11, d));
    expect(framesRaw(wsOf(a).sent, Msg.SyncProjectile).length).toBe(0);   // 发送者排除
    const down = framesRaw(rig.rc.b.ws.sent, Msg.SyncProjectile);
    expect(down.length).toBe(1);
    feedNet(b, down[0]);
    expect(received.length).toBe(1);
    const s = received[0][0];
    expect(s.kind).toBe(11);
    expect(s.tag).toBe(d.netTag);
    expect(s.aux).toBe(5);
    expect(s.netId).toBe((1 << 24) | 7);
    expect(s.x).toBeCloseTo(d.x);
    // 真值收尾：解出的快照过工厂 → 真类傀儡态逐值
    const built = mkProj({ kind: s.kind, netId: s.netId, tag: s.tag, aux: s.aux, dmg: s.dmg,
      x: s.x, y: s.y, vx: s.vx, vy: s.vy });
    expect(built).toBeInstanceOf(JimsDroneProj);
    expect(built!.ai0).toBe(5);
    expect(built!.rotation).toBeCloseTo(0.5, 6);
  });

  it('⑦b kind11 过新 server 白名单；kind13（未登记）剥条（旧矩阵）；hostile 位剥除墙不回潮', async () => {
    const rig = await mkRig();
    rig.relay(rig.rc.b, Msg.PlayerState, posFrame(2, 0, 0));
    const d = new JimsDroneProj(480, 352, 0, 0);
    d.ai0 = 0; d.rotation = 0;
    rig.relay(rig.rc.a, Msg.SyncProjectile, droneSnapFrame((1 << 24) | 7, 11, d));
    expect(framesRaw(rig.rc.b.ws.sent, Msg.SyncProjectile).length).toBe(1);   // kind11 存活
    rig.rc.b.ws.sent.length = 0;
    rig.relay(rig.rc.a, Msg.SyncProjectile, droneSnapFrame((1 << 24) | 7, 13, d));
    expect(framesRaw(rig.rc.b.ws.sent, Msg.SyncProjectile).length).toBe(0);   // 未登记 kind 剥条
    rig.rc.b.ws.sent.length = 0;
    rig.relay(rig.rc.a, Msg.SyncProjectile, droneSnapFrame((1 << 24) | 7, 11 | 0x80, d));
    const got = framesRaw(rig.rc.b.ws.sent, Msg.SyncProjectile);
    expect(got.length).toBe(1);
    const r = new NetReader(got[0].subarray(3));
    r.u16(); r.u32();
    expect(r.u8()).toBe(11);                     // bit7 已剥（v5 敌弹墙,非房主置位）
  });
});
