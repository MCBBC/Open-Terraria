import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★BJ215（2026-09-20）：extract-mounts.mjs + extract-expert.mjs era guard 落闸守卫测试。
//
// 债源：era-guard-family.md 第四节「未落闸残留」第 5 顺位（mounts：writeFileSync 直写
// vanilla-mounts.json 无任何注入面/闸;expert：缺省直跑 writeFileSync 写 vanilla-expert.json
// 无干跑/无现库 diff）。BJ215 定谳：两者 bare 1457 重产=现库【逐字节零漂移】（mounts
// 66/66 全节等;expert 43 条全等）→ B-form 干跑对拍闸。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_ITEM_VER 缺省 1457——mounts 白名单
// 单值 1457（1458 MountID sets 面有真差 DoesNotOverrideWings,BJ215 实证,语义收窄不放行）;
// expert 白名单 {1456,1457,1458}（1456 保留=recon 双实例 --dump 对账,1456↔1457 数据面
// 全等 BJ183 定谳）②输出通道三分离（缺省干跑零写盘 / SW_OUT 沙箱 / --write-real 逃生门;
// 双旗互斥;非 1457 禁写真库;--dump 不落盘通道不受限）③锚 fail-loud（mounts fnBody 签名
// 未找到即 throw——原静默返空体反模式已修;expert methodRange 同旨）④判别力自证（本文件
// 变异 M1/M2）。守卫测试习语 = extract-petai-era-guard.test.ts（BJ212）。

const MOUNTS_SCRIPT = join(process.cwd(), 'tools', 'extract-mounts.mjs');
const EXPERT_SCRIPT = join(process.cwd(), 'tools', 'extract-expert.mjs');
const MOUNTS_LIVE = join(process.cwd(), 'src', 'data', 'vanilla-mounts.json');
const EXPERT_LIVE = join(process.cwd(), 'src', 'data', 'vanilla-expert.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接（petai/itemrare 同案）
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe('extract-mounts era guard（B-form 干跑对拍 + 输出通道三分离）', () => {
  it('行为面:缺省干跑零写盘（重产=现库逐字节零漂移 exit 0）', () => {
    const before = md5(MOUNTS_LIVE);
    const r = spawnSync('node', [MOUNTS_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('逐字节零漂移');
    expect(md5(MOUNTS_LIVE)).toBe(before);
  });

  it('行为面:SW_OUT 沙箱重产=现库逐字节（幂等回归）+现库零接触', () => {
    const dir = mkdtempSync(join(TMP, 'mounts-guard-'));
    const before = md5(MOUNTS_LIVE);
    try {
      const r = spawnSync('node', [MOUNTS_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-mounts.json')).equals(readFileSync(MOUNTS_LIVE))).toBe(true);
      expect(md5(MOUNTS_LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥;非 1457 禁写真库+非法版本 fail-closed', () => {
    const dir = mkdtempSync(join(TMP, 'mounts-guard-'));
    const before = md5(MOUNTS_LIVE);
    try {
      const r = spawnSync('node', [MOUNTS_SCRIPT, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');

      const r8 = spawnSync('node', [MOUNTS_SCRIPT, '--write-real'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1458' },
      });
      expect(r8.status).toBe(1);
      expect(r8.stderr).toContain('白名单 1457');
      expect(r8.stderr).toContain('DoesNotOverrideWings');  // 语义收窄指引（BJ215 实证真差）

      const rBad = spawnSync('node', [MOUNTS_SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1460' },
      });
      expect(rBad.status).toBe(1);
      expect(md5(MOUNTS_LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT 干跑臂 null 换成假现库路径）→
  //   裸跑静默写「现库」。证明缺省零写盘是唯一拦截面。
  //   ★mutant 前置:ROOT 重锚（本器 ROOT 派生自 import.meta.url,mutant 放 OS tmp 会
  //   因路径失配炸版本门——重锚到 join(process.cwd(),'..') 与盘上等价）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'mounts-guard-'));
    const fakeLive = join(dir, 'vanilla-mounts.json');
    writeFileSync(fakeLive, '{"seeded":true}');
    const beforeLive = md5(MOUNTS_LIVE);
    try {
      const src = readFileSync(MOUNTS_SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = '/vanilla-mounts.json` : null);';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-mounts-mutant.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, '/vanilla-mounts.json` : ' + JSON.stringify(fakeLive) + '); // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fakeLive)).toBe(md5(MOUNTS_LIVE));
      expect(md5(MOUNTS_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化 Initialize() 签名锚 → fnBody throw（exit≠0+锚点名）
  //  ——证明「签名找不到吃空体→空表」的静默兜底已被硬炸替代。
  it('变异 M2:毒化 Initialize 签名锚后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'mounts-guard-'));
    const beforeLive = md5(MOUNTS_LIVE);
    try {
      const src = readFileSync(MOUNTS_SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = "'public static void Initialize()'";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-mounts-mutant-anchor.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, "'public static void InitializeX()'")); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('Initialize');
      expect(md5(MOUNTS_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('extract-expert era guard（B-form 干跑对拍 + 输出通道三分离）', () => {
  it('行为面:缺省干跑零写盘（重产=现库逐字节零漂移 exit 0）', () => {
    const before = md5(EXPERT_LIVE);
    const r = spawnSync('node', [EXPERT_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('逐字节零漂移');
    expect(md5(EXPERT_LIVE)).toBe(before);
  });

  it('行为面:SW_OUT 沙箱重产=现库逐字节+现库零接触;1456 沙箱放行（recon 对账面,43 条全等）', () => {
    const dir = mkdtempSync(join(TMP, 'expert-guard-'));
    const before = md5(EXPERT_LIVE);
    try {
      const r = spawnSync('node', [EXPERT_SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, 'vanilla-expert.json')).equals(readFileSync(EXPERT_LIVE))).toBe(true);

      const r6 = spawnSync('node', [EXPERT_SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1456', SW_OUT: dir },
      });
      expect(r6.status).toBe(0);
      expect(readFileSync(join(dir, 'vanilla-expert.json')).equals(readFileSync(EXPERT_LIVE))).toBe(true);
      expect(md5(EXPERT_LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:双旗互斥;非 1457 禁写真库;非法版本 fail-closed;--dump 对账通道不受守卫限制', () => {
    const before = md5(EXPERT_LIVE);
    const dir = mkdtempSync(join(TMP, 'expert-guard-'));
    try {
      const r = spawnSync('node', [EXPERT_SCRIPT, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');

      const r6 = spawnSync('node', [EXPERT_SCRIPT, '--write-real'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1456' },
      });
      expect(r6.status).toBe(1);
      expect(r6.stderr).toContain('拒绝写真库');

      const rBad = spawnSync('node', [EXPERT_SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1460' },
      });
      expect(rBad.status).toBe(1);
      expect(rBad.stderr).toContain('白名单 1456/1457/1458');

      const rDump = spawnSync('node', [EXPERT_SCRIPT, '--dump'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1456' },
      });
      expect(rDump.status).toBe(0);
      const dump = JSON.parse(rDump.stdout) as { src: string; EXPERT: Record<string, number> };
      expect(dump.src).toBe('1456');
      expect(Object.keys(dump.EXPERT).length).toBe(43);
      expect(md5(EXPERT_LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门 → 裸跑静默写「现库」。
  it('变异 M1:摘干跑门后裸跑静默写「现库」（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'expert-guard-'));
    const fakeLive = join(dir, 'vanilla-expert.json');
    writeFileSync(fakeLive, '{"seeded":true}');
    const beforeLive = md5(EXPERT_LIVE);
    try {
      const src = readFileSync(EXPERT_SCRIPT, 'utf8');
      const TRIGGER = '/vanilla-expert.json` : null);';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-expert-mutant.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, '/vanilla-expert.json` : ' + JSON.stringify(fakeLive) + '); // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fakeLive)).toBe(md5(EXPERT_LIVE));
      expect(md5(EXPERT_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化 SetDefaults1 方法名锚（REGIONS 数组首参）→
  //   methodRange throw（exit≠0+method not found）——五方法区切片的硬闸。
  it('变异 M2:毒化方法区名锚后 fail-loud（exit≠0+method not found）', () => {
    const dir = mkdtempSync(join(TMP, 'expert-guard-'));
    const beforeLive = md5(EXPERT_LIVE);
    try {
      const src = readFileSync(EXPERT_SCRIPT, 'utf8');
      const TRIGGER = "const REGIONS = ['SetDefaults1',";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-expert-mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, "const REGIONS = ['SetDefaultsX1',")); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('method SetDefaultsX1 not found');
      expect(md5(EXPERT_LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
