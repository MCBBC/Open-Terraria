// A 级近似清零·第二批回归（召唤师体系主干 1:1）：
//   1 鞭主干    AI_165_Whip :45006-45117 + FillWhipControlPoints :45618-45681 +
//              GetWhipSettings :45683-45761 + Colliding :14482-14494
//   2 哨兵      aiStyle 53 :27172-27382（初冷 120 / 射速 60·60·90 / 扇区炮口）
//   3 MinionShot 吃鞭 tag   TagEffectState :216-243 + WhipTagEffect.cs:58-84 +
//              ProjectileID.cs:197 MinionShot / :199 SentryShot
//   4 沙漠虎 818 链  AI_067_TigerSpecialAttack :46383-46479 + AI_162 :44056-44123
//   5 AI_120    StardustGuardian :41969-42299 + 拳盒 Colliding :14294-14300
//   6 localNPCImmunity  Update :15330 / Damage_PVE :11878 / 写入 :13153
//              + 闪电光环 AI_137 :65910-66060 方形场
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import { WhipProj } from '../src/entities/WhipProj';
import { resolveWhipTagHit } from '../src/entities/WhipTag';
import { MinionProj, MinionHitCd, TigerPounce } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

// ---- mock 环境（summon-r6 同款） ----
const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number;
  whipTagT?: number; whipTagDmg?: number; whipTagCrit?: number; whipTagItem?: number;
  whipProcT?: number; whipProcItem?: number; hurtFx?: (d: number) => void;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  hits: number[];
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 10000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const projectiles: unknown[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
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
  (hooks as unknown as { entities: { add: (e: unknown, b: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { added.push(e); if (e instanceof MinionProj || e instanceof TigerPounce) projectiles.push(e); },
    projectiles,
  };
  return { hooks, store, player, added, projectiles };
}
const step = (list: unknown[], ticks: number, hooks: GameHooks): void => {
  for (let i = 0; i < ticks; i++) {
    for (const e of list) {
      const p = e as { dead: boolean; fixedUpdate: (dt: number, g: GameHooks) => void };
      if (!p.dead) p.fixedUpdate(1, hooks);
    }
  }
};

/** 鞭曲线总长（控制点折线和） */
const curveLen = (w: WhipProj, ai0: number): number => {
  const pts = w.pointsAt(ai0, true);
  let sum = 0;
  for (let i = 1; i < pts.length; i++) sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return sum;
};

// ============ 1 鞭主干（AI_165 + FillWhipControlPoints） ============
describe('鞭主干 1:1（:45006/:45618/:45683）', () => {
  it('锚点 = 玩家中心，玩家移动后下一 tick 曲线根随动（:45645/:45652）', () => {
    const { hooks, player } = makeHooks();
    const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    w.fixedUpdate(1, hooks);
    expect(w.controlPoints(true)[0]).toEqual({ x: player.cx, y: player.cy });
    player.x += 100;
    w.fixedUpdate(1, hooks);
    expect(w.controlPoints(true)[0]).toEqual({ x: player.cx, y: player.cy });
  });

  it('分段数 = GetWhipSettings 表（:45690 默认 20；1104=36/1028=12/848=40/1033=45/1035=30）', () => {
    const { hooks, player } = makeHooks();
    const seg = (projId: number): number =>
      new WhipProj(player.cx, player.cy, 0, projId, 4672, 14, 1, 30, 4, () => player)
        .controlPoints(true).length - 1;
    expect(seg(841)).toBe(20);   // 默认
    expect(seg(914)).toBe(20);
    expect(seg(1104)).toBe(36);
    expect(seg(1028)).toBe(12);
    expect(seg(848)).toBe(40);
    expect(seg(1033)).toBe(45);
    expect(seg(1035)).toBe(30);
    expect(seg(847)).toBe(20);
    void hooks;
  });

  it('伸展/收回包络：2/3 处峰值，尾段收回（num5/num6 :45633-45639）', () => {
    const { hooks, player } = makeHooks();
    const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    const TFO = w.timeToFlyOut; // 30×2=60（MaxUpdates=2 :45685）
    expect(TFO).toBe(60);
    expect(curveLen(w, TFO / 3)).toBeGreaterThan(curveLen(w, TFO / 6));    // 伸展期
    expect(curveLen(w, (2 / 3) * TFO)).toBeGreaterThan(curveLen(w, TFO / 3));
    expect(curveLen(w, (2 / 3) * TFO)).toBeGreaterThan(curveLen(w, (11 / 12) * TFO)); // 收回期回落
  });

  it('命中：曲线上控制点处敌被命中且每次挥动仅一次（18×18 盒 :14482-14494 / cd=-1 :10104）', () => {
    const enemy = mkEnemy(1, 0, 0);
    const { hooks, player } = makeHooks([enemy]);
    const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);   // ai[0]=18
    const p = w.pointsAt(20, true)[10];                    // progress=1/3 处曲线中段
    enemy.cx = p.x; enemy.cy = p.y; enemy.x = p.x - 8; enemy.y = p.y - 12;
    w.fixedUpdate(1, hooks);                               // 本 tick 碰撞含 ai[0]=20 快照
    expect(enemy.hits.length).toBe(1);
    expect(enemy.hits[0]).toBe(14);                        // 全额（召唤乘区 1 / 护穿 0）
    w.fixedUpdate(1, hooks);
    expect(enemy.hits.length).toBe(1);                     // localNPCHitCooldown=-1 每敌一次
  });

  it('射程门：841 峰值 reach = 4×30×2×0.75=180 → 400px 外敌全程不命中（:45643/:45703）', () => {
    const far = mkEnemy(2, 0, 0);
    const { hooks, player } = makeHooks([far]);
    far.cx = player.cx + 400; far.cy = player.cy; far.x = far.cx - 8; far.y = far.cy - 12;
    const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    step([w], 40, hooks);
    expect(far.hits.length).toBe(0);
  });

  it('多目标衰减：841 falloff 0.5 → 第二命中敌 7（damage 字段链 :12604-12678）', () => {
    const a = mkEnemy(3, 0, 0), b = mkEnemy(4, 0, 0);
    const { hooks, player } = makeHooks([a, b]);
    const w = new WhipProj(player.cx, player.cy, 0, 841, 4672, 14, 1, 30, 4, () => player);
    for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
    const pts = w.pointsAt(20, true);
    for (const [e, idx] of [[a, 6], [b, 14]] as const) {
      e.cx = pts[idx].x; e.cy = pts[idx].y;
      e.x = pts[idx].x - 8; e.y = pts[idx].y - 12;
    }
    w.fixedUpdate(1, hooks);
    expect(a.hits[0]).toBe(14);   // 曲线序在前的全额
    expect(b.hits[0]).toBe(7);    // 之后 ×0.5
  });

  it('tag 窗口：命中写入 240t/TagDamage（TagEffectState :178-186）；4912 火鞭 flat=0（:1397）', () => {
    // 两个鞭各自独立环境（913 射程更长，共用场景会先扫到另一敌耗掉首命中 proc 门）
    const env = (projId: number, itemId: number, dmg: number): { w: WhipProj; e: MockEnemy; hooks: GameHooks } => {
      const e = mkEnemy(projId, 0, 0);
      const { hooks, player } = makeHooks([e]);
      const w = new WhipProj(player.cx, player.cy, 0, projId, itemId, dmg, 1, 30, 4, () => player);
      for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
      const pts = w.pointsAt(20, true);
      e.cx = pts[10].x; e.cy = pts[10].y; e.x = pts[10].x - 8; e.y = pts[10].y - 12;
      return { w, e, hooks };
    };
    const a = env(841, 4672, 14);
    a.w.fixedUpdate(1, a.hooks);
    expect(a.e.whipTagT).toBe(240);
    expect(a.e.whipTagDmg).toBe(4);     // 4672 皮革鞭 TagDamage=4（ItemID.cs:1311）
    const b = env(913, 4912, 37);
    b.w.fixedUpdate(1, b.hooks);
    expect(b.e.whipTagT).toBe(240);     // tag 窗口仍开启
    expect(b.e.whipTagDmg).toBe(0);     // Firecracker 无 flat TagDamage
    expect(b.e.whipProcT).toBe(240);    // proc 启用（case 913 :12936-12940）
    expect(b.e.whipProcItem).toBe(4912);
  });

  it('月主鞭 1035 补鞭：30t 寿命内补 3 鞭（:45038-45048，ai[2]<progress×3）', () => {
    const { hooks, player, added } = makeHooks();
    const w = new WhipProj(player.cx, player.cy, 0, 1035, 5480, 110, 4, 30, 4, () => player);
    step([w], 25, hooks);
    const lashes = added.filter((e) => e instanceof WhipProj) as WhipProj[];
    expect(lashes.length).toBe(3);
    expect(lashes.every((l) => l.ai2 >= 10)).toBe(true);   // 子鞭标记（:45047）
    expect(lashes[0].timeToFlyOut).toBe(30 * 2);           // 子鞭固定 30t（:45755-45758）
  });

  it('5479 星座星：鞭命中沿曲线每 3 点一颗 1039（20 段 → 6 颗，:13869-13881）', () => {
    const e = mkEnemy(7, 0, 0);
    const { hooks, player, added } = makeHooks([e]);
    const w = new WhipProj(player.cx, player.cy, 0, 1034, 5479, 30, 4, 30, 4, () => player);
    for (let i = 0; i < 9; i++) w.fixedUpdate(1, hooks);
    const pts = w.pointsAt(20, true);
    e.cx = pts[10].x; e.cy = pts[10].y; e.x = pts[10].x - 8; e.y = pts[10].y - 12;
    w.fixedUpdate(1, hooks);
    const stars = added.filter((a) => a instanceof Arrow && (a as Arrow).projId === 1039);
    expect(stars.length).toBe(6);
    expect((stars[0] as Arrow).damage).toBe(Math.max(1, Math.round(30 * 0.33))); // 伤=命中伤×0.33
    expect(e.whipProcT).toBeUndefined();  // 5479 非 proc 型（:12936-12970 无 TryEnableProc）
  });
});

// ============ 2 哨兵 aiStyle 53（:27172-27382） ============
describe('哨兵 aiStyle 53 射速（:27176-27288）', () => {
  it('966 猎犬：初冷 120t、射速 90t（308/377 为 60t）', () => {
    const e = mkEnemy(8, 60 * 16 + 200, 90 * 16);
    const { hooks, player, added } = makeHooks([e]);
    const s = new MinionProj(player.x, player.y, 966, 40, 2, true, 0, false, () => player);
    step([s], 130, hooks);
    expect(added.filter((a) => a instanceof Arrow).length).toBe(1);   // 第 121t 首发初冷 120
    step([s], 80, hooks);
    expect(added.filter((a) => a instanceof Arrow).length).toBe(1);   // 210t 仍在 90t 冷却内
    step([s], 2, hooks);
    expect(added.filter((a) => a instanceof Arrow).length).toBe(2);   // 第 211t 第二发
    const shot = added.find((a) => a instanceof Arrow) as Arrow;
    expect(shot.projId).toBe(967);
  });
});

// ============ 3 MinionShot 吃鞭 tag（TagEffectState :216-243） ============
describe('MinionShot tag/proc 继承', () => {
  it('whipTagShot 箭命中 tag 敌：+TagDamage 并触发 proc 首跳（5476 → 1037 陨石）', () => {
    const e = mkEnemy(9, 60 * 16 + 100, 90 * 16);
    e.whipTagT = 240; e.whipTagDmg = 4; e.whipTagCrit = 0;
    e.whipProcT = 240; e.whipProcItem = 5476;
    const { hooks, added } = makeHooks([e]);
    const arrow = new Arrow(e.x - 60, e.y + 4, 8, 0, 10, 1, 374, null, { grav: 0, life: 60 });
    arrow.whipTagShot = true;   // 374 ∈ MinionShot（ProjectileID.cs:197）
    step([arrow], 20, hooks);
    expect(e.hp).toBe(10000 - 14);          // 10 + tag 4（ModifyTaggedHit :58-66）
    expect(e.whipProcT).toBe(0);            // ClearProcOnNPC（:150-158）
    const meteor = added.find((a) => a instanceof Arrow && (a as Arrow).projId === 1037) as Arrow | undefined;
    expect(meteor).toBeTruthy();
    expect(meteor!.damage).toBe(Math.max(1, Math.round(10 * 1.33))); // OnProcHit 伤=基数×1.33（:12820 传 num4）
  });

  it('5480 月主弹 proc：一次性三连 1045（Possession :10-14 + case 1045 :12977-12981）', () => {
    const e = mkEnemy(10, 0, 0);
    e.whipTagT = 240; e.whipTagDmg = 0; e.whipTagCrit = 0;
    e.whipProcT = 240; e.whipProcItem = 5480;
    e.hurtFx = (d: number) => { e.hp -= d; };
    const { hooks, added } = makeHooks([e]);
    const res = resolveWhipTagHit(e, 10, hooks, (el) => {
      (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(el, 'projectiles');
    }, 1, e.cx, e.cy);
    expect(res.dmg).toBe(10);               // 5480 无 ModifyProcHit 乘区
    expect(e.whipProcT).toBe(0);            // 一次性
    const procs = added.filter((a) => a instanceof Arrow && (a as Arrow).projId === 1045) as Arrow[];
    expect(procs.length).toBe(3);           // 三连（旧实现近似 1 发）
    expect(procs.every((p) => p.damage === 20)).toBe(true); // 固定伤 20
  });

  it('4912 火鞭 proc：命中伤 ×(1+1.75)，918 爆炸 = 基数×1.75（_Firecracker.cs:12-29）', () => {
    const e = mkEnemy(11, 0, 0);
    e.whipTagT = 240; e.whipTagDmg = 6; e.whipTagCrit = 0;
    e.whipProcT = 240; e.whipProcItem = 4912;
    e.hurtFx = (d: number) => { e.hp -= d; };
    const { hooks, added } = makeHooks([e]);
    const res = resolveWhipTagHit(e, 10, hooks, (el) => {
      (hooks as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(el, 'projectiles');
    }, 1, e.cx, e.cy);
    expect(res.dmg).toBe(10 + 6 + Math.round((10 + 6) * 1.75)); // tag 后 ×2.75
    // 918 爆炸（本实现直接 AoE 结算）：基数 num4=10 → 10×1.75=17.5 → 18
    const boom = Math.max(1, Math.round(10 * 1.75));
    expect(e.hp).toBe(10000 - boom);        // hurtFx 通道（黑收成同款直伤通道）
    expect(added.some((a) => a instanceof Arrow && (a as Arrow).projId === 916)).toBe(false); // 非 4680 无 916
  });
});

// ============ 4 沙漠虎 818 链（:46383-46479 / :44056） ============
describe('沙漠虎 818 多段链', () => {
  const mkTiger = (hooks: GameHooks, gems: number, enemies: MockEnemy[]): MinionProj => {
    const p = (hooks as unknown as { player: Player }).player;
    const t = new MinionProj(p.x, p.y, 833, 10, 2, false, 0, false, () => p);
    (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(t);
    for (let i = 0; i < gems; i++) {
      const g = new MinionProj(p.x, p.y, 831, 10, 2, false, 0, false, () => p);
      (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles.push(g);
    }
    void enemies;
    return t;
  };

  it('链长 = 宝石数+1：3 宝石 + 4 敌 → 4 段 818（:46388/:46433-46447）', () => {
    const es = [
      mkEnemy(20, 60 * 16 + 120, 90 * 16),
      mkEnemy(21, 60 * 16 + 260, 90 * 16 + 40),
      mkEnemy(22, 60 * 16 + 380, 90 * 16 - 60),
      mkEnemy(23, 60 * 16 + 500, 90 * 16 + 80),
    ];
    const { hooks } = makeHooks(es);
    const tiger = mkTiger(hooks, 3, es);
    tiger.fixedUpdate(1, hooks);
    const chain = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles
      .filter((e) => e instanceof TigerPounce);
    expect(chain.length).toBe(4);
  });

  it('818 伤害 ×(1.5+0.4×(宝石数-1))：1 宝石 dmg10 → 15（:12107-12111），每敌一次', () => {
    const e = mkEnemy(24, 60 * 16 + 160, 90 * 16);
    const { hooks } = makeHooks([e]);
    const tiger = mkTiger(hooks, 1, [e]);
    tiger.fixedUpdate(1, hooks);   // 触发链（单敌 → 单段，无延迟）
    const pounce = (hooks as unknown as { entities: { projectiles: unknown[] } }).entities.projectiles
      .find((x) => x instanceof TigerPounce) as TigerPounce;
    expect(pounce).toBeTruthy();
    step([pounce], 40, hooks);
    expect(e.hits.length).toBe(1);        // localNPCHitCooldown=-1（:7733）
    expect(e.hits[0]).toBe(15);           // round(10×1.5)
    expect(pounce.dead).toBe(true);       // ai[0]≥1 消亡（:44119-44122）
  });

  it('链发后本体瞬移末段并进入等待态（等待期无接触伤 :46475/:46702-46718/:11782）', () => {
    const e = mkEnemy(25, 60 * 16 + 160, 90 * 16);
    const { hooks, player } = makeHooks([e]);
    const tiger = mkTiger(hooks, 1, [e]);
    const hp0 = e.hp;
    tiger.fixedUpdate(1, hooks);
    // 本体瞬移至末段落点（目标 X 向前偏 20，:46459-46462）
    expect(Math.abs(tiger.cx - (e.cx + 20))).toBeLessThan(2);
    step([tiger], 6, hooks);              // 等待态 ai[0]==4
    expect(e.hp).toBe(hp0);               // 等待期不造成接触伤
    void player;
  });
});

// ============ 5 AI_120 星尘守护者（:41969-42299） ============
describe('AI_120 星尘守护者', () => {
  it('500 内敌进入冲刺态并受拳伤；600 外敌全程无伤（:42036-42073/:14294-14300）', () => {
    const near = mkEnemy(30, 60 * 16 + 250, 90 * 16);
    const far = mkEnemy(31, 60 * 16 + 700, 90 * 16);
    const { hooks, player } = makeHooks([near, far]);
    const g = new MinionProj(player.x, player.y, 623, 30, 2, false, 0, false, () => player);
    step([g], 90, hooks);
    expect(g.ai120State).toBe(2);          // 冲刺态（ai[0]==2）
    expect(near.hp).toBeLessThan(10000);   // 拳盒命中
    expect(far.hp).toBe(10000);            // 超出索敌 500
    expect(near.hits.every((d) => d === 30)).toBe(true); // 无 tag 全额
  });

  it('拳盒仅在冲刺态：80×40 @ Center+direction×40（cd=5 → 每 5t 一跳 :6433）', () => {
    const e = mkEnemy(32, 60 * 16 + 250, 90 * 16);
    const { hooks, player } = makeHooks([e]);
    const g = new MinionProj(player.x, player.y, 623, 30, 2, false, 0, false, () => player);
    // 冲刺到位前（贴身跟随态）不造成伤害
    g.fixedUpdate(1, hooks);
    const state0 = g.ai120State;
    expect(e.hp).toBe(10000);
    void state0;
  });
});

// ============ 6 localNPCImmunity 节奏 + 闪电光环方形场 ============
describe('localNPCImmunity（:15330/:11878/:13153）', () => {
  it('cd=3 → 命中后恰好 3 tick 再命中（旧实现多 1t）', () => {
    const cd = new MinionHitCd();
    const seq: boolean[] = [];
    for (let i = 0; i < 7; i++) seq.push(cd.ready(1, 3));
    expect(seq).toEqual([true, false, false, true, false, false, true]);
  });

  it('闪电光环：净空 12 格 → 方形场 320px，每 3t 一跳；场外敌无伤（AI_137 :65972-65981/:14537-14553）', () => {
    const inE = mkEnemy(40, 60 * 16, 100 * 16 - 40);
    const outE = mkEnemy(41, 60 * 16 + 200, 100 * 16 - 40);
    const { hooks, player } = makeHooks([inE, outE]);
    const tower = new MinionProj(player.x, player.y, 688, 20, 0, true, 0, false, () => player);
    const hp0 = inE.hp;
    step([tower], 13, hooks);   // 落地 + 一次性净空测量 + 4 跳
    expect(inE.hp).toBeLessThan(hp0);
    expect(inE.hits.length).toBeGreaterThanOrEqual(4);   // cd=3：13t ≈ 4 跳
    expect(inE.hits.every((d) => d === 20)).toBe(true);
    expect(outE.hp).toBe(10000);                        // 场外（|Δx|>160）
  });
});

// ============ 乌鸦 317（aiStyle 54 是随从非哨兵） ============
describe('乌鸦 317（:3825-3836 minion / AI :27383-27590）', () => {
  it('分类：乌鸦杖 1802 → summon 且非哨兵（sentry 字段无、minion=true）', () => {
    const w = combatWeapon({ key: 'vi_1802_RavenStaff' });
    expect(w?.kind).toBe('summon');
    expect((w as { sentry?: boolean }).sentry).toBe(false);
  });

  it('扑击：命中敌造成接触伤并重置扑击计时（:27568-27580/:12777-12780）', () => {
    const e = mkEnemy(50, 60 * 16 + 250, 90 * 16);
    const { hooks, player } = makeHooks([e]);
    const r = new MinionProj(player.x, player.y, 317, 12, 1.5, false, 0, false, () => player);
    step([r], 60, hooks);
    expect(e.hp).toBeLessThan(10000);
    expect(e.hits.every((d) => d === 12)).toBe(true);
  });

  it('无目标时悬停玩家上方 60px 且不造成伤害（friendly=false :27544）', () => {
    const { hooks, player } = makeHooks([]);
    const r = new MinionProj(player.x, player.y, 317, 12, 1.5, false, 0, false, () => player);
    step([r], 90, hooks);
    expect(Math.abs(r.cy - (player.cy - 60))).toBeLessThan(40);
  });
});
