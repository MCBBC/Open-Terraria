import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★BJ215（2026-09-20）：extract-bossbags.mjs 重产禁令代码化 + era guard 落闸守卫测试。
//
// 债源：BJ183 登记债（重产禁令仅头注注释未代码化）+ BJ212 era-guard-family.md 第四节
// 残留清单第 1 顺位。BJ215 干跑 diff 定谳：盘上数据面【语义领先】于本器——cond.noMaster
// （masterMode else 支）/cond.remix/cond.noRemix 三字段本器不产,且 stackVar 条目 lo/hi
// 栈域、stackExpr 分列形态、sw branch/chance pair 编号系与盘上不同构——裸跑全量重产=
// 字段型洗库（保留键被静默丢弃,npcs/vanilla-atlas 四连同族判例形态）。
//
// era guard 四要素（docs/era-guard-family.md）：①SW_ITEM_VER 缺省 1457 白名单
// {1457,1458}（1458 OpenBossBag 方法体与 1457 逐字节全等,BJ215 实证重产 fresh 同）
// ②输出通道三分离（缺省干跑对拍零写盘 / SW_OUT 沙箱 / --write-real 逃生门;双旗互斥;
// --write-real 非 1457 拒;--write-real 在 diff 非纯增量时拒+差异清单,强推须
// --force-full --overwrite-append-era 双旗;SW_BOSSBAGS_JSON 探测面+--write-real 混用拒
// =g1）③锚 fail-loud（OpenBossBag 签名/BAGS 全命中/coinMap 基数护栏）④判别力自证
// （本文件变异 M1/M2）。守卫测试习语 = extract-petai-era-guard.test.ts（BJ212）。

const SCRIPT = join(process.cwd(), 'tools', 'extract-bossbags.mjs');
const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-bossbags.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接：mutant 放 /var 下会因 import.meta.url 与 argv[1]
//   URL 不匹配走偏——临时目录一律 realpath（petai/itemrare 同案）。
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe('extract-bossbags era guard（重产禁令代码化 + 输出通道三分离）', () => {
  it('行为面:缺省干跑零写盘;现库领先面非空=洗库预警 exit 1+差异清单', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    expect(r.status).toBe(1);                      // 现库语义领先（noMaster/remix/noRemix 等）→ 预警
    expect(r.stderr).toContain('字段型洗库预警');
    expect(r.stderr).toContain('领先字段');
    expect(r.stderr).toContain('cond.noMaster');   // 差异清单物证（BJ215 定谳领先字段）
    expect(md5(LIVE)).toBe(before);                // 零写盘 canary
  });

  it('行为面:SW_OUT 沙箱放行写盘（现库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('SW_OUT 沙箱');
      expect(readFileSync(join(dir, 'vanilla-bossbags.json'), 'utf8')).toContain('"bags"');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:SW_OUT 与 --write-real 双旗互斥拒跑', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('双旗互斥');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:非 1457 禁写真库 + 非法版本 fail-closed 白名单', () => {
    const before = md5(LIVE);
    const r8 = spawnSync('node', [SCRIPT, '--write-real'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1458' },
    });
    expect(r8.status).toBe(1);
    expect(r8.stderr).toContain('拒绝写真库');
    expect(r8.stderr).toContain('SW_ITEM_VER=1458≠1457');

    const rBad = spawnSync('node', [SCRIPT], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
      env: { ...process.env, SW_ITEM_VER: '1460' },
    });
    expect(rBad.status).toBe(1);
    expect(rBad.stderr).toContain('白名单 1457/1458');
    expect(md5(LIVE)).toBe(before);
  });

  it('行为面:探测注入面 SW_BOSSBAGS_JSON + --write-real 混用拒跑（g1 fail-closed）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const fixture = join(dir, 'vanilla-bossbags.json');
    copyFileSync(LIVE, fixture);
    const before = md5(LIVE);
    try {
      const r = spawnSync('node', [SCRIPT, '--write-real'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_BOSSBAGS_JSON: fixture },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('探测注入面');
      expect(r.stderr).toContain('--write-real');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:干跑对拍双向判别（假现库=重产产物→零漂移 exit 0;+领先字段→exit 1）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const before = md5(LIVE);
    try {
      // 先 SW_OUT 沙箱产 fresh,再作为假现库种子（探测面读它）
      const r1 = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r1.status).toBe(0);
      const fresh = readFileSync(join(dir, 'vanilla-bossbags.json'), 'utf8');
      const fixture = join(dir, 'fake-live.json');
      writeFileSync(fixture, fresh);
      const r2 = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_BOSSBAGS_JSON: fixture },
      });
      expect(r2.status).toBe(0);
      expect(r2.stderr).toContain('重产盖住现库');
      // 毒化假现库:注入重产不产的领先字段 → 动态 diff 必须抓住（不硬编码键清单）
      const poisoned = JSON.parse(fresh);
      poisoned.bags['3320'].spawns[0].conds.push({ t: 'noMaster', depth: 2 });
      writeFileSync(fixture, JSON.stringify(poisoned, null, 1));
      const r3 = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_BOSSBAGS_JSON: fixture },
      });
      expect(r3.status).toBe(1);
      expect(r3.stderr).toContain('cond.noMaster');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--write-real 非纯增量拒+差异清单（假现库重定向 mutant,真库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const fakeLive = join(dir, 'vanilla-bossbags.json');
    copyFileSync(LIVE, fakeLive);                 // 假现库=真库字节副本（含领先面）
    const before = md5(LIVE);
    const beforeFake = md5(fakeLive);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const TRIGGER = '`${ROOT}/game/src/data/vanilla-bossbags.json`';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-bossbags-mutant-live.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, JSON.stringify(fakeLive)));   // LIVE_JSON 缺省臂重定向
      const r = spawnSync('node', [mutant, '--write-real'], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝 --write-real');
      expect(r.stderr).toContain('非纯增量');
      expect(md5(fakeLive)).toBe(beforeFake);      // 假现库零写入（闸在写前拒）
      expect(md5(LIVE)).toBe(before);              // 真库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M1（判别力）:摘掉「缺省干跑」门（OUT_JSON 干跑臂 null 换成假现库路径）→
  //   裸跑（零 env 零旗）静默写「现库」。证明缺省零写盘是洗库面的唯一拦截面
  //   （BJ191 preflight 写真实 json 同族 footgun——petai 守卫 M1 同款习语）。
  //   注：断言对照 SW_OUT 重产 fresh（现库领先于重产,字节面本不相等——BJ215 定谳）。
  it('变异 M1:摘干跑门后裸跑静默写「现库」（哨兵被覆写=写发生）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const fakeLive = join(dir, 'vanilla-bossbags.json');
    writeFileSync(fakeLive, '{"seeded":true}');    // 哨兵种子（≠工具产物,可判写发生）
    const beforeLive = md5(LIVE);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const TRIGGER = '/vanilla-bossbags.json` : null);';
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-bossbags-mutant.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, '/vanilla-bossbags.json` : ' + JSON.stringify(fakeLive) + '); // ★变异:干跑臂摘除→缺省写「现库」'));
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
      expect(r.status).toBe(0);
      expect(readFileSync(fakeLive, 'utf8')).not.toContain('"seeded":true');  // 哨兵被覆写=写发生
      // 且写的就是全量重产产物（沙箱 fresh 对照;重产确定性=两次 fresh 逐字节,BJ215 实证）
      const freshDir = mkdtempSync(join(TMP, 'bossbags-guard-'));
      try {
        spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(freshDir) });
        expect(md5(fakeLive)).toBe(md5(join(freshDir, 'vanilla-bossbags.json')));
      } finally {
        rmSync(freshDir, { recursive: true, force: true });
      }
      expect(md5(LIVE)).toBe(beforeLive);           // 真现库零接触（mutant 缺省臂已重定向）
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异 M2（锚 fail-loud）:毒化 OpenBossBag 签名锚 → throw 报错退出（exit≠0+锚点名）,
  // 证明锚断言是「表与源码静默失配」的硬闸。
  it('变异 M2:毒化 OpenBossBag 签名锚后 fail-loud（exit≠0+锚点失配指名）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const beforeLive = md5(LIVE);
    try {
      const src = readFileSync(SCRIPT, 'utf8');
      const TRIGGER = "'public void OpenBossBag'";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-bossbags-mutant-anchor.mjs');
      writeFileSync(mutant, src.replace(TRIGGER, "'public void OpenBossBagX'")); // ★变异:锚毒化
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: sandbox(dir) });
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('锚点失配');
      expect(r.stderr).toContain('OpenBossBag');
      expect(md5(LIVE)).toBe(beforeLive);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
