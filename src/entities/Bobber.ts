// 钓鱼浮标实体（R7）：抛竿抛物线 → 落水漂浮 → 咬钩窗口 → 收竿掷渔获。
// 原版 Projectile AI_61（浮标）+ FishingCheck 主干的分层近似：
//   抛出 grav 0.3 抛物线；入液（水/蜜/岩浆）转漂浮；等待 = 基础 90-300t 随 power 缩短；
//   咬钩窗口 60t（原版 8 帧×缩放近似）；窗口内收竿 → rollCatch 掷渔获 + 消耗鱼饵
//   （消耗率 1/(1+bait/6)，钓具箱 +1 分母，:51640-51646）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Player } from './Player';
import { GRAVITY, TILE } from '../core/constants';
import { moveAndCollide } from '../physics/TileCollision';
import { pickPool, rollCatch, fishingPowerMultiplier } from '../data/vanillaFishing';
import { VANILLA_ITEM_KEY_BY_ID } from '../data/items';
import { TILE_DEFS } from '../data/tiles';
import type { World } from '../world/World';
import { BuffType } from '../stats/Buffs';

type LiquidType = 'water' | 'lava' | 'honey';

export class Bobber extends Entity {
  w = 8; h = 8;
  dead = false;
  /** 漂浮中（已落液） */
  floating = false;
  /** 咬钩窗口剩余 tick（>0 = 咬钩中，可收竿） */
  biteT = 0;
  /** 咬钩时的渔获（声呐药水预掷展示） */
  catchId = 0;
  /** 血月咬钩敌怪（FishingCheck_RollEnemySpawns）——收竿由 Game 侧生成 */
  catchEnemy = 0;
  /** 渔获原版 id → 钓起时落物用 */
  private waitT: number;
  private polePower: number;
  poleVid = 0;
  private baitSlot: number;
  private baitPower: number;
  private ownerRef: () => Player | null;
  private bobPhase = Math.random() * Math.PI * 2;
  private airT = 0;

  constructor(
    x: number, y: number, vx: number, vy: number,
    polePower: number, baitSlot: number, baitPower: number,
    owner: () => Player | null,
  ) {
    super();
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.polePower = polePower;
    this.baitSlot = baitSlot;
    this.baitPower = baitPower;
    this.ownerRef = owner;
    // 咬钩等待：power 高 → 等待短（90-300t 线性缩放近似 FishingCheck 期望 150-450t）
    const power = polePower + baitPower;
    this.waitT = Math.round(300 - Math.min(210, power * 3.2)) + Math.floor(Math.random() * 60);
  }

  /** 钓鱼力（竿+饵+药水 121 +15；声呐 122/宝匣 123 由收竿侧消费）。
   *  game 传入时追加 Fishing_GetPowerMultiplier 乘区（Player.cs:41560-41605：
   *  雨/云/晨昏/正午/前半夜/月相/血月） */
  private fishingPower(p: Player, game?: GameHooks): number {
    // buff 121 钓鱼药水 +15（Player.cs:9831 fishingSkill += 15）
    let lvl = this.polePower + this.baitPower + (p.buffs.has(BuffType.Fishing) ? 15 : 0);
    // 幸运度修正（Projectile.cs:19267-19276 FishingAttempt 主干，1:1）：
    //   luck<0 且 rand<|luck| → ×(0.9 - rand*0.3)（0.6-0.9 倍）
    //   luck>0 且 rand<luck  → ×(1.1 + rand*0.3)（1.1-1.4 倍）
    const luck = p.luck;
    if (luck < 0) {
      if (Math.random() < -luck) lvl = Math.floor(lvl * (0.9 - Math.random() * 0.3));
    } else if (Math.random() < luck) {
      lvl = Math.floor(lvl * (1.1 + Math.random() * 0.3));
    }
    // Fishing_GetPowerMultiplier（:41560-41605）：天气/时段/月相/血月乘区
    if (game) {
      const w = game.world as World;
      const t = w.clock.timeOfDay;
      const isDay = w.clock.isDay; // 昼夜边界以 Clock 为准（4:30/19:30）
      lvl = Math.floor(lvl * fishingPowerMultiplier({
        raining: !!w.weather?.raining,
        cloudBGAlpha: w.weather?.cloudAlpha ?? 0,
        dayTime: isDay,
        time: isDay ? ((t - 0.25) / 0.5) * 54000 : ((((t - 0.75) + 1) % 1) / 0.5) * 32400,
        moonPhase: w.clock.moonPhase,
        bloodMoon: !!w.clock.bloodMoon,
      }));
    }
    return lvl;
  }

  fixedUpdate(dt: number, game: GameHooks) {
    void dt;
    const p = this.ownerRef();
    if (!p || p.dead) { this.dead = true; return; }
    const st = (game.world as World).store;
    const idx = st.idx(Math.floor(this.cx / TILE), Math.floor((this.y + this.h) / TILE));
    const liq = st.liquid[idx];
    const liqType: LiquidType | null = liq > 60 ? ((st.liquidType[idx] === 2 ? 'lava' : st.liquidType[idx] === 3 ? 'honey' : 'water')) : null;

    if (!this.floating) {
      this.vy = Math.min(this.vy + GRAVITY * 0.7, 8);
      this.vx *= 0.99;
      moveAndCollide(this, game.world, this.vx, this.vy);
      if (liqType === 'water' || liqType === 'honey') {
        this.floating = true;
        this.vx = 0; this.vy = 0;
        game.playSfx('splash', 0.6);
      } else if (liqType === 'lava') {
        // 岩浆：无熔线钓钩配饰则浮标烧毁（accLavaFishing 门）
        const canLava = this.ownerLavaOk();
        if (!canLava) { this.dead = true; return; }
        this.floating = true;
        this.vx = 0; this.vy = 0;
      } else if (++this.airT > 600) {
        this.dead = true; // 落地未入水超时
      }
      return;
    }
    // 漂浮：水面起伏
    this.bobPhase += 0.15;
    if (this.biteT > 0) {
      this.biteT--;
      if (this.biteT === 0) {
        this.catchId = 0; // 错过窗口 → 重置等待（原版浮标错过后再等下一轮）
        this.waitT = 90 + Math.floor(Math.random() * 120);
      }
    } else if (--this.waitT <= 0) {
      // 咬钩：掷渔获（声呐预展示）；窗口 60t
      const power = this.fishingPower(p, game);
      // 血月钓鱼敌怪（FishingCheck_RollEnemySpawns :19399-19427）：水中、血月夜、
      // 1/6（血肉抛竿 4325 → 1/3）→ 咬的是敌怪：困难 {620,621,586,587}+1/10 恐惧鹦鹉螺
      // 618；非困难 {586,587}。682 分支需 bestiary 解锁旗标（未跟踪，从略）。
      this.catchEnemy = 0;
      const w = game.world as World;
      const inWater = st.liquidType[idx] !== 2 && st.liquidType[idx] !== 3;
      if (inWater && w.clock.bloodMoon && !w.clock.isDay) {
        const chance = this.poleVid === 4325 ? 3 : 6;
        if (Math.random() < 1 / chance) {
          const hard = w.flags.hardMode;
          const poolE = hard ? [620, 621, 586, 587] : [586, 587];
          this.catchEnemy = hard && Math.random() < 0.1 ? 618
            : poolE[Math.floor(Math.random() * poolE.length)];
          this.biteT = 60;
          game.playSfx('splash', 0.8);
          game.spawnParticles(this.cx, this.cy, '#C04040', 6, 1.5, { life: 24 });
          return;
        }
      }
      const pool = pickPool({
        liquid: (st.liquidType[idx] === 2 ? 'lava' : st.liquidType[idx] === 3 ? 'honey' : 'water'),
        zone: this.zoneOf(game),
        depth: this.depthOf(game),
        zoneOcean: this.zoneOcean(game),
      });
      this.catchId = rollCatch(power, pool, p.buffs.has(BuffType.Crate));
      void power;
      this.biteT = 60;
      game.playSfx('splash', 0.8);
      game.spawnParticles(this.cx, this.cy, '#80B8FF', 6, 1.5, { life: 24 });
    }
  }

  /** 收竿（窗口内）：返回渔获原版 id（0=没咬/没饵/血月敌怪——后者查 catchEnemy）；消耗鱼饵 */
  reel(game: GameHooks): number {
    if (this.biteT <= 0 || (!this.catchId && !this.catchEnemy)) return 0;
    const p = this.ownerRef();
    if (!p) return 0;
    // 声呐药水（buff 122）：咬钩时已掷——由 Game 侧显示（本实体的 catchId 预存）
    this.consumeBait(p);
    const caught = this.catchId;
    this.catchId = 0;
    this.dead = true;
    void game;
    return caught;
  }

  /** 鱼饵消耗（:51640：1/(1+bait/6)，钓具箱 +1 分母） */
  private consumeBait(p: Player): boolean {
    const slot = p.inv.slots[this.baitSlot];
    if (!slot) return false;
    const chance = 1 / (1 + this.baitPower / 6 + (this.tackleBox(p) ? 1 : 0));
    if (Math.random() < chance) p.inv.removeAt(this.baitSlot, 1);
    return true;
  }

  private tackleBox(p: Player): boolean {
    // 钓具箱族（accfx 未提取该字段——经装备名快速判定，渔夫耳环 2374/渔具袋 3721/钓具箱 2375）
    return (p as unknown as { equipStats: { fishingTackle?: boolean } }).equipStats?.fishingTackle ?? false;
  }

  private ownerLavaOk(): boolean {
    const p = this.ownerRef();
    if (!p) return false;
    return (p as unknown as { equipStats: { lavaFishing?: boolean } }).equipStats?.lavaFishing ?? false;
  }

  private zoneOf(game: GameHooks): string {
    const w = game.world as World;
    const x = Math.floor(this.cx / TILE);
    const y = Math.floor(this.cy / TILE);
    const st = w.store;
    // 按 tile key 采样（玩家 zone 通道未接此处，浮标位置独立判定）
    for (let dy = -2; dy <= 0; dy++) {
      const t = st.get(x, y + dy);
      const key = t ? TILE_DEFS[t]?.key ?? '' : '';
      if (!key) continue;
      if (/corrupt/.test(key)) return 'corrupt';
      if (/crimson/.test(key)) return 'crimson';
      if (/hallow/.test(key)) return 'hallow';
      if (/jungle/.test(key)) return 'jungle';
      if (/snow/.test(key)) return 'snow';
    }
    return 'forest';
  }

  private depthOf(game: GameHooks): 'sky' | 'surface' | 'cavern' | 'underworld' {
    const w = game.world as World;
    const y = Math.floor(this.cy / TILE);
    if (y < Math.floor(w.groundLevel * 0.35)) return 'sky';
    if (y <= w.groundLevel + 10) return 'surface';
    if (y > (w.lavaLine || w.store.h - 200)) return 'underworld';
    return 'cavern';
  }

  private zoneOcean(game: GameHooks): boolean {
    const w = game.world as World;
    const x = Math.floor(this.cx / TILE);
    return x < 380 || x > w.store.w - 380; // 原版海洋 ≈ 边缘 8%（近似）
  }

  /** 声呐预展示的渔获名（Game 侧在浮标上方画字） */
  sonarLabel(): string | null {
    if (this.biteT > 0 && this.catchId) {
      const key = VANILLA_ITEM_KEY_BY_ID[this.catchId];
      return key ? key : null;
    }
    return null;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.fillStyle = this.biteT > 0 ? '#FF6060' : '#E04838';
    const dip = this.biteT > 0 ? 2 : Math.sin(this.bobPhase) * 1.5;
    ctx.beginPath();
    ctx.arc(0, dip, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-1, dip - 6, 2, 4); // 竿线连杆近似
    ctx.restore();
  }
}
