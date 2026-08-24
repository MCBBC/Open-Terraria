import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';

// 小动物 AI 全家族 1:1 回归（aiStyle 1/7/16/64/65/66/67/68/112/114/115/116/118）
function critterWorld(playerAt: { x: number; y: number } | null, opts: { water?: boolean } = {}) {
  // ★高度 140（原 80）：StepUp/WetCollision/DrownCollision 均带 maxTilesY−40 世界底
  // 钳（Collision.cs:1505/:3661/:1392 原版 1200+ 世界永不可见）——80 高测试世界把
  // 40 行以下全屏蔽（StepUp 不抬=兔子卡台阶脸、wet 恒 false=水生族全瘫），
  // 抬高后地板 60 行落在钳内（2026-08-19 1:1 修正批发现）
  const w = new World(80, 140, 42, 'open');
  w.groundLevel = 42; // 真实世界由生成期赋值；测试默认 0 会让"地下"判定恒真
  const st = w.store;
  for (let x = 10; x <= 70; x++) st.setTileSilent(x, 60, 2); // 地板 y=60
  if (opts.water) {
    // y 45-59 注水（水面在 45）
    for (let x = 20; x <= 60; x++) for (let y = 45; y <= 59; y++) st.setLiquid(x, y, 255, 1);
  }
  const hooks = {
    world: w,
    player: playerAt ? {
      x: playerAt.x * 16, y: playerAt.y * 16, w: 20, h: 42,
      cx: playerAt.x * 16, cy: playerAt.y * 16 + 21,
      dead: false, useTime: 0,
    } : null,
    playSfx: () => {}, addDamageNumber: () => {}, spawnParticles: () => {},
    spawnDrop: () => null, damagePlayer: () => {},
    entities: { add: () => {} },
    enemies: () => [] as unknown[],
  } as never;
  return { w, hooks };
}

describe('小动物 AI 家族', () => {
  // 2026-08-19 1:1 修正（cs:54471-54626 台阶跳档重做）：探测行 = 脚上一行 num27
  // 语义 + 沉入 >20 门——1 格台阶【不触发跳档】（t4=num27−1 才是 1 格墙；t3 档被
  // 沉入门拦下），由 Collision.StepUp 无声踏上。旧断言"1 格台阶自动跳"已按新语义
  // 改为"踏上不跳"。
  it('兔 46（aiStyle 7）：站/走循环 + 1 格台阶 StepUp 踏上（跳档三档只对 1/2 格墙）', () => {
    const { w, hooks } = critterWorld(null);
    w.store.setTileSilent(45, 59, 2); // 两侧各放台阶，任意方向踱步都会撞上
    w.store.setTileSilent(35, 59, 2);
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let walked = false, jumped = false, steppedUp = false;
    for (let t = 0; t < 3000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (Math.abs(e.vx) > 0.2) walked = true;
      if (e.vy < -1) jumped = true;
      if (e.y + e.h <= 59 * 16 + 0.01) steppedUp = true;   // 双脚站上台阶顶（59 行）
    }
    expect(walked).toBe(true);
    expect(steppedUp).toBe(true);   // StepUp（NPC.cs:54382）无声踏上
    expect(jumped).toBe(false);     // 1 格台阶不进跳档（沉入门 16>20 不过）
  });

  it('兔 46（aiStyle 7）：2 格墙 → 跳档 vy=−5×1.2（TownCritter 补偿，cs:54545-54561/:54623-54626）', () => {
    const { w, hooks } = critterWorld(null);
    // 前方 2 格高墙（行 58-59 两块叠起）——num27=脚上一行语义下 t4(58) 实心 → 1 格墙档 −5
    for (let y = 58; y <= 59; y++) w.store.setTileSilent(45, y, 2);
    const e = Enemy.fromVanilla(46, 40 * 16, 59 * 16)!;
    let jumpVy = 0;
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vy < jumpVy) jumpVy = e.vy;
    }
    // −5（1 格墙档）× 1.2（TownCritter 补偿，非湿身无 wet 档）= −6，跳起当 tick
    // 末加 ENEMY_GRAVITY 0.3（NPC.cs:91997 gravity=0.3f，非玩家 GRAVITY 0.4）
    // → 采样值 −5.7（旧注释 0.4→−5.6 为 2026-08-20 重力换正前遗留）
    expect(jumpVy).toBeLessThanOrEqual(-5.5);
    expect(jumpVy).toBeCloseTo(-5.7, 5);
  });

  it('蚱蜢 377（aiStyle 1）：跳 machine 平静态照跑（R6-B 2-3，1457 :62135 门只看落地）；激愤才索敌转向', () => {
    const far = critterWorld({ x: 70, y: 40 });
    const e = Enemy.fromVanilla(377, 40 * 16, 59 * 16)!;
    let jumped = false;
    for (let t = 0; t < 600; t++) {
      e.fixedUpdate(1 / 60, far.hooks);
      if (e.vy < -1) { jumped = true; break; }
    }
    // 1457 :62135 贴地门不含 flag3——平静蚱蜢原地蹦跳（flag3 只关 TargetClosest
    // :62245 与激愤逃跳反转 :62305；曾自造"0.2 慢爬不进跳循环"档）
    expect(jumped).toBe(true);
    const near = critterWorld({ x: 41, y: 58 });
    const e2 = Enemy.fromVanilla(377, 40 * 16, 59 * 16)!;
    let hopped = false;
    for (let t = 0; t < 300; t++) {
      e2.fixedUpdate(1 / 60, near.hooks);
      if (e2.vy < -1) { hopped = true; break; }
    }
    expect(hopped).toBe(true);
  });

  it('萤火虫 355（aiStyle 64）：无重力漂移不坠落', () => {
    const { hooks } = critterWorld(null);
    // 种子 PRNG:AI_064 是随机游走(Math.random),无种子时 200tick 漂移量随骰
    // 波动(最坏 ~200px)——硬位置阈值天生 flaky;固定种子使断言确定性
    let seed = 12345;
    const realRandom = Math.random;
    Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
    try {
      const e = Enemy.fromVanilla(355, 40 * 16, 50 * 16)!;
      for (let t = 0; t < 200; t++) e.fixedUpdate(1 / 60, hooks);
      expect(e.cy).toBeLessThan(59 * 16); // 仍悬空
    } finally {
      Math.random = realRandom;
    }
  });

  it('蝴蝶 356（aiStyle 65）：垂直避障——贴地出生被弹起（洞穴内无上方干扰）', () => {
    const { w, hooks } = critterWorld(null);
    for (let x = 20; x <= 60; x++) w.store.setTileSilent(x, 30, 2); // 顶棚（30 格内 → aboveClear 不触发）
    // AI_065 漂移目标重选用 Math.random——不种子化则随机游走方向随机，
    // "150tick 后必须上飘"的硬阈值天生 flaky（同萤火虫 355 案）
    let seed = 54321;
    const realRandom = Math.random;
    Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
    try {
      const e = Enemy.fromVanilla(356, 40 * 16, 58 * 16)!; // 地板上方 2 格（下 4 格内有实心）
      for (let t = 0; t < 150; t++) e.fixedUpdate(1 / 60, hooks);
      expect(e.cy).toBeLessThan(58 * 16); // belowSolid 反向 → 上飘离开地面
    } finally {
      Math.random = realRandom;
    }
  });

  it('蠕虫 357（aiStyle 66）：静止/蠕动循环、蠕动速度 0.2', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(357, 40 * 16, 59 * 16)!;
    let crawled = false;
    for (let t = 0; t < 2000; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.ai0 === 1) { crawled = true; break; }
    }
    expect(crawled).toBe(true);
  });

  it('松露虫 374：玩家 160px 内 90t → 钻地变身 375', () => {
    const { hooks } = critterWorld({ x: 41, y: 58 });
    const e = Enemy.fromVanilla(374, 40 * 16, 59 * 16)!;
    let transformed = false;
    for (let t = 0; t < 200; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 375) { transformed = true; break; }
    }
    expect(transformed).toBe(true);
  });

  // 2026-08-19 1:1 修正（AI_067 cs:34586-34860 结构重做）：脱墙（无 collideX/Y）超 5t
  // → ai[2]=2 惊扰下落态（重力落地）——空中出生的蜗牛【会】下落（原版语义），
  // 落地后回贴墙爬（不再沉地）。旧断言"空中出生不落"按新语义改为"落地停在地面上"。
  it('蜗牛 359（aiStyle 67）：脱墙惊扰下落 → 落地贴地爬行不沉地（cs:34646-34666）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(359, 40 * 16, 57 * 16)!;
    let minX = e.x, maxX = e.x;
    for (let t = 0; t < 200; t++) {
      e.fixedUpdate(1 / 60, hooks);
      minX = Math.min(minX, e.x);
      maxX = Math.max(maxX, e.x);
    }
    // 落地（脚贴 60 行地面顶面）且不穿透：底边 = 60×16
    expect(e.y + e.h).toBeCloseTo(60 * 16, 0);
    expect(e.y + e.h).toBeLessThan(60 * 16 + 1);   // 未沉入地面
    // 落地后回贴墙态沿地爬行（0.3/t，200t 内有横向位移）
    expect(maxX - minX).toBeGreaterThan(4);
  });

  it('鸭飞形 363（aiStyle 68）：飞行 300t 落地 → 变回行走形 362', () => {
    const { hooks } = critterWorld({ x: 60, y: 40 });
    const e = Enemy.fromVanilla(363, 40 * 16, 59 * 16)!;
    e.y = 60 * 16 - e.h;  // 贴地（飞行中贴障悬停不主动落地，落地才回行走形）
    e.vy = 1;             // 确保本 tick 碰地建立 onGround
    e.ai0 = 1;            // 飞行态（0=游泳/陆行）
    e.ai1 = 320;          // 飞行计时已满
    let back = false;
    for (let t = 0; t < 30; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.vanillaId === 362) { back = true; break; }
    }
    expect(back).toBe(true);
  });

  it('蜻蜓 599（aiStyle 114）：绕锚点悬停/突进，不远离锚点太远', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(599, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 600; t++) e.fixedUpdate(1 / 60, hooks);
    expect(Math.hypot(e.cx - 40 * 16, e.cy - 50 * 16)).toBeLessThan(200); // 锚点约束
  });

  it('瓢虫 604（aiStyle 115）：飞/陆双态切换', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(604, 40 * 16, 50 * 16)!;
    for (let t = 0; t < 300; t++) e.fixedUpdate(1 / 60, hooks);
    expect([0, 1]).toContain(e.ai2); // 状态域合法（0 飞/1 陆）
    expect(e.cy).toBeLessThan(60 * 16); // 不沉底
  });

  it('水黾 612（aiStyle 116）：水面附近悬停不沉底', () => {
    const { hooks } = critterWorld(null, { water: true });
    const e = Enemy.fromVanilla(612, 40 * 16, 46 * 16)!;
    for (let t = 0; t < 300; t++) e.fixedUpdate(1 / 60, hooks);
    expect(e.cy).toBeLessThan(59 * 16); // 没有沉到水底
  });

  // 2026-08-19 1:1 修正（AI_118 cs:47432-47486）：出生 ai[0]=0（角 0 朝东）——首个
  // 推进脉冲【确定性向东】（+0.06/t 直到 |v|>3 掷随机角 450-600 计时）。无边界水池
  // 会把海马直送出池搁浅（原版同语义）。反射（:47470-47485）为角向量分量取反，
  // 反弹后航向随 t50 随机角而变（原版盲翻）——逃逸方向不作断言，另以直调单测验角反射。
  it('海马 626（aiStyle 118）：水中悬浮 + 东向首脉冲抵墙（cs:47432-47463）', () => {
    const { w, hooks } = critterWorld(null, { water: true });
    for (let y = 45; y <= 60; y++) { w.store.setTileSilent(19, y, 2); w.store.setTileSilent(61, y, 2); }
    const e = Enemy.fromVanilla(626, 58 * 16, 50 * 16)!;   // 贴东墙出生（首脉冲 ~40px 达墙）
    let hitWallX = false, maxCyEarly = 0, wetAtPark = false;
    for (let t = 0; t < 200; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.x >= 955) hitWallX = true;          // 首脉冲（角 0 朝东）抵墙
      maxCyEarly = Math.max(maxCyEarly, e.cy);  // 首脉冲纯水平（角 0）→ 无垂直分量
      if (t === 100) wetAtPark = e.wet;         // 贴墙停车时仍在水
    }
    expect(hitWallX).toBe(true);                // 东向首脉冲确实撞墙（x 停在墙脸 960）
    expect(maxCyEarly).toBeLessThan(56 * 16);   // noGravity=wet → 悬浮不坠
    expect(wetAtPark).toBe(true);               // 贴墙停车仍在池内
  });

  it('海马 626 角反射直调：collideX → 角向量 X 取反 + 保速换向（cs:47470-47485）', () => {
    const { hooks } = critterWorld(null, { water: true });
    const e = Enemy.fromVanilla(626, 40 * 16, 50 * 16)!;
    e.wet = true;          // 直调：跳过 npcLiquid 时序（fish-behavior 同款）
    e.ai0 = 0.3;           // 朝东北
    e.vx = 2; e.vy = 1;
    e.hitWall = true;      // 预置 collideX（AI 读上一 tick 旗标）
    e.fixedUpdate(1 / 60, hooks);
    const want = Math.atan2(Math.sin(0.3), -Math.cos(0.3));   // atan2(sinθ, −cosθ)
    expect(e.ai0).toBeCloseTo(want, 5);
    // velocity = 新角向 × 原速率——本 tick 推进先 +0.06（:47450），速率含增量：
    // |v| = hypot(2+0.06cos0.3, 1+0.06sin0.3)
    const spd = Math.hypot(2 + 0.06 * Math.cos(0.3), 1 + 0.06 * Math.sin(0.3));
    expect(e.vx).toBeCloseTo(Math.cos(want) * spd, 5);
    expect(e.vy).toBeCloseTo(Math.sin(want) * spd, 5);
  });

  it('金鱼 55（aiStyle 16）：路由到 AI_016 游泳（水中活动）', () => {
    const { hooks } = critterWorld({ x: 42, y: 50 }, { water: true });
    const e = Enemy.fromVanilla(55, 40 * 16, 50 * 16)!;
    let moved = false;
    for (let t = 0; t < 300; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (Math.abs(e.vx) + Math.abs(e.vy) > 0.3) { moved = true; break; }
    }
    expect(moved).toBe(true);
  });

  it('萤火虫 355（cs:34412）：地下闪烁发光（间隔 30-180 → 亮 10-30 帧，绿黄色表）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(355, 40 * 16, 58 * 16)!; // y=58 > worldSurface(42)+10 → 地下常亮档
    let glowed = false;
    let color: [number, number, number] | null = null;
    for (let t = 0; t < 400 && !glowed; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.lightRGB) { glowed = true; color = e.lightRGB; }
    }
    expect(glowed).toBe(true);
    expect(color![0]).toBeCloseTo(0.1095 * e.ai3, 4); // 绿黄 (0.1095,0.15,0.0615)×scale
    expect(color![2]).toBeCloseTo(0.0615 * e.ai3, 4);
  });

  it('萤火虫 355：白天地表不发光（cs:34416 !dayTime 门）', () => {
    const { w, hooks } = critterWorld(null);
    expect(w.clock.isDay).toBe(true); // 起始 0.3 白天
    const e = Enemy.fromVanilla(355, 40 * 16, 20 * 16)!; // 地表（观察窗内漂移不会越过地下线 52 格）
    for (let t = 0; t < 100; t++) {
      e.fixedUpdate(1 / 60, hooks);
      expect(e.lightRGB).toBeNull();
    }
  });

  it('闪电虫 358：紫蓝色表（0.10125/0.21375/0.225 ×scale）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(358, 40 * 16, 58 * 16)!;
    let color: [number, number, number] | null = null;
    for (let t = 0; t < 400 && !color; t++) {
      e.fixedUpdate(1 / 60, hooks);
      if (e.lightRGB) color = e.lightRGB;
    }
    expect(color).not.toBeNull();
    expect(color![1]).toBeCloseTo(0.21375 * e.ai3, 4);
  });

  it('发光蜗牛 360：恒定蓝光 (0.1,0.2,0.7)（cs:34625）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(360, 40 * 16, 50 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.lightRGB).toEqual([0.1, 0.2, 0.7]);
  });

  it('熔岩蜗牛 655：恒定橙光 (0.6,0.3,0.1)（cs:34628）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(655, 40 * 16, 50 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.lightRGB).toEqual([0.6, 0.3, 0.1]);
  });

  it('魔化夜爬虫 484：抖动紫光（cs:34492-34497）', () => {
    const { hooks } = critterWorld(null);
    const e = Enemy.fromVanilla(484, 40 * 16, 59 * 16)!;
    e.fixedUpdate(1 / 60, hooks);
    expect(e.lightRGB).not.toBeNull();
    expect(e.lightRGB![0]).toBeGreaterThan(e.lightRGB![1]); // 紫光 r>g 通道关系
    // num1047 = Next(90,111)×0.01 × (essScale+0.5)/2——essScale 三角波 0.7↔1.0
    // （Main.cs:61703-61713），系数上限 0.75（曾误用恒 0.5 近似钉死过小上界）
    expect(e.lightRGB![0]).toBeLessThanOrEqual(0.3 * 1.11 * 0.75 + 1e-9);
  });
});
