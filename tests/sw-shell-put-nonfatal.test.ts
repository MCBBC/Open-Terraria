// sw.js shell/doc 分支「存储失败不得吞响应」结构锁(2026-09-24)。
// 病史:0.1.37-beta 发布后部分机器 index-*.js 504 offline 强刷无用——shell 支
// `await cache.put` 在返回路径 try 内,put 被拒(配额满/隐私模式)时好响应被
// catch 吞掉→504;getCache 裸 await 在 doc/shell 两支同病(存储禁用=整链炸)。
// 修:put 全部 fire-and-forget(.catch 吸收)+getCache 降级纯网络直通。
// 本锁钉:①await cache.put 在 respondWith 返回路径禁复潮 ②getCache 裸 await
// 禁复潮 ③504 兜底仍在(真离线语义保留)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const swSrc = (): string => readFileSync(join(ROOT, 'public/sw.js'), 'utf8');

describe('sw-shell-put-nonfatal 存储失败不吞响应', () => {
  it('respondWith 返回路径零 await cache.put(全部 fire-and-forget)', () => {
    const src = swSrc();
    // 病灶签名=「await put 紧跟 return res」(put 炸→好响应被吞);背景 warm 位点
    // (:415 ok 旗依赖 await)与 __sw_meta__ 元数据写(消息处理器)语义不同不在锁内
    expect(src).not.toMatch(/await cache\.put\([^)]*\);\s*return res;/);
    // fetch 回填位点至少两处已带 .catch 吸收(doc/shell/资产前缀;
    // .* 行内贪心——res.clone() 双右括号用 [^;] 界不安全,按行匹配即可)
    expect(src.match(/cache\.put\(.*\.catch\(\(\) => \{\}\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('getCache 裸 await 禁复潮(doc/shell 两支均降级直通守卫)', () => {
    const src = swSrc();
    expect(src).toMatch(/try \{ cache = await getCache\(\); \} catch \{[^}]*纯网络直通/);
    expect(src.match(/try \{ cache = await getCache\(\); \} catch/g)?.length ?? 0).toBe(2);
  });

  it('504 offline 兜底保留(真离线语义不丢)', () => {
    expect(swSrc()).toContain("return new Response('', { status: 504, statusText: 'offline' });");
  });

  it('★文档不入冷启动 assetish 早退支(2026-09-29 首访陈旧码根因锁)', () => {
    const src = swSrc();
    // 病史:assetish 折入 isDocPath → SW 重启窗口(currentVersion='')文档走 serveAsset
    // 资产 cache-first → 端出缓存旧 index.html → 整页旧代码(两阶段复现实验坐实:
    // HEAD 版首航旧 chunk+刷新才新)。修=文档在早退支前独立成支,恒网络优先。
    expect(src).not.toMatch(/const assetish = [^\n]*isDocPath/);
    expect(src).toContain('文档永不入本早退支');
    // 独立文档支在 assetish 早退支之前(分支序:文档先于资产冷启动兜底)
    expect(src.indexOf('if (isDocPath(req, path)) {')).toBeGreaterThan(-1);
    expect(src.indexOf('if (isDocPath(req, path)) {')).toBeLessThan(src.indexOf('if (assetish && !currentVersion)'));
  });
});
