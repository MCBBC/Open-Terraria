// ★BJ290 清债刀 件2/件3（P1③ + 普-U1）：limitPointToPlayerReachableArea 平移钳
// 语义修正 + 可达区钳制单源化回归。
//
// 原版定谳（本刀亲读,1457/1458 全同）：
//   · Utils.Clamp<T>（Utils.cs:223-231）判序=先 max 后 min——退化域（min>max,即
//     世界 <3200×2480px 时 Right−W<Left）逐字面坍缩: v>max→max; v≤max→min。
//     仓内两旧式皆反：ClingerStaffWallProj clampSeq（min 先判,(max,min) 带误取 min）、
//     Game.ts min(max(v,min),max)（v≤max 带误取 max）——本件统一判序。
//   · Utils.Clamp(Rectangle,bounds)（Utils.cs:236-239）=定尺寸平移钳——盒恒
//     1920×1200 只平移进 play area,不与 play area 相交裁剪。旧 MissileProj 相交
//     裁剪版（盒可缩小+玩家恒居裁后盒心）=P1③ 偏差本体——U1 例:世界宽 8400/
//     玩家 cx=700/目标 2000:原版可达不动,旧版钳到 1660（差 340px 落点偏差）。
//   · Player.LimitPointToPlayerReachableArea（Player.cs:45830-45858）:CenteredRectangle
//     (Center,1920×1200)（Utils.cs:961-963 截断）→ ClampToWorldBorders（WorldUtils
//     .cs:29-34）→ 钳后矩形心径向等比回拉（k=min(960/|dx|,600/|dy|,1) 两轴同比）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { limitPointToPlayerReachableArea, clampScalarMaxFirst,
  MAX_WORLD_VIEW_W, MAX_WORLD_VIEW_H, PLAY_AREA_INSET } from '../src/entities/PlayerReachableArea';
import { computeClingerWallSpawn } from '../src/entities/ClingerStaffWallProj';

describe('BJ290-件2 Utils.Clamp<T> 判序（Utils.cs:223-231 先 max 后 min）', () => {
  it('常域：v∈(min,max) 恒等 / 越界取界（与任何判序无差域）', () => {
    expect(clampScalarMaxFirst(5, 0, 10)).toBe(5);
    expect(clampScalarMaxFirst(-1, 0, 10)).toBe(0);
    expect(clampScalarMaxFirst(11, 0, 10)).toBe(10);
  });

  it('退化域（min>max）：v>max→max、v≤max→min（两旧实现各自反向的面）', () => {
    // 世界 1600px: play area 右缘 960,盒 Right−W = −960 → Clamp(−150, 640, −960)
    expect(clampScalarMaxFirst(-150, 640, -960)).toBe(-960);   // v>max→max（旧 clampSeq 误取 min=640）
    expect(clampScalarMaxFirst(-2000, 640, -960)).toBe(640);   // v≤max→min（旧 min(max()) 误取 max=−960）
    expect(clampScalarMaxFirst(500, 640, -960)).toBe(-960);    // (max,min) 带取 max（旧 clampSeq 误取 min）
  });
});

describe('BJ290-件2 LimitPointToPlayerReachableArea 平移钳语义（Player.cs:45830-45858）', () => {
  it('常量面：MaxWorldViewSize=1920×1200（Main.cs:758）、play area 内收 640（WorldUtils.cs:20）', () => {
    expect(MAX_WORLD_VIEW_W).toBe(1920);
    expect(MAX_WORLD_VIEW_H).toBe(1200);
    expect(PLAY_AREA_INSET).toBe(640);
  });

  it('非退化世界居中玩家：盒心=玩家心,超程光标沿 ±960/±600 面径向回拉（两轴同比）', () => {
    const pcx = 2400, pcy = 2400;   // 世界 4800×4800,盒 x∈[1440,3360] 心=玩家
    expect(limitPointToPlayerReachableArea(pcx + 2000, pcy, pcx, pcy, 4800, 4800))
      .toEqual([pcx + 960, pcy]);                       // k=960/2000=.48 → 东面
    expect(limitPointToPlayerReachableArea(pcx, pcy + 1500, pcx, pcy, 4800, 4800))
      .toEqual([pcx, pcy + 600]);                       // k=.4 → 南面
    const c = limitPointToPlayerReachableArea(pcx + 2000, pcy + 900, pcx, pcy, 4800, 4800);
    expect(c[0]).toBeCloseTo(pcx + 960, 9);             // k=min(.48,.667)=.48 两轴同比
    expect(c[1]).toBeCloseTo(pcy + 900 * 0.48, 9);
  });

  it('★U1 例（P1③ 偏差本体）：世界 8400/玩家 cx=700/目标 2000 → 原版可达不动（旧相交裁剪钳 1660）', () => {
    // 盒 x=Clamp(trunc(700−960)=−260, 640, 8400−640−1920=5840)=640 → x∈[640,2560] 心 1600
    const c = limitPointToPlayerReachableArea(2000, 2400, 700, 2400, 8400, 4800);
    expect(c[0]).toBe(2000);                            // dx=400≤960 → 恒等
    expect(c[1]).toBe(2400);
  });

  it('贴界玩家超程回拉：目标钉盒面（盒恒 1920 宽,非裁后尺寸）', () => {
    const c = limitPointToPlayerReachableArea(-9999, 2400, 700, 2400, 8400, 4800);
    expect(c[0]).toBe(640);                             // 盒左面=640（恒宽盒的 Left）
    expect(c[1]).toBe(2400);
    const e = limitPointToPlayerReachableArea(99999, 2400, 700, 2400, 8400, 4800);
    expect(e[0]).toBe(2560);                            // 盒右面=640+1920（非旧裁剪版 1660）
  });

  it('退化小世界（1600×1600px<3200×2480）：盒按判序钉靠 Right−W/Bottom−H 一侧、恒不裁小', () => {
    // 玩家盒心 (810,1301)（x=800,y=1280,w=20,h=42）:盒 x=Clamp(−150,640,−960)=−960
    // → x∈[−960,960] 心 0;y=Clamp(701,640,−240)=−240 → y∈[−240,960] 心 360
    const lim = limitPointToPlayerReachableArea(840, 1600, 810, 1301, 1600, 1600);
    expect(lim[0]).toBeCloseTo(406.4516129032258, 9);   // 径向回拉 k=600/1240 两轴同比
    expect(lim[1]).toBe(960);                           // 恰盒底面
    // 盒罩全 play area：play area 内任意点恒等可达（盒 [−960,960]×[−240,960] ⊇ [640,960]²）
    expect(limitPointToPlayerReachableArea(640, 640, 810, 1301, 1600, 1600)).toEqual([640, 640]);
    expect(limitPointToPlayerReachableArea(960, 960, 810, 1301, 1600, 1600)).toEqual([960, 960]);
  });

  it('退化小世界（2400×2400）：盒心偏离玩家心仍罩全 play area——target 恒可达（件3.4 基准）', () => {
    const pcx = 1200, pcy = 1200;
    // 盒 x=Clamp(240, 640, −160)=−160 → x∈[−160,1760];y 同 → 全 play area [640,1760]² 在盒内
    expect(limitPointToPlayerReachableArea(1759, 1200, pcx, pcy, 2400, 2400)).toEqual([1759, 1200]);
    expect(limitPointToPlayerReachableArea(640, 640, pcx, pcy, 2400, 2400)).toEqual([640, 640]);
    // 界外点仍回拉到盒面（盒外才拉）
    expect(limitPointToPlayerReachableArea(-2000, 1200, pcx, pcy, 2400, 2400)[0]).toBe(-160);
  });

  it('CenteredRectangle 截断（Utils.cs:961-963=(int)(c−960)）：分数玩家心不炸、截断域与旧式等价（rx<0 恒钳 640 侧）', () => {
    const c = limitPointToPlayerReachableArea(810.7, 2400, 810.7, 2400, 8400, 4800);
    expect(c[0]).toBe(810.7);                           // 盒 x=Clamp(trunc(−149.3),640,5840)=640 心 1600 → dx 恒等
    expect(c[1]).toBe(2400);
  });
});

describe('BJ290-件3 消费面单源化（三实现归一）', () => {
  const src = (f: string) => readFileSync(resolve(__dirname, '..', 'src', f), 'utf8');

  it('ClingerStaffWallProj：computeClingerWallSpawn 与单源全等（3014 爬藤怪墙发射侧）', () => {
    // 非退化世界：鼠标超程 → 钳点=盒右面 3360;视线恒通 → 推进吸附收束钳点 → 墙落钳点列
    const isSolid = (_x: number, _y: number) => false;
    const sheetAt = () => 0;
    const r = computeClingerWallSpawn({
      mouse: { x: 99999, y: 2000 },
      playerCenter: { x: 2400, y: 2000 },
      playerBox: { x: 2390, y: 1958, w: 20, h: 42 },
      facing: 1, shootSpeed: 10,
      worldPx: { w: 8400, h: 4800 },
      canHitLine: () => true,
      isSolid, sheetAt,
    });
    const [rx] = limitPointToPlayerReachableArea(99999, 2000, 2400, 2000, 8400, 4800);
    expect(rx).toBe(3360);                              // 单源钳点=盒右面（旧裁剪版 2448 退役）
    expect(r.x).toBe(Math.trunc(rx / 16) * 16);         // 墙落钳点列左缘（与单源全等）
    expect(r.noFloor).toBe(true);                       // 空场无底 → flag7（扫面归 BJ286 管辖）
  });

  it('退化小世界：3014 发射侧钳点随单源统一（旧 clampSeq 判序反向面归零）', () => {
    // 世界 1600×1600、玩家盒心 (810,1301) → 盒 x∈[−960,960]/y∈[−240,960] 心 (0,360);
    // 鼠标 (600,900) 在盒内=钳恒等 → 推进吸附收束 (600,900) → 墙落 37 列
    const isSolid = (_x: number, _y: number) => false;
    const sheetAt = () => 0;
    const r = computeClingerWallSpawn({
      mouse: { x: 600, y: 900 },
      playerCenter: { x: 810, y: 1301 },
      playerBox: { x: 800, y: 1259, w: 20, h: 42 },
      facing: 1, shootSpeed: 10,
      worldPx: { w: 1600, h: 1600 },
      canHitLine: () => true,
      isSolid, sheetAt,
    });
    const [rx, ry] = limitPointToPlayerReachableArea(600, 900, 810, 1301, 1600, 1600);
    expect(rx).toBe(600);                               // 盒内恒等（判序统一后退化域不再偏）
    expect(ry).toBe(900);
    expect(r.x).toBe(Math.trunc(rx / 16) * 16);         // 墙柱列=钳点列（单源对拍）
  });

  it('单源旁路锁：MissileProj re-export/无本地实现;Game 委派;ClingerStaff 内联 clampSeq 退役', () => {
    const mp = src('entities/MissileProj.ts');
    expect(mp).toContain("export { limitPointToPlayerReachableArea };");
    expect(mp).not.toMatch(/const l = Math\.max\(pcx/);          // 旧相交裁剪实现已退役
    const cs = src('entities/ClingerStaffWallProj.ts');
    expect(cs).toContain('limitPointToPlayerReachableArea(');
    expect(cs).not.toContain('const clampSeq');                  // 旧内联判序实现已退役（注释提及不拘）
    const game = src('core/Game.ts');
    expect(game).toContain('limitPointToPlayerReachableArea(');  // clampPoint 委派+天顶剑收编
    expect(game).not.toMatch(/Math\.min\(Math\.max\(rx, PA\)/);  // 旧 min(max()) 判序实现已退役
    // 天顶剑旧内联 ±960/600（无 play area 平移钳）已退役
    expect(game).not.toContain('const hw = 960, hh = 600;');
    // 单源=原文直译判序（变异 deterrent：改序即红）
    const pa = src('entities/PlayerReachableArea.ts');
    expect(pa).toContain('v > max ? max : v < min ? min : v');
  });
});
