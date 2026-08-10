// 蜂后 222(aiStyle 43,NPC.cs:30312-30998)+ 世纪之花族 1:1 移植(Terarria1456,1.4.5.6)。
//   aiStyle 50(NPC.cs:31807-31872)= NPC 261 真菌孢子 / 265 孢子(漂移族,261 撞墙即碎)
//   aiStyle 51(NPC.cs:31873-32237)= NPC 262 世纪之花本体(钩蔓均值牵引 + 二阶段触须)
//   aiStyle 52(NPC.cs:32238-32405)= NPC 263 世纪之花钩蔓(抓墙锚定,牵引本体)
// 经典模式参数 1:1;expert/getGoodWorld 分支只注释保留;netcode(netUpdate/Main.netMode)跳过。
// 本体/部件均 noTileCollide(原版 SetDefaults),故位移由各核自行积分(e.x+=vx)。
import type { Enemy } from './Enemy';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { spawnPart, shoot, accelTo, losClear } from './bossAI';

/** 原版 localAI[0..3](Enemy 的 ai0-ai3 对应 ai[],localAI 是独立数组 → WeakMap 落盘) */
const localAI = new WeakMap<Enemy, number[]>();
const la = (e: Enemy): number[] => {
  let a = localAI.get(e);
  if (!a) { a = [0, 0, 0, 0]; localAI.set(e, a); }
  return a;
};

/** Main.rand.Next(n) → [0,n) */
const rnd = (n: number): number => Math.floor(Math.random() * n);
/** Main.rand.Next(a, b) → [a,b) */
const rndRange = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

// ============================================================================
// AI_043 蜂后 222(NPC.cs:30312-30998)
// ai[0] 状态:-1 选下一招 / 0 悬浮-俯冲循环 / 2 飞至玩家上方 / 1 机枪蜜蜂 /
//            3 毒刺弹幕 / 4 远距追赶 / 5 玩家死离场。
// ai[1]:状态 0 内的半程计数(偶=悬浮 奇=冲撞减速,>2*num662 换招);离开时暂存上一状态供 -1 去重。
// ai[2]:状态 0 减速门(1=正在减速);状态 1/3 已发弹计数。
// ============================================================================
export function queenBeeAI(e: Enemy, game: GameHooks, player: Player | null) {
  // 首帧复位(ai0 默认 -1120 是史莱姆族约定,原版 ai[0] 从 0 起步)
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; la(e)[0] = 0; }
  // 玩家失效 = 原版 TargetClosest 落空后的 dead4(:30316-30319)
  const dead4 = !player || player.dead;
  // 暴怒度 num658(:30321-30327):地表 +1 / 非丛林 +1(getGoodWorld +0.5 省略)。
  // ZoneJungle 群系判定暂缺 → 只保留 worldSurface 一档(见汇报简化项)
  let num658 = 0;
  if (e.y / TILE < game.world.groundLevel) num658 += 1;
  const num659 = player ? Math.hypot(player.cx - e.cx, player.cy - e.cy) : 1e9;
  // timeLeft 维持 ≥60(:30330-30334)由共享 Despawn 系统承担,不在此重复
  if (e.ai0 !== 5 && num659 > 3000) e.ai0 = 4;   // :30336-30341 远距追赶
  if (dead4) e.ai0 = 5;                           // :30342-30345

  let direction = e.facing || 1;
  if (e.ai0 === 5) {
    // 离场(:30346-30383):朝世界远端飞,vx 恒向远端加速 0.08
    e.vy *= 0.98;
    direction = e.vx < 0 ? -1 : 1;
    e.facing = direction;
    const halfW = game.world.store.w * TILE / 2;   // Main.maxTilesX * 8 = 世界中线
    if (e.x < halfW) {
      if (e.vx > 0) e.vx *= 0.98; else la(e)[0] = 1;
      e.vx -= 0.08;
    } else {
      if (e.vx < 0) e.vx *= 0.98; else la(e)[0] = 1;
      e.vx += 0.08;
    }
    // EncourageDespawn(10):共享 Despawn 系统兜底
  } else if (e.ai0 === -1) {
    // 选下一招(:30384-30408):{0,2,3} 随机,避开 ai1 暂存的上一状态
    let pick: number;
    do {
      pick = rnd(3);
      if (pick === 1) pick = 2; else if (pick === 2) pick = 3;
    } while (pick === e.ai1);
    e.ai0 = pick;
    e.ai1 = 0;
    e.ai2 = 0;
  } else if (e.ai0 === 0) {
    // 悬浮-俯冲循环(:30409-30605)
    const num662 = 2;   // :30409-30417(经典 2;expert 随血量 +1/3/5 档)
    if (e.ai1 > 2 * num662 && e.ai1 % 2 === 0) {
      // 循环数满 → 换招(:30419-30427);ai1 归 0 = 上一状态是 0
      e.ai0 = -1;
      e.ai1 = 0;
      e.ai2 = 0;
    } else if (e.ai1 % 2 === 0) {
      // 悬浮/俯冲判定(:30428-30499)
      direction = player!.cx < e.cx ? -1 : 1;
      const num663 = 20 + 20 * num658;
      if (Math.abs(e.cy - player!.cy) < num663) {
        // 俯冲(:30451-30499):localAI[0]=1(冲刺动画),12(+7*num658) 速直冲玩家
        la(e)[0] = 1;
        e.ai1 += 1;
        e.ai2 = 0;
        const num664 = 12 + 7 * num658;   // expert 随血量 16→24 省略
        const dx = player!.cx - e.cx, dy = player!.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        e.vx = (dx / d) * num664;
        e.vy = (dy / d) * num664;
        e.facing = direction;
        game.playSfx('roar', 0.5);   // SoundEngine.PlaySound(29, ..., 125) 蜂后冲刺吼,近似
      } else {
        // 悬浮(:30500-30565):Y 朝玩家 0.15(+0.5*num658) 钳 ±12(+3*num658);
        // X 三段 >600 加速 / <300 反向 / 中带阻尼 0.8,钳 ±16
        la(e)[0] = 0;
        const num668 = 12 + 3 * num658;
        const num669 = 0.15 + 0.5 * num658;
        e.vy += e.cy < player!.cy ? num669 : -num669;
        e.vy = clamp(e.vy, -num668, num668);
        const dxAbs = Math.abs(e.cx - player!.cx);
        if (dxAbs > 600) e.vx += 0.15 * direction;
        else if (dxAbs < 300) e.vx -= 0.15 * direction;
        else e.vx *= 0.8;
        e.vx = clamp(e.vx, -16, 16);
        e.facing = direction;
      }
    } else {
      // 俯冲后(:30566-30605)
      direction = e.vx < 0 ? -1 : 1;
      e.facing = direction;
      const num670 = 600 - Math.floor(100 * num658);
      const num671 = e.cx < player!.cx ? -1 : 1;
      let flag45 = false;
      // 冲过头/垂直脱靶 → 进入减速门 ai2=1
      if (direction === num671 && Math.abs(e.cx - player!.cx) > num670) { e.ai2 = 1; flag45 = true; }
      if (Math.abs(e.cy - player!.cy) > num670 * 1.5) { e.ai2 = 1; flag45 = true; }
      if (num658 > 0 && flag45) { e.vx *= 0.5; e.vy *= 0.5; }
      if (e.ai2 === 1) {
        // 减速(:30600-30613 主体):0.9/tick(num658>0 再 0.7),速降 <0.1 → 回悬浮(ai1+1)
        la(e)[0] = 0;
        e.vx *= 0.9;
        e.vy *= 0.9;
        if (num658 > 0) { e.vx *= 0.7; e.vy *= 0.7; }
        if (Math.abs(e.vx) + Math.abs(e.vy) < 0.1) {
          e.ai2 = 0;
          e.ai1 += 1;
        }
      } else {
        la(e)[0] = 1;   // 仍朝目标飞行,维持冲刺动画
      }
    }
  } else if (e.ai0 === 2) {
    // 飞至玩家上方 200(:30606-30690):12 速 / 0.07 步进;距目标 <200 → 机枪蜜蜂
    direction = player!.cx < e.cx ? -1 : 1;
    e.facing = direction;
    const num675 = player!.cx - e.cx;
    const num676 = player!.cy - 200 - e.cy;
    const num677 = Math.hypot(num675, num676);
    if (num677 < 200) {
      e.ai0 = 1;
      e.ai1 = 0;
    } else {
      const t = 12 / num677;
      e.vx = accelTo(e.vx, num675 * t, 0.07);
      e.vy = accelTo(e.vy, num676 * t, 0.07);
    }
  } else if (e.ai0 === 1) {
    // 机枪蜜蜂(:30691-30830)
    la(e)[0] = 0;
    direction = player!.cx < e.cx ? -1 : 1;
    // 毒刺口 vector78(:30697):x 偏 rand(20)*direction,y 取 0.8h
    const vx78 = e.x + e.w / 2 + rnd(20) * direction;
    const vy78 = e.y + e.h * 0.8;
    const distToPlayer = Math.hypot(player!.cx - e.cx, player!.cy - e.cy);
    e.ai1 += 1;   // expert:邻域玩家数/血量档加成省略(:30713-30736)
    const num683 = Math.floor(40 - 18 * num658);
    let flag46 = false;
    if (e.ai1 > num683) {
      e.ai1 = 0;
      e.ai2 += 1;
      flag46 = true;
    }
    if (flag46 && losClear(game, vx78, vy78, player!.cx, player!.cy)) {
      // 出蜂(:30752-30778):210/211 小蜂,5 速朝玩家
      const bee = spawnPart(game, e, rndRange(210, 212));
      if (bee) {
        const dx = player!.cx - e.cx, dy = player!.cy - e.cy;
        const d = Math.hypot(dx, dy) || 1;
        bee.vx = (dx / d) * 5;
        bee.vy = (dy / d) * 5;
        // 原版 localAI[0]=60(蜜蜂寿命锚);本框架 swarmerAI 无该语义,Despawn 系统兜底
      }
      game.playSfx('hit', 0.4);   // SoundID 3(NPCHit 系)近似
    }
    if (distToPlayer > 400 || !losClear(game, vx78, vy78 - 30, player!.cx, player!.cy)) {
      // 拉近(:30779-30823):以毒刺口为基准 14 速 / 0.1 步进
      const dx = player!.cx - vx78, dy = player!.cy - vy78;
      const t = 14 / (Math.hypot(dx, dy) || 1);
      e.vx = accelTo(e.vx, dx * t, 0.1);
      e.vy = accelTo(e.vy, dy * t, 0.1);
    } else {
      e.vx *= 0.9;
      e.vy *= 0.9;
    }
    e.facing = direction;
    if (e.ai2 > 5) {
      // 6 波蜂后换招(:30824-30829);ai1=1 供 -1 去重(1 不在 {0,2,3} 内,等效不去重)
      e.ai0 = -1;
      e.ai1 = 1;
    }
  } else if (e.ai0 === 3) {
    // 毒刺弹幕(:30831-30981)
    const num688 = 4 + 6 * num658;
    const num689 = 0.05 + 0.2 * num658;
    direction = player!.cx < e.cx ? -1 : 1;
    const vx80 = e.x + e.w / 2 + rnd(20) * direction;
    const vy80 = e.y + e.h * 0.8;
    const num690 = player!.cx - e.cx;
    const num691 = player!.cy - 300 - e.cy;
    let num692 = Math.hypot(num690, num691);
    e.ai1 += 1;
    const num693 = 40 - Math.floor(5 * num658);   // expert 血量档 15/25/30/35 省略
    // 每隔 num693 tick 且位于玩家上方且视线通 → 毒刺 719
    if (e.ai1 % num693 === num693 - 1 && e.y + e.h < player!.y
      && losClear(game, vx80, vy80, player!.cx, player!.cy)) {
      const num694 = 8 + 7 * num658;               // expert +2/+5 省略
      const num695 = Math.max(1, Math.floor(80 - 39 * num658));
      const num696 = Math.max(1, Math.floor(40 - 19 * num658));
      let dx = player!.cx - vx80 + rndRange(-num695, num695 + 1);
      let dy = player!.cy - vy80 + rndRange(-num696, num696 + 1);
      const t = num694 / (Math.hypot(dx, dy) || 1);
      dx *= t;
      dy *= t;
      shoot(game, vx80, vy80, dx, dy, 11, 719, 300);   // 伤害 11 / timeLeft 300(:30875-30889)
      game.playSfx('hit', 0.4);                        // SoundID.Item17 近似
    }
    if (!losClear(game, vx80, vy80 - 30, player!.cx, player!.cy)) {
      // 隔墙:直接朝玩家 14 速 / 0.1 步进(:30890-30934)
      const dx = player!.cx - vx80, dy = player!.cy - vy80;
      const t = 14 / (Math.hypot(dx, dy) || 1);
      e.vx = accelTo(e.vx, dx * t, 0.1);
      e.vy = accelTo(e.vy, dy * t, 0.1);
    } else if (num692 > 100) {
      // 朝悬浮点(玩家上方 300)逼近 4 速 / 0.05 步进,符号翻转双步(:30935-30978)
      direction = player!.cx < e.cx ? -1 : 1;
      e.facing = direction;
      const t = num688 / num692;
      e.vx = accelTo(e.vx, num690 * t, num689);
      e.vy = accelTo(e.vy, num691 * t, num689);
      // 注:原版此处符号翻转时步进 ×2(velocity.X += num689 * 2f);
      // accelTo 只单步,差异极小(0.05/tick)且仅反向瞬间,不单独展开
      void num692;
    }
    const num703 = 20 - 5 * num658;
    if (e.ai1 > num693 * num703) {
      // 弹幕时长满(40*20=800t)→ 换招(:30979-30981);ai1=3 供 -1 去重
      e.ai0 = -1;
      e.ai1 = 3;
    }
  } else if (e.ai0 === 4) {
    // 远距追赶(:30982-30998):14 速混合逼近,进入 2000px → 换招
    la(e)[0] = 1;
    let tx = player!.cx - e.cx, ty = player!.cy - e.cy;
    const d = Math.hypot(tx, ty) || 1;
    tx = (tx / d) * 14;
    ty = (ty / d) * 14;
    e.vx = (e.vx * 14 + tx) / 15;
    e.vy = (e.vy * 14 + ty) / 15;
    direction = e.vx < 0 ? -1 : 1;
    e.facing = direction;
    if (num659 < 2000) {
      e.ai0 = -1;
      la(e)[0] = 0;
    }
  }
  e.x += e.vx;
  e.y += e.vy;
}

// ============================================================================
// AI_050 孢子漂移族(NPC.cs:31807-31872):NPC 261 真菌孢子 / 265 孢子(世纪之花二阶段产物)。
// 弱重力 0.02 下沉 + X 朝玩家 0.1 步进;261 撞墙即碎(life=0),265 穿墙。
// ============================================================================
export function planteraHookAI(e: Enemy, game: GameHooks, player: Player | null) {
  // EncourageDespawn(5):共享 Despawn 系统兜底
  e.vy += 0.02;                                    // :31819
  if (player) {
    if (e.vy < 0 && player.y > e.y + 100) e.vy *= 0.95;   // :31821-31824
    if (e.vy > 1) e.vy = 1;
    // X 朝玩家 0.1 步进,逆向先 0.98 阻尼(:31829-31860;expert 双档省略)
    if (e.x + e.w < player.x) {
      if (e.vx < 0) e.vx *= 0.98;
      e.vx += 0.1;
    } else if (e.x > player.x + player.w) {
      if (e.vx > 0) e.vx *= 0.98;
      e.vx -= 0.1;
    }
  }
  if (e.vx > 5 || e.vx < -5) e.vx *= 0.97;         // :31861-31864
  e.spin = e.vx * 0.2;                             // rotation = velocity.X * 0.2f(:31865)
  if (e.vanillaId === 261) {
    // 真菌孢子:noTileCollide=false,撞墙即碎(:31810-31818)
    e.onGround = false; e.hitWall = false; e.hitHead = false;
    moveAndCollide(e, game.world, e.vx, e.vy);
    if (e.hitWall || e.hitHead || e.onGround) {
      e.hp = 0;
      e.dead = true;
      game.spawnParticles(e.cx, e.cy, '#7A9E4F', 5, 1.5);   // HitEffect(0,100) 近似
    }
  } else {
    // 265 孢子 noTileCollide(:31815-31817)
    e.x += e.vx;
    e.y += e.vy;
  }
}

// ============================================================================
// AI_051 世纪之花 262(NPC.cs:31873-32237)
// 本体无重力,由钩蔓(263, aiStyle 52)均值牵引:目标点 = 钩蔓中心 + 朝玩家偏移(≤500px);
// 一阶段(血>50%):防 36 / 接触伤 50,种子弹幕 275(22)/276 毒种(27)/277 刺球(31);
// 二阶段(血≤50%):防 10 / 接触伤 70,提速(2.5→5→7 / 0.025→0.05),触须 264×8 + 孢子 265。
// plantBoss 静态引用由"场上 262 查找"等价替代(单 Boss 语义)。
// ============================================================================
export function planteraAI(e: Enemy, game: GameHooks, player: Player | null) {
  const l = la(e);
  // 玩家死(:31875-31883) → flag51 = 反向离场。框架在玩家死亡时传 null,
  // 而原版 flag51 分支仍读取尸体坐标 → 从 game 取回原对象(Enemy.eocAI 同款)
  const p = player ?? (game as unknown as { player: Player }).player ?? null;
  const flag51 = !p || p.dead;
  if (!p) {   // 原版不可能无 player(Main.player[target] 恒有对象);防御性减速漂移
    e.vx *= 0.95;
    e.vy *= 0.95;
    e.x += e.vx;
    e.y += e.vy;
    return;
  }
  // 暴怒 flag50(:31923-31928):玩家非丛林/高于地表/低于地狱层 → 省略(见汇报简化项)
  const flag50 = false;
  // 初始化(:31886-31892):localAI[0]=1 + 钩蔓 263×3
  if (!e.bInit) {
    e.bInit = true;
    l[0] = 1;
    for (let k = 0; k < 3; k++) spawnPart(game, e, 263);
  }
  // 钩蔓中心(:31893-31913):场上前 3 只 aiStyle 52 的位置均值
  let sumX = 0, sumY = 0, cnt = 0;
  for (const n of game.enemies() as Enemy[]) {
    if (n !== e && !n.dead && n.vanilla?.aiStyle === 52) {
      sumX += n.cx;
      sumY += n.cy;
      cnt++;
      if (cnt > 2) break;   // 原版 num791 > 2 break(只取 3 只)
    }
  }
  // 原版 num791=0 时除 0 得 NaN(本体漂移);此处退化为本体位保持可玩
  let num789 = cnt > 0 ? sumX / cnt : e.cx;
  let num790 = cnt > 0 ? sumY / cnt : e.cy;
  // 速度/加速度档(:31914-31928):2.5/0.025 → 半血 5/0.05 → 1/4 血 7
  let num793 = 2.5;
  let num794 = 0.025;
  if (e.hp < e.maxHp / 2) { num793 = 5; num794 = 0.05; }
  if (e.hp < e.maxHp / 4) num793 = 7;
  // flag50:num793 += 8 / num794 = 0.15;expert:+1 ×1.1 / +0.01 ×1.1 省略(:31930-31941)
  // 目标点 = 钩蔓中心 + 朝玩家偏移,钳 500px(:31942-31968)
  let num795 = p.cx - num789;
  let num796 = p.cy - num790;
  if (flag51) {
    num795 = -num795;
    num796 = -num796;
    num793 += 8;
  }
  let num797 = Math.hypot(num795, num796);
  const num798 = 500 + (flag50 ? 350 : 0);   // expert +150 省略
  if (num797 >= num798) {
    const s = num798 / num797;
    num795 *= s;
    num796 *= s;
  }
  num789 += num795;
  num790 += num796;
  // 逼近目标点(:31969-32015):距离 < num793 保持现速,否则归一到 num793;0.025 步进(符号翻转双步)
  num795 = num789 - e.cx;
  num796 = num790 - e.cy;
  num797 = Math.hypot(num795, num796);
  if (num797 < num793) {
    num795 = e.vx;
    num796 = e.vy;
  } else {
    const s = num793 / num797;
    num795 *= s;
    num796 *= s;
  }
  e.vx = accelTo(e.vx, num795, num794);
  e.vy = accelTo(e.vy, num796, num794);
  // 朝向玩家旋转(:32016-32019)
  e.spin = Math.atan2(p.cy - e.cy, p.cx - e.cx) + Math.PI / 2;
  e.x += e.vx;
  e.y += e.vy;

  if (e.hp > e.maxHp / 2) {
    // ---- 一阶段(:32020-32133) ----
    e.def.defense = 36;                       // :32021
    e.def.damage = 50;                        // GetAttackDamage_ScaledByDifficulty(50) 经典 = 50
    l[1] += 1;                                // :32034
    for (const th of [0.9, 0.8, 0.7, 0.6]) if (e.hp < e.maxHp * th) l[1] += 1;
    // flag50:+3 / expert:+1 / expert justHit 概率蓄力 / getGoodWorld:+1 均省略(:32051-32066)
    if (l[1] > 80) {
      l[1] = 0;
      // 视线检查(:32069-32078):Collision.CanHit(position,w,h,player,...) 近似
      const flag52 = losClear(game, e.x, e.y, p.x, p.y);
      if (flag52) {
        // 种子 275 / 毒种 276 / 刺球 277(:32080-32133)
        const num802 = 15;                    // expert 17 省略
        let num803 = p.cx - e.cx;
        let num804 = p.cy - e.cy;
        const t = num802 / (Math.hypot(num803, num804) || 1);
        num803 *= t;
        num804 *= t;
        let num806 = 22;
        let num807 = 275;
        let life = 300;
        if (e.hp < e.maxHp * 0.8 && rnd(4) === 0) {
          num806 = 27;                        // 毒种 276
          num807 = 276;
          l[1] = -30;                         // 下发弹延迟 30t
        } else if (e.hp < e.maxHp * 0.8 && rnd(8) === 0) {
          num806 = 31;                        // 刺球 277
          num807 = 277;
          l[1] = -120;                        // 下发弹延迟 120t
          life = 1200;                        // 原版不设 timeLeft(保持默认),此处取本框架默认
        }
        shoot(game, e.cx + num803 * 3, e.cy + num804 * 3, num803, num804, num806, num807, life);
      }
    }
  } else {
    // ---- 二阶段(血≤50%,:32134-32237) ----
    e.def.defense = 10;                       // :32134
    e.def.damage = 70;                        // GetAttackDamage_ScaledByDifficulty(70) 经典 = 70
    // 首次进二阶段:触须 264×8(:32144-32170;expert 追加分配/getGoodWorld +6 省略)
    if (l[0] === 1) {
      l[0] = 2;
      for (let k = 0; k < 8; k++) spawnPart(game, e, 264);
    }
    // 二阶段入场花瓣 Gore 378/379/380(:32194-32200)→ 粒子近似
    if (l[2] === 0) {
      l[2] = 1;
      game.spawnParticles(e.cx, e.cy, '#5FA054', 8, 2);
    }
    // expert 每 60t 补触须(:32172-32190)省略
    l[1] += 1;                                // :32202
    for (const th of [0.4, 0.3, 0.2, 0.1]) if (e.hp < e.maxHp * th) l[1] += 1;
    if (l[1] >= 350) {
      // 孢子 265(:32216-32236):8 速,落点偏移(下方目标去掉 0.2|dx| 弧垂)
      const num820 = p.cx - e.cx + rndRange(-10, 11);
      let num821 = Math.abs(num820 * 0.2);
      let num822 = p.cy - e.cy + rndRange(-10, 11);
      if (num822 > 0) num821 = 0;
      num822 -= num821;
      const t = 8 / (Math.hypot(num820, num822) || 1);
      const spore = spawnPart(game, e, 265);
      if (spore) {
        spore.vx = num820 * t;
        spore.vy = num822 * t;
      }
      l[1] = 0;
    }
  }
}

// ============================================================================
// AI_052 世纪之花钩蔓 263(NPC.cs:32238-32405):抓墙锚定 + 牵引本体。
// ai[0]/ai[1] = 锚点 tile 坐标;localAI[0] = 换锚倒计时(每次抓墙后 300-600t,血低加速);
// 到点后钉在锚点(速度=残差),本体以钩蔓均值+玩家偏移为目标被拉动。
// plantBoss 静态引用由"场上 262 查找"等价替代;本体消失 → 自毁(StrikeNPCNoInteraction 9999)。
// ============================================================================
export function planteraTentacleAI(e: Enemy, game: GameHooks, player: Player | null) {
  const l = la(e);
  const st = game.world.store;
  if (!e.bInit) { e.bInit = true; e.ai0 = 0; e.ai1 = 0; }
  // 本体引用(原版静态 plantBoss;:32241-32246 本体消失 → 9999 自伤)
  const boss = (game.enemies() as Enemy[]).find((n) => !n.dead && n.vanillaId === 262) ?? null;
  if (!boss) {
    e.hp -= 9999;
    if (e.hp <= 0) e.dead = true;
    return;
  }
  const target: { cx: number; cy: number; x: number; y: number; dead: boolean } = player ?? boss;
  const flag54 = !player || player.dead;    // 玩家死(:32248-32250)
  // 暴怒 flag53(玩家离丛林/地表/地狱层,localAI[0]-4/换锚-6/速度 ×2)省略(见汇报简化项)
  const flag53 = false;
  // 换锚倒计时(:32268-32291)
  if (e.ai0 === 0 || e.ai1 === 0) l[0] = 0;
  l[0] -= 1;
  if (boss.hp < boss.maxHp / 2) l[0] -= 2;   // :32275-32277
  if (boss.hp < boss.maxHp / 4) l[0] -= 2;
  if (flag53) l[0] -= 4;                     // 原版入口 -4(:32252-32256)+ 换锚前 -6(:32283-32285)合并近似
  // 错峰:其他同类钩蔓仍在飞行 → 随机 60-300t 后再换(:32286-32298)
  if (!flag54 && l[0] <= 0 && e.ai0 !== 0) {
    for (const n of game.enemies() as Enemy[]) {
      if (n !== e && !n.dead && n.vanillaId === 263 && (n.vx !== 0 || n.vy !== 0)) {
        l[0] = rndRange(60, 300);
        break;
      }
    }
  }
  if (l[0] <= 0) {
    // 搜新锚点(:32299-32351):玩家附近(无锚时取玩家-本体中点)随机扩散找实心/墙 tile
    l[0] = rndRange(300, 600);
    let found = false;
    let num826 = 0;
    while (!found && num826 <= 1000) {
      num826++;
      let num827 = Math.floor(target.cx / TILE);
      let num828 = Math.floor(target.cy / TILE);
      if (e.ai0 === 0) {
        // 首锚:取玩家与本体中点(:32309-32312)
        num827 = Math.floor((target.cx + boss.cx) / 32);
        num828 = Math.floor((target.cy + boss.cy) / 32);
      }
      if (flag54) {
        num827 = Math.floor(boss.x / TILE);
        num828 = Math.floor((boss.y + 400) / TILE);
      }
      const num829 = 20 + Math.floor(100 * (num826 / 1000));   // 扩散半径 20→120
      let num830 = num827 + rndRange(-num829, num829 + 1);
      let num831 = num828 + rndRange(-num829, num829 + 1);
      // 半血后 1/6 概率直接试玩家所在格(有墙才用,:32322-32332)
      if (boss.hp < boss.maxHp / 2 && rnd(6) === 0) {
        const ptx = Math.floor(target.cx / TILE), pty = Math.floor(target.cy / TILE);
        if (st.inBounds(ptx, pty) && st.wall[st.idx(ptx, pty)] > 0) {
          num830 = ptx;
          num831 = pty;
        }
      }
      // 实心 tile / (墙 tile 且搜索过半或本体半血)(:32333-32350)
      if (st.inBounds(num830, num831)
        && (st.isSolid(num830, num831)
          || (st.wall[st.idx(num830, num831)] > 0 && (num826 > 500 || boss.hp < boss.maxHp / 2)))) {
        found = true;
        e.ai0 = num830;
        e.ai1 = num831;
      }
    }
  }
  if (!(e.ai0 > 0) || !(e.ai1 > 0)) return;   // :32352-32355 无锚不动
  // 收线速度(:32356-32375):6 → 本体半血 8 → 1/4 血 10(expert +1/+1、暴怒/玩家死 ×2)
  let num834 = 6;
  if (boss.hp < boss.maxHp / 2) num834 = 8;
  if (boss.hp < boss.maxHp / 4) num834 = 10;
  if (flag54) num834 *= 2;
  // 朝锚点(锚点 tile 中心 - 8px)收线(:32383-32395):近于 12+速 → 速度=残差(钉住)
  const num835 = e.ai0 * TILE - 8 - e.cx;
  const num836 = e.ai1 * TILE - 8 - e.cy;
  const num837 = Math.hypot(num835, num836);
  if (num837 < 12 + num834) {
    e.vx = num835;
    e.vy = num836;
  } else {
    const s = num834 / num837;
    e.vx = num835 * s;
    e.vy = num836 * s;
  }
  // 朝本体旋转(:32396-32405)
  e.spin = Math.atan2(boss.cy - e.cy, boss.cx - e.cx) - Math.PI / 2;
  e.x += e.vx;
  e.y += e.vy;
}
