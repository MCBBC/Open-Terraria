// 孤儿武器 B1 波（buff/光环簇）投掷物 Kill 追加效果【共享挂点】（2026-08-30）。
//
// 形态选型（见 tests/orphan-b1.test.ts 与 B1 工单）：五件消耗品投掷武器的 Kill() 段
// 里，「爱情/恶臭/微光」三件是同构的"音效+尘+gore+80px 光环 buff"追加效果，且不
// 需要构造新实体——收拢成一张"弹型 → Kill 效果"表（本文件），由 Arrow.killNow 尾部
// 的统一挂点各调一次（撞块/寿命尽/穿透耗尽全部消亡路径同走 killNow 单口 = 原版
// Kill() 一处结算语义）。蜜蜂雷 183 与靓丽镜 1085 不入本表：
//   · 183 需发射蜂弹实体（Player.beeType()/beeDamage() 链）→ 沿 Arrow 内既有
//     spawnBeeSwarm/R28 家族模式（beenadeBurst 专支，复用 aiStyle36 蜂族基建）；
//   · 1085 已由 Game.onProjectileDeath 承载同段 Kill 链（Projectile.cs:72034-72057，
//     音/尘/gore/badLuck 全在）→ 不重复挂点防双结算。
//
// 行号锚 Terarria1458（P.cs = Projectile.cs）：
//   弹 370 爱情药水             P.cs:78889-78902 —— Item4 音 + 心尘 d13×5 +
//                               心脏 gore 331×30。圈支 buff=119 Lovestruck。
//   弹 371 恶臭药水 Stink Potion P.cs:78903-78918 —— legacy PlaySound(13)=玻璃碎裂
//                               （LegacySoundPlayer.cs:786 case 13 → SoundShatter）+
//                               Item16 音 + 尘13×5 + 骨尘 gore 435-437×30。
//                               圈支 buff=120 Stinky。
//   弹 936 微光气球 Sparkle Slime Balloon P.cs:78919-78936 —— Item21 音 + 循环 20
//                               拍两枚 d4（hslToRgb(hue .7+.2rand,1,.7/.5)、alpha150
//                               后 Color.A/=2、次枚 scale1.8/noGravity、v×1.5/×3
//                               ——乘链作用在 NewDust 的随机抖动基速上,spawnDust 同
//                               语义故照抄）。圈支 buff=320 GelBalloonBuff。
//   圈支三件同构共段            P.cs:78937-78962（1456 等价 :75203-75243）：
//                               半径 = 两实体 Center 距 <80px；
//                               玩家集合 Main.player[0..254] active&&!dead →
//                               ApplyBuffTo(buff,1800t)（ApplyBuffTo :12406 = 普通
//                               AddBuff max 合并）；
//                               NPC 集合 Main.npc[0..199] active&&life>0 →
//                               AddBuff(1800t)。
//   ★工单表述"4986 NPC 不吃"与反编译相左——两基准均为三件共享 NPC 循环，按仓库铁律
//   以反编译源码为准；且三者对 NPC 均无机制消费（119/320 展示级、120 仅敌怪索敌转向
//   GAP 已备案），经 applyBuffTicks（SUPPORTED 注册/npcImmuneTo 门/max 合并）落纯
//   计时字段。owner==Main.myPlayer 门 → !hostile 近似（469/661 同先例），由
//   applyThrownKillFx 入口统一拦截。
import { GorePiece } from './GorePiece';
import { applyBuffTicks } from './projStatus';
import { BuffType } from '../stats/Buffs';
import type { GameHooks } from './types';

/** 弹型结构视图（Arrow 满足该形状；本文件只读字段、不 import 实体模块防环） */
export interface ThrownKillFxView {
  projId: number;
  x: number; y: number; w: number; h: number;
  /** 实体中心 px（Entity.cx/cy） */
  cx: number; cy: number;
  /** 敌方弹门（≈ owner != Main.myPlayer）：音/尘/gore 原版全员播，光环圈支/蜂群
   *  有 owner 门——hostile=true 时只出视听不施 buff */
  hostile?: boolean;
}

/** Main.rand.Next(a,b) 右开区间 [a,b)；Next(n) 右开 [0,n)（XNA Next(n)==0 ⟺ 1/n） */
const irand = (n: number): number => Math.floor(Math.random() * n);
const irand2 = (a: number, b: number): number => a + Math.floor(Math.random() * (b - a));

/** Main.hslToRgb(h,s,l)（0-1 域标准式）；返回不透明色——原版 `Color.A /= 2` 由调用侧外置 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number; a: number } {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const chan = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const b255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
  return { r: b255(chan(h + 1 / 3)), g: b255(chan(h)), b: b255(chan(h - 1 / 3)), a: 255 };
}

/** 归一随机向量的 370/371 共用生成（Next(-10,11) 对，零和置 uy=1 免 NaN——Normalize */
function randDir(): { dx: number; dy: number } {
  let ux = irand2(-10, 11), uy = irand2(-10, 11);
  if (ux === 0 && uy === 0) uy = 1;
  const ul = Math.hypot(ux, uy) || 1;
  return { dx: ux / ul, dy: uy / ul };
}

// ---------------------------------------------------------------------------
// 光环圈支（P.cs:78937-78962）：80px 判定 + 玩家/双桶 NPC 各 ApplyBuff/AddBuff 1800t
// ---------------------------------------------------------------------------
const AURA_RADIUS = 80;
const AURA_TICKS = 1800;                                   // tick（30s）
const VANILLA_BUFF_TO_TYPE: Partial<Record<number, BuffType>> = {
  119: BuffType.Lovestruck,
  120: BuffType.Stinky,
  320: BuffType.GelBalloonBuff,
};

function applyAura(buffVanillaId: 119 | 120 | 320, view: ThrownKillFxView, game: GameHooks): void {
  // ---- 玩家集合（candidatePlayers = 本地 + 联机代理，:78939-78945 语义）----
  const players = game.candidatePlayers?.() ?? (game.player ? [game.player] : []);
  const bt = VANILLA_BUFF_TO_TYPE[buffVanillaId];
  for (const pl of players) {
    if (!pl || pl.dead) continue;                          // active && !dead 门（:78944）
    if (Math.hypot(pl.cx - view.cx, pl.cy - view.cy) >= AURA_RADIUS) continue;
    pl.buffs.apply(bt!, AURA_TICKS / 60);                  // ApplyBuffTo(max 合并,:12406)
  }
  // ---- NPC 集合（:78947-78956，active && life>0 门）：Main.npc 单数组的仓内拆分 =
  //      enemies（敌怪）+ critters（小动物同为 NPC）+ npcs?()（城镇 NPC）----
  const buckets: ReadonlyArray<readonly unknown[] | undefined> = [
    game.enemies(), game.critters(), game.npcs?.(),
  ];
  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const ent of bucket) {
      const e = ent as { dead?: boolean; life?: number; cx?: number; cy?: number };
      if (!e || e.dead || (e.life !== undefined && e.life <= 0)) continue;
      if (e.cx === undefined || e.cy === undefined) continue;
      if (Math.hypot(e.cx - view.cx, e.cy - view.cy) >= AURA_RADIUS) continue;
      applyBuffTicks(e as unknown as Record<string, number>, buffVanillaId, AURA_TICKS);
      // SUPPORTED 门/npcImmune/max 合并在 applyBuffTicks 内
    }
  }
}

/** 弹 370 爱情药水 Kill（P.cs:78889-78902 + 圈支 119） */
export function lovePotionBurst(view: ThrownKillFxView, game: GameHooks): void {
  game.playSfxFiles?.(['Item_4'], 1, view.cx, view.cy);
  for (let i = 0; i < 5; i++) {
    game.spawnDust?.(view.x, view.y, view.w, view.h, 13);              // 心尘 ×5 缺省参
  }
  // 心脏 gore 331 ×30（:78896-78902）：位 = Center+向×10、速度 = 向×Next(4,9)×0.66 +
  // UnitY×1.5、scale = Next(40,141)×0.01、sticky=false
  for (let i = 0; i < 30; i++) {
    const { dx, dy } = randDir();
    const spd = irand2(4, 9) * 0.66;
    const g = GorePiece.newGore(331, view.cx + dx * 10, view.cy + dy * 10,
      dx * spd, dy * spd + 1.5, irand2(40, 141) * 0.01);
    if (g) g.sticky = false;
  }
  if (!view.hostile) applyAura(119, view, game);
}

/** 弹 371 恶臭药水 Kill（P.cs:78903-78918 + 圈支 120） */
export function stinkPotionBurst(view: ThrownKillFxView, game: GameHooks): void {
  game.playSfx?.('shatter', 1, view.cx, view.cy);          // legacy 13 = SoundShatter（:78904）
  game.playSfxFiles?.(['Item_16'], 1, view.cx, view.cy);   //（:78905）
  for (let i = 0; i < 5; i++) {
    game.spawnDust?.(view.x, view.y, view.w, view.h, 13);              // 尘 13 ×5
  }
  // 骨尘 gore 435-437 ×30（:78910-78917）：同 331 族但方向整体 ×0.4（vector82 *= 0.4f
  // 位偏与速度同源减速）、scale = Next(20,100)×0.01、sticky=false
  for (let i = 0; i < 30; i++) {
    const d = randDir();
    const dx = d.dx * 0.4, dy = d.dy * 0.4;
    const spd = irand2(4, 9) * 0.66;
    const g = GorePiece.newGore(irand2(435, 438),
      view.cx + dx * 10, view.cy + dy * 10,
      dx * spd, dy * spd + 1.5, irand2(20, 100) * 0.01);
    if (g) g.sticky = false;
  }
  if (!view.hostile) applyAura(120, view, game);
}

/** 弹 936 微光气球 Kill（P.cs:78919-78936 + 圈支 320）；
 *  巨星解锁段（Shimmer() aiStyle==2 分支 :22676-22697,浸微光液触发域）不在此段，
 *  归 Arrow.shimmerUnlock（subStepAI 浸液步调用,2026-08-30 B1-X3 触发域修正）*/
export function shimmerBalloonBurst(view: ThrownKillFxView, game: GameHooks): void {
  game.playSfxFiles?.(['Item_21'], 1, view.cx, view.cy);
  for (let i = 0; i < 20; i++) {
    const c1 = hslToRgb(0.7 + Math.random() * 0.2, 1, 0.7); c1.a /= 2;  // newColor9.A /= 2
    const d1 = game.spawnDust?.(view.x, view.y, view.w, view.h, 4, 0, 0, 150, c1);
    if (d1) { d1.vx *= 1.5; d1.vy *= 1.5; }                            //（:78924-78926）
    const c2 = hslToRgb(0.7 + Math.random() * 0.2, 1, 0.5); c2.a /= 2;
    const d2 = game.spawnDust?.(view.x, view.y, view.w, view.h, 4, 0, 0, 150, c2, 1.8);
    if (d2) {
      d2.vx *= 3; d2.vy *= 3;                                          //（:78930-78933）
      d2.noGravity = true;
    }
  }
  if (!view.hostile) applyAura(320, view, game);
}

// ---------------------------------------------------------------------------
// 主入口：弹型 → Kill 分派（killNow 统一收口处每消亡调一次）
// ---------------------------------------------------------------------------
const THROWN_KILL_FX: Partial<Record<number, (view: ThrownKillFxView, game: GameHooks) => void>> = {
  370: lovePotionBurst,
  371: stinkPotionBurst,
  936: shimmerBalloonBurst,
};

/** Kill 追加效果主入口（Arrow.killNow 尾部调；owner==myPlayer 门 → !hostile 拦截，
 *  尘/gore 原版虽无门但测试桩外的敌侧来源只有反射件——展示层差登记可忽略） */
export function applyThrownKillFx(view: ThrownKillFxView, game: GameHooks): void {
  THROWN_KILL_FX[view.projId]?.(view, game);
}
