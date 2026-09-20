import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★BJ215（2026-09-20）：extract-itemcombat.mjs era guard 落闸守卫测试。
//
// 债源：era-guard-family.md 第四节残留清单第 2 顺位（头注陈旧「Terarria1456」+
// writeFileSync 直写双产物无干跑/无现库 diff）。BJ215 定谳：1457 重产 vs 现库逐值零漂移
// （4369 items + 978 useSound,bare 重跑幂等态成立）→ B-form 干跑对拍闸
// （零漂移放行/漂移 exit 1+物证）。BJ205 ⑥ 盘点块在头注,本刀未回退。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_ITEM_VER 缺省 1457 白名单
// {1456,1457,1458}（1456 保留=recon-item-1456-1457.mjs 双实例 --dump 对账）②输出通道
// 三分离（缺省干跑零写盘 / SW_OUT 沙箱 / --write-real 逃生门;双旗互斥;非 1457 禁写真库;
// --dump/--audit 不落盘通道不受限）③锚 fail-loud（methodBody 签名未找到即 throw——
// 原实现静默返空体反模式已修）④判别力自证（本文件变异 M1/M2）。
// 守卫测试习语 = extract-petai-era-guard.test.ts（BJ212）。

const SCRIPT = join(process.cwd(), 'tools', 'extract-itemcombat.mjs');
const LIVE_COMBAT = join(process.cwd(), 'src', 'data', 'vanilla-itemcombat.json');
const LIVE_SOUND = join(process.cwd(), 'src', 'data', 'vanilla-itemusesound.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接（petai/itemrare 同案）
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe('extract-itemcombat era guard（B-form 干跑对拍 + 输出通道三分离）', () => {
  it('行为面:缺省干跑零写盘（逐值零漂移 exit 0+双产物 canary）', () => {
    const b1 = md5(LIVE_COMBAT);
    const b2 = md5(LIVE_SOUND);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('逐值零漂移');
    expect(r.stderr).toContain('零写盘');
    expect(md5(LIVE_COMBAT)).toBe(b1);
    expect(md5(LIVE_SOUND)).toBe(b2);
  });

  it('行为面:SW_OUT 沙箱重产=现库逐字节（幂等回归）+现库零接触', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    const b2 = md5(LIVE_SOUND);
    try {
      const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-itemcombat.json')).equals(readFileSync(LIVE_COMBAT))).toBe(true);
      expect(readFileSync(join(dir, 'vanilla-itemusesound.json')).equals(readFileSync(LIVE_SOUND))).toBe(true);
      expect(md5(LIVE_COMBAT)).toBe(b1);
      expect(md5(LIVE_SOUND)).toBe(b2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒跑', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库（1456 --write-real 拒）;1456 干跑对拍=漂移 exit 1（旧基线重放洗 1457 终值面被拦）', () => {
    const b1 = md5(LIVE_COMBAT);
    const r6 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('拒绝写真库');
    expect(r6.stderr).toContain('SW_ITEM_VER=1456≠1457');

    const r6d = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6d.status).toBe(1);
    expect(r6d.stderr).toContain('漂移');
    expect(md5(LIVE_COMBAT)).toBe(b1);
  });

  it('行为面:非法 SW_ITEM_VER fail-closed（白名单+目录存在性）;--dump 对账通道不受守卫限制', () => {
    const b1 = md5(LIVE_COMBAT);
    const rBad = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1460' },
    });
    expect(rBad.status).toBe(1);
    expect(rBad.stderr).toContain('白名单 1456/1457/1458');

    const rDump = spawnSync('node', [SCRIPT, '--dump'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });
    expect(rDump.status).toBe(0);
    const dump = JSON.parse(rDump.stdout) as { src: string; items: Record<string, unknown> };
    expect(dump.src).toBe('1457');
    expect(Object.keys(dump.items).length).toBeGreaterThan(4000);
    expect(md5(LIVE_COMBAT)).toBe(b1);
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT_DIR 干跑臂 null 换成假现库目录）→
  //   裸跑（零 env 零旗）静默写「现库」双产物。证明缺省零写盘是唯一拦截面。
  //   ★mutant 前置:ROOT 重锚（本器 ROOT 派生自 import.meta.url,mutant 放 OS tmp 会
  //   因路径失配炸版本门——重锚到 join(process.cwd(),'..') 与盘上等价）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」双产物（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const fakeCombat = join(dir, 'vanilla-itemcombat.json');
    const fakeSound = join(dir, 'vanilla-itemusesound.json');
    writeFileSync(fakeCombat, '{"seeded":true}');   // 哨兵种子（≠工具产物,可判写发生）
    writeFileSync(fakeSound, '{"seeded":true}');
    const beforeCombat = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = ".replace(/\\/+$/, '')}` : null);";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-itemcombat-mutant.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, ".replace(/\\/+$/, '')}` : " + JSON.stringify(dir) + '); // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeCombat, 'utf8')).not.toContain('"seeded":true');
      expect(readFileSync(fakeSound, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fakeCombat)).toBe(md5(LIVE_COMBAT));   // 写的就是全量重产产物
      expect(md5(LIVE_COMBAT)).toBe(beforeCombat);      // 真现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化 SetDefaults1 方法签名锚 → methodBody throw
  //  （exit≠0+锚点名）——证明「找不到就吃空体」的静默兜底已被硬炸替代。
  it('变异 M2:毒化方法签名锚后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'itemcombat-guard-'));
    const b1 = md5(LIVE_COMBAT);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = "'void SetDefaults1(int type)'";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-itemcombat-mutant-anchor.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, "'void SetDefaultsX1(int type)'")); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('SetDefaultsX1');
      expect(md5(LIVE_COMBAT)).toBe(b1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
