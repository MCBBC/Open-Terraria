// 蓝队六轮批 F2+F3 回归（2026-09-01）：
//  F2  WeaponProj.inLiquid 两处：①中心项 C# `(float)(Width/2)` 整数除（奇数尺寸弹
//      0.5px 边界）;②扫描窗补 min(st.w−1)/min(st.h−40) 钳（对齐 Wet/LavaCollision
//      :1595-1598/:1663-1666 与 TouchDamage/npcLiquid 两兄弟副本——世界右缘末列/
//      狱底 40 行带原版不扫）。
//  F3  Arrow 入水块退役「弹心格」近似 → 湿缓存 + lavaWet 粘滞面（Projectile.cs
//      :16921-16931）;缓存刷新块补 ignoreWater 门（:16903 全段跳过）+ lavaWet
//      维护（:16906-16911 只置不清 / :17103-17108 !wet 三清,照抄位次）。
//      三案：沾浆渡水不杀不变型 / 浅缘邻格两向 / ignoreWater 幽灵弹不置 wet。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { FlailProj } from '../src/entities/WeaponProj';
import { Arrow } from '../src/entities/Arrow';
import { projectileData } from '../src/data/vanillaProjectiles';
import type { GameHooks } from '../src/entities/types';

const LIQ = 255;

function hooks(store: TileStore): GameHooks {
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  return {
    world: { store } as never,
    player: player as never,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    mapFullscreen: () => false,
    spawnDust: () => null,
  } as unknown as GameHooks;
}

// =====================================================================
// F2①：中心项整数除（奇数尺寸弹 0.5px 边界）
// =====================================================================
describe('★F2① inLiquid 中心项 C# 整数除（Collision.cs:1580-1596 五连整除族）', () => {
  const st = new TileStore(200, 120);
  st.liquid[st.idx(20, 40)] = LIQ; st.liquidType[st.idx(20, 40)] = 1;   // 列20 [320,336] 满格带
  const g = hooks(st);
  const mk = (x: number, y: number, w: number, h: number) => {
    const f = new FlailProj(100, 100, 20, 4, 25, () => false, () => ({ x: 200, y: 100 }));
    f.w = w; f.h = h; f.x = x; f.y = y;
    return f;
  };

  it('奇宽 21：探针右缘=tile 左缘 0.5px 边界——截断口径不判湿（浮点错版误判湿）', () => {
    // pw=10,px = x+trunc(21/2)−trunc(10/2) = x+5 → 探针 [x+5, x+15]
    // x=305：[310,320] → 320>320 不成立 = 干（浮点错版 [310.5,320.5] → 误湿）
    expect((mk(305, 636, 21, 22) as unknown as { inLiquid(g: GameHooks): boolean }).inLiquid(g)).toBe(false);
    // x=306：[311,321] → 真相交 = 湿（排除"整体漏判"假阳）
    expect((mk(306, 636, 21, 22) as unknown as { inLiquid(g: GameHooks): boolean }).inLiquid(g)).toBe(true);
  });

  it('奇高 21：Height/2 与 num2/2 两级整数除——探针底=带顶 0.5px 边界', () => {
    // num2=trunc(21/2)=10,py = y+10−5 = y+5 → 探针 [y+5, y+15]
    // y=625：[630,640] → 640>640.06 不成立 = 干（浮点错版 py=630.5 → [630.5,640.5] 误湿）
    expect((mk(322, 625, 22, 21) as unknown as { inLiquid(g: GameHooks): boolean }).inLiquid(g)).toBe(false);
    expect((mk(322, 626, 22, 21) as unknown as { inLiquid(g: GameHooks): boolean }).inLiquid(g)).toBe(true);
  });
});

// =====================================================================
// F2②：扫描窗钳制（世界右缘末列 / 狱底 40 行带）
// =====================================================================
describe('★F2② inLiquid 扫描窗钳制（Wet/LavaCollision :1595-1598/:1663-1666 同构）', () => {
  const mk = (x: number, y: number) => {
    const f = new FlailProj(100, 100, 20, 4, 25, () => false, () => ({ x: 200, y: 100 }));
    f.w = 22; f.h = 22; f.x = x; f.y = y;
    return f;
  };
  const inL = (f: FlailProj, g: GameHooks) => (f as unknown as { inLiquid(g: GameHooks, t?: number): boolean }).inLiquid(g, 2);

  it('世界右缘：末列 w−1 原版不扫（钳后上界 exclusive）,倒数第二列照常检出', () => {
    const st = new TileStore(60, 160);
    const g = hooks(st);
    st.liquid[st.idx(58, 40)] = LIQ; st.liquidType[st.idx(58, 40)] = 2;
    // x=926：全盒 [926,948] 与列58 [928,944] 相交；t1x=min(59, 61)=59 → 扫 56..58
    expect(inL(mk(926, 640), g)).toBe(true);
    // 同几何换到列 59（末列）：旧无钳版 t1x=61 会扫到并误判湿;钳后不扫 = 干
    const st2 = new TileStore(60, 160);
    const g2 = hooks(st2);
    st2.liquid[st2.idx(59, 40)] = LIQ; st2.liquidType[st2.idx(59, 40)] = 2;
    expect(inL(mk(926, 640), g2)).toBe(false);
  });

  it('狱底带：maxTilesY−40 以下原版不扫——钳内行检出 / 钳外行漏看=干', () => {
    // 行 119（钳内）：全盒 [1910,1932] 与带 [1904.06,1920.06] 相交 → 湿
    const st = new TileStore(60, 160);
    const g = hooks(st);
    st.liquid[st.idx(20, 119)] = LIQ; st.liquidType[st.idx(20, 119)] = 2;
    expect(inL(mk(320, 1910), g)).toBe(true);
    // 行 121（钳外,旧无钳版 j1=124 会扫到）：同几何 → 干
    const st2 = new TileStore(60, 160);
    const g2 = hooks(st2);
    st2.liquid[st2.idx(20, 121)] = LIQ; st2.liquidType[st2.idx(20, 121)] = 2;
    expect(inL(mk(320, 1930), g2)).toBe(false);
  });
});

// =====================================================================
// F3：Arrow 入水块湿缓存 + lavaWet 粘滞面 + ignoreWater 门
// =====================================================================
/** 燃烧箭（projId 2,IsDestroyedByWater 变型族）：静止弹,手动摆位驱动 */
function mkArrow(store: TileStore, x: number, y: number): { a: Arrow; g: GameHooks; tick(n: number): void } {
  const a = new Arrow(x, y, 0, 0, 12, 1, 2, null, { grav: 0 });
  a.w = 10; a.h = 10;
  const g = hooks(store);
  return {
    a, g,
    tick(n: number) { for (let i = 0; i < n && !a.dead; i++) a.fixedUpdate(1 / 60, g); },
  };
}

describe('★F3① 入水块改读湿缓存+粘滞面（Projectile.cs:16921-16931）', () => {
  it('浅缘邻格两向：弹心格干、探针盒浸水 → 燃烧箭仍变型（旧中心格近似两向全漏）', () => {
    // 水仅列 20 [320,336]；探针 = [x,x+10]×[y+3,y+8]（w=h=10）
    const st = new TileStore(60, 160);
    st.liquid[st.idx(20, 40)] = LIQ; st.liquidType[st.idx(20, 40)] = 1;
    // 左邻：弹心列 19（干）,探针右缘 323>320 浸水
    const L = mkArrow(st, 313, 637);
    L.tick(2);
    expect(L.a.dead).toBe(false);
    expect(L.a.projId).toBe(1);            // TransformType(1)
    // 右邻：弹心列 21（干）,探针左缘 334<336 浸水
    const R = mkArrow(st, 334, 637);
    R.tick(2);
    expect(R.a.dead).toBe(false);
    expect(R.a.projId).toBe(1);
    // 干区对照：探针 [309,319] 与列 20 无交 → 不变型
    const D = mkArrow(st, 309, 637);
    D.tick(3);
    expect(D.a.dead).toBe(false);
    expect(D.a.projId).toBe(2);
  });

  it('沾浆渡水：浆中湿弹 lavaWet 粘滞面保护——渡水不杀不变型,离液归零后入清水才变型', () => {
    const st = new TileStore(60, 160);
    st.liquid[st.idx(20, 40)] = LIQ; st.liquidType[st.idx(20, 40)] = 2;   // 岩浆列 20
    st.liquid[st.idx(22, 40)] = LIQ; st.liquidType[st.idx(22, 40)] = 1;   // 水列 22
    const T = mkArrow(st, 322, 637);   // 出生即在浆里（预置 wet=true+lavaWet=true）
    T.tick(1);
    expect(T.a.dead).toBe(false);
    expect(T.a.projId).toBe(2);        // tick1 消亡判定：wet && !lavaWet = false（保护）
    T.a.x = 354;                        // 渡入清水列 22（探针 [354,364] ⊂ [352,368]）
    T.tick(2);                          // tick2/3：lavaWet 粘滞（wet 恒真不清）
    expect(T.a.dead).toBe(false);
    expect(T.a.projId).toBe(2);        // ★渡水不杀不变型（原版粘滞语义）
    T.a.x = 500; T.a.y = 300;           // 完全离液
    T.tick(2);                          // !wet 拍三清 lavaWet
    expect(T.a.dead).toBe(false);
    expect(T.a.projId).toBe(2);
    T.a.x = 354; T.a.y = 637;           // 再入清水
    T.tick(2);
    expect(T.a.projId).toBe(1);        // lavaWet 已清 → 变型
  });
});

describe('★F3② 缓存刷新块 ignoreWater 门（原文 if(!ignoreWater) 全段跳过 :16903）', () => {
  it('ignoreWater 幽灵弹：置门后泡水也不置 wet——不消亡不变型', () => {
    const st = new TileStore(60, 160);
    st.liquid[st.idx(20, 40)] = LIQ; st.liquidType[st.idx(20, 40)] = 1;
    const pd = projectileData(2)! as { ignoreWater?: boolean };
    const saved = pd.ignoreWater;
    try {
      pd.ignoreWater = true;             // 数据面置门（proj 2 原文本就无 ignoreWater 行=
                                         //   真值非提取缺口——水death 族与本门互斥,F3③
                                         //   禁入不变式钉死;直置仅护门路径）
      const W = mkArrow(st, 322, 637);   // 出生即泡在水里
      W.tick(4);
      expect(W.a.dead).toBe(false);
      expect(W.a.projId).toBe(2);        // 预置 :10888-10890 清 wet + 刷新块全段跳过
      expect(W.a.wet).toBe(false);
    } finally {
      if (saved === undefined) delete pd.ignoreWater; else pd.ignoreWater = saved;
    }
    // 对照（无门）：同位同液态 → 变型
    const C = mkArrow(st, 322, 637);
    C.tick(2);
    expect(C.a.projId).toBe(1);
  });
});

// =====================================================================
// F3③ ignoreWater 数据面真值（2026-09-02 清账批——B6B「数据面恒 vacuous」遗留定谳）
//  提取器 BOOL_FIELDS 已含 ignoreWater（tools/extract-projectiles.mjs），json 现载
//  1457 终值：SetDefaults 直写 240 位（全部位于顶层 else-if 链块语句层,零嵌套
//  if/零 switch,块内无 =false 覆写）+ DefaultToSpray() :10703 展开（1015/1016/1017
//  喷射族）= 270 型 true。来源审计（2026-09-02）：240 置位点逐块求值 ∪ json 集合
//  双向零差（MISSING/EXTRA 双空）;dump-vs-磁盘 52 格差异全为已登记手补列
//  （localNPCHitCooldown/idStaticNPCHitCooldown/1117·1122 元组/639·121-126·597
//  算式列）,ignoreWater 列零漂移=无需重生成（裸重跑反抹手补列）。
//  消费面核对结论：原版仅两口读本旗（出生预置 :10888-10890 / 缓存刷新 :16895）,
//  AI 全读 `wet` 字段;本仓全部湿敏位的 id 域与 270 集互斥（F3③② 不变式）。
describe('★F3③ ignoreWater 数据面真值（1457 终值 270 型）', () => {
  it('列计数=270 且逐族抽查（直写族/helper 展开/1457 新弹）', () => {
    const ids: number[] = [];
    for (let t = 0; t <= 1135; t++) if (projectileData(t)?.ignoreWater === true) ids.push(t);
    expect(ids).toHaveLength(270);
    // 直写族锚点：水矢 5 / 水球 7,8 / 光标 86 / 毒刺 226 / 彩虹头 250 / 黏液族
    //   358,406,1042 / 随从五射手 373,375,407,423,613 + 963 / 凤凰载体 705 /
    //   骷髅王头 874 / 1457 新弹 1115,1119,1122,1125,1126,1129
    for (const t of [5, 7, 8, 86, 226, 250, 358, 406, 1042, 373, 375, 407, 423, 613,
      963, 705, 874, 1115, 1119, 1122, 1125, 1126, 1129]) {
      expect(projectileData(t)?.ignoreWater, `proj ${t}`).toBe(true);
    }
    // helper 展开位：DefaultToSpray() 三型（SetDefaults 本体仅一行调用 :9635-9638,
    //  提取器 DefaultTo* 展开通道交付——直写扫描看不到它们）
    for (const t of [1015, 1016, 1017]) {
      expect(projectileData(t)?.ignoreWater, `proj ${t}`).toBe(true);
    }
  });

  it('消费族禁入不变式：wet 缓存消费族+湿敏直探位 全表无 true（提取回归即爆红）', () => {
    // ① Arrow.ts:1442 wetCacheConsumer（蜂族 181/189/307/316/566 + 469 + 2 +
    //    IsDestroyedByWater 六型 85/15/188/34/1097/1106）——原文本就无 ignoreWater
    //    置位（水death/变型语义与本门互斥）;若提取回归误置 true,Arrow 三写点的
    //    门会静默吞掉水death ⇒ 本断言钉死提取面。
    for (const t of [181, 189, 307, 316, 566, 469, 2, 85, 15, 188, 34, 1097, 1106]) {
      expect(projectileData(t)?.ignoreWater ?? false, `proj ${t}`).toBe(false);
    }
    // ② 湿敏直探位（非缓存消费、直读液格/字段的登记近似,合法前提=id 域与 270 集互斥）：
    //    PhoenixBolt 706（AI_001 :56743 读 wet 字段→灭;载体 704 才真有门,尾行对照）/
    //    BallProjs 155,861 / 毛刺弹 376 / 钓浮标 360-366 / 虎 833-835 / 飞蛙 758 /
    //    连枷水变型 947,948（:44542 读字段）
    for (const t of [706, 155, 861, 376, 360, 361, 362, 363, 364, 365, 366,
      833, 834, 835, 758, 947, 948]) {
      expect(projectileData(t)?.ignoreWater ?? false, `proj ${t}`).toBe(false);
    }
    expect(projectileData(704)?.ignoreWater).toBe(true);   // 同族对照：704 载体真有门
  });
});

// =====================================================================
// ★V3 溅花/湿计数段（Projectile.cs:16935-17102,producer 站=湿缓存刷新位 2026-09-03）
//   + type34 火鞭浆穿支（:16933-16936）+ wetCount 出水冷却窗
// =====================================================================
describe('★V3 溅花/湿计数段（:16935-17102）逐值', () => {
  /** 尘/音捕获宿主（spawnDust 返回可变尘对象,字段覆写可断言） */
  function mkSplash(store: TileStore, projId: number, x: number, y: number) {
    const dusts: Array<{ type: number; x: number; y: number; sw: number; sh: number; d: { vx: number; vy: number; scale: number; alpha: number; noGravity: boolean; color: unknown } }> = [];
    const sounds: Array<{ file: string; vol: number; pitch: number }> = [];
    const a = new Arrow(x, y, 0, 0, 12, 1, projId, null, { grav: 0 });
    a.w = 10; a.h = 10;
    const g = {
      ...hooks(store),
      spawnDust: (sx: number, sy: number, sw: number, sh: number, type: number) => {
        const d = { vx: 1, vy: 1, scale: 1, alpha: 0, noGravity: false, color: null as unknown };
        dusts.push({ type, x: sx, y: sy, sw, sh, d });
        return d;
      },
      playSfxWav: (file: string, vol: number, _x?: number, _y?: number, pitch?: number) => {
        sounds.push({ file, vol, pitch: pitch ?? 0 });
        return true;
      },
    } as unknown as GameHooks;
    const tick = (n: number) => { for (let i = 0; i < n && !a.dead; i++) a.fixedUpdate(1 / 60, g); };
    // 溅花尘 = 溅花专用盒 (w+12,24)；同 tick 的 AI 尾尘通用段（2 型 d6 等,盒=w×h）一并
    // 入池,断言前按盒尺寸隔离（原版同拍多尘源,逐值断言须分流）
    const splash = () => dusts.filter((e) => e.sw === 22 && e.sh === 24);
    return { a, dusts, splash, sounds, tick };
  }

  const waterCol = (liquidType: number) => {
    const st = new TileStore(60, 160);
    st.liquid[st.idx(20, 40)] = LIQ; st.liquidType[st.idx(20, 40)] = liquidType;
    return st;
  };

  it('入水溅花：干区出生→渡入水列 → d33×10、盒 (x−6,y+h/2−8,w+12,24)、Splash_1×1', () => {
    const S = mkSplash(waterCol(1), 2, 309, 637);   // 出生干区（探针 [309,319] 与列 20 无交）
    S.tick(1);
    expect(S.splash().length).toBe(0);                 // 干拍零溅花
    S.a.x = 322;                                    // 渡入水列（探针 [322,332] ⊂ [320,336]）
    S.tick(1);
    expect(S.splash().length).toBe(10);                // :16950-16958 ×10
    expect(S.splash().every((e) => e.type === 33)).toBe(true);   // dustWater() 缺省档（waterStyle 0）
    expect(S.splash()[0].x).toBe(316);                 // 322−6
    expect(S.splash()[0].y).toBe(634);                 // 637+5−8（入水各支含 −8）
    expect(S.splash().every((e) => e.d.vy === -3 && e.d.vx === 2.5)).toBe(true);  // vy−4/vx×2.5
    expect(S.splash().every((e) => e.d.scale === 1.3 && e.d.alpha === 100 && e.d.noGravity)).toBe(true);
    expect(S.sounds.map((x) => ({ file: x.file, vol: x.vol })))
      .toEqual([{ file: 'Splash_1', vol: 1 }]);          // 循环外 ×1（Style 缺省 1）
    expect(S.sounds[0].pitch >= -0.1 && S.sounds[0].pitch <= 0.1).toBe(true); // Next(−10,11)×0.01
  });

  it('出水溅花：wetCount=10 冷却窗 + 水【水】支盒无 −8（:17059）+ 窗内再入水不重溅', () => {
    const S = mkSplash(waterCol(1), 2, 309, 637);
    S.tick(1);
    S.a.x = 322; S.tick(1);                         // 入水（溅一次）
    S.a.x = 500; S.a.y = 300;                       // 完全离液
    S.tick(1);
    expect(S.splash().length).toBe(20);                // 出水再 ×10
    expect(S.splash()[10].y).toBe(305);                // 300+5（【水】支无 −8,唯一例外）
    // :16984 wetCount=10 置位后同湿段尾 :17109-17112 即减 1（原版同拍 10→9）
    expect((S.a as unknown as { wetCount: number }).wetCount).toBe(9);
    S.a.x = 322; S.a.y = 637;                       // 窗内立即再入水
    S.tick(1);
    expect(S.splash().length).toBe(20);                // wetCount≠0 → 不重溅（:16936）
    expect((S.a as unknown as { wetCount: number }).wetCount).toBe(8);    // :17109-17112 每子步 −1
  });

  it('岩浆档：浆中粘滞弹出的是岩浆花 d35（:17047 else 支,非四液）', () => {
    const st = waterCol(2);                          // 岩浆列 20
    st.liquid[st.idx(22, 40)] = LIQ; st.liquidType[st.idx(22, 40)] = 1;
    const S = mkSplash(st, 2, 322, 637);            // 出生即在浆里（预置 wet+lavaWet）
    S.tick(1);
    expect(S.splash().length).toBe(0);                 // 湿拍 !wet 门假 → 无入水溅花
    S.a.x = 500; S.a.y = 300;                       // 离液
    S.tick(1);
    expect(S.splash().length).toBe(10);
    expect(S.splash().every((e) => e.type === 35)).toBe(true);   // lavaWet 粘滞 → 岩浆档
    expect(S.splash().every((e) => e.d.vy === -0.5)).toBe(true); // vy−1.5
  });

  it('微光档：d308 六掷三色 + Splash_4/5 音量 0.75 循环内播但同拍去重=各 1 次', () => {
    const S = mkSplash(waterCol(4), 2, 309, 637);
    S.tick(1);
    S.a.x = 322; S.tick(1);                         // 入微光
    expect(S.splash().length).toBe(10);
    expect(S.splash().every((e) => e.type === 308)).toBe(true);
    expect(S.splash().every((e) => e.d.alpha === 0 && e.d.noGravity)).toBe(true); // 微光支无 α100
    const palette = [[255, 255, 210], [190, 245, 255], [255, 150, 255], [190, 175, 255]];
    expect(S.splash().every((e) => {
      const c = e.d.color as { r: number; g: number; b: number; a: number };
      return palette.some(([r, g, b]) => c.r === r && c.g === g && c.b === b && c.a === 255);
    })).toBe(true);
    expect(S.sounds).toHaveLength(1);               // case19 未停 break 同拍去重（:874-878）
    expect(S.sounds[0].file).toBe('Splash_4');
    expect(S.sounds[0].vol).toBe(0.75);             // style4/5 ×0.75（:893-896）
    expect(S.sounds[0].pitch >= -0.2 && S.sounds[0].pitch <= 0).toBe(true);   // Next(−20,1)×0.01
    S.a.x = 500; S.a.y = 300; S.tick(1);            // 出水 → Splash_5
    expect(S.sounds).toHaveLength(2);
    expect(S.sounds[1].file).toBe('Splash_5');
  });

  it('type34 火鞭浆穿支（:16933-16936）：lavaWet 不粘滞、当拍湿旗全清 → 浆里浆外零溅花', () => {
    const S = mkSplash(waterCol(2), 34, 322, 637);  // 出生即在浆里
    S.tick(1);
    expect(S.splash().length).toBe(0);                 // flag2/wet 被 34 支清零 → 无入水溅花
    expect((S.a as unknown as { lavaWet: boolean }).lavaWet).toBe(false);
    expect((S.a as unknown as { wet: boolean }).wet).toBe(false);
    S.a.x = 500; S.a.y = 300;                       // 离浆
    S.tick(1);
    expect(S.splash().length).toBe(0);                 // wet 已是 false → 不走出水支
    expect((S.a as unknown as { wetCount: number }).wetCount).toBe(0);
  });
});
