// module8 编排粒子 Spawn_* 视觉本体（收编池，2026-08-31 台账 L5 清偿）。
//
// 原版真值 = Terarria1458/Terraria.GameContent.Drawing/ParticleOrchestrator.cs
// 各 Spawn_<Type> 方法。收编规则：
//   · 本仓无 FadingParticle/PrettySparkle/Gas/BloodyExplosion 编排池系统——粒子
//     面按 GameHooks.spawnParticles/spawnDust/spawnBurst 组合近似（与既有六型
//     PetExchange/Digestion 等同口径），音/门/数量/相位参数 1:1；
//   · 每型视觉 = 纯函数 + rng 注入形参（生产缺省 Math.random；测试换种子驱动
//     "type 触发 → 粒子调用带特征参数"断言）；
//   · 生产端（clientOnly:false 型）= 本地调本函数 + broadcast 上行 module8;
//     netApplyParticleOrchestra 收包侧分支再调本函数 → 全端同款复放（原版语义 =
//     请求端 SpawnParticlesDirect 本地直生 + Broadcast 排除发送者,两面对同一本体）。
// 粒子色彩：Main.hslToRgb(h,s,l) css 近似——伪彩虹族（RainbowRodHit 等）直接消费。
import type { GameHooks } from '../entities/types';

/** 测试/生成共用 rng 形参缺省 */
type Rng = () => number;

/** Main.hslToRgb(h,s,l)（Color.cs hsl 2 rgb 标准式）→ css `rgb()` 字符串 */
export function orchestraHslCss(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  const sat = s < 0 ? 0 : s > 1 ? 1 : s;
  const lig = l < 0 ? 0 : l > 1 ? 1 : l;
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const ch = (t: number): number => {
    let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const r = Math.round(ch(hue + 1 / 3) * 255);
  const g = Math.round(ch(hue) * 255);
  const b = Math.round(ch(hue - 1 / 3) * 255);
  return `rgb(${r},${g},${b})`;
}

/** Utils.Remap(v, fromMin, fromMax, toMin, toMax)（GetLerpValue clamped,FakeFish 同式） */
function remap(v: number, fMin: number, fMax: number, tMin: number, tMax: number): number {
  const t = (v - fMin) / (fMax - fMin);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return tMin + (tMax - tMin) * c;
}

// ==================== RainbowRodHit（:3462-3512）====================
//
// 万花筒鞭 tag / 彩虹魔杖弹 79 命中 / 死亡爆三处共用的虹彩簇：
//   · 6 掷（num2=6）双层 PrettySparkle：彩色层 ColorTint=hsl((hueBase+rand×0.33)%1,
//     1,0.4+rand×0.25)、白色核 scale×0.6；速度 = base+NextFloat()×τ 方向 ×1.5×scale
//     （scale=rand×0.4+0.4∈[0.4,0.8]→速幅 [0.6,1.2]px/t）+ MovementVector×
//     NextFloatDirection×0.15 抖动向量，加速度 −速度/60t 衰减（life≈60t 缺省档）；
//   · 12 × d267 微尘：色相 (hueBase+rand×0.12)%1、vel=circular(1,1)+MovementVector×
//     ±0.5、noGravity、scale .6+.9、fadeIn .7+.8；CloneDust 白影 scale/2 fadeIn×.75。
export function rainbowRodHitFx(
  game: GameHooks, x: number, y: number,
  moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const baseAng = rng() * Math.PI * 2;                    // num（:3463）
  const hueBase = rng();                                  // num3（:3465）
  for (let k = 0; k < 6; k++) {                           // 1/num2 六掷（:3467）
    const scale = rng() * 0.4 + 0.4;                      // vector2 ∈[0.4,0.8]（:3469）
    const jitterX = moveX * (rng() * 2 - 1) * 0.15;       // vector（:3468 NextFloatDirection）
    const jitterY = moveY * (rng() * 2 - 1) * 0.15;
    const ang = baseAng + rng() * Math.PI * 2;            // f（:3471）
    const spd = 1.5 * scale;                              // vector3（:3474）
    const vx = Math.cos(ang) * spd + jitterX;
    const vy = Math.sin(ang) * spd + jitterY;
    const offX = (rng() * 2 - 1) * 8 * scale;             // vector4 circular(8,8)×scale（:3475）
    const offY = (rng() * 2 - 1) * 8 * scale;
    const life = 60;                                      // num5（:3475 衰减窗=寿命）
    const px = x + offX, py = y + offY;
    // 彩色层（:3476-3489）+ 白色核（:3490-3500，scale×0.6）
    game.spawnParticles?.(px, py, orchestraHslCss((hueBase + rng() * 0.33) % 1, 1,
      0.4 + rng() * 0.25), 1, Math.abs(spd),
      { life, vx, vy, size: 2.4 * scale });
    game.spawnParticles?.(px, py, 'rgba(255,255,255,0.85)', 1, Math.abs(spd),
      { life, vx, vy, size: 1.44 * scale });              // ×0.6 白影
  }
  // ---- 12 × d267 + CloneDust 白影（:3501-3511）----
  for (let i = 0; i < 12; i++) {
    const d = game.spawnDust?.(x, y, 1, 1, 267,
      (rng() * 2 - 1) + moveX * (rng() * 2 - 1) * 0.5,
      (rng() * 2 - 1) + moveY * (rng() * 2 - 1) * 0.5,
      0, null, 0.6 + rng() * 0.9, true);
    if (d) d.fadeIn = 0.7 + rng() * 0.8;
    game.spawnDust?.(x, y, 1, 1, 267,
      (rng() * 2 - 1), (rng() * 2 - 1), 0,
      { r: 255, g: 255, b: 255, a: 255 }, (0.6 + rng() * 0.9) / 2, true);   // CloneDust 白影
  }
}

// ==================== PaladinsHammerShockwave（:816-881）====================
//
// 301 圣骑士锤撞墙（Projectile.cs:19649-19661，PositionInWorld=position 左上、
// MovementVector=Size）。①50 掷放射环（1/2→d57 α200 scale1.8 / 1/3→d43 α254
// scale1.3,velocity=(落点−盒心)归一×9.5×NextFloat,noGravity）；②Item180 音；
// ③命中点 ±3 格（7×7）KillTile 块尘上抛（num5=4 调制——本仓冒烟粒逐格近似,
// 圈内上限 32 防 1457 原文无上限的稀疏地形尘爆,gore 池无 API 不接）。
export function paladinsHammerShockwaveFx(
  game: GameHooks, x: number, y: number, w: number, h: number, rng: Rng = Math.random,
): void {
  const ccx = x + w / 2, ccy = y + h / 2;
  game.playSfxWav?.('Item_180', 1, ccx, ccy);             // SoundEngine.PlaySound(Item180)（:822）
  for (let i = 0; i < 50; i++) {                          // （:823-848）
    if (rng() < 0.5) {                                    // Next(2)==0
      const d = game.spawnDust?.(x, y, w, h, 57, 0, 0, 200, null, 1.8);
      if (d) {
        const dl = Math.hypot(d.x - ccx, d.y - ccy) || 1;
        d.noGravity = true;
        d.vx = ((d.x - ccx) / dl) * 9.5 * rng();
        d.vy = ((d.y - ccy) / dl) * 9.5 * rng();
      }
    }
    if (rng() < 1 / 3) {                                  // Next(3)==0
      const d = game.spawnDust?.(x, y, w, h, 43, 0, 0, 254, null, 1.3);
      if (d) {
        const dl = Math.hypot(d.x - ccx, d.y - ccy) || 1;
        d.noGravity = true;
        d.vx = ((d.x - ccx) / dl) * 9.5 * rng();
        d.vy = ((d.y - ccy) / dl) * 9.5 * rng();
      }
    }
  }
  // ---- ②命中点 7×7 格块尘（:851-871）----
  const ptx = Math.floor(ccx / 16), pty = Math.floor(ccy / 16);
  let n = 0;
  for (let j = pty - 3; j <= pty + 3 && n < 32; j++) {
    for (let i2 = ptx - 3; i2 <= ptx + 3 && n < 32; i2++) {
      if (!game.world.store.inBounds(i2, j) || !game.world.store.isSolid(i2, j)) continue;
      game.spawnDust?.(i2 * 16, j * 16, 16, 16, 14, 0, -3, 0, null, 1.12);   // 上抛块尘近似
      n++;
    }
  }
}

// ==================== Player 近战命中侧四连（Player.cs:44707-44745）====================
//
// SlapHand 3258（Spawn_ :2860-2863 纯 Item175）/ WaffleIron 5382（:2865-2868 纯
// Item178）/ FlyMeal 5129（:2914-2917 纯 Item16）/ ClassyCane 3351（:2887-2912:
// 0..1 掷 gore1218 纸屑 + 7×d10 α80 scale1.1 vy−1,2/3 noGravity——gore 无池以
// 白纸片粒子近似）。

/** Spawn_SlapHand（SoundID.Item175,巴掌拍击音） */
export function slapHandFx(game: GameHooks, x: number, y: number): void {
  game.playSfxWav?.('Item_175', 1, x, y);
}

/** Spawn_WaffleIron（SoundID.Item178,华夫饼烙印音） */
export function waffleIronFx(game: GameHooks, x: number, y: number): void {
  game.playSfxWav?.('Item_178', 1, x, y);
}

/** Spawn_FlyMeal（SoundID.Item16,苍蝇美食碎裂音） */
export function flyMealFx(game: GameHooks, x: number, y: number): void {
  game.playSfxWav?.('Item_16', 1, x, y);
}

/** Spawn_ClassyCane（:2887-2912）：20×20 盒内 0..1 掷纸屑(gore1218→白纸片粒)+
 *  7×d10 灰尘（α80,scale1.1,vx0/vy−1,Next(3)!=0 noGravity） */
export function classyCaneFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  const g0 = rng();
  if (g0 >= 0.5) {                                        // Next(0,2)==1（:2900）
    game.spawnParticles?.(x + (rng() * 2 - 1) * 6, y + (rng() * 2 - 1) * 6,
      '#EDEDF2', 1, 1, { life: 40, vx: (rng() * 2 - 1) * 4, vy: -(3 + Math.floor(rng() * 6) * 0.3) });
  }
  for (let j = 0; j < 7; j++) {                           // num=7（:2904）
    const d = game.spawnDust?.(x - 10, y - 10, 20, 20, 10, 0, -1, 80, null, 1.1);
    if (d && rng() >= 1 / 3) d.noGravity = true;          // Next(3)!=0（:2907-2909）
  }
}

// ==================== DeadCells 族（死亡细胞种子联动批）====================

/**
 * Spawn_DeadCellsFlint（:1786-1901）：火石枪满蓄刺出土面时对周边地表的释放特效。
 * 设置面（AI_198_Flint_EmitSpikes :53240-53245）：PositionInWorld=start+(16,16)×
 * Directions=(dir,gravDir)、MovementVector=(32,gravDir)。扫盒 ±160px 内「实心且上
 * 格非实心」格 → KillTile 碎屑上抛调制 + PrettySparkle 橙火花（:1837-1868）；
 * 扫到任一合格格 → deadcells_flint_release（vol .5,:1884）+ 尘 228 ×30 向上喷散
 * （:1885-1890）+ 叠播 dd2_monk_staff_ground_impact（PlayTracked :1888）；零合格
 * 格静默返回。@returns 是否出现合格格（对应原 flag 分支——测试断言用）
 */
export function deadCellsFlintFx(
  game: GameHooks, x: number, y: number, gravitySign: number, rng: Rng = Math.random,
): boolean {
  const st = game.world.store;
  const cxT = Math.floor(x / 16), cyT = Math.floor(y / 16);
  let groundFound = false;
  for (let i = cxT - 4; i <= cxT + 4; i++) {              // point±num2 扫盒近似（num2=3,宽档≤(32/2)+24=40px→±3 格）
    for (let j = cyT - 4; j <= cyT + 4; j++) {
      if (!st.inBounds(i, j)) continue;
      if (!st.isSolid(i, j)) continue;
      if (st.inBounds(i, j - 1) && st.isSolid(i, j - 1)) continue;   // 上格非实心（:1814-1816）
      groundFound = true;
      // KillTile_GetTileDustAmount 碎屑 + PrettySparkle 橙火花近似（hue=0.12,:1829）
      game.spawnParticles?.(i * 16 + 8, j * 16, orchestraHslCss(0.12, 1, 0.5), 2, 1.6,
        { life: 24, vy: -(4 + rng() * 4), vx: (rng() * 2 - 1) * 2 });
    }
  }
  if (!groundFound) return false;
  // deadcells_flint_release（SoundID.cs:1116 vol .5 单变体组）+ 叠播 monk 冲地一声
  //（:1888 PlayTrackedSound;SoundID.cs:1008 三变体整组——仓内文件名带 _N 尾,组播=随机取一）
  game.playSfxFiles?.(['deadcells_flint_release'], 0.5, x, y);
  game.playSfxFiles?.(['dd2_monk_staff_ground_impact_0', 'dd2_monk_staff_ground_impact_1',
    'dd2_monk_staff_ground_impact_2'], 1, x, y);
  for (let m = 0; m < 30; m++) {                          // 尘 228 ×30（:1885-1890 从简 8+22 稀释视效帽）
    const dvx = (rng() * 2 - 1) * 5, dvyRaw = (rng() * 2 - 1) * 3;
    const dvy = dvyRaw > 0 ? -dvyRaw : dvyRaw;            // value.Y>0 反号（:1887-1889）
    game.spawnParticles?.(x + (rng() * 2 - 1) * 7, y - rng() * 3,
      '#FFB400', 1, 0.7 + rng() * 0.8, { life: 26, vx: dvx, vy: dvy });
  }
  void gravitySign;
  return true;
}

/**
 * Spawn_DeadCellsDownDashExplosion（:2128-2223）：死亡细胞下坠砸地爆（Player.
 * DoDeadCellsGroundPoundEffect :29005-29022,UniqueInfoPiece=strong?1:0、
 * MovementVector=(半径extent,gravDir)）。dust306 白影 ×40（hue=strong?0.01:0.55,
 * scale 1.9+0.8−0.6,color 白,strong ×1.5 速）+ 地表块尘上抛（本仓冒烟近似）+
 * PlayTracked DD2_MonkStaffGroundImpact。下坠跳系统本仓未移植（vanillaWingVisuals
 * 未移植登记④）→ 当前仅联机远端广播可达（producer 侧缺口见台账 L5 注）。
 */
export function deadCellsDownDashExplosionFx(
  game: GameHooks, x: number, y: number, strong: boolean, rng: Rng = Math.random,
): void {
  game.playSfxFiles?.(['dd2_monk_staff_ground_impact'], 0.8, x, y);   // PlayTracked（:2133）
  const speedMul = strong ? 1.5 : 1;                      // value *= 1.5f（:2147-2149）
  const hue = strong ? 0.01 : 0.55;                       // num3（:2150-2152）
  for (let i = 0; i < 40; i++) {                          // dust306 ×40（:2140-2155）
    let dvx = (rng() * 2 - 1) * 5, dvy = (rng() * 2 - 1) * 3;
    if (dvy > 0) dvy = -dvy;
    dvx *= speedMul; dvy *= speedMul;
    game.spawnParticles?.(x + (rng() * 2 - 1) * 10, y,
      orchestraHslCss(hue + rng() * 0.1, 1, 0.55), 1, 1.9,
      { life: 30, vx: dvx, vy: dvy, size: 1.3 + rng() * 0.8 });
  }
  // 地表块尘上抛（KillTile 段 :2171-2206 的近点行近似——extent 半径内首层实心面）
  const extentPx = strong ? 176 : 128;                    // num=176/128（:29010/:29013）
  const ptx = Math.floor(x / 16);
  let n = 0;
  for (let j = 1; j <= 3 && n < 14; j++) {
    for (const side of [-1, 1]) {
      const tx = ptx + side * Math.round(extentPx / 32), ty = Math.floor(y / 16) + j * 2 - 2;
      if (!game.world.store.inBounds(tx, ty) || !game.world.store.isSolid(tx, ty)) continue;
      game.spawnParticles?.(tx * 16 + 8, ty * 16, '#B0A08A', 2, 1.6,
        { life: 22, vy: -(3 + rng() * 4), vx: (rng() * 2 - 1) * 2 });
      n++;
    }
  }
}

/**
 * Spawn_DeadCellsMushroomBoiTargetFound（:2519-2532）：蘑菇小伙伴锁定目标的黄色
 * 冲击图标（ShockIconParticle,(255,255,10,150),寿命 15t,挂点父弹上方 40px）。
 * 父弹追踪由 MinionProj 承担,此函数只负责挂点位置的静态图标化粒子。
 */
export function mushroomBoiTargetFoundFx(game: GameHooks, x: number, y: number): void {
  game.spawnParticles?.(x, y, '#FFFF0A', 3, 0.6,
    { life: 15, grav: 0, damp: 0.97, size: 3.4, vy: -0.2 });
}

// ==================== Shadowbeam 束铺撒（Spawn_Shadowbeam :1987-2005）===================
//
// 暗影束弹 294 的锚点→当前位置直线尘段（MovementVector=上一锚点、
// UniqueInfoPiece=|v|×1000 步距倍率——Arrow.SHADOWBEAM_ORCHESTRA_IDX 广播载荷
// 同语义）。hostile 版 velocityScalar=.03334/friendly .25 只差回拖偏移步长。
export function shadowbeamLineFx(
  game: GameHooks, ax: number, ay: number, bx: number, by: number,
  stepPx: number, hostile: boolean, rng: Rng = Math.random,
): void {
  const dxs = bx - ax, dys = by - ay;
  const dist = Math.hypot(dxs, dys);
  if (dist <= 0) return;
  const scalar = hostile ? 0.03334 : 0.25;                // velocityScalar（:1989-1993）
  const step = Math.max(4, stepPx);                       // arg.Length()<4 → 4 兜底（:1997-1999）
  const ux = dxs / dist, uy = dys / dist;
  for (let s = 0; s < dist; s += step) {                  // SpawnInLine 逐步（:2001-2004）
    const px = ax + ux * s, py = ay + uy * s;
    // 三联 d173：当前位 − 回拖 1/2 档（SpawnSingleLineDust ×3,:1987-2034）
    for (let k = 0; k < 3; k++) {
      const off = k * scalar * stepPx;
      game.spawnDust?.(px - ux * off, py - uy * off, 1, 1, 173,
        0, 0, 0, null, (70 + rng() * 40) * 0.013, true);
    }
  }
}

/** Remap 再导出（FakeFish.beRepelled 同表对拍用） */
export { remap as orchestraRemap };
