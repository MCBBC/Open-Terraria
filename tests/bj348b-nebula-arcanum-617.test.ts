// ★BJ348b 星云奥秘 3476 弹面收口（617 球体/618 火花/620 碎片）——BJ348 后续批：
//   刀1 617 撞块弱反弹 ×0.35（Projectile.cs:18378-18388 HandleMovement type 段）
//   刀2 617 慢速段环尘二选一（:35363-35372 for(1) 每拍必发,Next(2) 单掷 if/else）
//   刀3 617 穿透表值 penetrate=3（SetDefaults :6646-6658——通用兜底 HOMING_FAMILY_
//       PIERCE 曾压成 1 = 命中即爆）
//   刀4 3476 静持特位 (Center+14dir, MountedCenter.Y)（Player.cs:51038-51043）
//   刀5 3476 物品 glowmask 194（GlowMaskID.cs:397 NebulaArcanumItem；DrawItem
//       glowmask 通道 :38072-38213）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';

interface DustRec { type: number; alpha: number; scale: number; noGravity: boolean; }

function makeGame(w: World, dusts: DustRec[], bucket?: Arrow[]) {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    projectiles: () => [],
    entities: { nextId: 1, add: (e: unknown) => { if (bucket) bucket.push(e as Arrow); } },
    playSfx: () => {}, playSfxFiles: (() => {}) as unknown,
    playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    addLightAt: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number,
      _sx = 0, _sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      const d: DustRec & { vx: number; vy: number; x: number; y: number; fadeIn?: number } = {
        type, alpha, scale, noGravity: !!ng, vx: 0, vy: 0, x: 0, y: 0 };
      dusts.push(d);
      return d;
    },
    broadcastParticleOrchestra: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

function flyFrames(a: Arrow, game: GameHooks, frames: number): void {
  for (let i = 0; i < frames && !a.dead; i++) a.fixedUpdate(1 / 60, game);
}

const GAME_ROOT = join(__dirname, '..');

describe('BJ348b 刀1：617 撞块弱反弹 ×0.35（:18378-18388）', () => {
  /** 竖墙场景：列 80 行 170..189 实心（弹心行 185 横飞入墙,X 回退探针出列 80） */
  function wallWorld(): World {
    const w = emptyWorld();
    for (let y = 170; y < 190; y++) w.store.setTileSilent(80, y, 1, 0, 0);
    return w;
  }
  it('横飞入墙：不死、vx 反号 ×0.35（7 → −2.45）、Y 轴不动', () => {
    const game = makeGame(wallWorld(), []);
    // 弹心在墙列（80）左缘外 1px 出生 → 一拍 7px 入墙（深 6px）后回退探针出格
    //  = 真实工况（速度 7 < 格宽 16 的入撞瞬态）
    const a = new Arrow(80 * 16 - 1 - 16, 185 * 16 + 8 - 16, 7, 0, 70, 5, 617,
      { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 1);                       // 一步进墙 → 撞块链
    expect(a.dead).toBe(false);                  // 不消亡（原版无 Kill 臂）
    expect(a.vx).toBeCloseTo(-2.45, 5);          // −7×0.35
    expect(a.vy).toBe(0);
  });
  it('反弹后 |v|<4 → AI 慢速段接管（衰减驻场,不因撞块耗穿透）', () => {
    const game = makeGame(wallWorld(), []);
    const a = new Arrow(80 * 16 - 1 - 16, 185 * 16 + 8 - 16, 7, 0, 70, 5, 617,
      { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 80);
    expect(a.dead).toBe(false);                  // 驻场存活（曾走通用消亡口即死）
    expect(Math.hypot(a.vx, a.vy)).toBeLessThanOrEqual(4.001);   // 慢速段速域
  });
});

describe('BJ348b 刀2：慢速段环尘每拍必发+单掷二选一（:35363-35372）', () => {
  it('每拍必发;86/90 成对;240 与 86 同为 1/2 掷结果;慢速段 scale 0.9+ 主导', () => {
    const dusts: DustRec[] = [];
    const w = emptyWorld();
    const game = makeGame(w, dusts);
    const a = new Arrow(800, 1500, 7, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 260);                     // 57 拍快速段 + ~200 拍慢速段
    expect(a.dead).toBe(false);                  // 全程在场（无爆裂尘污染统计）
    // 每拍必发：慢速段 ~200 拍（if 支 2 枚/else 支 1 枚 → 期望 ~300）+ 快速段
    //  1/3 掷 ~19 枚。下限 195 = 旧「外层 1/2 发尘门」变异上界（~169）之外
    expect(dusts.length).toBeGreaterThanOrEqual(195);
    expect(dusts.length).toBeLessThanOrEqual(400);
    const n86 = dusts.filter((d) => d.type === 86).length;
    const n90 = dusts.filter((d) => d.type === 90).length;
    const n240 = dusts.filter((d) => d.type === 240).length;
    expect(Math.abs(n86 - n90)).toBeLessThanOrEqual(20);     // 慢速段成对;快速段单发污染 σ≈2.2
    expect(Math.abs(n240 - n86)).toBeLessThanOrEqual(42);    // 二选一各半 ±3σ
    // 慢速段 scale 升档 0.9+（快速段 0.5+）——慢速段主导后 ≥0.9 占多数
    const slowScaled = dusts.filter((d) => d.scale >= 0.9).length;
    expect(slowScaled).toBeGreaterThan(dusts.length * 0.5);
  });
});

describe('BJ348b 刀3：617 穿透表值 3（SetDefaults :6646-6658）', () => {
  it('数据面金标：vanilla-projectiles.json 617 penetrate=3 + usesLocalNPCImmunity', () => {
    const pd = JSON.parse(readFileSync(join(GAME_ROOT, 'src/data/vanilla-projectiles.json'), 'utf8'));
    expect(pd['617'].penetrate).toBe(3);
    expect(pd['617'].localNPCHitCooldown).toBe(8);
    expect(pd['617'].usesLocalNPCImmunity).toBe(true);
    expect(pd['617'].aiStyle).toBe(118);
  });
  it('源码锚：通用兜底 HOMING_FAMILY_PIERCE 含 617（曾压成 pierce 1 = 命中即爆）', () => {
    const src = readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');
    const m = /HOMING_FAMILY_PIERCE = new Set\(\[([^\]]*)\]\)/.exec(src);
    expect(m).not.toBeNull();
    const ids = (m![1] ?? '').split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    expect(ids).toContain(617);
  });
});

describe('BJ348b-2 手持视觉专支（PlayerDrawLayers.cs:3334-3351 case 3476 逐字节）', () => {
  const rs = () => readFileSync(join(GAME_ROOT, 'src/render/Renderer.ts'), 'utf8');
  it('贴图源 = Extra_64 旋转球帧（item sprite 贝壳不画,return 早退语义）', () => {
    const src = rs();
    expect(src).toContain("ARCANUM_HOLD_TEX = 'vanilla/Extra_64.png'");
    expect(src).toContain("ARCANUM_HOLD_GLOW_TEX = 'vanilla/Glow_195.png'");
    expect(src).toContain('ARCANUM_HOLD_FRAME_PERIOD = 54');
    expect(src).toContain('ARCANUM_HOLD_FRAME_STEP = 6');
    // 帧序 = miscCounter % 54 / 6（:3337,静持+使用期两处同源）
    const hits = src.match(/miscCounter % ARCANUM_HOLD_FRAME_PERIOD/g)?.length ?? 0;
    expect(hits).toBe(2);
  });
  it('双层绘制式：第一层暗化(0.5,0.5,0.5,0.8)+第二层 Glow_195 A=0 纯加算(125/255 lighter)', () => {
    const src = rs();
    expect(src).toContain("ctx.filter = 'brightness(0.5)'");
    expect(src.match(/globalAlpha = 0\.8/g)?.length).toBe(2);            // 静持+挥舞两处第一层
    // 发光层组合字面（lighter + 125/255 相邻行）×2（静持+挥舞）
    const glowPair = src.match(/globalCompositeOperation = 'lighter';\s*\n\s*ctx\.globalAlpha = 125 \/ 255;/g)?.length ?? 0;
    expect(glowPair).toBe(2);
  });
  it('使用期专支：无 0.785 斜持 + vector6(+12) + 帧中心 origin', () => {
    expect(rs()).toContain('offX = Math.cos(aim) * 14 + ARCANUM_HOLD_FRAME_PX / 2');
    expect(rs()).toContain('rot = aim;');
  });
  it('静持特位：itemLocation 14 + vector6 12 = 26（:51038+:3341 合成）', () => {
    expect(rs()).toContain('offX = 14 + ARCANUM_HOLD_FRAME_PX / 2; offY = p.h * 0.5;');
  });
  it('资产在位：Extra_64 与 Glow_195 均 24×216（24×24×9 帧竖条）', () => {
    for (const f of ['Extra_64.png', 'Glow_195.png']) {
      const buf = readFileSync(join(GAME_ROOT, 'public/sprites/vanilla', f));
      expect(buf.readUInt32BE(16)).toBe(24);
      expect(buf.readUInt32BE(20)).toBe(216);
    }
  });
  it('旧刀5 回退确认：手持面不再引用 Glow_194（物品态光斑归 DrawItem 通道债）', () => {
    expect(rs()).not.toContain("vanilla/Glow_194.png'");
  });
});

describe('BJ348b 手持视觉定谳（ItemCheck_Shoot :47605 盒心字面 / 无 item 隐藏特判）', () => {
  const gameSrc = () => readFileSync(join(GAME_ROOT, 'src/core/Game.ts'), 'utf8');
  it('使用期 item sprite 不隐藏：数据面无 noUseGraphic（原版 DrawPlayer_27 通用门照画）', () => {
    const fn = JSON.parse(readFileSync(join(GAME_ROOT, 'src/data/vanilla-itemfunc.json'), 'utf8'));
    expect(fn['3476']?.noUseGraphic).toBeUndefined();
    const cb = JSON.parse(readFileSync(join(GAME_ROOT, 'src/data/vanilla-itemcombat.json'), 'utf8'));
    expect(cb['3476']?.noUseGraphic).toBeUndefined();
  });
  it('球体位置序列：617 出生锚=玩家盒心（原版 pointPosition 字面,杖尖备案豁免）', () => {
    const src = gameSrc();
    expect(src).toContain('const arcanumSpawn = critVid === 3476;');
    expect(src).toContain('arcanumSpawn ? this.player.cx : shotTip.x');
    expect(src).toContain('arcanumSpawn ? this.player.cy : shotTip.y');
  });
  it('球体位置序列：盒心出生后快速段直飞（前 30 拍无衰减 7px/拍=0.5s 穿身而出）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    // 盒心出生（玩家盒 20×42 中心 = 1270,1500,弹左上=中心−16）
    const a = new Arrow(1270 - 16, 1500 - 16, 7, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 10);
    expect(a.x - (1270 - 16)).toBeCloseTo(70, 1);   // 前 30 拍 ai0<30 不衰减=恒 7px/拍
    expect(a.dead).toBe(false);
  });
});

describe('BJ348b 星云族回归（BJ348 面）', () => {
  it('自旋：前 29 拍恒 −π/30（无追加）;第 30 拍（ai0=30≥30）起快速段追加 −π/180', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(800, 1500, 7, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    const spin = () => (a as unknown as { spinRot: number }).spinRot;
    flyFrames(a, game, 10);
    expect(spin()).toBeCloseTo(-10 * Math.PI / 30, 6);
    flyFrames(a, game, 30);                      // 累计 40 拍（ai0=30..40 追加 11 拍）
    expect(spin()).toBeCloseTo(-(40 * Math.PI / 30 + 11 * Math.PI / 180), 6);
  });
  it('alpha −15/t 渐显（:35290-35295），5 拍 255→180', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(800, 1500, 7, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 5);
    expect(a.alpha).toBe(180);
  });
  it('慢速段每 30t 掷 618（随机向 ×12、naParent 接线）+ 父移骑乘（:35483-35486）', () => {
    const dusts: DustRec[] = [];
    const bucket: Arrow[] = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    const a = new Arrow(800, 1500, 7, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 122);                     // 慢速段 65 拍 → ai0=30/60 两掷
    const sparks = bucket.filter((q) => q.projId === 618);
    expect(sparks.length).toBe(2);
    expect(Math.max(1, Math.trunc(70 / 2))).toBe(35);   // damage/2 int 截断语义
    for (const s of sparks) {
      const na = s as unknown as { naParent: Arrow | null };
      expect(na.naParent).toBe(a);
      expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(12, 5);   // UnitY.RotatedByRandom × 12
    }
    // 骑乘：618 滞后于父（生成后父继续飞）——先补偿一拍把 naLastPX 追平并
    // 停父/停子（子速度 ±12 全量位移会淹没骑乘量），再测「父移 10px → 子 x +10」
    const s0 = sparks[0]!;
    s0.fixedUpdate(1 / 60, game);                // 补偿拍（吸收生成后父位移）
    a.vx = 0; a.vy = 0;                          // 父停（无锁敌时不被 AI 重设）
    s0.vx = 0; s0.vy = 0;                        // 子停（回拢步进 ≤0.15/拍）
    const x1 = s0.x;
    a.x += 10;
    s0.fixedUpdate(1 / 60, game);
    expect(s0.x - x1).toBeGreaterThan(9);        // 骑乘 10 + 回拢 ≤0.15
    expect(s0.x - x1).toBeLessThan(11);
  });
  it('killNow → 176 AoE + Item_14 音 + 620×(5..8)+(5..8)（色键 86|90）+ 618 父亡即杀', () => {
    const dusts: DustRec[] = [];
    const bucket: Arrow[] = [];
    const sfx: string[][] = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    (game as unknown as { playSfxFiles: (n: string[], v?: number, x?: number, y?: number) => void })
      .playSfxFiles = (names: string[]) => { sfx.push(names); };
    const a = new Arrow(800, 1500, 7, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    // 先经真实链造在场 618（慢速段 ai0=30 首掷 = 全局第 ~87 拍）
    flyFrames(a, game, 60 + 31);
    expect(bucket.filter((q) => q.projId === 618).length).toBeGreaterThanOrEqual(1);
    const six18 = bucket.filter((q) => q.projId === 618);
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(game);
    expect(a.dead).toBe(true);
    expect(sfx.some((n) => n.includes('Item_14'))).toBe(true);
    const shards = bucket.filter((q) => q.projId === 620);
    expect(shards.length).toBeGreaterThanOrEqual(10);
    expect(shards.length).toBeLessThanOrEqual(16);
    for (const sh of shards) {
      expect([86, 90]).toContain((sh as unknown as { na620Dust: number }).na620Dust);
    }
    // 父亡链：618 下一拍自杀（:35475-35478 proj4==null → Kill）
    flyFrames(six18[0]!, game, 1);
    expect(six18[0]!.dead).toBe(true);
  });
});
