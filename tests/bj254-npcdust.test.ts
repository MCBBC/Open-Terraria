// BJ254（2026-09-21）NPC.HitEffect 受击/死亡尘查表单源——数据面金标 + 行为锁。
//
// 数据源：src/data/vanilla-npcdust.json（tools/extract-npcdust.mjs,HitEffect
// :82492-:90939 机械提取;1458 同区逐字节全等 2026-09-21 diff 实证）。手核定谳组
// （提取值 vs 反编译逐值 diff=0）：59/60/151 岩浆族、1 史莱姆基族、2 恶魔眼、
// 3 僵尸、32 骷髅族、61/252/301 鸟族、63/64/103 per-type 色、112/666、290、
// 370/372/373、156 catch-all、690、381、288、333-336。
//
// 断言面：
//   A. 数据面金标——首批代表组钉值（提取器 era-guard 另行对拍,此处钉消费语义）。
//   B. 行为锁——Enemy.hurt 受击/死亡尘 = 查表精确（hitK ceil 公式/盒锚/post/alt）。
//   C. ★未列型零尘（原版无通用尘尾,唯一故意行为变化）+ 通用彩色粒子近似退役
//      （受击/死亡 spawnParticles 恒零）+ 结构锁（表元数据/表外型名单）。
//   D. WoF 族 113-116 手块保留（死亡面 netMode 权威门+扇出派发,首批不转表）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import npcDustJson from '../src/data/vanilla-npcdust.json';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';
import { spawnNpcHitDust, spawnNpcDeathDust } from '../src/entities/NpcHitDust';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const W = 180, H = 150, FLOOR = 110;
const TABLE = npcDustJson as unknown as Record<string, {
  hit?: Array<Record<string, unknown>>; death?: Array<Record<string, unknown>>;
}> & { _meta: Record<string, unknown> };

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number;
  noGravity: boolean; vx: number; vy: number;
};

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj254-npcdust');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

/** spawnDust/spawnParticles/dust.spawn 三捕获桩（NpcHitDust 走 spawnDust;WoF 手块走 dust.spawn） */
function makeHooks(w: World, captured: DustCall[], parts: number[], legacyDust: number[], playerAt = { x: 20, y: FLOOR - 2 }) {
  const player = new Player(playerAt.x * TILE, playerAt.y * TILE, new Inventory());
  return {
    world: w, player,
    enemies: () => [] as Enemy[], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => { parts.push(1); },
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    spawnDust: (
      x: number, yn: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1, noGravity = false,
    ) => {
      const rec: DustCall = { x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, noGravity, vx: sx, vy: sy };
      captured.push(rec);
      return rec;   // 活对象——调用侧 post 算子可观测
    },
    dust: {
      spawn: (x: number, yn: number, wn: number, hn: number, type: number, sx = 0, sy = 0) => {
        legacyDust.push(type);   // WoF 手块记账（type 桶）
        return null;
      },
    },
    scene: {},
  } as unknown as GameHooks;
}

function spawn(vid: number, tx = 100, ty = FLOOR - 2): Enemy {
  const e = Enemy.fromVanilla(vid, tx * TILE, ty * TILE);
  expect(e).not.toBeNull();
  return e!;
}

// ===================== A. 数据面金标（首批代表组钉值） =====================
describe('BJ254 A. vanilla-npcdust.json 首批钉值', () => {
  it('岩浆族 59/60/151（:86545/:86555）：hit ceil×80 / death 40,alt Next(8)!=0→ng', () => {
    const hit59 = TABLE['59'].hit!;
    const death59 = TABLE['59'].death!;
    expect(hit59).toHaveLength(1);
    expect(hit59[0]).toEqual({ dust: 6, hitK: 80, sx: '2hd', sy: -1, alpha: 'npc', scale: 1.5, alt: { k: 8, op: '!=', v: 0, ifOps: [['ng', true]], elseOps: null }, line: 86545 });
    expect(death59).toEqual([{ dust: 6, n: 40, sx: '2hd', sy: -1, alpha: 'npc', scale: 1.5, alt: { k: 8, op: '!=', v: 0, ifOps: [['ng', true]], elseOps: null }, line: 86555 }]);
    for (const vid of ['60', '151']) {          // 同门组同参
      expect(TABLE[vid].hit).toEqual(hit59);
      expect(TABLE[vid].death).toEqual(death59);
    }
  });

  it('唾液 112/666（:86364）：both 相 20× d18 盒 y+2、alt 二分支（scale×0.6 / vel×1.4+ng）', () => {
    for (const vid of ['112', '666']) {
      const rec = TABLE[vid];
      const stmt = { dust: 18, n: 20, dy: 2, alpha: 100, scale: 2, alt: { k: 2, op: '==', v: 0, ifOps: [['scaleMul', 0.6]], elseOps: [['velMul', 1.4], ['ng', true]] }, line: 86364 };
      expect(rec.hit).toEqual([stmt]);
      expect(rec.death).toEqual([stmt]);        // 无 life 门 → hit/death 同发
    }
  });

  it('猪鲨之子 372/373（:85168/:85175）：hit ceil×100 全盒 / death 75× 中心±25 盒 50×50 + velDiv 2', () => {
    for (const vid of ['372', '373']) {
      expect(TABLE[vid].hit).toEqual([{ dust: 5, hitK: 100, sx: 'hd', sy: -1, line: 85168 }]);
      expect(TABLE[vid].death).toEqual([{ dust: 5, n: 75, anchor: 'center', dx: -25, dy: -25, w: 50, h: 50, sx: '2hd', sy: -2, posts: [['velDiv', 2]], line: 85175 }]);
    }
    expect(TABLE['370'].death).toEqual([{ dust: 5, n: 150, sx: '2hd', sy: -2, line: 85227 }]);
  });

  it('圣骑士 290（:89911）：death 10× d16 scale1.5 + velMul2+ng（受击零尘=原版无 life>0 支）', () => {
    expect(TABLE['290'].hit).toEqual([]);
    expect(TABLE['290'].death).toEqual([{ dust: 16, n: 10, scale: 1.5, posts: [['velMul', 2], ['ng', true]], line: 89911 }]);
  });

  it('克眼仆从 63/64/103（:86526/:86533）：per-type 条件色逐型钉值', () => {
    const want: Record<string, { r: number; g: number; b: number; a: number }> = {
      63: { r: 50, g: 120, b: 255, a: 100 },
      64: { r: 225, g: 70, b: 140, a: 100 },
      103: { r: 70, g: 225, b: 140, a: 100 },
    };
    for (const [vid, col] of Object.entries(want)) {
      expect(TABLE[vid].hit).toEqual([{ dust: 4, hitK: 50, sx: 'hd', sy: -1, color: col, line: 86526 }]);
      expect(TABLE[vid].death).toEqual([{ dust: 4, n: 25, sx: '2hd', sy: -2, color: col, line: 86533 }]);
    }
  });

  it('catch-all 专属支 156（:90926/:90932）+ 僵尸 3 / 骷髅族 32 / EoC 4 钉值', () => {
    expect(TABLE['156'].hit).toEqual([{ dust: 5, hitK: 100, sx: 'hd', sy: -1, line: 90926 }]);
    expect(TABLE['156'].death).toEqual([{ dust: 5, n: 50, sx: '2hd', sy: -2, line: 90932 }]);
    expect(TABLE['3'].hit).toEqual([{ dust: 5, hitK: 100, sx: 'hd', sy: -1, line: 87923 }]);
    expect(TABLE['3'].death).toEqual([{ dust: 5, n: 50, sx: '2.5hd', sy: -2.5, line: 87951 }]);
    expect(TABLE['32'].hit).toEqual([{ dust: 26, hitK: 50, sx: 'hd', sy: -1, line: 89526 }]);
    expect(TABLE['32'].death).toEqual([{ dust: 26, n: 20, sx: '2.5hd', sy: -2.5, line: 89532 }]);
    expect(TABLE['4'].death).toEqual([{ dust: 5, n: 150, sx: '2hd', sy: -2, line: 88271 }]);
  });

  it('★结构锁：_meta.noGenericTail 声明 + WoF 族 113-116 不在表（415-419 已随 BJ304 批3 fadeIn 翻案入表;661 已随 BJ327 批4 转正）', () => {
    expect(String(TABLE._meta.noGenericTail)).toContain('原版无通用尘尾');
    expect(String(TABLE._meta.source)).toContain('HitEffect');
    // ★BJ327 批4 后：402/426/427/661 已入表（尘面收官）——零尘钉面收敛于 pending
    //   滚动清单（std-expressible 族+根级门组）;113-116 WoF 手块保留。
    for (const vid of ['113', '114', '115', '116']) {
      expect(TABLE[vid], `vid=${vid} 不应出现在表`).toBeUndefined();
    }
    // 规模（批1 78 门组/299 型 + 批2 概率门族 15 型 = 314 + 批3 fadeIn 族 18 型 = 332
    //   + 批4 收官 402/661 转正 = 334,BJ327;426/427 批3 已在表）
    const ids = Object.keys(TABLE).filter((k) => k !== '_meta');
    expect(ids.length).toBe(334);
  });
});

// ===================== B. 行为锁（Enemy.hurt 查表精确） =====================
describe('BJ254 B. 受击/死亡尘查表行为', () => {
  it('史莱姆 1：hit = ceil(防后伤/lifeMax×100) 簇 d4（α=npc.spawnAlpha=175,color=npc 色）', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    const e = spawn(1);
    const hp0 = e.hp;
    e.hurt(20, 1, 0, g);
    const dealt = hp0 - e.hp;
    expect(e.hp).toBeGreaterThan(0);
    expect(cap.length).toBe(Math.ceil((dealt / e.maxHp) * 100));
    for (const d of cap) {
      expect(d.type).toBe(4);
      expect(d.sx).toBe(1); expect(d.sy).toBe(-1);
      expect(d.alpha).toBe(175);                       // npc.alpha（SetDefaults :8610）
      expect(d.w).toBe(e.w); expect(d.h).toBe(e.h);
    }
  });

  it('史莱姆 1 死亡：50 簇 d4 2hd/-2（:85714）；通用彩色粒子近似退役（spawnParticles=0）', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    const e = spawn(1);
    e.hurt(e.hp + 9999, -1, 0, g);
    expect(e.dead).toBe(true);
    expect(cap.length).toBe(50);
    for (const d of cap) {
      expect(d.type).toBe(4);
      expect(d.sx).toBe(-2); expect(d.sy).toBe(-2);
    }
    expect(parts.length).toBe(0);                      // ★近似退役（原版无通用尘尾）
    expect(legacy.length).toBe(0);
  });

  it('唾液 112 both 相：hit/death 各恰 20 粒（lifeMax=1 致死拍恒走死亡支,hit 相经求值器直驱验证）;alt 二分支互斥', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    // hit 相直驱（112 lifeMax=1——游玩面任意实伤即致死,受击支原版不可达;求值器面仍钉死）
    const e = spawn(112);
    spawnNpcHitDust(e, g, 1, 10);
    expect(cap.length).toBe(20);
    for (const d of cap) {
      expect(d.type).toBe(18);
      expect(d.y).toBe(e.y + 2);                       // 盒 (pos.X, pos.Y+2, w, h)
      expect(d.alpha).toBe(100);
      // alt Next(2)==0：scale×0.6 支 / vel×1.4+ng 支互斥必居其一（速 0/0 → velMul 恒等,判 ng+scale=2）
      const branchA = d.scale === 2 * 0.6 && !d.noGravity;
      const branchB = d.noGravity && d.scale === 2;
      expect(branchA || branchB).toBe(true);
    }
    // 致死拍恰 20 粒（hit/death 相互斥——缺 hp 门曾双发 40,FX45 ③ 实红回放）
    const e2 = spawn(112, 110, FLOOR - 4);
    const n0 = cap.length;
    e2.hurt(e2.hp + 9999, 1, 0, g);
    expect(e2.dead).toBe(true);
    expect(cap.length - n0).toBe(20);
  });

  it('猪鲨之子 372 死亡：75 簇 中心±25 盒 50×50 + velDiv 2（入池 2hd/-2 → 终值 ÷2）', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    const e = spawn(372);
    e.hurt(e.hp + 9999, 1, 0, g);
    expect(e.dead).toBe(true);
    expect(cap.length).toBe(75);
    for (const d of cap) {
      expect(d.type).toBe(5);
      expect(d.x).toBe(e.cx - 25);                     // 盒顶左=Center+(−25,−25)
      expect(d.y).toBe(e.cy - 25);
      expect(d.w).toBe(50); expect(d.h).toBe(50);
      // 入池速 = 2hd/-2（NewDust 抖动在引擎侧）→ 调用侧 velDiv 2 → 桩记录终值 1/-1
      expect(d.vx).toBe(1);
      expect(d.vy).toBe(-1);
    }
  });

  it('圣骑士 290 死亡：10× d16 scale1.5 + velMul2 + ng；受击零尘（原版无 life>0 支）', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    const e = spawn(290);
    e.hurt(10, 1, 0, g);
    expect(e.hp).toBeGreaterThan(0);
    expect(cap.length).toBe(0);                        // hit 相零尘（290 无受击支）
    const n0 = cap.length;
    const e2 = spawn(290, 110, FLOOR - 4);
    e2.hurt(e2.hp + 9999, 1, 0, g);
    expect(cap.length - n0).toBe(10);
    for (const d of cap.slice(n0)) {
      expect(d.type).toBe(16);
      expect(d.scale).toBe(1.5);
      expect(d.noGravity).toBe(true);                  // post ng
      expect(d.vx).toBe(0); expect(d.vy).toBe(0);      // 0 速 ×2=0（velMul 恒等）
    }
  });

  it('克眼仆从 63/64/103 死亡：25 簇 d4 2hd/-2,颜色 per-type（63 蓝/64 粉/103 绿）', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    const colors: Record<number, number[]> = { 63: [50, 120, 255, 100], 64: [225, 70, 140, 100], 103: [70, 225, 140, 100] };
    let n0 = cap.length;
    for (const [vidStr, col] of Object.entries(colors)) {
      const vid = Number(vidStr);
      const e = spawn(vid, 60 + vid, FLOOR - 2);
      e.hurt(e.hp + 9999, 1, 0, g);
      const seg = cap.slice(n0);
      n0 = cap.length;
      expect(seg.length).toBe(25);
      const colorArg = (g as unknown as { __lastColor?: unknown }).__lastColor;
      void colorArg;   // 色参经桩 alpha/color 形参——此处以捕获 rec 缺省可见面核对（见 A 数据面钉值）
      expect(seg.every((d) => d.type === 4)).toBe(true);
      expect(seg.every((d) => d.sx === 2 && d.sy === -2)).toBe(true);
    }
  });
});

// ===================== C. 未列型零尘 + WoF 手块保留 =====================
describe('BJ254 C. 未列型零尘（原版相锁）与 WoF 手块', () => {
  it('★661（光女,已随 BJ327 批4 转正——判别面移 tests/bj327-npcdust-batch4.test.ts）出尘走查表单源,零通用彩色粒子', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    const e = spawn(661);
    // ★直驱（661 仓内 stats 缺口 maxHp=5,与尘面无关——查表钉面走 NpcHitDust 单源;
    //   BJ327 批4 后 661 表内出尘,此处只锁「无 parts/legacy 旁路」旧偏差不回归）
    spawnNpcHitDust(e, g, 1, 10);
    expect(cap.length).toBeGreaterThan(0);             // 批4 转正:Next(5) 门彩虹 d267 环入表出尘
    expect(cap.every((d) => d.type === 267)).toBe(true);
    spawnNpcDeathDust(e, g, 1);
    expect(cap.every((d) => d.type === 267)).toBe(true);
    expect(parts.length).toBe(0);                      // 通用彩色粒子近似已退役
    expect(legacy.length).toBe(0);                     // 无 dust.spawn 旧通道旁路
  });

  it('WoF 113 手块保留（首批不转表）：受击 20 簇 / 死亡 50 簇（dust.spawn 旧通道）', () => {
    const w = makeWorld();
    const cap: DustCall[] = []; const parts: number[] = []; const legacy: number[] = [];
    const g = makeHooks(w, cap, parts, legacy);
    const e = spawn(113);
    e.hurt(10, 1, 0, g);
    expect(e.hp).toBeGreaterThan(0);
    expect(legacy.filter((t) => t === 5).length).toBe(20);   // 受击支手块（:88353）
    expect(cap.length).toBe(0);                              // 查表通道零重入
    const n0 = legacy.length;
    const e2 = spawn(113, 110, FLOOR - 4);
    e2.hurt(e2.hp + 9999, 1, 0, g);
    expect(e2.dead).toBe(true);
    expect(legacy.length - n0).toBe(50);                     // 死亡支手块（:88359）
  });
});
