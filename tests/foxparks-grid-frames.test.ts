// 火绒狐 1094/1113 网格贴图帧矩形（2026-08-23 网格切片批）。
// 原版锚 = Main.DrawProj 专支（1457 Main.cs:33734-33737 / 1456 :32844-32848 仅 1094）：
//   num389 = frame / 9 → X = num389*64；num390 = frame % 9 → Y = num390*46；矩形 62×44
// 即 6 列×9 行【列主序】网格（frame 除 9 = 列、模 9 = 行）。1092 书弹同式
// （1457 :33719-33726 Frame(6,9,frame/9,frame%9) = 40×40 整格）。
// Main.projFrames 无 1094/1113 赋值（恒 1）→ 帧数 54 由 PROJ_GRID 供出。
// 贴图实测 384×1242（1094/1113）/ 240×360（1092）——本测试直读 PNG IHDR 复核。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { projFrameCount, projGridRect } from '../src/entities/Arrow';

/** PNG IHDR 尺寸（字节 16-24 大端宽高） */
function pngSize(rel: string): { w: number; h: number } {
  const buf = readFileSync(new URL(rel, import.meta.url));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('火绒狐 1094/1113 网格帧矩形（Main.cs:33734-33737 列主序 6×9）', () => {
  it('帧数 = 54（Main.projFrames 无赋值,由网格表供出;1092 同）', () => {
    expect(projFrameCount(1094)).toBe(54);
    expect(projFrameCount(1113)).toBe(54);
    expect(projFrameCount(1092)).toBe(54);
    // 非网格型不越权：json 纵条表照旧（595=28）、缺省恒 1
    expect(projFrameCount(595)).toBe(28);
    expect(projFrameCount(3)).toBe(1);
  });

  it('帧矩形公式：X=⌊frame/9⌋×64、Y=(frame%9)×46、62×44（0/9/27 金标断言）', () => {
    expect(projGridRect(1094, 0)).toEqual({ sx: 0, sy: 0, sw: 62, sh: 44, count: 54 });
    expect(projGridRect(1094, 9)).toEqual({ sx: 64, sy: 0, sw: 62, sh: 44, count: 54 });
    expect(projGridRect(1094, 27)).toEqual({ sx: 192, sy: 0, sw: 62, sh: 44, count: 54 });
    // 列内行进：frame 8 = 第 0 列末行（y=368）、frame 10 = 第 1 列第 1 行
    expect(projGridRect(1094, 8)).toEqual({ sx: 0, sy: 368, sw: 62, sh: 44, count: 54 });
    expect(projGridRect(1094, 10)).toEqual({ sx: 64, sy: 46, sw: 62, sh: 44, count: 54 });
    // 1113 同式；末帧 53 = 第 5 列末行
    expect(projGridRect(1113, 27)).toEqual({ sx: 192, sy: 0, sw: 62, sh: 44, count: 54 });
    expect(projGridRect(1113, 53)).toEqual({ sx: 320, sy: 368, sw: 62, sh: 44, count: 54 });
  });

  it('全帧域 0..53 逐帧对拍原版表达式（num389/num390 直译）', () => {
    for (let f = 0; f < 54; f++) {
      const r = projGridRect(1094, f);
      expect(r).not.toBeNull();
      expect(r!.sx).toBe(Math.floor(f / 9) * 64);   // num389 = frame/9
      expect(r!.sy).toBe((f % 9) * 46);             // num390 = frame%9
      expect(r!.sw).toBe(62);
      expect(r!.sh).toBe(44);
    }
  });

  it('越界钳制：负帧 → 0、超域 → 末帧 53；小数向下取整', () => {
    expect(projGridRect(1094, -5)).toEqual(projGridRect(1094, 0));
    expect(projGridRect(1094, 99)).toEqual(projGridRect(1094, 53));
    expect(projGridRect(1094, 27.9)).toEqual(projGridRect(1094, 27));
  });

  it('非网格型返回 null（竖条型不受影响）', () => {
    expect(projGridRect(266, 3)).toBeNull();
    expect(projGridRect(1, 0)).toBeNull();
  });

  it('贴图实尺复核：384×1242（狐）×2 / 240×360（书）,54 矩形全部入界', () => {
    const fox = pngSize('../public/sprites/vanilla/Projectile_1094.png');
    expect([fox.w, fox.h]).toEqual([384, 1242]);
    const fox2 = pngSize('../public/sprites/vanilla/Projectile_1113.png');
    expect([fox2.w, fox2.h]).toEqual([384, 1242]);
    const book = pngSize('../public/sprites/vanilla/Projectile_1092.png');
    expect([book.w, book.h]).toEqual([240, 360]);
    for (let f = 0; f < 54; f++) {
      const r = projGridRect(1094, f)!;
      expect(r.sx + r.sw).toBeLessThanOrEqual(384);
      expect(r.sy + r.sh).toBeLessThanOrEqual(1242);
      const b = projGridRect(1092, f)!;
      expect(b.sx + b.sw).toBeLessThanOrEqual(240);
      expect(b.sy + b.sh).toBeLessThanOrEqual(360);
    }
  });
});
