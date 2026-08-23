// 召唤随从 AI 备案遗留 7 项回归（2026-08-23,标杆 Terarria1457/Terraria/Projectile.cs）：
//  ① AI_062 飞行随从逐型定制速度曲线（:66529-66826）——373 分段/423·613 悬停带/375 反推
//  ② 地面步行族贴地行走（蜘蛛 390-392 AI_026 flag7 :63058-63340 / 吸血蛙 758 AI_067
//     flag2 :51296-51619）——重力+行走+遇障跳梯
//  ③ 黄蜂 373 射击冷却随机计数器（:66963-66978 ai[1]+=Next(1,4) 阈 90）
//  ④ 俾格米掷矛 Y 抛物线预瞄（AI_026 :62713-62720 num155=|Δx|×0.1×Next(0,100)×0.001）
//  ⑤ AI_062 索敌距门以玩家为基准（407/613/423 :66361-66402;1456 :62416/:62433 同段）
//  ⑥ 致命球 533 双门：扫描 2000（:30105-30111/:30330-30340）+ 触发 800（:30632-30640）
//  ⑦ 随从绘制旋转枢 = 贴图宽/2（Main.cs:29601 原式化简,同 WeaponProj.drawProj 修法）
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { MinionProj } from '../src/entities/MinionProj';
import { Arrow, setProjSpriteOverride } from '../src/entities/Arrow';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number) => boolean;
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 100000,
    hurt: (d: number) => { e.hp -= d; return true; },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const projectiles: unknown[] = [];
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: { store, flags: { hardMode: false } } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown, b?: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); projectiles.push(e); },
    projectiles,
  };
  return { hooks, store, player, projectiles, added, enemies };
}
function mkMinion(projId: number, owner: Player, x?: number, y?: number): MinionProj {
  return new MinionProj(x ?? owner.cx, y ?? owner.cy - 40, projId, 10, 2, false, 0, false, () => owner);
}
const priv = (m: MinionProj): { a62A0: number; a62A1: number; a62Lai0: number; dA0: number; dA1: number; frA0: number } =>
  m as unknown as { a62A0: number; a62A1: number; a62Lai0: number; dA0: number; dA1: number; frA0: number };

describe('① AI_062 逐型速度曲线（1457 :66529-66677）', () => {
  it('373 黄蜂分段：>200 加速段 (v×40+向×6)/41;≤200 上浮段 vy-=0.1（:66616-66677）', () => {
    // 远段：敌 400px 右 → 首拍自静止 vx=6/41（num27=6,num28=40）
    const eFar = mkEnemy(1, 60 * 16 + 400, 90 * 16);
    const a = makeHooks([eFar]);
    const m1 = mkMinion(373, a.player, a.player.cx, eFar.cy - 8);
    m1.fixedUpdate(1, a.hooks);
    expect(m1.vx).toBeCloseTo(6 / 41, 9);
    expect(m1.vy).toBe(0);
    // 近段（≤200）：敌 100px 右同高 → 不入加速段,走尾链上浮 vy-=-0.1、vx 不动
    const eNear = mkEnemy(2, 60 * 16 + 100, 90 * 16);
    const b = makeHooks([eNear]);
    const m2 = mkMinion(373, b.player, b.player.cx, eNear.cy - 8);
    m2.fixedUpdate(1, b.hooks);
    expect(m2.vx).toBe(0);
    expect(m2.vy).toBeCloseTo(-0.1, 9);
  });
  it('423 悬停带归 423/613 专段：70<距<130 → <100 反推 -3、≥100 吸附 7（:66641-66654）', () => {
    // 几何避开 :67097 扇区微调（rotTo ∈ [π/4,3π/4] 不触发）：瞄准点=敌顶心-80,
    // 取敌在随从下前方 40/100 → num23=107.7（≥100 → num30=7 吸附）
    const e1 = mkEnemy(1, 1066, 1000);
    const a = makeHooks([e1]);
    const m1 = mkMinion(423, a.player, 1018, 800);       // 瞄准点 (1066,908):dx=40,dy=100
    m1.fixedUpdate(1, a.hooks);
    expect(m1.vx).toBeCloseTo((40 / Math.hypot(40, 100)) * 7 / 21, 6);
    expect(m1.vy).toBeCloseTo((100 / Math.hypot(40, 100)) * 7 / 21, 6);
    // 30/80 → num23=85.4（<100 → num30=-3 反推）
    const e2 = mkEnemy(2, 1066, 1000);
    const b = makeHooks([e2]);
    const m2 = mkMinion(423, b.player, 1028, 820);       // 瞄准点 (1066,908):dx=30,dy=80
    m2.fixedUpdate(1, b.hooks);
    expect(m2.vx).toBeCloseTo((30 / Math.hypot(30, 80)) * -3 / 21, 6);
    expect(m2.vy).toBeCloseTo((80 / Math.hypot(30, 80)) * -3 / 21, 6);
  });
  it('375 小鬼反推段：距<150 → 向量×-4 反推远离（:66660-66668）', () => {
    const e = mkEnemy(1, 60 * 16 + 100, 90 * 16);        // 敌在右 100px
    const { hooks, player } = makeHooks([e]);
    const m = mkMinion(375, player, player.cx, e.cy - 8);
    m.fixedUpdate(1, hooks);
    expect(m.vx).toBeCloseTo(-4 / 41, 9);                // 被推离敌（向左）
    // 对照：距>200 → 通用加速段 +6/41
    const e2 = mkEnemy(2, 60 * 16 + 300, 90 * 16);
    const b = makeHooks([e2]);
    const m2 = mkMinion(375, b.player, b.player.cx, e2.cy - 8);
    m2.fixedUpdate(1, b.hooks);
    expect(m2.vx).toBeCloseTo(6 / 41, 9);
  });
  it('归位门分型（:66446-66462）：423 有目标 1200 / 373 1000——距玩家 1100 分型分流', () => {
    // 随从距玩家 1100、敌在玩家另一侧 800（距随从 1910>800 免 423 冲刺门、距玩家
    // 800<2000 入选）：423 门 1200 → 保持交战（ai0=0,加速段 6/41+:67097 微调 →
    // |vx|>15/21 归位档上限）;373 门 1000 → 超门转归位（ai0=1,num32=15）
    const e = mkEnemy(1, 60 * 16 - 800 + 8, 90 * 16);
    const a = makeHooks([e]);
    const m423 = mkMinion(423, a.player, a.player.cx + 1100, e.cy - 8);
    m423.fixedUpdate(1, a.hooks);
    expect(priv(m423).a62A0).toBe(0);
    expect(m423.vx).toBeLessThan(-15 / 21);              // 交战段合成速超归位档上限
    const b = makeHooks([e]);
    const m373 = mkMinion(373, b.player, b.player.cx + 1100, e.cy - 8);
    m373.fixedUpdate(1, b.hooks);
    expect(priv(m373).a62A0).toBe(1);
    expect(Math.abs(m373.vx)).toBeLessThanOrEqual(15 / 21 + 1e-9);   // ai0=1 → num32=15
  });
});

describe('② 地面步行族贴地行走（1457 AI_026 flag7 / AI_067 flag2）', () => {
  it('蜘蛛 390 贴地：落地静止 vy=0/onGround,玩家远移 → 步行追 vx>0 且保持贴地', () => {
    const { hooks, player } = makeHooks();
    player.y = 100 * 16 - 42;                            // 玩家落地（脚贴地表）
    const m = mkMinion(390, player, 60 * 16 - 38, 100 * 16 - 16);  // 跟随锚上（p.cx-30）
    for (let k = 0; k < 5; k++) m.fixedUpdate(1, hooks);
    expect(m.onGround).toBe(true);                       // 贴地（重力 0.4 落地 :65221-65229）
    expect(m.y).toBe(100 * 16 - 16);
    expect(m.vy).toBe(0);
    expect(m.vx).toBe(0);                                // 锚 ±(10+40) 死区内 → 无行走意图
    player.x = 60 * 16 + 200;                            // 玩家右移 200 → flag3 行走
    for (let k = 0; k < 10; k++) m.fixedUpdate(1, hooks);
    expect(m.vx).toBeGreaterThan(0);                     // 0.4/t 加速（:63099-63146）
    expect(m.onGround).toBe(true);                       // 行走中保持贴地
    expect(m.y).toBe(100 * 16 - 16);
  });
  it('蜘蛛遇障跳梯：前方 2 高墙 → 探测命中落地起跳 vy=-9.1（:63175-63290）', () => {
    const { hooks, player, store } = makeHooks();
    player.x = 60 * 16 + 200;
    player.y = 100 * 16 - 42;
    const m = mkMinion(390, player, 60 * 16 - 38, 100 * 16 - 16);
    // 墙：蜘蛛前方 2-3 格、地上 2 格高（行 98/99）→ 跳梯 solid(-1)&&solid(-2) 且
    // !solid(-4)/!solid(-5) → -9.1 档
    for (let y = 98; y <= 99; y++) { store.setTile(63, y, 1); store.setTile(64, y, 1); }
    let vy = 0;
    for (let k = 0; k < 60; k++) {
      m.fixedUpdate(1, hooks);
      if (m.vy < 0) { vy = m.vy; break; }
    }
    expect(vy).toBeCloseTo(-9.1, 6);
  });
  it('蜘蛛墙面爬行：竖列 3 格 ≥2 有墙 → 无重力爬向玩家、rotation 朝运动向（:65092-65175）', () => {
    const { hooks, player, store } = makeHooks();
    const m = mkMinion(390, player, 60 * 16, 90 * 16);
    for (let y = 89; y <= 91; y++) store.setWall(60, y, 1);   // 中心竖列 3 格墙
    m.fixedUpdate(1, hooks);
    expect(m.rot).not.toBe(0);                           // rotation = 运动向 + π/2
    expect(m.vy).toBeLessThanOrEqual(0.9);               // 爬行段不加重力（速度 lerp /10）
  });
  it('吸血蛙 758 贴地跟随：走向跟随锚并驻停（AI_067 :50329-50334/:51348-51410）', () => {
    const { hooks, player } = makeHooks();
    player.y = 100 * 16 - 42;                            // 主落地（防 :51492 高出跳表误触）
    const m = mkMinion(758, player, 60 * 16, 100 * 16 - 16);
    for (let k = 0; k < 5; k++) m.fixedUpdate(1, hooks);
    expect(m.onGround).toBe(true);
    player.x = 60 * 16 + 200;                            // 锚 = p.cx-(35+w/2)×dir
    for (let k = 0; k < 80; k++) m.fixedUpdate(1, hooks);
    const anchor = player.cx - (35 + player.w / 2) * player.facing;
    expect(Math.abs(m.cx - anchor)).toBeLessThan(12);    // 驻停锚 ±5 死区内
    expect(m.onGround).toBe(true);
    expect(priv(m).frA0).toBe(0);                        // 地面态
  });
});

describe('③ 黄蜂 373 射击冷却随机计数器（1457 :66963-66978）', () => {
  it('出手后 ai[1]=1,每拍 +Next(1,4)∈[1,3],>90 归零再出手——周期 ∈[30,90] 且非定值', () => {
    const e = mkEnemy(1, 60 * 16 + 300, 90 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const m = mkMinion(373, player, player.cx, e.cy - 8);
    m.fixedUpdate(1, hooks);
    expect(added.filter((a) => a instanceof Arrow && (a as Arrow).projId === 374).length).toBe(1);
    expect(priv(m).a62A1).toBe(1);                       // 出手 ai[1]++（:67155）
    m.fixedUpdate(1, hooks);
    const after1 = priv(m).a62A1;
    expect(after1).toBeGreaterThanOrEqual(2);            // +1..3
    expect(after1).toBeLessThanOrEqual(4);
    // 逐周期计量：归零（再出手）周期 ∈[30,90]（全 1 → 90 拍、全 3 → 30 拍）
    const cycles: number[] = [];
    let ticks = 0;
    let shots = added.filter((a) => a instanceof Arrow).length;
    for (let k = 0; k < 4000 && cycles.length < 24; k++) {
      m.fixedUpdate(1, hooks);
      ticks++;
      const now = added.filter((a) => a instanceof Arrow).length;
      if (now > shots) { cycles.push(ticks); ticks = 0; shots = now; }
    }
    expect(cycles.length).toBe(24);
    for (const c of cycles) { expect(c).toBeGreaterThanOrEqual(30); expect(c).toBeLessThanOrEqual(90); }
    expect(new Set(cycles).size).toBeGreaterThan(2);     // 随机域（非定值 36）
  });
});

describe('④ 俾格米掷矛 Y 抛物线预瞄（AI_026 :62713-62720）', () => {
  it('水平 780px 目标：Δy 均值显著 <0（预瞄偏置 ≈-|Δx|×0.05×0.099×…≈-3.9,无预瞄 ≈0）', () => {
    const e = mkEnemy(1, 60 * 16 + 780, 90 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const m = mkMinion(191, player, player.cx, e.cy - 8);
    const ys: number[] = [];
    for (let k = 0; k < 1000; k++) {
      e.cx = m.cx + 780; e.x = e.cx - e.w / 2; e.cy = 90 * 16; e.y = e.cy - e.h / 2;  // 钉回 780px
      (m as unknown as { shootCd: number }).shootCd = 0;                              // 每拍可出手
      m.fixedUpdate(1, hooks);
      const shot = added[added.length - 1];
      if (shot instanceof Arrow && (shot as Arrow).projId === 195) {
        ys.push((shot as Arrow).vy);
      }
    }
    expect(ys.length).toBeGreaterThan(900);
    // num155 = |Δx|×0.1×Next(0,100)×0.001 ∈ [0,7.7]、Δy 均值 ≈-3.9（jitter ±20 均值 0）
    // → 弹速 11 归一后 vy 均值 ≈-3.9×11/780 ≈ -0.055（无预瞄 ≈0 ±0.005）
    const mean = ys.reduce((s, v) => s + v, 0) / ys.length;
    expect(mean).toBeLessThan(-0.03);
    for (const a of added) {                             // num158=11/|v| 归一（:62721-62724）
      if (a instanceof Arrow) expect(Math.hypot(a.vx, a.vy)).toBeCloseTo(11, 6);
    }
  });
});

describe('⑤ AI_062 索敌距门以玩家为基准（1457 :66361-66402;1456 :62416/:62433）', () => {
  /** 场景：玩家右移至 x=1500;随从在玩家右侧 900（leash 内）;敌在玩家左上
   *  (270,540)——距玩家 hypot(1240,921)=1545<2000（玩家基准入选）、距随从
   *  hypot(2140,888)=2317>2000（随从基准落空）→ 两基准判别分野 */
  function scene() {
    const h = makeHooks([mkEnemy(1, 270, 540)]);
    h.player.x = 1500;
    return h;
  }
  it('407：敌距随从 2317（随从基准超 2000）但距玩家 1545 → 仍入选交战（ai0=0）', () => {
    const { hooks, player } = scene();
    const m = mkMinion(407, player, player.cx + 900, 90 * 16 - 12);
    m.fixedUpdate(1, hooks);
    expect(priv(m).a62A0).toBe(0);                       // 玩家基准入选 → 交战
  });
  it('423 同门（leash 1200 内）→ 入选交战', () => {
    const { hooks, player } = scene();
    const m = mkMinion(423, player, player.cx + 900, 90 * 16 - 12);
    m.fixedUpdate(1, hooks);
    expect(priv(m).a62A0).toBe(0);
  });
  it('373 对照组以随从为基准（:66431 base.Center）→ 不入选 → 距玩家 900>500 归位态', () => {
    const { hooks, player } = scene();
    const m = mkMinion(373, player, player.cx + 900, 90 * 16 - 12);
    m.fixedUpdate(1, hooks);
    expect(priv(m).a62A0).toBe(1);
    expect(Math.abs(m.vx)).toBeLessThanOrEqual(15 / 21 + 1e-9);
  });
});

describe('⑥ 致命球 533 双门：扫描 2000 + 触发 800（1457 :30105-30111/:30330-30340/:30632-30640）', () => {
  it('敌 1200px（<2000 扫描入池、>800 触发门）→ 有目标不归位（门 1500）也不冲刺', () => {
    const e = mkEnemy(1, 60 * 16 + 1200, 90 * 16 - 40);
    const { hooks, player } = makeHooks([e]);
    const m = mkMinion(533, player, player.cx + 200, player.cy - 60);
    m.fixedUpdate(1, hooks);
    expect(priv(m).dA0).toBe(0);                         // 未触发冲刺（曾 700 扫描档同值）
    expect(priv(m).dA1).toBe(0);
    // 对照旧档：随从离玩家 1000、无目标（>900）才走归位 dA0+=9——有目标门 1500 不触发
  });
  it('敌 700px（<800 触发门）→ 冲刺 ai[0]=6（:30632-30640 num559=800）', () => {
    const e = mkEnemy(1, 60 * 16 + 700, 90 * 16 - 40);
    const { hooks, player } = makeHooks([e]);
    const m = mkMinion(533, player, player.cx + 200, player.cy - 60);
    m.fixedUpdate(1, hooks);
    expect(priv(m).dA0).toBe(6);
  });
  it('扫描门 2000 判别：随从距玩家 1100、敌距随从 1000 → 有目标门 1500 不归位（旧 700 档 tgt=null→900 门误归位 dA0=9）', () => {
    const e = mkEnemy(1, 60 * 16 + 2100, 90 * 16 - 40);  // 距随从 1000（<2000 入池,>800 不触发）
    const { hooks, player } = makeHooks([e]);
    const m = mkMinion(533, player, player.cx + 1100, player.cy - 60);
    m.fixedUpdate(1, hooks);
    expect(priv(m).dA0).toBe(0);                         // 有目标 → 归位门 1500（1100<1500）
  });
  it('对照（扫描外）：敌距随从 >2000 → 无目标 + 距玩家 1100>900 → 归位态 dA0=9', () => {
    const e = mkEnemy(1, 40, 90 * 16 - 40);              // 距随从 2038 > 2000
    const { hooks, player } = makeHooks([e]);
    const m = mkMinion(533, player, player.cx + 1100, player.cy - 60);
    m.fixedUpdate(1, hooks);
    expect(priv(m).dA0).toBe(9);                         // :28741-28753 dA0 += 3×(3-⌊0/3⌋)
  });
});

describe('⑦ 随从绘制旋转枢 = 贴图宽/2（Main.cs:29601 化简,同 WeaponProj 修法）', () => {
  beforeAll(() => {
    // projFrameImg 走 document.createElement —— 桩出极简 canvas（记录型 ctx）
    const calls: Array<{ m: string; a: unknown[] }> = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const c = { width: 0, height: 0 };
        const inner = new Proxy({}, {
          get: (_t, k) => (k === 'canvas' ? undefined : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
        });
        return Object.assign(c, { getContext: () => inner });
      },
    });
    setProjSpriteOverride(373, { width: 30, height: 18, complete: true } as unknown as HTMLImageElement);
  });
  it('373（偏移表 [6,-10]）translate x = 盒左 + 贴图宽/2 + num144;drawImage dx = -贴图宽/2', () => {
    const { hooks, player } = makeHooks();
    const m = mkMinion(373, player, 1000, 1400);
    const t: unknown[][] = [];
    const d: unknown[][] = [];
    const ctx = {
      set imageSmoothingEnabled(_: boolean) {},
      get imageSmoothingEnabled() { return false; },
      save() {}, restore() {},
      translate(...a: unknown[]) { t.push(a); },
      rotate() {}, scale() {},
      drawImage(...a: unknown[]) { d.push(a); },
      fillRect() {}, strokeRect() {},
      set fillStyle(_: string) {}, set strokeStyle(_: string) {},
      set globalAlpha(_: number) {},
    } as unknown as CanvasRenderingContext2D;
    m.draw({ ctx } as never);
    // num145 = 30/2 = 15（曾 (30+16)/2=23 → 枢轴右偏 8px 绕偏心点公转）
    expect(t[0][0]).toBeCloseTo(m.cx - m.w / 2 + 15 + (-10), 6);
    expect(d[0][1]).toBeCloseTo(-15, 6);
  });
});
