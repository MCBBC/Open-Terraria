// 月系批 AI 家族 1:1 移植(Terarria1456, 1.4.5.6)：
//   aiStyle 81  月总游离眼 400            NPC.cs:38224-38667（攻击表 MoonLordAttacksArray2
//                                              :6966-6985 十槽循环:悬停/幻影矢 462/幻影球 454
//                                              六角螺旋/幻影眼 452 洒射/死亡之光 455;锚核心 398
//                                              ai[3],核心亡→静默消散;SetDefaults dontTakeDamage
//                                              =true → 恒无敌）
//   aiStyle 82  月总水蛭块 401            NPC.cs:38668-38792（ai[2] 90t 从弹着点插值飞向
//                                              头额(0,+216);到位把 1000 点治疗按
//                                              头396→核心398→手397(ai2=0)→手(ai2=1) 亏血序回灌）
//   aiStyle 83  神秘石碑 437/忠实信徒 438  NPC.cs:38793-38962（石碑 CheckFloor 落地校验后召
//                                              4 教徒(379×2 外侧/438×2 内侧,ai[3]=-(碑id+1));
//                                              信徒受击→石碑 localAI[0]=1→弓手激活;四教徒全灭
//                                              →侧面落点召 439 邪教徒 + 300t 仪式倒计时消散）
//   aiStyle 86  暗焰幻影 472/远古幻影 521  NPC.cs:39261-39519（穿墙横掠→越过 660/500px 掉头
//                                              →回摆循环;521 全参数强化(0.7/14/500/6/3)+
//                                              228 号紫雾拖尾;出生 120t 显形爆发音 Item8）
//   aiStyle 87  珍稀四宝箱怪 473-476       NPC.cs:39520-39875（ai[0] 0 伪装箱→1 蓄力 36t→
//                                              2 贴地跳扑(每 210t 随机 3 蓄能无敌 180t/
//                                              4 飞天俯冲/6 三连扑,每第 3 跳双倍高度);
//                                              7 玩家死→零伤满血渐隐;8 十周年世界炮连发不可达）
//   aiStyle 88  飞蛾魔 477                NPC.cs:39876-40406（日食限定;-1 无日食爬升无敌/
//                                              0 悬顶伺服 180t 轮换 2 追击(×0.5 伤)/3 侧掠
//                                              冲刺(3.2 ×1.3 伤)/4 扫地产卵 478(上限 7 只)）
//   aiStyle 89  蛾卵 478                  NPC.cs:40407-40449（900t(专家 600)→Transform 479;
//                                              受击 -10..20×2 孵化加速;末期 75% 抽搐跳）
//   aiStyle 90  幼蛾 479                  NPC.cs:40450-40685（日食限定;-1 爬升/0 悬停 90t→
//                                              2 贴脸 10t 瞄准→2.1 冲刺;无日食→上浮消散）
//   aiStyle 91  花岗岩元素 483            NPC.cs:40686-40870（AI 自置 noGravity=true;穿墙追击/
//                                              侧移锚点/漂移弹壁,与 AI_085 同构五态寻路）
// 去重核实(任务卡勘误):aiStyle 84 ≠ 月总死光——84 = 拜月教邪教徒 439/克隆体 440
//   (NPC.cs:38963-38966 → AI_084_LunaticCultist :64921,Enemy.ts case 84 已落位);
//   "月总死光"是投射物 455 PhantasmalDeathray(本批 aiStyle 81 状态 4 发射,复用
//   bossAI_duke_moonlord 导出的 MLDeathray 类 'core' 档)。星璇塔四组专属怪
//   aiStyle 85/95/96/97/99（405/421/406/407(/408)/420/519）已在本文件 1:1 落位
//   （文件尾段），Enemy.ts 一期近似档（swarmerAI/casterAI）退役；421 头顶吸附的
//   Obstructed(buff 163)已实装（每 tick AddBuff 续期 + Renderer 遮屏滤镜）。
// 弹幕贴图 Projectile_{452,454,462}.png 已入 sprites/vanilla(原 RENDER_PROXY 代渲退役,
//   见 shootL 注释);455 走 MLDeathray 类自绘;526 仪式粒子有贴图但带 ai[0..1] 归巢弹道,降级为粒子。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE, ENEMY_GRAVITY, MAX_FALL_SPEED } from '../core/constants';
import { BuffType } from '../stats/Buffs';
import { moveAndCollide } from '../physics/TileCollision';
import { spawnPart, spawnVanillaEnemy, losClear, enemySpawnChain, addEnemy } from './bossAI';
import { Arrow } from './Arrow';
import { projFrameImg, projSprite, volleyPhantomOrbs, nudgePhantomOrbs } from './Arrow';
import { Entity } from './Entity';
import { canHitLine } from '../physics/LineOfSight';
import { MLDeathray, type NetProjMeta } from './bossAI_duke_moonlord';
import { LightningBoltProj } from './LightningBoltProj';
import { upgradeToBitmap } from '../assets/SpriteAtlas';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

/** 原版 localAI[0..3](Enemy 只有 ai0-ai3,localAI 独立 → WeakMap 落盘) */
const localAI = new WeakMap<Enemy, number[]>();
export const lunarLocalAI = (e: Enemy): number[] => {
  let a = localAI.get(e);
  if (!a) { a = [0, 0, 0, 0]; localAI.set(e, a); }
  return a;
};
const TAU = Math.PI * 2;
const rnd = (n: number): number => Math.floor(Math.random() * n);
const rndRange = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 最短弧插值(原版 MathHelper 曲线角度语义) */
const angleLerp = (a: number, b: number, t: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + d * t;
};
/** 朝目标角按最大步长逼近(原版 AngleTowards) */
const angleTowards = (a: number, b: number, maxStep: number): number => {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
};
/** expert 门（Main.expertMode → world.isExpert 真难度；曾硬编码 false 恒关——
 *  飞蛾族三处专家档 :40110/:40367/:40420 在专家世界应生效） */
const expertMode = (game: GameHooks): boolean => game.world.isExpert;
/** 直积分(原版 noTileCollide 族;NPC.cs UpdateNPC :91400 段共享位移的穿墙分支) */
const fly = (e: Enemy): void => { e.x += e.vx; e.y += e.vy; };

const enemies = (game: GameHooks): Enemy[] => game.enemies() as Enemy[];
const countNpc = (game: GameHooks, id: number): number =>
  enemies(game).filter((n) => !n.dead && n.vanillaId === id).length;

/** 矩形区域含实心(Collision.SolidTiles 近似) */
function solidRect(game: GameHooks, x0: number, y0: number, x1: number, y1: number): boolean {
  const st = game.world.store;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
      if (st.isSolid(x, y)) return true;
    }
  }
  return false;
}
/** 身体完全埋入实心(Collision.SolidCollision 近似) */
function inSolidBody(game: GameHooks, e: Enemy): boolean {
  const st = game.world.store;
  for (let tx = Math.floor(e.x / TILE); tx <= Math.floor((e.x + e.w - 0.01) / TILE); tx++) {
    for (let ty = Math.floor(e.y / TILE); ty <= Math.floor((e.y + e.h - 0.01) / TILE); ty++) {
      if (tx < 0 || ty < 0 || tx >= st.w || ty >= st.h) return false;
      if (!st.isSolid(tx, ty)) return false;
    }
  }
  return true;
}
function solidTileAt(game: GameHooks, x: number, y: number): boolean {
  const st = game.world.store;
  return x >= 0 && y >= 0 && x < st.w && y < st.h && st.isSolid(x, y);
}

// ---------------------------------------------------------------------------
// 弹幕出口:452 PhantasmalEye / 454 PhantasmalSphere / 462 PhantasmalBolt 贴图
// Projectile_{452,454,462}.png 已按 601/602 先例补入 sprites/vanilla(Arrow 按 projId
// 懒加载真图),原 EnchantedBeam 173 代渲登记退役。454/452 的原版归巢弹道
// 已实装(2026-08-19 弹道批):452 走 Arrow phantasm 三段弹道(aiStyle 82,
// Projectile.cs:30119-30195)、454 走 phantomOrb 归巢(随行→列队→齐射,
// aiStyle 83,齐射指令见 Arrow.volleyPhantomOrbs)。
// ---------------------------------------------------------------------------
function shootL(
  game: GameHooks, x: number, y: number, vx: number, vy: number,
  dmg: number, projId: number, life = 300,
  arrowOpts?: Partial<import('./Arrow').ArrowOpts>,
): void {
  (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
    new Arrow(x, y, vx, vy, dmg, 0, projId, null, { grav: 0, life, pierce: 1, hostile: true, ...arrowOpts }),
    'projectiles');
}

// ---------------------------------------------------------------------------
// AI_081 月总游离眼 400(NPC.cs:38224-38667)
// 攻击表 MoonLordAttacksArray2(:6966-6985)十槽循环,ai[1] 为全局计时逐槽累计:
//   [悬停90, 矢90, 悬停90, 球135, 悬停90, 眼200, 悬停90, 光375, 悬停90, 球135]
// localAI[0]=瞳孔角 [1]=睁眼度 [2]=缩放;ai[2]=球的扫射编码角/眼的螺旋角。
// 注意:原版 ai[0]==-1 分支(:38284)在表驱动下不可达(表值仅 0..4),不移植。
// ---------------------------------------------------------------------------
const ML_EYE_ATTACKS: ReadonlyArray<readonly [number, number]> = [
  [0, 90], [1, 90], [0, 90], [2, 135], [0, 90], [3, 200], [0, 90], [4, 375], [0, 90], [2, 135],
];

export function moonLordFreeEyeAI(e: Enemy, game: GameHooks, player: Player | null) {
  // :38227 PlaySound(29,…,Next(100,101))——含头不含尾=恒 100 → Zombie_100,
  // case29 style100 ×0.25 由 FILE_CASE_VOL 自动乘(曾借 roar 轨 0.15,2026-08-18 对账修)
  if (rnd(420) === 0) game.playSfxWav?.('Zombie_100', 1, e.cx, e.cy);
  // ---- 核心锚定(:38231-38237):ai[3]=核心 id,亡→静默消散 ----
  const core = enemies(game).find((n) => n.id === e.ai3 && n.vanillaId === 398);
  if (!core || core.dead) { e.dead = true; return; }
  e.iframes = 2;                        // SetDefaults dontTakeDamage=true(:14090)

  // ---- 攻击表推进(:38240-38264) ----
  const x = lunarLocalAI(e);
  e.ai1 += 1;
  let slot = 0, consumed = 0, dur = 0;
  for (; slot < 10; slot++) {
    dur = ML_EYE_ATTACKS[slot][1];
    if (!(dur + consumed <= e.ai1)) break;
    consumed += dur;
  }
  if (slot === 10) { slot = 0; e.ai1 = 0; consumed = 0; dur = ML_EYE_ATTACKS[0][1]; }
  e.ai0 = ML_EYE_ATTACKS[slot][0];
  const t = e.ai1 - consumed;           // num1294 槽内已历时
  const pcx = player ? player.cx : e.cx, pcy = player ? player.cy : e.cy;

  if (e.ai0 === 0) {
    // ---- 悬停(:38309-38345):玩家上方 200px 伺服(24 速/30 步进) + 同族 150px 排斥 ----
    if (player) e.facing = e.seekDirX(player);
    const dx = pcx + (player ? player.vx : 0) * 20 - e.cx;
    const dy = pcy + (player ? player.vy : 0) * 20 - e.cy;
    x[0] = angleLerp(x[0], Math.atan2(dy, dx), 0.5);
    x[1] = Math.min(0.7, x[1] + 0.05);
    x[2] = lerp(x[2], 1, 0.2);
    let tx = pcx - e.cx, ty = pcy - 200 - e.cy;
    const d = Math.hypot(tx, ty) || 1;
    tx = (tx / d) * 24; ty = (ty / d) * 24;
    e.vx = (e.vx * 29 + tx) / 30;
    e.vy = (e.vy * 29 + ty) / 30;
    for (const n of enemies(game)) {                      // :38327-38345
      if (n !== e && !n.dead && n.vanillaId === 400
        && Math.hypot(n.cx - e.cx, n.cy - e.cy) < 150) {
        if (e.x < n.x) e.vx -= 0.25; else e.vx += 0.25;
        if (e.y < n.y) e.vy -= 0.25; else e.vy += 0.25;
      }
    }
  } else if (e.ai0 === 1) {
    // ---- 幻影矢 462(:38347-38395):减速瞄准,dur-14/-7/dur 三连(35 伤,速 8) ----
    if (t === 0 && player) e.facing = e.seekDirX(player);
    e.vx *= 0.95; e.vy *= 0.95;
    if (Math.hypot(e.vx, e.vy) < 1) { e.vx = 0; e.vy = 0; }
    const dx = pcx + (player ? player.vx : 0) * 20 - e.cx;
    const dy = pcy + (player ? player.vy : 0) * 20 - e.cy;
    x[0] = angleLerp(x[0], Math.atan2(dy, dx), 0.5);
    x[1] = Math.min(1, x[1] + 0.05);
    x[2] = lerp(x[2], t < 20 ? 1.1 : 0.4, 0.2);
    // :38389 PlaySound(4,…,6)=case4 死音库 → NPC_Killed_6(曾错 NPC_Hit_6,终审修)
    if (t === dur - 35) game.playSfxWav?.('NPC_Killed_6', 1, e.cx, e.cy);
    if (t === dur - 14 || t === dur - 7 || t === dur) {          // :38392-38398
      const ox = Math.cos(x[0]) * 30 * x[1], oy = Math.sin(x[0]) * 30 * x[1];
      const d = Math.hypot(dx, dy) || 1;
      shootL(game, e.cx + ox, e.cy + oy, (dx / d) * 8, (dy / d) * 8, 35, 462);
    }
  } else if (e.ai0 === 2) {
    // ---- 幻影球 454 六角螺旋(:38397-38491) ----
    if (t < 15) {                                            // :38398-38406 收瞳减速
      x[1] = Math.max(0, x[1] - 0.07);
      x[2] = lerp(x[2], 0.4, 0.2);
      e.vx *= 0.8; e.vy *= 0.8;
      if (Math.hypot(e.vx, e.vy) < 1) { e.vx = 0; e.vy = 0; }
    } else if (t < 75) {
      // :38408-38460 六顶点两两插值轨道(0→2→5→3→1→4→0),每 10t 沿轨道外发 454(40 伤,速 4)
      const k = Math.floor((t - 15) / 10);
      const PAIRS: ReadonlyArray<readonly [number, number]> = [[0, 2], [2, 5], [5, 3], [3, 1], [1, 4], [4, 0]];
      const [p0, p1] = PAIRS[k] ?? [0, 2];
      const hex = (i: number): [number, number] => {
        const a = -Math.PI / 2 + (i * TAU) / 6;             // Vector2.UnitY*-30 旋转 i·π/3
        return [Math.cos(a) * 30, Math.sin(a) * 30];
      };
      const f = (t - 15) / 10 - k;
      const [ax, ay] = hex(p0), [bx, by] = hex(p1);
      const px = lerp(ax, bx, f), py = lerp(ay, by, f);
      x[0] = Math.atan2(py, px);
      x[1] = lerp(x[1], Math.hypot(px, py) / 30, 0.5);
      game.spawnParticles(e.cx + px, e.cy + py, '#C040D0', 2, 0.8, { life: 20 });  // :38455-38459
      if ((t - 15) % 10 === 0) {
        const d = Math.hypot(px, py);
        const ux = d > 0.001 ? px / d : 0, uy = d > 0.001 ? py / d : -1;
        // 出生 ai0=30(:38452-38457 NewProjectile 第 9 参)——跳过随行直接列队;
        // ai[1]=whoAmI → ownerId(齐射指令圈定)
        shootL(game, e.cx + px, e.cy + py, ux * 4, uy * 4, 40, 454, 600,
          { phantomOrb: { ownerId: e.id, ai0: 30 } });
      }
    } else if (t < 105) {
      // :38462-38485 瞄准升空(75t 起跳 vy=-7 并给己方 454 叠加同一速度把它们带起)
      x[0] = angleLerp(x[0], e.ai2 - Math.PI / 2, 0.2);
      x[2] = lerp(x[2], 0.75, 0.2);
      if (t === 75) {
        e.vx = 0; e.vy = -7;
        nudgePhantomOrbs(game, e.id, 0, -7);                 // :38475-38483
      }
      e.vy *= 0.96;
      if (player) e.ai2 = Math.atan2(pcy - e.cy, pcx - e.cx) + Math.PI / 2;
      e.spin = angleTowards(e.spin, e.ai2, Math.PI / 30);
    } else if (t < 120) {
      // :38487-38505 发射:沿瞄准向 24 速冲出;己方全部 454 置 -1 以瞄准向
      // (ai2−π/2)·12 同矢量齐射
      game.playSfxWav?.('Zombie_102', 1, e.cx, e.cy);        // :38487 PlaySound(29,…,102)——case29 style102 ×0.4 自动档(曾借 roar 0.4 恰同值)
      e.vx = Math.cos(e.ai2 - Math.PI / 2) * 24;
      e.vy = Math.sin(e.ai2 - Math.PI / 2) * 24;
      if (t === 105) {
        volleyPhantomOrbs(game, e.id,
          Math.cos(e.ai2 - Math.PI / 2) * 12, Math.sin(e.ai2 - Math.PI / 2) * 12);   // :38494-38505
      }
    } else {
      e.vx *= 0.92; e.vy *= 0.92;                            // :38507-38510
      e.spin = angleLerp(e.spin, 0, 0.2);
    }
  } else if (e.ai0 === 3) {
    // ---- 幻影眼 452 洒射(:38512-38583) ----
    if (t < 15) {
      x[1] = Math.max(0, x[1] - 0.07);
      x[2] = lerp(x[2], 0.4, 0.2);
      e.vx *= 0.9; e.vy *= 0.9;
      if (Math.hypot(e.vx, e.vy) < 1) { e.vx = 0; e.vy = 0; }
    } else if (t < 45) {
      // :38530-38538 瞳孔摆正
      x[0] = 0;
      x[1] = Math.sin((t - 15) * TAU / 15) * 0.5;
      if (x[1] < 0) x[0] = Math.PI;
    } else if (t < 185) {
      // :38540-38568 螺旋外扩洒射(8→20 速,每 10t 一发 452,35 伤,速 8)
      if (t === 45) e.ai2 = (Math.random() < 0.5 ? 1 : -1) * TAU / 40;
      if ((t - 45) % 40 === 0) e.ai2 *= 0.95;
      x[0] += e.ai2;
      x[1] = Math.min(1, x[1] + 0.05);
      const ox = Math.cos(x[0]) * 30 * x[1], oy = Math.sin(x[0]) * 30 * x[1];
      const spd = lerp(8, 20, (t - 45) / 140);
      const d = Math.hypot(ox, oy) || 1;
      e.vx = (ox / d) * spd; e.vy = (oy / d) * spd;
      e.spin = angleLerp(e.spin, Math.atan2(e.vy, e.vx) + Math.PI / 2, 0.2);
      if ((t - 45) % 10 === 0) {
        // :38557-38563 ai[1] 弧线弯转角 = (2π·rand−π)/30 + π/180·ai[2]
        // (ai[2]=螺旋角速度 e.ai2)——452 三段弹道(45/90t 弧线上升→14 速追踪)
        shootL(game, e.cx + (ox / d) * 12, e.cy + (oy / d) * 12,
          (ox / d) * 8, (oy / d) * 8, 35, 452, 600,
          { phantasm: { spin: (TAU * Math.random() - Math.PI) / 30 + (Math.PI / 180) * e.ai2 } });
      }
    } else {
      // :38570-38583 收势
      e.vx *= 0.88; e.vy *= 0.88;
      e.spin = angleLerp(e.spin, 0, 0.2);
      x[1] = Math.max(0, x[1] - 0.07);
      x[2] = lerp(x[2], 1, 0.2);
    }
  } else if (e.ai0 === 4) {
    // ---- 死亡之光 455(:38585-38665):180t 吸能 → MLDeathray('core' 档,50 伤×2) ----
    if (t === 0 && player) e.facing = e.seekDirX(player);
    if (t < 180) {
      x[2] = lerp(x[2], 1, 0.2);
      x[1] = Math.max(0, x[1] - 0.05);
      e.vx *= 0.95; e.vy *= 0.95;
      if (Math.hypot(e.vx, e.vy) < 1) { e.vx = 0; e.vy = 0; }
      if (t >= 60) {                                          // :38616-38632 吸能粒子
        game.spawnParticles(e.cx + (Math.random() - 0.5) * 30, e.cy + (Math.random() - 0.5) * 30,
          '#B040D0', t >= 120 ? 2 : 1, 1.2, { life: 24 });
      }
    } else if (t < dur - 15) {
      if (t === 180 && player) {
        // :38634-38650 起角 = 朝玩家 ∓ 60°,角速度 = ±2π/540(MLDeathray 'core' 档 1:1)
        const dx = pcx - e.cx, dy = pcy - e.cy;
        const dd = Math.hypot(dx, dy) || 1;
        const n = dx / dd < 0 ? 1 : -1;                       // num1318
        const ang = Math.atan2(dy, dx) - n * TAU / 6;
        (game as unknown as { entities: { add: (en: unknown, b: string) => void } }).entities.add(
          new MLDeathray(e, 'core', ang, n * TAU / 540, 50 * 2), 'projectiles');
        e.ai2 = (ang + Math.PI * 3) * n;                      // :38649 扫射编码角
      }
      x[1] = Math.min(1, x[1] + 0.05);
      // :38656-38663 编码角逐 t 解码步进(瞳角跟踪扫射束)
      const s = e.ai2 >= 0 ? 1 : -1;
      const a = Math.abs(e.ai2) - Math.PI * 3 + (s * TAU) / 540;
      x[0] = a;
      e.ai2 = (a + Math.PI * 3) * s;
    } else {
      x[1] = Math.max(0, x[1] - 0.07);                        // :38664-38666
    }
  }
  // ---- 渲染镜像(Main.cs case 400 :24492-24504,Renderer.drawMoonLordFreeEye 直读)----
  // 瞳孔角/睁眼度/瞳孔缩放 → lai0/lai1/lai2(原版 localAI[0..2]:瞳孔椭圆
  // (30,30)×localAI[1]、瞳孔整体 scale localAI[2](0.4-1.15 脉动));本体 rotation
  // 由上方攻击态写 e.spin(原版仅攻击 2/3 写 npc.rotation,余态保值)。
  e.lai0 = x[0];
  e.lai1 = x[1];
  e.lai2 = x[2];
  fly(e);
}

// ---------------------------------------------------------------------------
// AI_082 月总水蛭块 401(NPC.cs:38668-38792)
// ai[0]=头 396 id+1 / ai[1]=源弹索引(本仓 Arrow 无索引,以出生点代源弹 456 弹着点);
// ai[2] 90t 插值 头额(0,+216);到位 1000 点治疗按 头→核心→手0→手1 亏血序回灌后消散。
// ---------------------------------------------------------------------------
export function moonLeechAI(e: Enemy, game: GameHooks, _player: Player | null) {
  const x = lunarLocalAI(e);
  if (!e.bInit) {
    e.bInit = true;
    e.ai2 = 0;
    x[0] = e.cx; x[1] = e.cy;    // 源弹 456 弹着点(=玩家处)近似:出生点即弹着点(:37832)
  }
  // ---- 头锚定(:38676-38684) ----
  const head = enemies(game).find((n) => n.id === Math.floor(e.ai0) - 1 && n.vanillaId === 396);
  if (!head || head.dead) { e.dead = true; return; }
  e.ai2 += 1;
  const LEECH_T = 90;                                       // num1321
  if (e.ai2 >= LEECH_T) {
    // ---- 治疗回灌(:38689-38772):池 1000,按 头→核心→手0→手1 亏血序 ----
    const core = enemies(game).find((n) => n.id === head.ai3 && n.vanillaId === 398);
    const hands = enemies(game).filter((n) => !n.dead && n.vanillaId === 397 && n.ai3 === head.ai3);
    const hand0 = hands.find((n) => n.ai2 === 0);
    const hand1 = hands.find((n) => n.ai2 === 1);
    let pool = 1000;                                        // num1329
    for (const tgt of [head, core, hand0, hand1]) {
      if (!tgt || tgt.dead || pool <= 0) continue;
      const deficit = tgt.maxHp - tgt.hp;
      if (deficit <= 0) continue;
      const amt = Math.min(pool, deficit);                  // num1335 = pool+min(deficit-pool,0)
      tgt.hp += amt;
      pool -= amt;
      game.spawnParticles(tgt.cx, tgt.cy, '#5AE86A',
        Math.min(8, 2 + Math.floor(amt / 100)), 1.6, { life: 30 });   // HealEffect 近似
    }
    e.dead = true;                                          // :38770-38772 静默消散
    return;
  }
  // ---- 插值飞行(:38775-38791):出生点 → 头额 ----
  e.vx = 0; e.vy = 0;
  const k = e.ai2 / LEECH_T;
  e.x = lerp(x[0], head.cx, k) - e.w / 2;
  e.y = lerp(x[1], head.cy + 216, k) - e.h / 2;
  game.spawnParticles(e.cx, e.cy - e.h / 2, '#B040D0', 3, 0.7, { life: 20 });   // 紫尘双环
}

// ---------------------------------------------------------------------------
// AI_083a 神秘石碑 437(NPC.cs:38795-38920 + CultistRitual.cs CheckFloor)
// 落地校验(CheckFloor:±6/±10 格四点 3 格净空)→ 召 4 教徒;信徒受击→弓手激活;
// 四教徒全灭 → 侧面召 439 + 300t 仪式倒计时(120t 起每 10t 仪式粒子)消散。
// 槽位:弓手 id+1 存 ai[0..1](原版同),信徒 id+1 存 localAI[1..2];ai[0]=-1 标记
// 邪教徒已召(此后 ai[3] 为倒计时)。
// ---------------------------------------------------------------------------
/** CultistRitual.CheckFloor(CultistRitual.cs:88-124 1:1):i∈{-5,-3,3,5} → x=tileX+i*2,
 *  y 自 tileY-5 向下扫至 +11,取首个"实心/平台 且上方 3 格净空"的点;不足 4 点 → null */
export function ritualCheckFloor(game: GameHooks, cx: number, cy: number): Array<{ x: number; y: number }> | null {
  const pts: Array<{ x: number; y: number }> = [];
  const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
  for (const i of [-5, -3, 3, 5]) {
    const x = tx + i * 2;
    for (let j = -5; j < 12; j++) {
      const y = ty + j;
      if (y < 1 || y >= game.world.store.h - 1) break;
      const floor = solidTileAt(game, x, y) || game.world.store.isPlatform(x, y);
      if (!floor) continue;
      // 净空:本柱 3 格全空,或(本柱空 且 左右柱上两行空)——原版双条件或语义
      const clearMid = !solidRect(game, x - 1, x + 1, y - 3, y - 1);
      const clearSide = !solidRect(game, x, x, y - 3, y - 1)
        && !solidRect(game, x + 1, x + 1, y - 3, y - 2)
        && !solidRect(game, x - 1, x - 1, y - 3, y - 2);
      if (clearMid || clearSide) { pts.push({ x, y }); break; }
    }
  }
  return pts.length === 4 ? pts : null;
}

export function cultistTabletAI(e: Enemy, game: GameHooks, _player: Player | null) {
  const x = lunarLocalAI(e);
  e.iframes = 2;                       // SetDefaults dontTakeDamage=true(:14115 段)
  e.lightRGB = [0.8, 0.75, 0.55];      // :38957 Lighting.AddLight
  if (!e.bInit) {
    // ---- 落地校验 + 召四教徒(:38798-38824) ----
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    const pts = ritualCheckFloor(game, e.cx, e.cy);
    if (!pts) { e.dead = true; return; }               // 站不住 → 静默消散
    let arcN = 0, devN = 0;
    for (let k = 0; k < 4; k++) {
      const isDevotee = k === 1 || k === 2;            // 内侧两点信徒,外侧两点弓手
      const child = spawnPart(game, e, isDevotee ? 438 : 379);
      if (!child) continue;
      child.x = pts[k].x * TILE + 8 - child.w / 2;
      child.y = pts[k].y * TILE - child.h;             // 站上落点面(原版顶锚 y-48)
      child.ai3 = -(e.id + 1);                          // ai[3]=-(碑id+1) 待机锚
      child.bInit = true;
      if (isDevotee) x[1 + devN++] = child.id + 1;      // localAI[1..2]=信徒 id+1
      else if (arcN === 0) { e.ai0 = child.id + 1; arcN = 1; }   // ai[0]=弓手0 id+1
      else { e.ai1 = child.id + 1; arcN = 2; }                   // ai[1]=弓手1 id+1
    }
    if (arcN < 2 || devN < 2) { e.dead = true; return; }   // 生成不足 → 消散
    return;
  }
  // ---- 信徒受击 → 弓手激活(:38826-38839 localAI[0]==1) ----
  if (x[0] === 1) {
    x[0] = 2;
    for (let k = 0; k < 2; k++) {
      const dev = enemies(game).find((n) => n.id === x[k + 1] - 1 && n.vanillaId === 438);
      if (dev) dev.ai1 = 1;   // :38831 信徒 ai[1]=1(1.4.5.6 无消费方,存档语义保留)
      const arcId = k === 0 ? e.ai0 : e.ai1;
      const arc = enemies(game).find((n) => n.id === Math.floor(arcId) - 1 && n.vanillaId === 379);
      if (arc) arc.ai3 = 0;   // :38834 弓手解除待机(零伤恢复见 cultistArcherWake)
    }
  }
  // ---- 四教徒全灭 → 召 439(:38841-38879) ----
  if (e.ai0 !== -1) {
    const gone = [0, 1].every((k) => {
      const dev = enemies(game).find((n) => n.id === x[k + 1] - 1);
      const arc = enemies(game).find((n) => n.id === Math.floor(k === 0 ? e.ai0 : e.ai1) - 1);
      return (!dev || dev.dead || dev.vanillaId !== 438)
        && (!arc || arc.dead || arc.vanillaId !== 379);
    });
    if (gone) {
      // :38853-38868 侧面 11 格找落地列(±随机向),自碑心向下扫首个实心面
      const side = Math.random() < 0.5 ? 1 : -1;
      const tx = Math.floor(e.cx / TILE) + 11 * side;
      let ty = Math.floor(e.cy / TILE);
      for (let j = -5; j < 12; j++) {
        const y = Math.floor(e.cy / TILE) + j;
        if (solidTileAt(game, tx, y) && !solidRect(game, tx - 1, tx + 1, y - 3, y - 1)) { ty = y; break; }
        if (j === 11) ty = y;
      }
      const cultist = spawnPart(game, e, 439);
      // TabletDestroyed(delay=43200 重置)由 Game 侧 ai0==-1 边沿捕获记账
      // （_cultistTabletDone WeakSet 去重）——勿在此再调,避免双路径
      if (cultist) {
        cultist.x = tx * TILE + 10 - cultist.w / 2;
        cultist.y = ty * TILE - cultist.h;              // 原版顶锚 y=tileY*16-2,本仓落底对齐
        cultist.facing = Math.sign(e.cx - (tx * TILE + 10)) || 1;
        // ★自然石碑链 439 占 boss 槽(F6/召唤链同款)——曾缺:杀教徒后 downed_439/
        // 击败公告/TriggerLunarApocalypse 四塔/月总整链不发=主进度断链(终审 P0 修)。
        // bInit 留 false:localAI[0]==0 出生 420t 渐显+无敌窗+Zombie_89(:65091-65131,
        // 曾 bInit=true 跳过=无入场演出,终审修)
        (game as unknown as { boss?: unknown }).boss = cultist;
        e.ai2 = cultist.id;                             // :38875 ai[2]=邪教徒 id
      }
      e.ai0 = -1; e.ai1 = 0; e.ai3 = 0;
      // CultistRitual.TabletDestroyed()(复活延迟账)——事件延迟系统未引入,略
    }
  }
  // ---- 仪式倒计时(:38881-38954):300t 满 → 爆散;120t 起每 10t 一枚 526(粒子代) ----
  if (e.ai0 === -1) {
    e.ai3 += 1;
    if (e.ai3 > 300) {
      e.dead = true;
      for (let k = 0; k < 6; k++) {                     // :38893-38903 六枚直飞
        game.spawnParticles(e.cx, e.cy, '#B080FF', 3, 3, { life: 30 });
      }
      for (let k = 0; k < 20; k++) {                    // :38905-38919 二十枚上抛(1/2 保留)
        if (Math.random() < 0.5) continue;
        game.spawnParticles(e.cx, e.cy, '#B080FF', 3, 3, { life: 30 });
      }
    } else if (e.ai3 % 10 === 1 && e.ai3 > 120) {       // :38921-38931
      game.spawnParticles(e.cx, e.cy, '#B080FF', 2, 2.4, { life: 34 });
    }
  }
  // 石碑静止(noGravity,noTileCollide;SetDefaults :14115 段)
}

// ---------------------------------------------------------------------------
// AI_083b 拜月忠实信徒 438(NPC.cs:38926-38954)
// 站立面碑:横向摩擦 ±0.1 清零、朝碑翻转清 vx;受击 → 碑 localAI[0]=1(弓手激活链);
// ai[0] 300t 循环(站立摆动帧驱动)。重力/落地走共享块(NPC.cs UpdateNPC :91400 段)。
// ---------------------------------------------------------------------------
export function lunaticDevoteeAI(e: Enemy, game: GameHooks, _player: Player | null) {
  e.vx *= 0.93;
  if (e.vx > -0.1 && e.vx < 0.1) e.vx = 0;
  const owner = enemies(game).find((n) => n.id === -e.ai3 - 1 && n.vanillaId === 437);
  if (!owner || owner.dead) { e.dead = true; return; }   // :38934-38938 碑亡→消散
  const dir = Math.sign(owner.cx - e.cx);
  if (dir !== 0 && dir !== e.facing) { e.vx = 0; e.facing = dir; }   // :38940-38947
  if (e.justHit) {                                       // :38949-38952 → 碑 localAI[0]=1
    const ox = lunarLocalAI(owner);
    if (ox[0] === 0) ox[0] = 1;
  }
  if (e.ai0 < 0 || e.ai0 >= 300) e.ai0 = 0;              // 原版 ai[0] 出生 0
  e.ai0 += 1;
  if (e.ai0 >= 300) e.ai0 = 0;                           // :38953-38956
  e.vy = Math.min(e.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
  moveAndCollide(e, game.world, e.vx, e.vy);
}

// ---------------------------------------------------------------------------
// AI_003 待机尾段:拜月教弓手 379/380(NPC.cs:56575-56610)
// ai[3]<0 仪式待机:零接触伤、静立面碑(同信徒摩擦/翻转)、ai[0] 卡 1000..1300 站立帧
// 循环;受击 → 碑 localAI[0]=1。碑置 ai[3]=0 后:ai[0]≥1000 清零 + damage 恢复
// (:56602-56609),回 AI_003 战士核(射击参数见 Enemy.RANGED_TABLE 379/380 条目)。
// ---------------------------------------------------------------------------
export function cultistArcherStandbyAI(e: Enemy, game: GameHooks) {
  e.def.damage = 0;                                      // :56581 damage=0(待机零伤)
  const owner = enemies(game).find((n) => n.id === -e.ai3 - 1 && n.vanillaId === 437);
  if (!owner || owner.dead) { e.dead = true; return; }
  e.vx *= 0.93;
  if (e.vx > -0.1 && e.vx < 0.1) e.vx = 0;
  const dir = Math.sign(owner.cx - e.cx);
  if (dir !== 0 && dir !== e.facing) { e.vx = 0; e.facing = dir; }
  if (e.justHit) {                                       // :56593-56597 → 碑 localAI[0]=1
    const ox = lunarLocalAI(owner);
    if (ox[0] === 0) ox[0] = 1;
  }
  if (e.ai0 < 1000) e.ai0 = 1000;                        // :56599-56601 站立帧段
  e.ai0 += 1;
  if (e.ai0 >= 1300) e.ai0 = 1000;
  e.vy = Math.min(e.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
  moveAndCollide(e, game.world, e.vx, e.vy);
}

/** 弓手激活复位(:56602-56609):ai[0]≥1000 清零、damage 恢复 defDamage(待机段置 0) */
export function cultistArcherWake(e: Enemy) {
  if (e.ai0 >= 1000) e.ai0 = 0;
  e.def.damage = e.vanilla?.damage ?? e.def.damage;
}

// ---------------------------------------------------------------------------
// AI_086 暗焰幻影 472 / 远古幻影 521(NPC.cs:39261-39519)
// 穿墙飞行族:0 定向 → 1 横掠(越玩家 660/500px 掉头)→ 2 竖摆 → 3 回掠 循环;
// 521 参数强化(0.7/14/500/6/3)+ 228 号紫雾拖尾;出生 120t 显形(Item8 音+尘爆)。
// ---------------------------------------------------------------------------
export function phantomAI(e: Enemy, game: GameHooks, player: Player | null) {
  const x = lunarLocalAI(e);
  const big = e.vanillaId === 521;
  if (e.spawnAlpha > 0) e.spawnAlpha = Math.max(0, e.spawnAlpha - 30);   // :39265-39271
  // ---- 同族 50px 排斥(:39277-39299) ----
  for (const n of enemies(game)) {
    if (n === e || n.dead || n.vanillaId !== e.vanillaId) continue;
    let dx = n.cx - e.cx, dy = n.cy - e.cy;
    const d = Math.hypot(dx, dy);
    if (d >= 50) continue;
    if (d > 0.001) { dx /= d; dy /= d; } else { dx = n.id > e.id ? 1 : -1; dy = 0; }
    e.vx -= dx * 0.4; e.vy -= dy * 0.4;
    n.vx += dx * 0.4; n.vy += dy * 0.4;
  }
  // ---- 出生显形(:39302-39335 472 / :39337-39360 521) ----
  if (x[3] < 120) {
    if (x[3] === 0) {
      game.playSfxFiles?.(['Item_8'], 0.5, e.cx, e.cy); // :39307 SoundID.Item8（原 roar 为错键）
      if (player) e.facing = e.seekDirX(player);
      e.vx += e.facing * 2;
      if (!big) game.spawnParticles(e.cx, e.cy - 18, '#7A4BD0', 20, 4, { life: 30 });
    }
    x[3] += 1;
    if (big) game.spawnParticles(e.cx, e.cy, '#5A2BA0', 2, 1.5, { life: 20 });
  }
  // ---- 状态机(:39362-39509);原版 ai[0] 出生 0,Enemy 哨兵 -1120 归一 ----
  if (e.ai0 < 0 || e.ai0 > 3) e.ai0 = 0;
  if (e.ai0 === 0) {
    if (player) e.facing = e.seekDirX(player);
    e.ai0 = 1; e.ai1 = e.facing;
  } else if (e.ai0 === 1) {
    // 横掠:加速 0.3/0.7 封顶 7/14,纵轴 4/6 伺服;越玩家 660/500px → 2
    const acc = big ? 0.7 : 0.3, max = big ? 14 : 7;
    const yClamp = big ? 6 : 4, range = big ? 500 : 660, yStep = big ? 3 : 4;
    if (player) e.facing = e.seekDirX(player);
    e.vx = clamp(e.vx + e.ai1 * acc, -max, max);
    let dy = player ? player.cy - e.cy : 0;
    let step = yStep;
    if (Math.abs(dy) > yClamp) { step = 15; dy = clamp(dy, -yClamp, yClamp); }
    e.vy = (e.vy * (step - 1) + dy) / step;
    const dpx = player ? player.cx - e.cx : 0;
    if ((e.ai1 > 0 && dpx < -range) || (e.ai1 < 0 && dpx > range)) {
      e.ai0 = 2;
      e.ai1 = player && e.cy + 20 > player.cy ? -1 : 1;  // :39400-39404
    }
  } else if (e.ai0 === 2) {
    // 竖摆:vy += ai[1]*0.4/0.3,超速 5/7 ×0.95/0.9;|vx|<1 → 3
    const acc = big ? 0.3 : 0.4, cap = big ? 7 : 5, damp = big ? 0.9 : 0.95;
    e.vy += e.ai1 * acc;
    if (Math.hypot(e.vx, e.vy) > cap) { e.vx *= damp; e.vy *= damp; }
    if (e.vx > -1 && e.vx < 1) {
      if (player) e.facing = e.seekDirX(player);
      e.ai0 = 3; e.ai1 = e.facing;
    }
  } else if (e.ai0 === 3) {
    // 回掠:vx += ai[1]*0.4/0.6,纵轴追玩家 ±0.2/0.3,超速 ×0.95/0.9;|vy|<1 → 0
    const acc = big ? 0.6 : 0.4, vyAcc = big ? 0.3 : 0.2;
    const cap = big ? 7 : 5, damp = big ? 0.9 : 0.95;
    e.vx += e.ai1 * acc;
    if (player) e.vy += e.cy > player.cy ? -vyAcc : vyAcc;
    if (Math.hypot(e.vx, e.vy) > cap) { e.vx *= damp; e.vy *= damp; }
    if (e.vy > -1 && e.vy < 1) {
      if (player) e.facing = e.seekDirX(player);
      e.ai0 = 0; e.ai1 = e.facing;
    }
  }
  if (big) game.spawnParticles(e.cx, e.cy, '#5A2BA0', 1, 0.6, { life: 16 });   // :39511-39518
  fly(e);
}

// ---------------------------------------------------------------------------
// AI_087 珍稀四宝箱怪 473-476(NPC.cs:39520-39875)
// 0 伪装箱(唤醒:有速度/受击/玩家 80px)→ 1 蓄力 36t → 2 贴地跳扑主循环;
// 2 每 210t 随机 3 蓄能无敌 180t(expert 反弹投射物,不可达)/4 飞天俯冲/6 三连扑;
// 跳扑参数按血量:等待 15+30×HP比、横速 3+4×(1-HP比)、跳力 4(+2 无视线),
// 每 3 跳(ai[3])双倍跳力/半横速;7 玩家死→零伤满血渐隐;8 十周年炮连发不可达。
// ---------------------------------------------------------------------------
export function bigMimicAI(e: Enemy, game: GameHooks, player: Player | null) {
  if (e.ai0 < 0 || e.ai0 > 8) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  // noGravity 运行时位（:39525 起始 false；4/4.1 俯冲分支/5 空中态置 true——
  // 4.1 仅"未过玩家 Y 且 ai[2]==0 的真俯冲段"(:39724-39730)，过顶回落段 false）。
  // StrikeNPC :82217 受击档（def.flying=false 覆盖不到，2026-08-17 补）
  e.noGravity = false;
  // knockBackResist 运行时位：4/4.1/5 三态恒 0（:39662/:39710/:39756），其余态回落数据档
  e.kbResistOverride = (e.ai0 === 4 || e.ai0 === 4.1 || e.ai0 === 5) ? 0 : null;
  const p = player && !player.dead ? player : null;
  const los = !!p && losClear(game, e.cx, e.cy, p.cx, p.cy);
  // ---- 玩家全灭 → 7 隐身僵坐(:39526-39534) ----
  if (e.ai0 !== 7 && !p) { e.ai0 = 7; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  const grounded = () => {
    e.vy = Math.min(e.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(e, game.world, e.vx, e.vy);
  };

  if (e.ai0 === 0) {
    // ---- 伪装(:39536-39547) ----
    if (p) e.facing = e.seekDirX(p);
    const near = !!p && Math.hypot(p.cx - e.cx, p.cy - e.cy) < 80;
    if (e.vx !== 0 || e.vy > 100 || e.justHit || near) { e.ai0 = 1; e.ai1 = 0; }
    grounded();
  } else if (e.ai0 === 1) {
    // ---- 蓄力 36t(:39549-39557) ----
    e.ai1 += 1;
    if (e.ai1 > 36) { e.ai0 = 2; e.ai1 = 0; }
    grounded();
  } else if (e.ai0 === 2) {
    // ---- 贴地跳扑主循环(:39559-39621) ----
    if (p && Math.hypot(p.cx - e.cx, p.cy - e.cy) > 600) { e.ai0 = 5; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    if (e.onGround && e.vy === 0) {
      if (p) e.facing = e.seekDirX(p);
      e.vx *= 0.85;
      e.ai1 += 1;
      const hpFrac = e.hp / e.maxHp;
      const wait = 15 + 30 * hpFrac;                       // num1409
      let jumpV = 3 + 4 * (1 - hpFrac);                    // num1410
      let jumpPow = los ? 4 : 6;                           // num1411(+2 无视线)
      if (e.ai1 > wait) {
        e.ai3 += 1;
        if (e.ai3 >= 3) { e.ai3 = 0; jumpPow *= 2; jumpV /= 2; }   // :39583-39588 每 3 跳大跳
        e.ai1 = 0;
        e.vy -= jumpPow;
        e.vx = jumpV * e.facing;
      }
    } else {
      e.vx *= 0.99;                                        // :39603-39610 空中保底 ±1
      if (e.facing === -1 && e.vx > -1) e.vx = -1;
      else if (e.facing === 1 && e.vx < 1) e.vx = 1;
    }
    e.ai2 += 1;                                            // :39612-39620 210t 随机换招
    if (e.ai2 > 210 && e.onGround && e.vy === 0) {
      const pick = rnd(3);
      e.ai0 = pick === 0 ? 3 : pick === 1 ? 4 : 6;
      if (pick === 1) e.vy = -8;                           // 4 号态起跳穿墙
      e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    }
    grounded();
  } else if (e.ai0 === 3) {
    // ---- 蓄能无敌 180t(:39623-39637;expert ReflectProjectiles 不可达) ----
    e.vx *= 0.85;
    e.iframes = 2;
    e.ai1 += 1;
    if (e.ai1 >= 180) { e.ai0 = 2; e.ai1 = 0; }
    grounded();
  } else if (e.ai0 === 4) {
    // ---- 飞天(:39639-39677):悬玩家上方 350px → ai[2]=1 短瞄 6t → 4.1 俯冲 ----
    e.noGravity = true;                                    // :39661 整态置位
    if (p) e.facing = e.vx < 0 ? -1 : 1;
    const dx = p ? p.cx - e.cx : e.facing * 100;
    const dy = (p ? p.cy : e.cy) - 350 - e.cy;
    if (e.ai2 === 1) {
      // :39676-39690 短瞄段【重算】目标 = 玩家中心（不带 -350 抬升——曾复用上方
      // 偏移向量，短瞄/俯冲全打向玩家头顶 350px 处）
      e.ai1 += 1;
      const adx = p ? p.cx - e.cx : dx, ady = p ? p.cy - e.cy : dy;
      const d = Math.hypot(adx, ady) || 1;
      const tx = (adx / d) * 8, ty = (ady / d) * 8;
      e.vx = (e.vx * 4 + tx) / 5; e.vy = (e.vy * 4 + ty) / 5;
      if (e.ai1 > 6) { e.ai0 = 4.1; e.ai1 = 0; e.ai2 = 0; e.vx = tx; e.vy = ty; }
    } else if (p && Math.abs(e.cx - p.cx) < 40 && e.cy < p.cy - 300) {
      e.ai1 = 0; e.ai2 = 1;
    } else {
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (e.vx * 5 + (dx / d) * 12) / 6;
      e.vy = (e.vy * 5 + (dy / d) * 12) / 6;
    }
    fly(e);
  } else if (e.ai0 === 4.1) {
    // ---- 俯冲下坠(:39679-39709):过玩家 Y 或弹起 → 10t 后回 2(埋块则 5) ----
    if (e.ai2 === 0 && p && losClear(game, e.cx, e.cy, p.cx, p.cy) && !inSolidBody(game, e)) e.ai2 = 1;
    if (!p || e.y + e.h >= p.y || e.vy <= 0) {
      e.ai1 += 1;
      if (e.ai1 > 10) {
        e.ai0 = inSolidBody(game, e) ? 5 : 2;
        e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
      }
    } else if (e.ai2 === 0) {
      e.noGravity = true;                                 // :39731-39735 真俯冲段（穿墙）
    }
    e.vy = Math.min(e.vy + 0.2, 16);                      // :39737-39741 重力在分支后恒施
    // 位移：真俯冲段（noGravity）穿墙直积分；其余（含 ai2==1 下落段）走碰撞——
    // 曾漏 ai2==1 且未过玩家 Y 的分支积分，该态整帧冻结 = 空中僵死
    if (e.noGravity) fly(e);
    else moveAndCollide(e, game.world, e.vx, e.vy);
  } else if (e.ai0 === 5) {
    // ---- 穿墙归位(:39711-39734):追玩家,近 200px 且不埋块 → 回 2 ----
    e.noGravity = true;                                    // :39743 整态置位
    if (p) e.facing = e.vx > 0 ? 1 : -1;
    let dx = p ? p.cx - e.cx : 0, dy = (p ? p.cy : e.cy) - 4 - e.cy;
    if (p && Math.hypot(dx, dy) < 200 && !inSolidBody(game, e)) {
      e.ai0 = 2; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    }
    const d = Math.hypot(dx, dy);
    if (d > 10) { dx = (dx / d) * 10; dy = (dy / d) * 10; }
    e.vx = (e.vx * 4 + dx) / 5; e.vy = (e.vy * 4 + dy) / 5;
    fly(e);
  } else if (e.ai0 === 6) {
    // ---- 三连扑(:39736-39795):每 5t 起跳(玩家越高/无视线 跳力越高),vx=12×dir ----
    if (e.onGround && e.vy === 0) {
      if (p) e.facing = e.seekDirX(p);
      e.vx *= 0.8;
      e.ai1 += 1;
      if (e.ai1 > 5) {
        e.ai1 = 0;
        e.vy -= 4;
        if (p && p.y + p.h < e.cy) e.vy -= 1.25;
        if (p && p.y + p.h < e.cy - 40) e.vy -= 1.5;
        if (p && p.y + p.h < e.cy - 80) e.vy -= 1.75;
        if (p && p.y + p.h < e.cy - 120) e.vy -= 2;
        if (p && p.y + p.h < e.cy - 160) e.vy -= 2.25;
        if (p && p.y + p.h < e.cy - 200) e.vy -= 2.5;
        if (p && !losClear(game, e.cx, e.cy, p.cx, p.cy)) e.vy -= 2;
        e.vx = 12 * e.facing;
        e.ai2 += 1;
      }
    } else {
      e.vx *= 0.98;                                       // :39780-39788 空中保底 ±8
      if (e.facing === -1 && e.vx > -8) e.vx = -8;
      else if (e.facing === 1 && e.vx < 8) e.vx = 8;
    }
    if (e.ai2 >= 3 && e.onGround && e.vy === 0) {         // :39791-39799
      e.ai0 = 2; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    }
    grounded();
  } else if (e.ai0 === 7) {
    // ---- 玩家死隐身僵坐(:39801-39814):零伤/满血/渐隐,离屏由 despawn 清 ----
    e.def.damage = 0;
    e.hp = e.maxHp;
    e.spawnAlpha = Math.min(255, e.spawnAlpha + 7);
    e.vx *= 0.98;
    grounded();
  } else if (e.ai0 === 8) {
    // ---- 十周年世界炮连发(:39816-39835,getGoodWorld 不可达) ----
    e.vx *= 0.85;
    e.ai1 += 1;
    if (e.ai1 >= 180) { e.ai0 = 2; e.ai1 = 0; }
    grounded();
  }
}

// ---------------------------------------------------------------------------
// AI_088 飞蛾魔 477(NPC.cs:39876-40406)——日食限定
// -1 无日食/玩家失效爬升无敌 / 0 悬顶 200px 伺服(180t 轮换,受击加速) /
// 1 穿墙追击 / 2 近距缠斗(×0.5 伤,LOS 断→0) / 3+3.1+3.2 侧掠冲刺(×1.3 伤) /
// 4+4.1+4.2 扫地产卵 478(478+479<7 时;专家孵化 70→52t,不可达)
// ---------------------------------------------------------------------------
export function mothronAI(e: Enemy, game: GameHooks, player: Player | null) {
  const p = player && !player.dead ? player : null;
  const baseDmg = e.vanilla?.damage ?? e.def.damage;
  e.def.damage = baseDmg;                                 // :39881 damage=defDamage
  const eggCap = 7;                                       // num1412

  // 原版 ai[0] 出生 0,Enemy 哨兵 -1120 归一
  if (e.ai0 < -1 || e.ai0 > 4.2) e.ai0 = 0;
  // ---- 日食/目标门(:39882-39915) ----
  if (!game.world.clock.eclipse) {
    if (e.ai0 !== -1) e.ai0 = -1;
  } else if (!p) {
    e.ai0 = -1;                                           // :39895 目标死亡 → 爬升脱战
  } else if (Math.hypot(p.cx - e.cx, p.cy - e.cy) > 3000) {
    e.ai0 = -1;                                           // :39895 vector247.Length() > 3000 → 爬升脱战
  } else if (e.ai0 > 1 && Math.hypot(p.cx - e.cx, p.cy - e.cy) > 1000) {
    e.ai0 = 1;                                            // :39906-39913 远距穿墙贴近
  }

  if (e.ai0 === -1) {
    // ---- 爬升离场(:39917-39921) ----
    e.vx = (e.vx * 9) / 10; e.vy = (e.vy * 9 - 8) / 10;
    e.iframes = 2;
    fly(e);
    return;
  }
  if (!p) { fly(e); return; }

  if (e.ai0 === 0) {
    // ---- 悬顶伺服(:39923-39988):目标=玩家上方 200px;>800px→1,>80px 追,近距微调 ----
    e.facing = e.cx < p.cx - 2 ? 1 : e.cx > p.cx + 2 ? -1 : e.facing;
    e.spin = (e.spin * 9 + e.vx * 0.1) / 10;
    const preVx = e.vx, preVy = e.vy;
    moveAndCollide(e, game.world, e.vx, e.vy);
    bounceAxis(e, preVx, preVy);
    let dx = p.cx - e.cx, dy = p.cy - 200 - e.cy;
    const d = Math.hypot(dx, dy);
    if (d > 800) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    else if (d > 80) {
      e.vx = (e.vx * 29 + (dx / d) * 6) / 30;
      e.vy = (e.vy * 29 + (dy / d) * 6) / 30;
    } else if (Math.hypot(e.vx, e.vy) > 2) { e.vx *= 0.95; e.vy *= 0.95; }
    else if (Math.hypot(e.vx, e.vy) < 1) { e.vx *= 1.05; e.vy *= 1.05; }
    // ---- 180t 轮换(:39962-39992):受击 +10..30;2 需视线,4 需卵量 ----
    e.ai1 += 1;
    if (e.justHit) e.ai1 += rndRange(10, 30);
    if (e.ai1 < 180) return;
    e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    const pick = rnd(3);                                  // 原版 while 重摇,单帧一次近似
    if (pick === 0 && losClear(game, e.cx, e.cy, p.cx, p.cy)) e.ai0 = 2;
    else if (pick === 1) e.ai0 = 3;
    else if (countNpc(game, 478) + countNpc(game, 479) < eggCap) e.ai0 = 4;
    return;
  }
  if (e.ai0 === 1) {
    // ---- 穿墙追击(:39994-40028):7+距/100 速,近 300px 且不埋块 → 0 ----
    let dx = p.cx - e.cx, dy = p.cy - e.cy;
    const d = Math.hypot(dx, dy);
    if (d < 300 && !inSolidBody(game, e)) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    const spd = 7 + d / 100;
    e.vx = (e.vx * 24 + (dx / (d || 1)) * spd) / 25;
    e.vy = (e.vy * 24 + (dy / (d || 1)) * spd) / 25;
    e.facing = e.vx < 0 ? -1 : 1;
    e.spin = (e.spin * 9 + e.vx * 0.08) / 10;
    fly(e);
    return;
  }
  if (e.ai0 === 2) {
    // ---- 近距缠斗(:40030-40091):×0.5 伤;4+ai[2]+距/120 速递增;240t 或断视线 → 0 ----
    e.def.damage = Math.round(baseDmg * 0.5);
    if (p.cx - 10 < e.cx) e.facing = -1;
    else if (p.cx + 10 > e.cx) e.facing = 1;
    e.spin = (e.spin * 4 + e.vx * 0.1) / 5;
    const preVx = e.vx, preVy = e.vy;
    moveAndCollide(e, game.world, e.vx, e.vy);
    bounceAxis(e, preVx, preVy);
    const dx = p.cx - e.cx, dy = p.cy - 20 - e.cy;
    e.ai2 += 1 / 45;
    if (expertMode(game)) e.ai2 += 1 / 60;   // :40110-40113
    const d = Math.hypot(dx, dy);
    const spd = 4 + e.ai2 + d / 120;
    e.vx = (e.vx * 19 + (dx / (d || 1)) * spd) / 20;
    e.vy = (e.vy * 19 + (dy / (d || 1)) * spd) / 20;
    e.ai1 += 1;
    if (e.ai1 > 240 || !losClear(game, e.cx, e.cy, p.cx, p.cy)) {
      e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    }
    return;
  }
  if (e.ai0 === 3 || e.ai0 === 3.1 || e.ai0 === 3.2) {
    // ---- 侧掠冲刺(:40093-40216) ----
    if (e.ai0 === 3) {
      // 拉开 400px 侧位(8+ai[1] 速),横距>350 且纵差<20 → 3.1
      let dx = p.cx - e.cx, dy = p.cy - 12 - e.cy;
      if (e.cx > p.cx) dx += 400; else dx -= 400;
      if (Math.abs(e.cx - p.cx) > 350 && Math.abs(e.cy - p.cy) < 20) { e.ai0 = 3.1; e.ai1 = 0; }
      e.ai1 += 1 / 30;
      const d = Math.hypot(dx, dy);
      const spd = 8 + e.ai1;
      e.vx = (e.vx * 3 + (dx / (d || 1)) * spd) / 4;
      e.vy = (e.vy * 3 + (dy / (d || 1)) * spd) / 4;
    } else if (e.ai0 === 3.1) {
      // 10t 瞄准(16 速贴脸) → 3.2 定向冲
      const dx = p.cx - e.cx, dy = p.cy - 12 - e.cy;
      const d = Math.hypot(dx, dy);
      e.vx = (e.vx * 7 + (dx / (d || 1)) * 16) / 8;
      e.vy = (e.vy * 7 + (dy / (d || 1)) * 16) / 8;
      e.facing = e.vx < 0 ? -1 : 1;
      e.spin = (e.spin * 4 + e.vx * 0.07) / 5;
      e.ai1 += 1;
      if (e.ai1 > 10) {
        e.ai0 = 3.2; e.ai1 = e.facing;
        e.vx = (dx / (d || 1)) * 16; e.vy = (dy / (d || 1)) * 16;
      }
    } else {
      // 直冲(16+ai[2] 速 ×1.3 伤),过玩家 260px 且不埋块 → 0;埋块且 >800px → 1
      e.def.damage = Math.round(baseDmg * 1.3);
      e.ai2 += 1 / 30;
      e.vx = (16 + e.ai2) * e.ai1;
      if ((e.ai1 > 0 && e.cx > p.cx + 260) || (e.ai1 < 0 && e.cx < p.cx - 260)) {
        if (!inSolidBody(game, e)) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
        else if (Math.abs(e.cx - p.cx) > 800) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
      }
      e.spin = (e.spin * 4 + e.vx * 0.07) / 5;
    }
    fly(e);
    return;
  }
  // ---- 扫地产卵(:40218-40404) ----
  if (e.ai0 === 4) {
    // 玩家周身 ±30/±20 格随机落点(越扫越宽),下潜 50 格找实心面,600px 内 → 4.1
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    const aboveGround = e.cy / TILE < game.world.groundLevel;
    const ptx = Math.floor(p.cx / TILE), pty = Math.floor(p.cy / TILE);
    const st = game.world.store;
    for (let k = 0; k < 1000; k++) {
      const rx = 30 + Math.floor(k / 50), ry = 20 + Math.floor(k / 75);
      let tx = ptx + rndRange(-rx, rx + 1);
      let ty = pty + rndRange(-ry, ry + 1);
      if (solidTileAt(game, tx, ty)) continue;
      let bad = false;
      let n = 50;
      while (n > 0) {
        n--;
        if (tx < 5 || ty < 5 || tx >= st.w - 5 || ty >= st.h - 5) { bad = true; break; }
        const ii = st.idx(tx, ty);
        if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) { bad = true; break; }   // 岩浆
        const iiA = st.idx(tx, ty - 1);
        if (st.liquid[iiA] > 0 && st.liquidType[iiA] === 2) { bad = true; break; }
        if (solidTileAt(game, tx, ty) || (aboveGround && ty > game.world.groundLevel)) break;
        ty++;
      }
      if (n <= 0 || bad) continue;
      if (Math.hypot(tx * TILE + 8 - p.cx, ty * TILE + 8 - p.cy) >= 600) continue;
      e.ai0 = 4.1; e.ai1 = tx; e.ai2 = ty;
      break;
    }
    return;
  }
  if (e.ai0 === 4.1) {
    // 飞向落点(6+距/150 封顶 10 速),<10px → 4.2
    e.facing = e.vx < -2 ? -1 : e.vx > 2 ? 1 : e.facing;
    e.spin = (e.spin * 9 + e.vx * 0.1) / 10;
    const gx = e.ai1 * TILE + 8, gy = e.ai2 * TILE - 20;
    const dx = gx - e.cx, dy = gy - e.cy;
    const d = Math.hypot(dx, dy);
    const spd = Math.min(6 + d / 150, 10);
    if (d < 10) { e.ai0 = 4.2; e.ai3 = 0; }
    e.vx = (e.vx * 9 + (dx / (d || 1)) * spd) / 10;
    e.vy = (e.vy * 9 + (dy / (d || 1)) * spd) / 10;
    const vl = Math.hypot(e.vx, e.vy);
    if (vl > spd) { e.vx = (e.vx / vl) * spd; e.vy = (e.vy / vl) * spd; }
    fly(e);
    return;
  }
  // 4.2 悬停产卵(:40357-40404):70t(专家 52)产 478,140t 收工(2/3 概率续扫)
  e.spin = (e.spin * 9 + e.vx * 0.1) / 10;
  const gx = e.ai1 * TILE + 8, gy = e.ai2 * TILE - 20;
  let dx = gx - e.cx, dy = gy - e.cy;
  const d = Math.hypot(dx, dy);
  if (d < 4) {
    const hatchT = expertMode(game) ? Math.round(70 * 0.75) : 70;   // :40367-40370 ×0.75
    e.ai3 += 1;
    if (e.ai3 === hatchT) {
      const egg = spawnPart(game, e, 478);
      if (egg) { egg.x = e.ai1 * TILE + 8 - egg.w / 2; egg.y = e.ai2 * TILE - egg.h; egg.bInit = true; }
    } else if (e.ai3 === hatchT * 2) {
      e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
      if (countNpc(game, 478) + countNpc(game, 479) < eggCap && rnd(3) !== 0) e.ai0 = 4;
      else if (inSolidBody(game, e)) e.ai0 = 1;
    }
  }
  if (d > 4) { dx = (dx / d) * 4; dy = (dy / d) * 4; }
  e.vx = (e.vx + dx) / 2;
  e.vy = (e.vy + dy) / 2;
  const vl = Math.hypot(e.vx, e.vy);
  if (vl > 4) { e.vx = (e.vx / vl) * 4; e.vy = (e.vy / vl) * 4; }
  fly(e);
}

// ---------------------------------------------------------------------------
// AI_089 蛾卵 478(NPC.cs:40407-40449)
// 900t(专家 600)孵化 → Transform 479;受击 -10..20(普通双扣);末期 75% 起抽搐跳。
// ---------------------------------------------------------------------------
export function mothronEggAI(e: Enemy, game: GameHooks, _player: Player | null) {
  const hatchT = expertMode(game) ? 600 : 900;             // num1440（:40420）
  // 仅归一哨兵 -1120（原版 ai[0] 出生 0）——受击扣减（:40426-40429，普通双扣
  // 10..20×2）可把进度推入负值推迟孵化，负值必须跨帧保留；
  // 曾用 `ai0<0 → 0` 把负进度每帧清零 = 受击扣减永不生效
  if (e.ai0 === -1120) e.ai0 = 0;
  if (e.vy === 0) {
    e.vx *= 0.9;
    e.spin += e.vx * 0.02;
  } else {
    e.vx *= 0.99;
    e.spin += e.vx * 0.04;
  }
  if (e.justHit) {                                        // :40419-40425
    e.ai0 -= rndRange(10, 21);
    if (!expertMode(game)) e.ai0 -= rndRange(10, 21);      // :40427
  }
  e.ai0 += 1;
  if (e.ai0 >= hatchT) {
    e.transformTo(479, game.world.store, false, game);   // :40428 Transform(479)
    return;
  }
  if (e.vy === 0 && Math.abs(e.vx) < 0.2 && e.ai0 >= hatchT * 0.75) {
    // :40431-40445 末期抽搐:越接近孵化越频繁的随机跳
    const k = (e.ai0 - hatchT * 0.75) / (hatchT * 0.25);
    if (rndRange(-10, 120) < k * 100) {
      e.vy -= rndRange(20, 40) * 0.025;
      e.vx += rndRange(-20, 20) * 0.025;
      e.vx *= 1 + k * 2; e.vy *= 1 + k * 2;
    }
  }
  e.vy = Math.min(e.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
  moveAndCollide(e, game.world, e.vx, e.vy);
}

// ---------------------------------------------------------------------------
// AI_090 幼蛾 479(NPC.cs:40450-40685)——日食限定
// 无日食 → EncourageDespawn(5)+上浮;-1 爬升无敌 / 0 悬停(90t→2,同族排斥)/
// 1 穿墙追击(近 300px → 0)/ 2+2.1 贴脸冲撞(9 速,45t 后埋块判 0/1)
// ---------------------------------------------------------------------------
export function babyMothronAI(e: Enemy, game: GameHooks, player: Player | null) {
  const p = player && !player.dead ? player : null;
  e.spin = (e.spin * 9 + e.vx * 0.1) / 10;                // :40456
  // 原版 ai[0] 出生 0,Enemy 哨兵 -1120 归一
  if (e.ai0 < -1 || e.ai0 > 2.1) e.ai0 = 0;
  if (!game.world.clock.eclipse) {                              // :40458-40467
    e.encourageDespawn(5);
    e.vy = Math.max(e.vy - 0.2, -8);
    fly(e);
    return;
  }
  // ---- 同族排斥(状态 0/1,:40469-40491) ----
  if (e.ai0 === 0 || e.ai0 === 1) {
    for (const n of enemies(game)) {
      if (n === e || n.dead || n.vanillaId !== e.vanillaId) continue;
      let dx = n.cx - e.cx, dy = n.cy - e.cy;
      const d = Math.hypot(dx, dy);
      if (d >= e.w + e.h || d === 0) continue;
      dx = (dx / d) * -0.1; dy = (dy / d) * -0.1;
      e.vx += dx; e.vy += dy;
      n.vx -= dx; n.vy -= dy;
    }
  }
  // ---- 目标门(:40485-40501) ----
  if (!p) e.ai0 = -1;                                     // :40489 目标死亡 → 爬升
  else if (Math.hypot(p.cx - e.cx, p.cy - e.cy) > 3000) e.ai0 = -1;   // :40489 >3000px → 爬升脱战
  else if (e.ai0 > 1 && Math.hypot(p.cx - e.cx, p.cy - e.cy) > 1000) e.ai0 = 1;

  if (e.ai0 === -1) {
    // ---- 爬升(:40511-40515) ----
    e.vx = (e.vx * 9) / 10; e.vy = (e.vy * 9 - 8) / 10;
    e.iframes = 2;
    fly(e);
    return;
  }
  if (!p) { fly(e); return; }

  if (e.ai0 === 0) {
    // ---- 悬停(:40517-40577):>800px→1 / >200px 追(5.5+距/100+ai[1]/15)/ 近距微调;90t→2 ----
    const preVx = e.vx, preVy = e.vy;
    moveAndCollide(e, game.world, e.vx, e.vy);
    bounceAxis(e, preVx, preVy);
    const dx = p.cx - e.cx, dy = p.cy - e.cy;
    const d = Math.hypot(dx, dy);
    if (d > 800) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    else if (d > 200) {
      const spd = 5.5 + d / 100 + e.ai1 / 15;
      e.vx = (e.vx * 39 + (dx / d) * spd) / 40;
      e.vy = (e.vy * 39 + (dy / d) * spd) / 40;
    } else if (Math.hypot(e.vx, e.vy) > 2) { e.vx *= 0.95; e.vy *= 0.95; }
    else if (Math.hypot(e.vx, e.vy) < 1) { e.vx *= 1.05; e.vy *= 1.05; }
    e.ai1 += 1;
    if (e.ai1 >= 90) { e.ai1 = 0; e.ai0 = 2; }
    return;
  }
  if (e.ai0 === 1) {
    // ---- 穿墙追击(:40579-40613):5.5+ai[2]+距/150 速;近 300px 且不埋块 → 0 ----
    const dx = p.cx - e.cx, dy = p.cy - e.cy;
    const d = Math.hypot(dx, dy);
    if (d < 300 && !inSolidBody(game, e)) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    e.ai2 += 1 / 60;
    const spd = 5.5 + e.ai2 + d / 150;
    e.vx = (e.vx * 34 + (dx / (d || 1)) * spd) / 35;
    e.vy = (e.vy * 34 + (dy / (d || 1)) * spd) / 35;
    e.facing = e.vx < 0 ? -1 : 1;
    e.spin = (e.spin * 9 + e.vx * 0.08) / 10;
    fly(e);
    return;
  }
  if (e.ai0 === 2) {
    // ---- 贴脸瞄准 10t(9 速,:40615-40652) → 2.1 定向冲 ----
    const dx = p.cx - e.cx, dy = p.cy - 8 - e.cy;
    const d = Math.hypot(dx, dy);
    e.facing = e.vx < 0 ? -1 : 1;
    e.spin = (e.spin * 7 + e.vx * 0.1) / 8;
    e.vx = (e.vx * 7 + (dx / (d || 1)) * 9) / 8;
    e.vy = (e.vy * 7 + (dy / (d || 1)) * 9) / 8;
    e.ai1 += 1;
    if (e.ai1 > 10) {
      e.ai0 = 2.1; e.ai1 = 0;
      e.vx = (dx / (d || 1)) * 9; e.vy = (dy / (d || 1)) * 9;
    }
    fly(e);
    return;
  }
  // ---- 2.1 冲刺(:40654-40682):×1.01/t 增速;45t 后不埋块→0,埋块且 90t→1 ----
  e.facing = e.vx < 0 ? -1 : 1;
  e.vx *= 1.01; e.vy *= 1.01;
  e.ai1 += 1;
  if (e.ai1 > 45) {
    if (!inSolidBody(game, e)) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; }
    else if (e.ai1 > 90) { e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; }
  }
  fly(e);
}

/** 撞轴 ×(-旧速·0.5) 封顶 ±4(NPC.cs Mothron 族 collide 语义,:39933-39939) */
function bounceAxis(e: Enemy, preVx: number, preVy: number) {
  if (e.hitWall) { e.vx *= -preVx * 0.5; e.vx = clamp(e.vx, -4, 4); }
  if (e.hitHead || (e.onGround && preVy > 0)) { e.vy *= -preVy * 0.5; e.vy = clamp(e.vy, -4, 4); }
}

// ---------------------------------------------------------------------------
// AI_091 花岗岩元素 483(NPC.cs:40686-40870)
// AI 自置 noGravity=true(:40688)——全程无重力,碰撞按态开合:
// -1 受击石化 120t(专家限定,不可达)/ 0 视线判别→1 直追(2+距/200 速)/
// 2 穿墙冲刺(近 600px 且不埋块→0)/ 3 锚点侧移(1 速,撞轴/到点/通视线→0)/
// 4 漂移弹壁(1.5 速,180t 或通视线→0;每 5t 重试锚点)。
// 与 AI_085(星细胞族)同构五态寻路——aiStyle 85 的 1:1 内核在此。
// ---------------------------------------------------------------------------
export function graniteElementalAI(e: Enemy, game: GameHooks, player: Player | null) {
  const p = player && !player.dead ? player : null;
  const x = lunarLocalAI(e);
  // 原版 ai[0] 出生 0,Enemy 哨兵 -1120 归一(-1 石化态合法保留)
  if (e.ai0 !== -1 && (e.ai0 < 0 || e.ai0 > 4)) e.ai0 = 0;
  // noGravity 运行时位（:40688 起始 true / -1 石化态 :40699 置 false）——
  // StrikeNPC :82217 受击档（def.flying=false 覆盖不到，2026-08-17 补）
  // ---- 专家受击石化(:40692-40697) ----
  if (e.justHit && expertMode(game) && rnd(6) === 0) { e.ai0 = -1; e.ai1 = 0; }
  e.noGravity = e.ai0 !== -1;   // 转移 tick 即置 false（原版 -1 分支同 tick 生效）

  if (e.ai0 === -1) {
    // ---- 石化(:40699-40708) ----
    e.iframes = 2;
    e.vx *= 0.98;
    e.ai1 += 1;
    moveAndCollide(e, game.world, e.vx, e.vy);
    if (e.ai1 >= 120) { e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
    return;
  }
  if (!p) { moveAndCollide(e, game.world, e.vx, e.vy); return; }
  const los = losClear(game, e.cx, e.cy, p.cx, p.cy);

  if (e.ai0 === 0) {
    // ---- 视线判别(:40710-40752):通视线→1;否则找中转锚(玩家正上/正下列)→3;无→4 ----
    if (los) { e.ai0 = 1; return; }
    // 锚 1:玩家正上/正下列 (px, selfY)(:40722-40732)
    if (Math.abs(p.cx - e.cx) > 8 && losClear(game, e.cx, e.cy, p.cx, e.cy)) {
      e.ai0 = 3; e.ai1 = p.cx; e.ai2 = e.cy;
      // 命中再升级为 (selfX, playerY) 双段锚(:40734-40742)。★门用 vector264.Length()
      // 即列锚距 |ΔX|（原版字面复检 vector264 而非 center48−Center=|ΔY|——"行锚
      // 距离门拿列锚距"的层级笔误 1:1 保留，先例：石巨人砸火把 Y 上界用 width；
      // G11 定谳 2026-08-19：1405 无 aiStyle91（1.4.4+ 新增）无对读，按 1456 字面）
      if (Math.abs(p.cx - e.cx) > 8 && losClear(game, e.cx, e.cy, e.cx, p.cy)
        && losClear(game, e.cx, p.cy, p.x, p.y)) {
        e.ai1 = e.cx; e.ai2 = p.cy;
      }
    } else if (Math.abs(p.cy - e.cy) > 8 && losClear(game, e.cx, e.cy, e.cx, p.cy)) {
      e.ai0 = 3; e.ai1 = e.cx; e.ai2 = p.cy;              // :40744-40750 行锚
    }
    if (e.ai0 === 0) {
      // 无锚:直朝玩家轻推 0.5 → 4 漂移(:40744-40752)
      x[0] = 0;
      const dx = p.cx - e.cx, dy = p.cy - p.h / 4 - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx += (dx / d) * 0.5; e.vy += (dy / d) * 0.5;
      e.ai0 = 4; e.ai1 = 0;
    }
  } else if (e.ai0 === 1) {
    // ---- 直追(:40754-40768):2+距/200 速(50 步进);断视线 → 0 ----
    const dx = p.cx - e.cx, dy = p.cy - e.cy;
    const d = Math.hypot(dx, dy);
    const spd = 2 + d / 200;
    e.vx = (e.vx * 49 + (dx / (d || 1)) * spd) / 50;
    e.vy = (e.vy * 49 + (dy / (d || 1)) * spd) / 50;
    moveAndCollide(e, game.world, e.vx, e.vy);
    if (!los) { e.ai0 = 0; e.ai1 = 0; }
    return;
  } else if (e.ai0 === 2) {
    // ---- 穿墙冲刺(:40770-40783):2 速;近 600px 且不埋块 → 0 ----
    const dx = p.cx - e.cx, dy = p.cy - e.cy;
    const d = Math.hypot(dx, dy);
    e.vx = (e.vx * 3 + (dx / (d || 1)) * 2) / 4;
    e.vy = (e.vy * 3 + (dy / (d || 1)) * 2) / 4;
    fly(e);
    if (d < 600 && !inSolidBody(game, e)) e.ai0 = 0;
    return;
  } else if (e.ai0 === 3) {
    // ---- 锚点侧移(:40785-40801):1 速(3 步进);撞轴→4;到点/超 800px/通视线→0 ----
    const dx = e.ai1 - e.cx, dy = e.ai2 - e.cy;
    const d = Math.hypot(dx, dy);
    e.vx = (e.vx * 2 + (dx / (d || 1)) * 1) / 3;
    e.vy = (e.vy * 2 + (dy / (d || 1)) * 1) / 3;
    const preVy = e.vy;
    moveAndCollide(e, game.world, e.vx, e.vy);
    if (e.hitWall || e.hitHead || (e.onGround && preVy > 0)) { e.ai0 = 4; e.ai1 = 0; }
    if (d < 1 || d > 800 || los) { e.ai0 = 0; }
    return;
  } else if (e.ai0 === 4) {
    // ---- 漂移弹壁(:40803-40854):1.5 速(20 步进);180t 或通视线 → 0 ----
    if (e.hitWall) e.vx *= -0.8;
    if (e.hitHead || e.onGround) e.vy *= -0.8;
    if (e.vx === 0 && e.vy === 0) {
      const dx = p.cx - e.cx, dy = p.cy - p.h / 4 - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (dx / d) * 0.1; e.vy = (dy / d) * 0.1;
    }
    const v = Math.hypot(e.vx, e.vy) || 1;
    e.vx = (e.vx * 19 + (e.vx / v) * 1.5) / 20;
    e.vy = (e.vy * 19 + (e.vy / v) * 1.5) / 20;
    e.ai1 += 1;
    if (e.ai1 > 180 || los) { e.ai0 = 0; e.ai1 = 0; }
    moveAndCollide(e, game.world, e.vx, e.vy);
    // ---- 每 5t 重试中转锚(:40858-40870) ----
    x[0] += 1;
    if (x[0] >= 5 && !inSolidBody(game, e)) {
      x[0] = 0;
      // 先试列锚 (px, selfY)(需三方视线),再试行锚 (selfX, py)
      if (losClear(game, e.cx, e.cy, p.cx, e.cy) && losClear(game, p.cx, p.cy, p.cx, e.cy)) {
        e.ai0 = 3; e.ai1 = p.cx; e.ai2 = e.cy;
      } else if (losClear(game, e.cx, e.cy, e.cx, p.cy) && losClear(game, p.cx, p.cy, e.cx, p.cy)) {
        e.ai0 = 3; e.ai1 = e.cx; e.ai2 = p.cy;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 星璇塔四组专属怪批(aiStyle 85/95/96/97/99)——替换 Enemy.ts 一期近似档
// (swarmerAI/casterAI)。锚点:
//   aiStyle 85  星细胞 405 / 星云头蟹 421   NPC.cs:38967-39220(六态寻路+421 头顶吸附)
//   aiStyle 95  小星细胞 406                NPC.cs:41445-41492(300t 长大 → Transform 405)
//   aiStyle 96  水流入侵者 407(/408)        NPC.cs:41493-41535(悬顶伺服 + 投射物 539)
//   aiStyle 97  星云悬浮脑 420              NPC.cs:41536-41750(瞬移 + 环绕球 574 → 弹 576)
//   aiStyle 99  日耀黏液 519                NPC.cs:41997-42056(重力坠落 → 落地 5t 自爆)
// 勘误(1.4.5.6 全树核对):NPC 408 无任何 NewNPC/Transform 调用源——docs/
//   event-lunar-pillars.md §4"408 由投射物 539 生成"不成立;539 自身只绕 407 盘旋
//   210t 后以 16 速冲玩家、亡时 80×80 范围伤害(Projectile.cs:32040-32280/:69366-69405),
//   不生怪。407/408 共用 aiStyle 96,本实现对其一视同仁。
// ---------------------------------------------------------------------------

/** Collision.SolidCollision 近似(矩形内 ANY 实心)——AI_085 态 2 出墙判定(:39090) */
function touchesSolid(game: GameHooks, e: Enemy, inflate = 0): boolean {
  const st = game.world.store;
  const x0 = Math.floor((e.x - inflate) / TILE), x1 = Math.floor((e.x + e.w - 0.01 + inflate) / TILE);
  const y0 = Math.floor((e.y - inflate) / TILE), y1 = Math.floor((e.y + e.h - 0.01 + inflate) / TILE);
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = y0; ty <= y1; ty++) {
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

/** 星细胞族尾段:405 旋转清零 / 421 旋转=vx×0.1(:39104-39119) + 同族排斥(:39106-39131) */
function starCellTail(e: Enemy, game: GameHooks, is405: boolean): void {
  if (is405) e.visAngle = 0;
  else e.visAngle = e.vx * 0.1;
  for (const n of enemies(game)) {
    if (n === e || n.dead || n.vanillaId !== e.vanillaId) continue;
    if (Math.abs(e.x - n.x) + Math.abs(e.y - n.y) < e.w) {
      e.vx += e.x < n.x ? -0.05 : 0.05;
      e.vy += e.y < n.y ? -0.05 : 0.05;
    }
  }
}

/** AI_085 星细胞 405 / 星云头蟹 421(NPC.cs:38967-39220)六态:
 *  0 视线判别(通→1;远 800→2;找中转锚→3;无→轻推入 4)/ 1 直追(5.5|8+距/100,50 步进)/
 *  2 穿墙(3|6 速,noTileCollide;近 600 且离实心→0)/ 3 锚点侧移(2|3 速,撞→4)/
 *  4 漂移弹壁(2|3 速,180t;每 5t 重试锚)/ 5(仅 421)钉玩家头顶 Obstructed。 */
export function starCellAI(e: Enemy, game: GameHooks, player: Player | null) {
  const p = player && !player.dead ? player : null;
  const is405 = e.vanillaId === 405;
  const lai = lunarLocalAI(e);
  if (e.ai0 < 0 || e.ai0 > 5) e.ai0 = 0;            // Enemy 哨兵 -1120 归一,原版出生 0
  if (e.ai0 === 5) {
    // ---- 421 头顶吸附(:39183-39202):Center=player.Top+(direction*4,0);失活→脱落 ----
    if (!p) { e.ai0 = 0; e.ai1 = 0; }
    else {
      const dir = p.facing ?? 1;
      e.x = p.cx + dir * 4 - e.w / 2;
      e.y = p.y - e.h / 2;
      e.vx = 0; e.vy = 0;
      // AddBuff(163 Obstructed,59) 每 tick 续期(:39197-39201)——BuffState.apply 取
      // max 合并,吸附期间恒 ≤1s 存量,脱落后自然消退。遮屏视觉在 Renderer
      // drawScreenObstruction（ScreenObstruction.cs 1:1）。
      // （原版另以 hide=ai[0]==5 隐藏本体——保持可见为已登记偏差,否则吸附期完全不可见）
      p.buffs.apply(BuffType.Obstructed, 59 / 60);
    }
    starCellTail(e, game, is405);
    return;
  }
  if (!p) { moveAndCollide(e, game.world, e.vx, e.vy); starCellTail(e, game, is405); return; }
  const los = losClear(game, e.cx, e.cy, p.cx, p.cy); // CanHit(Center,1,1,…)
  let flyPhase = false;

  if (e.ai0 === 0) {
    // ---- 视线判别(:38974-39030)；态尾自旋 rotation += direction×0.3（:39030）----
    e.visAngle += e.facing * 0.3;
    if (los) { e.ai0 = 1; }
    else {
      const dx = p.cx - e.cx, dy = p.cy - p.h / 4 - e.cy;
      if (Math.hypot(dx, dy) > 800) { e.ai0 = 2; }
      else {
        // 列锚 (px, selfY)(:38987-38997);命中升级双段锚 (selfX, py)(:38999-39008,
        // 原文复用列距 >8 判据——按原文照抄)
        if (Math.abs(p.cx - e.cx) > 8 && losClear(game, e.cx, e.cy, p.cx, e.cy)) {
          e.ai0 = 3; e.ai1 = p.cx; e.ai2 = e.cy;
          if (Math.abs(p.cx - e.cx) > 8 && losClear(game, e.cx, e.cy, e.cx, p.cy)
            && losClear(game, e.cx, p.cy, p.x, p.y)) {
            e.ai0 = 3; e.ai1 = e.cx; e.ai2 = p.cy;
          }
        } else if (Math.abs(p.cy - e.cy) > 8 && losClear(game, e.cx, e.cy, e.cx, p.cy)) {
          e.ai0 = 3; e.ai1 = e.cx; e.ai2 = p.cy;      // 行锚(:39015-39022)
        }
        if (e.ai0 === 0) {
          // 无锚:朝玩家(Y 抬高 h/4)轻推 0.5 → 4 漂移(:39023-39030)
          lai[0] = 0;
          const d = Math.hypot(dx, dy) || 1;
          e.vx += (dx / d) * 0.5; e.vy += (dy / d) * 0.5;
          e.ai0 = 4; e.ai1 = 0;
        }
      }
    }
  } else if (e.ai0 === 1) {
    // ---- 直追(:39031-39069):(5.5|8)+距/100 速,50 步进;断视线→0 ----
    // 421 瞄 player.Top（:39032-39035 if type==421 → vector = player.Top - center）；
    // 405/467 瞄 player.Center
    const is421 = e.vanillaId === 421;
    const tx = p.cx - e.cx, ty = (is421 ? p.y : p.cy) - e.cy;
    const d = Math.hypot(tx, ty);
    const spd = (is405 ? 8 : 5.5) + d / 100;
    const n = d || 1;
    e.vx = (e.vx * 49 + (tx / n) * spd) / 50;
    e.vy = (e.vy * 49 + (ty / n) * spd) / 50;
    if (!los) { e.ai0 = 0; e.ai1 = 0; }
    // 421 专属吸附门（:39052-39068 if type==421 && num<40）：近 40px 且场上无同族
    // 吸附中才钉上。467 致命球（日食怪，同 aiStyle 85）**不**吸附——此前误写成
    // !is405 导致致命球钉头 + 每 tick 灌 Obstructed(163)
    if (is421 && d < 40
      && !enemies(game).some((o) => o !== e && !o.dead && o.vanillaId === 421 && o.ai0 === 5)) {
      e.x = p.cx - e.w / 2; e.y = p.y - e.h;        // Center=player.Top
      e.vx = 0; e.vy = 0;
      e.ai0 = 5; e.ai1 = 0;
    }
  } else if (e.ai0 === 2) {
    e.visAngle = e.vx * 0.1;   // rotation（:39076）
    // ---- 穿墙(:39071-39094):noTileCollide=true;3|6 速 3 步进;近 600 且离实心→0 ----
    flyPhase = true;
    const tx = p.cx - e.cx, ty = p.cy - e.cy;
    const d = Math.hypot(tx, ty) || 1;
    const spd = is405 ? 6 : 3;
    e.vx = (e.vx * 2 + (tx / d) * spd) / 3;
    e.vy = (e.vy * 2 + (ty / d) * spd) / 3;
    if (d < 600 && !touchesSolid(game, e)) e.ai0 = 0;
  } else if (e.ai0 === 3) {
    e.visAngle = e.vx * 0.1;   // rotation（:39096）
    // ---- 锚点侧移(:39096-39115):2|3 速 3 步进;撞轴→4;到点/超 800/通视线→0 ----
    const tx = e.ai1 - e.cx, ty = e.ai2 - e.cy;
    const d = Math.hypot(tx, ty) || 1;
    const spd = is405 ? 3 : 2;
    e.vx = (e.vx * 2 + (tx / d) * spd) / 3;
    e.vy = (e.vy * 2 + (ty / d) * spd) / 3;
    if (e.hitWall || e.hitHead || e.onGround) { e.ai0 = 4; e.ai1 = 0; }
    if (d < spd || d > 800 || los) e.ai0 = 0;
  } else if (e.ai0 === 4) {
    e.visAngle = e.vx * 0.1;   // rotation（:39121）
    // ---- 漂移弹壁(:39117-39175):弹壁 ×-0.8;2|3 速 20 步进;180t 或通视线→0 ----
    if (e.hitWall) e.vx *= -0.8;
    if (e.hitHead || e.onGround) e.vy *= -0.8;
    if (e.vx === 0 && e.vy === 0) {
      const dx = p.cx - e.cx, dy = p.cy - p.h / 4 - e.cy;
      const d = Math.hypot(dx, dy) || 1;
      e.vx = (dx / d) * 0.1; e.vy = (dy / d) * 0.1;
    }
    const spd = is405 ? 3 : 2;
    const v = Math.hypot(e.vx, e.vy) || 1;
    e.vx = (e.vx * 19 + (e.vx / v) * spd) / 20;
    e.vy = (e.vy * 19 + (e.vy / v) * spd) / 20;
    e.ai1 += 1;
    if (e.ai1 > 180) { e.ai0 = 0; e.ai1 = 0; }
    if (los) e.ai0 = 0;
    // 每 5t 重试中转锚(:39160-39175):列锚需三方视线(原文 CanHit 重复两次照抄)
    lai[0] += 1;
    if (lai[0] >= 5 && !touchesSolid(game, e, 10)) {
      lai[0] = 0;
      if (losClear(game, e.cx, e.cy, p.cx, e.cy) && losClear(game, e.cx, e.cy, p.cx, e.cy)
        && losClear(game, p.cx, p.cy, p.cx, e.cy)) {
        e.ai0 = 3; e.ai1 = p.cx; e.ai2 = e.cy;
      } else if (losClear(game, e.cx, e.cy, e.cx, p.cy) && losClear(game, p.cx, p.cy, e.cx, p.cy)) {
        e.ai0 = 3; e.ai1 = e.cx; e.ai2 = p.cy;
      }
    }
  }

  if (flyPhase) fly(e);
  else moveAndCollide(e, game.world, e.vx, e.vy);
  starCellTail(e, game, is405);
}

/** AI_095 小星细胞 406(NPC.cs:41445-41492):无重力漂移减速,300t 线性长大
 *  (scale 1→1.3)→ Transform 405;20t 起喷 226 号尘环(圈层随龄收窄)。 */
export function smallStarCellAI(e: Enemy, game: GameHooks, _player: Player | null) {
  const MAX = 300;
  if (e.ai0 < 0) e.ai0 = 0;
  if (Math.hypot(e.vx, e.vy) > 4) { e.vx *= 0.95; e.vy *= 0.95; }
  e.vx *= 0.99; e.vy *= 0.99;
  e.ai0 += 1;
  e.vanillaScale = 1 + 0.3 * clamp(e.ai0 / MAX, 0, 1);   // :41455 scale
  if (e.ai0 >= MAX) {
    // Transform(405)(:41457-41461)——transformTo 埋块时会失败,下 tick 原地重试
    e.transformTo(405, game.world.store, false, game);
    return;
  }
  e.visAngle += e.vx * 0.1;
  if (e.ai0 > 20) {
    // 尘环(:41466-41490):tier=龄/150,半径 12-tier*2,半数概率
    const tier = Math.floor(e.ai0 / (MAX / 2));
    for (let k = 0; k < tier + 1; k++) {
      if (rnd(2) === 0) continue;
      const a = Math.random() * TAU;
      const r = 12 - tier * 2;
      game.spawnParticles(e.cx + Math.cos(a) * r, e.cy + Math.sin(a) * r,
        k % 2 === 1 ? '#7FD8FF' : '#4FB8E8', 1, 1.5 * ((10 - tier * 2) / 10),
        { life: 40, damp: 0.96 });
    }
  }
  moveAndCollide(e, game.world, e.vx, e.vy);
}

/** AI_096 水流入侵者 407/408(NPC.cs:41493-41535):SimpleFlyMovement 悬顶伺服
 *  (目标=玩家上方 250px,5 速 0.15 步进,近距减速档 0.35/0.65);每 70t 甩投射物 539
 *  (近水平随机向,|vx|≥1.5,60 伤)。 */
export function flowInvaderAI(e: Enemy, game: GameHooks, player: Player | null) {
  const SPD = 5, ACC = 0.15;
  if (e.ai0 < 0) e.ai0 = 0;
  const p = player && !player.dead ? player : null;
  if (p) {
    const dx = p.cx - e.cx, dy = p.cy - 250 - e.cy;
    const d = Math.hypot(dx, dy);
    let dvx = e.vx, dvy = e.vy;                        // <20px:期望=现速(:41501-41503)
    if (d >= 20 && d < 40) { dvx = (dx / d) * SPD * 0.35; dvy = (dy / d) * SPD * 0.35; }
    else if (d >= 40 && d < 80) { dvx = (dx / d) * SPD * 0.65; dvy = (dy / d) * SPD * 0.65; }
    else if (d >= 80) { dvx = (dx / d) * SPD; dvy = (dy / d) * SPD; }
    e.vx += clamp(dvx - e.vx, -ACC, ACC);              // SimpleFlyMovement(:41523-41525)
    e.vy += clamp(dvy - e.vy, -ACC, ACC);
  }
  e.visAngle = e.vx * 0.1;
  e.ai0 += 1;
  if (e.ai0 < 70) { moveAndCollide(e, game.world, e.vx, e.vy); return; }
  e.ai0 = 0;
  // 甩 539(:41528-41535):UnitY.RotatedByRandom(π/2)×(5,3),重掷至 |vx|≥1.5
  let ox = 0, oy = 0;
  do {
    const a = Math.PI / 2 + (Math.random() * 2 - 1) * (Math.PI / 2);
    ox = Math.cos(a) * 5; oy = Math.sin(a) * 3;
  } while (Math.abs(ox) < 1.5);
  (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(
    new LunarOrb(e, 539, ox, oy, 60), 'projectiles');
  moveAndCollide(e, game.world, e.vx, e.vy);
}

/** AI_AttemptToFindTeleportSpot(NPC.cs:18876-18946)收敛:AI_097 传参
 *  (20,12,1,solidTileCheckCentered,teleportInAir)。原文 for 体尾 break → 每 attempt
 *  只验一个候选格;距目标 2000px 以上直接放弃;落点 3×3 须净空、岩浆格排除、
 *  落点外扩 12 tile 不得扫到玩家(telefrag 防护)。 */
function findTeleportSpot(game: GameHooks, e: Enemy, p: Player): { x: number; y: number } | null {
  const selfTx = Math.floor(e.cx / 16), selfTy = Math.floor(e.cy / 16);
  const ptx = Math.floor(p.cx / 16), pty = Math.floor(p.cy / 16);
  if (Math.abs(selfTx * 16 - ptx * 16) + Math.abs(selfTy * 16 - pty * 16) > 2000) return null;
  const st = game.world.store;
  for (let attempt = 0; attempt < 100; attempt++) {
    const tx = ptx - 20 + rnd(41);
    const ty = pty - 20 + rnd(41);
    if (ty >= selfTy - 1 && ty <= selfTy + 1 && tx >= selfTx - 1 && tx <= selfTx + 1) continue;
    if (st.inBounds(tx, ty - 1)) {                    // (tx,ty-1) 岩浆 → 弃
      const li = st.idx(tx, ty - 1);
      if (st.liquid[li] > 0 && st.liquidType[li] === 2) continue;
    }
    if (solidRect(game, tx - 1, ty - 1, tx + 1, ty + 1)) continue;   // 3×3 净空
    // telefrag:落点 tile 外扩 12 tile vs 玩家 hitbox∪(hitbox+vel*20)
    const inf = 12 * 16;
    const rx0 = tx * 16 - inf, ry0 = ty * 16 - inf;
    const rx1 = tx * 16 + 16 + inf, ry1 = ty * 16 + 16 + inf;
    const px0 = p.x + Math.min(0, p.vx * 20), py0 = p.y + Math.min(0, p.vy * 20);
    const px1 = p.x + p.w + Math.max(0, p.vx * 20), py1 = p.y + p.h + Math.max(0, p.vy * 20);
    if (px0 < rx1 && px1 > rx0 && py0 < ry1 && py1 > ry0) continue;
    return { x: tx, y: ty };
  }
  return null;
}

/** AI_097 星云悬浮脑 420(NPC.cs:41536-41750):noTileCollide 穿墙。开场 180t 每 60t
 *  放环绕球 574(球每 180t 朝玩家线发 576 弹,8 速 65 伤);受击 1/6 概率瞬移
 *  (StrikeNPC :82097 置 localAI[1]);480t 周期 AI_AttemptToFindTeleportSpot 落点
 *  瞬移(起终双段尘爆 + 全场 574 球计时 -30);>400px 或断视线追击(7 速 30 步进),
 *  否则滞空缓降。玩家失活 → ai[1]=1 渐隐消散(3t)。 */
export function nebulaFloaterAI(e: Enemy, game: GameHooks, player: Player | null) {
  const SPD = 7, TP_T = 480, ORB_DELAY = 30;
  const lai = lunarLocalAI(e);
  if (e.ai0 < 0) e.ai0 = 0;
  const p = player && !player.dead ? player : null;
  // ---- 开场环绕球(:41542-41554) ----
  if (lai[2] < 180) {
    lai[2] += 1;
    if (lai[2] % 60 === 0) {
      let ox = 0, oy = 0;
      do {
        const a = Math.PI / 2 + (Math.random() * 2 - 1) * (Math.PI / 2);
        ox = Math.cos(a) * 4; oy = Math.sin(a) * 2.5;
      } while (Math.abs(ox) < 1.5);
      (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(
        new LunarOrb(e, 574, ox, oy, 0), 'projectiles');
    }
  }
  if (e.justHit) lai[1] = 1;                          // StrikeNPC(:82097)受击触发
  if (lai[1] === 1) {
    lai[1] = 0;
    if (rnd(6) === 0) e.ai0 = TP_T;                   // :41556-41561 受击 1/6 立即瞬移
  }
  const dir = p ? e.seekDirX(p) : e.facing;           // TargetClosest(confused 反向)
  if (!p) {                                           // 玩家失活 → 渐隐消散(:41566-41574)
    e.ai0 = 0; e.ai1 = 1; e.ai2 = 0; e.ai3 = 0;
  }
  e.visAngle = Math.abs(e.vx) * dir * 0.1;            // rotation(:41576)
  e.facing = -dir;                                    // spriteDirection=-direction
  if (e.ai1 === 1) {
    // ---- 消散段(:41582-41601):3t 倒数后 active=false ----
    if (lai[3] === 0) {
      lai[3] = 1; e.ai3 = 3;
      // 消散音 = Item8（:41584 原文 PlaySound(SoundID.Item8)，与传送同款）。
      // ★曾播 menuOpen(UI 菜单声)——"原键名拼错"的修补方向反了，应改真轨（审计 #22）
      game.playSfxFiles(['Item_8'], 1, e.cx, e.cy);
      game.spawnParticles(e.cx, e.cy, '#C060FF', 20, 3, { life: 40 });
    }
    e.ai3 -= 1;
    if (e.ai3 <= 0) e.dead = true;
    return;
  }
  if (!p) return;
  const los = losClear(game, e.cx, e.cy, p.cx, p.cy); // flag103(:41581)
  // 瞄点 = Center+(direction*20,6)(:41578-41580)
  const ax = e.cx + dir * 20, ay = e.cy + 6;
  const tdx = p.cx - ax, tdy = p.cy - ay;
  const td = Math.hypot(tdx, tdy);
  let hover = false;
  if (td > 400 || !los) {
    // 追击(:41603-41613):7 速钳制,30 步进
    let mx = tdx, my = tdy;
    const m = Math.hypot(mx, my);
    if (m > SPD) { mx = (mx / m) * SPD; my = (my / m) * SPD; }
    e.vx = (e.vx * 29 + mx) / 30;
    e.vy = (e.vy * 29 + my) / 30;
  } else {
    e.vx *= 0.98; e.vy *= 0.98;                       // 视线内滞空缓降(:41615-41618)
    hover = true;
  }
  // ---- 瞬移执行段(:41620-41644)：起终双端 Item8 + 尘 242 各 20（scale2.5 初速 ×3）----
  if (e.ai2 !== 0 && e.ai3 !== 0) {
    game.playSfxFiles?.(['Item_8'], 1, e.cx, e.cy);   // :41620 旧位置
    game.spawnParticles(e.cx, e.cy, '#C060FF', 20, 3, { life: 40 });
    e.x = e.ai2 * 16 - e.w / 2;                       // Center=(ai[2]*16, ai[3]*16)
    e.y = e.ai3 * 16 - e.h / 2;
    e.vx = 0; e.vy = 0;
    e.ai2 = 0; e.ai3 = 0;
    game.playSfxFiles?.(['Item_8'], 1, e.cx, e.cy);   // :41633 新位置
    game.spawnParticles(e.cx, e.cy, '#C060FF', 20, 3, { life: 40 });
  }
  // ---- 瞬移周期(:41646-41693) ----
  e.ai0 += 1;
  if (e.ai0 >= TP_T) {
    e.ai0 = 0;
    const spot = findTeleportSpot(game, e, p);
    if (spot) {
      e.ai1 = 20;                                     // :41670(除 ==1 外无读者,照抄)
      e.ai2 = spot.x; e.ai3 = spot.y;
      // :41655-41674 flag105 门：若已有任一自有 574 球计时为负（上一轮 -30 未走完）
      // → 跳过本轮 -30（曾误读成"门恒假恒全量"——!(ai[0]>=0) 即 ai[0]<0，常态为假
      // 仅在已加速球上为真，门=防叠加）
      const orbs = (game as unknown as { entities: { projectiles?: LunarOrb[] } })
        .entities.projectiles;
      if (Array.isArray(orbs)) {
        const anyNeg = orbs.some((o) => !o.dead && o instanceof LunarOrb
          && o.kind === 574 && o.parentId === e.id && o.timer() < 0);
        if (!anyNeg) {
          for (const o of orbs) {
            if (!o.dead && o instanceof LunarOrb && o.kind === 574 && o.parentId === e.id) {
              o.delay(ORB_DELAY);
            }
          }
        }
      }
    }
  }
  if (hover && Math.hypot(e.vx, e.vy) < 2) lai[0] += 1;   // :41695-41700(无消费者,照抄)
  fly(e);                                             // noTileCollide=true
}

/** AI_099 日耀黏液 519(NPC.cs:41997-42056):自身重力 0.2(钳 12)坠落,贴图随速度
 *  转向;落地(vy==0)→ 5t 定格(每 tick 回退到 oldPosition)→ HitEffect 自爆消亡
 *  (active=false,不走掉落/扣盾)。519 专属火尘拖尾(6 号尘)。 */
export function solarSlimeAI(e: Enemy, game: GameHooks, _player: Player | null) {
  if (e.ai0 < 0) e.ai0 = 0;                           // Enemy 哨兵 -1120 归一,原版出生 0
  if (e.vy === 0 && e.ai0 === 0) {                    // :41999-42005 落地门
    e.ai0 = 1; e.ai1 = 0;
    return;
  }
  if (e.ai0 === 1) {
    // ---- 自爆定格(:42007-42014) ----
    e.vx = 0; e.vy = 0;
    e.x = e.prevX; e.y = e.prevY;                     // position=oldPosition
    e.ai1 += 1;
    if (e.ai1 >= 5) {
      game.spawnParticles(e.cx, e.cy, '#FFB060', 26, 3.4, { life: 34, damp: 0.95 });
      game.spawnParticles(e.cx, e.cy, '#FFE080', 18, 2.6, { life: 30, damp: 0.95 });
      e.dead = true;                                  // HitEffect(0,9999)+active=false
    }
    return;
  }
  e.vy = Math.min(e.vy + 0.2, 12);                    // :42016-42020
  e.visAngle = Math.atan2(e.vy, e.vx) - Math.PI / 2;  // rotation(:42022)
  // 519 火尘(:42026-42055):首帧 13 粒爆发 + 每帧 3 粒 2/3 概率
  if (lai0Of(e) === 0) {
    setLai0(e, 1);
    game.spawnParticles(e.cx, e.cy, '#FF9A3C', 13, 2.2, { life: 40, damp: 0.94 });
  }
  if (rnd(3) < 2) game.spawnParticles(e.cx, e.cy, Math.random() < 0.7 ? '#FF9A3C' : '#FFD24A',
    1, 1.4, { life: 30, damp: 0.94 });
  moveAndCollide(e, game.world, e.vx, e.vy);
}

/** 519 火尘首帧门(localAI[0] 复用) */
function lai0Of(e: Enemy): number { return lunarLocalAI(e)[0]; }
function setLai0(e: Enemy, v: number): void { lunarLocalAI(e)[0] = v; }

// ---------------------------------------------------------------------------
// AI_006 爬尾虫族 412/413/414（NPC.cs:51357-52671 的 412 专属段，1.4.5.6 1:1）
//   头 412 首帧自建 30 段链（29×413 身 + 1×414 尾，:51764-51785 num35=30），
//   全链 realLife=头（:51770/:51782——受击传导扣头 10000 总血，段不可单杀）；
//   空泳追击环（flag3 恒 true :51955-51957）：玩家下方 15 格内有地面 → 目标改为
//   地面上方 800px 悬停线，|dx|<500 时再沿速度向外推 ±600px 环绕（:52198-52208）；
//   玩家悬空（下方无地）→ 直追且提速 10/0.3 → 14/0.5（:52211-52214）；
//   速度带钳 [0.7n,1.3n]（:52216-52230）；同族头分离（:52232-52254，60/200 或
//   400/1000）；段链收缩 linkDist = width+6（:52292-52294）；头火尘双粒（:52050-52067）。
//   段完整性 + 414 红闪原版由各段独立跑 AI_006 承担；本仓段（wormBody）跳过 AI
//   分发 → 头循环代行（:51807-51819 身/尾查前段 / :51850-51862 头/身查下段）。
// ---------------------------------------------------------------------------

/** 414 尾受击红闪一步（NPC.cs:52026-52047 纯函数化，仅 type 414）：
 *  受击 → localAI[3]=3；localAI[2]>0 每 tick −16、过零翻 −128；负段 +16 回 0；
 *  归零且 localAI[3]>0 → 重发 128 并消耗一发。渲染侧
 *  Renderer.npcGlowCrawltipedeFlash 消费 e.lai2（n=trunc，负段 n=128+trunc，
 *  RGB=(255-n,n,n)、A=255-n）——AI 侧必须按本节奏写 lai2，否则 Glow_159 红闪
 *  永不触发。 */
export function crawltipedeFlashStep(
  lai2: number, lai3: number, justHit: boolean,
): { lai2: number; lai3: number } {
  if (justHit) lai3 = 3;                                              // :52027-52029 受击装填 3 发
  if (lai2 > 0) {
    lai2 -= 16;                                                       // :52030-52033 正段衰减
    if (lai2 === 0) lai2 = -128;                                      // :52033-52035 过零翻转
  } else if (lai2 < 0) {
    lai2 += 16;                                                       // :52038-52040 负段回升
  } else if (lai3 > 0) {
    lai2 = 128;                                                       // :52041-52045 归零且有存货 → 重发
    lai3 -= 1;
  }
  return { lai2, lai3 };
}

export function crawltipedeAI(e: Enemy, game: GameHooks, player: Player | null): void {
  if (!e.bInit) {
    e.bInit = true;
    // :51764-51785 头首帧建链：num35=30 段（末段 414，其余 413）
    const segs = enemySpawnChain(e, 30);
    e.realLifeHost = e;
    for (const s of segs) { s.realLifeHost = e; addEnemy(game, s); }
  }
  const st = game.world.store;
  // ---- 段完整性与 414 红闪（原版各段独立自查，头循环代行）----
  if (!e.wormNext || e.wormNext.dead) { e.die(game); return; }        // :51850-51862 头下段失效自灭
  for (let s = e.wormNext; s; s = s.wormNext!) {
    if (s.dead) continue;
    const prevDead = !s.wormFollow || s.wormFollow.dead;              // :51807-51819（413/414 查前段）
    const nextDead = s.vanillaId === 413 && (!s.wormNext || s.wormNext.dead); // :51850-51862（413 查下段）
    if (prevDead || nextDead) { s.die(game); continue; }              // 同 tick 逐段级联
    if (s.vanillaId === 414) {                                        // :52026-52047 尾段红闪
      const f = crawltipedeFlashStep(s.lai2, s.lai3, s.justHit);
      s.lai2 = f.lai2; s.lai3 = f.lai3;
    }
  }
  // 无目标：缓漂（与 Enemy.wormAI 同近似，原版 TargetClosest 指向死亡槽位照飞）
  if (!player) {
    e.vx *= 0.97; e.vy *= 0.97;
    e.x += e.vx; e.y += e.vy;
    e.visAngle = Math.atan2(e.vy, e.vx) + Math.PI * 0.5;
    return;
  }
  // ---- 头火尘双粒（:52050-52067：Center + (rotation−π/2)±8 ± rotation 向量×16，
  //      位居舵机/rotation 赋值之前 → 读上一 tick 的 rotation，与本处取值一致）----
  {
    const fw = e.visAngle - Math.PI * 0.5;                            // (rotation − π/2).ToRotationVector2()
    const mv = e.visAngle;                                            // rotation.ToRotationVector2()
    game.spawnParticles(
      e.cx + Math.cos(fw) * 8 + Math.cos(mv) * 16,
      e.cy + Math.sin(fw) * 8 + Math.sin(mv) * 16,
      '#FF9A3C', 1, 0.4, { life: 26, damp: 0.94 });
    game.spawnParticles(
      e.cx + Math.cos(fw) * 8 - Math.cos(mv) * 16,
      e.cy + Math.sin(fw) * 8 - Math.sin(mv) * 16,
      '#FF9A3C', 1, 0.4, { life: 26, damp: 0.94 });
  }
  // ---- 412 目标覆写（:52176-52254）----
  let num46 = 10, num47 = 0.3;                                        // :52178-52179 基础速/加速
  let tx = player.cx, ty = player.cy;                                 // num49/num50 初值 = 玩家中心（:52173-52175）
  const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
  let groundRow = -1;                                                 // num51：玩家下方首个实心行（:52180）
  for (let dx = -2; dx <= 2; dx++) {                                  // :52183-52191 列 ±2 × 下 15 格
    for (let dy = 0; dy <= 15; dy++) {
      // WorldGen.SolidTile2（WorldGen.cs:70178——null tile 视为实心）→ 世界外按实心
      if (!st.inBounds(ptx + dx, pty + dy) || st.isSolid(ptx + dx, pty + dy)) {
        groundRow = pty + dy;
        break;
      }
    }
    if (groundRow > 0) break;                                         // :52193-52196 仅正行号中断外层
  }
  let sepDist = 60, sepPush = 200;                                    // num60/num61（:52232-52233）
  if (groundRow > 0) {
    const hoverY = groundRow * TILE - 800;                            // :52200-52201 num56 = num51×16 − 800
    if (player.y > hoverY) {                                          // :52202 玩家顶低于悬停线
      ty = hoverY;                                                    // :52204 目标改悬停线
      if (Math.abs(e.cx - player.cx) < 500) {                         // :52205
        tx = e.vx > 0 ? player.cx + 600 : player.cx - 600;            // :52207 沿速度向外推 600px 环绕
      }
    }
    sepDist = 400; sepPush = 1000;                                    // :52234-52237 有地 → 分离加强
  } else {
    num46 = 14; num47 = 0.5;                                          // :52211-52214 玩家悬空 → 直追提速
  }
  // ---- 速度带钳 [0.7n, 1.3n]（:52216-52230，舵机前的存量速度）----
  const spd = Math.hypot(e.vx, e.vy);
  if (spd > 0) {
    if (spd > num46 * 1.3) { e.vx = (e.vx / spd) * num46 * 1.3; e.vy = (e.vy / spd) * num46 * 1.3; }
    else if (spd < num46 * 0.7) { e.vx = (e.vx / spd) * num46 * 0.7; e.vy = (e.vy / spd) * num46 * 0.7; }
  }
  // ---- 同族头分离（:52239-52254）：目标点沿远离方向推 sepPush ----
  for (const o of enemies(game)) {
    if (o === e || o.dead || o.vanillaId !== 412) continue;
    const d = Math.hypot(o.cx - e.cx, o.cy - e.cy);
    if (d > 0.01 && d < sepDist) {
      tx -= ((o.cx - e.cx) / d) * sepPush;
      ty -= ((o.cy - e.cy) / d) * sepPush;
    }
  }
  // ---- 16px 量化（:52254-52259）----
  const dxq = Math.floor(tx / TILE) * TILE - Math.floor(e.cx / TILE) * TILE;
  const dyq = Math.floor(ty / TILE) * TILE - Math.floor(e.cy / TILE) * TILE;
  // ---- 期望速度向量（:52396-52401 num68 = num46/num63）----
  const dist = Math.hypot(dxq, dyq) || 1;
  const ax = Math.abs(dxq), ay = Math.abs(dyq);                       // num66/num67（:52397-52398，均匀缩放下比较不变）
  const wantX = (dxq / dist) * num46, wantY = (dyq / dist) * num46;
  const step = num47;
  // ---- 舵机（:52511-52583 的 !flag8 分支；flag8 仅 87/454/621 置位，412 恒 false）----
  if ((e.vx > 0 && wantX > 0) || (e.vx < 0 && wantX < 0)
    || (e.vy > 0 && wantY > 0) || (e.vy < 0 && wantY < 0)) {
    if (e.vx < wantX) e.vx += step; else if (e.vx > wantX) e.vx -= step;
    if (e.vy < wantY) e.vy += step; else if (e.vy > wantY) e.vy -= step;
    if (Math.abs(wantY) < num46 * 0.2 && ((e.vx > 0 && wantX < 0) || (e.vx < 0 && wantX > 0))) {
      if (e.vy > 0) e.vy += step * 2; else e.vy -= step * 2;
    }
    if (Math.abs(wantX) < num46 * 0.2 && ((e.vy > 0 && wantY < 0) || (e.vy < 0 && wantY > 0))) {
      if (e.vx > 0) e.vx += step * 2; else e.vx -= step * 2;
    }
  } else if (ax > ay) {
    if (e.vx < wantX) e.vx += step * 1.1; else if (e.vx > wantX) e.vx -= step * 1.1;
    if (Math.abs(e.vx) + Math.abs(e.vy) < num46 * 0.5) {
      if (e.vy > 0) e.vy += step; else e.vy -= step;
    }
  } else {
    if (e.vy < wantY) e.vy += step * 1.1; else if (e.vy > wantY) e.vy -= step * 1.1;
    if (Math.abs(e.vx) + Math.abs(e.vy) < num46 * 0.5) {
      if (e.vx > 0) e.vx += step; else e.vx -= step;
    }
  }
  e.facing = e.vx > 0 ? 1 : -1;
  e.visAngle = Math.atan2(e.vy, e.vx) + Math.PI * 0.5;                // :52600 头 rotation
  // ---- 位移（noTileCollide 直积分）----
  e.x += e.vx; e.y += e.vy;
  // ---- 段链收缩跟随（:52266-52323：rotation :52277 / num64=width+6 :52292-52294 /
  for (let s = e.wormNext; s && !s.dead; s = s.wormNext!) {
    const fx = s.wormFollow!;
    const dxC = fx.cx - s.cx, dyC = fx.cy - s.cy;
    const d = Math.hypot(dxC, dyC);
    if (d > 0.01) {
      const shrink = (d - (s.w + 6)) / d;                             // :52304 收缩比 = (dist−num64)/dist
      s.x += dxC * shrink;
      s.y += dyC * shrink;
      s.visAngle = Math.atan2(dyC, dxC) + Math.PI * 0.5;              // :52277
    }
    s.facing = dxC < 0 ? 1 : -1;
    s.vx = 0; s.vy = 0;                                               // :52307 velocity = Vector2.Zero
  }
}

// ---------------------------------------------------------------------------
// 环绕球投射物 539/574(Projectile.cs:5864-5878 SetDefaults + AI_102 :32040-32280)
//  539(水流入侵者 407 甩出):绕父 407 盘旋 210t(0.15/0.075 符号步进钳 6,随父位移),
//    到点取最近玩家方向(±50px 抖动 ×0.8-1.2)以 16 速直冲;亡时(撞块/到期)80×80
//    范围 60 伤(:69366-69405)。
//  574(悬浮脑 420 环绕):随 420 存活;每 180t 且对玩家 CanHitLine → 线发 576 弹
//    (8 速 65 伤)后重置计时继续盘旋;悬浮脑瞬移时全量计时 -30(accelerate)。
// ---------------------------------------------------------------------------
export class LunarOrb extends Entity {
  w = 18; h = 18;
  vx: number; vy: number;
  readonly kind: 539 | 574;
  readonly parentId: number;
  /** v6 联机：父体 netId（访客端父=msg23 傀儡；0=本端真身走 parentId 查找） */
  parentNetId = 0;
  private ai0 = 0;
  private dmg: number;
  private life = 600;
  private frame = 0;
  private frameT = 0;
  dead = false;

  constructor(parent: Enemy | null, kind: 539 | 574, vx: number, vy: number, dmg: number, x?: number, y?: number) {
    super();
    this.kind = kind;
    this.parentId = parent?.id ?? 0;
    this.vx = vx; this.vy = vy;
    this.dmg = dmg;
    if (kind === 539) { this.w = 18; this.h = 30; }
    // v6 傀儡重建：parent=null 时由调用方传显式坐标
    this.x = (x ?? parent!.cx) - this.w / 2;
    this.y = (y ?? parent!.cy) - this.h / 2;
  }

  /** v6 联机打包：kind=8，tag=`${539|574},${parentId}`。
   *  访客重建后本地跑盘旋/冲刺/爆炸（确定性自包含，父=傀儡）；
   *  574 的线发 576 弹经 !netPuppet 门禁排除（房主侧已发） */
  netProjMeta(): NetProjMeta {
    return { kind: 8, tag: `${this.kind},${this.parentId}`, aux: 0, dmg: this.dmg };
  }

  /** 悬浮脑瞬移同步:全场计时 -30(:41682-41691) */
  delay(t: number): void { this.ai0 -= t; }

  /** 当前 ai[0] 计时（悬浮脑瞬移的负计时球门读,:41659） */
  timer(): number { return this.ai0; }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // v6 联机：傀儡端按 netId 找父（msg23 傀儡）；本端真身按本地 id
    const parent = this.parentNetId
      ? (game.enemies() as Enemy[]).find((n) => n.netId === this.parentNetId)
      : (game.enemies() as Enemy[]).find((n) => n.id === this.parentId);
    const orbitT = this.kind === 539 ? 210 : 180;
    const alive = !!parent && !parent.dead;
    if (this.kind === 574 && !alive) { this.dead = true; return; }   // :32083-32092
    this.ai0 += 1;
    // 574 随父存续（:32092 每 tick timeLeft=2 刷新,自身永不过期——父亡已在上行 Kill）
    if (this.kind === 574) this.life = 2;
    if (this.life-- <= 0) { this.explode(game); return; }
    if (this.ai0 < orbitT) {
      if (alive) {
        // 盘旋:随父位移 + 符号步进逼近父心(钳 6)(:32100-32118)
        this.x += parent!.x - parent!.prevX;
        this.y += parent!.y - parent!.prevY;
        this.vx += Math.sign(parent!.cx - this.cx) * 0.15;
        this.vy += Math.sign(parent!.cy - this.cy) * 0.075;
        const v = Math.hypot(this.vx, this.vy);
        if (v > 6) { this.vx = (this.vx / v) * 6; this.vy = (this.vy / v) * 6; }
        if (this.kind === 539 && ++this.frameT >= 4) { this.frameT = 0; this.frame++; }
      } else {
        // :32106-32110 父亡（仅 539）→ 计时直接置满 → 同 tick 落入下方冲刺分支立即开冲
        this.ai0 = orbitT;
      }
    }
    if (this.ai0 === orbitT) {
      const p = game.player;
      if (this.kind === 539) {
        // 直冲最近玩家(:32185-32212):方向 ±50px 抖动 ×0.8-1.2,16 速
        const tx = p.cx + (Math.random() * 100 - 50), ty = p.cy + (Math.random() * 100 - 50);
        const kx = 0.8 + Math.random() * 0.4, ky = 0.8 + Math.random() * 0.4;
        const dx = (tx - this.cx) * kx, dy = (ty - this.cy) * ky;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 16; this.vy = (dy / d) * 16;
      } else {
        // 线发 576 弹(:32204-32211):CanHitLine 门,8 速 65 伤;发射后重置计时。
        // v6 傀儡不本地线发——房主的 576 弹经 msg27 同步,双端各发会翻倍
        if (!this.netPuppet && !p.dead && canHitLine(game.world.store, this.cx, this.cy, 0, 0, p.cx, p.cy, 0, 0)) {
          const dx = p.cx - this.cx, dy = p.cy - this.cy;
          const d = Math.hypot(dx, dy) || 1;
          (game as unknown as { entities: { add: (x: unknown, b: string) => void } }).entities.add(
            new Arrow(this.cx, this.cy, (dx / d) * 8, (dy / d) * 8, 65, 0, 576, null,
              { grav: 0, life: 600, pierce: 1, hostile: true }), 'projectiles');
        }
        this.ai0 = 0;
      }
    }
    if (this.kind === 539 && this.ai0 > orbitT && ++this.frameT >= 2) {
      this.frameT = 0; this.frame++;                  // 冲刺段帧率加倍(:32227-32235)
    }
    this.x += this.vx; this.y += this.vy;             // 539 tileCollide / 574 穿墙
    if (this.kind === 539) {
      const st = game.world.store;
      const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty)) { this.explode(game); return; }
    }
  }

  /** 539 亡时 80×80 范围伤害 + 尘爆(:69366-69405) */
  private explode(game: GameHooks): void {
    this.dead = true;
    game.spawnParticles(this.cx, this.cy, '#8FE8FF', 20, 3.4, { life: 40, damp: 0.94 });
    game.spawnParticles(this.cx, this.cy, '#4FB8E8', 10, 2.2, { life: 36, damp: 0.94 });
    const p = game.player;
    if (p && !p.dead && this.dmg > 0) {
      const half = 40;                                // 80×80 居中
      if (p.x < this.cx + half && p.x + p.w > this.cx - half
        && p.y < this.cy + half && p.y + p.h > this.cy - half) {
        game.damagePlayer(this.dmg, this.cx, this.cy, null);
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    const img = projFrameImg(this.kind, this.kind === 574 ? 1 : this.frame);
    ctx.save();
    ctx.translate(this.cx, this.cy);
    // 539 旋转分两段（AI_102）：盘旋期 vx*0.1（:32135）/冲刺期向 ToRotation+π/2 收敛
    // （:32230 AngleLerp 0.4）;574 向瞄准向 ToRotation+π/2 收敛（:32167）。此处 539 恒用
    // 盘旋档（冲刺段姿态差登记偏差）
    ctx.rotate(this.kind === 539 ? this.vx * 0.1 : Math.atan2(this.vy, this.vx) + Math.PI / 2);
    ctx.imageSmoothingEnabled = false;
    if (img) {
      // 原生帧 × scale=1（SetDefaults 539/574 无 scale;origin = 帧格 Size/2,Main.cs:32812
      // 列表族 :32889）。曾归一到判定盒 18×30/18×18 → 539 纵横比失真（G11）
      ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);
    } else {
      ctx.fillStyle = this.kind === 539 ? '#8FE8FF' : '#C060FF';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }
}

// ===================== 星旋塔传送门弹 578/579（aiStyle 108，Projectile.cs:32505-32805） =====================
// 塔侧生成（Enemy.towerAI 422 段，NPC.cs:41336-41406）：支线 a = 玩家头顶门
// （579 生 2× Alien Hornet 427 / 578 放 580 电击）；支线 b = 玩家 ±20 格随机
// 空中点 579 门。SetDefaults（:6002-6012）：32×32 / tileCollide=false / alpha 255 /
// ignoreWater（friendly+hostile 同置——damage=0 无结算面）。
// 生命周期（ai0，1:1）：开门爆尘（ai1==1 → 25 颗 229/161 尘 ×3.5 速，:32508-32523，
// 579 开门当帧置 ai1=1、次帧爆）→ 首帧 Item_117（:32524-32528）→ 578 首帧定朝向
// （ai1 = 门→最近玩家角，:32529-32538）→ ≤50t 隐形聚尘（579 双环尘 229/240、578 沿
// 朝向喷流，:32541-32599）→ 51-90t 显形（scale=(ai0−50)/40、alpha=255×(1−scale)、
// rotation−π/20/t；恰 90t 播 Item_113（578/579）并【开门】：578 → 生成 580 电击弹
// （50 伤，速度=朝向×8，出生点=门心−速度向量，ai0=朝向角、ai1=Next(80) 种子，
// :32650-32660）；579 → 生 2× NPC427（门心 Bottom 锚，速度=−UnitY.RotatedByRandom
// (2π)×Next(4,9)−UnitY×2，:32661-32676）→ 91-120t 满显（scale 1/alpha 0/
// rotation−π/60，环尘 customData=门心，:32677-32712）→ 121-180t 收缩淡出
// （scale=1−(ai0−120)/60、alpha 递增、rotation−π/30；alpha≥255 Kill，:32713-32755）。
// 绘制（Main.cs:32622-32650）：Extra_50 涡旋三层（−rot+0.35 暗色 ×(0.6+scale×0.6×
// num347) / −rot ×scale / rot×0.5 ×scale×0.9）+ Projectile_578/579.png（−rot×0.7，
// α×0.4），num347=0.95+sin(rotation×0.75)×0.1。
/** Extra_50（60×60 星旋涡旋）懒加载 */
let portalSwirlImg: ImageBitmap | HTMLImageElement | null = null;
let portalSwirlTried = false;
function extra50(): ImageBitmap | HTMLImageElement | null {
  if (portalSwirlTried) return portalSwirlImg;
  portalSwirlTried = true;
  if (typeof Image === 'undefined') return null;
  const im = new Image();
  im.onload = () => upgradeToBitmap(im, (b) => { portalSwirlImg = b; });
  im.src = 'sprites/vanilla/Extra_50.png';
  portalSwirlImg = im;
  return im;
}

export class VortexPortalProj extends Entity {
  readonly projId: number;         // 578 / 579
  w = 32; h = 32;                  // SetDefaults :6003-6004
  private ai0 = 0;
  /** 578：门朝向角（首帧定）；579：开门爆尘标记（1=待爆） */
  private ai1 = 0;
  private lai0 = 0;                // localAI[0]：578 朝向初始化门
  private alpha = 255;
  private scale = 1;
  private rot = 0;
  private sndPlayed = false;       // localAI[1]

  /** x/y = NewProjectile 的 X/Y（中心锚，:10258）；type ∈ {578, 579} */
  constructor(x: number, y: number, projId: 578 | 579) {
    super();
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.projId = projId;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    // 开门爆尘（:32508-32523）：ai1==1 → 25 颗尘（229/229/161 掷、×3.5..4 速、scale
    // 1.75+1.25r、fadeIn 0.25、noLight）
    if (this.ai1 === 1) {
      this.ai1 = 0;
      for (let i = 0; i < 25; i++) {
        const type = [229, 229, 161][(Math.random() * 3) | 0];   // SelectRandom
        const d = game.spawnDust?.(this.x, this.y, this.w, this.h, type, 0, 0, 0, null,
          1.75 + Math.random() * 1.25);
        if (d) {
          d.vx *= 3.5 + Math.random() * 0.5;
          d.vy *= 3.5 + Math.random() * 0.5;
          d.fadeIn = 0.25;
          d.noLight = true;
        }
      }
    }
    if (!this.sndPlayed) {                                       // :32524-32528
      this.sndPlayed = true;
      game.playSfxWav?.('Item_117', 1, this.x, this.y);
    }
    // 578 首帧定朝向（:32529-32538）：门心→最近玩家角（零向量兜底 UnitY）
    if (this.projId === 578 && this.lai0 === 0) {
      this.lai0 = 1;
      const p = game.player;
      let dx = 0, dy = 1;
      if (p) { dx = p.cx - this.cx; dy = p.cy - this.cy; }
      if (dx === 0 && dy === 0) { dx = 0; dy = 1; }
      this.ai1 = Math.atan2(dy, dx);
    }
    this.ai0++;
    const em = (game as unknown as { entities: { add: (e: Entity, b: string) => void } }).entities;
    if (this.ai0 <= 50) {
      // ---- 聚尘段（:32541-32599；全隐形 alpha 255）----
      if (this.projId === 579) {
        for (let k = 0; k < 2; k++) {           // :32541-32562 双环尘（各 1/4 掷）
          if (Math.floor(Math.random() * 4) === 0) {
            const a = Math.random() * TAU;
            const [ux, uy] = [Math.sin(a), Math.cos(a)];          // UnitY.RotatedByRandom(2π) 近似
            const d = game.spawnDust?.(this.cx - ux * 30, this.cy - uy * 30, 0, 0, 229, 0, 0, 0, null, 1, true);
            if (d) {
              d.x = this.cx - ux * (10 + Math.floor(Math.random() * 11));   // Next(10,21)
              d.y = this.cy - uy * (10 + Math.floor(Math.random() * 11));
              d.vx = -uy * 4; d.vy = ux * 4;      // RotatedBy(+π/2)×4
              d.scale = 0.5 + Math.random();
              d.fadeIn = 0.5;
            }
          }
          if (Math.floor(Math.random() * 4) === 0) {
            const a = Math.random() * TAU;
            const [ux, uy] = [Math.sin(a), Math.cos(a)];
            const d = game.spawnDust?.(this.cx - ux * 30, this.cy - uy * 30, 0, 0, 240, 0, 0, 0, null, 1, true);
            if (d) {
              d.x = this.cx - ux * 30; d.y = this.cy - uy * 30;
              d.vx = uy * 2; d.vy = -ux * 2;       // RotatedBy(−π/2)×2
              d.scale = 0.5 + Math.random();
              d.fadeIn = 0.5;
            }
          }
        }
      } else if (Math.floor(Math.random() * 2) === 0) {
        // 578 沿朝向喷流（:32564-32594）
        const ang = this.ai1;
        const fx = Math.cos(ang), fy = Math.sin(ang);             // ai1.ToRotationVector2()
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = 10 + Math.floor(Math.random() * 11);          // Next(10,21)
        const px = -fy * side * off, py = fx * side * off;        // 旋 π/2 ×±
        const along1 = Math.floor(Math.random() * 161) - 80;      // Next(-80,81)
        const d1 = game.spawnDust?.(this.cx + px, this.cy + py, 0, 0, 229, 0, 0, 0, null, 1, true);
        if (d1) {
          d1.x = this.cx + px; d1.y = this.cy + py;
          d1.vx = (along1 * fx - px) / 10; d1.vy = (along1 * fy - py) / 10;
          d1.scale = 0.5 + Math.random();
          d1.fadeIn = 0.5;
        }
        const along2 = 40 + Math.floor(Math.random() * 81);       // Next(40,121)
        const d2 = game.spawnDust?.(this.cx + px / 2, this.cy + py / 2, 0, 0, 229, 0, 0, 0, null, 1, true);
        if (d2) {
          d2.x = this.cx + px / 2; d2.y = this.cy + py / 2;
          d2.vx = (along2 * fx - px / 2) / 10; d2.vy = (along2 * fy - py / 2) / 10;
          d2.scale = 1 + Math.random();
        }
      }
    } else if (this.ai0 <= 90) {
      // ---- 显形段（:32600-32676）：50→90t 张开 ----
      if (this.ai0 === 90) game.playSfxWav?.('Item_113', 1, this.x, this.y);   // :32604-32612
      this.scale = (this.ai0 - 50) / 40;
      this.alpha = 255 - Math.round(255 * this.scale);
      this.rot -= Math.PI / 20;
      if (this.projId === 579) {
        // :32624-32649 开门段尘（1/2 掷、速度 ×6/×3、customData=门心）
        if (Math.random() < 0.5) {
          const a = Math.random() * TAU;
          const [ux, uy] = [Math.sin(a), Math.cos(a)];
          const d = game.spawnDust?.(this.cx - ux * 30, this.cy - uy * 30, 0, 0, 229, 0, 0, 0, null, 1, true);
          if (d) {
            d.x = this.cx - ux * (10 + Math.floor(Math.random() * 11));
            d.y = this.cy - uy * (10 + Math.floor(Math.random() * 11));
            d.vx = -uy * 6; d.vy = ux * 6;        // RotatedBy(+π/2)×6
            d.scale = 0.5 + Math.random();
            d.fadeIn = 0.5;
          }
        }
        if (Math.random() < 0.5) {
          const a = Math.random() * TAU;
          const [ux, uy] = [Math.sin(a), Math.cos(a)];
          const d = game.spawnDust?.(this.cx - ux * 30, this.cy - uy * 30, 0, 0, 240, 0, 0, 0, null, 1, true);
          if (d) {
            d.x = this.cx - ux * 30; d.y = this.cy - uy * 30;
            d.vx = uy * 3; d.vy = -ux * 3;        // RotatedBy(−π/2)×3
            d.scale = 0.5 + Math.random();
            d.fadeIn = 0.5;
          }
        }
      } else {
        // 578 喷流尘（每 tick 恒 1 颗，:32652-32663）
        const ang = this.ai1;
        const fx = Math.cos(ang), fy = Math.sin(ang);
        const side = Math.random() < 0.5 ? -1 : 1;
        const off = 10 + Math.floor(Math.random() * 11);
        const px = -fy * side * off, py = fx * side * off;
        const along = Math.floor(Math.random() * 161) - 80;
        const d = game.spawnDust?.(this.cx + px, this.cy + py, 0, 0, 229, 0, 0, 0, null, 1, true);
        if (d) {
          d.x = this.cx + px; d.y = this.cy + py;
          d.vx = (along * fx - px) / 10; d.vy = (along * fy - py) / 10;
          d.scale = 0.5 + Math.random();
          d.fadeIn = 0.5;
        }
      }
      // ---- 恰 90t 开门（:32650-32676）----
      if (this.ai0 === 90) {
        if (this.projId === 578) {
          // 580 电击弹（:32650-32660）：出生点=门心−朝向×8、速度=朝向×8、50 伤、
          // ai0=朝向角、ai1=Next(80) 种子
          const fx = Math.cos(this.ai1) * 8, fy = Math.sin(this.ai1) * 8;
          em.add(new LightningBoltProj(this.cx - fx, this.cy - fy, fx, fy, 580, 50,
            this.ai1, Math.floor(Math.random() * 80)), 'projectiles');
        } else {
          // 2× Alien Hornet 427（:32661-32676）：门心 Bottom 锚（NewNPC :81547），
          // 速度=−UnitY.RotatedByRandom(2π)×Next(4,9)−UnitY×2
          this.ai1 = 1;                       // 次帧开门爆尘
          for (let i = 0; i < 2; i++) {
            const hornet = spawnVanillaEnemy(game, 427, this.cx, this.cy);
            if (!hornet) continue;
            hornet.y -= hornet.h / 2;         // 中心锚 → Bottom 锚换算
            const a = Math.random() * TAU;
            const sp = 4 + Math.random() * 5;  // Next(4,9)
            hornet.vx = Math.sin(a) * sp;      // −UnitY 旋转 a：(sin a, −cos a)
            hornet.vy = -Math.cos(a) * sp - 2;
          }
        }
      }
    } else if (this.ai0 <= 120) {
      // ---- 满显段（:32677-32712）----
      this.scale = 1;
      this.alpha = 0;
      this.rot -= Math.PI / 60;
      if (Math.random() < 0.5) {
        const a = Math.random() * TAU;
        const [ux, uy] = [Math.sin(a), Math.cos(a)];
        const type = Math.random() < 0.5 ? 229 : 240;
        const d = game.spawnDust?.(this.cx - ux * 30, this.cy - uy * 30, 0, 0, type, 0, 0, 0, null, 1, true);
        if (d) {
          if (type === 229) {
            d.x = this.cx - ux * (10 + Math.floor(Math.random() * 11));
            d.y = this.cy - uy * (10 + Math.floor(Math.random() * 11));
            d.vx = -uy * 6; d.vy = ux * 6;        // RotatedBy(+π/2)×6
          } else {
            d.x = this.cx - ux * 30; d.y = this.cy - uy * 30;
            d.vx = uy * 3; d.vy = -ux * 3;        // RotatedBy(−π/2)×3
          }
          d.scale = 0.5 + Math.random();
          d.fadeIn = 0.5;
        }
      }
    } else {
      // ---- 收缩淡出段（:32713-32755）----
      this.scale = 1 - (this.ai0 - 120) / 60;
      this.alpha = 255 - Math.round(255 * this.scale);
      this.rot -= Math.PI / 30;
      if (this.alpha >= 255) { this.dead = true; return; }
      if (Math.random() < 0.5) {
        const a = Math.random() * TAU;
        const [ux, uy] = [Math.sin(a) * this.scale, Math.cos(a) * this.scale];
        const type = Math.random() < 0.5 ? 229 : 240;
        const d = game.spawnDust?.(this.cx - ux * 30, this.cy - uy * 30, 0, 0, type, 0, 0, 0, null, 1, true);
        if (d) {
          if (type === 229) {
            d.x = this.cx - ux * (10 + Math.floor(Math.random() * 11));
            d.y = this.cy - uy * (10 + Math.floor(Math.random() * 11));
            d.vx = -uy * 6; d.vy = ux * 6;        // RotatedBy(+π/2)×6
          } else {
            d.x = this.cx - ux * 30; d.y = this.cy - uy * 30;
            d.vx = uy * 3; d.vy = -ux * 3;        // RotatedBy(−π/2)×3
          }
          d.scale = 0.5 + Math.random();
          d.fadeIn = 0.5;
        }
      }
    }
  }

  draw(r: Renderer, _cam: Camera): void {
    // Main.cs:32622-32650：Extra_50 涡旋三层 + 本体贴图（−rot×0.7、α×0.4）
    const ctx = r.ctx;
    if (!ctx) return;
    const opacity = (255 - this.alpha) / 255;
    if (opacity <= 0) return;
    const swirl = extra50();
    const img = projSprite(this.projId);
    const num347 = 0.95 + Math.sin(this.rot * 0.75) * 0.1;   // (rot*0.75).ToRotationVector2().Y
    const scale11 = 0.6 + this.scale * 0.6 * num347;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = opacity;
    ctx.translate(this.cx, this.cy);
    const drawSwirl = (rotA: number, s: number, dim: number) => {
      if (!swirl || !(swirl.width > 0)) return;
      if (dim < 1) ctx.globalAlpha = opacity * dim;
      const sz = 60 * s;
      ctx.save();
      ctx.rotate(rotA);
      ctx.drawImage(swirl, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
      ctx.globalAlpha = opacity;
    };
    drawSwirl(-this.rot + 0.35, scale11, 0.5);   // 暗层（Lerp(色,黑,0.5) 近似）
    drawSwirl(-this.rot, this.scale, 1);
    if (img && img.width > 0) {
      ctx.save();
      ctx.rotate(-this.rot * 0.7);
      ctx.globalAlpha = opacity * 0.4;           // color90：×0.8 且 A/2
      const sz = Math.max(img.width, img.height) * this.scale;
      ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz);
      ctx.restore();
      ctx.globalAlpha = opacity;
    }
    drawSwirl(this.rot * 0.5, this.scale * 0.9, 0.8);   // ×0.8 尾层
    ctx.restore();
  }
}
