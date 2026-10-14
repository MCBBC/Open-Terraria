// 自然粒子：滴水溅落音钩子（Gore.cs :967-984 语义——落地/入水两路径、flag4 静音）
import { describe, it, expect } from 'vitest';
import { NatureParticles } from '../src/render/NatureParticles';
import type { TileStore } from '../src/world/TileStore';

/** 最小 TileStore 形状（updateDrips/boxCollide 用到 isSolid/inBounds/idx/flags/liquid） */
function fakeStore(groundRow = 10, w = 8, h = 24) {
  const solid = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) solid[groundRow * w + x] = 1;
  return {
    w, h,
    flags: new Uint8Array(w * h).fill(1),
    liquid: new Uint8Array(w * h),
    liquidType: new Uint8Array(w * h),
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    idx: (x: number, y: number) => y * w + x,
    isSolid: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x],
  } as unknown as TileStore;
}

describe('滴水溅落音（Gore.cs :968-984）', () => {
  it('下落滴碰地 → 触发干溅落音（位置 +8，wet=false）并转溅落帧', () => {
    const np = new NatureParticles();
    np.bindStore(fakeStore());
    let fired: { x: number; y: number; wet: boolean } | null = null;
    np.onDripSplash = (x, y, wet) => { fired = { x, y, wet }; };
    np.drips.push({ x: 32, y: 100, vy: 0, type: 706, frame: 9, frameCounter: 0, alpha: 0, dead: false });
    for (let i = 0; i < 60 && !fired; i++) np.updateDrips(0);
    expect(fired).not.toBeNull();
    expect(fired!.wet).toBe(false);
    expect(fired!.x).toBe(40); // +8
    expect(fired!.y).toBeGreaterThanOrEqual(100); // 已下落
  });

  it('flag4 水型（716 蜂蜜/717/943/1160-62）溅落不发声', () => {
    for (const t of [716, 717, 943, 1160, 1161, 1162]) {
      const np = new NatureParticles();
      np.bindStore(fakeStore());
      let fired = false;
      np.onDripSplash = () => { fired = true; };
      np.drips.push({ x: 32, y: 100, vy: 0, type: t, frame: 9, frameCounter: 0, alpha: 0, dead: false });
      for (let i = 0; i < 60; i++) np.updateDrips(0);
      expect(fired, `type ${t} 不应发声`).toBe(false);
      // 粒子本身仍正常转溅落帧（溅落完成被过滤移除 = drips 清空）
      expect(np.drips.length === 0 || np.drips.some((d) => d.frame >= 10 || d.dead)).toBe(true);
    }
  });

  it('入水路径（wet=true）触发对应 variant 语义——由 Game 钩子映射 Drip_2，此处验证 wet 标志', () => {
    // 液面格 + 液体：滴落入水 → wet=true
    const w = 8, h = 24, groundRow = 10;
    const solid = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) { solid[groundRow * w + x] = 1; }
    const liquid = new Uint8Array(w * h);
    const liquidType = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) { liquid[(groundRow - 1) * w + x] = 255; liquidType[(groundRow - 1) * w + x] = 1; }
    const st = {
      w, h, flags: new Uint8Array(w * h).fill(1), liquid, liquidType,
      inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
      idx: (x: number, y: number) => y * w + x,
      isSolid: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x],
    } as unknown as TileStore;
    const np = new NatureParticles();
    np.bindStore(st);
    let wet: boolean | null = null;
    np.onDripSplash = (_x, _y, w2) => { wet = w2; };
    np.drips.push({ x: 32, y: 100, vy: 0, type: 706, frame: 9, frameCounter: 0, alpha: 0, dead: false });
    for (let i = 0; i < 60 && wet === null; i++) np.updateDrips(0);
    expect(wet).toBe(true); // 入水先于触地 → WetCollision 分支
  });
});

// ============ 墓地环境云雾（AmbientWindSystem.cs + Gore SpecialAI 4/5） ============

/** fakeStore 扩展：type/slope/half（云雾工作区扫描用） */
function cloudStore(groundRow = 10, w = 140, h = 40) {
  const solid = new Uint8Array(w * h);
  const type = new Uint8Array(w * h);
  const slope = new Uint8Array(w * h);
  const half = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = groundRow; y < h; y++) { solid[y * w + x] = 1; type[y * w + x] = 1; }
  }
  return {
    w, h, solid,
    flags: new Uint8Array(w * h).fill(1),
    liquid: new Uint8Array(w * h),
    liquidType: new Uint8Array(w * h),
    type, slope, half,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    idx: (x: number, y: number) => y * w + x,
    isSolid: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x],
  } as unknown as TileStore;
}

describe('墓地环境云雾（AmbientWindSystem.Update + Gore.cs:111-202）', () => {
  it('ZoneGraveyard 门：非墓地不生成（TrySpawningWind 不跑），已生云雾照常推进', () => {
    const np = new NatureParticles();
    np.bindStore(cloudStore());
    np.clouds.push({ x: 400, y: 100, vx: 0, vy: 0, alpha: 0, timeLeft: 600, scale: 1, type: 1087, rotation: 0, airborne: false, dead: false });
    for (let i = 0; i < 120; i++) np.updateAmbientWind(false, 0.5, 70 * 16, 5 * 16);
    expect(np.clouds.length).toBe(1);          // 无新增
    expect(np.clouds[0].x).toBeGreaterThan(400); // vx = 0.4×wind 漂移（Gore.cs:138）
  });

  it('墓地：工作区（玩家中心 120×30）实心顶面 1/120 出地面云，贴型 1087-1090', () => {
    const np = new NatureParticles();
    np.bindStore(cloudStore());
    for (let i = 0; i < 200; i++) np.updateAmbientWind(true, 0, 70 * 16, 5 * 16);
    expect(np.clouds.length).toBeGreaterThan(0);
    for (const c of np.clouds) {
      expect(c.type).toBeGreaterThanOrEqual(1087);
      expect(c.type).toBeLessThanOrEqual(1093);
    }
  });

  it('地面云生命周期：出生不透明（alpha 0）；钻墙/悬空/≤30 tick → 淡出至 255 消散', () => {
    const st = cloudStore();
    const np = new NatureParticles();
    np.bindStore(st);
    // 出生在实心层内（头部格实心 → flag）→ 逐帧 alpha++ 至 255 后移除
    np.clouds.push({ x: 400, y: 11 * 16 + 4, vx: 0, vy: 0, alpha: 0, timeLeft: 600, scale: 1, type: 1087, rotation: 0, airborne: false, dead: false });
    for (let i = 0; i < 300 && np.clouds.length > 0; i++) np.updateAmbientWind(false, 0, 0, 0);
    expect(np.clouds.length).toBe(0);
  });

  it('空中云（SpecialAI 5）：rotation 跟随速度角；timeLeft≤60 起 1/5 淡出', () => {
    const np = new NatureParticles();
    np.bindStore(cloudStore());
    const c = { x: 400, y: 5 * 16, vx: 1, vy: 0.5, alpha: 0, timeLeft: 600, scale: 1, type: 1091, rotation: 0, airborne: true, dead: false };
    np.clouds.push(c);
    np.updateAmbientWind(false, 0, 0, 0);
    expect(c.rotation).toBeCloseTo(Math.atan2(0.5, 1), 5);   // Gore.cs:161
    c.timeLeft = 30;                                          // ≤60 → flag 淡出支
    const a0 = c.alpha;
    for (let i = 0; i < 200; i++) np.updateAmbientWind(false, 0, 0, 0);
    expect(np.clouds.length).toBe(0);                         // 淡出至 255 移除
    expect(c.alpha).toBeGreaterThanOrEqual(a0);
  });
});

// ★BJ386（2026-09-28）：落叶初速判别面——Gore.cs:1413 SpecialAI==3 直接赋值覆写
// velocity=(rand−0.5)×1f∈[-0.5,0.5)（调用方 NewGoreDirect 传入 [-2,2] 与踢击被覆写
// 作废；BJ379 曾注锚 :1423 = 下一分支 num2==1 行）。修复前常数 ×4 → |vx|∈[-2,2)。
describe('BJ386 落叶初速（Gore.cs :1413 SpecialAI==3 覆写 ×1）', () => {
  it('spawnLeaf 横速分布 = (rand−0.5)×1：|vx|<0.5 且采样覆盖区间两端（非旧 ×4）', () => {
    const np = new NatureParticles();
    np.maxLeaves = 4000; // 绕开 220 池上限做分布采样
    for (let i = 0; i < 3000; i++) np.spawnLeaf(0, 0, 910);
    expect(np.leaves.length).toBe(3000);
    let min = Infinity, max = -Infinity;
    for (const l of np.leaves) {
      expect(Math.abs(l.vx)).toBeLessThan(0.5); // 原版区间界（×4 时必爆）
      if (l.vx < min) min = l.vx;
      if (l.vx > max) max = l.vx;
    }
    // 3000 样本应近似铺满 [-0.5,0.5)：两端触达 90% 区间以上（旧 ×4 同样可通过此条，
    // 上界断言才是判别主面；本条防缩水为 ±0.1 级误修）
    expect(max - min).toBeGreaterThan(0.9);
    // vy 相位面不受本次刀影响：[0,2π)
    for (const l of np.leaves) expect(l.vy).toBeGreaterThanOrEqual(0);
  });
  it('树叶族门（LEAF_GORES）外 gore 不入池——覆写只作用于 SpecialAI==3 族', () => {
    const np = new NatureParticles();
    np.spawnLeaf(0, 0, 706); // 滴水族非叶
    expect(np.leaves.length).toBe(0);
  });
});

// ============ ★清偿 C3/R5-F4 + C5/R5-F7a（2026-10-14 落叶域五债判别锁） ============

/** 落叶域自由塑形 store（solid/liquid/liquidType 三面外露,探针几何用例需逐格布设） */
function leafStore(w: number, h: number, solid: Uint8Array, liquid?: Uint8Array, liquidType?: Uint8Array) {
  return {
    w, h, solid,
    flags: new Uint8Array(w * h).fill(1),
    liquid: liquid ?? new Uint8Array(w * h),
    liquidType: liquidType ?? new Uint8Array(w * h),
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    idx: (x: number, y: number) => y * w + x,
    isSolid: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x],
  } as unknown as TileStore;
}

/** 落地/下落态手工叶（spawnLeaf 的 vy 由相位掷定,落地态用例需钉 vy=-1） */
function handLeaf(x: number, y: number, vy: number) {
  return {
    x, y, vx: 0, vy, row: 0, rowGroup: 0, rowCounter: 0, col: 0,
    alpha: 0, timeLeft: 900, scale: 1, gore: 910, dead: false,
  };
}

// ★清偿 C3（R5-F4）：脚下门探针 (x+4,y+4)→(x+5.5,y+1.5)——原版数值式
// vector=position+(12/2−4/2, 6−4)=(x+4,0) 后 point=(vector+(num,num)/2)
// .ToTileCoordinates()（num=(int)(4×0.9)=3;Gore.cs:1106-1114）。旧 Y 偏 2.5px：
// 叶落点 y mod16≥12 时 ty 落入下一行 → ty+1 越过脚下表面格=悬空叶不唤醒。
describe('清偿 C3：落地支脚下门探针 (x+5.5, y+1.5)（Gore.cs:1106-1114）', () => {
  it('① 落地叶 N 拍 y 恒定且不误唤醒（旧探针 y mod16=12 时逐拍误醒:alpha+20 早夭）', () => {
    const np = new NatureParticles();
    np.bindStore(fakeStore());                       // 地面行 10（y 160..176）
    np.leaves.push(handLeaf(3 * 16 + 2, 10 * 16 - 4, -1));   // y=156,y mod16=12 格底带
    for (let i = 0; i < 40; i++) np.updateLeaves(0, 11 * 16);
    expect(np.leaves.length).toBe(1);                // 旧探针 13 拍内 alpha 255 早夭 → 红
    expect(np.leaves[0].y).toBe(10 * 16 - 4);        // 落地支零 Y 写（BJ669f）
    expect(np.leaves[0].vy).toBe(-1);                // 恒落地支（旧逐拍误醒 vy=0.1 → 红）
    expect(np.leaves[0].alpha).toBe(0);              // 未褪色
  });

  it('② 挖掉脚下表面格 → vy=0.1 唤醒（含格底带 y mod16≥12 悬空叶场景）', () => {
    const w = 8, h = 24;
    const solid = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) { solid[10 * w + x] = 1; solid[11 * w + x] = 1; }
    const np = new NatureParticles();
    np.bindStore(leafStore(w, h, solid));
    np.leaves.push(handLeaf(3 * 16 + 11, 10 * 16 - 4, -1));  // x=59（+4→col3,+5.5→col4）
    for (let i = 0; i < 20; i++) np.updateLeaves(0, 11 * 16);
    expect(np.leaves[0].vy).toBe(-1);                // 支承在位不唤醒
    solid[10 * w + 3] = 0; solid[10 * w + 4] = 0;    // 挖掉脚下表面格
    np.updateLeaves(0, 11 * 16);
    expect(np.leaves[0].vy).toBe(0.1);               // 唤醒回下落支（:1136-1140）
    expect(np.leaves[0].timeLeft).toBe(0);           // timeLeft=0 同拍置
    expect(np.leaves[0].alpha).toBe(21);             // alpha+=20（:1140）+同拍衰减支+1
                                                     //（timeLeft=0 → :1146-1150 else 臂）
  });

  it('③ X 探针 4→5.5 逐值：叶悬于支承列外一格 → 新探针唤醒（旧探针滞留支承列=漏检）', () => {
    const w = 8, h = 24;
    const solid = new Uint8Array(w * h);
    solid[10 * w + 3] = 1; solid[11 * w + 3] = 1;    // 支承仅 col3（叶 x=59 本体在 col3 缘）
    const np = new NatureParticles();
    np.bindStore(leafStore(w, h, solid));
    // 叶悬于 col4 空洞上方（x=59 → 新探针 col4/下查(4,10)=空气→醒；旧探针
    // (x+4,y+4)=(63,160)→ty=10、下查(3,11)=实心→误判有支承永不醒）
    np.leaves.push(handLeaf(59, 10 * 16 - 4, -1));
    np.updateLeaves(0, 11 * 16);
    expect(np.leaves[0].vy).toBe(0.1);               // 旧 (x+4) 滞留 col3 → 红
  });
});

// ★清偿 C5（R5-F7a）：下落支 timeLeft/alpha 衰减链（:1221-1228,叶族
// DisappearSpeed/DisappearSpeedAlpha 缺省恒 1=GoreID.cs:11-13）+ 岩浆焚毁亡+尘
// （:1136-1143 active=false + 5×Dust.NewDust(position,3,3,31,0,-0.2)）。
describe('清偿 C5：下落支衰减链 + 岩浆焚毁尘（Gore.cs :1221-1228 / :1136-1143）', () => {
  it('下落叶 timeLeft 每拍 −1；耗尽后 alpha 每拍 +1；alpha≥255 亡（公共尾 :1074-1077）', () => {
    const np = new NatureParticles();
    np.bindStore(fakeStore());
    const l = handLeaf(32, 20, 0.5);                 // 高空自由落（远离地面/液体）
    np.leaves.push(l);
    np.updateLeaves(0, 0);
    expect(l.timeLeft).toBe(899);                    // 旧缺衰减链恒 900 → 红
    expect(l.alpha).toBe(0);
    l.timeLeft = 0;
    np.updateLeaves(0, 0);
    expect(l.alpha).toBe(1);
    l.alpha = 254;
    np.updateLeaves(0, 0);
    expect(l.dead).toBe(true);                       // 旧永寿不褪色 → 红
  });

  it('落地支岩浆焚毁：即亡 + onLavaDust(position)（旧按风滑移支漏亡 → 红）', () => {
    const w = 8, h = 24;
    const solid = new Uint8Array(w * h);
    const liquid = new Uint8Array(w * h);
    const liquidType = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) { liquid[9 * w + x] = 255; liquidType[9 * w + x] = 2; }
    const np = new NatureParticles();
    np.bindStore(leafStore(w, h, solid, liquid, liquidType));
    const calls: number[][] = [];
    np.onLavaDust = (x, y) => calls.push([x, y]);
    np.leaves.push(handLeaf(50, 142, -1));           // 液面探针 (x+4,y+2)=(54,144)→row9 岩浆
    np.updateLeaves(0, 11 * 16);
    expect(np.leaves.length).toBe(0);                // 即亡过滤（旧滑移存活 → 红）
    expect(calls.length).toBe(1);                    // 一次焚毁尘（Game 侧展开 5×dust31）
    expect(calls[0][0]).toBe(50);                    // position=叶位（Gore.cs:1141）
    expect(calls[0][1]).toBe(142);
  });

  it('下落支岩浆焚毁补尘（同参面）', () => {
    const w = 8, h = 24;
    const solid = new Uint8Array(w * h);
    const liquid = new Uint8Array(w * h);
    const liquidType = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      for (const row of [8, 9]) { liquid[row * w + x] = 255; liquidType[row * w + x] = 2; }
    }
    const np = new NatureParticles();
    np.bindStore(leafStore(w, h, solid, liquid, liquidType));
    const calls: number[][] = [];
    np.onLavaDust = (x, y) => calls.push([x, y]);
    np.leaves.push(handLeaf(32, 100, 0.5));          // 下落,液面探针 (x+6,y+6)
    for (let i = 0; i < 80 && !np.leaves[0]?.dead; i++) np.updateLeaves(0, 0);
    expect(np.leaves.length).toBe(0);                // 岩浆焚毁
    expect(calls.length).toBe(1);                    // 旧缺尘 → 红
  });
});
