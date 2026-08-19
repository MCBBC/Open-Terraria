// 素材重制管线 M2:PackFormat(zip STORED round-trip + CRC32 + manifest 门)
// 与 FrameOps 纯像素数学(盒式缩回/最近邻/蒙版/生成几何 round-trip)。
// 运行:npx vitest run tests/remaster-pack.test.ts
import { describe, it, expect } from 'vitest';
import {
  crc32, zipStore, unzip, parseManifest, buildManifest, makePack, readPack, PACK_FORMAT,
} from '../src/remaster/PackFormat';
import {
  boxDownscale, nearestUpscale, applyAlphaMask, frameHash, computeGenLayout, mapBackRect,
} from '../src/remaster/FrameOps';
import type { PackEntryMeta } from '../src/remaster/types';

const enc = new TextEncoder();

describe('CRC32', () => {
  it('已知向量("123456789" → 0xCBF43926)', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
  });
  it('空数据 = 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zip STORED round-trip', () => {
  it('多文件 round-trip(含中文名与二进制)', async () => {
    const entries = [
      { name: 'remaster-manifest.json', data: enc.encode('{"format":"sw-remaster-pack/1"}') },
      { name: 'sheets/vanilla/NPC_1.png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 255]) },
      { name: 'sheets/中文路径/测试.png', data: enc.encode('data') },
      { name: 'sheets/vanilla-ui/logo_1.png', data: new Uint8Array(4096).fill(7) },
    ];
    const zip = zipStore(entries);
    const out = await unzip(zip);
    expect(out.size).toBe(4);
    expect([...out.get('sheets/vanilla/NPC_1.png')!]).toEqual([...entries[1].data]);
    expect(new TextDecoder().decode(out.get('sheets/中文路径/测试.png')!)).toBe('data');
    expect(out.get('sheets/vanilla-ui/logo_1.png')!.length).toBe(4096);
  });
  it('空包 round-trip', async () => {
    const out = await unzip(zipStore([]));
    expect(out.size).toBe(0);
  });
});

describe('manifest 门', () => {
  const goodEntry: PackEntryMeta = {
    category: 'npc', complete: false,
    frames: { '0': { status: 'accepted', rect: [0, 0, 60, 44], hash: 'deadbeef' } },
  };
  it('合法 manifest 通过', () => {
    const m = buildManifest('测试包', 'v1', { 'vanilla/NPC_1.png': goodEntry });
    const r = parseManifest(m);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.manifest.entries['vanilla/NPC_1.png'].frames['0'].rect).toEqual([0, 0, 60, 44]);
  });
  it('format 不识别拒装', () => {
    expect(parseManifest({ format: 'sw-remaster-pack/2', name: 'x', baseVersion: 'v', entries: {} }).ok).toBe(false);
    expect(parseManifest({ format: 'other', name: 'x', baseVersion: 'v', entries: {} }).ok).toBe(false);
  });
  it('缺字段/坏路径拒装', () => {
    expect(parseManifest({ format: PACK_FORMAT, name: 'x', entries: {} }).ok).toBe(false);          // 缺 baseVersion
    expect(parseManifest({ format: PACK_FORMAT, name: 'x', baseVersion: 'v' }).ok).toBe(false);    // 缺 entries
    expect(parseManifest({
      format: PACK_FORMAT, name: 'x', baseVersion: 'v',
      entries: { '../../etc/passwd': goodEntry },
    }).ok).toBe(false); // 路径逃逸
  });
});

describe('整包 round-trip', () => {
  it('makePack → readPack:manifest+sheet 全保真', async () => {
    const manifest = buildManifest('我的重制包', 'abc123', {
      'vanilla/Tiles_0.png': { category: 'tile', complete: true, frames: { '3': { status: 'accepted', rect: [36, 0, 16, 16], hash: 'ff00ff00' } } },
    });
    const png = new Uint8Array([1, 2, 3, 4, 5]);
    const zip = makePack(manifest, [{ file: 'vanilla/Tiles_0.png', png }]);
    const pack = await readPack(zip);
    expect(pack.manifest.name).toBe('我的重制包');
    expect(pack.manifest.entries['vanilla/Tiles_0.png'].frames['3'].status).toBe('accepted');
    expect(pack.sheets.get('vanilla/Tiles_0.png')).toBeTruthy();
    expect(new Uint8Array(await pack.sheets.get('vanilla/Tiles_0.png')!.arrayBuffer())).toEqual(png);
  });
  it('非 zip 拒装(EOCD 缺失)', async () => {
    await expect(readPack(enc.encode('not a zip'))).rejects.toThrow(/EOCD|manifest/);
  });
});

describe('FrameOps 像素数学', () => {
  it('nearestUpscale:2× 块复制', () => {
    // 2×1 帧 [红|蓝] → 4×2(每源像素扩 2×2 块)
    const src = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
    const up = nearestUpscale(src, 2, 1, 2);
    expect(up.length).toBe(4 * 2 * 4);
    const px = (i: number) => [up[i * 4], up[i * 4 + 1], up[i * 4 + 2]];
    expect(px(0)).toEqual([255, 0, 0]);   // (0,0)→src(0,0)
    expect(px(1)).toEqual([255, 0, 0]);   // (1,0)→src(0,0)
    expect(px(2)).toEqual([0, 0, 255]);   // (2,0)→src(1,0)
    expect(px(3)).toEqual([0, 0, 255]);   // (3,0)→src(1,0)
    expect(px(4)).toEqual([255, 0, 0]);   // (0,1)→src(0,0)
  });
  it('boxDownscale:2× 缩 1× 取平均', () => {
    // 2×2 块 [红,红/蓝,蓝] → 1 像素 紫(127.5→round 128)
    const src = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255,
      0, 0, 255, 255, 0, 0, 255, 255,
    ]);
    const out = boxDownscale(src, 2, 2, 1, 1);
    expect([...out]).toEqual([128, 0, 128, 255]);
  });
  it('boxDownscale alpha 参与平均', () => {
    const src = new Uint8ClampedArray([
      255, 255, 255, 255, 255, 255, 255, 0,
      255, 255, 255, 0, 255, 255, 255, 0,
      255, 255, 255, 0, 255, 255, 255, 0,
      255, 255, 255, 0, 255, 255, 255, 0,
    ]);
    const out = boxDownscale(src, 2, 2, 1, 1);
    expect(out[3]).toBe(64); // (255+0+0+0)/4
  });
  it('applyAlphaMask:dst alpha 逐像素取 src,透明格 RGB 清零', () => {
    const dst = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const src = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
    applyAlphaMask(dst, src);
    expect([...dst.slice(0, 4)]).toEqual([10, 20, 30, 255]);
    expect([...dst.slice(4)]).toEqual([0, 0, 0, 0]);
  });
  it('frameHash:同数据同哈希,异数据异哈希', () => {
    const a = new Uint8ClampedArray([1, 2, 3, 4]);
    expect(frameHash(a)).toBe(frameHash(new Uint8ClampedArray([1, 2, 3, 4])));
    expect(frameHash(a)).not.toBe(frameHash(new Uint8ClampedArray([1, 2, 3, 5])));
    expect(frameHash(a)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('生成画布几何(gpt-image-2 约束)', () => {
  const MIN_PIXELS = 655_360;
  it('小帧(16×16):放大到 ~1024,画布面积达标且 16 对齐', () => {
    const g = computeGenLayout(16, 16);
    expect(g.k).toBe(64);
    expect(g.W % 16).toBe(0); expect(g.H % 16).toBe(0);
    expect(g.W * g.H).toBeGreaterThanOrEqual(MIN_PIXELS);
    expect(g.W * g.H).toBeLessThanOrEqual(8_294_400);
    expect(g.fw).toBe(1024); expect(g.fh).toBe(1024);
    expect(g.ox).toBe((g.W - 1024) >> 1);
  });
  it('普通帧(60×44 NPC):k=17(⌊1024/60⌋)', () => {
    const g = computeGenLayout(60, 44);
    expect(g.k).toBe(17);
    expect(g.W).toBeGreaterThanOrEqual(1020);
  });
  it('宽帧(120×30):k=8,画布横向', () => {
    const g = computeGenLayout(120, 30);
    expect(g.k).toBe(8);
    expect(g.fw).toBe(960);
    expect(g.W >= g.fw && g.H >= g.fh).toBe(true);
  });
  it('比例与边长恒 ≤3:1 / ≤3840', () => {
    for (const [w, h] of [[16, 16], [214, 236], [16, 200], [384, 46], [1024, 768], [2048, 1080]] as Array<[number, number]>) {
      const g = computeGenLayout(w, h);
      expect(g.W <= 3840 && g.H <= 3840, `${w}x${h}`).toBe(true);
      expect(Math.max(g.W, g.H) / Math.min(g.W, g.H) <= 3, `${w}x${h}`).toBe(true);
      expect(g.W * g.H >= MIN_PIXELS, `${w}x${h}`).toBe(true);
    }
  });
  it('mapBackRect:请求尺寸=输出尺寸时恒等;不符时比例容错', () => {
    const g = computeGenLayout(60, 44);
    const exact = mapBackRect(g, g.W, g.H);
    expect(exact).toEqual({ sx: g.ox, sy: g.oy, sw: g.fw, sh: g.fh });
    // 模型返回半尺寸(比例容错)
    const half = mapBackRect(g, g.W / 2, g.H / 2);
    expect(half.sw).toBeCloseTo(g.fw / 2, -2);
  });
});
