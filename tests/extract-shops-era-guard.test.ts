import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★BJ215（2026-09-20）：extract-travelshop.mjs + extract-shops.mjs era guard 落闸守卫测试。
//
// 债源：era-guard-family.md 第四节「部分闸」表——两器缺省 OUT_PATH 为相对路径
// （cwd footgun：从非 game/ 目录跑=写错位置）+ 盘上数据面领先于本器（BJ183 登记债）。
// BJ215 干跑 diff 定谳：
//   · travelshop：4 items+9 paintings 现库领先（richer cond 词表 anyBossKill/hardModeUp/
//     downed_4/downedMechBossAny/downed_398/downedMartians + 多件组 2281-2283,66 vs 65）；
//   · shops：values 5334 与现库零漂移;十余家商店条目现库领先（tenthNotBees/windyDay/
//     notTheBees/has:N/downedClown/anyNpc:N/golfer500/life400/mana200/coins1pt 等词表,
//     本器 parseGate 不识=整条丢弃）。
//   裸跑重产=整批回退 → 动态 diff 闸（缺省干跑零写盘,「现库有而重产无」非空即 exit 1
//   +差异清单;--write-real 非纯增量拒,强推须双旗）。
//
// era guard 四要素：①SW_TREE 缺省 1457 白名单（既有门保留）②输出通道三分离（缺省干跑
// 零写盘 / --out 显式路径沙箱 / --write-real 逃生门;双旗互斥）③缺省 OUT_PATH 锚定
// import.meta.url（cwd footgun 修复）+锚 fail-loud（方法签名/基数护栏）④判别力自证
// （本文件变异 M1/M2+cwd footgun 回归）。守卫测试习语 = extract-petai-era-guard.test.ts。

const TS_SCRIPT = join(process.cwd(), 'tools', 'extract-travelshop.mjs');
const SS_SCRIPT = join(process.cwd(), 'tools', 'extract-shops.mjs');
const TS_LIVE = join(process.cwd(), 'src', 'data', 'vanilla-travelshop.json');
const SS_LIVE = join(process.cwd(), 'src', 'data', 'vanilla-shopstock.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接（petai/itemrare 同案）
const TMP = realpathSync(tmpdir());

describe('extract-travelshop era guard（cwd footgun 修 + 动态 diff 干跑闸）', () => {
  it('行为面:缺省干跑零写盘;现库领先面非空=洗库预警 exit 1+差异清单', () => {
    const before = md5(TS_LIVE);
    const r = spawnSync('node', [TS_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('洗库预警');
    expect(r.stderr).toContain('anyBossKill');      // BJ215 定谳领先面物证（richer cond 词表）
    expect(r.stderr).toContain('ids');
    expect(md5(TS_LIVE)).toBe(before);
  });

  it('行为面:--out 沙箱显式写（既有通道保留,现库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'travelshop-guard-'));
    const before = md5(TS_LIVE);
    try {
      const out = join(dir, 'ts-fresh.json');
      const r = spawnSync('node', [TS_SCRIPT, '--out', out], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('--out 显式路径');
      expect(readFileSync(out, 'utf8')).toContain('"items"');
      expect(md5(TS_LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--out 与 --write-real 双旗互斥;--write-real 非纯增量拒+差异清单', () => {
    const before = md5(TS_LIVE);
    const r = spawnSync('node', [TS_SCRIPT, '--out', '/tmp/bj215-mutual.json', '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('双旗互斥');

    const r2 = spawnSync('node', [TS_SCRIPT, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r2.status).toBe(1);
    expect(r2.stderr).toContain('拒绝 --write-real');
    expect(r2.stderr).toContain('非纯增量');
    expect(md5(TS_LIVE)).toBe(before);               // 闸在写前拒
  });

  it('回归面:cwd footgun 修复——从仓库根裸跑仍走锚定路径（守卫判定,而非写错位置）', () => {
    const repoRoot = join(process.cwd(), '..');
    const stray = join(repoRoot, 'src', 'data', 'vanilla-travelshop.json');
    const before = md5(TS_LIVE);
    // 旧实现会写 repoRoot/src/data/vanilla-travelshop.json（相对 cwd）;新实现=干跑+锚定读真库
    const r = spawnSync('node', [TS_SCRIPT], { cwd: repoRoot, encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(1);                        // 守卫判定（现库领先面）而非 ENOENT 崩
    expect(r.stderr).toContain('洗库预警');
    expect(existsSync(stray)).toBe(false);           // 错位文件未被创建
    expect(md5(TS_LIVE)).toBe(before);
  });

  // ★变异 M1:摘掉「缺省干跑」门（OUT_PATH 干跑臂 null 换成假现库路径）→ 裸跑静默写。
  //   注：断言对照 --out 重产 fresh（现库领先于重产+缺 src 元字段,字节面本不相等）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'travelshop-guard-'));
    const fakeLive = join(dir, 'vanilla-travelshop.json');
    writeFileSync(fakeLive, '{"seeded":true}');
    const beforeLive = md5(TS_LIVE);
    try {
      const src = readFileSync(TS_SCRIPT, 'utf8');
      const TRIGGER = 'process.argv[outIdx + 1] : null;';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-travelshop-mutant.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'process.argv[outIdx + 1] : ' + JSON.stringify(fakeLive) + '; // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');
      const fresh = join(dir, 'ts-fresh.json');
      spawnSync('node', [TS_SCRIPT, '--out', fresh], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(md5(fakeLive)).toBe(md5(fresh));        // 写的就是全量重产产物
      expect(md5(TS_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）+ diff 引擎双向判别（假现库=重产产物→exit 0;+领先条目→exit 1）
  it('变异 M2:毒化方法签名锚 fail-loud;diff 引擎双向判别（假现库重定向）', () => {
    const dir = mkdtempSync(join(TMP, 'travelshop-guard-'));
    const beforeLive = md5(TS_LIVE);
    try {
      const src = readFileSync(TS_SCRIPT, 'utf8');
      const TRIGGER = "extractPool('SetupTravelShop_GetItem')";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-travelshop-mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, "extractPool('SetupTravelShop_GetItemX')")); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');

      // diff 引擎双向:LIVE_JSON 重定向假现库（mutant）——种子=--out 重产产物 → exit 0
      const out = join(dir, 'ts-fresh.json');
      const r1 = spawnSync('node', [TS_SCRIPT, '--out', out], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r1.status).toBe(0);
      const TRIGGER2 = "const LIVE_JSON = join(GAME_ROOT, 'src', 'data', 'vanilla-travelshop.json');";
      expect(src).toContain(TRIGGER2);
      const fakeLive = join(dir, 'fake-live.json');
      const mutant2 = join(dir, 'extract-travelshop-mutant-live.mjs');
      writeFileSync(mutant2, src.replace(TRIGGER2, `const LIVE_JSON = ${JSON.stringify(fakeLive)};`));
      copyFileSync(out, fakeLive);
      const r2 = spawnSync('node', [mutant2], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r2.status).toBe(0);
      expect(r2.stderr).toContain('重产盖住现库');
      // 毒化假现库:注入更 rich 的领先条目 → 动态 diff 抓住 → exit 1
      const poisoned = JSON.parse(readFileSync(fakeLive, 'utf8'));
      (poisoned.items as Array<Record<string, unknown>>).unshift({ id: 9999, tier: 0, cond: 'anyBossKill' });
      writeFileSync(fakeLive, JSON.stringify(poisoned));
      const r3 = spawnSync('node', [mutant2], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r3.status).toBe(1);
      expect(r3.stderr).toContain('anyBossKill');
      expect(md5(TS_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extract-shops era guard（cwd footgun 修 + 动态 diff 干跑闸）', () => {
  it('行为面:缺省干跑零写盘;现库领先面非空=洗库预警 exit 1+差异清单', () => {
    const before = md5(SS_LIVE);
    const r = spawnSync('node', [SS_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('洗库预警');
    expect(r.stderr).toContain('npc 17');            // BJ215 定谳:多家商店条目领先
    expect(r.stderr).toContain('tenthNotBees');      // richer cond 词表物证
    expect(md5(SS_LIVE)).toBe(before);
  });

  it('行为面:--out 沙箱显式写（values+shops 双段,现库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'shops-guard-'));
    const before = md5(SS_LIVE);
    try {
      const out = join(dir, 'ss-fresh.json');
      const r = spawnSync('node', [SS_SCRIPT, '--out', out], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      const fresh = JSON.parse(readFileSync(out, 'utf8')) as { values: Record<string, number>; shops: Record<string, unknown[]> };
      expect(Object.keys(fresh.values).length).toBeGreaterThan(5000);
      expect(Object.keys(fresh.shops).length).toBeGreaterThan(15);
      expect(md5(SS_LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--out 与 --write-real 双旗互斥;--write-real 非纯增量拒+差异清单', () => {
    const before = md5(SS_LIVE);
    const r = spawnSync('node', [SS_SCRIPT, '--out', '/tmp/bj215-mutual2.json', '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('双旗互斥');

    const r2 = spawnSync('node', [SS_SCRIPT, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r2.status).toBe(1);
    expect(r2.stderr).toContain('拒绝 --write-real');
    expect(md5(SS_LIVE)).toBe(before);
  });

  it('回归面:cwd footgun 修复——从仓库根裸跑仍走锚定路径', () => {
    const repoRoot = join(process.cwd(), '..');
    const stray = join(repoRoot, 'src', 'data', 'vanilla-shopstock.json');
    const before = md5(SS_LIVE);
    const r = spawnSync('node', [SS_SCRIPT], { cwd: repoRoot, encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('洗库预警');
    expect(existsSync(stray)).toBe(false);
    expect(md5(SS_LIVE)).toBe(before);
  });

  it('变异 M1:摘干跑门后裸跑静默写「现库」（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'shops-guard-'));
    const fakeLive = join(dir, 'vanilla-shopstock.json');
    writeFileSync(fakeLive, '{"seeded":true}');
    const beforeLive = md5(SS_LIVE);
    try {
      const src = readFileSync(SS_SCRIPT, 'utf8');
      const TRIGGER = 'process.argv[outIdx + 1] : null;';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-shops-mutant.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'process.argv[outIdx + 1] : ' + JSON.stringify(fakeLive) + '; // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');
      expect(md5(SS_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M2:毒化 SetupShop 签名锚 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'shops-guard-'));
    const beforeLive = md5(SS_LIVE);
    try {
      const src = readFileSync(SS_SCRIPT, 'utf8');
      const TRIGGER = "'public void SetupShop(int type)'";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-shops-mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, "'public void SetupShopX(int type)'")); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('SetupShop');
      expect(md5(SS_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
