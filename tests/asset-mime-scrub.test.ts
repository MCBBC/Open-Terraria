// ★根修回归(2026-09-16):「863 条 opus 每会话整批消失+40MB 重下循环」。
//  定谳链:asset-warm.worker 旧 MIME 表漏 opus → 863 条音效全部以
//  application/octet-stream 落 CacheStorage;页面每会话 init 发 {type:'gc'} →
//  sw.js 曾 _scrubInner(true) 无视每版本标记强扫全缓存,按扩展名白名单核 CT
//  (^audio/ogg 不认 octet-stream)→ 863 条整批 delete → 次会话 have-set 对账
//  判缺 → 重拉 p4+p5(恰 40MB,HAR 三连会话各拉一次实锤)→ CT 依旧错 → 循环。
//  同片 png(image/png)/mp3(audio/mpeg)的 CT 恰在白名单内幸免——与线上
//  「只有音效每次重拉、贴图 BGM 无事」指纹完全吻合。
//  四道钉(任何回退即爆红):
//  ① zip manifest 全部条目扩展名都有规范 CT(assetMime 不落 octet-stream 兜底);
//  ② 每个落库 CT 都在 sw.js 清扫白名单族内(落库即安全,不会被判异删除);
//  ③ sw.js 源码态:清扫判据只删 text/html 真毒 / gc 撤强制重扫 / zipExtract 规范 CT;
//  ④ worker 与页面 put 双侧同引 assetMime 单源(漂移即同错,不再各抄一份表)。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WARM_MIME } from '../src/net/assetMime';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const swSrc = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
const workerSrc = readFileSync(join(ROOT, 'src/net/asset-warm.worker.ts'), 'utf8');
const pageSrc = readFileSync(join(ROOT, 'src/net/AssetCache.ts'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'public/assets-zip/manifest.json'), 'utf8')) as {
  parts: Array<{ entries: string[] }>;
};

// sw.js MIME_BY_EXT 白名单族镜像(扩展名 → 落库 CT 必须匹配的正则;改 sw.js 表须同步)
const SW_FAMILY: Record<string, RegExp> = {
  png: /^image\//, jpg: /^image\//, jpeg: /^image\//, webp: /^image\//, gif: /^image\//,
  wav: /^audio\//, mp3: /^audio\//, ogg: /^audio\//,
  opus: /^audio\/ogg/,
  woff2: /^font\//, woff: /^font\//, ttf: /^font\//,
  json: /^(application\/json|text\/json)\b/,
};

describe('assetMime 落库 CT 根修回归(863 opus 每会话消失案)', () => {
  it('① zip manifest 全部条目扩展名都有规范 CT(不落 octet-stream 兜底)', () => {
    const exts = new Set<string>();
    for (const p of manifest.parts) {
      for (const e of p.entries) exts.add(e.slice(e.lastIndexOf('.') + 1).toLowerCase());
    }
    expect(exts.size).toBeGreaterThan(0);
    const unmapped = [...exts].filter((ext) => !WARM_MIME[ext]);
    expect(unmapped, `扩展名缺规范 CT(warm 会落 octet-stream): ${unmapped.join(',')}`).toEqual([]);
  });

  it('② 每个落库 CT 都在 sw.js 清扫白名单族内(opus 白名单字面量在位)', () => {
    // opus 规则字面量钉死:sw.js 白名单若改动须与本测试同步
    expect(swSrc).toContain("[/\\.opus$/, /^audio\\/ogg/]");
    for (const [ext, ct] of Object.entries(WARM_MIME)) {
      const fam = SW_FAMILY[ext];
      if (fam) {
        expect(fam.test(ct), `${ext} → ${ct} 不在 sw.js 清扫白名单族(会被判异删除)`).toBe(true);
      } else {
        // 未登记扩展名不参与 CT 审查(sw.js 预滤跳过);目前仅 txt
        expect(ext, '未登记扩展名只允许 txt').toBe('txt');
      }
    }
  });

  it('③a sw.js 清扫判据只删 text/html 真毒(旧 !mimeOk 全量判死已撤)', () => {
    expect(swSrc).toContain("ct === 'text/html'");
    expect(swSrc).not.toContain('if (!mimeOk(p, res)) bad.push(req);');
  });

  it('③b sw.js gc 处理不再强制重扫(强制调用点已撤,走每版本标记)', () => {
    // 钉调用点而非注释(注释里保留「曾 _scrubInner(true)」作为根修存照)
    expect(swSrc).not.toContain('await _scrubInner(true)');
    expect(swSrc).not.toContain('void _scrubInner(true)');
    expect(swSrc).toMatch(/type === 'gc'[\s\S]{0,600}scrubPoisonedEntries\(\)/);
  });

  it('③c sw.js zipExtract 按扩展名给规范 CT(裸 Response 恒 false 旧式已撤)', () => {
    expect(swSrc).toContain('ctOf(path)');
    expect(swSrc).not.toContain('mimeOk(path, new Response())');
  });

  it('④ worker 与页面 put 双侧同引 assetMime 单源(不再各抄 MIME 表)', () => {
    expect(workerSrc).toMatch(/from '\.\/assetMime'/);
    expect(workerSrc).not.toMatch(/const MIME: Record/);
    expect(pageSrc).toContain('mimeOf(d.names[i])');
    expect(pageSrc).not.toContain("'Content-Type': d.mime");   // 不再信任 worker 消息里的 mime
  });
});
