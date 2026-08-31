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

// ==================== ChlorophyteLeafCrystalShot（:3130-3157）====================
//
// 叶绿水晶叶套装（台账 L3 清偿批 2026-08-31）叶弹 227 的轨迹 streak——原版 aiStyle43
// 每子步请求（Projectile.cs:28279-28303 clientOnly:false），本仓 producer =
// entities/ChloroLeafCrystalProj ChloroLeafShot.trailStep（181 子步/拍采样 ≈4 次/拍,
// 密度差登记）;同型 ChlorophyteLeafCrystalPassive(16) 全树无生产位,不接。
// PrettySparkle streak 收编为 spawnParticles 长寿命直线粒 + 白核 additive 近似
// （Lighting.AddLight(0.05,0.2,0.1)×1.5 由粒子亮度承载）。

/** 轨迹色相链 producer 侧（Projectile.cs:28279-84）：hue=wrap((1−timeLeft/180)×−6×0.85
 *  +0.33)——num329=1−timeLeft/180,num330 环绕归一 */
export function leafTrailHue01(timeLeft: number): number {
  const n = ((1 - timeLeft / 180) * -6 * 0.85 + 0.33) % 1;
  return ((n % 1) + 1) % 1;
}

/** Spawn_LeafCrystalShot 终色（:3139-46）：hsl(hue,1,.5) → Color.Lerp(·, Gold,
 *  R/255×0.5)——rgba css 直返；uniqueInfoPiece 载荷=hue byte（rgbToHsl 往返等价槽位） */
export function leafSparkleCss(hue: number): string {
  const h = ((hue % 1) + 1) % 1;
  const s = 1, l = 0.5;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const chan = (t: number): number => {
    let x = t; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const r = Math.round(chan(h + 1 / 3) * 255);
  const g = Math.round(chan(h) * 255);
  const b = Math.round(chan(h - 1 / 3) * 255);
  const tGold = (r / 255) * 0.5;                 // Color.Lerp(value, Gold, R/255*0.5f)
  const lr = Math.round(r + ((255 - r) * tGold));
  const lg = Math.round(g + ((215 - g) * tGold));
  const lb = Math.round(b + ((0 - b) * tGold));
  return `rgb(${lr},${lg},${lb})`;
}

/** Spawn_LeafCrystalShot 本体：LocalPosition -= Velocity×4f（:3152 逆航向拖尾）、
 *  Velocity=MovementVector、TimeToLive=30/半窗 FadeIn/Out=15（:3138/:3152-55）；生产
 *  与 module8 消费两面对同一函数（L5 收编规则头注） */
export function leafCrystalShotFx(
  game: GameHooks, x: number, y: number, vx: number, vy: number, hue: number,
): void {
  const col = leafSparkleCss(hue);
  game.spawnParticles?.(x - vx * 4, y - vy * 4, col, 1, Math.hypot(vx, vy),
    { life: 30, vx, vy, size: 1.6 });
  game.spawnParticles?.(x - vx * 4, y - vy * 4, 'rgba(255,255,255,0.5)', 1, Math.hypot(vx, vy),
    { life: 22, vx, vy, size: 0.9 });                              // additive 白核近似
}

// ==================== 2026-08-31 L5 长尾批（追加收编段,标记 L6TAIL） ====================

/** 粒子种子缺省别名（新一批函数统一走 rng 形参注入） */
type Rnd = () => number;

/** XNA Color.PackedValue（RGBA 小端：R=最低字节）→ css `rgba()` 字符串。
 *  LightningSmall 族 UniqueInfoPiece 直传色打包值（Spawn_Lightning :3635-3640
 *  color.PackedValue=(uint)settings.UniqueInfoPiece） */
export function orchestraPackedCss(packed: number, alphaOverride?: number): string {
  const p = packed >>> 0;
  const r = p & 0xff, g = (p >>> 8) & 0xff, b = (p >>> 16) & 0xff;
  const a = alphaOverride ?? (p >>> 24) & 0xff;
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

/** C# float 色构造 new Color(fR,fG,fB,fA)→css（×255 截断=字节化） */
function fc(r: number, g: number, b: number, a = 1): string {
  const c = (v: number): number => Math.round(v * 255);
  return `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

/** Main.rand.NextVector2Circular(rx,ry) */
function circ(rnd: Rnd, rx: number, ry = rx): { x: number; y: number } {
  return { x: (rnd() * 2 - 1) * rx, y: (rnd() * 2 - 1) * ry };
}

/** SpawnHelper_SpawnInLine 的仓内等价步进器——按 [movementVector..position]
 *  区间每 stepPx 一站回调（Projectile.cs:2043-2059；step=Length()/1000 钳 ≥4） */
export function orchestraLineWalk(
  bx: number, by: number, px: number, py: number,
  uniqueInfo: number, perStep: (x: number, y: number, nx: number, ny: number) => void,
): void {
  let dxs = px - bx, dys = py - by;
  const dist = Math.hypot(dxs, dys);
  if (dist <= 0) return;
  dxs /= dist; dys /= dist;                            // SafeNormalize
  const step = Math.max(4, Math.abs(uniqueInfo) / 1000);
  for (let s = 0; s <= dist; s += step) {
    perStep(bx + dxs * s, by + dys * s, dxs * step, dys * step);
  }
}

/**
 * Spawn_NightsEdge（:3221-3277）：永夜刃命中小三叉紫尘幕。双层各 3 臂（基角 π/4+π/4·i），
 * 第一层暗紫 rgba(64,25,128,.5)、第二层亮紫白底;TrueNightsEdge(:3155)=双臂绿族两档
 * + d75 尘对;i==1 强化臂原文死支（步长语义忠实保留不触发,登记）。
 */
export function nightsEdgeFx(
  game: GameHooks, x: number, y: number, rng: Rng = Math.random,
  variant: 'nightsedge' | 'truenightsedge' = 'nightsedge',
): void {
  const life = 30;
  if (variant === 'nightsedge') {
    for (let i = 0; i < 3; i++) {
      const boost = i === 1 ? 1.5 : 1;
      const spd = Math.PI / 4 + Math.PI / 4 * i;
      const vx = Math.cos(spd) * 4 * boost;
      const vy = Math.sin(spd) * 4 * boost;
      game.spawnParticles?.(x - vx * life * 0.25, y - vy * life * 0.25,
        fc(0.25, 0.1, 0.5, 0.5), 1, Math.hypot(vx, vy),
        { life, vx, vy, size: 2 * 1.1 });
      game.spawnParticles?.(x - vx * life * 0.25, y - vy * life * 0.25,
        fc(0.5, 0.25, 1, 1), 1, Math.hypot(vx, vy), { life, vx, vy, size: 2 * 0.7 });
    }
  } else {
    for (let i = 0; i <= 2; i += 2) {
      const spd = Math.PI / 4 + Math.PI / 4 * i;
      const vx = Math.cos(spd) * 4, vy = Math.sin(spd) * 4;
      game.spawnParticles?.(x - vx * life * 0.25, y - vy * life * 0.25,
        fc(0.3, 0.6, 0.3, 0.5), 1, 4, { life, vx, vy, size: 4 * 1.1 });
      game.spawnParticles?.(x - vx * life * 0.25, y - vy * life * 0.25,
        fc(0.6, 1, 0.2, 1), 1, 4, { life, vx, vy, size: 4 * 0.7 });
      for (const side of [-1, 1]) {                    // d75 尘对（:3206-3219）
        game.spawnDust?.(x, y, 1, 1, 75,
          side * (rng() * 2 - 1) * 0.079 * rng(),
          side * (rng() * 2 - 1) * 0.079 * rng(), 0, null, 1.4);
      }
    }
  }
}

/** Spawn_TrueNightsEdge 快捷入口 */
export function trueNightsEdgeFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  nightsEdgeFx(game, x, y, rng, 'truenightsedge');
}

/**
 * Spawn_Excalibur（:2798-2860）/ Spawn_TrueExcalibur（:2970-3084）：
 * 圣剑四臂金尘十字（正向反抽速度带 ×odd 1.5 增强）+ d169 尘对；真断钢多 π/4 基角
 * 红粉前置双带（d242 门 Next(2)!=0）。剑鞭 SwordWhip tag proc 同用 TrueExcalibur
 * （WhipTagEffect_SwordWhip.cs:22 clientOnly:false）。
 */
export function excaliburFx(
  game: GameHooks, x: number, y: number, rng: Rng = Math.random,
  variant: 'excalibur' | 'trueexcalibur' = 'excalibur',
): void {
  if (variant === 'trueexcalibur') {
    const lifeT = 36, base = Math.PI / 4;
    for (let i = 0; i < 2; i++) {
      const a0 = base + Math.PI / 2 * i;
      const vx = Math.cos(a0) * 4, vy = Math.sin(a0) * 4;
      game.spawnParticles?.(x, y, fc(1, 0, 0.3, 1), 1, 4, { life: lifeT, vx: -vx * 0.2, vy: -vy * 0.2, size: 5 * 1.1 });
      game.spawnParticles?.(x, y, fc(1, 0.5, 0.8, 1), 1, 4, { life: lifeT, vx: vx * 0.2, vy: vy * 0.2, size: 3 * 0.7 });
      if (rng() >= 0.5) {
        for (const side of [-1, 1]) {
          game.spawnDust?.(x, y, 1, 1, 242,
            side * (rng() * 2 - 1) * 0.079 * rng(), side * (rng() * 2 - 1) * 0.079 * rng(), 0, null, 1.4);
        }
      }
    }
  }
  const life = 30;
  const gateDust = variant === 'trueexcalibur';
  for (let band = 0; band < 2; band++) {
    const innerScale = band === 0 ? 1.1 : 0.7;
    const tint = band === 0 ? fc(0.9, 0.85, 0.4, 0.5) : fc(1, 1, 0.2, 1);
    for (let i = 0; i < 4; i++) {
      const a0 = Math.PI / 2 * i;
      const vx = Math.cos(a0) * 4, vy = Math.sin(a0) * 4;
      const boost = i % 2 === 1 ? 1.5 : 1;
      const dirSign = band === 0 ? -1 : 1;
      game.spawnParticles?.(x, y, tint, 1, Math.hypot(vx, vy),
        { life, vx: dirSign * vx * 0.2 * boost, vy: dirSign * vy * 0.2 * boost,
          size: (band === 0 ? 2 : 4) * innerScale });
      if (!gateDust || rng() >= 0.5) {
        for (const side of [-1, 1]) {
          game.spawnDust?.(x, y, 1, 1, 169,
            side * (rng() * 2 - 1) * 0.063 * rng(), side * (rng() * 2 - 1) * 0.063 * rng(), 0, null, 1.4);
        }
      }
    }
  }
}

/** Spawn_TrueExcalibur 快捷入口 */
export function trueExcaliburFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  excaliburFx(game, x, y, rng, 'trueexcalibur');
}

/**
 * Spawn_TerraBlade（:2715-2797）：泰拉刃绿色三带击斩（基准角=MovementVector 角+π/2）。
 * 984 弧/985 光束命中两侧同款（Projectile.Damage case984|985 :13015 clientOnly:false）。
 */
export function terraBladeFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const life = 30;
  const base = Math.atan2(moveY, moveX) + Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const a0 = base + Math.PI / 2 * i;
    const vx = Math.cos(a0) * 4, vy = Math.sin(a0) * 4;
    const odd = i % 2 === 1;
    game.spawnParticles?.(x, y, fc(0.2, 0.85, 0.4, 0.5), 1, 4,
      { life, vx: -vx * (odd ? 0.4 : 0.2), vy: -vy * (odd ? 0.4 : 0.2), size: 3 * 1.1 });
  }
  for (const s of [-1, 1]) {
    const a0 = base + Math.PI / 2 * s;
    const vx = Math.cos(a0) * 2, vy = Math.sin(a0) * 2;
    game.spawnParticles?.(x, y, fc(0.4, 1, 0.4, 0.5), 1, 2,
      { life, vx: -vy * 0.5, vy: vx * 0.5, size: 3 * 1.1 });
  }
  for (let i = 0; i < 4; i++) {
    const a0 = base + Math.PI / 2 * i;
    const vx = Math.cos(a0) * 4, vy = Math.sin(a0) * 4;
    const odd = i % 2 === 1;
    game.spawnParticles?.(x, y, fc(0.2, 1, 0.2, 1), 1, 4,
      { life, vx: vx * (odd ? 0.4 : 0.2), vy: vy * (odd ? 0.4 : 0.2), size: 3 * 0.7 });
    for (const side of [-1, 1]) {
      game.spawnDust?.(x, y, 1, 1, 107,
        side * (rng() * 2 - 1) * 0.063 * rng(), side * (rng() * 2 - 1) * 0.063 * rng(),
        0, null, side > 0 ? 1.4 : 0.8);
    }
  }
}

/**
 * Spawn_MoonLordWhip（:1653-1710）：月主鞭命中的双色笔触（MovementVector 方向）
 * + d229 尘对。Projectile.Damage case1035/:1045 :13025/:13030 clientOnly:false
 * （1035 加 ±0.1τ 抖动载荷、1045 lerp 半程由调用侧折算进 posX/posY）。
 */
export function moonLordWhipHitFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const dl = Math.hypot(moveX, moveY);
  const ang = dl > 0 ? Math.atan2(moveY / dl, moveX / dl) : 0;
  const life = 30;
  const vx = Math.cos(ang) * 4, vy = Math.sin(ang) * 4;
  game.spawnParticles?.(x - vx * life * 0.25, y - vy * life * 0.25,
    fc(0.3, 0.6, 0.7, 0.5), 1, 4, { life, vx, vy, size: 6 * 1.1 });
  game.spawnParticles?.(x - vx * life * 0.25, y - vy * life * 0.25,
    fc(0.2, 1, 0.4, 1), 1, 4, { life, vx, vy, size: 6 * 0.7 });
  for (let k = 0; k < 2; k++) {
    void k;
    for (const side of [-1, 1]) {
      const ja = (rng() * 2 - 1) * Math.PI * 2 * 0.025;
      const dvx = vx * Math.cos(ja) - side * vy * Math.sin(ja);
      const dvy = vx * Math.sin(ja) + side * vy * Math.cos(ja);
      game.spawnDust?.(x + vx * 4, y + vy * 4, 1, 1, 229,
        dvx * rng(), dvy * rng(), 0, null, 1.2);
    }
  }
}

/**
 * Spawn_MoonLordWhipEye（:1897-1919）：月主鞭 proc 眼球残影（BehindPlayers、寿命 45t、
 * velocity=movementVector×0.05）。生产者 SpawnMoonLordWhipProc（P.cs:15005,1045 子鞭出生）。
 */
export function moonLordWhipEyeFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const ang = rng() * Math.PI * 2;                       // LocalPosition=+dir×num×num2×0.5
  game.spawnParticles?.(x + Math.cos(ang) * 22.5, y + Math.sin(ang) * 22.5,
    'rgba(255,255,255,0.65)', 1, 0,
    { life: 45, vx: moveX * 0.05, vy: moveY * 0.05, damp: 1, grav: 0, size: 2.2 + rng() * 0.9 });
}

/** hsl css → DustColor 反解（spawnDust color 形参直配,a 缺省 255） */
export function hexToRgbArr(css: string): { r: number; g: number; b: number; a: number } {
  const m = /rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)/.exec(css);
  if (!m) return { r: 255, g: 255, b: 255, a: 255 };
  return {
    r: Number(m[1]), g: Number(m[2]), b: Number(m[3]),
    a: m[4] ? Math.round(Number(m[4]) * 255) : 255,
  };
}

/**
 * Spawn_StardustPunch（:3412-3461）：星尘拳命中紫罗兰光点（hue .59-.65）+ 白影 +
 * 2×d267 星屑（scale .6+r×2、position ±Circular(16)）。生产者 P.cs:14315(1039)/:14331(623)
 * ——MovementVector=(direction, rand±0.5)×(2..4),Position=lerp(center,盒最近点,.5)+Y 抖动。
 */
export function stardustPunchFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const scale = rng() * 0.4 + 0.4;
  const vi = (rng() * 2 - 1) * Math.PI;
  const vxp = moveX * (0.3 + rng() * 0.35);
  const vyp = moveY * (0.3 + rng() * 0.35);
  const px = x + circ(rng, 8).x * scale, py = y + circ(rng, 8).y * scale;
  game.spawnParticles?.(px, py, orchestraHslCss((0.6 + rng() * 0.05) % 1, 1, 0.4 + rng() * 0.25),
    1, Math.hypot(vxp, vyp), { life: 60, vx: vxp + Math.cos(vi) * 0.08 * scale, vy: vyp + Math.sin(vi) * 0.08 * scale, size: 2 * scale });
  game.spawnParticles?.(px, py, 'rgba(255,255,255,0.8)', 1, Math.hypot(vxp, vyp),
    { life: 60, vx: vxp, vy: vyp, size: 1.2 * scale });
  for (let i = 0; i < 2; i++) {
    const dc = circ(rng, 16);
    const d = game.spawnDust?.(x + dc.x, y + dc.y, 1, 1, 267,
      circ(rng, 2).x + moveX * (0.5 + rng() * 0.5) * 1.4, circ(rng, 2).y, 0,
      hexToRgbArr(orchestraHslCss((0.59 + rng() * 0.05) % 1, 1, 0.4 + rng() * 0.25)), 0.6 + rng() * 2);
    if (d) d.noGravity = true;
  }
}

/**
 * Spawn_PrincessWeapon（:3357-3411）：公主法杖挥尾品红焰（终值 Velocity=movement×0.66）+
 * 白影 + 2×d267 尾尘（velocity 终值=MovementVector 覆写段直译）。Player.cs:51790
 * itemAnimation%4==0 挥拍面/P.cs:43546-67 三 proc 面（全 clientOnly:true 本地直驱）。
 */
export function princessWeaponFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const scale = rng() * 0.4 + 0.2;
  const vxp = moveX * 0.66, vyp = moveY * 0.66;
  const px = x + circ(rng, 8).x * scale, py = y + circ(rng, 8).y * scale;
  game.spawnParticles?.(px, py, orchestraHslCss((0.92 + rng() * 0.02) % 1, 1, 0.4 + rng() * 0.25),
    1, Math.hypot(vxp, vyp), { life: 60, vx: vxp, vy: vyp, size: 2 * scale });
  game.spawnParticles?.(px, py, 'rgba(255,255,255,0.8)', 1, Math.hypot(vxp, vyp),
    { life: 60, vx: vxp, vy: vyp, size: 1.2 * scale });
  for (let i = 0; i < 2; i++) {
    const dc = circ(rng, 16);
    const d = game.spawnDust?.(x + dc.x, y + dc.y, 1, 1, 267, moveX, moveY, 0,
      hexToRgbArr(orchestraHslCss((0.92 + rng() * 0.02) % 1, 1, 0.4 + rng() * 0.25)), 0.1);
    if (d) d.noGravity = true;
  }
}

/**
 * Spawn_FormatC（:3703-3763）：Format:C 法锤暴击金色星芒（Extra[98] 金 α127+白影双层,
 * 基角=MovementVector 角+π/2±0.9425）+ 12×d213 金尘旋升。
 * 生产者 Projectile.Damage case562 crit 门 :13003（clientOnly:false,MovementVector=velocity）。
 */
export function formatCFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const base = Math.atan2(moveY, moveX) + Math.PI / 2 + 0.9425 * (rng() * 2 - 1);
  const a0 = base + (rng() * 2 - 1) * 0.1;
  const mag = 3 * 0.7 * ((rng() * 2 - 1) || 1);
  const vel = Math.abs(mag);
  const off = Math.cos(a0) * -mag * 0.7 * 15 * 0.2 + circ(rng, 8).x;
  const offY = Math.sin(a0) * -mag * 0.7 * 15 * 0.2 + circ(rng, 8).y;
  game.spawnParticles?.(x + off, y + offY, 'rgba(255,215,0,0.5)', 1, vel,
    { life: 15, vx: Math.cos(a0) * mag, vy: Math.sin(a0) * mag, size: 2.2 });
  game.spawnParticles?.(x + off, y + offY, 'rgba(255,255,255,0.6)', 1, vel,
    { life: 15, vx: Math.cos(a0) * mag, vy: Math.sin(a0) * mag, size: 1.32 });
  for (let i = 0; i < 12; i++) {
    const d = game.spawnDust?.(x, y, 1, 1, 213, ((rng() * 5) | 0) - 2, ((rng() * 5) | 0) - 2, 0, null, 1);
    if (!d) continue;
    d.noGravity = true;
    d.fadeIn = d.scale + 1 + ((rng() * 51) | 0) * 0.01;
    d.vx *= (((rng() * 36) | 0) + 15) * 0.01;
    d.vy *= (((rng() * 36) | 0) + 15) * 0.01;
    d.vx *= (((rng() * 76) | 0) + 25) * 0.01;
    d.vy -= (((rng() * 16) | 0) + 15) * 0.1;
    d.y -= 4;
    const rot = base + (d.vx! > 0 ? Math.PI / 2 : -Math.PI / 2);
    const nx = d.vx! * Math.cos(rot) - d.vy! * Math.sin(rot);
    const ny = d.vx! * Math.sin(rot) + d.vy! * Math.cos(rot);
    d.vx = nx; d.vy = ny;
    d.x -= nx * 5; d.y -= ny * 5;
    if (rng() >= 1 / 3) d.noGravity = false; else d.scale *= 0.6;
  }
}

// ==================== 雷族（BlackLightning 族 + LightningSmall 蓝/红共体） ====================

/** 黑雷粒子主色档（Spawn_BlackLightning* :3518-3532/:3559-3573 四掷表） */
function blackLightningTint(rng: Rng): string {
  const roll = rng();
  if (roll < 0.25) return fc(106 * (0.1 + 0.7 * rng()), 90 * (0.1 + 0.7 * rng()), 205 * (0.1 + 0.7 * rng()), 0.498);
  if (roll < 0.5) return fc(95 * (0.1 + 0.8 * rng()), 81 * (0.1 + 0.8 * rng()), 184 * (0.1 + 0.8 * rng()), 0.235);
  return fc(15, 12, 30, 1);                              // 近黑（纯黑粒在光照合成下不可见,近似档登记）
}

/**
 * Spawn_BlackLightningSmall（:3513-3552）：黑雷拖带（径向×spd×(1,0.5)×0.2+movementVector
 * 纵向牵引,scale .5,fadeOut .5）。NPC.cs:92297/P.cs:48715（clientOnly:true）。
 */
export function blackLightningSmallFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const groups = ((rng() * 2) | 0) + 1;                  // Next(1,3)
  const jitter = circ(rng, 12).x * 0.7;
  for (let g = 0; g < groups; g++) {
    const a = Math.PI * 2 * (g / groups) + jitter;
    const spd = rng() * 4 + 0.1;
    const vx = Math.cos(a) * spd * 0.5 * 0.2 + moveX;
    const vy = Math.sin(a) * spd * 0.25 * 0.2 + moveY;
    game.spawnParticles?.(x + jitter, y + circ(rng, 12).y * 0.7, blackLightningTint(rng), 1,
      Math.hypot(vx, vy), { life: 24, vx, vy, damp: 1, size: 0.5, grav: 0 });
  }
}

/**
 * Spawn_BlackLightningHit（:3554-3593）：黑雷爆——7 组扩散环帧条（scale One、
 * ScaleVelocity .05/t）。生产者 WhipTagEffect_DarkHarvest.cs:24 clientOnly:false +
 * P.EmitBlackLightningParticles :15201。
 */
export function blackLightningHitFx(
  game: GameHooks, x: number, y: number, _moveX = 0, _moveY = 0, rng: Rng = Math.random,
): void {
  const phase = rng() * Math.PI * 2;
  for (let g = 0; g < 7; g++) {
    const a = Math.PI * 2 * (g / 7) + phase + (rng() * 2 - 1) * 0.25;
    const spd = rng() * 4 + 0.1;
    const vx = Math.cos(a) * spd, vy = Math.sin(a) * spd * 0.5;
    game.spawnParticles?.(x + circ(rng, 12).x * 0.7, y + circ(rng, 12).y * 0.7,
      blackLightningTint(rng), 1, Math.hypot(vx, vy),
      { life: 24, vx, vy, damp: 0.99, size: 1, grav: 0 });
  }
}

/**
 * Spawn_LightningSmall 共通本体（:3619-3673）：蓝(37)/红(77) 判序共用——UniqueInfoPiece
 * 打包色覆盖缺省 cyan 档、AddLight(.28,.56,.7)、10t 帧条+50% d226/d331 微尘随行。
 */
export function lightningSmallOrchestra(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0,
  packedColor = 0, rng: Rng = Math.random,
): void {
  game.addLightAt?.(x, y, 0.28, 0.56, 0.7);
  const colA = packedColor !== 0 ? orchestraPackedCss(packedColor, 255) : 'rgba(133,255,255,255)';
  const colB = packedColor !== 0 ? colA : 'rgba(15,100,155,255)';
  const groups = ((rng() * 2) | 0) + 1;
  for (let g = 0; g < groups; g++) {
    const a = Math.PI * 2 * (g / groups) + (rng() * 2 - 1) * 0.25;
    const spd = rng() * 4 + 0.1;
    const vx = Math.cos(a) * spd * 0.5 * 0.2 + moveX;
    const vy = Math.sin(a) * spd * 0.25 * 0.2 + moveY;
    const mix = rng() < 0.5 ? colA : colB;
    game.spawnParticles?.(x + circ(rng, 6).x * 0.7, y + circ(rng, 6).y * 0.7, mix, 1,
      Math.hypot(vx, vy), { life: 10, vx, vy, damp: 1, size: 1, grav: 0 });
    if (rng() >= 0.5) {                                  // Next(2)==0 → 1/2（:3660-3672）
      const d = game.spawnDust?.(x, y, 1, 1, packedColor !== 0 ? 331 : 226,
        vx, vy, 0, packedColor !== 0 ? hexToRgbArr(colA) : null, 1);
      if (d) {
        d.noGravity = true;
        d.scale *= 1.25;
        const j = circ(rng, 4);
        d.vx = j.x; d.vy = j.y;
        d.noLight = true;
      }
    }
  }
}

/** BlueLightningSmall(37)=lightningSmallOrchestra 直通（Red(77) 同体） */
export function blueLightningSmallFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, packedColor = 0, rng: Rng = Math.random,
): void { lightningSmallOrchestra(game, x, y, moveX, moveY, packedColor, rng); }

/** RedLightningSmall(77) 同体（vanilla dispatch 共用 Spawn_LightningSmall :400-404） */
export function redLightningSmallFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, packedColor = 0, rng: Rng = Math.random,
): void { lightningSmallOrchestra(game, x, y, moveX, moveY, packedColor, rng); }

/**
 * Spawn_BlueLightningSmallLong（:3595-3617）：电鳗鞭链电长距版——沿 MovementVector 每
 * 25px 一站复播 LightningSmall；<40px 单站不触发门。WhipTagEffect_ElectricEel.cs:46
 * （clientOnly:false）/P.cs:14484 浸液导通链（BroadcastOrRequest）。
 */
export function blueLightningSmallLongFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, packedColor = 0, rng: Rng = Math.random,
): void {
  const len = Math.hypot(moveX, moveY);
  if (len < 40) return;                                  // num3=40 门（:3605）
  const ux = moveX / len, uy = moveY / len;
  const stepPx = 25;
  let cxp = x, cyp = y;
  for (let s = 0; s < len; s += stepPx) {
    lightningSmallOrchestra(game, cxp, cyp, ux * 2, uy * 2, packedColor, rng);
    cxp += ux * stepPx; cyp += uy * stepPx;
  }
}

/**
 * Spawn_StormLightningWindup（:975-1025）：落雷蓄势白闪环（proj916 主帧条+半透白影
 * duplicate 双层同心;τ 相位环;1/3 概率位置跳到 v×(frames-1) 再反向减半）。
 * 生产者 P.cs:40510/:40520/:80294 + StormLightningParticle.cs:170（全 clientOnly:true）。
 */
export function stormLightningWindupFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, packedColor = 0, rng: Rng = Math.random,
): void {
  const phase = rng() * Math.PI * 2;
  const groups = ((rng() * 2) | 0) + 1;                  // Next(1,3)
  const white = packedColor !== 0 ? orchestraPackedCss(packedColor, 255) : 'rgba(255,255,255,255)';
  for (let g = 0; g < groups; g++) {
    const frames = ((rng() * 4) | 0) + 7;                // Next(7,11)
    const a = Math.PI * 2 * (g / groups) + phase + (rng() * 2 - 1) * 0.25;
    const spd = rng() * 3 + 0.1;
    let vx = Math.cos(a) * spd + moveX * 0.5;
    let vy = Math.sin(a) * spd * 0.5 + moveY * 0.5;
    let px = x + circ(rng, 6).x * 0.7, py = y + circ(rng, 6).y * 0.7;
    if (rng() < 1 / 3) {                                 // Next(3)==0（:1014-1017）
      px += vx * (frames - 1);
      py += vy * (frames - 1);
      vx *= -0.5; vy *= -0.5;
    }
    game.spawnParticles?.(px, py, white, 1, Math.hypot(vx, vy),
      { life: frames, vx, vy, damp: 1, size: 1.5, grav: 0 });
    game.spawnParticles?.(px, py, 'rgba(255,255,255,0)', 1, Math.hypot(vx, vy),
      { life: frames, vx, vy, damp: 1, size: 0.75, grav: 0 });
  }
}

/**
 * Spawn_ArcLightning（:1245-1321）收编段：1122 出手拍余像——玩家锚驻留帧条一束+
 * 终点 RandomizedFrame 对+AddLight+双音（Item15/ArcSurge vol .6 pitch ±0.05..−0.25）。
 * 折线本体由 proj1457 自绘 LightningGenerator 路径承担（M 级⑥清偿,不重复生成）。
 */
export function arcSurgeFx(
  game: GameHooks, ax: number, ay: number, bx: number, by: number, invokerSlot: number,
  packedColor = 0, rng: Rng = Math.random,
): void {
  const white = packedColor !== 0 ? orchestraPackedCss(packedColor, 255) : 'rgba(255,255,255,255)';
  const rot = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
  game.addLightAt?.(bx, by, 0.4, 0.8, 1);
  game.playSfxWav?.('Item_15', 1, ax, ay);
  game.playSfxFiles?.(['arcsurge'], 0.6, ax, ay);        // SoundID.ArcSurge 组播兜底文件名
  game.spawnParticles?.(ax, ay, white, 1, 0,
    { life: 16, vx: 0, vy: 0, damp: 1, size: 1.5, grav: 0 });
  const frames = ((rng() * 5) | 0) + 4;                  // Next(4,9)
  game.spawnParticles?.(bx + circ(rng, 6).x * 0.7, by + circ(rng, 6).y * 0.7, white, 1, 0,
    { life: frames, vx: 0, vy: 0, damp: 1, size: 1.275, grav: 0 });
  game.spawnParticles?.(bx, by, 'rgba(255,255,255,0)', 1, 0,
    { life: frames, vx: 0, vy: 0, damp: 1, size: 0.64, grav: 0 });
  void rot; void invokerSlot;                            // followPlayerIndex 档无玩家跟随通道登记
}

/**
 * Spawn_PaladinsShieldHit（:903-973）：圣骑士盾分伤护壁闪——两玩家位各 d57×4
 * （v×3,noGravity,fadeIn 1.5,noLight）。PositionInWorld=(受击槽,持盾槽) int 对;
 * FadingParticle 盾精灵段（Item938 白盾膨胀 30t/15t）无贴图池登记。
 */
export function paladinsShieldHitFx(
  game: GameHooks, targetSlot: number, shieldSlot: number, rng: Rng = Math.random,
): void {
  const a = orchestraPlayerAnchor(game, targetSlot < 0 ? 255 : targetSlot);
  const b = orchestraPlayerAnchor(game, shieldSlot < 0 ? 255 : shieldSlot);
  for (const p of [a, b]) {
    if (!p) continue;
    for (let i = 0; i < 4; i++) {
      void rng;
      const d = game.spawnDust?.(p.x, p.y, 20, 42, 57, 0, 0, 0, null, 1);
      if (d) { d.vx *= 3; d.vy *= 3; d.noGravity = true; d.fadeIn = 1.5; d.noLight = true; }
    }
  }
}

/** 编排消费侧 invoker→世界锚解析（Main.player[IndexOfPlayerWhoInvokedThis] 等价） */
export function orchestraPlayerAnchor(
  game: GameHooks, slot: number,
): { x: number; y: number; w: number; h: number } | null {
  const net = (game as unknown as { net?: { mySlot?: number; players?: Map<number, { x: number; y: number }> } }).net;
  const me = (game as unknown as { player?: { x: number; y: number; w: number; h: number } }).player;
  if (net && slot !== net.mySlot) {
    const rp = net.players?.get(slot);
    if (rp) return { x: rp.x, y: rp.y, w: 20, h: 42 };
    return null;
  }
  return me ? { x: me.x, y: me.y, w: me.w, h: me.h } : null;
}

// ==================== 杂项族（Keybrand/GasTrap/Shimmer/TownSlime/Leaf/Cattiva/RB 族） ====================

/**
 * Spawn_Keybrand（:3816-3883）：锁匙刃命中三带——①3×金橙 sparkles ②Extra[98] 橙白渐变
 * FadingParticle 对 ③蓝白扩张闪点。生产者 NPC.KeyBrandStrike :82005 clientOnly:false /
 * Player.cs:35153 滑行面 clientOnly:true（后者登记未接）。
 */
export function keybrandFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  for (let i = 0; i < 3; i++) {                          // 第一带（:3822-3845）
    const a = Math.PI * 2 * (i / 3) + (rng() * 2 - 1) * 0.1;
    const spd = 1.5 * 0.7;
    game.spawnParticles?.(x + circ(rng, 4).x * 0.7, y + circ(rng, 4).y * 0.7,
      orchestraHslCss(0.08 + rng() * 0.03, 1, 0.45), 1, spd,
      { life: 60, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, size: 1.6 });
  }
  const a2 = rng() * Math.PI * 2;                        // 第二带（:3855-3881）
  game.spawnParticles?.(x + Math.cos(a2) * 0.7 * 30 * 0.2, y + Math.sin(a2) * 0.7 * 30 * 0.2,
    fc(1, 0.72, 0.28, 0), 1, 0.7, { life: 30, vx: Math.cos(a2) * 0.7, vy: Math.sin(a2) * 0.7, size: 2 });
  game.spawnParticles?.(x, y, 'rgba(255,244,224,0)', 1, 0.7,
    { life: 30, vx: Math.cos(a2) * 0.7, vy: Math.sin(a2) * 0.7, size: 1.2 });
  game.spawnParticles?.(x + circ(rng, 4).x * 0.7, y + circ(rng, 4).y * 0.7,   // 第三带（:3894-3913）
    `rgba(100,143,255,0.5)`, 1, 0,
    { life: 30, grav: -0.02, damp: 0.97, size: 0.35 });
}

/**
 * Spawn_GasTrap（:2924-2967）：毒气陷阱起爆——Item16 音+12 外环/10 内环绿调烟雾
 * （外环=movementVector+径向 5..6 且 RotatedByRandom(π/20);内环 2.5..3.95 隔位减半、
 * RotatedByRandom(π/15);寿命 50-70/80-110）。Projectile.cs:33160 弹1007首帧 Broadcast。
 */
export function gasTrapFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  game.playSfxWav?.('Item_16', 1, x, y);
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2;
    let sx = moveX + (5 + rng()) * Math.cos(a0);
    let sy = (5 + rng()) * Math.sin(a0);
    const ja = (rng() * 2 - 1) * Math.PI / 20;
    const rx = sx * Math.cos(ja) - sy * Math.sin(ja);
    const ry = sx * Math.sin(ja) + sy * Math.cos(ja);
    sx = rx; sy = ry;
    game.spawnParticles?.(x + sx, y + sy, 'rgba(190,230,180,0.30)', 1, 0,
      { life: 50 + ((rng() * 20) | 0), vx: sx, vy: sy, damp: 0.96, grav: -0.01, size: 1.2 + rng() * 0.42 });
  }
  for (let j = 0; j < 10; j++) {
    const a0 = (j / 10) * Math.PI * 2;
    const sBase = 2.5 + rng() * 1.45;
    let sx = sBase * Math.cos(a0), sy = sBase * Math.sin(a0);
    const ja = (rng() * 2 - 1) * Math.PI / 15;
    const rx = sx * Math.cos(ja) - sy * Math.sin(ja);
    const ry = sx * Math.sin(ja) + sy * Math.cos(ja);
    sx = rx; sy = ry;
    if (j % 2 === 0) { sx *= 0.5; sy *= 0.5; }
    game.spawnParticles?.(x, y, 'rgba(210,240,205,0.26)', 1, 0,
      { life: 80 + ((rng() * 30) | 0), vx: sx, vy: sy, damp: 0.98, grav: -0.008, size: 1.25 + rng() * 0.6 });
  }
}

/**
 * Spawn_ShimmerArrow（:2605-2680）：微光箭两轮十字虹彩爆发（内层 hsl(rand,1,.5)/外层
 * lerp 白,首轮 d306 尘对）。生产者 P.cs:77676 弹1006/NPC.cs:86058（clientOnly:true）。
 */
export function shimmerArrowFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  for (let it = 0; it < 2; it++) {
    const jitter = (rng() * 2 - 1) * Math.PI * 2 * 0.05;
    const hueC = orchestraHslCss(rng(), 1, 0.5);
    const rgbC = hexToRgbArr(hueC);
    const valCss = `rgb(${Math.round((rgbC.r + 255) / 2)},${Math.round((rgbC.g + 255) / 2)},${Math.round((rgbC.b + 255) / 2)})`;
    for (let a = 0; a < 4; a++) {
      const ang = (Math.PI / 2) * a + jitter;
      const vx = Math.cos(ang) * 4, vy = Math.sin(ang) * 4;
      const oddA = a % 2 === 1;
      game.spawnParticles?.(x, y, hueC, 1, 4,
        { life: 20, vx: -vx * 0.2, vy: -vy * 0.2, size: (oddA ? 4 : 2) * 1.1 });
      game.spawnParticles?.(x, y, valCss, 1, 4,
        { life: 20, vx: vx * 0.2, vy: vy * 0.2, size: (oddA ? 4 : 2) * 0.7 });
      if (it === 0) {
        for (const side of [-1, 1]) {
          const ja = side * (rng() * 2 - 1) * Math.PI * 2 * 0.025;
          const dxv = vx * Math.cos(ja) - vy * Math.sin(ja);
          const dyv = vx * Math.sin(ja) + vy * Math.cos(ja);
          const d = game.spawnDust?.(x, y, 1, 1, 306, dxv * rng(), dyv * rng(), 0, hexToRgbArr(hueC), 1.4);
          if (d) { d.noGravity = true; d.fadeIn = 1.2; }
        }
      }
    }
  }
}

/**
 * Spawn_ShimmerBlock（:2358-2377）：微光转化格上飘星（scale 系数=uniqueInfo/1000 兜底 1）。
 * 生产者 Player.cs:24002/NPC.cs:53792/P.cs:26459/:50642（全 clientOnly:true 本地直驱）。
 */
export function shimmerBlockFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0,
  uniqueInfo = 0, rng: Rng = Math.random,
): void {
  let scaleMul = uniqueInfo / 1000;
  if (!(scaleMul > 0)) scaleMul = 1;
  game.spawnParticles?.(x, y, orchestraHslCss(rng(), 0.75, 0.8), 1, Math.hypot(moveX, moveY),
    { life: 45, vx: moveX, vy: moveY, damp: 1, grav: 0, size: 1.2 * scaleMul });
}

/** 两色线性插值（Color.Lerp f 直译） */
function orchestraLerpCss(a: string, b: string, t: number): string {
  const pa = /rgb\((\d+),(\d+),(\d+)\)/.exec(a)!;
  const pb = /rgb\((\d+),(\d+),(\d+)\)/.exec(b)!;
  const mix = (sa: string, sb: string): number => Math.round(Number(sa) + (Number(sb) - Number(sa)) * t);
  return `rgb(${mix(pa[1], pb[1])},${mix(pa[2], pb[2])},${mix(pa[3], pb[3])})`;
}

/** 组件色插值（字节化） */
function orchestraLerpRgb(
  a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number,
): { r: number; g: number; b: number } {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/** Main.OurFavoriteColor 近似档（ElderSlime 尘 Lerp 起点,原版随机型登记恒定近似） */
function orchestraOurFavoriteColor(): string { return 'rgb(97,146,213)'; }

/**
 * Spawn_TownSlimeTransform 三味档（:2410 分派 → Nerdy :2561 / Copper :2577 / Elder :2545）。
 * kind：0 书呆（d4×60 蓝 α175）/ 1 铜（d43×40 铜白）/ 2 长（d43×30 OurFavoriteColor→白
 * + gore61-63×8 近似升腾粒）。NPC.cs:19186/:19210/:80339 Broadcast 面。
 */
export function townSlimeTransformFx(
  game: GameHooks, kind: 0 | 1 | 2, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const mvx = moveX * 0.75, mvy = moveY * 0.75;
  switch (kind) {
    case 0:
      for (let i = 0; i < 60; i++) {
        const d = game.spawnDust?.(x, y, 1, 1, 4, (mvx + circ(rng, 6).x) * rng(), (mvy + circ(rng, 6).y) * rng(),
          175, { r: 0, g: 80, b: 255, a: 100 }, 0.6 + rng() * 1.4);
        if (d) d.noGravity = false;
      }
      break;
    case 1:
      for (let i = 0; i < 40; i++) {
        const c = circ(rng, 20);
        const d = game.spawnDust?.(x + c.x, y + c.y, 1, 1, 43, (mvx + circ(rng, 6).x) * rng(), (mvy + circ(rng, 6).y) * rng(),
          26, hexToRgbArr(orchestraLerpCss('rgb(183,88,25)', 'rgb(255,255,255)', rng() * 0.5)), 1 + rng() * 1.4);
        if (!d) continue;
        d.fadeIn = 1.5;
        if (d.vy > 0 && rng() >= 0.5) d.vy *= -1;
        d.noGravity = true;
      }
      break;
    default: {
      for (let i = 0; i < 30; i++) {
        const c = circ(rng, 20);
        const d = game.spawnDust?.(x + c.x, y + c.y, 1, 1, 43, (mvx + circ(rng, 6).x) * rng(), (mvy + circ(rng, 6).y) * rng(),
          26, hexToRgbArr(orchestraLerpCss(orchestraOurFavoriteColor(), 'rgb(255,255,255)', rng())), 1 + rng() * 1.4);
        if (!d) continue;
        d.fadeIn = 1.5;
        if (d.vy > 0 && rng() >= 0.5) d.vy *= -1;
        d.noGravity = true;
      }
      for (let i = 0; i < 8; i++) {
        const c = circ(rng, 15, 30);
        game.spawnParticles?.(x + c.x, y + c.y * 0.5, '#EFEFBF', 1, 1.2,
          { life: 36, vx: circ(rng, 1).x * 0.5, vy: -(1 + rng()), grav: 0.12, size: 1.6 });
      }
      break;
    }
  }
}

/** 主色插值消费桥（d213/d229 等缺省色彩学对拍测试用导出面） */
export { orchestraLerpCss as orchestraLerp };

/**
 * Spawn_LeafCrystalPassive（:3104-3128）：叶绿晶叶驻留三臂绿弧（life 90、FadeInEnd 10、
 * speed 0）。producer 归叶绿 SetBonus 代理弹体域（错峰约定）;编排视觉+消费派发本批在位。
 */
export function chlorophyteLeafCrystalPassiveFx(
  game: GameHooks, x: number, y: number, rng: Rng = Math.random,
): void {
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    const a = phase + Math.PI * 2 * (i / 3);
    void a;
    game.spawnParticles?.(x, y, fc(0.3, 0.6, 0.3, 0.5), 1, 4,
      { life: 90, vx: 0, vy: 0, damp: 1, grav: 0, size: 2.2 });
  }
}

/**
 * Spawn_LeafCrystalShot 尾尘近似色桥（hsl(uniqueInfo/255) 与 Gold 按 R/255×0.5 Lerp）
 * ——叶绿代理弹体已自带轨迹 streak 视觉,本函数供派发面/测试对拍（真值 color 公式）。
 */
export function leafCrystalShotTint(uniqueHueByte: number): string {
  const base = hexToRgbArr(orchestraHslCss(((uniqueHueByte & 0xff) / 255), 1, 0.5));
  const col = orchestraLerpRgb(base, { r: 255, g: 215, b: 0 }, (base.r / 255) * 0.5);
  return `rgb(${col.r},${col.g},${col.b})`;
}

/**
 * Spawn_CattivaHit（:3765-3796）：捣蛋猫命中金橙六芒簇（scale.X×4 长条拉伸近似档、寿命 16t）。
 * 生产者 Projectile.SpawnHitVisuals type1093/1112 + P.cs:52194 挖掘镐力面（BroadcastOrRequest）。
 */
export function cattivaHitFx(game: GameHooks, x: number, y: number, _moveX = 0, _moveY = 0, rng: Rng = Math.random): void {
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 2 * (i / 6) + phase + (rng() * 2 - 1) * 0.25;
    const spd = 4.5 * 0.7;
    const col = rng() >= 0.5 ? orchestraLerpCss('rgb(255,215,0)', 'rgb(255,165,0)', rng())
      : orchestraLerpCss('rgb(255,255,255)', 'rgb(255,165,0)', rng());
    game.spawnParticles?.(x + circ(rng, 6).x * 0.7, y + circ(rng, 6).y * 0.7, col, 1, spd,
      { life: 16, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, damp: 0.95, size: 2.4, grav: 0 });
  }
}

// ==================== RainbowBoulder 族 + BestReforge + SilverBullet + 行进尘束三型 ====================

/**
 * Spawn_RainbowBoulder{1..4,PetBounce} 收编（:1506/:1562/:1589/:1435+pet 分支）：
 *  1 环形虹彩对+d66 环流尘×21 / 2 双星平移 / 3 小环列+d267 双层 / 4|pet 尘环+
 *  movementVector 法向 sparkle 对（14/8×d66、20/10 对;pet 味省音）。
 * 生产者：P.cs:20298(RB1 天基寻宝 clientOnly:true)/TileDrawing :6989(:6996)(RB3/RB2
 * 虹砖 ambience)/:20349 RB4 跃迁(clientOnly:false)放置面/50709 PetBounce——仓内锚
 * 在场性差异见登记。
 */
export function rainbowBoulderFx(
  game: GameHooks, variant: 1 | 2 | 3 | 4 | 'pet', x: number, y: number,
  moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const hslRand = (): string => orchestraHslCss(rng(), 1, 0.5);
  if (variant === 4 || variant === 'pet') {
    const pet = variant === 'pet';
    if (!pet) game.playSfxWav?.('rainbow_boulder', 1, x, y);
    const countD = pet ? 8 : 14;
    for (let i = 0; i < countD; i++) {
      const c = circ(rng, 30);
      const d = game.spawnDust?.(x + c.x, y + c.y, 1, 1, 66, 0, 0, 100, hexToRgbArr(hslRand()), pet ? 1.2 : 1.7);
      if (!d) continue;
      d.vx *= pet ? 2 : 3;
      d.vy *= pet ? 2 : 3;
      d.noGravity = true;
    }
    const ribbons = pet ? 10 : 20;
    const rotN = Math.atan2(moveY, moveX) + Math.PI / 2;
    for (let r = 0; r < ribbons; r++) {
      void r;
      const lifeT = ((rng() * 20) | 0) + 20;
      game.spawnParticles?.(x + circ(rng, pet ? 6 : 10).x, y + circ(rng, pet ? 6 : 10).y,
        hslRand(), 1, 1, { life: lifeT, vx: Math.cos(rotN), vy: Math.sin(rotN), damp: 1, grav: 0, size: 1.7 });
      game.spawnParticles?.(x, y, 'rgba(255,255,255,0.4)', 1, 1,
        { life: lifeT, vx: -Math.sin(rotN), vy: Math.cos(rotN), damp: 1, grav: 0, size: 0.85 });
    }
    return;
  }
  if (variant === 2) {
    game.spawnParticles?.(x, y, hslRand(), 1, Math.hypot(moveX, moveY),
      { life: 25, vx: moveX, vy: moveY, damp: 1, grav: 0, size: 2 });
    game.spawnParticles?.(x, y, 'rgba(255,255,255,0.12)', 1, Math.hypot(moveX, moveY),
      { life: 25, vx: moveX, vy: moveY, damp: 1, grav: 0, size: 1 });
    return;
  }
  if (variant === 1) {
    const phase = rng() * Math.PI * 2;
    const arms = 6 + ((rng() * 7) | 0);                  // Next(7)
    for (let i = 0; i < arms; i++) {
      const a = phase + Math.PI * 2 * (i / arms);
      game.spawnParticles?.(x + Math.cos(a) * 4.8, y + Math.sin(a) * 4.8,
        orchestraHslCss((i / arms + rng()) % 1, 1, 0.5), 1, 1.5,
        { life: 200, vx: 0, vy: -1.5, damp: 0.995, grav: 0, size: 2 });
      game.spawnParticles?.(x, y, 'rgba(255,255,255,0.35)', 1, 1,
        { life: 200, vx: 0, vy: -1.5, damp: 0.995, grav: 0, size: 0.6 });
    }
    for (let i = 0; i < 21; i++) {                       // d66 环流尘（:1547-1559）
      let dvyRaw = (rng() * 2 - 1);
      dvyRaw = dvyRaw > 0 ? -dvyRaw : dvyRaw;
      const sp = 8 + 2 * rng();
      const ang = rng() * Math.PI * 2;
      const d = game.spawnDust?.(x, y, 16, 16, 66, Math.cos(ang) * sp, Math.sin(ang) * sp * dvyRaw, 100, hexToRgbArr(hslRand()), 1.7);
      if (d) {
        d.noGravity = true;
        d.fadeIn = 1 + rng();
        d.vx = 0;
        if (d.vy > 0) d.vy *= -1;
        d.x -= d.vx * 5; d.y -= d.vy * 5;
      }
    }
    return;
  }
  // variant 3（:1589-1652）
  const phase = rng() * Math.PI * 2;
  const spinA = (Math.PI / 2) * (((rng() * 2) | 0) * 2 - 1);
  const arms = 3 + ((rng() * 7) | 0);
  for (let i = 0; i < arms; i++) {
    const a = phase + Math.PI * 2 * (i / arms);
    const sz = (rng() * 0.2 + 0.3) * 0.8 * (0.3 + 1.5 * rng());
    const ringR = 14 - arms + rng() * 3;
    const px = x + Math.cos(a) * ringR, py = y + Math.sin(a) * ringR;
    const jr = moveX * (rng() * 2 - 1) * 0.15;
    const jd = moveY * (rng() * 2 - 1) * 0.15;
    const baseVx = Math.cos(a) * sz, baseVy = Math.sin(a) * sz;
    const vx = baseVx * Math.cos(spinA) - baseVy * Math.sin(spinA) + jr;
    const vy = baseVx * Math.sin(spinA) + baseVy * Math.cos(spinA) + jd;
    game.spawnParticles?.(px + vx * 4, py + vy * 4, orchestraHslCss((i / arms + rng()) % 1, 1, 0.5), 1,
      Math.hypot(vx, vy), { life: 90, vx, vy, damp: 0.99, grav: 0, size: 1.6 });
    game.spawnParticles?.(px + vx * 4, py + vy * 4, 'rgba(255,255,255,0.35)', 1, Math.hypot(vx, vy),
      { life: 90, vx, vy, damp: 0.99, grav: 0, size: 0.48 });
  }
  for (let i = 0; i < 4; i++) {                          // d267 双层（:1641-1652）
    const hueC = orchestraHslCss((rng() + rng() * 0.12) % 1, 1, 0.4 + rng() * 0.25);
    const d = game.spawnDust?.(x, y, 1, 1, 267, circ(rng, 1).x + moveX * (rng() * 2 - 1) * 0.5,
      circ(rng, 1).y, 0, hexToRgbArr(hueC), 0.6 + rng() * 0.9);
    if (d) { d.noGravity = true; d.fadeIn = 0.7 + rng() * 0.8; d.noLight = true; d.noLightEmittance = true; }
    game.spawnDust?.(x, y, 1, 1, 267, circ(rng, 1).x, circ(rng, 1).y, 0,
      { r: 255, g: 255, b: 255, a: 255 }, (0.6 + rng() * 0.9) / 2);
  }
}

/**
 * Spawn_BestReforge（:3084-3102）：顶级词缀重铸 Research_Spark 八粒上旋闪点
 * （Circular(3,4) 上半收口 −2Y、重力 .1635/t）。生产者 Main.ReforgeItemInReforgeSlot
 * :42645 top-tier 支（reforge UI 本地直驱=clientOnly:true）。
 */
export function bestReforgeFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  for (let i = 0; i < 8; i++) {
    const c = circ(rng, 3, 4);
    const vy = (c.y > 0 ? -c.y : c.y) - 2;
    game.spawnParticles?.(x + circ(rng, 16).x, y + circ(rng, 16).y, '#FFE98A', 1, 1,
      { life: 60, vx: c.x, vy, grav: 0.1635, damp: 0.995, size: 1.1 });
  }
}

/**
 * Spawn_SilverBulletSparkle（:3278-3300）：银箭白炽单粒 streak（FadeInEnd 10/
 * FadeOutStart 20/FadeOutEnd 30 特档、accel=−movementVector/30）。
 * 生产者 P.cs:71888(SeraphNecklaced 飞行体)/77659 弹981 贴块段（clientOnly:true）。
 */
export function silverBulletSparkleFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const sz = rng() * 0.2 + 0.4;
  game.spawnParticles?.(x + circ(rng, 4).x * sz, y + circ(rng, 4).y * sz,
    'rgba(255,255,255,0.85)', 1, Math.hypot(moveX, moveY),
    { life: 30, vx: moveX, vy: moveY, damp: 1, grav: 0, size: 2 * sz });
}

/** Spawn_UFOLaser（:1956-1963）：d160 LimeGreen/CornflowerBlue 二选一双层行进尘 */
export function ufoLaserTrailFx(
  game: GameHooks, bx: number, by: number, px: number, py: number, uniqueInfo: number, rng: Rng = Math.random,
): void {
  orchestraLineWalk(bx, by, px, py, uniqueInfo, (dx, dy, nx, ny) => {
    for (const back of [0, 0.25]) {
      const col = rng() < 0.5 ? 'rgb(50,205,50)' : 'rgb(100,149,237)';
      spawnSingleLineDust(game, 160, dx - nx * back, dy - ny * back, col, rng);
    }
  });
}

/** Spawn_MagnetSphereBolt（:1965-1974）：磁球闪电行进尘（d160 缺省色,4 层回拖） */
export function magnetSphereBoltTrailFx(
  game: GameHooks, bx: number, by: number, px: number, py: number, uniqueInfo: number, rng: Rng = Math.random,
): void {
  orchestraLineWalk(bx, by, px, py, uniqueInfo, (dx, dy, nx, ny) => {
    for (const back of [0, 0.25, 0.5, 0.75]) {
      spawnSingleLineDust(game, 160, dx - nx * back, dy - ny * back, null, rng);
    }
  });
}

/** Spawn_HeatRay（:1976-1985）：热射线行进尘（d162 缺省色,4 层回拖） */
export function heatRayTrailFx(
  game: GameHooks, bx: number, by: number, px: number, py: number, uniqueInfo: number, rng: Rng = Math.random,
): void {
  orchestraLineWalk(bx, by, px, py, uniqueInfo, (dx, dy, nx, ny) => {
    for (const back of [0, 0.25, 0.5, 0.75]) {
      spawnSingleLineDust(game, 162, dx - nx * back, dy - ny * back, null, rng);
    }
  });
}

/** SpawnHelper_SpawnSingleLineDust(:2065-2074)：scale=rand(70..110)×0.013、velocity×0.2 */
export function spawnSingleLineDust(
  game: GameHooks, type: number, x: number, y: number, color: string | null, rng: Rng = Math.random,
): void {
  const d = game.spawnDust?.(x, y, 1, 1, type, 0, 0, 0, color ? hexToRgbArr(color) : null,
    (((rng() * 40) | 0) + 70) * 0.013);
  if (d) { d.x = x; d.y = y; d.vx *= 0.2; d.vy *= 0.2; }
}

// ==================== 环境杂件（ItemTransfer/PooFly/Dungeon/Heroicis/Voice/Nature/Lake/Snapping 环带/充能/HarpyCharm 家族） ====================

/**
 * Spawn_ItemTransfer（:2682-2703）＝ Chest.VisualizeChestTransfer（Chest.cs:309-317）
 * 入箱飞行件。uniqueInfo 低24位=itemType、高字节 bits{RandomizeStart,...}。本仓以
 * "金闪→终点吸入"双段近似 ItemTransferParticle 图标位移动画（图标贴图池无 API 登记）。
 * 生产者 = QuickStackToNearbyChests 包装位（BroadcastOrRequest 面）。
 */
export function itemTransferFx(
  game: GameHooks, sx: number, sy: number, ex: number, ey: number,
  itemTypeVid: number, flagsByte = 0, rng: Rng = Math.random,
): void {
  void itemTypeVid;                                     // ContentSamples.ItemsByType[type] 门——调用侧保证非 air
  const dxs = ex - sx, dys = ey - sy;
  const life = 60;
  if ((flagsByte & 0x01) !== 0) {
    game.spawnParticles?.(sx + circ(rng, 8).x, sy + circ(rng, 8).y, '#FFF3B0', 1, 2,
      { life: life - 10, vx: circ(rng, 24).x, vy: circ(rng, 24).y, damp: 0.94, grav: -0.02, size: 1.3 });
  }
  game.spawnParticles?.(sx, sy, '#FFE98A', 1, 1,
    { life, vx: dxs / life, vy: dys / life, damp: 1, grav: 0, size: 1.5 });
}

/**
 * Spawn_PooFly（:2326-2336）：便便史莱姆身周飞虫环境粒（寿命 300、50/400 密度门简化恒生）。
 * 生产者 NPC.cs:61457（ai1==5395 命名态每 30 掷一粒,clientOnly:true）;粪砖 ambience 面无通道登记。
 */
export function pooFlyFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  game.spawnParticles?.(x, y, 'rgba(140,110,80,0.9)', 1, 0.6,
    { life: 300, vx: circ(rng, 0.4).x, vy: circ(rng, 0.4).y, damp: 0.99, size: 0.7 });
}

/**
 * Spawn_InScreenDungeonSpawn（:882-896）：双地牢种子带层内怪出生纸屑爆（gore61-63×2..4）
 * + npcType 直播 HitSound（本仓以 hitSfx 名注入,缺省静默登记）。
 * 生产者 NPC.NewNPC :5267（dualDungeonsSeed && 地下带,BroadcastOrRequest,MovementVector=(w,h)）。
 */
export function inScreenDungeonSpawnFx(
  game: GameHooks, x: number, y: number, w: number, h: number, _npcType: number,
  hitSfx: string | null, rng: Rng = Math.random,
): void {
  const n = ((rng() * 3) | 0) + 2;                       // Next(2,5)
  for (let i = 0; i < n; i++) {
    const jx = circ(rng, w, h * (0.5 + rng() * 0.5));
    game.spawnParticles?.(x - 16 + jx.x, y - 16 + jx.y, '#EDEDF2', 1, circ(rng, 2).x,
      { life: 44, vx: circ(rng, 2).x, vy: circ(rng, 2).y, grav: 0.22, damp: 0.99, size: 1.4 });
  }
  if (hitSfx) game.playSfxFiles?.([hitSfx], 1, x, y);
}

/**
 * Spawn_HeroicisSetSpawnSound（:898-901）：英雄套装湿沙出土纯音 SoundID.RainbowBoulder。
 * 生产者 WorldItem.cs:610（沙漠 wet 单堆转化,BroadcastOrRequest）——转化链未移植,消费面在位。
 */
export function heroicisSetSpawnSoundFx(game: GameHooks, x: number, y: number): void {
  game.playSfxWav?.('rainbow_boulder', 1, x, y);
}

/**
 * Spawn_PlayerVoiceOverrideSound（:2870-2885）：远端玩家受击变声播报——原版收端临时置
 * voiceOverride(sbyte)后 PlayHurtSound。仓内无 per-player 变声样本：按 PlaySound 锚直译为主受击音；
 * voiceOverride 状态字未建模登记。生产者 Player.cs:45813 clientOnly:false。
 */
export function playerVoiceOverrideSoundFx(
  game: GameHooks, _invokerSlot: number, x: number, y: number, _voiceOverrideByte = 0,
): void {
  game.playSfxAt?.('hurt', x, y);
}

/** Spawn_NatureFly（:1323-1334）：森林花虻（hsl ≤.14/α170、寿命 180-300）。生产者
 * TileDrawing.cs:7017 clientOnly:true——tile-ambient 通道未建,消费面+直驱保留登记。 */
export function natureFlyFx(game: GameHooks, x: number, y: number, rng: Rng = Math.random): void {
  const rgb = hexToRgbArr(orchestraHslCss(rng() * 0.14, 0.1 + 0.6 * rng(), 0.3 + 0.3 * rng()));
  game.spawnParticles?.(x, y, `rgba(${rgb.r},${rgb.g},${rgb.b},0.67)`, 1, 0.5,
    { life: 180 + ((rng() * 121) | 0), vx: circ(rng, 0.5).x, vy: circ(rng, 0.5).y, damp: 0.995, size: 0.55 });
}

/**
 * Spawn_LakeSparkle（:1336-1353）：湖面闪光星（star0 BehindPlayers、寿命 50-140、旋转速度被
 * movementVector 长度钳制缩放、scale .5-1）。FakeFish 族统一收编迁移面（评估结论=迁入统一池;
 * FakeFishJump 保持局部——跃态需池内密度门,详见 syncModules 注）。
 */
export function lakeSparkleFx(
  game: GameHooks, x: number, y: number, moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  game.spawnParticles?.(x, y, `rgba(255,255,255,${rng().toFixed(2)})`, 1, 0,
    { life: 50 + ((rng() * 91) | 0), vx: moveX, vy: moveY, damp: 1, grav: 0, size: 1 + rng() });
}

/**
 * 拍击石系三味 Spawn_ 环带段（:593/:649/:734）——SnapStrike 尘链外补 FadingParticle/
 * PrettySparkle 环带与三味音（Item72 vol1/PyroclasticStone vol.5/ArmletOfRuin vol.5）:
 * kind0 Stone：2× 圈起（motionScale=min(X/256,.12)、Delay=Y×3 无延迟通道登记）;
 * kind1 Melee：红/金两向 sparkles（bolt 相位 ±0.05τ）+ d6 成对微尘;
 * kind2 Summon：proj1132 圈起×2+d172×15/d211×8 圆阵（1/6 重力回落 scale×.25）。
 */
export function snappingStoneRingFx(
  game: GameHooks, kind: 0 | 1 | 2, x: number, y: number, motionScale: number, delayTicks = 0, rng: Rng = Math.random,
): void {
  if (kind === 0) {
    const ms = Math.min(0.12, motionScale);
    game.playSfxWav?.('Item_72', 1, x, y);
    for (let i = 0; i < 2; i++) {
      game.spawnParticles?.(x, y, 'rgba(30,180,255,0)', 1, 0,
        { life: 20, vx: 0, vy: 0, damp: 1, grav: 0, size: 6 * ms });
    }
    void delayTicks;                                     // FadingParticle.Delay 档无延迟通道登记
    return;
  }
  if (kind === 1) {
    game.playSfxWav?.('pyroclastic_stone', 0.5, x, y);
    const boltPhase = (rng() * 2 - 1) * Math.PI * 2 * 0.05;
    const spd = 14;
    for (const red of [true, false]) {
      const a0 = Math.PI / 4 + (red ? Math.PI / 4 : Math.PI / 2) + boltPhase;
      const col = red ? 'rgba(255,40,20,0.5)' : 'rgba(255,242,0,1)';
      game.spawnParticles?.(x - Math.cos(a0) * spd * 30 * 0.15, y - Math.sin(a0) * spd * 30 * 0.15,
        col, 1, spd, { life: 30, vx: Math.cos(a0) * spd, vy: Math.sin(a0) * spd, damp: 0.97, size: red ? 11 : 7 });
      for (const side of [-1, 1]) {                      // d6 微尘对（:715-732）
        const ja = side * (rng() * 2 - 1) * Math.PI * 2 * 0.025;
        const dvx = spd * Math.cos(a0 + ja) * rng();
        const dvy = spd * Math.sin(a0 + ja) * rng();
        const d = game.spawnDust?.(x, y, 1, 1, 6, dvx, dvy, 0, null, 1.4);
        if (d) d.noGravity = true;
      }
    }
    return;
  }
  game.playSfxWav?.('armlet_of_ruin', 0.5, x, y);
  for (let i = 0; i < 2; i++) {
    game.spawnParticles?.(x, y, 'rgba(90,110,255,0.35)', 1, 0,
      { life: 20, vx: 0, vy: 0, damp: 1, grav: 0, size: 9 * Math.min(0.12, motionScale) });
  }
  for (const [type, n] of [[172, 15], [211, 8]] as Array<[number, number]>) {   // :771-797
    for (let k = 0; k < n; k++) {
      const sp = circ(rng, 10);
      const d = game.spawnDust?.(x, y, 1, 1, type, sp.x, sp.y, 0, null,
        Math.max(0.75, 20 * Math.min(0.12, motionScale)));
      if (!d) continue;
      d.noGravity = true;
      if (rng() < 1 / 6) { d.noGravity = false; d.scale *= 0.25; }
    }
  }
}

/**
 * 充能三连收编（Player.Update_SnappingStone :28607/:28612/:28617 → Spawn_*Recharge
 * :454/:437/:418）：snapping=226×10 α255 pull/pyroclastic=6×15 Circular(2,4)/
 * armlet=15×10 α60 pull,全档 noLight/noGravity/noLightEmittance/followPlayer。
 */
export function snappingStoneRechargeFx(
  game: GameHooks, kind: 0 | 1 | 2, px: number, py: number, pw: number, ph: number, rng: Rng = Math.random,
): void {
  void rng;
  const cfg = kind === 0 ? { dust: 226, count: 10, alpha: 255, scale: 0.9, pull: true }
    : kind === 1 ? { dust: 6, count: 15, alpha: 255, scale: 1.5, pull: false }
      : { dust: 15, count: 10, alpha: 60, scale: 0.9, pull: true };
  for (let i = 0; i < cfg.count; i++) {
    const d = game.spawnDust?.(px, py, pw, ph, cfg.dust, 0, 0, cfg.alpha, null, cfg.scale);
    if (!d) continue;
    d.noLight = true;
    d.noGravity = true;
    d.scale = cfg.scale;
    d.fadeIn = 1.1;
    d.y = py + ph / 2;
    if (cfg.pull) {
      d.vx *= 0.5;
      d.vy *= 3;
    } else {
      d.vx = (Math.random() * 2 - 1) * 2;
      d.vy = (Math.random() * 2 - 1) * 4;
    }
    d.alpha = cfg.alpha;
    d.followPlayer = true;
    d.noLightEmittance = true;
  }
}

/**
 * Spawn_HarpyCharm 三味同体（:472-591）：弧线引矢家族（HarpyCharm 6166/PhoenixQuiver
 * 6181/SeraphNecklace 6180）。FadingParticle 外抛 RotatedByRandom(τ)×NextFloat×0.25×num4
 * 组 4(+2)/内环 ±0.314×1×num4 组 3(+2)+单粒 PrettySparkle 十字
 * （蓝 hsl(.65,1,.5)/红(242,42,0,20)/金(249,225,102,255)分味）;音 Item39/Item20。
 * 生产者 Projectile.ApplyHarpyCharm :58802 clientOnly:false。
 */
export function harpyCharmFamilyFx(
  game: GameHooks, itemVid: number, x: number, y: number,
  moveX = 0, moveY = 0, rng: Rng = Math.random,
): void {
  const phoenix = itemVid === 6181;
  const seraph = itemVid === 6180;
  const up = phoenix || seraph ? 2 : 1;
  if (phoenix) game.playSfxWav?.('Item_20', 1, x, y);
  else game.playSfxWav?.('Item_39', 1, x, y);
  const life = 30;
  for (let i = 0; i < 4 * up; i++) {
    const ja = (rng() * 2 - 1) * Math.PI;
    const bx = moveX * Math.cos(ja) - moveY * Math.sin(ja);
    const by = moveX * Math.sin(ja) + moveY * Math.cos(ja);
    const spd = rng() * 0.25 * up;
    game.spawnParticles?.(x, y, 'rgba(255,255,255,0.75)', 1, Math.hypot(bx, by) * spd,
      { life, vx: bx * spd, vy: by * spd, damp: 1, grav: 0, size: 1.5 });
  }
  for (let i = 0; i < 3 * up; i++) {
    const ja = (rng() * 2 - 1) * 0.314;
    const bx = moveX * Math.cos(ja) - moveY * Math.sin(ja);
    const by = moveX * Math.sin(ja) + moveY * Math.cos(ja);
    const spd = rng() * up;
    game.spawnParticles?.(x, y, 'rgba(255,236,200,0.85)', 1, Math.hypot(bx, by) * spd,
      { life, vx: bx * spd, vy: by * spd, damp: 1, grav: 0, size: 1.5 });
  }
  {
    const lifeT = ((rng() * 20) | 0) + 20;               // Next(20,40)
    const col = phoenix ? 'rgba(242,42,0,0.08)' : seraph ? 'rgba(249,225,102,1)'
      : orchestraHslCss(0.65, 1, 0.5);
    const k = phoenix || seraph ? 0.3 : 1;
    game.spawnParticles?.(x, y, col, 1, Math.hypot(moveX, moveY) * k,
      { life: lifeT, vx: moveX * k, vy: moveY * k, damp: 1, grav: 0, size: 3.2 });
  }
}
