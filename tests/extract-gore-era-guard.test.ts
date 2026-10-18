import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ★BJ284（2026-09-22）：extract-gore.mjs era guard 落闸守卫测试。npcdrops（BJ261）同款习语：
//
// ★BJ329（2026-09-24）重锚 1457 清偿：产物 line 域 553→1457 终值（金标 gore.test.ts 三钉
//   重冻 :84611/:84625/:83109）;语义面对拍零差（554 npcIds/2265 条目,line-stripped 全等）;
//   白名单 {1456}→{1457,1458}（1457↔1458 HitEffect 区 :82492-:90939 逐字节全等,BJ284 复证
//   +BJ329 复核 md5 ae487fa5→1458 交叉重放 byte-perfect）;1456 锚退役拒;MANUAL_1457_DELTAS
//   保留为幂等钉补（原生提取同值,no-op）;「非 1457 禁写」家族规则恢复适用。
//
// 行为面：缺省干跑对拍零写盘（md5 canary）/ SW_OUT 沙箱 byte-perfect / 双旗互斥 /
//   g1 探测注入面与 --write-real 混用拒 / fresh-only+live-only 双向轴 / --audit 通道保留。
// 变异：M1 摘干跑门（OUT_JSON null 臂→假现库,哨兵被覆写,真现库零接触）/
//   M2 毒化基数护栏 fail-loud / M3 摘 fresh-only 轴（G-1 盲区判别力）。
//   mutant 置 OS tmp 须 ROOT_TRIGGER 前置重锚（era-guard-family ④ 习语）。

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

const SCRIPT = join(ROOT, 'tools', 'extract-gore.mjs');
const LIVE = join(ROOT, 'src', 'data', 'vanilla-gore.json');
const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');";
// ★C档可移植:mutant 重锚值运行时计算(=本仓 game/ 绝对路径,零本机字面量)
const ROOT_ABS = `const ROOT = ${JSON.stringify(ROOT)};`;

const spawn = (args: string[] = [], env: Record<string, string> = {}) =>
  spawnSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 600_000, env: { ...process.env, ...env } });

describe.skipIf(EXT_MISSING)('extract-gore era guard（BJ284 落闸;★BJ329 重锚 1457,1456 退役）', () => {
  it('行为面:缺省干跑对拍零写盘（exit 0+双向零差+现库字节零改动）', () => {
    const before = md5(LIVE);
    const r = spawn();
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('双向零差');
    expect(r.stderr).toContain('零写盘');
    expect(md5(LIVE)).toBe(before);
  }, 600_000);

  it('行为面:SW_OUT 沙箱重产对现库 byte-perfect（幂等回归）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawn([], sandbox(dir));
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-gore.json')).equals(readFileSync(LIVE))).toBe(true);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it('行为面:--audit 无写诊断通道保留（exit 0+现库零改动）', () => {
    const before = md5(LIVE);
    const r = spawn(['--audit']);
    expect(r.status).toBe(0);
    expect(JSON.parse((r.stdout ?? '').trim().split('\n').pop()!).npcIds).toBeGreaterThanOrEqual(550);
    expect(md5(LIVE)).toBe(before);
  }, 600_000);

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒（exit 1+现库零改动）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawn(['--write-real'], sandbox(dir));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:退役 1456 拒跑+重锚指引（BJ329 重锚后 line 域=1457,裸跑 1456 会整表回退）', () => {
    const before = md5(LIVE);
    const r = spawn([], { SW_ITEM_VER: '1456' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('白名单 1457/1458');
    expect(r.stderr).toContain('已退役');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:1458 交叉重放 byte-perfect（HitEffect 区逐字节全等）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    try {
      const r = spawn([], { SW_ITEM_VER: '1458', SW_OUT: dir });
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, 'vanilla-gore.json')).equals(readFileSync(LIVE))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it('行为面:g1 探测注入面（SW_GORE_JSON）与 --write-real 混用拒', () => {
    const before = md5(LIVE);
    const r = spawn(['--write-real'], { SW_GORE_JSON: '/tmp/whatever.json' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('探测注入面');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:fresh-only 轴（现库退化=空对象）干跑拒跑（exit 1+fresh-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const r = spawn([], { SW_GORE_JSON: join(dir, 'degraded.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it('行为面:live-only 轴（现库领先/洗库预警）干跑拒跑（exit 1+live-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    try {
      const liveObj = JSON.parse(readFileSync(LIVE, 'utf8'));
      (liveObj as Record<string, unknown>)['9999'] = [{ id: 3, n: 1 }];
      writeFileSync(join(dir, 'ahead.json'), JSON.stringify(liveObj));
      const r = spawn([], { SW_GORE_JSON: join(dir, 'ahead.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('live-only');
      expect(r.stderr).toContain('现库独有');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it('变异 M1:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    const fake = join(dir, 'vanilla-gore.json');
    writeFileSync(fake, '{"seeded":true}');
    const before = md5(LIVE);
    try {
      let src = readFileSync(SCRIPT, 'utf8');
      expect(src).toContain(ROOT_TRIGGER);   // ROOT_TRIGGER 前置重锚（tmp mutant 必备）
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TD = '/vanilla-gore.json` : null);';
      expect(src).toContain(TD);
      const mutant = join(dir, 'mutant.mjs');
      writeFileSync(mutant, src.replace(TD, `/vanilla-gore.json\` : ${JSON.stringify(fake)}); // ★变异:干跑门摘除`));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 600_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fake, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fake)).toBe(md5(LIVE));
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it('变异 M2:毒化基数护栏后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    const before = md5(LIVE);
    try {
      let src = readFileSync(SCRIPT, 'utf8');
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TRIGGER = 'if (entries.size < 550) throw';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (entries.size < 5500) throw'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 600_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('entries 基数');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);

  it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力）', () => {
    const dir = mkdtempSync(join(TMP, 'gore-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const probeEnv = { SW_GORE_JSON: join(dir, 'degraded.json') };
      const real = spawn([], probeEnv);
      expect(real.status).toBe(1);
      let src = readFileSync(SCRIPT, 'utf8');
      src = src.replace(ROOT_TRIGGER, ROOT_ABS);
      const TRIGGER = "for (const k of Object.keys(fresh)) if (!lk.has(k)) wash.freshOnly.push(`${prefix}.${k}`);";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (false) wash.freshOnly.push(`${prefix}.${k}`); // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 600_000, env: { ...process.env, ...probeEnv } });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 600_000);
});
