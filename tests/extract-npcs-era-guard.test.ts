import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★债刀-3（2026-09-17）：extract-npcs.mjs producer 退役态守卫——1405 锚时代 producer
// 对 vanilla-npcs.json 纯全量覆写（不读现有），误重跑一次洗掉 587-696 全部新增 NPC
// + critter/color/value/boss/rarity/hide 白名单外字段 + 586 以内 1457 终值修正。
// vanilla-atlas.mjs 全量重跑四连事故同族 → 照 atlas era guard 判例落闸：
// 检测现库含 producer 输出面之外的键（id>586 或白名单外字段）即拒 exit 1+指引走
// recon-npc-1456-1457.mjs --fix 活通道；--force-full 单旗仍拒，原地强推须双旗
// --force-full --overwrite-append-era。守卫测试习语 = sw-fx23-atlas-era-guard.test.ts。

const SCRIPT = join(process.cwd(), 'tools', 'extract-npcs.mjs');
const LIVE = join(process.cwd(), 'public', 'sprites', 'vanilla-npcs.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');

/** 增量夹具：id>586 条目 + 白名单外字段（守卫两条判据各踩一条） */
const INCREMENT_FIXTURE = JSON.stringify({
  1: { id: 1, name: 'Blue Slime', frames: 2, lifeMax: 25, color: '175,220,90' },  // 白名单外字段
  587: { id: 587, name: 'Eyeball Flying Fish', frames: 4, lifeMax: 300 },          // id>586
});
/** 零增量夹具：纯 producer 输出面字段（守卫须放行） */
const CLEAN_FIXTURE = JSON.stringify({
  1: { id: 1, name: 'Blue Slime', frames: 2, lifeMax: 25, damage: 7, defense: 2 },
  3: { id: 3, name: 'Zombie', frames: 3, lifeMax: 45, damage: 14 },
});

describe('extract-npcs 追加时代守卫（债刀-3）', () => {
  it('行为面:现库增量态下默认运行被拒（exit 1+活通道指引）,现库字节零改动', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝全量重写');
    expect(r.stderr).toContain('recon-npc-1456-1457.mjs');   // 活通道指引
    expect(r.stderr).toContain('--fix');
    expect(r.stderr).toContain('--force-full');
    expect(r.stderr).toContain('110 条');                     // 真实增量物证（587-696）
    expect(md5(LIVE)).toBe(before);                           // 拒绝路径零写盘
  });

  it('行为面:--force-full 单旗在增量态仍被拒（双旗第二键 --overwrite-append-era 在位）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT, '--force-full'], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝全量重写');
    expect(r.stderr).toContain('--overwrite-append-era');
    expect(md5(LIVE)).toBe(before);
  });

  it('结构锁:守卫块内零写盘(拒绝路径的结构前提)+双旗逃生门与探测式在位', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const guardStart = src.indexOf('追加时代守卫');
    const guardEnd = src.indexOf('process.exit(1)', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    const guardBlock = src.slice(guardStart, guardEnd);
    expect(guardBlock).not.toContain('writeFileSync(');   // 拒绝路径零写盘
    expect(src).toContain('--force-full');
    expect(src).toContain('--overwrite-append-era');
    // 探测式=两条键集判据（id>MAX_ID 白名单外字段），与现库真实增量同源
    expect(src).toContain('beyondIds');
    expect(src).toContain('extraFields');
    // 活通道锚在位
    expect(src).toContain('recon-npc-1456-1457.mjs');
  });

  it('行为面:双旗逃生门放行（SW_OUT 注入 /tmp,producer 全量重算,现库零接触）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const out = join(dir, 'full.json');
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      const prod = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(prod).length).toBeGreaterThan(500);   // 1405 全量重算产物
      expect(md5(LIVE)).toBe(before);                           // 现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:零增量夹具放行（守卫不误伤;SW_NPCS_JSON/SW_OUT 双注入,零接触现库）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'clean.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_NPCS_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('npcs');
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).length).toBeGreaterThan(500);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘掉守卫判据 → 增量夹具被静默洗掉（exit 0+写盘）。
  // 证明「守卫是增量态下唯一的拦截面」,摘 guard 必红。
  it('变异:摘守卫判据后增量夹具被静默全量覆写(证明 guard 判别力)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'incr.json');
    const out = join(dir, 'out.json');
    const mutant = join(dir, 'extract-npcs-mutant.mjs');
    writeFileSync(fixture, INCREMENT_FIXTURE);
    const src = readFileSync(SCRIPT, 'utf8');
    expect(src).toContain('beyondIds.length > 0 || extraFields.size > 0');
    writeFileSync(mutant, src.replace(
      'const appendEra = beyondIds.length > 0 || extraFields.size > 0;',
      'const appendEra = false; // ★变异:守卫判据摘除',
    ));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_NPCS_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);                                 // 无 guard → 放行
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, { id: number }>;
      // 1405 全量覆写:夹具增量(id 587/color 字段)已被洗掉——守卫缺失即事故重演
      expect(written['587']).toBeUndefined();
      expect(written['1'] && (written['1'] as Record<string, unknown>).color).toBeUndefined();
      expect(md5(LIVE)).toBe(before);                           // 注入面隔离,现库零接触
    } finally {
      for (const f of [fixture, out, mutant]) { try { unlinkSync(f); } catch { /* noop */ } }
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★g1 footgun 硬化测试（红蓝-J1②,2026-09-18）：探测 env（SW_NPCS_JSON）设置而 SW_OUT
  //   缺省 → 拒跑 exit 1（fail-closed——守卫探测读干净夹具零增量放行,写盘却落缺省
  //   现库路径 public/sprites/vanilla-npcs.json=绕守卫洗库）。同场景 + 显式 SW_OUT →
  //   放行;变异=摘硬化 → footgun 复现（探测夹具+缺 SW_OUT 下写盘落「缺省现库」路径,
  //   变异里把缺省 OUT_JSON 换成沙箱假现库=真现库副本+id587 增量物证种子,真现库零接触）。
  it('行为面:探测 env 设置而 SW_OUT 缺省 → 拒跑 exit 1（footgun fail-closed）,现库字节零改动', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'clean.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_NPCS_JSON: fixture,
      };
      delete env.SW_OUT;   // footgun 场景=写盘路径缺省（显式剥除防运行环境污染）
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('SW_OUT 缺省');
      expect(r.stderr).toContain('fail-closed');
      expect(r.stderr).toContain('探测注入面');
      expect(md5(LIVE)).toBe(before);                            // 拒绝路径零写盘
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:同 footgun 场景 + 显式 SW_OUT → 放行（写盘落 SW_OUT）,现库零接触', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fixture = join(dir, 'clean.json');
    const out = join(dir, 'out.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_NPCS_JSON: fixture, SW_OUT: out },
      });
      expect(r.status).toBe(0);                                  // 硬化只拦 SW_OUT 缺省
      const written = JSON.parse(readFileSync(out, 'utf8')) as Record<string, unknown>;
      expect(Object.keys(written).length).toBeGreaterThan(500);  // 全量重算产物落显式 SW_OUT
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘 g1 硬化 → 探测夹具（零增量）+缺 SW_OUT 下守卫被绕过,写盘落
  //   缺省「现库」路径=footgun 复现。变异里把缺省 OUT_JSON 换成沙箱假现库（种子=
  //   真现库副本+id587 增量物证）——重产洗掉 587=洗库物证;真现库零接触。
  it('变异:摘 g1 硬化后探测夹具+缺 SW_OUT 写盘落缺省现库路径（587 被洗=footgun 复现）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'npcs-guard-'));
    const fakeLive = join(dir, 'live');
    mkdirSync(fakeLive, { recursive: true });
    // 假现库=真现库副本 + id587（producer 输出面外增量=洗库物证）
    const seeded = JSON.parse(readFileSync(LIVE, 'utf8')) as Record<string, Record<string, unknown>>;
    seeded['587'] = { id: 587, name: 'FootgunWitness', frames: 4, lifeMax: 300 };
    writeFileSync(join(fakeLive, 'vanilla-npcs.json'), JSON.stringify(seeded));
    const fixture = join(dir, 'clean.json');
    writeFileSync(fixture, CLEAN_FIXTURE);
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const PROBE_ENV_SET = process.env.SW_NPCS_JSON !== undefined;';
    const OUT_LINE = 'const OUT_JSON = process.env.SW_OUT ?? `${ROOT}/game/public/sprites/vanilla-npcs.json`;';
    expect(src).toContain(TRIGGER);
    expect(src).toContain(OUT_LINE);
    const mutant = join(dir, 'extract-npcs-mutant-g1.mjs');
    writeFileSync(mutant, src
      .replace(TRIGGER, 'const PROBE_ENV_SET = false; // ★变异:g1 硬化摘除（红蓝-J1②）')
      .replace(OUT_LINE, 'const OUT_JSON = process.env.SW_MUTANT_FAKE_LIVE;'));
    const before = md5(LIVE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_NPCS_JSON: fixture, SW_MUTANT_FAKE_LIVE: join(fakeLive, 'vanilla-npcs.json'),
      };
      delete env.SW_OUT;
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(0);                                 // 硬化摘除 → footgun 放行
      const washed = JSON.parse(readFileSync(join(fakeLive, 'vanilla-npcs.json'), 'utf8')) as Record<string, Record<string, unknown>>;
      expect(washed['587']).toBeUndefined();                    // 假现库被重产洗掉增量=洗库复现
      expect(washed['1']?.lifeMax).toBe(25);                    // 写盘确为重产全量（非空非原样）
      expect(md5(LIVE)).toBe(before);                           // 真现库零接触（OUT_JSON 已换沙箱）
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
