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
//   bossAI_duke_moonlord 导出的 MLDeathray 类 'core' 档)。aiStyle 85(405 星细胞/
//   421 脑蛭/467 致命球体)四塔批已以 swarmerAI 近似落位(Enemy.ts case 85)——421 的
//   头顶吸附 Obstructed(buff 163)未实现,遗留。
// 弹幕贴图 Projectile_{452,454,462}.png 已入 sprites/vanilla(原 RENDER_PROXY 代渲退役,
//   见 shootL 注释);455 走 MLDeathray 类自绘;526 仪式粒子有贴图但带 ai[0..1] 归巢弹道,降级为粒子。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE, GRAVITY, MAX_FALL_SPEED } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { spawnPart, losClear } from './bossAI';
import { Arrow } from './Arrow';
import { MLDeathray } from './bossAI_duke_moonlord';

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
/** expert 门(本工程恒 false,Game.ts expertMode:false) */
const EXPERT = false;
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
// (弹 ai[0] 标记 + ai[1]=源 NPC)Arrow 无 ai 槽,不实装(按发射初速直飞)。
// ---------------------------------------------------------------------------
function shootL(
  game: GameHooks, x: number, y: number, vx: number, vy: number,
  dmg: number, projId: number, life = 300,
): void {
  (game as unknown as { entities: { add: (e: unknown, b: string) => void } }).entities.add(
    new Arrow(x, y, vx, vy, dmg, 0, projId, null, { grav: 0, life, pierce: 1 }),
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
  if (rnd(420) === 0) game.playSfx('roar', 0.15, e.cx, e.cy);   // :38227 SoundID 29(100-101)
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
    if (player) e.facing = player.cx > e.cx ? 1 : -1;
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
    if (t === 0 && player) e.facing = player.cx > e.cx ? 1 : -1;
    e.vx *= 0.95; e.vy *= 0.95;
    if (Math.hypot(e.vx, e.vy) < 1) { e.vx = 0; e.vy = 0; }
    const dx = pcx + (player ? player.vx : 0) * 20 - e.cx;
    const dy = pcy + (player ? player.vy : 0) * 20 - e.cy;
    x[0] = angleLerp(x[0], Math.atan2(dy, dx), 0.5);
    x[1] = Math.min(1, x[1] + 0.05);
    x[2] = lerp(x[2], t < 20 ? 1.1 : 0.4, 0.2);
    if (t === dur - 35) game.playSfx('roar', 0.3, e.cx, e.cy);   // :38389 SoundID 4 style 6
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
        shootL(game, e.cx + px, e.cy + py, ux * 4, uy * 4, 40, 454, 600);
      }
    } else if (t < 105) {
      // :38462-38485 瞄准升空(75t 起跳 vy=-7);原版同步给已发 454 叠加速度,Arrow 无弹 ai 槽,略
      x[0] = angleLerp(x[0], e.ai2 - Math.PI / 2, 0.2);
      x[2] = lerp(x[2], 0.75, 0.2);
      if (t === 75) { e.vx = 0; e.vy = -7; }
      e.vy *= 0.96;
      if (player) e.ai2 = Math.atan2(pcy - e.cy, pcx - e.cx) + Math.PI / 2;
      e.spin = angleTowards(e.spin, e.ai2, Math.PI / 30);
    } else if (t < 120) {
      // :38487-38505 发射:沿瞄准向 24 速冲出;已发 454 改归巢(ai[0]=-1),略
      game.playSfx('roar', 0.4, e.cx, e.cy);                 // :38487 SoundID 29 style 102
      e.vx = Math.cos(e.ai2 - Math.PI / 2) * 24;
      e.vy = Math.sin(e.ai2 - Math.PI / 2) * 24;
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
        // :38557-38563 弹 ai[3]=随机弧线扰动,Arrow 无 ai 槽,略
        shootL(game, e.cx + (ox / d) * 12, e.cy + (oy / d) * 12,
          (ox / d) * 8, (oy / d) * 8, 35, 452, 600);
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
    if (t === 0 && player) e.facing = player.cx > e.cx ? 1 : -1;
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
function ritualCheckFloor(game: GameHooks, cx: number, cy: number): Array<{ x: number; y: number }> | null {
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
      if (cultist) {
        cultist.x = tx * TILE + 10 - cultist.w / 2;
        cultist.y = ty * TILE - cultist.h;              // 原版顶锚 y=tileY*16-2,本仓落底对齐
        cultist.facing = Math.sign(e.cx - (tx * TILE + 10)) || 1;
        cultist.bInit = true;
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
  e.vy = Math.min(e.vy + GRAVITY, MAX_FALL_SPEED);
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
  e.vy = Math.min(e.vy + GRAVITY, MAX_FALL_SPEED);
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
      game.playSfx('roar', 0.3, e.cx, e.cy);             // SoundID.Item8
      if (player) e.facing = player.cx > e.cx ? 1 : -1;
      e.vx += e.facing * 2;
      if (!big) game.spawnParticles(e.cx, e.cy - 18, '#7A4BD0', 20, 4, { life: 30 });
    }
    x[3] += 1;
    if (big) game.spawnParticles(e.cx, e.cy, '#5A2BA0', 2, 1.5, { life: 20 });
  }
  // ---- 状态机(:39362-39509);原版 ai[0] 出生 0,Enemy 哨兵 -1120 归一 ----
  if (e.ai0 < 0 || e.ai0 > 3) e.ai0 = 0;
  if (e.ai0 === 0) {
    if (player) e.facing = player.cx > e.cx ? 1 : -1;
    e.ai0 = 1; e.ai1 = e.facing;
  } else if (e.ai0 === 1) {
    // 横掠:加速 0.3/0.7 封顶 7/14,纵轴 4/6 伺服;越玩家 660/500px → 2
    const acc = big ? 0.7 : 0.3, max = big ? 14 : 7;
    const yClamp = big ? 6 : 4, range = big ? 500 : 660, yStep = big ? 3 : 4;
    if (player) e.facing = player.cx > e.cx ? 1 : -1;
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
      if (player) e.facing = player.cx > e.cx ? 1 : -1;
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
      if (player) e.facing = player.cx > e.cx ? 1 : -1;
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
  const p = player && !player.dead ? player : null;
  const los = !!p && losClear(game, e.cx, e.cy, p.cx, p.cy);
  // ---- 玩家全灭 → 7 隐身僵坐(:39526-39534) ----
  if (e.ai0 !== 7 && !p) { e.ai0 = 7; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; }
  const grounded = () => {
    e.vy = Math.min(e.vy + GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(e, game.world, e.vx, e.vy);
  };

  if (e.ai0 === 0) {
    // ---- 伪装(:39536-39547) ----
    if (p) e.facing = p.cx > e.cx ? 1 : -1;
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
      if (p) e.facing = p.cx > e.cx ? 1 : -1;
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
    if (p) e.facing = e.vx < 0 ? -1 : 1;
    const dx = p ? p.cx - e.cx : e.facing * 100;
    const dy = (p ? p.cy : e.cy) - 350 - e.cy;
    if (e.ai2 === 1) {
      e.ai1 += 1;
      const d = Math.hypot(dx, dy) || 1;
      const tx = (dx / d) * 8, ty = (dy / d) * 8;
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
    e.vy = Math.min(e.vy + 0.2, 16);
    if (!p || e.y + e.h >= p.y || e.vy <= 0) {
      e.ai1 += 1;
      if (e.ai1 > 10) {
        e.ai0 = inSolidBody(game, e) ? 5 : 2;
        e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
      }
      moveAndCollide(e, game.world, e.vx, e.vy);          // 碰撞下坠
    } else if (e.ai2 === 0) {
      fly(e);                                             // 未对齐前穿墙
    }
  } else if (e.ai0 === 5) {
    // ---- 穿墙归位(:39711-39734):追玩家,近 200px 且不埋块 → 回 2 ----
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
      if (p) e.facing = p.cx > e.cx ? 1 : -1;
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
    e.ai0 = -1;
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
    if (EXPERT) e.ai2 += 1 / 60;
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
    const hatchT = EXPERT ? Math.round(70 * 0.75) : 70;
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
  const hatchT = EXPERT ? 600 : 900;                      // num1440
  if (e.ai0 < 0) e.ai0 = 0;                              // 原版 ai[0] 出生 0,Enemy 哨兵 -1120 归一
  if (e.vy === 0) {
    e.vx *= 0.9;
    e.spin += e.vx * 0.02;
  } else {
    e.vx *= 0.99;
    e.spin += e.vx * 0.04;
  }
  if (e.justHit) {                                        // :40419-40425
    e.ai0 -= rndRange(10, 21);
    if (!EXPERT) e.ai0 -= rndRange(10, 21);
  }
  e.ai0 += 1;
  if (e.ai0 >= hatchT) {
    e.transformTo(479, game.world.store);                 // :40428 Transform(479)
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
  e.vy = Math.min(e.vy + GRAVITY, MAX_FALL_SPEED);
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
  // ---- 目标门(:40493-40509) ----
  if (!p) e.ai0 = -1;
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
  // ---- 专家受击石化(:40692-40697,EXPERT 恒 false 不可达,代码保留) ----
  if (e.justHit && EXPERT && rnd(6) === 0) { e.ai0 = -1; e.ai1 = 0; }

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
      // 命中再升级为 (selfX, playerY) 双段锚(:40734-40742)
      if (Math.abs(p.cy - e.cy) > 8 && losClear(game, e.cx, e.cy, e.cx, p.cy)
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
