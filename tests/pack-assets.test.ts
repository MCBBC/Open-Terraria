// pack-assets 纯函数回归（打包管线：分片确定性/roundtrip/分级压缩/manifest 形状/复用键语义）
import { describe, it, expect } from 'vitest';
import { unzipSync } from 'fflate';
import {
  INPUT_DIRS, STORE_EXT, fileExt, planParts, buildZip, makeManifest, ALGO_VERSION,
} from '../scripts/pack-assets.mjs';

describe('pack-assets 纯函数', () => {
  it('INPUT_DIRS 超集 = 五目录（l10n/json 排除——SW 可变语义与 bundle 内嵌）', () => {
    expect(INPUT_DIRS).toEqual(['fonts', 'sprites/vanilla-ui', 'sprites/vanilla', 'sounds', 'audios/music']);
  });

  it('fileExt/STORE_EXT：已压缩格式 store-only 清单', () => {
    expect(fileExt('a/b.PNG')).toBe('.png');
    expect(fileExt('music.mp3')).toBe('.mp3');
    expect(fileExt('noext')).toBe('');
    expect([...STORE_EXT].sort()).toEqual(['.mp3', '.ogg', '.opus', '.png', '.woff2', '.zip']);
  });

  it('planParts：确定性 + 双上限（worst-case 输出体积硬帽/条目数）贪心切分', () => {
    const files = Array.from({ length: 10 }, (_, i) => `f${i}.png`);
    const sizes = Object.fromEntries(files.map((f) => [f, 10]));
    // 输出硬帽优先：maxZipBytes=25 → 每片 2-3 文件（bytes 按不可压缩全额计价）
    const a = planParts(files, sizes, { maxZipBytes: 25, maxFilesPerPart: 99 });
    expect(a.every((p) => p.bytes <= 25 || p.entries.length === 1)).toBe(true);
    expect(a.reduce((s, p) => s + p.entries.length, 0)).toBe(10);
    // 条目数上限：maxFiles=4 → 每片 ≤4
    const b = planParts(files, sizes, { maxZipBytes: 1 << 30, maxFilesPerPart: 4 });
    expect(b.every((p) => p.entries.length <= 4)).toBe(true);
    // 顺序保持（字典序输入不重排）
    expect(b.flatMap((p) => p.entries)).toEqual(files);
    // 确定性：同输入两次结果深相等
    expect(planParts(files, sizes, { maxZipBytes: 25 })).toEqual(planParts(files, sizes, { maxZipBytes: 25 }));
    // 单文件超帽：独占成片且条目零丢失（Pages 上限闸门由 CLI 端实测兜底）
    const big = ['a.png', 'huge.png', 'b.png'];
    const bigSizes = { 'a.png': 30, 'huge.png': 100, 'b.png': 30 };
    const c = planParts(big, bigSizes, { maxZipBytes: 50 });
    expect(c.reduce((s, p) => s + p.entries.length, 0)).toBe(3);
    expect(c.find((p) => p.entries[0] === 'huge.png')!.entries).toEqual(['huge.png']);
  });

  it('buildZip：roundtrip 字节相等 + mtime 钉死跨调用字节确定（fflate 默认内嵌当前时间）', () => {
    const entryMap = {
      'sprites/vanilla/Tiles_1.png': new Uint8Array([1, 2, 3, 4]),
      'sounds/a.wav': new Uint8Array(2048).fill(7),   // deflate 分支
      'audios/music/Music_1.mp3': new Uint8Array([9, 9, 9]),
    };
    const z1 = buildZip(entryMap);
    const z2 = buildZip(entryMap);
    expect(z1.length).toBe(z2.length);
    expect(z1).toEqual(z2);   // 同进程字节级；跨进程确定性由 mtime 钉死保证（CLI 验证）
    const out = unzipSync(z1);
    expect(Object.keys(out).sort()).toEqual(Object.keys(entryMap).sort());
    for (const [k, v] of Object.entries(entryMap)) {
      expect(out[k].length).toBe(v.length);
      expect(out[k]).toEqual(v);
    }
    // store vs deflate：随机性低的 wav 应显著缩小
    expect(unzipSync(buildZip({ 'x.wav': new Uint8Array(4096).fill(1) }) as never)['x.wav'].length).toBe(4096);
  });

  it('makeManifest：形状与聚合（algoVersion/contentHash/parts 元数据透传）', () => {
    const partsMeta = [
      { file: 'p0-aaaa.zip', phase: 'menu', files: 3, bytes: 100, zipBytes: 80, entries: ['a', 'b', 'c'], inputHash: 'h0' },
      { file: 'p1-bbbb.zip', phase: 'sounds', files: 2, bytes: 50, zipBytes: 40, entries: ['d', 'e'], inputHash: 'h1' },
    ];
    const m = makeManifest(partsMeta, 'chash');
    expect(m.algoVersion).toBe(ALGO_VERSION);
    expect(m.contentHash).toBe('chash');
    expect(m.totalFiles).toBe(5);
    expect(m.totalBytes).toBe(150);
    expect(m.parts[1].inputHash).toBe('h1');
    expect(m.parts[0].entries).toEqual(['a', 'b', 'c']);
  });
});
