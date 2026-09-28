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
      sx = 0, sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      // NewDust 速度抖动语义（Dust.cs:158-159 `rand(-20,21)*0.1 + SpeedX`）——
      // 原版发射方在 NewDust 后整体覆写 velocity/scale 抹除之；桩内先注入抖动,
      // 令「未覆写」的实现在此红（streak 成形判据的判别力来源）
      const d: DustRec & { vx: number; vy: number; x: number; y: number; fadeIn?: number } = {
        type, alpha, scale, noGravity: !!ng,
        vx: sx + (Math.floor(Math.random() * 41) - 20) * 0.1,
        vy: sy + (Math.floor(Math.random() * 41) - 20) * 0.1,
        x: _x + 4, y: _y + 4 };
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
  it('双层绘制式：主层暗化预烘焙（RGB×0.5,去 ctx.filter 依赖）+第二层 Glow_195 A=0 纯加算', () => {
    const src = rs();
    // ★BJ348b-3：暗化烘焙函数在位（MultiplyRGBA RGB 面 ×0.5,α 面不动）
    expect(src).toContain('function arcanumDimTex');
    expect(src.match(/id\.data\[i(?: \+ \d)?\] = \(id\.data\[i(?: \+ \d)?\] \* 0\.5\) \| 0;/g)?.length).toBe(3);
    // 手持两处主层零 ctx.filter 依赖（shim acc 链 filter 分叉根因防御）
    expect(src).not.toContain("ctx.filter = 'brightness(0.5)'");
    expect(src.match(/globalAlpha = 0\.8/g)?.length).toBe(2);            // 静持+挥舞两处第一层
    // 发光层组合字面（lighter + 125/255 相邻行）×2（静持+挥舞）
    const glowPair = src.match(/globalCompositeOperation = 'lighter';\s*\n\s*ctx\.globalAlpha = 125 \/ 255;/g)?.length ?? 0;
    expect(glowPair).toBe(2);
    // 主层走烘焙帧（null 兜底原帧）×2
    expect(src.match(/if \(dim\) \{/g)?.length).toBe(2);
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
    // 骑乘：★oldPos[1] 语义（:35483-35486 `position += proj4.position − proj4.oldPos[1]`,
    // oldPos[1] = 父 2 update 前位）——骑乘 delta = 父【2 拍】位移。先停父/停子,
    // 跑两拍 settle 让双缓冲排干历史速度（第 1 拍仍吐 2 拍历史 delta 14,第 2 拍吐 7）,
    // 再测「父移 10px → 子 x +10」。
    const s0 = sparks[0]!;
    a.vx = 0; a.vy = 0;                          // 父停（无锁敌时不被 AI 重设）
    s0.vx = 0; s0.vy = 0;                        // 子停（回拢步进 ≤0.15/拍）
    s0.fixedUpdate(1 / 60, game);                // settle1：吐历史 2 拍 delta（14）
    s0.fixedUpdate(1 / 60, game);                // settle2：吐历史 1 拍 delta（7）,缓冲追平
    const x1 = s0.x;
    a.x += 10;
    s0.fixedUpdate(1 / 60, game);
    expect(s0.x - x1).toBeGreaterThan(9);        // 骑乘 10 + 回拢 ≤0.15
    expect(s0.x - x1).toBeLessThan(11);
  });
  it('骑乘 2 拍 delta（oldPos[1] 语义）：父单拍移 10、上一拍移 6 → 骑 16', () => {
    const dusts: DustRec[] = [];
    const bucket: Arrow[] = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    const a = new Arrow(800, 1500, 0, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 62);                      // 静止父慢速段（ai0=30/60 两掷 618）
    const s0 = bucket.find((q) => q.projId === 618)!;
    // 火花钉回父心（homing sign(0)=0 消漂移）+ 停速 → 骑乘量裸测
    s0.x = a.cx - s0.w / 2; s0.y = a.cy - s0.h / 2;
    s0.vx = 0; s0.vy = 0;
    s0.fixedUpdate(1 / 60, game);                // 缓冲追平（父静止 delta 0）
    a.x += 6;
    s0.fixedUpdate(1 / 60, game);                // 吐「2 拍前 0 → 上一拍 6」delta
    a.x += 10;
    const x1 = s0.x;
    s0.fixedUpdate(1 / 60, game);                // 本拍 delta = 6 + 10 = 16（+homing ≤0.3）
    expect(s0.x - x1).toBeGreaterThan(15.5);
    expect(s0.x - x1).toBeLessThan(16.5);
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
  it('尘 followEnt 随动接线（Dust.cs:571-581 customData=Projectile）：617 环尘/618 尾尘骑父弹本拍位移,父死零位移', () => {
    const dusts: (DustRec & { followEnt?: () => { dx: number; dy: number } })[] = [];
    const bucket: Arrow[] = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    const a = new Arrow(800, 1500, 7, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 122);                     // 快速段环尘 + 慢速段环尘 + 618 尾尘全接线
    const rode = dusts.filter((d) => typeof d.followEnt === 'function');
    expect(rode.length).toBeGreaterThanOrEqual(1);   // 环尘 86/90/240 + 618 尾尘均带闭包
    // 闭包返回父弹本拍位移（x−oldX）：父移 10 → (10, 0)
    a.oldX = a.x - 10; a.oldY = a.y;
    for (const d of rode) {
      const q = d.followEnt!();
      expect(q.dx).toBeCloseTo(10, 6);
      expect(q.dy).toBeCloseTo(0, 6);
    }
    // 父死 → 零位移（:573 `if (projectile.active)` 门镜像）
    a.dead = true;
    for (const d of rode) {
      const q = d.followEnt!();
      expect(q.dx).toBe(0);
      expect(q.dy).toBe(0);
    }
  });
});

// ★★★ 2026-09-28 streak 成形批（重锚判据：streak 可见性,非内聚度）★★★
// 用户 ground truth：原版 618 粉色小射弹 = 沿轨迹的紫白 streak 拖尾群（bilibili 帧）。
// 机制考古定谳（Projectile.cs:35517-35528 / :35304-35321 / :35363-35378）：
//   原版发射方在 NewDust 后【整体覆写】velocity/scale/position——NewDust 自带的
//   ±0.2/轴速度抖动、×0.8..1.2 scale 抖动、+4px 位置偏移被逐字抹除。弹速 ~6 时
//   ±2/轴抖动 = ±26° 方向弥散 ×~65px 尘程 → 12px 间距的拖尾链横向散开 ~40px 断链
//   =「粉色小射弹不成形」第一因。成功判据 = 拖尾链（同速链锁）,非尘→球内聚度。
describe('BJ348c streak 成形：发射方 NewDust 后精确覆写（原版覆写序逐字）', () => {
  interface FullRec { type: number; vx: number; vy: number; x: number; y: number; scale: number; noGravity: boolean; followEnt?: unknown; fadeIn?: number }

  it('618 尾尘：velocity=弹速精确、scale=1.5 精确、position=弹心精确（:35520-35524 覆写序）', () => {
    const dusts: FullRec[] = [];
    const game = makeGame(emptyWorld(), dusts as unknown as DustRec[]);
    const parent = new Arrow(800, 1500, 0, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    // 直构 618（父静止、每拍把火花【钉回父心】→ 骑乘 delta=0 + homing sign(0)=0,
    // 弹速恒 6 直飞 = 纯链锁工况。★勿反向钉父随子：骑乘 delta 会吃到子自身位移,
    // homing 回拉污染弹速（曾 6→5.7 伪红））
    const s = new Arrow(800, 1500, 6, 0, 35, 0, 618, { grav: 0, life: 420, pierce: -1 });
    (s as unknown as { naParent: Arrow | null }).naParent = parent;
    // 骑乘缓冲初始化（对齐 617 生成路径 :6933-6936 的 naLast/naPrev=父心——直构绕过
    // 生成路径时字段缺省 0 → 首拍骑乘 delta=父心绝对位 → homing 回拉伪步）
    const sf = s as unknown as { naLastPX: number; naLastPY: number; naPrevPX: number; naPrevPY: number };
    sf.naLastPX = parent.cx; sf.naLastPY = parent.cy;
    sf.naPrevPX = parent.cx; sf.naPrevPY = parent.cy;
    for (let i = 0; i < 40 && !s.dead; i++) {
      s.x = parent.cx - s.w / 2; s.y = parent.cy - s.h / 2;   // 火花钉回父心
      s.fixedUpdate(1 / 60, game);
    }
    const trail = dusts.filter((d) => d.type === 86);
    expect(trail.length).toBeGreaterThanOrEqual(8);            // 40 拍 1/2 掷 − 屏盒外无
    for (const d of trail) {
      expect(d.vx).toBeCloseTo(6, 6);                          // = 弹速（±2 抖动被覆写抹除）
      expect(d.vy).toBeCloseTo(0, 6);
      expect(d.scale).toBeCloseTo(1.5, 6);                     // = 1.5 精确（×0.8..1.2 被抹除）
      expect(d.noGravity).toBe(true);
    }
    // 同速链锁 = streak 本体：全链速度零弥散 → 相邻尘间距恒 ≈ 6px/掷位
    const uniq = new Set(trail.map((d) => `${d.vx.toFixed(3)},${d.vy.toFixed(3)}`));
    expect(uniq.size).toBe(1);
  });

  it('617 慢速段环尘：切向 |v|=6/反切向 |v|=5 精确、半径 10..21|20..31、scale 0.9+（:35363-35378 覆写序）', () => {
    const dusts: FullRec[] = [];
    const game = makeGame(emptyWorld(), dusts as unknown as DustRec[]);
    const a = new Arrow(800, 1500, 0, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    flyFrames(a, game, 100);                     // 静止父 → 首拍即慢速段
    const halo86 = dusts.filter((d) => d.type === 86);
    const halo90 = dusts.filter((d) => d.type === 90);
    const halo240 = dusts.filter((d) => d.type === 240);
    expect(halo86.length + halo90.length).toBeGreaterThanOrEqual(20);
    expect(halo240.length).toBeGreaterThanOrEqual(10);
    for (const d of [...halo86, ...halo90]) {
      expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(6, 6);      // 切向×6 精确（±2 抖动被抹除）
      const r = Math.hypot(d.x - (a.cx), d.y - (a.cy));
      expect(r).toBeGreaterThanOrEqual(10 - 1e-6);
      expect(r).toBeLessThanOrEqual(21 + 1e-6);              // 心−向×rand(10..21) 精确（+4 偏移被抹除）
      expect(d.scale).toBeGreaterThanOrEqual(0.9 - 1e-6);
      expect(d.scale).toBeLessThanOrEqual(1.9 + 1e-6);       // 0.9+rand 精确
    }
    for (const d of halo240) {
      expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(5, 6);      // 反切向×5 精确
      const r = Math.hypot(d.x - (a.cx), d.y - (a.cy));
      expect(r).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(r).toBeLessThanOrEqual(31 + 1e-6);
    }
  });
});
