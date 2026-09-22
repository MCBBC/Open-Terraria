import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ★BJ284（2026-09-22）：Projectile status 家族（extract-projstatus.mjs = StatusNPC 扁平
// chance 表 / extract-statusplayer.mjs = StatusPlayer AST 表）era guard 落闸守卫测试。
// npcdrops（BJ261）同款习语：
//
// 行为面：缺省干跑对拍零写盘（md5 canary）/ SW_OUT 沙箱 byte-perfect / 双旗互斥 /
//   非 1457 禁写真库 / g1 探测注入面与 --write-real 混用拒 / fresh-only（现库退化缺键型,
//   ★G-1/S3 处方）与 live-only（洗库预警）双向轴 / --audit 无写诊断通道保留。
// 变异：M1 摘干跑门（OUT_JSON null 臂→假现库,哨兵被覆写=裸跑静默写库复现,真现库零接触）/
//   M2 毒化锚（projstatus=基数护栏 fail-loud;statusplayer=EXPECT 护栏 DRIFT）/
//   M3 摘 fresh-only 轴（对退化现库恒绿复现=G-1 盲区判别力）。
//   mutant 置 OS tmp 时 ROOT 派生自 import.meta.url 的工具须先 ROOT_TRIGGER 前置重锚。
// 落闸定谳（BJ284 对拍实证）：两器 1457 fresh 与现库逐字节零差;1458 交叉重放亦零差
//   （白名单 {1457,1458} 依据;1456 退役显式拒——recon 工具链不含本器）。

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

const ROOT_TRIGGER = "const here = dirname(fileURLToPath(import.meta.url));\nconst ROOT = join(here, '..');";
const ROOT_ABS = `const ROOT = ${JSON.stringify('/Users/vinlic/Project/GLM/SandboxWorld/game')};`;

const spawn = (script: string, args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync('node', [script, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...env } });

describe('extract-projstatus era guard（BJ284 落闸）', () => {
  const script = join(ROOT, 'tools', 'extract-projstatus.mjs');
  const live = join(ROOT, 'src', 'data', 'vanilla-projstatus.json');
  const probe = 'SW_PROJSTATUS_JSON';

  it('行为面:缺省干跑对拍零写盘（exit 0+双向零差+现库字节零改动）', () => {
    const before = md5(live);
    const r = spawn(script);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('双向零差');
    expect(r.stderr).toContain('零写盘');
    expect(md5(live)).toBe(before);
  });

  it('行为面:SW_OUT 沙箱重产对现库 byte-perfect（幂等回归）', () => {
    const dir = mkdtempSync(join(TMP, 'pstat-guard-'));
    const before = md5(live);
    try {
      const r = spawn(script, [], sandbox(dir));
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-projstatus.json')).equals(readFileSync(live))).toBe(true);
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--audit 无写诊断通道保留（exit 0+stdout JSON+现库零改动）', () => {
    const before = md5(live);
    const r = spawn(script, ['--audit']);
    expect(r.status).toBe(0);
    const j = JSON.parse((r.stdout ?? '').trim().split('\n').pop()!);
    expect(j.types).toBeGreaterThanOrEqual(85);
    expect(j.skipped).toBeLessThanOrEqual(25);
    expect(md5(live)).toBe(before);
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒（exit 1+现库零改动）', () => {
    const dir = mkdtempSync(join(TMP, 'pstat-guard-'));
    const before = md5(live);
    try {
      const r = spawn(script, ['--write-real'], sandbox(dir));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库（1458 --write-real 拒;1456 显式拒+退役指引）', () => {
    const before = md5(live);
    const r8 = spawn(script, ['--write-real'], { SW_ITEM_VER: '1458' });
    expect(r8.status).toBe(1);
    expect(r8.stderr).toContain('拒绝写真库');
    const r6 = spawn(script, [], { SW_ITEM_VER: '1456' });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('1456 锚集已退役');
    expect(md5(live)).toBe(before);
  });

  it('行为面:g1 探测注入面与 --write-real 混用拒', () => {
    const before = md5(live);
    const r = spawn(script, ['--write-real'], { [probe]: '/tmp/whatever.json' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('探测注入面');
    expect(md5(live)).toBe(before);
  });

  it('行为面:fresh-only 轴（现库退化=空对象）干跑拒跑（exit 1+fresh-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'pstat-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const r = spawn(script, [], { [probe]: join(dir, 'degraded.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:live-only 轴（现库领先/洗库预警）干跑拒跑（exit 1+live-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'pstat-guard-'));
    try {
      const liveObj = JSON.parse(readFileSync(live, 'utf8'));
      (liveObj as Record<string, unknown>)['9999'] = [{ buff: 1, chance: 1, durMin: 1, durMax: 1, src: 0 }];
      writeFileSync(join(dir, 'ahead.json'), JSON.stringify(liveObj));
      const r = spawn(script, [], { [probe]: join(dir, 'ahead.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('live-only');
      expect(r.stderr).toContain('现库独有');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M1:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'pstat-guard-'));
    const fake = join(dir, 'vanilla-projstatus.json');
    writeFileSync(fake, '{"seeded":true}');
    const before = md5(live);
    try {
      let src = readFileSync(script, 'utf8');
      expect(src).toContain(ROOT_TRIGGER);   // ROOT_TRIGGER 前置重锚（tmp mutant 必备）
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TD = '/vanilla-projstatus.json` : null);';
      expect(src).toContain(TD);
      const mutant = join(dir, 'mutant.mjs');
      writeFileSync(mutant, src.replace(TD, `/vanilla-projstatus.json\` : ${JSON.stringify(fake)}); // ★变异:干跑门摘除`));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fake, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fake)).toBe(md5(live));
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M2:毒化基数护栏后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'pstat-guard-'));
    const before = md5(live);
    try {
      let src = readFileSync(script, 'utf8');
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TRIGGER = 'if (Object.keys(table).length < 100 || entries < 110) {';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (Object.keys(table).length < 10000 || entries < 110000) {'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('基数护栏');
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力）', () => {
    const dir = mkdtempSync(join(TMP, 'pstat-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const probeEnv = { [probe]: join(dir, 'degraded.json') };
      const real = spawn(script, [], probeEnv);
      expect(real.status).toBe(1);
      let src = readFileSync(script, 'utf8');
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TRIGGER = "for (const k of Object.keys(fresh)) if (!lk.has(k)) out.freshOnly.push(`${prefix}.${k}`);";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (false) out.freshOnly.push(`${prefix}.${k}`); // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...probeEnv } });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extract-statusplayer era guard（BJ284 落闸）', () => {
  const script = join(ROOT, 'tools', 'extract-statusplayer.mjs');
  const live = join(ROOT, 'src', 'data', 'vanilla-statusplayer.json');
  const probe = 'SW_STATUSPLAYER_JSON';

  it('行为面:缺省干跑对拍零写盘（exit 0+双向零差+现库字节零改动）', () => {
    const before = md5(live);
    const r = spawn(script);
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('双向零差');
    expect(r.stderr).toContain('零写盘');
    expect(md5(live)).toBe(before);
  });

  it('行为面:SW_OUT 沙箱重产对现库 byte-perfect（幂等回归）', () => {
    const dir = mkdtempSync(join(TMP, 'splayer-guard-'));
    const before = md5(live);
    try {
      const r = spawn(script, [], sandbox(dir));
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-statusplayer.json')).equals(readFileSync(live))).toBe(true);
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒（exit 1+现库零改动）', () => {
    const dir = mkdtempSync(join(TMP, 'splayer-guard-'));
    const before = md5(live);
    try {
      const r = spawn(script, ['--write-real'], sandbox(dir));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库（1458 --write-real 拒;1456 显式拒+退役指引）', () => {
    const before = md5(live);
    const r8 = spawn(script, ['--write-real'], { SW_ITEM_VER: '1458' });
    expect(r8.status).toBe(1);
    expect(r8.stderr).toContain('拒绝写真库');
    const r6 = spawn(script, [], { SW_ITEM_VER: '1456' });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('1456 锚集已退役');
    expect(md5(live)).toBe(before);
  });

  it('行为面:g1 探测注入面与 --write-real 混用拒', () => {
    const before = md5(live);
    const r = spawn(script, ['--write-real'], { [probe]: '/tmp/whatever.json' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('探测注入面');
    expect(md5(live)).toBe(before);
  });

  it('行为面:fresh-only 轴（现库退化=空对象）干跑拒跑（exit 1+fresh-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'splayer-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const r = spawn(script, [], { [probe]: join(dir, 'degraded.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:live-only 轴（现库领先/洗库预警）干跑拒跑（exit 1+live-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'splayer-guard-'));
    try {
      const liveObj = JSON.parse(readFileSync(live, 'utf8'));
      (liveObj as Record<string, unknown>)['9999'] = { b: 1, d: 60 };
      writeFileSync(join(dir, 'ahead.json'), JSON.stringify(liveObj));
      const r = spawn(script, [], { [probe]: join(dir, 'ahead.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('live-only');
      expect(r.stderr).toContain('现库独有');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M1:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'splayer-guard-'));
    const fake = join(dir, 'vanilla-statusplayer.json');
    writeFileSync(fake, '{"seeded":true}');
    const before = md5(live);
    try {
      let src = readFileSync(script, 'utf8');
      expect(src).toContain(ROOT_TRIGGER);
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TD = '/vanilla-statusplayer.json` : null);';
      expect(src).toContain(TD);
      const mutant = join(dir, 'mutant.mjs');
      writeFileSync(mutant, src.replace(TD, `/vanilla-statusplayer.json\` : ${JSON.stringify(fake)}); // ★变异:干跑门摘除`));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fake, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fake)).toBe(md5(live));
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M2:毒化 EXPECT 护栏后 DRIFT fail-loud（exit 1+护栏指名+零写盘）', () => {
    const dir = mkdtempSync(join(TMP, 'splayer-guard-'));
    const before = md5(live);
    try {
      let src = readFileSync(script, 'utf8');
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TRIGGER = 'const EXPECT_TYPES = 50;';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'const EXPECT_TYPES = 51;'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('DRIFT');
      expect(r.stderr).toContain('型号 50 ≠ 51');
      expect(md5(live)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力）', () => {
    const dir = mkdtempSync(join(TMP, 'splayer-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const probeEnv = { [probe]: join(dir, 'degraded.json') };
      const real = spawn(script, [], probeEnv);
      expect(real.status).toBe(1);
      let src = readFileSync(script, 'utf8');
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TRIGGER = "for (const k of Object.keys(fresh)) if (!lk.has(k)) out.freshOnly.push(`${prefix}.${k}`);";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (false) out.freshOnly.push(`${prefix}.${k}`); // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...probeEnv } });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
