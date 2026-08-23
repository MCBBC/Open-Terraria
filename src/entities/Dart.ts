// 飞镖投射物(原版 Projectile 10 Dart 语义:直线飞行、撞块消失、命中伤害)。
// 陷阱(137)发射;简化布线:同排/同列直线可见(≤60 格无实心阻挡)的拉杆/开关/压力板驱动。
import { Entity } from './Entity';
import { hitPlayer, playEnemyHitSound, playerCanHitEnemy, projOverlap, tryReflectProjectile } from './projTargets';
import { moveAndCollide } from '../physics/TileCollision';
import { TILE } from '../core/constants';
import { TILE_BY_KEY } from '../data/tiles';
import { prefetchProjectiles } from './Arrow';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import type { Enemy } from './Enemy'; // type-only（Enemy 运行时反向依赖本文件，避免环）
import { projFrameImg, projSprite } from './Arrow';
import { segHitsRect } from './bossAI_duke_moonlord';   // 线段命中（bossAI_duke_moonlord 导出共用）
import { hostileProjectileDamage, mainDifficulty } from '../stats/ScaleStats';
import { applyProjStatus } from './projStatus';

/** 电路陷阱投射物(Wiring.cs:1495-1743)。贴图 = 原版 projectile id;
 *  帧尺寸按实际解包 PNG 整图(素材为完整单帧:98 竖镖 10×28 / 184 竖火舌 10×18 /
 *  185 尖刺球 16×16 / 99 巨石 32×32)——勿按 SetDefaults 碰撞盒裁剪,否则只画残片 */
// tile 137 kind ↔ projectile 对应(Wiring.cs:1495-1743 + Item.cs placeStyle 核实):
//   0 飞镖机关(539)→98 | 1 超级飞镖机关(1146)→184(毒镖样式,有图) |
//   2 烈焰机关(1147)→187(FlamethrowerTrap,官方空桩贴图,视觉=火焰尘埃) |
//   3 尖球机关(1148)→185 | 4 长矛机关(1149)→186(有图)
// 187/654 的 PNG 是官方占位空桩(xnb 像素全零,经字节级同 stub 证实),isBlankTex 检出后
// 走色块回退 + 粒子拖尾——与原版"隐形弹体+尘埃视觉"一致(Projectile.cs:24222 188 同族 dust 驱动)
const TRAP_SHOT_STYLE: Record<string, {
  w: number; h: number; color: string; grav: number;
  proj?: string; fw?: number; fh?: number;
  /** 烟花族：同 kind 多色变体贴图（form 0-3 → 167-170 / 415-418 / 419-422） */
  projs?: string[];
  /** 隐形弹（733 alpha=255 SetDefaults）：纯尘/gore 发射器，不画本体 */
  invisible?: boolean;
  spin?: boolean | 'roll' | 'bunny'; rotOff?: number;
  /** spin=true 时的滚转系数(尖刺球 aiStyle14 = vx*0.14,1405 :21630;其余默认 0.03) */
  spinK?: number;
  trail?: { colors: string[]; count: number; life: number; grav: number };
  /** 炮弹族：前 N tick 直线无重力（Projectile.cs:21546/26844 ai[0]>=18 才加重力） */
  gravDelay?: number;
  /** 水平阻尼（Projectile.cs:21549 velocity.X *= 0.99） */
  xDamp?: number;
  /** 垂直速度上限（Projectile.cs:26850-26853 兔兔炮 15.9） */
  vCap?: number;
  /** 友方弹幕（friendly=true，SetDefaults）：只伤敌怪，不伤玩家/城镇 NPC */
  friendly?: boolean;
  /** 落点爆炸半宽 px（Projectile.Kill 伤害盒：162=144×144→72 / 281=128×128→64） */
  blast?: number;
  /** 撞块破碎尘（Projectile.Kill 166：尘 76 十粒 + Item51） */
  shatterDust?: boolean;
  /** 发射音（Projectile.AI 首帧 SoundID.Item14：162=Projectile.cs:21542 / 281=26830） */
  launchSfx?: string;
  life?: number;
}> = {
  dart: { w: 8, h: 4, color: '#C8B89A', grav: 0, proj: 'vanilla/Projectile_98.png', fw: 10, fh: 28, rotOff: Math.PI / 2 },
  superdart: { w: 6, h: 6, color: '#8FBF6A', grav: 0, proj: 'vanilla/Projectile_184.png', fw: 10, fh: 18, rotOff: Math.PI / 2 },
  flame: { w: 10, h: 10, color: '#FF8030', grav: 0, proj: 'vanilla/Projectile_187.png', fw: 16, fh: 16,
    trail: { colors: ['#FF8030', '#FFC040', '#FF5010'], count: 2, life: 16, grav: -0.03 } },
  spear: { w: 6, h: 14, color: '#B8B8C0', grav: 0, proj: 'vanilla/Projectile_186.png', fw: 10, fh: 16, rotOff: Math.PI / 2 },
  // 185 尖刺球(SetDefaults 1405:2255/1456:2449):14×14 aiStyle14 penetrate-1 timeLeft 900
  spiky: { w: 14, h: 14, color: '#8A8F96', grav: 0.3, proj: 'vanilla/Projectile_185.png', fw: 16, fh: 16, spin: true, spinK: 0.14 },
  // 99 巨石(SetDefaults :1561-1568):31×31 aiStyle25 penetrate-1 trap;物理全在
  // boulderStep(AI_025 :24662-24723 + 撞块 :17530-17551)——grav/vCap 值仅表占位
  boulder: { w: 31, h: 31, color: '#9A8C72', grav: 0, proj: 'vanilla/Projectile_99.png', fw: 32, fh: 32, spin: true, spinK: 0.06 },
  geyser: { w: 10, h: 14, color: '#B8E8F0', grav: 0.02, proj: 'vanilla/Projectile_654.png', fw: 16, fh: 16,
    trail: { colors: ['#E8F4F8', '#C8E4EE'], count: 1, life: 26, grav: -0.015 } },
  // ---- 炮弹族（Wiring.cs case 209/212 → WorldGen.ShootFromCannon / 直接 NewProjectile）----
  // 162 炮弹（SetDefaults Projectile.cs:2239-2246）：16×16 aiStyle2 friendly penetrate4；
  // AI（:21540-21592）：18 tick 直线后 vy+=0.28/vx*=0.99；终端 vy 32（aiStyle2 通用钳
  // :21978-21981，2026-08-14 补）；Kill（:72768-72831）：64×64→144×144
  // 两段 Damage() 纯伤害（不在 ExplodeTiles 表 = 不破坏地形）
  cannonball: { w: 16, h: 16, color: '#33333C', grav: 0.28, gravDelay: 18, xDamp: 0.99, vCap: 32,
    proj: 'vanilla/Projectile_162.png', fw: 18, fh: 18, spin: 'roll', friendly: true, blast: 72,
    launchSfx: 'explosion', life: 3600 },
  // 281 爆炸兔兔（SetDefaults Projectile.cs:3408-3418）：28×28 aiStyle49 friendly timeLeft600；
  // AI（:26822-26913）同炮弹弧线（18 tick 后 vy+=0.28/vx*=0.99，vy 上限 15.9）；
  // Kill（:72704-72758）：128×128 Damage() 纯伤害
  bunny: { w: 28, h: 28, color: '#E8E2D8', grav: 0.28, gravDelay: 18, xDamp: 0.99, vCap: 15.9,
    proj: 'vanilla/Projectile_281.png', fw: 28, fh: 28, spin: 'bunny', friendly: true, blast: 64,
    launchSfx: 'explosion', life: 600 },
  // 166 雪球（SetDefaults Projectile.cs:2282-2289）：14×14 aiStyle2 friendly ranged coldDamage；
  // AI（:21862-21892）：玩家射出（ai1==1）时命中城镇 NPC 即消散清伤；20 tick 直线后
  // vy+=0.3/vx*=0.98（专属分支，勿改默认档 0.4/0.97——166 不落 else）；终端 32
  // （:21978 通用钳，2026-08-14 补）；Kill（:71758-71767）：碎裂尘无 AoE
  snowball: { w: 14, h: 14, color: '#F2F8FF', grav: 0.3, gravDelay: 20, xDamp: 0.98, vCap: 32,
    proj: 'vanilla/Projectile_166.png', fw: 14, fh: 14, spin: 'roll', friendly: true,
    shatterDust: true, life: 3600 },
  // 601 传送门弹（SetDefaults Projectile.cs:3408 族：10×10 friendly，无重力直线；
  // AI :51174-51242：门色拖尾尘 + alpha 递减；撞块 :16672-16686 → PortalHelper.TryPlacingPortal
  // + Kill）。贴图 20×38 竖条 = 2 帧 20×19（frameCounter 4tick 步进）
  portalbolt: { w: 10, h: 10, color: '#B069FF', grav: 0,
    proj: 'vanilla/Projectile_601.png', fw: 20, fh: 19, friendly: true, life: 3600 },
  // ---- 烟花三件套 + 马桶水花（Wiring.cs:1492-1553；WorldGen.LaunchRocket/LaunchRocketSmall）----
  // 167-170 烟花火箭（SetDefaults Projectile.cs:2291-2300）：14×14 aiStyle34 friendly ranged
  // timeLeft45，damage 150 / kb 7（WorldGen.cs:62197-62199）；AI（:25677-25739）无重力直线 + 尾烟；
  // Kill（:73435-73921）：Item14 + 按色爆尘 + 192×192 Damage()。贴图 14×28 = 2 帧 14×14（取帧 0）
  fireworkRocket: { w: 14, h: 14, color: '#FF8066', grav: 0, friendly: true, blast: 96, life: 45,
    projs: ['vanilla/Projectile_167.png', 'vanilla/Projectile_168.png',
      'vanilla/Projectile_169.png', 'vanilla/Projectile_170.png'],
    fw: 14, fh: 14, rotOff: Math.PI / 2 },
  // 415-418 烟花盒火箭（SetDefaults Projectile.cs:4669-4676）：14×14 aiStyle34 friendly timeLeft45
  // damage 0（WorldGen.cs:62213-62215）——纯视觉弹，Kill 同样 192×192 Damage() 但伤害为 0
  fireworksBoxRocket: { w: 14, h: 14, color: '#66FF99', grav: 0, friendly: true, blast: 96, life: 45,
    projs: ['vanilla/Projectile_415.png', 'vanilla/Projectile_416.png',
      'vanilla/Projectile_417.png', 'vanilla/Projectile_418.png'],
    fw: 14, fh: 14, rotOff: Math.PI / 2 },
  // 419-422 烟花喷泉（SetDefaults Projectile.cs:4679-4686）：4×4 aiStyle73 friendly timeLeft3600（默认值），
  // 锚点 tile 338 消失即 Kill（AI :29369-29377）；每 tick 2 粒火花 × 60 秒
  fireworkFountain: { w: 4, h: 4, color: '#FFE85A', grav: 0, friendly: true, life: 3600,
    projs: ['vanilla/Projectile_419.png', 'vanilla/Projectile_420.png',
      'vanilla/Projectile_421.png', 'vanilla/Projectile_422.png'],
    fw: 8, fh: 8 },
  // 733 马桶水花（SetDefaults Projectile.cs:7434-7441）：2×2 aiStyle153 tileCollide=false alpha=255
  // ——全隐形纯发射器；AI_153_ToiletPop（:49278-49314）ai[0]==0 → 6 尘 + 1 gore，
  // ai[0] 1..10 → 2 尘 + 1/5 gore，ai[0]>10 → Kill
  toiletPop: { w: 2, h: 2, color: '#8AC7F0', grav: 0, life: 3600, invisible: true },
};

/** 电路机关弹幕全族预热(2026-08-13,用户问"电路触发有没有风险"):机关弹幕全部
 *  固定枚举(TRAP_SHOT_STYLE 表驱动,22 张),进图预热后机关首次触发零兜底窗口
 *  ( TrapShot.draw 走 ensureVImage,未预热时首次触发有 ~百ms 色块兜底) */
export function prefetchTrapProjectiles(): void {
  const ids: number[] = [];
  for (const s of Object.values(TRAP_SHOT_STYLE)) {
    for (const f of [s.proj, ...(s.projs ?? [])]) {
      if (!f) continue;
      const m = /Projectile_(\d+)\.png$/.exec(f);
      if (m) ids.push(parseInt(m[1], 10));
    }
  }
  prefetchProjectiles(ids);
}

/** TrapShot 弹种（DeviceCtx.shootProjectile kind 共用） */
export type TrapShotKind = 'dart' | 'superdart' | 'flame' | 'spear' | 'spiky' | 'boulder' | 'geyser' | 'cannonball' | 'bunny' | 'snowball' | 'portalbolt'
  | 'fireworkRocket' | 'fireworksBoxRocket' | 'fireworkFountain' | 'toiletPop';

/** TrapShot kind → 原版 projectile id（反射门禁用：Projectile.CanBeReflected 按
 *  type/aiStyle 查表——162 炮弹 aiStyle2 / 166 雪球 aiStyle2 可反射，烟花族
 *  aiStyle 34/73/153 与 281 aiStyle49 不在白名单故不列） */
const TRAP_PROJ_ID: Partial<Record<TrapShotKind, number>> = {
  dart: 98, superdart: 184, flame: 187, spear: 186, spiky: 185, boulder: 99,
  geyser: 654, cannonball: 162, bunny: 281, snowball: 166, portalbolt: 601,
};

/** ---- 烟花尘色表（Projectile.cs Kill/AI 引用的 Dust id → 近似色）----
 *  130-134 爆花尘：发光色照抄 Dust.cs:2204-2226 Lighting.AddLight 的 RGB（134 未入光照表，
 *  金色弹 170 与 133 交替使用，取亮金近似）；219-223 喷泉火花条（DustID.cs:167 仅 219 命名
 *  Fireworks；419 用 222 黄 / 420 用 219 红 / 421 用 221 蓝 / 422 用 219+rand(5)，据此定色）；
 *  216 马桶水花（AI_153 :49299）取浅水蓝 */
export const FW_DUST: Record<string, string> = {
  d130_red: '#FF8066', d131_green: '#66FF99', d132_blue: '#4D80FF',
  d133_yellow: '#E6E64D', d134_gold: '#FFF2A8',
  d219_red: '#FF5A4A', d220_green: '#5AFF8A', d221_blue: '#5A8AFF',
  d222_yellow: '#FFE85A', d223_pink: '#FF66C8',
  d216_water: '#8AC7F0',
};
/** 喷泉彩虹弹 422 的尘池（Projectile.cs:29499：219 + rand(5)） */
export const FW_RAINBOW = [FW_DUST.d219_red, FW_DUST.d220_green, FW_DUST.d221_blue,
  FW_DUST.d222_yellow, FW_DUST.d223_pink];

/** 弹体中心点是否入实心块(尖刺球分轴碰撞用;近似原版 Collision.TileCollision 的轴阻挡) */
function shotCenterSolid(game: GameHooks, e: { x: number; y: number; w: number; h: number }): boolean {
  const tx = Math.floor((e.x + e.w / 2) / TILE);
  const ty = Math.floor((e.y + e.h / 2) / TILE);
  return game.world.store.isSolid(tx, ty);
}

export class TrapShot extends Entity {
  w = 8; h = 8;
  vx: number;
  vy: number;
  damage: number;
  kind: TrapShotKind;
  /** 巨石 ai[0] 落地旗(:24666 置 1 后恒 1;转角踢门 :24578 的 ai[0]≠0 条件) */
  boulderLanded = false;
  /** 传送门弹 601 的 ai[0]（WorldGen.cs:50622-50631：0 橙门 / 1 蓝门）；
   *  烟花族 = 色变体（167-170 / 415-418 / 419-422 减基址） */
  form = 0;
  /** 喷泉弹锚点 tile（Projectile.ai[0]/ai[1]，Wiring.cs:1548；锚点 338 消失即 Kill） */
  ax = -1;
  ay = -1;
  /** 滚转角(尖刺球/巨石/炮弹族) */
  private rot = 0;
  /** 已飞行 tick（炮弹族重力延迟用，对应原版 ai[0]） */
  private age = 0;
  life = 600;
  dead = false;
  /** 敌对弹（原版 Projectile.hostile，= !style.friendly：机关/陷阱类弹伤玩家，
   *  烟花等 friendly 类不伤）。联机 v5：随 msg27 bit7 下发，访客傀儡据此本地结算 */
  hostile: boolean;
  /** 已反射（原版 Projectile.reflected）：被反射源（419 旋刃冲刺等）打回后置位，
   *  弹体转 hostile 伤玩家、不再入敌怪判定（原版 Damage NPC 需 friendly 门禁） */
  reflected = false;

  /** 全透明贴图缓存(xnb 解包异常的 187/654 等):检出一次后走色块回退,避免隐形弹幕。
   *  ★未加载(懒加载 pending)不得判 blank——否则 null 会被永久缓存,贴图晚到也不恢复
   *  (VANILLA_MISC 瘦身转懒后这是必踩坑,2026-08-13) */
  private static blankTex = new Set<string>();
  private static okTex = new Set<string>();
  private static isBlank(r: Renderer, path: string): boolean {
    if (TrapShot.blankTex.has(path)) return true;
    if (TrapShot.okTex.has(path)) return false;
    const img = r.atlas?.vimages.get(path);
    if (!img) return false; // 贴图未就绪:不判也不缓存,由 draw 的 ensureVImage 触发加载
    let blank = true;
    {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d')!;
      cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) { if (d[i] > 30) { blank = false; break; } }
    }
    (blank ? TrapShot.blankTex : TrapShot.okTex).add(path);
    return blank;
  }

  constructor(x: number, y: number, vx: number, vy: number, damage: number, kind: TrapShotKind,
    form = 0, anchor?: [number, number]) {
    super();
    const s = TRAP_SHOT_STYLE[kind];
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.kind = kind;
    this.form = form;
    if (anchor) { this.ax = anchor[0]; this.ay = anchor[1]; }
    this.w = s.w; this.h = s.h;
    if (kind === 'spiky') this.life = 900; // 原版 185 timeLeft 900(1405/1456 SetDefaults 同)
    if (s.life !== undefined) this.life = s.life; // 炮弹族 timeLeft（SetDefaults 默认 3600 / 281=600）
    this.hostile = !s.friendly;
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(Renderer 实体循环运行在世界变换内,勿再自算屏幕坐标)
    const ctx = r.ctx;
    if (!ctx) return;
    const st = TRAP_SHOT_STYLE[this.kind];
    if (st.invisible) return; // 733 alpha=255：隐形纯发射器（SetDefaults :7440）
    // 烟花族按 form 选色变体贴图；单贴图 kind 走 proj。
    // ★ensureVImage 触发懒加载(VANILLA_MISC 瘦身后弹幕表不再预载,直取会永久色块)
    const tex = st.projs?.[this.form] ?? st.proj;
    const img = tex && r.atlas ? r.atlas.ensureVImage(tex) : null;
    if (img && st.fw && st.fh && !TrapShot.isBlank(r, tex!)) {
      // 原版弹幕贴图(整帧):飞行类贴图默认朝上(镖尖/火苗向上),对齐速度方向需 +90°;
      // 尖刺球/巨石不随速度旋转,按位移滚转
      ctx.save();
      ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
      if (st.spin) ctx.rotate(this.rot);
      else if (Math.abs(this.vx) + Math.abs(this.vy) > 0.01) ctx.rotate(Math.atan2(this.vy, this.vx) + (st.rotOff ?? 0));
      ctx.drawImage(img, 0, 0, st.fw, st.fh, -st.fw / 2, -st.fh / 2, st.fw, st.fh);
      ctx.restore();
      return;
    }
    ctx.fillStyle = st.color;
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：对敌判定归拥有者客户端；对玩家（hostile）由访客本地结算 Damage_EVP（netPuppetProjContact）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // 烟花三件套 + 马桶水花：独立 AI 族（aiStyle 34/73/153），不走陷阱弹通用位移/命中链
    if (this.kind === 'fireworkRocket' || this.kind === 'fireworksBoxRocket'
      || this.kind === 'fireworkFountain' || this.kind === 'toiletPop') {
      this.fireworkUpdate(game);
      return;
    }
    if (--this.life <= 0) {
      // 炮弹族 timeLeft 耗尽同样走 Kill 爆炸（Projectile.Kill 由 timeLeft 归零触发）
      if (TRAP_SHOT_STYLE[this.kind].blast) this.blastKill(game);
      else this.dead = true;
      return;
    }
    const st = TRAP_SHOT_STYLE[this.kind];
    this.age++;
    // 首帧发射音（Projectile.AI：162=Projectile.cs:21542-21546 / 281=26830-26833 SoundID.Item14）
    if (this.age === 1 && st.launchSfx) game.playSfx(st.launchSfx, 1, this.x + this.w / 2, this.y + this.h / 2);
    // 滚转：尖刺球 aiStyle14 = vx*0.14(1405 :21630)/巨石近似 0.03 | 炮弹族按原版
    if (st.spin === true) this.rot += this.vx * (st.spinK ?? 0.03);
    else if (st.spin === 'roll') {
      // aiStyle2（Projectile.cs:21528）：rotation += (|vx|+|vy|)*0.03*direction
      this.rot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * (this.vx < 0 ? -1 : 1);
    } else if (st.spin === 'bunny') {
      // aiStyle49（Projectile.cs:26841）：rotation += vx*0.05 + direction*0.05
      this.rot += this.vx * 0.05 + (this.vx < 0 ? -1 : 1) * 0.05;
    }
    if (this.kind === 'boulder') {
      // ---- 巨石 aiStyle 25(AI_025 :24578-24723 + 撞块族 :17530-17551)----
      // 滞滞启动踢(:24578-24661):落地态(ai[0]≠0,本仓 landed)且 vy≤0 且 vx==0 →
      // 探 ±40px(8+32)侧壁:左实 → 向右踢 0.5 / 右实 → 向左 / 两侧空 → 按
      // Center.X 奇偶定向。没有这一踢,vx=0 命不中滚地加速两分支 → 落地即死停。
      if (this.boulderLanded && this.vy <= 0 && this.vx === 0) {
        const st8 = game.world.store;
        const solid2 = (px: number, py: number) => st8.isSolid(Math.floor(px / TILE), Math.floor(py / TILE));
        const rowA = this.y, rowB = this.y + TILE;
        const leftBlocked = solid2(this.x - 8 - 32, rowA) || solid2(this.x - 8 - 32, rowB);
        const rightBlocked = solid2(this.x + this.w + 8 + 32, rowA) || solid2(this.x + this.w + 8 + 32, rowB);
        // 原版(:24578-24661):flag11(左实)→vx=+0.5 / flag12(右实)→vx=−0.5 /
        // 两侧空 → Center.X 格奇偶定向(偶=flag11=向右)
        this.vx = leftBlocked && !rightBlocked ? 0.5 : rightBlocked && !leftBlocked ? -0.5
          : (Math.floor(this.cx / TILE) % 2 === 0 ? 0.5 : -0.5);
      }
      // 重力 0.3/终端 16(:24723/:24667);滚地加速:vy≤6 且 |vx|<7 → ±0.05(:24699-24708)
      // ——落地后不会停,持续加速滚动直到撞墙;旋转 = vx×0.06(:24664)。
      // 撞块(AABB 分轴 + lastVelocity):Y 阻挡且 lastVy>5 → 反弹 −lastVy×0.2(:17551,
      // 软落直接落定不微弹);X 阻挡 → HitTiles(敲石音+尘)+ 碎裂消亡(:17561-17574)。
      this.boulderLanded = true;               // ai[0]=1(:24666,次 tick 起转角门生效)
      this.rot += this.vx * 0.06;
      this.vy += 0.3;
      if (this.vy > 16) this.vy = 16;
      if (this.vy <= 6) {
        if (this.vx > 0 && this.vx < 7) this.vx += 0.05;
        else if (this.vx < 0 && this.vx > -7) this.vx -= 0.05;
      }
      const lvx = this.vx, lvy = this.vy;
      // ★碰撞 = 引擎通用 moveAndCollide(玩家/敌怪同款,带贴边钳制/推出)。
      // 陷阱几何:巨石右列常坐在未致动石上,出生即嵌地形 ~15px——自建边缘
      // 采样两轮翻车(出生叠壁误碎→预叠容忍→贴地恒沉→严格阻挡又嵌住),
      // 全部退役。响应旗标:hitWall=撞墙碎裂;onGround=落地(硬落反弹 ×0.2)。
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (this.hitWall) {
        game.playSfx('tink', 1, this.cx, this.cy);      // HitTiles 敲击音
        game.spawnParticles(this.cx + this.w / 2 * Math.sign(lvx || 1), this.cy, '#9A8C72', 8, 2.4, { life: 40 });
        this.shatter(game);                              // 撞墙碎裂(:17574 Kill)
        this.dead = true;
        return;
      }
      if (this.onGround) this.vy = lvy > 5 ? -lvy * 0.2 : 0;
      // 落下不 return:继续走下方对玩家/敌怪命中段(穿透语义在 hostile/pierce 链)
    }
    if (this.kind === 'spiky') {
      // aiStyle 14 默认尾部(1405 :21600-21608 / 1456 同):vy==0 贴地时额外 vx*=0.95;
      // 每帧 vx*=0.98、重力 0.3、终端速度 15.9
      if (this.vy === 0) this.vx *= 0.95;
      this.vx *= 0.98;
      this.vy += 0.3;
      if (this.vy > 15.9) this.vy = 15.9;
      // 分轴积分 + type 185 反弹响应(1405 :13302-13307 / 1456 :18289-18297,
      // 原 TileCollision 把被挡轴速度清零、本段按 lastVelocity 以 0.9 系数弹回):
      // X 阻挡 → vx=-lastVx*0.9;Y 阻挡且 lastVy>1 → vy=-lastVy*0.9,否则 vy=0 落定不微弹
      const lvx = this.vx, lvy = this.vy;
      this.x += this.vx;
      if (shotCenterSolid(game, this)) { this.x -= this.vx; this.vx = -lvx * 0.9; }
      this.y += this.vy;
      if (shotCenterSolid(game, this)) { this.y -= this.vy; this.vy = lvy > 1 ? -lvy * 0.9 : 0; }
    } else if (st.gravDelay !== undefined) {
      // 炮弹族弧线：前 gravDelay tick 直线，之后 vy+=grav / vx*=xDamp
      // （162/281=Projectile.cs:21546-21550/26844-26849 的 ai[0]>=18；166=:21879-21884 的 >=20）
      if (this.age >= st.gravDelay) {
        this.vy += st.grav;
        this.vx *= st.xDamp ?? 1;
        if (st.vCap !== undefined && this.vy > st.vCap) this.vy = st.vCap; // 281 :26850-26853
      }
    } else {
      this.vy += st.grav;
    }
    if (this.kind !== 'spiky' && this.kind !== 'boulder') {
      this.x += this.vx;
      this.y += this.vy;
    }
    // 粒子拖尾(原版火焰陷阱/热喷泉的视觉主体是沿途粒子;每 2 tick 一次防刷屏)
    if (st.trail && (this.life & 1) === 0) {
      game.spawnParticles(
        this.x + this.w / 2, this.y + this.h / 2,
        st.trail.colors[(this.life >> 1) % st.trail.colors.length],
        st.trail.count, 0.4, { life: st.trail.life, damp: 0.96, grav: st.trail.grav },
      );
    }
    // 传送门弹拖尾（Projectile.cs:51180-51192：尘 264 = 门色，无重力）
    if (this.kind === 'portalbolt' && (this.life & 1) === 0) {
      game.spawnParticles(
        this.x + this.w / 2, this.y + this.h / 2,
        this.form === 0 ? '#FFAA28' : '#3CE0FF', 1, 0.6, { life: 14, damp: 0.94, grav: 0 },
      );
    }
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) {
      // 传送门弹撞块（Projectile.cs:16672-16686）：落门后消亡（音效 Item115/114 按 form）
      if (this.kind === 'portalbolt') {
        game.placePortal?.(this.x, this.y, this.vx, this.vy, this.form);
        game.playSfx(this.form === 0 ? 'portalOrange' : 'portalBlue', 1, this.x, this.y);
        this.dead = true;
        return;
      }
      // 巨石撞块已在上方针石专属分支(AI 25 AABB 分轴)处理;此处仅余非巨石族
      if (st.blast) {
        // 炮弹/兔兔炮撞块 → Kill 落点爆炸（Projectile.cs:72768-72831 / 72704-72758）
        this.blastKill(game);
        return;
      } else {
        // 雪球撞块碎裂（Projectile.cs:71758-71767）
        if (st.shatterDust) this.shatter(game);
        this.dead = true;
        return;
      }
    }
    // 友方弹幕（炮弹族 friendly=true）：不伤玩家，直接进敌怪判定。
    // 敌对陷阱：伤害走 damagePlayer(防御减算/受击音/iframes 去重);除巨石外命中即碎。
    // 读实例 hostile 而非 style.friendly——反射后弹体转 hostile 需改为伤玩家
    if (this.hostile) {
      if (projOverlap(this.x, this.y, this.w, this.h, game.player) && !game.player.dead) {
        hitPlayer(this, game, this.damage, !this.reflected); // trap 标（反射弹非陷阱）
        if (this.kind !== 'boulder') this.dead = true;
        if (this.dead) return;
      }
    }

    // ---- 命中怪物/小动物/城镇 NPC（原版陷阱弹幕对全实体敌对，Projectile.DamageNPC 语义） ----
    // 穿透规则（近似原版）：巨石碾压穿透；尖刺球/火焰穿透（靠受击者无敌帧节流连击）；
    // 镖/超级飞镖/热喷泉一碰即碎（与对玩家一致）；
    // 炮弹族：162 penetrate4 / 281 penetrate-1（SetDefaults）→ 穿透，撞块/超时才 Kill 爆炸；
    // 166 雪球 penetrate1 → 一碰即碎
    const pierce = this.kind === 'boulder' || this.kind === 'spiky' || this.kind === 'flame'
      || this.kind === 'cannonball' || this.kind === 'bunny';
    const overlaps = (e: { x: number; y: number; w: number; h: number }) =>
      this.x < e.x + e.w && this.x + this.w > e.x && this.y < e.y + e.h && this.y + this.h > e.y;
    // 怪物桶（Enemy.hurt 自带 8tick 无敌帧，穿透弹不会同帧连击）。
    // 反射后的弹体 friendly 已翻——不再入敌怪判定（原版 Damage NPC 门禁）
    if (!this.reflected) {
      const trapProjId = TRAP_PROJ_ID[this.kind];
      for (const ent of game.enemies()) {
        if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
        const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; def?: { hitSound?: string[] }; reflectsProjectiles?: boolean };
        if (e.dead || !overlaps(e)) continue;
        // 反射源命中（Projectile.cs:12050-12060）：友方炮弹/雪球可反射（aiStyle2）
        if (trapProjId !== undefined && tryReflectProjectile(this, trapProjId, e, game)) return;
        // StatusNPC 命中 debuff（Projectile.cs:10555 表驱动——毒飞镖 98 掷中必染
        // Poison 600t / 超级镖 184 900t :11041/:11045;矛/尖球/巨石/喷泉等表内无条目
        // 天然空掷）。曾整类漏接 = 飞镖陷阱永不上毒（2026-08-19 补）
        if (trapProjId !== undefined) applyProjStatus(trapProjId, e as unknown as Record<string, number>);
        e.hurt(this.damage, Math.sign(this.vx) * 2, 0, game, 0, false, 0, true);   // 音/飘值=单点
        if (!pierce) {
          if (st.shatterDust) this.shatter(game);
          this.dead = true;
          return;
        }
      }
    }
    // 友方弹幕（炮弹族 friendly=true）到此为止：不误伤小动物/城镇 NPC
    // （原版 friendly 弹对城镇 NPC 免疫；小动物不在敌怪判定内）。
    // 反射后转 hostile 同样走此出口（原版敌弹对 NPC 无伤害）
    if (!this.hostile || this.reflected) return;
    // 小动物桶（Enemy 单参 shim / Critter.hurt(game) 皆可，被击即死）
    const buckets = (game as unknown as { entities?: { critters: Array<{ x: number; y: number; w: number; h: number; dead: boolean; hurt: (g: GameHooks) => boolean }>; npcs: Array<{ x: number; y: number; w: number; h: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean }> } }).entities;
    if (buckets) {
      for (const c of buckets.critters) {
        if (c.dead || !overlaps(c)) continue;
        c.hurt(game);
        if (!pierce) { this.dead = true; return; }
      }
      // 城镇 NPC（TownNPC.hurt：防御减伤+无敌帧+死亡移除）
      for (const n of buckets.npcs) {
        if (n.dead || !overlaps(n)) continue;
        n.hurt(this.damage, Math.sign(this.vx) * 2, 0, game);
        if (!pierce) { this.dead = true; return; }
      }
    }
  }

  /** 雪球碎裂（Projectile.Kill type166，Projectile.cs:71758-71767：尘 76 十粒 + Item51） */
  private shatter(game: GameHooks): void {
    game.spawnParticles(this.x + this.w / 2, this.y + this.h / 2, '#F2F8FF', 10, 1, { life: 20, damp: 0.94, grav: -0.01 });
    game.playSfx('shatter', 1, this.x, this.y);
  }

  /** 落点爆炸（Projectile.Kill：type162=Projectile.cs:72768-72831 / type281=72704-72758）：
   *  纯范围伤害（162/281 均不在 ExplodeTiles 判定表 Projectile.cs:75260 → 不破坏地形）；
   *  原版两段伤害盒 162 为 64×64→144×144、281 为 128×128，此处按 blast 半宽合并一段；
   *  friendly 弹不伤玩家（hostile 伤害仅在 getGoodWorld 下对玩家生效，Main.getGoodWorld） */
  private blastKill(game: GameHooks): void {
    this.dead = true;
    const st = TRAP_SHOT_STYLE[this.kind];
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    game.playSfx('explosion', 1, cx, cy); // SoundID.Item14（Projectile.cs:72769/72706）
    game.spawnParticles(cx, cy, '#FFA050', 14, 3.5, { life: 18, damp: 0.93, grav: -0.02 });
    game.spawnParticles(cx, cy, '#FFF0C0', 8, 4.5, { life: 10, damp: 0.9, grav: -0.05 });
    this.blastDamage(game, cx, cy, st.blast!);
  }

  /** 伤害盒结算（炮弹族与烟花火箭共用的 Damage() 语义：friendly 只伤敌怪） */
  private blastDamage(game: GameHooks, cx: number, cy: number, r: number): void {
    const box = { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
    for (const ent of game.enemies()) {
      if (!playerCanHitEnemy(ent, game)) continue;   // friendly 门（Damage_PVE_Inner :11892——睡渔夫 376 等友好 NPC 玩家弹无效）
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean; hurt: (d: number, kx: number, ky: number, g: GameHooks, pen?: number, crit?: boolean, pierce?: number, fromPlayer?: boolean) => boolean; def?: { hitSound?: string[] } };
      if (e.dead) continue;
      if (!(box.x < e.x + e.w && box.x + box.w > e.x && box.y < e.y + e.h && box.y + box.h > e.y)) continue;
      e.hurt(this.damage, Math.sign(this.vx) * 2, 0, game, 0, false, 0, true);   // 音/飘值=单点
    }
  }

  // ============ 烟花三件套 + 马桶水花（Projectile 167-170 / 415-422 / 733）============

  /** 烟花族 AI 主循环。
   *  火箭（aiStyle34，Projectile.cs:25677-25739）：无重力直线上升 + 尾烟尘 6，
   *  timeLeft 45 到点或撞块 → Kill 爆花；
   *  喷泉（aiStyle73，:29369-29510）：静态发射器，锚点 338 消失即 Kill，每 tick 2 粒火花；
   *  马桶（aiStyle153，:49278-49314）：11 帧水花后自杀 */
  private fireworkUpdate(game: GameHooks): void {
    const isRocket = this.kind === 'fireworkRocket' || this.kind === 'fireworksBoxRocket';
    if (--this.life <= 0) {
      if (isRocket) this.explodeFirework(game); // timeLeft 45 到点 → Projectile.Kill（:73435）
      else this.dead = true;                    // 喷泉 3600 自然耗尽（马桶由下方 age 分支自杀）
      return;
    }
    this.age++;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    if (isRocket) {
      this.x += this.vx;
      this.y += this.vy;
      // 尾烟（AI_034 :25724-25739）：167-170 每帧 1 粒尘 6；415-418 自 ai[0]>4 起（:25722-25733）
      //（引擎粒子 2 tick 一发节流，视觉近似）
      const trailOk = this.kind === 'fireworkRocket' || this.age > 4;
      if (trailOk && (this.life & 1) === 0) {
        game.spawnParticles(this.x + this.w / 2, this.y + this.h, '#A8A8A0', 1, 0.6,
          { life: 18, damp: 0.95, grav: -0.02 });
      }
      // tileCollide=true → 撞实心块同样 Kill 爆花
      const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
      if (game.world.store.isSolid(tx, ty)) this.explodeFirework(game);
      return;
    }
    if (this.kind === 'fireworkFountain') {
      // 锚点 tile 必须仍是 338（AI_073 :29371-29377，否则 Kill）
      const T338 = TILE_BY_KEY['v_338_fireworkfountain'] ?? -1;
      const st = game.world.store;
      if (!st.inBounds(this.ax, this.ay) || st.type[st.idx(this.ax, this.ay)] !== T338) {
        this.dead = true;
        return;
      }
      // num625 = 2 * min(1, timeLeft/60)（:29378-29383）——最后 60t 出速衰减
      const sp = 2 * Math.min(1, this.life / 60);
      const burst = game.spawnBurst;
      if (!burst) return;
      if (this.form === 0) {
        // 419 黄（:29385-29406）：尘 222，±PI/4 散布，vy×2
        burst(cx, cy, FW_DUST.d222_yellow, 2, sp, -Math.PI / 2, Math.PI / 4, { yMul: 2, life: 30, damp: 0.96 });
      } else if (this.form === 1) {
        // 420 红（:29408-29431）：尘 219（每粒 1/5 → 222，此处逐帧取色近似），vx×0.5 vy×2
        burst(cx, cy, Math.random() < 0.2 ? FW_DUST.d222_yellow : FW_DUST.d219_red, 2, sp,
          -Math.PI / 2, Math.PI / 4, { xMul: 0.5, yMul: 2, life: 30, damp: 0.96 });
      } else if (this.form === 2) {
        // 421 蓝（:29433-29452）：尘 221，±PI/8 窄散布，vy×2.5
        burst(cx, cy, FW_DUST.d221_blue, 2, sp, -Math.PI / 2, Math.PI / 8, { yMul: 2.5, life: 30, damp: 0.96 });
        // timeLeft%10==0 再补 9 粒尘 222 扇面（:29455-29475：x=(i-4)/5 均布）
        if (this.life % 10 === 0) {
          burst(cx, cy, FW_DUST.d222_yellow, 9, sp * (0.85 + Math.random() * 0.2),
            -Math.PI / 2, Math.PI / 5, { yMul: 2, life: 30, damp: 0.96 });
        }
      } else {
        // 422 彩虹（:29494-29510）：尘 219 + rand(5)，±PI/4，vy×2
        burst(cx, cy, FW_RAINBOW[Math.floor(Math.random() * FW_RAINBOW.length)]!, 2, sp,
          -Math.PI / 2, Math.PI / 4, { yMul: 2, life: 30, damp: 0.96 });
      }
      return;
    }
    // ---- 马桶水花 733（AI_153_ToiletPop :49278-29314）----
    // age 1 ↔ 原版 ai[0]==0（首帧 6 尘 216 + 1 gore）；age 2..11 ↔ ai[0] 1..10（2 尘 + 1/5 gore）；
    // age 12 ↔ ai[0]=11 > 10 → Kill。尘向上（speedY -2，velX×0.5，:49299-49305）；
    // gore 580-582（:49308-49312）以 2 粒亮水珠近似
    if (this.age > 11) {
      this.dead = true;
      return;
    }
    const burst = game.spawnBurst;
    if (!burst) return;
    if (this.age === 1) {
      burst(cx, cy, FW_DUST.d216_water, 6, 2, -Math.PI / 2, 0.9, { xMul: 0.5, life: 26, damp: 0.96 });
      burst(cx, cy, '#D8ECFA', 2, 2.5, -Math.PI / 2, 0.7, { life: 32, damp: 0.97 });
    } else {
      burst(cx, cy, FW_DUST.d216_water, 2, 2, -Math.PI / 2, 0.9, { xMul: 0.5, life: 26, damp: 0.96 });
      if (Math.random() < 0.2) {
        burst(cx, cy, '#D8ECFA', 2, 2.5, -Math.PI / 2, 0.7, { life: 32, damp: 0.97 });
      }
    }
  }

  /** 烟花爆花（Projectile.Kill aiStyle==34，Projectile.cs:73435-73921）：
   *  SoundID.Item14 + 按弹种彩色尘（数量/速度档 1:1）+ 192×192 伤害盒 Damage()（:73912-73920）。
   *  尘速档 = 原版各循环的径向速度（尘自带 0.5 系数初速并入档位）；noGravity 尘按
   *  Dust.cs:2227-2230 velocity*=0.93 / fadeIn 缓胀 → damp 0.93 + 45t 存活近似 */
  private explodeFirework(game: GameHooks): void {
    this.dead = true;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    game.playSfx('explosion', 1, cx, cy); // SoundID.Item14（:73437）
    const burst = game.spawnBurst
      ?? ((x: number, y: number, c: string, n: number, s: number) => game.spawnParticles(x, y, c, n, s));
    /** 全向径向爆花（dir=0/spread=PI 覆盖全圆；原版尘方向为随机角，整体旋转不变） */
    const radial = (color: string, count: number, speed: number,
      opts?: { xMul?: number; yMul?: number }) =>
      burst(cx, cy, color, count, speed, 0, Math.PI, { life: 45, damp: 0.93, ...opts });
    const rand = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo));
    if (this.kind === 'fireworkRocket') {
      // 167-170（:73439-73661）
      if (this.form === 0) {
        // 红 167（:73439-73473）：400 尘 130，四档速度 4/8/12/16 各 100
        radial(FW_DUST.d130_red, 100, 4); radial(FW_DUST.d130_red, 100, 8);
        radial(FW_DUST.d130_red, 100, 12); radial(FW_DUST.d130_red, 100, 16);
      } else if (this.form === 1) {
        // 绿 168（:73475-73518）：400 尘 131；0-100 档 0→2 渐增（取均值 1）、
        // 101-250 档 10（150 粒）、251-399 档 13 且 x×1.25/y×0.75（149 粒）
        radial(FW_DUST.d131_green, 101, 1); radial(FW_DUST.d131_green, 150, 10);
        radial(FW_DUST.d131_green, 149, 13, { xMul: 1.25, yMul: 0.75 });
      } else if (this.form === 2) {
        // 蓝 169（:73520-73612）：双圈 Lerp 曲线（各 2×num843×20 尘 133）+ 中心 100 尘 132；
        // num843 = rand(5,9) 臂、num844 = rand(12,17) 外速、value10 = rand(3,7) 内速
        const arms = rand(5, 9), outer = rand(12, 17), inner = rand(3, 7);
        radial(FW_DUST.d133_yellow, 80 * arms, outer);
        radial(FW_DUST.d133_yellow, 80 * arms, outer / 2);
        radial(FW_DUST.d132_blue, 100, outer);
      } else {
        // 黄 170（:73614-73661）：400 尘 133/134 交替，四档 16/11/8/5 各 100，轴压 0.7 交替
        radial(FW_DUST.d133_yellow, 100, 16, { yMul: 0.7 }); radial(FW_DUST.d134_gold, 100, 11, { xMul: 0.7 });
        radial(FW_DUST.d133_yellow, 100, 8, { yMul: 0.7 }); radial(FW_DUST.d134_gold, 100, 5, { xMul: 0.7 });
      }
    } else {
      // 415-418 烟花盒（:73663-73898）
      if (this.form === 0) {
        // 红 415（:73663-73710）：30×num868 臂尘 130（速度 num870→num869 渐增，取均值）+
        // 100 尘 130 补充；num868 = rand(5,9)、num869 = rand(10,15)×0.66、num870 = rand(4,7)/2
        const arms = rand(5, 9), sp = rand(10, 15) * 0.66, sp0 = rand(4, 7) / 2;
        radial(FW_DUST.d130_red, 30 * arms, (sp0 + sp) / 2);
        radial(FW_DUST.d130_red, 100, sp);
      } else if (this.form === 1) {
        // 绿 416（:73712-73760）：num883=20 步 × num882 = rand(3,6)×2 臂螺旋尘 131，
        // 速度 1→8 渐增（取均值 4.5），奇偶臂 scale 0.9
        radial(FW_DUST.d131_green, 20 * rand(3, 6) * 2, 4.5);
      } else if (this.form === 2) {
        // 蓝 417（:73762-73801）：150 尘三段（各 50）132/133/132，
        // 外圈 num894 = max(rand(4,7),rand(4,7))（x×0.5 旋转）、中段 num893（y×0.5 旋转）、内圈 num892
        const sp2 = 4 + Math.random() * 3, sp1 = 4 + Math.random() * 3;
        radial(FW_DUST.d132_blue, 50, Math.max(sp1, sp2), { xMul: 0.5 });
        radial(FW_DUST.d133_yellow, 50, Math.min(sp1, sp2), { yMul: 0.5 });
        radial(FW_DUST.d132_blue, 50, Math.min(sp1, sp2));
      } else {
        // 黄 418（:73803-73898）：2×num899×15 臂尘 134（SmoothStep num900→num901）+
        // 120 补充尘（前 80 尘 133 慢速、后 40 尘 131 外速）
        const arms = rand(5, 12), sp = rand(9, 14) * 0.66, sp0 = rand(2, 4) * 0.66;
        radial(FW_DUST.d134_gold, 2 * arms * 15, (sp + sp0) / 2);
        radial(FW_DUST.d133_yellow, 80, sp0);
        radial(FW_DUST.d131_green, 40, sp);
      }
    }
    // 192×192 伤害盒 Damage()（:73912-73920）：烟花火箭 damage 150 结算，
    // 烟花盒 damage 0 = 纯视觉（hurt(0) 无意义，直接跳过）
    if (this.damage > 0) this.blastDamage(game, cx, cy, 96);
  }
}

export class Dart extends Entity {
  w = 8; h = 4;
  vx: number;
  vy: number;
  damage: number;
  life = 600; // tick 上限(原版 timeLeft 600)
  dead = false;
  /** 原版弹型（0 = 无表项回退色块）；所有射击怪按 NPC.cs 发射点对号入座 */
  projId: number;
  /** 敌对弹（原版 Projectile.hostile；Dart 类本地玩家命中为无条件，敌我区分由发射点
   *  显式置位——Enemy.shootDart 咽喉与各直构处=true，玩家武器弹默认 false 不误伤）。
   *  联机 v5：随 msg27 bit7 下发，访客傀儡据此本地结算 */
  hostile: boolean;
  /** 弹-NPC 绑定通道（G3 批 2026-08-19）：原版 NPC 发射弹时把自身 whoAmI 作
   *  NewProjectile 末参传入 ai[1] 槽（NPC.cs :59970-59979 等），弹体 AI 按宿主
   *  id+type 回查。当前消费族：411 观星者→537 激光（Projectile.cs:30308 束原点
   *  位锁）/ 424 预言者→573 蓄能弹（:32087 蓄能期宿主死→立即对最近玩家齐射 +
   *  目标继承）。0 = 无绑定（默认，其余发射点原版就不传） */
  ownerNpcId = 0;
  /** 537 激光束长 Lerp 值（原版 localAI[1]，LaserScan→0.5/t Lerp） */
  private beamLen = 0;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, projId = 0) {
    super();
    const st = projId ? DART_STYLE[projId] : undefined;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.projId = projId;
    if (st) {
      this.w = st.w; this.h = st.h;
      this.life = st.life ?? 600;
      this.alpha = st.alpha0 ?? 0;
      this.scale = st.scale ?? 1;
      this.rot = st.rot === 'align90' || st.rot === 'a45'
        ? Math.atan2(vy, vx) + (st.rot === 'a45' ? Math.PI / 4 : Math.PI / 2) : 0;
      this.dir = Math.sign(vx) || 1;
      if (st.frameRand) this.frame = Math.floor(Math.random() * st.frameRand); // 909 岩石随机帧（AI_002 :21534-21540）
    }
    this.hostile = false; // 默认非敌对——敌怪发射点（Enemy.shootDart 咽喉 + 直构处）显式置位
  }

  draw(r: Renderer, _cam: Camera): void {
    // 世界坐标绘制(同 TrapShot)
    const ctx = r.ctx;
    if (!ctx) return;
    // 537 观星者激光：三段束体独占绘制（Main.cs:32124-32156）
    if (this.projId === 537) { this.drawStargazerBeam(ctx); return; }
    const st = this.projId ? DART_STYLE[this.projId] : undefined;
    if (!st) {
      // 无表项回退:旧色块(0 = 通用 Dart,历史遗留调用)
      ctx.fillStyle = '#C8B89A';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      return;
    }
    // 299 暗影焰:贴图 1×1 官方空桩,纯尘埃视觉(AI_001 :53759 尘 181 尾)——不画本体
    if (st.noTex) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = this.netPuppet ? 1 : Math.max(0, 1 - this.alpha / 255); // 傀儡不跑 dartStep,alpha 恒初始 → 恒可见
    let drawn = false;
    if (st.hFrames) {
      // 836 蒲公英籽:横向 4 列胶片(Frame(4,1,frame),Main.cs:33247)——projFrameImg 竖切不适用
      const full = projSprite(this.projId);
      if (full && (full.width > 0) && full.width > 0) {
        const fw = full.width / st.hFrames;
        const idx = Math.min(st.hFrames - 1, this.frame);
        ctx.drawImage(full, Math.round(idx * fw), 0, Math.round(fw), full.height,
          -fw * this.scale / 2, -full.height * this.scale / 2, fw * this.scale, full.height * this.scale);
        drawn = true;
      }
    } else {
      const img = projFrameImg(this.projId, this.frame);
      if (img) {
        const dw = img.width * this.scale, dh = img.height * this.scale;
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        drawn = true;
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (drawn) return;
    // 贴图未就绪:短线兜底(方向与弹速一致)
    ctx.strokeStyle = st.fallback ?? '#C8B89A';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.cx, this.cy);
    ctx.lineTo(this.cx - this.vx * 1.6, this.cy - this.vy * 1.6);
    ctx.stroke();
  }

  /** 537 束体三段绘制（Main.cs:32124-32156）：炮口行(0,0,w,22) origin=行中心 →
   *  束身行(0,25,w,28) 沿束向 28px 段平铺（尾段截余量）→ 端帽行(0,56,w,22)
   *  origin=(0,0)。宽乘 num293 = Remap(bright,0,1,0.25,1.5)，bright =
   *  Remap(age,20,30,0,1)×Remap(age,60,90,1,0)（20t 起亮/30t 满宽/60t 收/90t 灭，
   *  AI 侧 90t Kill 兜底）；颜色 Color(255,255,255,0)×0.9 = XNA 预乘加性白 →
   *  canvas lighter 近似（MLDeathray 455 同款）。束长预算 = len−33·scale */
  private drawStargazerBeam(ctx: CanvasRenderingContext2D): void {
    const remap = (v: number, a: number, b: number, c: number, d: number) =>
      c + (d - c) * Math.min(1, Math.max(0, (v - a) / (b - a)));
    const bright = remap(this.age, 20, 30, 0, 1) * remap(this.age, 60, 90, 1, 0);
    const wid = remap(bright, 0, 1, 0.25, 1.5);
    if (bright <= 0.001 || this.beamLen <= 1) return;
    const img = projSprite(537);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    ctx.imageSmoothingEnabled = false;
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rot);
    if (!img || img.width === 0) {
      // 贴图未就绪兜底（懒加载首帧）：自绘白束，加载完成后自愈
      ctx.globalAlpha = Math.min(1, bright) * 0.9;
      const thick = Math.max(2, 22 * this.scale);
      ctx.fillStyle = '#C8F4FF';
      ctx.fillRect(-thick / 2, 0, thick, this.beamLen);
      ctx.restore();
      return;
    }
    const tw = img.width;
    // 炮口（:32140 origin = 行中心 (w/2,11)）
    ctx.drawImage(img, 0, 0, tw, 22, (-tw / 2) * wid, -11 * wid, tw * wid, 22 * wid);
    // 束身（:32143-32155）：起点 Center+dir·wid·10.5，预算 len−33·scale，逐段 28·wid
    let budget = this.beamLen - 33 * this.scale;
    let y = 10.5 * wid;
    let adv = 0;
    while (adv + 1 < budget) {
      let hh = 28;
      if (budget - adv < hh) hh = budget - adv;
      ctx.drawImage(img, 0, 25, tw, hh, (-tw / 2) * wid, y, tw * wid, hh * wid);
      adv += hh * wid;
      y += hh * wid;
    }
    // 端帽（:32156 origin=(0,0)）
    ctx.drawImage(img, 0, 56, tw, 22, 0, y, tw * wid, 22 * wid);
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks) {
    // 联机傀儡（远端弹幕快照驱动）：对敌判定归拥有者客户端；对玩家（hostile）由访客本地结算 Damage_EVP（netPuppetProjContact）
    if (this.netPuppet) { this.netPuppetStep(); return; }
    // G3 宿主绑定弹：537 观星者激光（aiStyle84）/ 573 预言者蓄能弹（aiStyle102）
    // ——专用步进（AI/寿命/命中面全独立：束线段判定 / 蓄能-齐射态机），不走通用 dartStep
    if (this.projId === 537) { this.stargazerBeamStep(game); return; }
    if (this.projId === 573) { this.oracleOrbStep(game); return; }
    const st = this.projId ? DART_STYLE[this.projId] : undefined;
    if (--this.life <= 0) {
      if (st?.rocket) this.rocketKill(game); else this.dead = true;
      return;
    }
    if (!st) { this.legacyStep(game); return; }
    // 首更新发射音（AI_001 各型 ai[1]==0 分支:81/82→Item5 :52468 / 180→Item11 :52473 /
    // 84/257→Item12 :52408/:52418 / 572→Item17 :53410 / 44→Item8 :23723 / 115→Item8 :24835）;
    // 96 诅咒焰 Item20 :22543 / 288 金雨 Item17 :22820 / 128/177 霜爆 Item28 :24991
    if (this.age === 0 && st.sfx) game.playSfxFiles(st.sfx, 0.8, this.cx, this.cy);
    // extraUpdates:原版每 tick 跑 1+extraUpdates 次完整 AI+位移(302 狙击 ×8 = 弹速 4→32px/t 的来源)
    const sub = 1 + (st.updates ?? 0);
    for (let i = 0; i < sub && !this.dead; i++) this.dartStep(game, st);
  }

  /** 单次原版更新（AI 重力/旋转/alpha/拖尾 + 位移 + 命中） */
  private dartStep(game: GameHooks, st: DartStyle): void {
    this.age++;
    this.tick++;
    // ---- 重力/加速（AI_001 分型重力门 & AI_018/AI_027 加速段）----
    if (st.accel && this.age >= st.accel.from && this.age < st.accel.to) {
      this.vx *= st.accel.mul; this.vy *= st.accel.mul;
    }
    if (st.grav !== undefined && this.age > (st.gravDelay ?? 0)) {
      this.vy = Math.min(this.vy + st.grav, st.vCap ?? 16); // AI_001/AI_002 钳 16；31 沙球钳 10（:55159）
      if (st.xDamp) this.vx *= st.xDamp;
      if (st.xFrict) {            // 31 沙球侧摩（:55087-55100）：±N 向 0 收
        if (this.vx < -st.xFrict) this.vx += st.xFrict;
        else if (this.vx > st.xFrict) this.vx -= st.xFrict;
        else this.vx = 0;
      }
    }
    // ---- 旋转（各 aiStyle 权威语义,见 DART_STYLE 头注）----
    switch (st.rot) {
      case 'align90': this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2; break;
      case 'a45': this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 4; break;
      case 'roll': this.rot += (Math.abs(this.vx) + Math.abs(this.vy)) * 0.03 * this.dir; break;
      case 'spin': this.rot += st.spinRate! * this.dir; break;
      case 'tilt': this.rot = this.vx * 0.125; break;          // 836 蒲公英籽 :43312
      case 'none': this.rot = 0; break;
    }
    // ---- alpha 渐入（alpha=255 SetDefaults 族;速率:'speed'=|v|*0.9 [:52782 302 族]/恒减）----
    if (this.alpha > 0) {
      this.alpha -= st.fade === 'speed'
        ? Math.hypot(this.vx, this.vy) * 0.9
        : (typeof st.fade === 'number' ? st.fade : 50);
      if (this.alpha < 0) this.alpha = 0;
    }
    // ---- 115 三叉戟呼吸脉冲（AI_027 :24806-24826:15 更新起 scale ∓0.02/alpha ±30 交替）----
    if (st.pulse && this.age > 15) {
      if (this.pulseDir === 0) {
        this.scale -= 0.02; this.alpha = Math.min(255, this.alpha + 30);
        if (this.alpha >= 250) this.pulseDir = 1;
      } else {
        this.scale += 0.02; this.alpha = Math.max(0, this.alpha - 30);
        if (this.alpha <= 0) this.pulseDir = 0;
      }
    }
    // ---- 288 金雨 scale 递减（AI_012 :22824 scale-=0.002,归零即 Kill）----
    if (st.shrink) {
      this.scale -= st.shrink;
      if (this.scale <= 0) { this.dead = true; return; }
    }
    // ---- 836 蒲公英籽帧动画（:43281 每 6 更新步进 4 帧循环）----
    if (st.animEvery && this.age % st.animEvery === 0) this.frame = (this.frame + 1) % (st.frameRand ?? 4);
    // ---- 836 蒲公英籽风力转向（:43283-43310:顺风加速漂向玩家,逆风弱漂;离玩家/玩家死 → 缓落）----
    if (st.windSeed) {
      const p = game.player;
      const wind = game.world.weather?.windSpeedCurrent ?? 0;
      const dir = p.cx > this.cx ? 1 : -1;
      const cross = (wind > 0 ? 1 : -1) !== dir;   // flag54 = 风向与玩家方位相反
      const cx = cross ? 1.5 : 2.5, cy = cross ? 1 : 2;
      if (!p.dead && Math.hypot(p.cx - this.cx, p.cy - this.cy) < 800) {
        if (!cross) {
          this.vx += 0.05 * dir * (0.6 + Math.abs(wind));
          if (this.vx > cx) this.vx -= 0.1;
          if (this.vx < -cx) this.vx += 0.1;
        }
        if (p.y <= this.cy || cross) {
          this.vy += 0.05;
          if (this.vy > cx) this.vy -= 0.1;
        } else {
          this.vy -= 0.1;
          if (this.vy < -cy) this.vy += 0.2;
        }
      } else {
        this.vy += 0.2;
        this.vy = Math.max(-cy, Math.min(cy, this.vy));
      }
    }
    // ---- 位移 ----
    // 293 追踪（AI_051 :AI_051 200px 曼哈顿内:target=norm(玩家-心)×3,vel=(vel*100+target)/101）
    if (st.home && !game.player.dead) {
      const p = game.player;
      if (Math.abs(p.cx - this.cx) + Math.abs(p.cy - this.cy) < st.home.range) {
        const ddx = p.cx - this.cx, ddy = p.cy - this.cy;
        const dd = Math.hypot(ddx, ddy) || 1;
        const tvx = (ddx / dd) * st.home.spd, tvy = (ddy / dd) * st.home.spd;
        this.vx = (this.vx * st.home.lerp + tvx) / (st.home.lerp + 1);
        this.vy = (this.vy * st.home.lerp + tvy) / (st.home.lerp + 1);
      }
    }
    this.x += this.vx;
    this.y += this.vy;
    // ---- 31 沙球沿途击碎（:55106-55136 KillTile 清单，每 tick 扫重叠盒）：
    //      水晶12/雕像105/钟乳石165/裸露宝石178/小石堆185/大石堆186-187/
    //      魔力水晶639/生命水晶巨石665——沙球扫过即碎 ----
    if (st.sandBall) {
      const sst = game.world.store;
      for (let bx = Math.floor(this.x / TILE); bx <= Math.floor((this.x + this.w - 0.01) / TILE); bx++) {
        for (let by = Math.floor(this.y / TILE); by <= Math.floor((this.y + this.h - 0.01) / TILE); by++) {
          if (!sst.inBounds(bx, by)) continue;
          const t = sst.get(bx, by);
          if (t === 12 || t === 105 || t === 165 || t === 178 || t === 185 || t === 186
            || t === 187 || t === 639 || t === 665) game.breakTile?.(bx, by);
        }
      }
    }
    // ---- 拖尾尘（原版每更新 NewDust;近似为低频 spawnParticles 防刷屏）----
    if (st.trail && (this.tick & 1) === 0) {
      game.spawnParticles(this.cx, this.cy, st.trail.color, st.trail.count, 0.4,
        { life: st.trail.life ?? 24, damp: 0.93, grav: st.trail.grav ?? 0 });
    }
    // ---- 光照：无实体自报光。发光弹型（44/84/96/115/180/257/302 等）全部由 Game 侧
    //      ProjLight() 1:1 标量循环结算（SetDefaults light × 乘区/绝对通道表）——
    //      曾在此处自报 st.light 造成双重注入，且多条数值与原版不符（96 灰 vs 原版绿、
    //      257 手调蓝、596/814 原版根本无光）已全数摘除
    // ---- 撞实心块 ----
    const tx = Math.floor(this.cx / TILE);
    const ty = Math.floor(this.cy / TILE);
    if (game.world.store.isSolid(tx, ty)) {
      if (st.rocket) { this.rocketKill(game); return; }  // 303 火箭撞块即爆（Kill 段）
      if (st.noTile) { /* 300 圣锤/299 暗影焰 tileCollide=false:穿墙 */ }
      else {
        // ---- 31 沙球落档（Projectile.cs :75430-75536）：落地放沙 53 ----
        // 下方是轨道314/传送带421-422 不放（BlockBelowMakesSandFall 门与
        // 421-422 上放沙失败掉物品的边角略——本仓无逐格落沙链）。
        // 弹心已入实心格时向上找第一个空格（原版 TileCollision 令弹体停在格
        // 外、放置格=弹心；本仓中心判死已入格半步）
        if (st.sandBall) {
          const sst = game.world.store;
          const scx = Math.floor(this.cx / TILE);
          let scy = Math.floor(this.cy / TILE);
          while (scy > 0 && sst.get(scx, scy) !== 0) scy--;
          const below = sst.inBounds(scx, scy + 1) ? sst.get(scx, scy + 1) : 0;
          const noPlace = below === 314 || below === 421 || below === 422;
          if (!noPlace && sst.inBounds(scx, scy) && sst.get(scx, scy) === 0) sst.setTile(scx, scy, 53);
        }
        this.dead = true; return;
      }
    }
    // ---- 命中玩家(敌对):矩形相交即消耗弹体;伤害走 damagePlayer(防御减算/受击音/
    // iframes 去重——无敌帧内命中不扣血但弹体照常销毁,原版语义) ----
    if (projOverlap(this.x, this.y, this.w, this.h, game.player) && !game.player.dead) {
      if (st.rocket) { this.rocketKill(game); return; }
      hitPlayer(this, game, this.damage);
      this.dead = true;
    }
  }

  /** 303 骷髅火箭 Kill（Projectile.Kill :74533 组:128×128 伤害盒 + 22 盒烟尘/火/Gore +
   *  SoundID.Item14;不炸地形——不在 ExplodeTiles 表 cs:75262） */
  private rocketKill(game: GameHooks): void {
    this.dead = true;
    const cx = this.cx, cy = this.cy;
    game.playSfxFiles(['Item_14'], 1, cx, cy);
    game.spawnParticles(cx, cy, '#9A9A9A', 30, 2, { life: 40, damp: 0.96 });          // 尘 31 ×1.4
    game.spawnParticles(cx, cy, '#FF9A3C', 20, 5, { life: 30, damp: 0.94, grav: -0.06 }); // 火 6 ×7/×3
    game.spawnParticles(cx, cy, '#D8D8D0', 8, 3, { life: 50, damp: 0.95, size: 3 });  // Gore 61-63 四向
    // 伤害盒（:44525 timeLeft≤3 时 Resize(128,128)——纯伤害,与地形无关）
    const box = { x: cx - 64, y: cy - 64, w: 128, h: 128 };
    const p = game.player;
    if (!p.dead && box.x < p.x + p.w && box.x + box.w > p.x && box.y < p.y + p.h && box.y + box.h > p.y) {
      hitPlayer(this, game, this.damage);
    }
  }

  /** 无表项通用弹（projId=0 历史路径）:直线+撞块消亡 */
  private legacyStep(game: GameHooks): void {
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor(this.cx / TILE);
    const ty = Math.floor(this.cy / TILE);
    if (game.world.store.isSolid(tx, ty)) { this.dead = true; return; }
    if (projOverlap(this.x, this.y, this.w, this.h, game.player) && !game.player.dead) {
      hitPlayer(this, game, this.damage);
      this.dead = true;
    }
  }

  // ===========================================================================
  // G3 宿主绑定弹（2026-08-19）：411→537 激光 / 424→573 蓄能弹。
  // 原版 NPC 发射把 whoAmI 传 NewProjectile 末参（落 ai[1]），弹体按 id+type 回查
  // 宿主（Main.npc[i].active && type==N 的双门）——单人真实行为（非 netcode）：
  //  · 537（aiStyle84，Projectile.cs:30286-30549）：束原点逐 t 锁回活宿主眼部
  //    :30308；宿主死→解除锁定原地照完剩余寿命（不 Kill——同族 455 头死即灭是
  //    :30296-30297 专属分支，537 无）。UpdatePosition 跳过表含 aiStyle84（:19028）
  //    → 永不积分位移，velocity 只当束向单位向量。
  //  · 573（aiStyle102 case573，:32040-32280）：蓄能 90t（悬停漂移+隐形 alpha255+
  //    尘 242）；宿主死中途 → ai[0]=90 当 t 齐射（目标 Player.FindClosest 兜底）；
  //    宿主活 → 继承其目标。齐射 = ±50 抖动 ×0.8-1.2 距离档、速 20；此后 alpha0
  //    显形、rotation 随弹向 0.4 lerp。UpdatePosition 不跳过 → 每 t position+=velocity。
  // ===========================================================================

  /** 537 观星者激光单步（aiStyle84）：见上注。命中 = 玩家矩形 vs 束线段宽
   *  22·scale（Colliding :14703 CheckAABBvLineCollision）；伤害走敌弹标准乘区
   *  （难度×2，:13770-13781——hitPlayer 同式，此处在束判定内联） */
  private stargazerBeamStep(game: GameHooks): void {
    this.age++;
    if (this.age >= 90) { this.dead = true; return; }          // :30444-30447 localAI[0]>=90 Kill
    const vl = Math.hypot(this.vx, this.vy) || 1;
    const dirX = this.vx / vl, dirY = this.vy / vl;
    this.vx = dirX; this.vy = dirY;                            // :30477-30479 归一（束向）
    this.rot = Math.atan2(dirY, dirX) - Math.PI / 2;           // rotation = num731 − π/2
    // 宿主位锁（:30308）：active 且 type==411 才每 t 锁回 Center+(direction*6,−4)
    // ——gfxOffY 本仓敌怪恒 0；宿主死/换型 → 不锁，束钉在最后位置照完寿命
    const host = this.hostOf(game, 411);
    if (host) {
      this.x = host.cx + host.facing * 6 - this.w / 2;
      this.y = host.cy - 4 - this.h / 2;
    }
    this.scale = Math.min(0.8, Math.sin((this.age * Math.PI) / 90) * 10 * 0.8);  // :30448-30450
    // 束长：LaserScan 2 采样（宽 0 → 双线同点）取均值，0.5/t Lerp（:30483-30510）
    this.beamLen += (this.laserScanLen(game, dirX, dirY) - this.beamLen) * 0.5;
    // 光照 PlotTileLine (0.4,0.85,0.9)（:30612-30613）：沿束向逐格三线带（中±半宽）
    const half = (22 * this.scale) / 2;
    for (let d = 0; d <= this.beamLen; d += TILE) {
      game.addLightAt?.(this.cx + dirX * d, this.cy + dirY * d, 0.4, 0.85, 0.9);
      game.addLightAt?.(this.cx + dirX * d - dirY * half, this.cy + dirY * d + dirX * half, 0.4, 0.85, 0.9);
      game.addLightAt?.(this.cx + dirX * d + dirY * half, this.cy + dirY * d - dirX * half, 0.4, 0.85, 0.9);
    }
    // 束端尘 226（:30593-30616）：数量 = 2×clamp(age/30)，束端 Center+dir·(len−8) 侧抛
    const prog = Math.min(1, Math.max(0, this.age / 30));
    const tipX = this.cx + dirX * (this.beamLen - 8), tipY = this.cy + dirY * (this.beamLen - 8);
    for (let k = 0; k < 2 * prog; k++) {
      const da = Math.atan2(dirY, dirX) + (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2);
      game.spawnBurst?.(tipX, tipY, '#8FE8FF', 1, Math.random() * 0.8 + 1, da, 0,
        { life: 24, damp: 0.95 });
    }
    // 命中（:14703）：线段 Center→Center+dir·len，宽 22·scale；iframes 由
    // damagePlayer→Player.damage 内建去重（对应原版 player.immune 门）
    const p = game.player;
    if (p && !p.dead && p.iframes <= 0
      && segHitsRect(this.cx, this.cy, dirX * this.beamLen, dirY * this.beamLen,
        22 * this.scale, p)) {
      game.damagePlayer(
        hostileProjectileDamage(this.damage, mainDifficulty(game.world)) * 2,
        this.cx, this.cy);
    }
  }

  /** 573 预言者蓄能弹单步（aiStyle102 case573：num850=424/num851=90/num854=20/
   *  flag47=false/flag48=true/flag49=false，:32064-32068）。蓄能期隐形（alpha255）
   *  纯尘视觉；弹体永不积分旋转（aim lerp 是 574 专属分支，:32160-32173） */
  private oracleOrbStep(game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }        // timeLeft 600（SetDefaults）
    this.age++;                                                // ai[0] 计数
    const host = this.hostOf(game, 424);
    if (this.age < 90) {
      // 蓄能期（:32086-32128）：宿主活 → 原地微漂（flag48=true 不跟随宿主位移）；
      // 宿主死 → ai[0]=90 当 t 转入齐射分支（:32092-32094 else）
      if (!host) this.age = 90;
      else {
        this.alpha = 255;                                      // :32112 隐形
        if (Math.random() < 0.5) {                             // :32104-32110 尘 242 ×1/2
          const c = { x: this.cx - 4, y: this.cy - 4, w: 8, h: 8 };
          game.spawnParticles(c.x, c.y, '#9FD8FF', 1, 1.5, { life: 26, damp: 0.93, grav: 0 });
        }
      }
    }
    if (this.age === 90) {
      // 齐射（:32172-32210）：目标 = 宿主活→宿主目标（单玩家）/ 死→FindClosest
      //（同为玩家实体）；±50 双轴抖动 ×(0.8..1.2) 距离档，归一 ×20
      const p = game.player;
      if (p) {
        let ax = p.cx - this.cx + (Math.floor(Math.random() * 101) - 50);
        let ay = p.cy - this.cy + (Math.floor(Math.random() * 101) - 50);
        ax *= (80 + Math.floor(Math.random() * 41)) * 0.01;
        ay *= (80 + Math.floor(Math.random() * 41)) * 0.01;
        const al = Math.hypot(ax, ay);
        if (al > 0.001) { this.vx = (ax / al) * 20; this.vy = (ay / al) * 20; }
        else { this.vx = 0; this.vy = -20; }                    // NaN 退化（原版 UnitY）
      }
    }
    if (this.age < 90) { this.x += this.vx; this.y += this.vy; return; }
    // 齐射后（:32218-32232）：显形 alpha0、rotation 随弹向 0.4 lerp、尘 242 ×1/4
    this.alpha = 0;
    this.rot += (Math.atan2(this.vy, this.vx) + Math.PI / 2 - this.rot) * 0.4;
    if (Math.random() < 0.25) {
      game.spawnParticles(this.cx - 4, this.cy - 4, '#9FD8FF', 1, 0.5,
        { life: 26, damp: 0.93, grav: 0 });
    }
    this.x += this.vx; this.y += this.vy;
    // 撞实心（tileCollide 默认 true）：TileCollision 语义 = 速度截停（粘墙不灭）
    const tx = Math.floor(this.cx / TILE), ty = Math.floor(this.cy / TILE);
    if (game.world.store.isSolid(tx, ty)) { this.vx = 0; this.vy = 0; }
    // 命中（penetrate −1 穿透不消耗）：iframes 去重后每 40t 一跳
    const p = game.player;
    if (this.hostile && p && !p.dead && p.iframes <= 0
      && projOverlap(this.x, this.y, this.w, this.h, p)) {
      game.damagePlayer(
        hostileProjectileDamage(this.damage, mainDifficulty(game.world)) * 2,
        this.cx, this.cy);
    }
  }

  /** 宿主回查（原版 Main.npc[ai[1]].active && type==N 双门）：id + 未死 + 型号 */
  private hostOf(game: GameHooks, type: number):
    { cx: number; cy: number; facing: number } | undefined {
    if (!this.ownerNpcId) return undefined;
    const list = game.enemies() as Array<{ id: number; dead: boolean; vanillaId?: number | null;
      cx: number; cy: number; facing: number }>;
    const n = list.find((e) => e.id === this.ownerNpcId);
    return n && !n.dead && n.vanillaId === type ? n : undefined;
  }

  /** Collision.LaserScan 近似（537 档：2 采样宽 0 → 单线，最大 2400，8px 步进） */
  private laserScanLen(game: GameHooks, dirX: number, dirY: number): number {
    const st = game.world.store;
    const steps = Math.ceil(2400 / 8);
    for (let i = 1; i <= steps; i++) {
      const t = i * 8;
      const tx = Math.floor((this.cx + dirX * t) / TILE);
      const ty = Math.floor((this.cy + dirY * t) / TILE);
      if (!st.inBounds(tx, ty) || st.isSolid(tx, ty)) return t - 8;
    }
    return 2400;
  }

  // ---- 原版 Projectile 字段映射 ----
  private age = 0;          // ai[0]/localAI 计数
  private tick = 0;         // 拖尾节拍
  private rot = 0;          // projectile.rotation
  private alpha = 0;        // projectile.alpha(255=全透明,渐入)
  private scale = 1;        // projectile.scale
  private frame = 0;        // 多帧行帧号(909/836)
  private dir = 1;          // projectile.direction(旋转符号)
  private pulseDir = 0;     // 115 呼吸相位
}

/** 敌怪弹幕样式表——每条对应原版 Projectile 的 SetDefaults(Projectile.cs) + AI 行为。
 *  射击怪→弹型映射（NPC.cs 发射点行号见 Enemy.ts 各调用点注释）。
 *  旋转语义（画布与 XNA 同为顺时针正,直接套用原版公式）:
 *   align90 = rotation = atan2(vy,vx)+π/2 每更新（AI_001 通用尾 :54868,贴图静止朝上）
 *   a45     = atan2+π/4（115 三叉戟 AI_027 :24839）
 *   roll    = += (|vx|+|vy|)*0.03*direction（aiStyle2 :21519:471 骨头/909 岩石/300 圣锤）
 *   spin    = += rate*direction（44 魔镰 AI_018 :23814 rate 0.8 / 96 诅咒焰 AI_008 :22669 rate 0.3 /
 *             31 沙球 AI_010 :55158 rate 0.1）
 *   tilt    = rotation = vx*0.125（836 蒲公英籽 :43312）
 *   none    = 恒 0（128 霜爆/177 冰水吐涎/288 金雨,AI_028/AI_012 无旋转更新）
 *  alpha=255 族视觉 = 渐入（302 族按 |v|*0.9 :52782,257 恒 -10 :53036,其余家族恒减） */
interface DartStyle {
  w: number; h: number;                  // 碰撞盒(SetDefaults width/height)
  scale?: number;                        // 绘制缩放(SetDefaults scale)
  rot: 'align90' | 'a45' | 'roll' | 'spin' | 'tilt' | 'none';
  spinRate?: number;
  alpha0?: number;                       // 出生 alpha(255=渐入)
  fade?: 'speed' | number;               // 渐入速率
  grav?: number; gravDelay?: number; xDamp?: number;   // 重力档(ai0 门)
  vCap?: number;                                        // 垂直速度上限（31 沙球 10）
  /** 侧摩（31 沙球 AI_010 ai[0]==2 :55087-55100）：vx 每 tick ±N 向 0 收 */
  xFrict?: number;
  /** 31 沙球档：沿途 KillTile 清单击碎 + 落地 PlaceTile 沙 53（:75430-75536） */
  sandBall?: boolean;
  accel?: { from: number; to: number; mul: number };   // 加速段(ai0 区间内每更新 ×mul)
  updates?: number;                      // extraUpdates(每 tick 完整更新次数)
  noTile?: boolean;                      // tileCollide=false 穿墙
  life?: number;
  trail?: { color: string; count: number; life?: number; grav?: number };
  sfx?: string[];                        // 发射音(原版 wav)
  rocket?: number;                       // Kill 爆炸盒半宽(303)
  shrink?: number;                       // scale 递减(288)
  frameRand?: number;                    // 出生随机帧(909)
  animEvery?: number;                    // 帧动画步进(836:6)
  hFrames?: number;                      // 横向胶片列数(836=4,Frame(4,1,frame) Main.cs:33247)
  windSeed?: boolean;                    // 836 风力转向 AI
  home?: { spd: number; lerp: number; range: number };   // 293 追踪(AI_051)
  noTex?: boolean;                       // 贴图空桩,纯尘埃视觉(299)
  pulse?: boolean;                       // alpha/scale 呼吸(115)
  fallback?: string;                     // 贴图未就绪短线色
}

const DART_STYLE: Record<number, DartStyle> = {
  // 38 哈比羽毛(NPC.cs:23483 弹型 38):14×14 aiStyle1 直飞,timeLeft 300(NPC 侧覆写)
  38: { w: 14, h: 14, rot: 'align90', life: 300, fallback: '#E8E0D0' },
  // 129 符文爆弹（172 符文法师 :21228-21240）：14×14 穿墙直飞 timeLeft 300，
  //  aiStyle 28（tileCollide false / penetrate -1）——穿墙不消
  129: { w: 14, h: 14, rot: 'align90', life: 300, trail: { color: '#E8C85A', count: 1 }, fallback: '#F0D060' },
  // 596 沙漠幽焰（533 沙漠精灵 :21104-21135）：8×8 aiStyle 107 慢速追踪、timeLeft 180、
  //  ignoreWater；出生零速由 homing 拉向玩家（AI_107 收敛近似）
  596: { w: 8, h: 8, rot: 'align90', life: 180, home: { range: 2400, spd: 5, lerp: 40 },
    trail: { color: '#8A5AE8', count: 2 }, fallback: '#9A6AF0' },
  // 55 黄蜂毒刺(NPC.cs:51185):10×10 直飞 timeLeft 300;尘 18 拖尾(:52612)
  55: { w: 10, h: 10, rot: 'align90', life: 300, trail: { color: '#B8A070', count: 1 }, fallback: '#D8C890' },
  // 81/82 木箭/燃烧箭(战士族 num172 :59797/:59821):10×10,重力 0.07@20(:54009);发射音 Item5
  81: { w: 10, h: 10, rot: 'align90', grav: 0.07, gravDelay: 20, sfx: ['Item_5'], fallback: '#D8C8A0' },
  82: { w: 10, h: 10, rot: 'align90', grav: 0.07, gravDelay: 20, sfx: ['Item_5'], fallback: '#FFB060' },
  // 84 粉激光(NPC 122 :24887):4×4,scale1.2,alpha255 渐入(|v|*0.9),extraUpdates2,life600,
  //    光=ProjLight 0.75×(0.8,0,0.5)(:15181,Game 侧标量循环);发射音 Item12
  84: { w: 4, h: 4, rot: 'align90', scale: 1.2, alpha0: 255, fade: 'speed', updates: 2, life: 600,
    sfx: ['Item_12'], fallback: '#FF70E0' },
  // 96 诅咒焰(爬行者 101 :22846):16×16,alpha100(恒),spin 0.3,光=0.8×(0.35,1,0) 绿(ProjLight);
  //    尘 75 拖尾;Item20
  96: { w: 16, h: 16, rot: 'spin', spinRate: 0.3, alpha0: 100,
    trail: { color: '#9A6AFF', count: 1 }, sfx: ['Item_20'], fallback: '#8A5AE8' },
  // 115 邪恶三叉戟(红恶魔 156 :23533):16×16,a45,alpha255 呼吸脉冲,加速 ×1.125@ai0<30(:24753),
  //    光=ProjLight 0.5×(0.5,0.05,1)(:15205);Item8
  115: { w: 16, h: 16, rot: 'a45', alpha0: 255, fade: 50, pulse: true, life: 300,
    accel: { from: 0, to: 30, mul: 1.125 }, sfx: ['Item_8'], fallback: '#B060FF' },
  // 128 霜爆(冰元素 169 :24933):14×14 旋转恒 0,alpha255 渐入;尘 92 ×3;Item28
  128: { w: 14, h: 14, rot: 'none', alpha0: 255, fade: 50,
    trail: { color: '#A8D8F0', count: 2 }, sfx: ['Item_28'], fallback: '#C8ECFF' },
  // 174 冰刺/176 丛林刺/605 尖刺史莱姆刺(尖刺史莱姆 184/204/535):
  //    6×6,重力 174/605:0.15@5(:54017)/176:0.05@15(:54310)
  174: { w: 6, h: 6, rot: 'align90', alpha0: 255, fade: 50, grav: 0.15, gravDelay: 5,
    sfx: ['Item_17'], fallback: '#B8E0F0' },   // 发射音 Item17(:52163-52167)
  176: { w: 6, h: 6, rot: 'align90', alpha0: 255, fade: 50, grav: 0.05, gravDelay: 15,
    sfx: ['Item_17'], fallback: '#7AC868' },   // :52241-52245
  605: { w: 6, h: 6, rot: 'align90', alpha0: 255, fade: 50, grav: 0.15, gravDelay: 5,
    sfx: ['Item_154'], fallback: '#D8D0C0' },  // 605 族 Item154(:52213-52223)
  // 1073 史莱姆凝胶弹（携 539 史莱姆法杖物史莱姆 AI_001 :61099-61103：direction×12
  //   直飞伤 20 kb2；SetDefaults Projectile.cs:9754-9761：10×10 aiStyle1 hostile
  //   penetrate-1 trap——无重力直飞；命中 Poisoned(20) 600t 由 projTargets :11660 接）
  1073: { w: 10, h: 10, rot: 'align90', life: 600, fallback: '#7AB8E8' },
  // 177 冰水吐涎(冰鱼人 206 :59859):10×10 旋转恒 0,alpha255;尘 137 ×3
  177: { w: 10, h: 10, rot: 'none', alpha0: 255, fade: 50,
    trail: { color: '#BFE8F0', count: 2 }, fallback: '#A8D8E8' },
  // 180 死眼弹(海盗 214/216/292 :59895):4×4,scale1.2,alpha255 渐入(|v|*0.9),extraUpdates1,life600,
  //    光=ProjLight 0.5×(1,0.7,0.1)(:14990);Item11
  180: { w: 4, h: 4, rot: 'align90', scale: 1.2, alpha0: 255, fade: 'speed', updates: 1, life: 600,
    sfx: ['Item_11'], fallback: '#FFE8A0' },
  // 257 霜束(冰雪巨人 243 :59339):4×4,scale1.2,alpha255 渐入 -10(:53036),extraUpdates1,life600;
  //    光=ProjLight 0.75×(0.1,0.9,1);Item12
  257: { w: 4, h: 4, rot: 'align90', scale: 1.2, alpha0: 255, fade: 10, updates: 1, life: 600,
    sfx: ['Item_12'], fallback: '#A8E8FF' },
  // 288 金雨(脓水粘怪 268 :25032):32×32,重力 0.075(:22835),scale -0.002/更新(:22824),
  //    extraUpdates2,旋转恒 0;尘 170 ×3;Item17
  288: { w: 32, h: 32, rot: 'none', alpha0: 255, fade: 50, grav: 0.075, updates: 2, shrink: 0.002,
    trail: { color: '#E8C060', count: 2 }, sfx: ['Item_17'], fallback: '#E0B040' },
  // 299 暗影焰(巨型诅咒颅 289 :21795):6×6,alpha255,tileCollide=false 穿墙,extraUpdates2,
  //    贴图 1×1 空桩→纯尘埃(尘 181);Item8@第6更新(:53761)
  299: { w: 6, h: 6, rot: 'align90', alpha0: 255, fade: 50, updates: 2, noTile: true, noTex: true,
    trail: { color: '#7A5AFF', count: 1 }, fallback: '#7A5AFF' },
  // 300 圣锤(圣骑士 290 :59887):38×38 roll,重力 0.2@60(:21893),tileCollide=false 穿墙;Item1
  300: { w: 38, h: 38, rot: 'roll', grav: 0.2, gravDelay: 60, noTile: true, sfx: ['Item_1'], fallback: '#C8B860' },
  // 302 狙击弹(骷髅神射 291 :59883):4×4,scale1.18,alpha255 渐入(|v|*0.9),extraUpdates7(!) →
  //    弹速 4×8=32px/t,life300;光=ProjLight 0.3×(1,0.7,0.1);Item11
  302: { w: 4, h: 4, rot: 'align90', scale: 1.18, alpha0: 255, fade: 'speed', updates: 7, life: 300,
    sfx: ['Item_11'], fallback: '#FFF0B0' },
  // 303 火箭(骷髅爆破 293 :59893):14×20 aiStyle16 手雷族:重力 0.3 滚转,life180,Kill 128 盒爆炸
  303: { w: 14, h: 20, rot: 'roll', grav: 0.3, life: 180, rocket: 64, fallback: '#B8B8C0' },
  // 31 沙球(蚁狮 69 :24520 速12/伤10/timeLeft300/ai[0]=2 敌版):10×10。
  // 蚁狮档(AI_010 ai[0]==2 :55081-55100):重力 0.2 + vx 侧摩 ±0.04 向 0 收 + vy 钳 10
  // ——曾误用 ai[0]==1 落地态的 0.41(坠速翻倍,弧线错);spin 0.1 恒速(:55158);尘 32。
  // 沿途击碎水晶/雕像/宝石/石堆族(KillTile :55110-55136);落地放沙 53(:75430-75536,
  // 轨道 314/传送带 421-422 例外)——sandBall 档见撞块段
  31: { w: 10, h: 10, rot: 'spin', spinRate: 0.1, grav: 0.2, xFrict: 0.04, vCap: 10, life: 300,
    sandBall: true, trail: { color: '#D8C890', count: 1 }, fallback: '#D8C890' },
  // 471 骷髅骨(投骨骷髅 449-452 :59844):16×16,scale1.2,roll,重力 0.4@20+xDamp0.97(aiStyle2 通用尾 :21976)
  471: { w: 16, h: 16, rot: 'roll', scale: 1.2, grav: 0.4, gravDelay: 20, xDamp: 0.97, fallback: '#E0D8C8' },
  // 508 标枪(希腊骷髅 481 :59855):16×16,重力 0.3+xDamp0.98@ai0>60(:54589)
  508: { w: 16, h: 16, rot: 'align90', grav: 0.3, gravDelay: 61, xDamp: 0.98, fallback: '#C0A880' },
  // 572 蝾螈吐息(蝾螈族 498-506 :59849):10×10,alpha255 渐入;尘 40 ×2;Item17
  572: { w: 10, h: 10, rot: 'align90', alpha0: 255, fade: 50,
    trail: { color: '#8AD8A0', count: 2 }, sfx: ['Item_17'], fallback: '#8AD8A0' },
  // 44 魔鬼飞镰(恶魔 62/66 :23504):48×48,scale0.9,alpha100,spin 0.8(:23814),
  //    加速 ×1.06@ai0[30,100)(:23816),光=ProjLight 0.2×(0.6,0.1,B=1 绝对)(:15054);尘 27;Item8(:23723)
  44: { w: 48, h: 48, rot: 'spin', spinRate: 0.8, scale: 0.9, alpha0: 100, life: 300,
    accel: { from: 30, to: 100, mul: 1.06 },
    trail: { color: '#B08050', count: 1 }, sfx: ['Item_8'], fallback: '#B08050' },
  // 909 岩石巨人岩(631 :56722):12×12,roll,重力 0.4@38+xDamp0.97(:21527),随机帧 1-6(:21534)
  909: { w: 12, h: 12, rot: 'roll', grav: 0.4, gravDelay: 38, xDamp: 0.97, frameRand: 6, fallback: '#9A8C72' },
  // 83 死光 EyeLaser(Eyezor 251 :59373；EoC 雷眼 :26726 同弹):4×4,aiStyle1 直飞,
  //    scale1.7,alpha255 渐入 −15(:52730/:52742),extraUpdates2,penetrate3,life600;
  //    光=ProjLight 0.75×(0.7,0,1)(:15178——Game 侧 PROJ_LIGHT_MUL 83 已注册,勿在此自报)
  83: { w: 4, h: 4, rot: 'align90', scale: 1.7, alpha0: 255, fade: 15, updates: 2, life: 600,
    fallback: '#70E0FF' },
  // 498 铁钉 Nail(Nailhead 463 散射 :57611):6×6,aiStyle1 直飞,penetrate -1,life180;
  //    出生音 Item17(:54610);ai0≥50 起摩擦 vx×0.98 + 重力 0.15(:54615-54618),
  //    同段 rotation 改自旋 ±0.5/更新（纯视觉,本表 rot 单模未接——登记）
  498: { w: 6, h: 6, rot: 'align90', grav: 0.15, gravDelay: 49, xDamp: 0.98, life: 180,
    sfx: ['Item_17'], fallback: '#D8D8E0' },
  // 501 蝇瓶 DrManFlyFlask(Dr. Man Fly 468 :59863):14×14,aiStyle2 抛物,scale1.1;
  //    ai0≥18 起摩擦 vx×0.995 + 重力 0.2(:21804-21811),之前直飞
  501: { w: 14, h: 14, rot: 'align90', scale: 1.1, grav: 0.2, gravDelay: 18, xDamp: 0.995,
    fallback: '#C8E060' },
  // ---- 史后三法师（NPC.cs:21146-21191,timeLeft 均覆写 300）----
  // 290 暗影束(死灵法师 283/284):4×4,aiStyle48 束弹——extraUpdates 100(束速 ~6×101≈606px/t
  //    全屋瞬达);life 300(NPC.cs:21191 对 281-286 射击统一覆写,覆盖 SetDefaults 的 100)
  290: { w: 4, h: 4, rot: 'align90', life: 300, updates: 100, fallback: '#B090FF' },
  // 291 地狱火弹(魔法师 285/286):12×12,alpha255 渐入,tileCollide=false,Kill→130×130 爆炸
  //    (弹 292,半宽 65;原版 aiStyle50 到点即爆——此处撞人/到期爆,到点判据登记待补)
  291: { w: 12, h: 12, rot: 'align90', alpha0: 255, fade: 50, life: 300, noTile: true, rocket: 65, fallback: '#FF9040' },
  // 293 迷失之魂(布道者 281/282):12×12,旋转恒 0,alpha255,tileCollide=false,extraUpdates1,
  //    200px 内追踪(:AI_051 target v=norm×3,vel=(vel*100+t)/101);尘 175 ×9/更新;Item8
  293: { w: 12, h: 12, rot: 'none', alpha0: 255, fade: 50, life: 300, noTile: true, updates: 1,
    home: { spd: 3, lerp: 101, range: 200 },
    trail: { color: '#C8C0FF', count: 2 }, sfx: ['Item_8'], fallback: '#D8D0FF' },
  // 836 蒲公英籽(628):4×4,tilt 旋转,4 帧行 6 更新步进(帧动画由 frame 自增,此处用出生随机帧近似起步)
  836: { w: 4, h: 4, rot: 'tilt', frameRand: 4, animEvery: 6, hFrames: 4, windSeed: true, fallback: '#E8E8D0' },
  // 814 血弹(恐惧鹦鹉螺 AI_117 :47751):10×10 aiStyle1,alpha255 渐入 -20/t(:53573),
  //    tileCollide=false 穿墙,penetrate=-1;★原版 814 无光(:53561 起块内无 AddLight——
  //    曾误挂 819 的红光 :53558);尘 5 尾;出生音 Item171(:53562)
  814: { w: 10, h: 10, rot: 'align90', alpha0: 255, fade: 20, noTile: true, life: 180,
    trail: { color: '#C83848', count: 1 },
    sfx: ['Item_171'], fallback: '#B03040' },
  // ---- G3 宿主绑定弹（2026-08-19；AI/绘制全走专用分支，表项只供尺寸/贴图装载）----
  // 537 观星者激光(SetDefaults :5842-5851):22×22 aiStyle84,alpha255(绘制独占不读 α),
  //    tileCollide=false,timeLeft240(AI 侧 localAI[0]>=90 先杀);发射点 NPC.cs:59972
  537: { w: 22, h: 22, rot: 'none', alpha0: 255, noTile: true, life: 240 },
  // 573 预言者蓄能弹(SetDefaults :5950-5957):18×30 aiStyle102,timeLeft600,单帧 14×26;
  //    蓄能 90t 隐形(alpha255)→齐射显形;发射点 NPC.cs:59978(四发扇)
  573: { w: 18, h: 30, rot: 'none', life: 600, fallback: '#9FD8FF' },
};

/**
 * 629 TowerDamageBolt（Projectile.cs AI_122 :33747-33778 + Kill 段 :69784-69819）：
 * 本组教徒怪死亡时朝对应塔发射的红色追踪弹——ai[0]=目标塔 NPC，
 * 每 tick velocity = normalize(塔心-弹心)×5（:33775-33777）+ Dust.QuickDust 红尘尾，
 * 命中塔 Hitbox → Kill：盾 -1（Game 侧 onTowerBoltHit）且盾非 0 时塔 ai[3]=1（闪光 120t）。
 * 目标失联（塔死亡/消失）立即消亡（:33753-33761）。
 * 纯事件弹：无伤害（damage=0）、无碰撞、不参与联机弹幕同步（视觉弹） */
export class TowerBolt extends Entity {
  w = 10; h = 10;
  /** 目标塔解析（每 tick 重查——塔可能在本弹飞行中死亡） */
  private target: () => Enemy | null;
  /** 命中回调（盾结算/闪光/盾破音，Game 注入） */
  private onHit: (tower: Enemy) => void;
  private life = 3600;

  constructor(x: number, y: number, target: () => Enemy | null, onHit: (tower: Enemy) => void) {
    super();
    this.x = x; this.y = y;
    this.target = target;
    this.onHit = onHit;
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.ctx;
    if (!ctx) return;
    // 世界坐标绘制:原版贴图 Projectile_629(已解包入库);ensureVImage 触发懒加载
    // (2026-08-13 枚举 review:此前直取+无人预载=永久红点兜底)
    const img = r.atlas ? r.atlas.ensureVImage('vanilla/Projectile_629.png') : null;
    if (img) {
      ctx.drawImage(img, this.x + this.w / 2 - img.width / 2, this.y + this.h / 2 - img.height / 2);
      return;
    }
    ctx.fillStyle = '#FF4040';
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = '#FFB0A0';
    ctx.fillRect(this.x + 3, this.y + 3, this.w - 6, this.h - 6);
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const t = this.target();
    if (!t || t.dead) { this.dead = true; return; }   // AI_122 目标失联即 Kill（:33753-33761）
    if (--this.life <= 0) { this.dead = true; return; }
    const dx = t.cx - this.cx, dy = t.cy - this.cy;
    const len = Math.hypot(dx, dy) || 1;
    this.vx = (dx / len) * 5;                          // :33775 normalize(塔心-弹心)×5
    this.vy = (dy / len) * 5;
    this.x += this.vx;
    this.y += this.vy;
    // 红尘尾（:33778 Dust.QuickDust(Center, Red)——无重力短命尘）
    game.spawnParticles(this.cx, this.cy, Math.random() < 0.5 ? '#FF4040' : '#FF9060',
      1, 0.5, { life: 12, damp: 0.95, grav: 0 });
    // 命中塔 Hitbox（:33765-33770）→ Kill → 盾结算回调
    if (this.aabbOverlaps(t)) {
      this.dead = true;
      this.onHit(t);
    }
  }
}
