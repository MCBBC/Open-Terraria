import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★清债（2026-09-18，BJ114-e 同族普查）：extract-itemrare.mjs producer 追加时代守卫——
// 源版本 1456（现缺省已翻转 1457，见拍板#7A；本文件旧 1456 场景全部改【显式】注入）
// 重放旧基线=把 1457 新物品 6147-6195（49 件）连同
// 1293 rare 档（1457 Item.cs:15981 新增，1456 案无此行）从 vanilla-itemrare/itemvalue
// 洗成缺键（缺键 → 运行时 rare=0/value=0 兜底，飘名/重铸/商店/decraft 全错）。BJ92
// （3860-3862 错值非缺键）同案异构：本件=缺键型增量，与 extract-npcs 字段型不同构。
// 照 era guard 判例（atlas 四连 / recipes R25-B5② / npcs 债刀-3）落闸：守卫=重产 vs
// 现库【动态 diff】（缺 id 非空即拒，不硬编码 id 清单——1293≤6146 同被动态探测捕获，
// 实证 1456 重产 missing=50/49）+ --force-full --overwrite-append-era 双旗逃生 +
// SW_ITEMRARE_JSON/SW_ITEMVALUE_JSON/SW_OUT 注入面。守卫测试习语 =
// extract-npcs-era-guard.test.ts。
//
// ★拍板#7A（2026-09-18）缺省翻转后的语义面：裸跑=1457 重产（守卫零缺失放行，
// 对现库 byte-perfect——见「缺省翻转行为面」测）；显式 SW_ITEM_VER=1456=旧基线
// 重放（守卫 missing=50/49 拦截——旧「缺省 1456 洗库」场景改显式注入复用）。
//
// ★g1 footgun 硬化测试（2026-09-18，红蓝-F①）：探测 env 设置而 SW_OUT 缺省 → 拒跑
// exit 1（fail-closed——守卫探测将读夹具零缺失放行，写盘却落缺省 OUT_DIR=现库
// game/src/data=绕守卫洗库）；同场景 + 显式 SW_OUT → 放行（写盘落 SW_OUT）；
// 变异=摘硬化 → 探测夹具+缺 SW_OUT 下写盘落「缺省现库」路径（变异里把缺省
// OUT_DIR 换成沙箱假现库=真现库副本种子）复现 6147-6195 被洗，真现库零接触。

const SCRIPT = join(process.cwd(), 'tools', 'extract-itemrare.mjs');
const LIVE_RARE = join(process.cwd(), 'src', 'data', 'vanilla-itemrare.json');
const LIVE_VALUE = join(process.cwd(), 'src', 'data', 'vanilla-itemvalue.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接:import.meta.url 是 realpath 而 pathToFileURL(argv[1])
//   不是——mutant 脚本放 /var 下会因 URL 不匹配跳过 CLI 分支。临时目录一律取 realpath。
const TMP = realpathSync(tmpdir());
/** 拒绝路径测试的注入面:SW_OUT 重定向写盘(守卫失灵时测试也伤不到现库)+探测路径
 *  显式钉回现库(缺省探测路径跟随 SW_OUT,不钉=探测落空,守卫测不到真实现库)。
 *  ★拍板#7A:缺省已翻转 1457,旧基线重放场景一律显式 SW_ITEM_VER=1456。 */
const rejectEnv = (dir: string, ver?: string) => ({
  ...process.env,
  SW_OUT: dir,
  ...(ver ? { SW_ITEM_VER: ver } : {}),
  SW_ITEMRARE_JSON: LIVE_RARE,
  SW_ITEMVALUE_JSON: LIVE_VALUE,
});

/** 零增量夹具：键集 ⊆ 1457 重产输出集（守卫判据=只看 id 覆盖不看值；值取现库真实终值） */
const CLEAN_RARE = JSON.stringify({ 3860: 8, 3319: 1 });
const CLEAN_VALUE = JSON.stringify({ 757: 1000000, 319: 200 });
/** 增量夹具：6147 = 1457 新物品首 id（1456 重产盖不住 = 缺键型物证） */
const INCREMENT_RARE = JSON.stringify({ 3860: 8, 6147: 8 });
const INCREMENT_VALUE = JSON.stringify({ 757: 1000000, 6147: 5000 });

describe('extract-itemrare 追加时代守卫（缺键型增量拦截面）', () => {
  it('行为面:现库增量态下【显式 1456】重放被拒（exit 1+物证+活通道指引）,现库字节零改动', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: rejectEnv(dir, '1456'),   // SW_OUT 重定向:守卫失灵时测试也伤不到现库;★#7A 显式 1456
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝全量重写');
      expect(r.stderr).toContain('SW_ITEM_VER=1456');                    // 重产源版本动态标注（显式 1456）
      expect(r.stderr).toContain('vanilla-itemrare.json 缺 50 个 id');    // 真实增量物证（1293+6147-6195）
      expect(r.stderr).toContain('vanilla-itemvalue.json 缺 49 个 id');   // （6147-6195）
      expect(r.stderr).toContain('1293');                                // ≤6146 的 1457 新增 rare 档也被动态探测捕获
      expect(r.stderr).toContain('6147');                                // 1457 新物品段首 id
      expect(r.stderr).toContain('缺省 1457');                           // 正常更新流指引（缺省翻转后语义）
      expect(r.stderr).toContain('recon-item-1456-1457.mjs');            // 活通道指引
      expect(r.stderr).toContain('--force-full');                        // 双旗逃生指引
      expect(md5(LIVE_RARE)).toBe(beforeR);                              // 拒绝路径零写盘
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:【显式 1456】--force-full 单旗在增量态仍被拒（双旗第二键 --overwrite-append-era 在位）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: rejectEnv(dir, '1456'),
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝全量重写');
      expect(r.stderr).toContain('--overwrite-append-era');
      expect(md5(LIVE_RARE)).toBe(beforeR);
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('结构锁:拒绝路径守卫块内零写盘+双旗逃生门/动态探测/活通道锚在位', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const guardStart = src.indexOf('const appendEra');
    const guardEnd = src.indexOf('process.exit(1)', guardStart);
    expect(guardStart).toBeGreaterThan(-1);
    expect(guardEnd).toBeGreaterThan(guardStart);
    const guardBlock = src.slice(guardStart, guardEnd);
    expect(guardBlock).not.toContain('writeFileSync(');   // 拒绝路径零写盘的结构前提
    expect(src).toContain('--force-full');
    expect(src).toContain('--overwrite-append-era');
    // 探测式=动态现库 diff（缺 id=现库键集−重产输出集），非硬编码 id 清单
    expect(src).toContain('missingOf(');
    expect(src).toContain('appendEra = missingRare.length > 0 || missingValue.length > 0');
    // 活通道锚在位
    expect(src).toContain('recon-item-1456-1457.mjs');
  });

  it('行为面:【显式 1456】双旗逃生门放行（SW_OUT 注入 /tmp,全量重算=真实覆写语义,现库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: dir, SW_ITEM_VER: '1456' },
      });
      expect(r.status).toBe(0);
      const rare = JSON.parse(readFileSync(join(dir, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      const value = JSON.parse(readFileSync(join(dir, 'vanilla-itemvalue.json'), 'utf8')) as Record<string, number>;
      expect(Object.keys(rare).length).toBeGreaterThan(3000);   // 1456 全量重算产物
      expect(rare['6147']).toBeUndefined();                     // 重产(显式 1456)确实不含 1457 新物品段——双旗=明示放弃增量
      expect(Object.keys(value).length).toBeGreaterThan(4000);
      expect(md5(LIVE_RARE)).toBe(beforeR);                     // 现库零接触
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★拍板#7A（2026-09-18）缺省翻转行为面：裸跑（仅 SW_OUT 沙箱,零其他注入）=1457
  //  重产零缺失放行,产物与现库逐字节一致（红蓝-F 实证收编为回归测试——本测红=
  //  有人改了缺省源版本或现库被洗,先查 git/对账再动刀）。
  it('行为面:缺省翻转——裸跑=1457 重产,对现库 byte-perfect（exit 0 零缺失）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: dir },   // 缺省 SRC_VER=1457;守卫探测跟随 SW_OUT(沙箱首跑无基线=零缺失)
      });
      expect(r.status).toBe(0);
      expect(r.stderr).toContain('源 Terarria1457');            // 缺省源版本已翻转
      const freshR = readFileSync(join(dir, 'vanilla-itemrare.json'));
      const freshV = readFileSync(join(dir, 'vanilla-itemvalue.json'));
      expect(freshR.equals(readFileSync(LIVE_RARE))).toBe(true);   // 与现库 byte-perfect
      expect(freshV.equals(readFileSync(LIVE_VALUE))).toBe(true);
      expect(md5(LIVE_RARE)).toBe(beforeR);                     // 现库零接触
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:双旗+SW_ITEM_VER=1457 重建=活通道指引端到端可走（重产盖住 1293+6147-6195 段）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: dir, SW_ITEM_VER: '1457' },
      });
      expect(r.status).toBe(0);
      const rare = JSON.parse(readFileSync(join(dir, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      expect(rare['1293']).toBe(8);          // 1457 :15981 新增 rare 档
      expect('6147' in rare).toBe(true);     // 1457 新物品段首
      expect('6195' in rare).toBe(true);     // 段尾
      expect(Object.keys(rare).length).toBe(3627);   // 与现库同基数（零缺失;BJ413 +24 风筝 HAND 面 3275→3299;R2 helper 体 rare 面 +169=3468;★S1 2026-09-30 五段续刀 +159（食物尾式 86 内 +1 显式零 4010/守卫 120/鱼链 16/bait 22）+58 改值 0 删键=3468→3627）
      expect(md5(LIVE_RARE)).toBe(beforeR);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:零增量夹具放行（守卫不误伤;SW_ITEMRARE_JSON/SW_ITEMVALUE_JSON/SW_OUT 三注入,零接触现库）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const rareF = join(dir, 'rare.json');
    const valueF = join(dir, 'value.json');
    writeFileSync(rareF, CLEAN_RARE);
    writeFileSync(valueF, CLEAN_VALUE);
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEMRARE_JSON: rareF, SW_ITEMVALUE_JSON: valueF, SW_OUT: dir },
      });
      expect(r.status).toBe(0);
      const written = JSON.parse(readFileSync(join(dir, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      expect(Object.keys(written).length).toBeGreaterThan(3000);   // 全量重算产物落注入路径
      expect(md5(LIVE_RARE)).toBe(beforeR);                        // 注入面隔离,现库零接触
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘掉守卫判据 → 增量夹具被静默洗掉（exit 0+6147 缺键落盘）。
  // 证明「守卫是缺键型增量下唯一的拦截面」，摘 guard 必红（显式 1456 重放事故重演,
  // ★#7A 缺省已翻转 1457,变异注入须显式 1456 才能复现旧基线洗库）。
  it('变异:摘守卫判据后增量夹具被静默洗掉(证明 guard 判别力)', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const mutant = join(dir, 'extract-itemrare-mutant.mjs');
    const rareF = join(dir, 'rare.json');
    const valueF = join(dir, 'value.json');
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const appendEra = missingRare.length > 0 || missingValue.length > 0;';
    expect(src).toContain(TRIGGER);
    writeFileSync(mutant, src.replace(TRIGGER, 'const appendEra = false; // ★变异:守卫判据摘除'));
    writeFileSync(rareF, INCREMENT_RARE);
    writeFileSync(valueF, INCREMENT_VALUE);
    const beforeR = md5(LIVE_RARE);
    try {
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEMRARE_JSON: rareF, SW_ITEMVALUE_JSON: valueF, SW_OUT: dir, SW_ITEM_VER: '1456' },
      });
      expect(r.status).toBe(0);                                 // 无 guard → 放行
      const written = JSON.parse(readFileSync(join(dir, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      expect(written['6147']).toBeUndefined();                  // 1457 新物品段被静默洗掉=事故重演
      expect(md5(LIVE_RARE)).toBe(beforeR);                     // 注入面隔离,现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★g1 footgun 硬化（红蓝-F①,2026-09-18）：探测 env 设置而 SW_OUT 缺省 → fail-closed
  //  拒跑 exit 1。定谳:守卫探测将读夹具（零缺失→放行）而写盘落缺省 OUT_DIR=现库
  //  game/src/data——探测与写盘分离=守卫被绕过洗库。拒绝路径现库字节零改动。
  it('行为面:探测 env 设置而 SW_OUT 缺省 → 拒跑 exit 1（footgun fail-closed）,现库字节零改动', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const rareF = join(dir, 'rare.json');
    const valueF = join(dir, 'value.json');
    writeFileSync(rareF, CLEAN_RARE);
    writeFileSync(valueF, CLEAN_VALUE);
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_ITEMRARE_JSON: rareF, SW_ITEMVALUE_JSON: valueF,
      };
      delete env.SW_OUT;   // footgun 场景=写盘路径缺省（显式剥除防运行环境污染）
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('SW_OUT 缺省');
      expect(r.stderr).toContain('fail-closed');
      expect(r.stderr).toContain('探测注入面');
      expect(r.stderr).toContain('--dump 对账通道不写盘不受此限');   // dump 通道豁免指引在位
      expect(md5(LIVE_RARE)).toBe(beforeR);                      // 拒绝路径零写盘
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:同 footgun 场景 + 显式 SW_OUT → 放行（写盘落 SW_OUT）,现库零接触', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const rareF = join(dir, 'rare.json');
    const valueF = join(dir, 'value.json');
    writeFileSync(rareF, CLEAN_RARE);
    writeFileSync(valueF, CLEAN_VALUE);
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_ITEMRARE_JSON: rareF, SW_ITEMVALUE_JSON: valueF, SW_OUT: dir },
      });
      expect(r.status).toBe(0);                                  // 硬化只拦 SW_OUT 缺省
      const written = JSON.parse(readFileSync(join(dir, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      expect(Object.keys(written).length).toBeGreaterThan(3000); // 全量重算产物落显式 SW_OUT
      expect(md5(LIVE_RARE)).toBe(beforeR);
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ★变异（判别力）:摘 footgun 硬化 → 探测夹具（零缺失）+缺 SW_OUT 下守卫被绕过,
  //  写盘落缺省「现库」路径=footgun 复现。变异里把缺省 OUT_DIR 换成沙箱假现库
  //  （种子=真现库副本,含 6147-6195 增量）——1456 重产洗掉 6147=洗库物证;真现库零接触。
  it('变异:摘 footgun 硬化后探测夹具+缺 SW_OUT 写盘落缺省现库路径（6147 被洗=footgun 复现）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const fakeLive = join(dir, 'live');
    mkdirSync(fakeLive, { recursive: true });
    copyFileSync(LIVE_RARE, join(fakeLive, 'vanilla-itemrare.json'));    // 假现库=真现库副本
    copyFileSync(LIVE_VALUE, join(fakeLive, 'vanilla-itemvalue.json'));
    const rareF = join(dir, 'rare.json');
    const valueF = join(dir, 'value.json');
    writeFileSync(rareF, CLEAN_RARE);
    writeFileSync(valueF, CLEAN_VALUE);
    const src = readFileSync(SCRIPT, 'utf8');
    const TRIGGER = 'const PROBE_ENV_SET = process.env.SW_ITEMRARE_JSON !== undefined || process.env.SW_ITEMVALUE_JSON !== undefined;';
    const OUT_LINE = 'const OUT_DIR = process.env.SW_OUT ?? `${ROOT}/game/src/data`;';
    expect(src).toContain(TRIGGER);
    expect(src).toContain(OUT_LINE);
    const mutant = join(dir, 'extract-itemrare-mutant.mjs');
    writeFileSync(mutant, src
      .replace(TRIGGER, 'const PROBE_ENV_SET = false; // ★变异:footgun 硬化摘除')
      .replace(OUT_LINE, 'const OUT_DIR = process.env.SW_MUTANT_FAKE_LIVE;'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const env: Record<string, string | undefined> = {
        ...process.env, SW_ITEMRARE_JSON: rareF, SW_ITEMVALUE_JSON: valueF, SW_MUTANT_FAKE_LIVE: fakeLive,
        SW_ITEM_VER: '1456',   // ★#7A:缺省已翻转 1457,洗库复现须显式 1456 重放旧基线
      };
      delete env.SW_OUT;
      const r = spawnSync('node', [mutant], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000, env: env as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(0);                                 // 硬化摘除 → footgun 放行
      const washed = JSON.parse(readFileSync(join(fakeLive, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      expect(washed['6147']).toBeUndefined();                   // 假现库被 1456 重产洗掉增量=洗库复现
      expect(md5(LIVE_RARE)).toBe(beforeR);                     // 真现库零接触（OUT_DIR 已换沙箱）
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
