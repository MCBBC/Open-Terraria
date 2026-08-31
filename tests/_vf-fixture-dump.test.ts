// 夹具再生(2026-08-31):/tmp/vf-codegen/world.json 被系统清理后
// _vf-worldwide-parity.test.ts 会因缺文件假红。本测试按需再生(FTW V2.wld,
// vanilla id 域全图,与 codegen-parity 的 rig 域同源)。跑一次即留盘。
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';

describe('vf worldwide 夹具再生', () => {
  it('dump /tmp/vf-codegen/world.json(缺失时)', () => {
    if (existsSync('/tmp/vf-codegen/world.json')) return;   // 已在,跳过
    const wld = parseWld(new Uint8Array(readFileSync('/Users/vinlic/Downloads/FTW V2.wld')));
    const n = wld.tilesWide * wld.tilesHigh;
    const out = {
      w: wld.tilesWide, h: wld.tilesHigh,
      type: Array.from(wld.tiles.type),
      flags: Array.from(wld.tiles.active, (b) => (b ? 1 : 0)),
      slope: Array.from(wld.tiles.slope ?? new Uint8Array(n)),
      half: Array.from(wld.tiles.half ?? new Uint8Array(n), (b) => (b ? 1 : 0)),
    };
    mkdirSync('/tmp/vf-codegen', { recursive: true });
    writeFileSync('/tmp/vf-codegen/world.json', JSON.stringify(out));
    expect(out.w).toBeGreaterThan(0);
  });
});
