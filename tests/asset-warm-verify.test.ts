// ★回归钉(2026-09-16):「无痕首装 99%·完成·重新下载 恒拦」死锁定谳——
//  warm 终验曾按 have.size >= manifestTotal【计数】,而缓存混有壳 JS/文档/l10n/
//  __sw_meta__ 等非清单条目,个位数真缺失被额外条目掩码成假"完整";且 verified
//  分支只清 zipFailedAcc 不清 state.failed → phase='done'+failed>0:
//  assetsComplete()(要求 failed===0)恒 false,单人门槛永久拦截,且该分支不排
//  补拉=无自愈路径。本测试钉死四件事:
//  ① 终验=逐条精确差集(缺 0 条才 verified),计数式判据已撤;
//  ② verified 分支清 state.failed(放行条件含 failed===0);
//  ③ startZipWarm 早退分支(重扫全命中)同样清 failed;
//  ④ worker 消息串行化('done' 终验不得与末批 'files' 的 put 并发跑)。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(ROOT, 'src/net/AssetCache.ts'), 'utf8');

describe('warm 终验精确差集+失败账清理(无痕首装门槛死锁案)', () => {
  it('① 终验=逐条精确差集,计数式 have.size>=manifestTotal 判据已撤', () => {
    expect(src).toContain('const verified = missing.length === 0;');
    expect(src).toContain('for (const n of p.entries) if (!have.has(n)) missing.push(n);');
    expect(src).not.toMatch(/const verified = have\.size >= manifestTotal/);
  });

  it('② verified 分支清 state.failed(门槛放行条件含 failed===0)', () => {
    expect(src).toMatch(/if \(verified\) \{[\s\S]{0,400}state\.failed = 0;/);
  });

  it('③ startZipWarm 早退分支(重扫全命中)同样清 failed', () => {
    expect(src).toMatch(/state\.done >= state\.total\) \{[\s\S]{0,300}state\.failed = 0;/);
  });

  it('④ worker 消息串行化(msgTail 链式排队)', () => {
    expect(src).toContain('let msgTail: Promise<void> = Promise.resolve();');
    expect(src).toMatch(/zipWorker\.onmessage = \(ev: MessageEvent\) => \{\s*msgTail = msgTail/);
    expect(src).not.toMatch(/zipWorker\.onmessage = async \(ev: MessageEvent\)/);
  });
});
