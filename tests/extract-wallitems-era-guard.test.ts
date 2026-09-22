import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// ★BJ284（2026-09-22）：extract-wallitems.mjs era guard 落闸守卫测试（BJ261 排期②
// 【cwd footgun】清偿）。与 BJ283 line 锚版本闸组合（其写侧锚门收编进 --write-real 臂）：
//
// 特殊语义（本器 line 域=1456 锚,wallitems-parity 层 B 树锚钉死 1456,BJ283 定谳）：
//   · 缺省 1457 干跑=核心面（id 集+wall/key/name）双向零差+line 域二相 292 件（预期,
//     报告不拒跑）;SW_ITEM_VER=1456 沙箱=byte-perfect（line 锚再生通道幂等回归）。
//   · --write-real 缺省 VER 对 1456 锚现库=BJ283 锚门拒（防缺省裸跑洗 line 面）;
//     「非 1457 禁写」家族规则对本器不适用（1456=合法再生通道,家族例外备案）。
// 行为面：缺省干跑零写盘（md5 canary）/ cwd 免疫（从非 game/ 目录跑不读写错位）/
//   双旗互斥 / g1 探测注入面与 --write-real 混用拒 / fresh-only+live-only 双向轴。
// 变异：M1 摘干跑门（OUT_JSON null 臂→假现库,哨兵被覆写）/ M2 毒化基数护栏 fail-loud /
//   M3 摘 fresh-only 轴（G-1 盲区判别力）。mutant 置 OS tmp 须 GAME_TRIGGER 前置重锚。

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

const SCRIPT = join(ROOT, 'tools', 'extract-wallitems.mjs');
const LIVE = join(ROOT, 'src', 'data', 'vanilla-wallitems.json');
const GAME_TRIGGER = "const GAME = join(dirname(fileURLToPath(import.meta.url)), '..');   // game/（cwd 免疫）";
const GAME_ABS = `const GAME = ${JSON.stringify('/Users/vinlic/Project/GLM/SandboxWorld/game')};`;

const spawn = (args: string[] = [], env: Record<string, string> = {}, cwd?: string) =>
  spawnSync('node', [SCRIPT, ...args], { cwd: cwd ?? ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...env } });

describe('extract-wallitems era guard（BJ284 落闸+BJ283 锚门组合）', () => {
  it('行为面:缺省干跑对拍零写盘（exit 0+核心面双向零差+line 域二相报告+现库字节零改动）', () => {
    const before = md5(LIVE);
    const r = spawn();
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('零写盘');
    expect(r.stderr).toContain('line 域二相 292 件');   // 1457 跑 vs 1456 锚现库=预期二相
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:cwd 免疫（从 /tmp 跑=干跑零写盘,不读写错位）', () => {
    const before = md5(LIVE);
    const r = spawn([], {}, realpathSync(tmpdir()));
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:SW_ITEM_VER=1456 沙箱=byte-perfect（line 锚再生通道幂等回归）', () => {
    const dir = mkdtempSync(join(TMP, 'wallitems-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawn([], { ...sandbox(dir), SW_ITEM_VER: '1456' });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-wallitems.json')).equals(readFileSync(LIVE))).toBe(true);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒（exit 1+现库零改动）', () => {
    const dir = mkdtempSync(join(TMP, 'wallitems-guard-'));
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

  it('行为面:--write-real 缺省 VER 对 1456 锚现库=BJ283 line 锚门拒（防洗 line 面）', () => {
    const before = md5(LIVE);
    const r = spawn(['--write-real']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝写盘');
    expect(r.stderr).toContain('line 锚=1456');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:g1 探测注入面（SW_WALLITEMS_JSON）与 --write-real 混用拒', () => {
    const before = md5(LIVE);
    const r = spawn(['--write-real'], { SW_WALLITEMS_JSON: '/tmp/whatever.json' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('探测注入面');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:fresh-only 轴（现库退化=空对象）干跑拒跑（exit 1+fresh-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'wallitems-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const r = spawn([], { SW_WALLITEMS_JSON: join(dir, 'degraded.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:live-only 轴（现库领先/洗库预警）干跑拒跑（exit 1+live-only 物证）', () => {
    const dir = mkdtempSync(join(TMP, 'wallitems-guard-'));
    try {
      const liveObj = JSON.parse(readFileSync(LIVE, 'utf8'));
      (liveObj as Record<string, unknown>)['9999'] = { wall: 1, key: 'vi_9999_x', name: 'X', line: 1 };
      writeFileSync(join(dir, 'ahead.json'), JSON.stringify(liveObj));
      const r = spawn([], { SW_WALLITEMS_JSON: join(dir, 'ahead.json') });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('live-only');
      expect(r.stderr).toContain('现库独有');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M1:摘干跑门后裸跑静默写「现库」（证明缺省零写盘是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'wallitems-guard-'));
    const fake = join(dir, 'vanilla-wallitems.json');
    writeFileSync(fake, '{"seeded":true}');
    const before = md5(LIVE);
    try {
      let src = readFileSync(SCRIPT, 'utf8');
      expect(src).toContain(GAME_TRIGGER);   // GAME_TRIGGER 前置重锚（tmp mutant 必备）
      src = src.replace(GAME_TRIGGER, GAME_ABS);
      const TD = '/vanilla-wallitems.json` : null);';
      expect(src).toContain(TD);
      const mutant = join(dir, 'mutant.mjs');
      writeFileSync(mutant, src.replace(TD, `/vanilla-wallitems.json\` : ${JSON.stringify(fake)}); // ★变异:干跑门摘除`));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fake, 'utf8')).not.toContain('"seeded":true');
      // ★本器 line 域双锚（现库=1456,缺省跑=1457）：写入=全量 fresh（非 live 字节拷贝,
      //   npcdrops 单锚习语的 byte-equal 断言在此不适用）——断言全量产出即可判写发生
      expect(Object.keys(JSON.parse(readFileSync(fake, 'utf8'))).length).toBeGreaterThanOrEqual(280);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M2:毒化基数护栏后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'wallitems-guard-'));
    const before = md5(LIVE);
    try {
      let src = readFileSync(SCRIPT, 'utf8');
      src = src.replace(GAME_TRIGGER, GAME_ABS);
      const TRIGGER = 'if (Object.keys(out).length < 280) {';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (Object.keys(out).length < 2800) {'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('基数护栏');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异 M3:摘 fresh-only 轴后对退化现库恒绿复现（G-1 盲区判别力）', () => {
    const dir = mkdtempSync(join(TMP, 'wallitems-guard-'));
    try {
      writeFileSync(join(dir, 'degraded.json'), '{}');
      const probeEnv = { SW_WALLITEMS_JSON: join(dir, 'degraded.json') };
      const real = spawn([], probeEnv);
      expect(real.status).toBe(1);
      let src = readFileSync(SCRIPT, 'utf8');
      src = src.replace(GAME_TRIGGER, GAME_ABS);
      const TRIGGER = 'for (const k of Object.keys(out)) if (!lk.has(k)) wash.freshOnly.push(`id ${k}(wall ${out[k].wall})`);';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'mutant-freshonly.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, 'if (false) wash.freshOnly.push(`id ${k}(wall ${out[k].wall})`); // ★变异:fresh-only 轴摘除'));
      const r = spawnSync('node', [mutant], { cwd: ROOT, encoding: 'utf8', timeout: 300_000, env: { ...process.env, ...probeEnv } });
      expect(r.status).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
