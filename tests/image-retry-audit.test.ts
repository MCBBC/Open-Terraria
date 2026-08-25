// 静态审计闸门(2026-08-25):PRUNED 前缀贴图的 new Image 站点必须有失败恢复语义。
// 背景:43 站点同类扫描发现 16 处「NEGATIVE-FOREVER × PRUNED」——冷缓存窗口(暖
// 缓存未到 sprites/vanilla)一次失败=整会话缺贴图且永不恢复。本测试防新增站点
// 回退到无恢复语义。
//
// 判定:站点窗口(±22 行)内 .src 赋值含 PRUNED 字面前缀(sprites/vanilla/、
// sounds/、audios/)→ 窗口必须含恢复标记:retried/retry/TTL/重试/自愈/退避/
// IMG-SELF-HEAL(逐帧自愈族)。
// 白名单(语义已文档化,勿随意扩充):
//   render/BiomeBackground.ts —— 菜单背景视差图,逐帧重发=自愈轮询(设计取舍)
//   render/SkyRenderer.ts     —— MoonExplosion 五件套同上;loadTex 已带退避重试
//   ui/UI.ts                  —— Buff/图标站有 fallback 链+onerror 置空兜底(多级降级)
// 已知盲区(备案):动态 src 变量站点无法静态判前缀(如 HousingPanel.img(src));
//   TtlSprite/ensureVImage 消费方不经 new Image(构造即安全)。
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');
const PRUNED = /sprites\/vanilla\/|['"`]sounds\/|['"`]audios\//;
const OK_MARKER = /retried|retry|TTL|重试|自愈|退避|IMG-SELF-HEAL/i;
const WHITELIST = new Set([
  'render/BiomeBackground.ts',
  'render/SkyRenderer.ts',
  'ui/UI.ts',
]);

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !p.includes('.test.')) yield p;
  }
}

describe('图片加载失败恢复语义静态审计', () => {
  it('PRUNED 前缀的 new Image 站点必须带重试/TTL/自愈标记', () => {
    const violations: string[] = [];
    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      if (WHITELIST.has(rel)) continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes('new Image(')) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('new Image(')) continue;
        const win = lines.slice(Math.max(0, i - 6), i + 24);
        const srcLineIdx = win.findIndex((l) => /\.src = `?['"]?/.test(l) || /\.src = /.test(l));
        const srcLine = srcLineIdx >= 0 ? win[srcLineIdx] : '';
        if (!PRUNED.test(srcLine)) continue;   // 非裁剪前缀/动态变量 → 不在闸门范围
        if (!OK_MARKER.test(win.join('\n'))) {
          violations.push(`${rel}:${i + 1} ← ${srcLine.trim().slice(0, 70)}`);
        }
      }
    }
    expect(
      violations,
      `以下 PRUNED 前缀图片站点缺少失败恢复语义(重试/TTL/自愈标记)——\n` +
      `首访冷缓存窗口一次失败=整会话缺贴图。修法参照 ensureVImage/loadExtraSprite\n` +
      `(10s TTL 负缓存)或同元素退避重试:\n` + violations.join('\n'),
    ).toEqual([]);
  });
});
