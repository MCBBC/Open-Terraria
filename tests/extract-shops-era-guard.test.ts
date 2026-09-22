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
  it('行为面:缺省干跑零写盘;★BJ217 词表恢复后重产盖住现库（多重集逐值全等）exit 0', () => {
    const before = md5(TS_LIVE);
    const r = spawnSync('node', [TS_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    // BJ215 时点:现库领先（anyBossKill/ids 组等 4+9 条）→ exit 1;BJ217 词表恢复
    // （TRAVEL_CONDS 精匹配表+ids 组+hardModeUp 捕获）→ 重产盖住现库 → exit 0。
    // 现库与重产的唯一偏差=2281-2283 组条目位序（源码位序 vs 手补末位追加,
    // 工具头注 ★BJ217 段）,多重集对拍不受影响。
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('重产盖住现库');
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

  it('行为面:--out 与 --write-real 双旗互斥;--write-real 非纯增量拒+差异清单（假现库重定向,真库零接触）', () => {
    const before = md5(TS_LIVE);
    const r = spawnSync('node', [TS_SCRIPT, '--out', '/tmp/bj215-mutual.json', '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('双旗互斥');

    // ★BJ217 重设计：词表恢复后真现库对拍可为零漂移——--write-real 若直跑真库路径
    // 会真实写入（BJ215 时代靠「非纯增量拒」兜底已不成立）。守卫改走 mutant 重定向
    // 假现库：毒化假现库（注入重产缺条）→ 拒+差异清单;假现库/真库均零写入。
    const dir = mkdtempSync(join(TMP, 'travelshop-guard-'));
    try {
      const src = readFileSync(TS_SCRIPT, 'utf8');
      const TRIGGER = "const LIVE_JSON = process.env.SW_TRAVELSHOP_JSON ?? join(GAME_ROOT, 'src', 'data', 'vanilla-travelshop.json');";
      expect(src).toContain(TRIGGER);
      const fakeLive = join(dir, 'vanilla-travelshop.json');
      copyFileSync(TS_LIVE, fakeLive);
      const poisoned = JSON.parse(readFileSync(fakeLive, 'utf8')) as { items: Array<Record<string, unknown>> };
      poisoned.items.unshift({ id: 9999, tier: 0, cond: 'anyBossKill' });   // 注入领先条目
      writeFileSync(fakeLive, JSON.stringify(poisoned));
      const beforeFake = md5(fakeLive);
      const mutant = join(dir, 'extract-travelshop-mutant-live.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, `const LIVE_JSON = ${JSON.stringify(fakeLive)};`));
      const r2 = spawnSync('node', [mutant, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r2.status).toBe(1);
      expect(r2.stderr).toContain('拒绝 --write-real');
      expect(r2.stderr).toContain('非纯增量');
      expect(md5(fakeLive)).toBe(beforeFake);        // 假现库零写入（闸在写前拒）
      expect(md5(TS_LIVE)).toBe(before);             // 真库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('回归面:cwd footgun 修复——从仓库根裸跑仍走锚定路径（守卫判定,而非写错位置）', () => {
    const repoRoot = join(process.cwd(), '..');
    const stray = join(repoRoot, 'src', 'data', 'vanilla-travelshop.json');
    const before = md5(TS_LIVE);
    // 旧实现会写 repoRoot/src/data/vanilla-travelshop.json（相对 cwd）;新实现=干跑+锚定读真库
    const r = spawnSync('node', [TS_SCRIPT], { cwd: repoRoot, encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);                        // ★BJ217:干跑对拍零漂移（守卫判定,非 ENOENT 崩）
    expect(r.stderr).toContain('重产盖住现库');
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
      const TRIGGER2 = "const LIVE_JSON = process.env.SW_TRAVELSHOP_JSON ?? join(GAME_ROOT, 'src', 'data', 'vanilla-travelshop.json');";
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
  it('行为面:缺省干跑零写盘;★BJ222 数据面修正后重产盖住现库 exit 0;干跑 loud 支转合成毒化保持', () => {
    const before = md5(SS_LIVE);
    const r = spawnSync('node', [SS_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    // BJ215 时点:十余家现库领先 132 条 → exit 1;BJ217 词表恢复后 live-only 残差仅
    // 353 的 2863/3259 → 仍 exit 1;★BJ222 数据刀补火星门（cond='hardMode&&downedMartians',
    // Chest.cs:2771）→ live-only 清零 → 重产盖住现库 exit 0（fresh-only 4 店 58 条
    // 维持不写入,工具干跑语义）。
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('重产盖住现库');
    expect(md5(SS_LIVE)).toBe(before);

    // 干跑 loud 支判别力不降（原天然残差触发面消失 → mutant 重定向毒化假现库,
    // BJ217 --write-real 守卫同款习语）：假现库注入重产缺条 → 裸跑必 exit 1+差异清单。
    const dir = mkdtempSync(join(TMP, 'shops-guard-'));
    try {
      const src = readFileSync(SS_SCRIPT, 'utf8');
      const TRIGGER = "const LIVE_JSON = process.env.SW_SHOPSTOCK_JSON ?? join(GAME_ROOT, 'src', 'data', 'vanilla-shopstock.json');";
      expect(src).toContain(TRIGGER);
      const fakeLive = join(dir, 'vanilla-shopstock.json');
      copyFileSync(SS_LIVE, fakeLive);
      const poisoned = JSON.parse(readFileSync(fakeLive, 'utf8')) as { shops: Record<string, Array<Record<string, unknown>>> };
      poisoned.shops['17'].unshift({ id: 9999, price: 1, cond: null });   // 注入领先条目
      writeFileSync(fakeLive, JSON.stringify(poisoned));
      const mutant = join(dir, 'extract-shops-mutant-live.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, `const LIVE_JSON = ${JSON.stringify(fakeLive)};`));
      const r2 = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r2.status).toBe(1);
      expect(r2.stderr).toContain('洗库预警');
      expect(r2.stderr).toContain('npc 17');           // 差异清单物证（毒化店）
      expect(md5(SS_LIVE)).toBe(before);               // 真库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it('行为面:--out 与 --write-real 双旗互斥;--write-real 非纯增量拒+差异清单（假现库重定向）', () => {
    const before = md5(SS_LIVE);
    const r = spawnSync('node', [SS_SCRIPT, '--out', '/tmp/bj215-mutual2.json', '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('双旗互斥');

    // ★BJ217 重设计：--write-real 不再直跑真库路径（真现库残差仅 2 条,守卫拒依赖
    // 残差存在——一旦数据刀修正即失效）。mutant 重定向毒化假现库 → 拒+清单。
    const dir = mkdtempSync(join(TMP, 'shops-guard-'));
    try {
      const src = readFileSync(SS_SCRIPT, 'utf8');
      const TRIGGER = "const LIVE_JSON = process.env.SW_SHOPSTOCK_JSON ?? join(GAME_ROOT, 'src', 'data', 'vanilla-shopstock.json');";
      expect(src).toContain(TRIGGER);
      const fakeLive = join(dir, 'vanilla-shopstock.json');
      copyFileSync(SS_LIVE, fakeLive);
      const poisoned = JSON.parse(readFileSync(fakeLive, 'utf8')) as { shops: Record<string, Array<Record<string, unknown>>> };
      poisoned.shops['17'].unshift({ id: 9999, price: 1, cond: null });   // 注入领先条目
      writeFileSync(fakeLive, JSON.stringify(poisoned));
      const beforeFake = md5(fakeLive);
      const mutant = join(dir, 'extract-shops-mutant-live.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, `const LIVE_JSON = ${JSON.stringify(fakeLive)};`));
      const r2 = spawnSync('node', [mutant, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r2.status).toBe(1);
      expect(r2.stderr).toContain('拒绝 --write-real');
      expect(md5(fakeLive)).toBe(beforeFake);        // 假现库零写入（闸在写前拒）
      expect(md5(SS_LIVE)).toBe(before);             // 真库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('回归面:cwd footgun 修复——从仓库根裸跑仍走锚定路径', () => {
    const repoRoot = join(process.cwd(), '..');
    const stray = join(repoRoot, 'src', 'data', 'vanilla-shopstock.json');
    const before = md5(SS_LIVE);
    const r = spawnSync('node', [SS_SCRIPT], { cwd: repoRoot, encoding: 'utf8', timeout: 300_000 });
    // ★BJ222:干跑对拍零漂移（守卫判定,非洗库预警）——从仓库根跑仍走 import.meta.url
    //   锚定路径读真库,错位文件不创建（travelshop 姊妹测试同钉值）。
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('重产盖住现库');
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

// ================= ★G-1（BJ261 2026-09-22）fresh-only 轴（S3 普查案） =================
// 现状 washOf 只算 live-only——变异实证现库删条恒绿（现库退化不可见）。★G-1/S3 处方：
// travelshop=拒（B 形态重产面应盖住现库,缺键型=itemrare 同族）;shops=选报（60 条刻意
// 剥离面=运行时直管恒非空,拒跑语义不成立,但轴向必须 loud 供人工判别）。
describe('travelshop/shops G-1 fresh-only 轴（BJ261）', () => {
  it('travelshop 行为面:现库删条 → fresh-only 命名物证 exit 1（恒绿盲区收口）', () => {
    const dir = mkdtempSync(join(TMP, 'g1-freshonly-'));
    try {
      const live = JSON.parse(readFileSync(TS_LIVE, 'utf8'));
      const dropped = live.items.shift();   // 现库退化:删首条
      const fixture = join(dir, 'degraded.json');
      writeFileSync(fixture, JSON.stringify(live));
      const r = spawnSync('node', [TS_SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_TRAVELSHOP_JSON: fixture },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
      expect(r.stderr).toContain(JSON.stringify(dropped));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('travelshop 变异:摘 fresh-only 轴后对退化现库恒绿复现（证明该轴是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'g1-freshonly-'));
    try {
      const live = JSON.parse(readFileSync(TS_LIVE, 'utf8'));
      live.items.shift();
      const fixture = join(dir, 'degraded.json');
      writeFileSync(fixture, JSON.stringify(live));
      const probeEnv = { ...process.env, SW_TRAVELSHOP_JSON: fixture };
      const src = readFileSync(TS_SCRIPT, 'utf8');
      const TRIGGER = 'wash.itemsFresh = freshOnlyOf(live.items ?? [], items);';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-travelshop-mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'wash.itemsFresh = []; // ★变异:fresh-only 轴摘除'));
      const real = spawnSync('node', [TS_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(real.status).toBe(1);      // 真工具:轴在位 → 拒
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(r.status).toBe(0);         // 变异体:轴摘除 → 恒绿复现
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shops 行为面:现库删条 → fresh-only 选报命名物证（选报语义,exit 0;★现库退化人工判别）', () => {
    const dir = mkdtempSync(join(TMP, 'g1-freshonly-'));
    try {
      const live = JSON.parse(readFileSync(SS_LIVE, 'utf8'));
      const npc = '588';
      const dropped = live.shops[npc][0];
      live.shops[npc] = live.shops[npc].slice(1);
      const fixture = join(dir, 'degraded.json');
      writeFileSync(fixture, JSON.stringify(live));
      const r = spawnSync('node', [SS_SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_SHOPSTOCK_JSON: fixture },
      });
      // 选报语义:exit 0（刻意剥离面恒非空,拒跑不成立）,但 fresh-only 报告必须点名退化店
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('[fresh-only 选报]');
      expect(r.stderr).toContain(`npc ${npc}`);
      expect(r.stderr).toContain(JSON.stringify(dropped).slice(0, 40));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shops 变异:摘 fresh-only 轴后选报静默（证明该轴是唯一报告面）', () => {
    const dir = mkdtempSync(join(TMP, 'g1-freshonly-'));
    try {
      const live = JSON.parse(readFileSync(SS_LIVE, 'utf8'));
      live.shops['588'] = live.shops['588'].slice(1);
      const fixture = join(dir, 'degraded.json');
      writeFileSync(fixture, JSON.stringify(live));
      const probeEnv = { ...process.env, SW_SHOPSTOCK_JSON: fixture };
      const src = readFileSync(SS_SCRIPT, 'utf8');
      const TRIGGER = 'if (freshOnly.length) wash.shopsFresh[npc] = { n: freshOnly.length, samples: freshOnly.slice(0, 2).map(sig) };';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-shops-mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (false) wash.shopsFresh[npc] = { n: freshOnly.length, samples: freshOnly.slice(0, 2).map(sig) }; // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(r.status).toBe(0);
      expect(r.stderr).not.toContain(`npc 588: 重产`);   // 选报面静默=轴被摘
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
