// 夹具再生(2026-08-31):/tmp/vf-codegen/world.json 被系统清理后
// _vf-worldwide-parity.test.ts 会因缺文件假红。本测试按需再生(FTW V2.wld,
// vanilla id 域;★裁剪 360×360 活性最密窗口 ≈ 3 万格,对齐 allparity 原始量级
// ——全图 168MB/千万格会把逐格 interp 对拍拖到小时级)。跑一次即留盘。
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { readLocalFixture, localFixtureMissing } from './fixturePath';
import { parseWld } from '../src/wld/WldParser';

describe.skipIf(localFixtureMissing('ftw-v2.wld'))('vf worldwide 夹具再生', () => {
  it('dump /tmp/vf-codegen/world.json(缺失时)', () => {
    if (existsSync('/tmp/vf-codegen/world.json')) return;   // 已在,跳过
    const wld = parseWld(new Uint8Array(readLocalFixture('ftw-v2.wld')));
    const W = wld.tilesWide, H = wld.tilesHigh;
    const WIN = 360;
    // 粗扫 48×48 步长窗口活性密度,取最密窗口(地下带地形族最丰富)
    let bx = 0, by = 0, best = -1;
    for (let sy = 0; sy + WIN <= H; sy += 48) {
      for (let sx = 0; sx + WIN <= W; sx += 48) {
        let cnt = 0;
        for (let y = sy; y < sy + WIN; y += 4) for (let x = sx; x < sx + WIN; x += 4) {
          if (wld.tiles.active[y * W + x]) cnt++;
        }
        if (cnt > best) { best = cnt; bx = sx; by = sy; }
      }
    }
    const type: number[] = [], flags: number[] = [], slope: number[] = [], half: number[] = [];
    for (let y = by; y < by + WIN; y++) for (let x = bx; x < bx + WIN; x++) {
      const k = y * W + x;
      type.push(wld.tiles.type[k]);
      flags.push(wld.tiles.active[k] ? 1 : 0);
      slope.push(wld.tiles.slope?.[k] ?? 0);
      half.push(wld.tiles.half?.[k] ? 1 : 0);
    }
    const out = { w: WIN, h: WIN, type, flags, slope, half };
    mkdirSync('/tmp/vf-codegen', { recursive: true });
    writeFileSync('/tmp/vf-codegen/world.json', JSON.stringify(out));
    expect(out.flags.reduce((a, b) => a + b, 0)).toBeGreaterThan(10000);
  });
});
