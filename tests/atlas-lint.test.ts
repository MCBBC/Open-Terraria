// atlas-lint 测试(vitest 锁定——vite 插件钩子在 vitest 不跑,此处为权威回归):
// ① spawn tools/atlas-lint.mjs:0 error
// ② 强校验:import TILE_DEFS/vanilla.json 交叉(ATL-05/06 的 TS 原生版,防行级正则失明)
// ③ ATL-06 豁免表防腐:恰为裁决后 3 条(数据修好豁免须同步缩)
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE_DEFS } from '../src/data/tiles';
import vanillaJson from '../public/sprites/vanilla.json';
import { ATL06_EXEMPT } from '../tools/atlas-lint.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('atlas-lint', () => {
  it('CLI:0 error(构建期阻断基线)', () => {
    const r = spawnSync('node', [join(ROOT, 'tools/atlas-lint.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(0);
  });

  it('ATL-06 豁免表恰为裁决后 3 条(防腐:数据修好豁免须同步缩)', () => {
    expect([...ATL06_EXEMPT].sort()).toEqual([
      'v_590_gem_saplings',
      'v_74_jungle_tall_plants',
      'v_93_lamps',
    ]);
  });

  it('强校验(ATL-05):TILE_DEFS 每个 vanilla.sheet 在 vanilla.json 有 meta', () => {
    const tiles = (vanillaJson as { tiles: Record<string, unknown> }).tiles;
    for (const d of TILE_DEFS) {
      if (!d?.vanilla) continue;
      expect(tiles[String(d.vanilla.sheet)], `${d.key} sheet=${d.vanilla.sheet}`).toBeTruthy();
    }
  });

  it('强校验(ATL-06):非豁免 def 尺寸 ≡ frameSize(TS 原生,防行级正则失明)', () => {
    const tiles = (vanillaJson as { tiles: Record<string, { frameSize?: Array<[number, number]> }> }).tiles;
    const bad: string[] = [];
    for (const d of TILE_DEFS) {
      if (!d?.vanilla || d.vanilla.frame !== 'style' || ATL06_EXEMPT.has(d.key)) continue;
      const m = tiles[String(d.vanilla.sheet)];
      const fs0 = m?.frameSize?.[0];
      if (!fs0) continue;
      const w = d.vanilla.fw ?? d.w, h = d.vanilla.fh ?? d.h;
      if ((w !== undefined && w !== fs0[0]) || (h !== undefined && h !== fs0[1])) {
        bad.push(`${d.key} ${w}×${h} vs ${fs0[0]}×${fs0[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('强校验(ATL-02):每表 (cols-1)*stride+grid ≤ PNG IHDR(与 vframeAt 越界同式)', () => {
    const fs = require('node:fs');
    const pngSize = (file: string) => {
      const fd = fs.openSync(file, 'r');
      const b = Buffer.alloc(24);
      try { fs.readSync(fd, b, 0, 24, 0); } finally { fs.closeSync(fd); }
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    };
    const tiles = (vanillaJson as { tiles: Record<string, { sheet: string; cols: number; rows: number; stride: [number, number]; grid: [number, number] }> }).tiles;
    const bad: string[] = [];
    for (const [sid, m] of Object.entries(tiles)) {
      const file = join(ROOT, 'public/sprites', m.sheet);
      if (!fs.existsSync(file)) { bad.push(`${sid} 缺 PNG`); continue; }
      const size = pngSize(file);
      if ((m.cols - 1) * m.stride[0] + m.grid[0] > size.w
        || (m.rows - 1) * m.stride[1] + m.grid[1] > size.h) {
        bad.push(`sheet ${sid} 帧网格越界`);
      }
    }
    expect(bad).toEqual([]);
  });
});
