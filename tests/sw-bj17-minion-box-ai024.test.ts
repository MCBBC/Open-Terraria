// ★SW-BJ17 2026-09-07 仆从构造器 13 id 真盒收尾批 + 1134 演出/寿命域 1:1（前批移交件）。
//  ①盒面：MinionProj 构造器 if 链与 minionTrueBox 单源补注册 8 id（317=28×28 :4104-4105 /
//  390-392=30×30 :4746-4747 / 833=26×20 :8086-8087 / 834-835=20×30 :8100-8101/:8114-8115 /
//  917=30×30 :8705-8706）——此前落 16×16 缺省 ⇒ 判定盒/湿段采样盒窄;移交清单余下
//  393-395/758/1036 已由 BJ13/BJ16 注册（本测试作守恒回归防静默回退）。
//  ②1134（CrystalShardMelee,aiStyle 24,P.cs:26275-26354）演出/寿命域逐句 1:1：
//    出生门 d70×6+Shatter×0.35（ai[0]==0 门,:26279-26281;546 出膛首颗 ai0=0 :13834）/
//    light=scale×0.5 → AddLight(0.25s,0.1s,0.45s)（:26292 + ProjLight :16246/:16636）/
//    rotation += vx×0.2 累计式（:26293,draw 旧 vel 向系误引 AI_210 :37536）/
//    ai[1]>15 起每拍 scale−0.05 ≤0.2 钉 0.2 → Kill（:26346-26354,scale 初值 1.2 :10648
//    → 恰 35t 即亡;Kill 面 :76811-76815 空循环=零死亡效果,本仓 dead 置位即 1:1）。
//    位移/湿段面归蓝队 K 批（yoyoshot-displacement.test.ts）,本件不重复。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MinionProj, minionTrueBox } from '../src/entities/MinionProj';
import { YoyoShotProj } from '../src/entities/WeaponProj';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MINION_TS = readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8');
const WEAPON_TS = readFileSync(join(ROOT, 'src/entities/WeaponProj.ts'), 'utf8');

// ================================================================
// ① 盒面：构造器 if 链（行为面）
// ================================================================
const TRUE_BOXES: Record<number, [number, number]> = {
  317: [28, 28],          // 乌鸦（:4104-4105）★本批
  390: [30, 30],          // 蜘蛛三型（:4746-4747）★本批
  391: [30, 30],
  392: [30, 30],
  833: [26, 20],          // 沙漠虎一档（:8086-8087）★本批
  834: [20, 30],          // 沙漠虎二三档（:8100-8101/:8114-8115）★本批
  835: [20, 30],
  917: [30, 30],          // 酷鞭雪花哨兵（:8705-8706）★本批
  // —— 已注册族守恒（BJ13/BJ16,对反编译终值核对一致）——
  393: [20, 30], 394: [20, 30], 395: [20, 30],
  758: [20, 30],
  1036: [18, 10],
};

describe('SW-BJ17 仆从构造器 13 id 真盒（SetDefaults 单源）', () => {
  it('构造器 if 链：8 id 补注册 + 5 已注册族守恒（16×16 缺省不再吃）', () => {
    for (const [idStr, [bw, bh]] of Object.entries(TRUE_BOXES)) {
      const id = Number(idStr);
      const m = new MinionProj(0, 0, id, 10, 1, false, 0, false, () => null);
      expect([m.w, m.h], `proj ${id} 构造器真盒`).toEqual([bw, bh]);
    }
  });

  it('minionTrueBox 读口与构造器单源同步（同表逐 id 恒等）', () => {
    for (const [idStr, [bw, bh]] of Object.entries(TRUE_BOXES)) {
      const b = minionTrueBox(Number(idStr));
      expect([b.w, b.h], `minionTrueBox(${idStr})`).toEqual([bw, bh]);
    }
  });
});

// ================================================================
// ② 1134 演出/寿命域（AI_024 :26275-26354 行为面）
// ================================================================
interface DustRec { x: number; y: number; w: number; h: number; type: number; vx: number; vy: number; scale: number; noGravity: boolean }
interface SfxRec { name: string; vol: number }

function mk1134(spec: { ai0?: number; vx?: number }) {
  const w = new World(120, 160, 30, 'open');
  w.clock.timeOfDay = 0;
  const dusts: DustRec[] = [];
  const sfx: SfxRec[] = [];
  const pl = new Player(20 * TILE, 30 * TILE, new Inventory());
  const game = {
    world: w,
    player: pl,
    enemies: () => [], critters: () => [], npcs: () => [],
    spawnDust: (x: number, y: number, dw: number, dh: number, type: number) => {
      // 基速 1/1、scale 1 = NewDust 池值代表（原文本体随机 ±2.0/±0.2 在 VanillaDust.spawn;
      // 桩定值即可校验 AI 后置 ×2.5/×0.9 写面）
      const d = { x, y, w: dw, h: dh, type, vx: 1, vy: 1, scale: 1, noGravity: false };
      dusts.push(d);
      return d;
    },
    playSfxWav: (name: string, vol?: number) => { sfx.push({ name, vol: vol ?? 1 }); },
    spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    playSfxFile: () => {}, cutTile: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, notifyInventoryChanged: () => {},
  } as unknown as GameHooks;
  // 干区出生（水带 x∈[480,656]px 之外;y 无水）
  const e = new YoyoShotProj({ x: 400, y: 1000, vx: spec.vx ?? 5, vy: 0,
    projId: 1134, dmg: 10, kb: 1, ai0: spec.ai0 });
  return { e, game, dusts, sfx };
}

describe('SW-BJ17 1134 AI_024 演出/寿命域（P.cs:26275-26354）', () => {
  it('首拍出生门：d70×6（尘盒=int(6×1.2)=7）noGravity + velocity×2.5 + scale×0.9（:26282-26291）', () => {
    const { e, game, dusts } = mk1134({});
    e.fixedUpdate(1 / 60, game);
    expect(dusts).toHaveLength(6);
    for (const d of dusts) {
      expect(d.type).toBe(70);
      expect([d.w, d.h]).toEqual([7, 7]);          // 原版活盒 SetDefaults 尾 width×scale（:10674-10675）
      expect(d.noGravity).toBe(true);              // :26285
      expect(d.vx).toBeCloseTo(2.5, 9);            // 缺省速 1（stub）×2.5（:26286）
      expect(d.vy).toBeCloseTo(2.5, 9);
      expect(d.scale).toBeCloseTo(0.9, 9);         // NewDust scale 1 ×0.9（:26288）
    }
  });

  it('出生音 ai[0]==0 门：首颗出声 Shatter×0.35（legacy 13,:26279-26281/:786）,余四颗哑', () => {
    const first = mk1134({ ai0: 0 });
    first.e.fixedUpdate(1 / 60, first.game);
    expect(first.sfx).toEqual([{ name: 'Shatter', vol: 0.35 }]);
    expect(first.dusts).toHaveLength(6);           // 尘不受 ai[0] 门（五颗全出尘）
    const rest = mk1134({ ai0: 1 });
    rest.e.fixedUpdate(1 / 60, rest.game);
    expect(rest.sfx).toEqual([]);
    expect(rest.dusts).toHaveLength(6);
  });

  it('出生门一次性（localAI[0]==0 → 1）：次拍零尘零音（:26276-26277）', () => {
    const { e, game, dusts, sfx } = mk1134({});
    e.fixedUpdate(1 / 60, game);
    e.fixedUpdate(1 / 60, game);
    expect(dusts).toHaveLength(6);                 // 不再追加
    expect(sfx).toHaveLength(1);
  });

  it('light=scale×0.5 → AddLight(0.25s,0.1s,0.45s)（:26292 + ProjLight :16246/:16636 乘区）', () => {
    const { e, game } = mk1134({});
    e.fixedUpdate(1 / 60, game);
    const l = (e as unknown as { lightRGB: [number, number, number] }).lightRGB;
    expect(l[0]).toBeCloseTo(0.3, 9);              // 1.2×0.5×0.5
    expect(l[1]).toBeCloseTo(0.12, 9);             // 1.2×0.5×0.2
    expect(l[2]).toBeCloseTo(0.54, 9);             // 1.2×0.5×0.9
  });

  it('rotation += vx×0.2 累计式（:26293,先于 :26343 阻尼——首拍 1.0、次拍 1.96）', () => {
    const { e, game } = mk1134({ vx: 5 });
    e.fixedUpdate(1 / 60, game);
    const rot1 = (e as unknown as { rotation: number }).rotation;
    expect(rot1).toBeCloseTo(1.0, 9);              // 5×0.2（阻尼前的 velocity.X）
    expect(e.vx).toBeCloseTo(4.8, 9);              // ×0.96（:26343,K 批面守恒）
    e.fixedUpdate(1 / 60, game);
    expect((e as unknown as { rotation: number }).rotation).toBeCloseTo(1.96, 9);
  });

  it('scale 收缩 Kill：scale 初值 1.2（:10648）,ai[1]>15（tick16）起 −0.05/t,tick35 死亡钉 0.2（:26346-26354）', () => {
    const { e, game } = mk1134({});
    for (let t = 1; t <= 34; t++) {
      e.fixedUpdate(1 / 60, game);
      expect((e as unknown as { dead: boolean }).dead, `tick ${t} 存活`).toBe(false);
    }
    expect((e as unknown as { scale: number }).scale).toBeCloseTo(0.25, 6);   // 19 次收缩
    e.fixedUpdate(1 / 60, game);                   // tick 35：第 20 次收缩 → ≤0.2 → Kill
    expect((e as unknown as { dead: boolean }).dead).toBe(true);
    expect((e as unknown as { scale: number }).scale).toBe(0.2);              // 钉值（:26350）
  });

  it('寿命面守恒：life=timeLeft 600（:10650）保留为保底上限,收缩 Kill 先于 timeLeft', () => {
    const { e } = mk1134({});
    expect((e as unknown as { life: number }).life).toBe(600);
  });

  it('draw 旋转 1134=累计 rotation（非 vel 向）,1135 保持 :37536 速度向兜底', () => {
    const i = WEAPON_TS.indexOf('const rot = this.projId === 1130');
    const seg = WEAPON_TS.slice(i, i + 800);
    const i1134 = seg.indexOf('? this.rotation');
    const iFallback = seg.indexOf(': Math.atan2(this.vy, this.vx)');
    expect(i1134).toBeGreaterThan(0);
    expect(iFallback).toBeGreaterThan(i1134);      // 1134 支先于 1135 速度向兜底
  });
});

// ================================================================
// ③ 结构锁（防静默回退——判据表达式与位序）
// ================================================================
describe('SW-BJ17 结构锁', () => {
  it('MinionProj 构造器 8 分支字面 + minionTrueBox 同步字面', () => {
    expect(MINION_TS).toContain('else if (projId === 317) { this.w = 28; this.h = 28; }');
    expect(MINION_TS).toContain('else if (projId === 390 || projId === 391 || projId === 392) { this.w = 30; this.h = 30; }');
    expect(MINION_TS).toContain('else if (projId === 833) { this.w = 26; this.h = 20; }');
    expect(MINION_TS).toContain('else if (projId === 834 || projId === 835) { this.w = 20; this.h = 30; }');
    expect(MINION_TS).toContain('else if (projId === 917) { this.w = 30; this.h = 30; }');
    expect(MINION_TS).toContain('case 317: return { w: 28, h: 28 };');
    expect(MINION_TS).toContain('case 390: case 391: case 392: return { w: 30, h: 30 };');
    expect(MINION_TS).toContain('case 833: return { w: 26, h: 20 };');
    expect(MINION_TS).toContain('case 834: case 835: return { w: 20, h: 30 };');
    expect(MINION_TS).toContain('case 917: return { w: 30, h: 30 };');
  });

  it('WeaponProj AI_024 1134 判据字面（出生门/光/旋/收缩钉值）', () => {
    expect(WEAPON_TS).toContain("if (this.ai0 === 0) game.playSfxWav?.('Shatter', 0.35, this.cx, this.cy);");
    expect(WEAPON_TS).toContain('this.lightRGB = [this.scale * 0.25, this.scale * 0.1, this.scale * 0.45];');
    expect(WEAPON_TS).toContain('this.rotation += this.vx * 0.2;');
    expect(WEAPON_TS).toContain('if (this.age > 15) {');
    expect(WEAPON_TS).toContain('this.scale -= 0.05;');
    expect(WEAPON_TS).toContain('this.scale = 0.2;');
    // 位序：出生门 → 光 → 旋 → 阻尼 → 收缩（:26275..:26354 原文序）
    const iGate = WEAPON_TS.indexOf('if (this.age === 1) {');
    const iLight = WEAPON_TS.indexOf('this.lightRGB = [this.scale * 0.25');
    const iRot = WEAPON_TS.indexOf('this.rotation += this.vx * 0.2;');
    const iDamp = WEAPON_TS.indexOf('this.vx *= 0.96; this.vy *= 0.96;', iRot);
    const iShrink = WEAPON_TS.indexOf('if (this.age > 15) {');
    expect(iGate).toBeGreaterThanOrEqual(0);
    expect(iGate).toBeLessThan(iLight);
    expect(iLight).toBeLessThan(iRot);
    expect(iRot).toBeLessThan(iDamp);
    expect(iDamp).toBeLessThan(iShrink);
  });

  it('546 出膛 ai0=(m==0)?0:1（:13834 NewProjectile 第 9 参）', () => {
    expect(WEAPON_TS).toContain('ai0: m === 0 ? 0 : 1 });');
    expect(WEAPON_TS).toContain('ai0?: number;');
  });

  it('scale 初值走数据面（pd.scale=1.2,:10648）且 1134 收缩绘制接入 drawProj scale 位', () => {
    expect(WEAPON_TS).toContain('this.scale = pd?.scale ?? 1;');
    expect(WEAPON_TS).toContain('this.projId === 1134 ? this.scale : 1);');
  });
});
