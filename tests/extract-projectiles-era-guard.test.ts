import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★清债（2026-09-18，BJ114-e 同族普查）：extract-projectiles.mjs producer 追加时代守卫
// ——vanilla-projectiles.json 现库含 producer 输出面之外的增量字段（鞭/多弹族
// localNPCHitCooldown / idStaticNPCHitCooldown / 1117·1122 宽高元组等 33 键，恢复指引
// = src/data/vanillaProjectiles.ts 头注手补清单），本 producer=纯全量覆写（不读现有），
// SW_ITEM_VER=1456 跑会把 1457 特有弹段 1111-1135（ProjectileID.Count=1136 的 25 弹）
// 整段洗掉、任何跑都会洗掉手补增量——CLAUDE.md「vanilla-projectiles.json 曾被 1456
// 提取器重跑，须对照 1457 逐值校验」的制度化解法。照 era guard 判例（atlas 四连 /
// recipes R25-B5② / npcs 债刀-3）落闸：守卫=重产 vs 现库【动态 diff】①缺 id（1111-
// 1135 段整缺=1456 源指纹，探测动态比对不硬编码 id 清单）+②值漂移（同 id 键值
// deep-equal 不等），任一非空且未带双旗即拒。守卫测试习语 =
// extract-npcs-era-guard.test.ts / extract-itemrare-era-guard.test.ts。

const SCRIPT = join(process.cwd(), 'tools', 'extract-projectiles.mjs');
const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-projectiles.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接:import.meta.url 是 realpath 而 pathToFileURL(argv[1])
//   不是——mutant 脚本放 /var 下会因 URL 不匹配跳过 CLI 分支。临时目录一律取 realpath。
const TMP = realpathSync(tmpdir());
/** 拒绝路径测试的注入面:SW_OUT 重定向写盘(守卫失灵时测试也伤不到现库)+探测路径
 *  显式钉回现库(缺省探测路径跟随 SW_OUT,不钉=探测落空,守卫测不到真实现库)。 */
const rejectEnv = (dir: string) => ({
  ...process.env,
  SW_OUT: dir,
  SW_PROJ_JSON: LIVE,
});

/** 零增量夹具：与 1457 重产输出逐字段相等（守卫判据②值漂移要求 deep-equal；取自
 *  vanilla-projectiles.json 现库未手补键 3/16 的稳定原版值） */
const CLEAN_FIXTURE = JSON.stringify({
  3: { aiStyle: 2, width: 22, height: 22, penetrate: 4, friendly: true, ranged: true },
  16: { aiStyle: 9, width: 32, height: 32, light: 0.8, friendly: true, magic: true, ignoreWater: true },
});
/** 增量夹具：鞭/多弹族现库独有字段 localNPCHitCooldown（producer 输出面之外,重产即洗） */
const INCREMENT_FIXTURE = JSON.stringify({
  76: { aiStyle: 21, width: 22, height: 24, penetrate: 5, timeLeft: 180, light: 0.3, friendly: true, magic: true, ignoreWater: true, localNPCHitCooldown: 30 },
});

describe('extract-projectiles 追加时代守卫（缺 id+值漂移双判据）', () => {
  it('行为面:现库追加时代（手补增量 33 键）下默认运行被拒,现库字节零改动', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: rejectEnv(dir),   // SW_OUT 重定向:守卫失灵时测试也伤不到现库
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝全量覆写');
      expect(r.stderr).toContain('SW_ITEM_VER=1457');            // 缺省源版本动态标注
      expect(r.stderr).toContain('值漂移');                       // 判据②（手补增量形态）
      expect(r.stderr).toContain('33 键');                        // 真实增量物证（vanillaProjectiles.ts 手补清单族）
      expect(r.stderr).toContain('localNPCHitCooldown');          // 现库独有字段=重产即洗
      expect(r.stderr).toContain('recon-item-1456-1457.mjs');     // 活通道指引
      expect(r.stderr).toContain('--force-full');                 // 双旗逃生指引
      expect(md5(LIVE)).toBe(before);                             // 拒绝路径零写盘
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_ITEM_VER=1456 跑被缺 id 判据拒（1457 特有弹段 1111-1135 指纹动态捕获）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...rejectEnv(dir), SW_ITEM_VER: '1456' },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('缺 id');
      expect(r.stderr).toContain('25 个');                        // 1457 新增 25 弹整缺
      expect(r.stderr).toContain('1111');                         // 段首 id（动态列举,非硬编码断言源）
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--force-full 单旗仍被拒（双旗第二键 --overwrite-append-era 在位）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: rejectEnv(dir),
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝全量覆写');
      expect(r.stderr).toContain('--overwrite-append-era');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('结构锁:拒绝路径守卫块内零写盘+双旗逃生门/deep-equal 探测/活通道锚在位', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const guardStart = src.indexOf('const appendEra');
    const guardEnd = src.indexOf('process.exit(1)', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    const guardBlock = src.slice(guardStart, guardEnd);
    expect(guardBlock).not.toContain('writeFileSync(');   // 拒绝路径零写盘的结构前提
    expect(src).toContain('--force-full');
    expect(src).toContain('--overwrite-append-era');
    // 探测式=动态现库 diff（缺 id + deep-equal 值漂移），非硬编码 id 清单
    expect(src).toContain('jsonEq(');
    expect(src).toContain('appendEra = missingIds.length > 0 || driftKeys.length > 0');
    // 活通道锚在位
    expect(src).toContain('recon-item-1456-1457.mjs');
  });

  it('行为面:双旗逃生门放行（SW_OUT 注入 /tmp,全量重算=真实覆写语义,现库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const out = join(dir, 'full.json');
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const prod = JSON.parse(readFileSync(out, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(Object.keys(prod).length).toBeGreaterThan(1000);   // 1457 全量重算产物
      expect('1111' in prod).toBe(true);                        // 1457 特有弹段在位
      expect(prod['76']?.localNPCHitCooldown).toBeUndefined();  // 重产确实不含手补增量——双旗=明示放弃
      expect(md5(LIVE)).toBe(before);                           // 现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:零增量夹具放行（守卫不误伤;SW_PROJ_JSON/SW_OUT 双注入,零接触现库）', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const fixture = join(dir, 'clean.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_PROJ_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).length).toBeGreaterThan(1000);   // 全量重算产物落注入路径
      expect(md5(LIVE)).toBe(before);                              // 注入面隔离,现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘掉守卫判据 → 增量夹具被静默洗掉（exit 0+localNPCHitCooldown
  // 列消失落盘）。证明「守卫是手补增量下唯一的拦截面」，摘 guard 必红（重跑抹手补
  // 清单事故重演,vanillaProjectiles.ts 头注⚠即此案）。
  it('变异:摘守卫判据后增量夹具被静默洗掉(证明 guard 判别力)', () => {
    const dir = mkdtempSync(join(TMP, 'proj-guard-'));
    const mutant = join(dir, 'extract-projectiles-mutant.mjs');
    const fixture = join(dir, 'incr.json');
    const out = join(dir, 'out.json');
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const appendEra = missingIds.length > 0 || driftKeys.length > 0;';
    expect(src).toContain(TRIGGER);
    writeFileSync(mutant, src.replace(TRIGGER, 'const appendEra = false; // ★变异:守卫判据摘除'));
    writeFileSync(fixture, INCREMENT_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_PROJ_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);                                 // 无 guard → 放行
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, Record<string, unknown>>;
      expect(written['76']?.localNPCHitCooldown).toBeUndefined();   // 手补列被静默洗掉=事故重演
      expect(md5(LIVE)).toBe(before);                           // 注入面隔离,现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
