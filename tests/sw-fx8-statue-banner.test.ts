// SW-FX8（2026-09-10）审计 tile-audit-2026-08-23.md E 区 ❌#5 雕像/❌#6 旗帜补强闸：
//   两表 2026-08-23 二批已转录（vanillaStyleDrops.ts STATUES 83 档/BANNERS 316 档,
//   styleDropVid case 105/91+styleFromFrame 两式）——本文件补「与原版物品全集双射」
//   与「全帧域 style↔vid 往返」两道此前未锁的完整性面（style-drop-restore.test.ts
//   A3 段为抽查锚,二者互补）。
// 金标：
//   - StatueStyleToItem（WorldGen.cs:38311-38374）实域 0..82（素材 55 列×3 行带,
//     槽 83..164 空白）;帧式 fx/36+(fy/54%3)*55（:38542-38545）→ 反演 fx=(s%55)*36,
//     fy=floor(s/55)*54。
//   - CheckBanner（WorldGen.cs:46493,掉落链 :46564-46655）实域 0..315;帧式
//     fx/18+(fy/54)*111（:46566-46567）→ 反演 fx=(s%111)*18,fy=floor(s/111)*54;
//     PlaceBanner :46660 反函数同式（frameX=(style%111)*18/frameY=style/111*54）。
//   - vanilla.json items：createTile=105 全集 82 件 + 470 蘑菇雕像（createTile=349,
//     原版语义照抄,不掉 place_v_）= STATUES 83 档零缺零余;createTile=91 全集 316 件
//     = BANNERS 316 档全等双射。
import { describe, expect, it } from 'vitest';
import vanillaJson from '../public/sprites/vanilla.json';
import { STATUES, styleDropVid, styleDropVidOfFrames } from '../src/data/vanillaStyleDrops';

const items = vanillaJson.items as unknown as Record<string, { createTile?: number; name?: string }>;

describe('SW-FX8 雕像 105（❌#5,StatueStyleToItem :38311-38374）', () => {
  it('83 档零重复;与 vanilla.json createTile=105 全集(82)双射 + 470 蘑菇雕像特例', () => {
    expect(STATUES.length).toBe(83);
    expect(new Set(STATUES).size).toBe(83);
    const c105 = new Set(
      Object.entries(items).filter(([, v]) => v.createTile === 105).map(([k]) => Number(k)),
    );
    expect(c105.size).toBe(82);
    // 82/83 档=createTile 105 物品全集;唯一例外 style 34 → 470（createTile=349 专属 tile）
    const inC105 = STATUES.filter((v) => c105.has(v));
    expect(inC105.length).toBe(82);
    const notInC105 = STATUES.filter((v) => !c105.has(v));
    expect(notInC105).toEqual([470]);
    expect(items['470'].createTile).toBe(349);   // 蘑菇雕像物品 → 专属 tile 349
    // 反向：createTile=105 物品无漏网
    const sSet = new Set(STATUES);
    expect([...c105].filter((v) => !sSet.has(v))).toEqual([]);
  });

  it('全帧域往返 0..82（Check2xX :38542-38542 反演 fx=(s%55)*36,fy=floor(s/55)*54）', () => {
    for (let s = 0; s <= 82; s++) {
      const fx = (s % 55) * 36;
      const fy = Math.floor(s / 55) * 54;
      expect(styleDropVidOfFrames(105, fx, fy), `style ${s}`).toBe(STATUES[s]);
    }
  });

  it('段锚抽查（StatueStyleToItem 1457 case 行号）', () => {
    expect(styleDropVid(105, 0)).toBe(360);      // case 0 :38315 盔甲
    expect(styleDropVid(105, 1)).toBe(52);       // case 1 :38318 天使
    expect(styleDropVid(105, 49)).toBe(1462);    // case 49 :38339
    expect(styleDropVid(105, 50)).toBe(2672);    // case 50 :38342 鲨鱼
    expect(styleDropVid(105, 76)).toBe(4397);    // case 76 :38362 猫头鹰
    expect(styleDropVid(105, 81)).toBe(5318);    // case 81 :38367 巨嘴鸟(1.4.5)
  });
});

describe('SW-FX8 旗帜 91（❌#6,CheckBanner :46564-46655）', () => {
  it('316 档与 vanilla.json createTile=91 全集全等双射（零缺零余零重复）', () => {
    const c91 = new Set(
      Object.entries(items).filter(([, v]) => v.createTile === 91).map(([k]) => Number(k)),
    );
    const vids: number[] = [];
    for (let s = 0; s <= 315; s++) vids.push(styleDropVid(91, s));
    expect(new Set(vids).size).toBe(316);          // 零重复
    expect(c91.size).toBe(316);
    for (const v of vids) expect(c91.has(v), `vid ${v} 应为 createTile=91 物品`).toBe(true);
    const vSet = new Set(vids);
    expect([...c91].filter((v) => !vSet.has(v))).toEqual([]);   // 反向零缺
  });

  it('全帧域往返 0..315（:46566-46567 反演 fx=(s%111)*18,fy=floor(s/111)*54;PlaceBanner :46660 同式）', () => {
    for (let s = 0; s <= 315; s++) {
      const fx = (s % 111) * 18;
      const fy = Math.floor(s / 111) * 54;
      expect(styleDropVidOfFrames(91, fx, fy), `style ${s}`).toBe(styleDropVid(91, s));
    }
  });

  it('22 段边界锚（else-if 链段界,1457 行号）', () => {
    expect(styleDropVid(91, 0)).toBe(337);       // else :46652（337+style）
    expect(styleDropVid(91, 3)).toBe(340);
    expect(styleDropVid(91, 4)).toBe(789);       // :46648（785+style）
    expect(styleDropVid(91, 21)).toBe(1469);     // :46640（1448+style,★16-21 非死码段）
    expect(styleDropVid(91, 22)).toBe(1615);     // :46632（1593+style）
    expect(styleDropVid(91, 108)).toBe(1701);
    expect(styleDropVid(91, 109)).toBe(2897);    // :46628（2788+style）
    expect(styleDropVid(91, 207)).toBe(3390);    // :46624（3183+style）
    expect(styleDropVid(91, 272)).toBe(3780);    // :46616 恒值档
    expect(styleDropVid(91, 294)).toBe(4602);    // :46600 恒值档
    expect(styleDropVid(91, 310)).toBe(5352);    // :46588
    expect(styleDropVid(91, 315)).toBe(5673);    // :46568 尾档
  });
});
