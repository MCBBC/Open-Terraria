import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
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
});
