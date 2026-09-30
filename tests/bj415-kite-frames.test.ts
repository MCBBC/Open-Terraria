// ★BJ415 2026-09-30「猪龙风筝天上飞三只猪龙」定谳判别面：
//   根因 = 风筝族本体帧【横切】网格缺表——Main.DrawKite（1457 Main.cs:37972）
//   `value.Frame(projFrames[type], 1, proj.frame)` 横参=列数（帧宽=W/列、全高;
//   Utils.Frame :1389 num*tex.Width/横参）,projFrameImg 旧竖切把 826 猪龙 336×80
//   三变体横排表（粉/紫/红 各 112×80）切成 336×27 全宽横带 = 三只"猪龙"同屏、
//   线拴中间只（用户实报三只之谜=单只单 draw,非连放三只）。本测试钉：
//   ①24 型帧数全表（vanilla Main.projFrames Main.cs:8771-8797 + vanilla-projframes
//     json 双账对拍）②836/全 12 多帧型横切矩形钉值 ③贴图实尺（PNG IHDR）入界
//   ④横带病灶判别（帧宽必须 ≠ 整表宽）⑤单帧 12 型不越权（grid null）。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { projFrameCount, projGridRect } from '../src/entities/Arrow';

/** PNG IHDR 尺寸（字节 16-24 大端宽高）——foxparks-grid-frames 同式 */
function pngSize(rel: string): { w: number; h: number } {
  const buf = readFileSync(resolve(__dirname, rel));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** 24 风筝弹幕型（aiStyle 160;=KITE_ITEM_PROJ 值域） */
const KITE_PROJS = [766, 767, 768, 769, 770, 771, 822, 823, 824, 826, 827, 828,
  829, 830, 838, 839, 840, 843, 844, 845, 846, 850, 852, 853];

/** vanilla Main.projFrames 终值（1457 Main.cs:8771-8797 直读;未赋值=1） */
const VANILLA_FRAMES: Record<number, number> = {
  766: 4, 767: 4, 768: 4, 769: 4, 770: 4,
  771: 1, 822: 1, 823: 1, 824: 4, 826: 3, 827: 1,
  828: 2, 829: 2, 830: 1, 838: 1, 839: 4, 840: 4,
  843: 1, 844: 1, 845: 1, 846: 1, 850: 1, 852: 1, 853: 4,
};

/** 多帧型横切网格钉值（=PROJ_GRID 风筝族;贴图实尺 ÷ 列数 = 帧矩形） */
const MULTIFRAME: Array<{ id: number; cols: number; cw: number; ch: number }> = [
  { id: 766, cols: 4, cw: 68, ch: 68 },
  { id: 767, cols: 4, cw: 68, ch: 68 },
  { id: 768, cols: 4, cw: 68, ch: 68 },
  { id: 769, cols: 4, cw: 68, ch: 68 },
  { id: 770, cols: 4, cw: 68, ch: 68 },
  { id: 824, cols: 4, cw: 114, ch: 78 },
  { id: 826, cols: 3, cw: 112, ch: 80 },
  { id: 828, cols: 2, cw: 58, ch: 44 },
  { id: 829, cols: 2, cw: 58, ch: 44 },
  { id: 839, cols: 4, cw: 114, ch: 78 },
  { id: 840, cols: 4, cw: 114, ch: 78 },
  { id: 853, cols: 4, cw: 128, ch: 132 },
];

const SINGLE_FRAME = KITE_PROJS.filter((id) => !MULTIFRAME.some((m) => m.id === id));

describe('BJ415 ① 24 型帧数全表（Main.projFrames 对拍 + json 双账）', () => {
  it('projFrameCount 逐型 = vanilla Main.projFrames（grid 表/竖条 json/缺省三源合流终值）', () => {
    for (const id of KITE_PROJS) {
      expect(projFrameCount(id), `proj ${id}`).toBe(VANILLA_FRAMES[id]);
    }
  });

  it('vanilla-projframes.json 双账同值（帧数源漂移即红——BJ378 对账口径）', () => {
    const json = JSON.parse(readFileSync(
      resolve(__dirname, '..', 'src/data/vanilla-projframes.json'), 'utf8',
    )) as Record<string, number>;
    for (const id of KITE_PROJS) {
      expect(json[String(id)] ?? 1, `proj ${id}`).toBe(VANILLA_FRAMES[id]);
    }
  });
});

describe('BJ415 ② 826 猪龙横切钉值（336×80 三变体 → 112×80/帧）', () => {
  it('帧矩形 sx=帧×112、全高 80（DrawKite Frame(3,1,frame) 直译）', () => {
    expect(projGridRect(826, 0)).toEqual({ sx: 0, sy: 0, sw: 112, sh: 80, count: 3 });
    expect(projGridRect(826, 1)).toEqual({ sx: 112, sy: 0, sw: 112, sh: 80, count: 3 });
    expect(projGridRect(826, 2)).toEqual({ sx: 224, sy: 0, sw: 112, sh: 80, count: 3 });
  });

  it('越界钳末帧（frame=ai[1] 恒 0,但钳面钉住防越域采样）', () => {
    expect(projGridRect(826, 3)).toEqual(projGridRect(826, 2));
    expect(projGridRect(826, -1)).toEqual(projGridRect(826, 0));
  });

  it('「三只猪龙」横带病灶判别：帧宽 112 必须 ≠ 整表宽 336（旧竖切 sw=全宽）', () => {
    const sheet = pngSize('../public/sprites/vanilla/Projectile_826.png');
    expect([sheet.w, sheet.h]).toEqual([336, 80]);
    const r = projGridRect(826, 0)!;
    expect(r).not.toBeNull();
    expect(r.sw, '帧宽=112（旧病灶=336 全宽横带）').toBe(112);
    expect(r.sw).toBeLessThan(sheet.w);
  });
});

describe('BJ415 ③ 全 12 多帧型横切网格 + 贴图实尺入界', () => {
  it('逐型逐帧：sx=帧×cw、sy=0、cw×ch 帧,全部入 PNG 界（IHDR 实尺）', () => {
    for (const m of MULTIFRAME) {
      const sheet = pngSize(`../public/sprites/vanilla/Projectile_${m.id}.png`);
      expect(sheet.w, `proj ${m.id} 列数×帧宽`).toBe(m.cols * m.cw);
      expect(sheet.h, `proj ${m.id} 帧高=全高`).toBe(m.ch);
      for (let f = 0; f < m.cols; f++) {
        const r = projGridRect(m.id, f)!;
        expect(r, `proj ${m.id} frame ${f}`).not.toBeNull();
        expect(r.sx).toBe(f * m.cw);
        expect(r.sy).toBe(0);
        expect(r.sw).toBe(m.cw);
        expect(r.sh).toBe(m.ch);
        expect(r.count).toBe(m.cols);
        expect(r.sx + r.sw).toBeLessThanOrEqual(sheet.w);
        expect(r.sy + r.sh).toBeLessThanOrEqual(sheet.h);
      }
    }
  });
});

describe('BJ415 ⑤ 单帧 12 型不越权（两轴同形,grid 保持 null）', () => {
  it('单帧型不在网格表（projGridRect=null）且帧数恒 1', () => {
    expect(SINGLE_FRAME).toHaveLength(12);
    for (const id of SINGLE_FRAME) {
      expect(projGridRect(id, 0), `proj ${id}`).toBeNull();
      expect(projFrameCount(id)).toBe(1);
    }
  });
});
