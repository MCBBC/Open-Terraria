// 终清波·styleRerolls 渲染行扩充回归（2026-09）。
// 基准：Terarria1458 反编译 WorldGen.cs setBG(:7165-7716)/SetForestBGSet(:7589-7716/
// :7718-7741 default=样0→[9,10,11])/RandomizeBackgrounds 起掷链(:7897-8035) +
// Main.cs DrawSurfaceBG_* 各群系函数（雪 case 3 连 snowMntBG 一起换 :7305-7440、
// GoodEvilDesert 兜底 26/27 :61852-61892、山体门 desertBG!=4 / crimsonBG!=5
// :60806-60848）。本批把 BiomeBackground 各 STYLES 表扩到与原版可行值域一一对应：
//   forest 19 视觉 / snow 15（结构化行含山体对）/ corrupt 7（补样 52）/
//   desert 8（P/C/H/R 四列 + 样 4）/ mushroom 5 档全表修正 / jungle/crimson/hallow/
//   ocean 原已全覆盖。测试覆盖：①表完备性+贴图资产在盘;②每行渲染遍历（绘制集 =
//   行非负槽位全集,无域外贴图）;③雪子族山体随行切换/纯树行无山体;④沙漠侵染列与
//   GoodEvilDesert 兜底、样式 4 无山体三层;⑤猩红样 5 山体抑制;⑥森林族门 sameVisual;
//   ⑦原版掷链输出 ⊆ 渲染行样式域（rollUntilDifferent 家族在新值域的「必异可达」闭包）。
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BiomeBackground, FOREST_STYLES, SNOW_STYLES, CORRUPT_STYLES, CRIMSON_STYLES,
  JUNGLE_STYLES, HALLOW_STYLES, MUSHROOM_STYLES, DESERT_STYLES, OCEAN_STYLES,
  VANILLA_FOREST_STYLE_ORDER, VANILLA_SNOW_STYLE_ORDER,
  VANILLA_CORRUPT_STYLE_ORDER, VANILLA_DESERT_STYLE_ORDER,
} from '../src/render/BiomeBackground';
import {
  rollVariantInDomain, rollSnowBg, rollCorruptBg, rollDesertBg, rollForestBg,
  rollUntilDifferent, pickZoneArea, type Rng,
} from '../src/world/styleRerolls';

const randRng: Rng = {
  next(max?: number) { return max === undefined ? Math.random() : Math.floor(Math.random() * max); },
};

/** 行 → 非负贴图 id 集（含全部结构化槽位 m/t/p/c/h/r；负数 = 该步不画） */
function rowIds(row: unknown): number[] {
  const r = row as Record<string, number[] | undefined>;
  if (Array.isArray(row)) return (row as number[]).filter((n) => n >= 0);
  return ['m', 't', 'p', 'c', 'h', 'r'].flatMap((k) => (r[k] ?? [])).filter((n) => n >= 0);
}

// ---------------------------------------------------------------------------
// ① 表完备性 vs setBG 可行值域 + 贴图资产在盘（渲染实际使用的贴图行不缺）
// ---------------------------------------------------------------------------
describe('表完备性与资产在盘', () => {
  it('各群系表行数 = setBG 可行视觉数（forest 19/snow 15/desert 8/corrupt 7/mushroom 5/' +
    'jungle 7/crimson 7/hallow 6/ocean 8）', () => {
    expect(FOREST_STYLES.length).toBe(19);
    expect(VANILLA_FOREST_STYLE_ORDER.length).toBe(FOREST_STYLES.length);   // 行序↔样式序自洽
    expect(new Set(VANILLA_FOREST_STYLE_ORDER).size).toBe(19);              // 复制行已被消灭
    expect(SNOW_STYLES.length).toBe(15);
    expect(VANILLA_SNOW_STYLE_ORDER.length).toBe(15);
    expect(DESERT_STYLES.length).toBe(8);
    expect(VANILLA_DESERT_STYLE_ORDER.length).toBe(8);
    expect(CORRUPT_STYLES.length).toBe(7);
    expect(VANILLA_CORRUPT_STYLE_ORDER.length).toBe(7);
    expect(MUSHROOM_STYLES.length).toBe(5);
    expect(JUNGLE_STYLES.length).toBe(7);
    expect(CRIMSON_STYLES.length).toBe(7);
    expect(HALLOW_STYLES.length).toBe(6);
    expect(OCEAN_STYLES.length).toBe(8);
    // 行空间口（biomeVariantRows/setBiomeVariant 取模钳）随表长自动扩张——单点同源
    const bg = new BiomeBackground();
    expect(bg.biomeVariantRows('forest').length).toBe(FOREST_STYLES.length);
    expect(bg.biomeVariantRows('snow').length).toBe(SNOW_STYLES.length);
    expect(bg.biomeVariantRows('desert').length).toBe(DESERT_STYLES.length);
    expect(bg.biomeVariantRows('corrupt').length).toBe(CORRUPT_STYLES.length);
    expect(bg.biomeVariantRows('mushroom').length).toBe(MUSHROOM_STYLES.length);
  });

  it('关键行三元组 = 原版 setBG 直抄值（旧行语义保留在正确新位）', () => {
    // forest：default 样 0 的 [9,10,11]（:7711-7716）、样 7 [176,177]/[178]、样 13 无 Step2 山
    expect(FOREST_STYLES[VANILLA_FOREST_STYLE_ORDER.indexOf(0)]).toEqual({ m: [7, 8], t: [9, 10, 11] });
    expect(FOREST_STYLES[VANILLA_FOREST_STYLE_ORDER.indexOf(31)].t[2]).toBe(11);
    expect(FOREST_STYLES[VANILLA_FOREST_STYLE_ORDER.indexOf(13)].m[1]).toBe(-1);
    // snow：case 3 山体覆写矩阵（98/99、98/100、98/101、-1/-1 与 case 8 不覆写=35/36）
    expect(SNOW_STYLES[VANILLA_SNOW_STYLE_ORDER.indexOf(2)].m).toEqual([98, 99]);
    expect(SNOW_STYLES[VANILLA_SNOW_STYLE_ORDER.indexOf(22)].t).toEqual([37, 38, 39]);
    expect(SNOW_STYLES[VANILLA_SNOW_STYLE_ORDER.indexOf(31)].m).toEqual([98, 100]);
    expect(SNOW_STYLES[VANILLA_SNOW_STYLE_ORDER.indexOf(41)].m).toEqual([98, 101]);
    expect(SNOW_STYLES[VANILLA_SNOW_STYLE_ORDER.indexOf(5)].m).toEqual([-1, -1]);
    expect(SNOW_STYLES[VANILLA_SNOW_STYLE_ORDER.indexOf(8)].m).toEqual([35, 36]);
    // corrupt 51/52（:7251-7262）、desert 4 三槽 + 侵染四列（:7462-7508）、蘑菇五档全表
    expect([...CORRUPT_STYLES[5], ...CORRUPT_STYLES[6]]).toEqual([324, 323, 322, 324, 226, 322]);
    expect([...DESERT_STYLES[4].p]).toEqual([248, 249, 250]);
    expect([...DESERT_STYLES[5].c ?? []]).toEqual([310, 307, -1]);
    expect([...DESERT_STYLES[6].h ?? []]).toEqual([314, 312, -1]);
    expect([...DESERT_STYLES[7].r ?? []]).toEqual([318, 317, -1]);
    expect(MUSHROOM_STYLES.map((r) => r[0])).toEqual([46, 231, 234, 287, 321]);   // :7528-7559
  });

  it('全部引用贴图 Background_N.png 在盘且 ≤343（渲染行不落空图）', () => {
    const dir = fileURLToPath(new URL('../public/sprites/vanilla/', import.meta.url));
    const ids = new Set<number>(OCEAN_STYLES);
    for (const r of [...FOREST_STYLES, ...SNOW_STYLES]) for (const n of rowIds(r)) ids.add(n);
    for (const t of [...CORRUPT_STYLES, ...CRIMSON_STYLES, ...JUNGLE_STYLES,
      ...HALLOW_STYLES, ...MUSHROOM_STYLES].flat()) if (t >= 0) ids.add(t);
    for (const d of DESERT_STYLES) for (const n of rowIds(d)) ids.add(n);
    expect(ids.size).toBeGreaterThan(150);                              // 扩表触及面守门
    for (const n of ids) {
      expect(n, '非负 id').toBeGreaterThanOrEqual(0);
      expect(n, `Background_${n} 应 ≤343`).toBeLessThanOrEqual(343);
      expect(existsSync(`${dir}Background_${n}.png`), `Background_${n}.png`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ② 每行渲染遍历（drawSurface 实驱）：绘制集 = 行非负槽位全集
// ---------------------------------------------------------------------------
interface DrawRec { n: number }
/** drawSurface 实驱探针：固定 bgStyle/alpha 槽后直调私有 drawSurface,记账绘制贴图号。
 *  worldStub 只供 seedFor/drawSurface 读数（store.h 缺省走小世界档）。 */
function renderSlot(slot: number, privates: Record<string, unknown>, zoneScene: Record<string, boolean> = {}): number[] {
  const bg = new BiomeBackground(false);
  const b = bg as unknown as Record<string, any>;
  b.loadBg = () => Promise.resolve();                       // Node 无 Image——预热桩化
  // 翻转烘焙走 document.createElement('canvas')（Node 无 DOM）——同号直通等价件
  b.flippedOf = (im: { __n?: number }) => im;
  b.img = (n: number) => {
    if (n < 0) return null;
    return { width: 1024, height: 600, complete: true, __n: n } as unknown as HTMLImageElement;
  };
  b.seededFor = 42;                                         // 固定种子面
  b.bgStyle = slot;
  b.alphaFront = new Array(16).fill(0);
  b.alphaFront[slot] = 1;
  b.alphaFar = new Array(16).fill(0);
  b.alphaFar[slot] = 1;
  Object.assign(b, privates);                               // 各群系变体档注入
  const recs: DrawRec[] = [];
  const blit = {
    img: (im: ImageBitmap | HTMLImageElement, _sx: number, _sy: number, _sw: number, _sh: number,
      _dx: number, _dy: number, _dw: number, _dh: number) => {
      recs.push({ n: (im as { __n?: number }).__n ?? -1 });
    },
    fill: () => {},
  };
  const cam = { x: 3000, y: 100 * 16, zoom: 1.25 };
  // phase='surface' 只走地表层（无 store → world.store?.h 兜底档,camTopY 门恒过）
  (bg as unknown as { drawSurface: (...a: unknown[]) => void })
    .drawSurface(blit, { seed: 42, groundLevel: 100, rockLevel: 200, treeStyle: [0, 1, 2, 3],
      seedFlags: {}, underworldBG: 0, store: { w: 4200, h: 1200 },
      scene: zoneScene }, cam, cam.y, 2400, 1512, 862, [1, 1, 1]);
  return recs.map((r) => r.n);
}

describe('扩表后逐行渲染遍历', () => {
  /** 绘制号判定：行内 173 走原版四帧轮换（:62289-62296 → Background_251+frame），
   *  探针记账到的是替换后贴图号——按等价族归并 */
  function hits(got: Iterable<number>, tex: number): boolean {
    const arr = [...got];
    if (arr.includes(tex)) return true;
    return tex === 173 && [251, 252, 253, 254].some((f) => arr.includes(f));
  }
  it('森林 19 行：每行全部非负槽位真出图;s31 不再凭空多画 92（曾双绘 bug 回归门）', () => {
    for (let i = 0; i < FOREST_STYLES.length; i++) {
      const want = new Set(rowIds(FOREST_STYLES[i]));
      const got = renderSlot(0, { forestStyles: [i, i, i, i] });
      const uniq = new Set(got);
      for (const tex of want) expect(hits(uniq, tex), `forest row ${i} 缺 ${tex}`).toBe(true);
      for (const tex of uniq) {
        expect(want.has(tex) || (tex >= 251 && tex <= 254), `forest row ${i} 多出 ${tex}`).toBe(true);
      }
    }
    const s31 = renderSlot(0, { forestStyles: [VANILLA_FOREST_STYLE_ORDER.indexOf(31), 0, 0, 0] });
    expect(s31.includes(92)).toBe(false);                 // 曾 t0==91 特例误作再画一遍 92
  });

  it('雪 15 行：山体随行切换（98/99、98/100、98/101、-1、269/270、case8 保 35/36）',
    () => {
      const order = VANILLA_SNOW_STYLE_ORDER;
      for (let i = 0; i < SNOW_STYLES.length; i++) {
        const st = order[i];
        const row = SNOW_STYLES[i];
        const want = new Set([...row.m, ...row.t].filter((n) => n >= 0));
        const got = new Set(renderSlot(7, { snowStyle: i }));
        for (const tex of want) expect(got.has(tex), `snow style ${st} 缺 ${tex}`).toBe(true);
        for (const tex of got) expect(want.has(tex), `snow style ${st} 多出 ${tex}`).toBe(true);
      }
      // 子族专检：纯山体组只有山没有树；巨型山脉组只树无山（旧硬编码 35/36 已废）
      const s2 = renderSlot(7, { snowStyle: VANILLA_SNOW_STYLE_ORDER.indexOf(2) });
      expect(s2).toContain(98);
      expect(s2).not.toContain(37);
      const s5 = renderSlot(7, { snowStyle: VANILLA_SNOW_STYLE_ORDER.indexOf(5) });
      expect(s5).toContain(258);
      expect(s5).not.toContain(35);
    });

  it('腐化行遍历 + 猩红山体门（crimsonBG!=5）+ 蘑菇五档', () => {
    // 腐化全 7 行逐行完备（含样式 52 的 [324,226,322] 混装行）
    for (let i = 0; i < CORRUPT_STYLES.length; i++) {
      const want = CORRUPT_STYLES[i];
      const got = renderSlot(1, { corruptStyle: i });
      for (const tex of want) {
        if (tex < 0) continue;
        expect(got).toContain(tex);
      }
      expect(got).toContain(24);
    }
    const cr0 = renderSlot(8, { crimsonStyle: 0 });
    expect(cr0).toContain(24);
    expect(cr0).toContain(42);                            // 非 5 样式照常叠通用山
    const cr5 = renderSlot(8, { crimsonStyle: 5 });       // 样式 5 [255,256,257] 自带远景
    expect(cr5).toContain(255);
    expect(cr5.includes(24)).toBe(false);
    expect(cr5.includes(42)).toBe(false);
    for (let i = 0; i < MUSHROOM_STYLES.length; i++) {
      const got = new Set(renderSlot(9, { mushroomStyle: i }));
      for (const tex of MUSHROOM_STYLES[i]) {
        if (tex < 0) continue;
        expect(got.has(tex), `mushroom row ${i} 缺 ${tex}`).toBe(true);
      }
      expect(got.has(26)).toBe(false);                    // 旧错转录画不再出现
      expect(got.has(111)).toBe(false);
    }
  });

  it('沙漠四列结构：样式 4 无山体三层齐发;侵染列按好恶槽取色;纯样好恶槽落 26/27 兜底且无山体', () => {
    const DESERT_SLOT = 2, CORRUPT_D = 5, CRIMSON_D = 14;
    const pure0 = renderSlot(DESERT_SLOT, { desertStyle: 0 });
    expect(pure0).toContain(21);
    expect(pure0).toContain(23);                          // 通用山照常（非样式 4）
    const s4 = renderSlot(DESERT_SLOT, { desertStyle: 4 });
    for (const tex of [248, 249, 250]) expect(s4).toContain(tex);
    expect(s4.includes(23)).toBe(false);
    expect(s4.includes(22)).toBe(false);                  // desertBG!=4 门（:60806/:60844）
    const infestedC = renderSlot(CORRUPT_D, { desertStyle: 5 });
    for (const tex of [310, 307]) expect(infestedC).toContain(tex);   // Corrupt 列
    const infestedR = renderSlot(CRIMSON_D, { desertStyle: 6 });
    for (const tex of [318, 316]) expect(infestedR).toContain(tex);   // Crimson 列
    const fallback = renderSlot(CORRUPT_D, { desertStyle: 1 });       // 纯样 1 无侵染列
    for (const tex of [26, 27]) expect(fallback).toContain(tex);
    expect(fallback.includes(108)).toBe(false);           // Pure 组不外溢进好恶槽
    expect(fallback.includes(23)).toBe(false);            // 好恶沙漠原版无山步
  });

  it('神圣 6 行照常三轴齐全（该表原本全覆盖,扩表后仍完备）', () => {
    for (let i = 0; i < HALLOW_STYLES.length; i++) {
      const want = HALLOW_STYLES[i];
      const got = new Set(renderSlot(6, { hallowStyle: i }));
      for (const tex of want) {
        if (tex < 0) continue;
        expect(got.has(tex), `hallow row ${i} 缺 ${tex}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ③ 种子播种面扫描 × 新域必异（每区 rollUntilDifferent「必异」在扩域内的闭包）
// ---------------------------------------------------------------------------
describe('重掷与播种域扫描', () => {
  it('seedFor 全 seed 域：biomeVariant 恒落 biomeVariantRows 可行域内', () => {
    const kinds = ['corrupt', 'crimson', 'jungle', 'snow', 'hallow', 'mushroom',
      'desert', 'ocean'] as const;
    for (let seed = -40; seed <= 260; seed += 7) {
      const bg = new BiomeBackground();
      (bg as unknown as { seedFor: (w: unknown) => void })
        .seedFor({ seed, store: { w: 4200 }, treeStyle: [0, 1, 2, 3] });
      for (const k of kinds) {
        const v = bg.biomeVariant(k);
        expect(bg.biomeVariantRows(k)).toContain(v);
      }
    }
  });

  it('原版掷链输出 ⊆ 渲染行样式域（snow/corrupt/desert/forest 四链绑定到 setBG 全域）', () => {
    for (let t = 0; t < 200; t++) {
      expect(VANILLA_SNOW_STYLE_ORDER).toContain(rollSnowBg(-1, randRng));
      expect(VANILLA_CORRUPT_STYLE_ORDER).toContain(rollCorruptBg(-1, randRng));
      expect(VANILLA_DESERT_STYLE_ORDER).toContain(rollDesertBg(-1, randRng));
      expect(VANILLA_FOREST_STYLE_ORDER).toContain(rollForestBg(randRng));
    }
  });

  it('每区 rollUntilDifferent 必异在新域成立：zone 优先级链逐区驱动可行域重掷 60 次,每次既落行内又变档', () => {
    const bg = new BiomeBackground();
    (bg as unknown as { loadBg: () => Promise<void> }).loadBg = () => Promise.resolve();  // setBiomeVariant 预温桩化（Node 无 Image）
    const zones: Array<{ scene: Record<string, boolean>; kind: Parameters<typeof bg.biomeVariant>[0] }> = [
      { scene: { zoneGlowshroom: true }, kind: 'mushroom' },
      { scene: { zoneDesert: true }, kind: 'desert' },
      { scene: { zoneDesert: true, zoneCorrupt: true }, kind: 'desert' },
      { scene: { zoneHallow: true }, kind: 'hallow' },
      { scene: { zoneCorrupt: true }, kind: 'corrupt' },
      { scene: { zoneCrimson: true }, kind: 'crimson' },
      { scene: { zoneJungle: true }, kind: 'jungle' },
      { scene: { zoneSnow: true }, kind: 'snow' },
      { scene: { zoneBeach: true }, kind: 'ocean' },
    ];
    for (const z of zones) {
      // pickZoneArea 的 zone 判据与 preferred 槽一致——先验锚（防场景键漂移哑测）
      const area = pickZoneArea(z.scene as never, 100, [100, 200, 300]);
      expect(area.kind, JSON.stringify(z.scene)).not.toBe('forest');
      const rows = bg.biomeVariantRows(z.kind);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      let prev = bg.biomeVariant(z.kind);
      for (let t = 0; t < 60; t++) {
        const nv = rollVariantInDomain(rows, prev, undefined, randRng)!;
        expect(rows).toContain(nv);                        // 掷即渲染可达（扩后全域仍闭合）
        expect(nv).not.toBe(prev);                         // 「必异」在新域内成立
        bg.setBiomeVariant(z.kind, nv);
        prev = bg.biomeVariant(z.kind);
      }
    }
    // 森林四段族门版：from 家族成员不出族内其余行（sameVisual 实例路）
    const fRows = bg.biomeVariantRows('forest');
    let prev = bg.biomeVariant('forest0');
    for (let t = 0; t < 120; t++) {
      const nv = rollVariantInDomain(fRows, prev, (a, b) => bg.sameVisual('forest', a, b), randRng)!;
      expect(fRows).toContain(nv);
      expect(prev === -1 || !bg.sameVisual('forest', prev, nv)).toBe(true);
      bg.setBiomeVariant('forest0', nv);
      prev = bg.biomeVariant('forest0');
    }
  });

  it('rollUntilDifferent 参考链与扩表的值域快照核对（mushroom Next(5)=5 档等）', () => {
    for (let t = 0; t < 60; t++) {
      const v = rollUntilDifferent('mushroom', -1, randRng);      // 全档必须落在 5 行表内
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(MUSHROOM_STYLES.length);
      const o = rollUntilDifferent('ocean', -1, randRng);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(OCEAN_STYLES.length);
    }
  });
});
