import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
// ★C档可移植:被守卫工具读仓库外反编译树/素材源(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


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
// ★C档可移植:工具 ROOT 已转 import.meta 相对(era-guard-family ④ 习语)——
//   mutant 置 OS tmp 须前置重锚到本仓项目根(game/ 父目录);工具无该行=无操作
const ROOT_LINE = "const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)";
const relocateRoot = (src: string) => src.replace(ROOT_LINE, `const ROOT = ${JSON.stringify(join(process.cwd(), '..'))};`);

const LIVE = join(process.cwd(), 'src', 'data', 'vanilla-bossbags.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接：mutant 放 /var 下会因 import.meta.url 与 argv[1]
//   URL 不匹配走偏——临时目录一律 realpath（petai/itemrare 同案）。
const TMP = realpathSync(tmpdir());
const sandbox = (dir: string) => ({ ...process.env, SW_OUT: dir });

describe.skipIf(EXT_MISSING)('extract-bossbags era guard（重产禁令代码化 + 输出通道三分离）', () => {
  it('行为面:缺省干跑零写盘;★BJ222 数据面修正后真现库零漂移 exit 0;pair 轴判别力转合成毒化保持', () => {
    const before = md5(LIVE);
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000 });
    // ★BJ222（2026-09-20）数据刀收口：BJ217 登记的最后残差 3329 chance pair 值
    //   （现库 [1,3,2] vs 源码位序 [1,2,3]）已修——真现库与重产【逐字节全等】
    //   （BJ222 实证：SW_OUT 沙箱重产 md5 同真库）。干跑转静默 exit 0。
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('重产盖住现库');
    expect(md5(LIVE)).toBe(before);                // 零写盘 canary

    // pair 轴判别力不降（原 loud 断言保留,天然残差→合成毒化,BJ217 --write-real 守卫
    // 同款习语）：假现库=真库字节副本+6158 pair 2→3 → 动态 diff 必须抓住。
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    try {
      const fixture = join(dir, 'fake-live.json');
      const poisoned = JSON.parse(readFileSync(LIVE, 'utf8')) as {
        bags: Record<string, { spawns: Array<{ id: number; conds?: Array<Record<string, unknown>> }> }>;
      };
      const s6158 = poisoned.bags['3329'].spawns.find((s) => s.id === 6158)!;
      s6158.conds![0]['pair'] = 3;
      writeFileSync(fixture, JSON.stringify(poisoned, null, 1));
      const r2 = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_BOSSBAGS_JSON: fixture },
      });
      expect(r2.status).toBe(1);
      expect(r2.stderr).toContain('洗库预警');   // ★BJ261 措辞:双向 diff(live-only=洗库预警/fresh-only=现库退化)
      expect(r2.stderr).toContain('袋 3329');
      expect(r2.stderr).toContain('"pair":3');     // 差异清单物证（假现库 pair 值）
      expect(md5(LIVE)).toBe(before);              // 真库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
      // 毒化假现库:注入重产不产的领先字段 → 动态 diff 必须抓住（不硬编码键清单）。
      // ★BJ217：BJ215 毒料 cond.noMaster 已被重产覆盖（编码面恢复）,毒料改用合成
      //   领先字段 token（模拟未来版本新增条件类型,判别力=字段普查轴动态捕获）。
      const poisoned = JSON.parse(fresh);
      poisoned.bags['3320'].spawns[0].conds.push({ t: 'futureCond', depth: 2 });
      writeFileSync(fixture, JSON.stringify(poisoned, null, 1));
      const r3 = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_BOSSBAGS_JSON: fixture },
      });
      expect(r3.status).toBe(1);
      expect(r3.stderr).toContain('cond.futureCond');
      expect(md5(LIVE)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--write-real 非纯增量拒+差异清单（假现库重定向 mutant,真库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-guard-'));
    const fakeLive = join(dir, 'vanilla-bossbags.json');
    copyFileSync(LIVE, fakeLive);                 // 假现库=真库字节副本
    // ★BJ222：数据刀修正后真现库与重产逐字节全等,非纯增量拒失去天然触发面——
    //   假现库显式毒化（注入重产不产的领先 spawn 条目）供闸判定（BJ217 同款习语）。
    const seeded = JSON.parse(readFileSync(fakeLive, 'utf8')) as {
      bags: Record<string, { spawns: Array<Record<string, unknown>> }>;
    };
    seeded.bags['3320'].spawns.push({ id: 9999, conds: [] });
    writeFileSync(fakeLive, JSON.stringify(seeded, null, 1));
    const before = md5(LIVE);
    const beforeFake = md5(fakeLive);
    try {
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
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
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
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
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
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

// ================= ★G-1（BJ261 2026-09-22）fresh-only 轴（S3 普查案） =================
// 现状 washOf 只算 live-only——变异实证 bossbags 现库删 spawn 恒绿（现库退化不可见）。
// 补 fresh-only 轴（bags/spawns/fields/coinMap 逆向四轴,缺键型=itemrare 同族,非空拒）。
describe.skipIf(EXT_MISSING)('extract-bossbags G-1 fresh-only 轴（BJ261）', () => {
  it('行为面:现库删 spawn → fresh-only 命名物证 exit 1（恒绿盲区收口）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-g1-'));
    try {
      const live = JSON.parse(readFileSync(LIVE, 'utf8'));
      const before3318 = live.bags['3318'].spawns.length;
      live.bags['3318'].spawns = live.bags['3318'].spawns.slice(1);   // 现库退化:删首条 spawn
      const fixture = join(dir, 'degraded.json');
      writeFileSync(fixture, JSON.stringify(live, null, 1));
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_BOSSBAGS_JSON: fixture },
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('fresh-only');
      expect(r.stderr).toContain('袋 3318');
      expect(r.stderr).toContain(`重产 ${before3318 - live.bags['3318'].spawns.length} 条现库缺`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('变异:摘 fresh-only 轴后对退化现库恒绿复现（证明该轴是唯一拦截面）', () => {
    const dir = mkdtempSync(join(TMP, 'bossbags-g1-'));
    try {
      const live = JSON.parse(readFileSync(LIVE, 'utf8'));
      live.bags['3318'].spawns = live.bags['3318'].spawns.slice(1);
      const fixture = join(dir, 'degraded.json');
      writeFileSync(fixture, JSON.stringify(live, null, 1));
      const probeEnv = { ...process.env, SW_BOSSBAGS_JSON: fixture };
      const src = relocateRoot(readFileSync(SCRIPT, 'utf8'));
      const TRIGGER = "for (const id of Object.keys(out)) {\n    if (!live.bags?.[id]) { wash.bagsFresh.push(id); continue; }";
      expect(src).toContain(TRIGGER);
      const mutant = join(dir, 'extract-bossbags-mutant-freshonly.mjs');
      // 摘轴:spawnsFresh 恒空（bagsFresh 臂保留,以 spawns 轴为判别对象）
      const mutantSrc = src.replace(
        'const freshOnly = (out[id].spawns ?? []).filter((s) => !liveSet.has(sig(s)));',
        'const freshOnly = []; // ★变异:fresh-only 轴摘除',
      );
      writeFileSync(mutant, mutantSrc);
      const real = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(real.status).toBe(1);      // 真工具:轴在位 → 拒
      const r = spawnSync('node', [mutant], { cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: probeEnv });
      expect(r.status).toBe(0);         // 变异体:轴摘除 → 恒绿复现
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
