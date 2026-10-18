import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


// ★BJ215（2026-09-20）：extract-pets.mjs 1456 锚重推 1457（BJ183 登记债清偿,petai
// 重锚习语）+ era guard 落闸守卫测试。
//
// 重锚定谳（BJ215 沙箱三方对拍）：本器为 case 结构扫描（无局部号锚）,1457 重锚产物与
// 现库【逐字节零差】（83 件）,1458 同逐字节零差——零差只换锚,数据面零欠账。
// 读侧 guard：era-guard-family.md 第四节「未落闸残留」第 4 顺位（缺省直写 vanilla-pets.json
// 无 era guard;SW-FX53 PETS_OUT 重定向在位）。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_ITEM_VER 缺省 1457 白名单
// {1457,1458}（1456 锚退役=数据面与 1457 全等已定谳,显式 1456 拒+指引,petai 习语）
// ②输出通道三分离（缺省干跑零写盘 / SW_OUT=<dir> canonical + PETS_OUT=<path> FX53
// legacy 别名 写沙箱 / --write-real 逃生门;双旗互斥;非 1457 禁写真库）③锚 fail-loud
// （DefaultToVanitypet 4797 公式块/表基数/宠物总数/4797-4817 boss 宠 21 件/3855-3857
// SW-FX53 钉值）④判别力自证（本文件变异 M1/M2）。守卫测试习语 =
// extract-petai-era-guard.test.ts（BJ212）。

const SCRIPT = join(process.cwd(), 'tools', 'extract-pets.mjs');
const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-pets.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接（petai/itemrare 同案）
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe.skipIf(EXT_MISSING)('extract-pets era guard（1457 重锚 + B-form 干跑对拍）', () => {
  it('行为面:缺省干跑零写盘（重产=现库逐字节零漂移 exit 0）', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('干跑对拍');
    expect(r.stderr).toContain('逐字节零漂移');
    expect(r.stderr).toContain('零写盘');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:SW_OUT 沙箱重产=现库逐字节（1457 重锚幂等回归）+现库零接触', () => {
    const dir = mkdtempSync(join(TMP, 'pets-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT/PETS_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-pets.json')).equals(readFileSync(LIVE))).toBe(true);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:PETS_OUT legacy 别名（FX53 通道向后兼容,文件路径/目录两形态）', () => {
    const dir = mkdtempSync(join(TMP, 'pets-guard-'));
    const before = md5(LIVE);
    try {
      const asFile = join(dir, 'pets-legacy.json');
      const r1 = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PETS_OUT: asFile },
      });
      expect(r1.status).toBe(0);
      expect(readFileSync(asFile).equals(readFileSync(LIVE))).toBe(true);
      const r2 = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PETS_OUT: dir },
      });
      expect(r2.status).toBe(0);
      expect(readFileSync(join(dir, 'vanilla-pets.json')).equals(readFileSync(LIVE))).toBe(true);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT/PETS_OUT 与 --write-real 双旗互斥拒跑', () => {
    const dir = mkdtempSync(join(TMP, 'pets-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir),
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:1456 锚退役显式拒+指引;1456 --write-real 拒', () => {
    const before = md5(LIVE);
    const r6 = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6.status).toBe(1);
    expect(r6.stderr).toContain('1456 锚已随 BJ215 重锚退役');
    const r6w = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1456' },
    });
    expect(r6w.status).toBe(1);
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:1458 沙箱重放放行（三方对拍逐字节全等面,BJ215 实证）', () => {
    const dir = mkdtempSync(join(TMP, 'pets-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEM_VER: '1458', SW_OUT: dir },
      });
      expect(r.status).toBe(0);
      expect(readFileSync(join(dir, 'vanilla-pets.json')).equals(readFileSync(LIVE))).toBe(true);
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非法 SW_ITEM_VER fail-closed（白名单指引）', () => {
    const r = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1460' },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('白名单 1457/1458');
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT 干跑臂 null 换成假现库路径）→
  //   裸跑静默写「现库」。证明缺省零写盘是唯一拦截面（petai 守卫 M1 同款习语）。
  //   ★mutant 前置:ROOT 重锚（本器 ROOT 派生自 import.meta.url,mutant 放 OS tmp 会
  //   因路径失配炸版本门——重锚到 join(process.cwd(),'..') 与盘上等价）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'pets-guard-'));
    const fakeLive = join(dir, 'vanilla-pets.json');
    writeFileSync(fakeLive, '{"seeded":true}');
    const beforeLive = md5(LIVE);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = 'vanilla-pets.json\'))\n    : null);';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-pets-mutant.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, 'vanilla-pets.json\'))\n    : ' + JSON.stringify(fakeLive) + '); // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');
      expect(md5(fakeLive)).toBe(md5(LIVE));
      expect(md5(LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化 DefaultToVanitypet 4797 公式块锚 → throw
  //  （exit≠0+锚点名）——FX48 boss 宠 21 件解析面的硬闸。
  it('变异 M2:毒化 DefaultToVanitypet 公式锚后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'pets-guard-'));
    const beforeLive = md5(LIVE);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const ROOT_TRIGGER = "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');";
      expect(src).toContain(ROOT_TRIGGER);
      const TRIGGER = 'DefaultToVanitypet\\(881 \\+ type - 4797';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-pets-mutant-anchor.mjs');
      writeFileSync(mutant, src
        .replace(ROOT_TRIGGER, "const ROOT = join(process.cwd(), '..'); // ★变异:ROOT 重锚到测试 cwd")
        .replace(TRIGGER, 'DefaultToVanitypet\\(881 \\+ type - 4790')); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('DefaultToVanitypet');
      expect(md5(LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
