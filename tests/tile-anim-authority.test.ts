// 动画帧权威金标·运行时绑定（2026-08-30 防炸闸门第二道）
// 工具面：node tools/recon-tileanim.mjs（反编译→manifest 再生）
// 测试面：本文件把【实际生效的 TS 表】与【tests/golden/tile-anim-authority.json】
//         和【素材 PNG 容量】三方互锁。任何手改表值 / 键增删 → 此处必红。
// 历史病根：风格带总数曾被误当动画帧数（106:5 等）→ 帧号越界 → vframeAt 落空
//          回退 (0,0) → 整物平铺第一格。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TILE_ANIM_RATE, TILE_ANIM_PITCH, TILE_ANIM_FRAMES,
  animYOffset, animFrameIdx, tileAnimPitch, tileAnim,
} from '../src/render/TileAnim';

const GOLDEN = path.join(__dirname, 'golden', 'tile-anim-authority.json');
const manifest = JSON.parse(fs.readFileSync(GOLDEN, 'utf8')) as {
  rate: Record<string, number>; pitch: Record<string, number>;
  frames: Record<string, number>; floor?: Record<string, number>;
  removed: Record<string, string>; approx: Record<string, string>;
};

/** 金标帧域不越界断言（历史病灶的直接判别式） */
function assertDomain(id: number): void {
  const pitch = manifest.pitch[String(id)] ?? 38;
  const frames = manifest.frames[String(id)];
  if (!frames || frames <= 1) return;
  if (pitch === 0) {
    // ★129 转正后新合法域：pitch 0 = 纵向无动画（TileDrawing.cs:4687 addFrY=0 verbatim）
    //   ——任意 tick 下纵偏恒 0，非 0 即纵向走带复发（2026-09-18「发散两个方块」根因）
    const span = Math.max(3, frames) * 17;
    for (let t = 0; t < span; t++) {
      tileAnim.tick = t;
      expect(animYOffset(id, 144)).toBe(0);
    }
    return;
  }
  const legalMax = (frames - 1) * pitch;
  const span = Math.max(3, frames) * 17;   // 覆盖整周期
  for (let t = 0; t < span; t++) {
    tileAnim.tick = t;
    const off = animYOffset(id, frames * pitch);
    expect(off % pitch).toBe(0);
    expect(off).toBeLessThanOrEqual(legalMax);
  }
}

describe('动画帧权威金标（TileAnim ↔ manifest ↔ 素材容量 三方互锁）', () => {
  it('RATE/FRAMES/PITCH 与金标逐键相等（无缺、无多、值同）', () => {
    const eq = (live: Record<number, number>, gold: Record<string, number>, name: string) => {
      const lk = Object.keys(live).map(Number).sort((a, b) => a - b);
      const gk = Object.keys(gold).map(Number).sort((a, b) => a - b);
      expect(lk, `${name} 键集`).toEqual(gk);
      for (const k of gk) expect(live[k], `${name}[${k}]`).toBe(gold[k]);
    };
    eq(TILE_ANIM_RATE, manifest.rate, 'RATE');
    eq(TILE_ANIM_FRAMES, manifest.frames, 'FRAMES');
    eq(TILE_ANIM_PITCH, manifest.pitch, 'PITCH');
  });

  it('策略移除键不得复活：' + Object.keys(manifest.removed).join('/'), () => {
    for (const idStr of Object.keys(manifest.removed)) {
      const id = Number(idStr);
      expect(TILE_ANIM_RATE[id], `RATE[${id}] 复活`).toBeUndefined();
      expect(TILE_ANIM_FRAMES[id], `FRAMES[${id}] 复活`).toBeUndefined();
    }
  });

  it('病源家族全周期采样永不越界（106/218/220/300 组 +306/354/708…，平铺第一格病复发即在此爆红）', () => {
    // 全键扫描成本可控（77 键 × 域长 ≤ ~600 tick）
    for (const idStr of Object.keys(manifest.frames)) assertDomain(Number(idStr));
  });

  it('素材容量互证：frames×pitch ≤ 本地 PNG 高 + 半步距（素材换小也会暴露）', () => {
    // 纵向步距不适用该判据的特例家族（详见 tools/recon-tileanim.mjs 头注）：
    //   270/660 旋转旗（帧横排 18px，垂直容量无关）。129 已于 2026-09-18 转正
    //   pitch=0（f×p=0 恒 ≤ pngH）→ 移出豁免、进通用判据。
    const CAP_EXEMPT = new Set([270, 660]);
    const dir = path.join(__dirname, '..', 'public', 'sprites', 'vanilla');
    const bad: string[] = [];
    for (const [k, f] of Object.entries(manifest.frames)) {
      if (CAP_EXEMPT.has(Number(k))) continue;
      const p = manifest.pitch[k] ?? 38;
      try {
        const h = fs.readFileSync(path.join(dir, `Tiles_${k}.png`)).readUInt32BE(20);
        if (h + p / 2 < Number(f) * p) bad.push(`sheet ${k}: pngH=${h} < ${f}×${p}`);
      } catch { /* 缺素材跳过（不阻断非视觉测试环境） */ }
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });
});
