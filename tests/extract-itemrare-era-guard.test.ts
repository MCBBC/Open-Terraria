import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ★清债（2026-09-18，BJ114-e 同族普查）：extract-itemrare.mjs producer 追加时代守卫——
// 缺省源版本 1456（SW_ITEM_VER 未设）裸跑重产=把 1457 新物品 6147-6195（49 件）连同
// 1293 rare 档（1457 Item.cs:15981 新增，1456 案无此行）从 vanilla-itemrare/itemvalue
// 洗成缺键（缺键 → 运行时 rare=0/value=0 兜底，飘名/重铸/商店/decraft 全错）。BJ92
// （3860-3862 错值非缺键）同案异构：本件=缺键型增量，与 extract-npcs 字段型不同构。
// 照 era guard 判例（atlas 四连 / recipes R25-B5② / npcs 债刀-3）落闸：守卫=重产 vs
// 现库【动态 diff】（缺 id 非空即拒，不硬编码 id 清单——1293≤6146 同被动态探测捕获，
// 实证 1456 重产 missing=50/49）+ --force-full --overwrite-append-era 双旗逃生 +
// SW_ITEMRARE_JSON/SW_ITEMVALUE_JSON/SW_OUT 注入面。守卫测试习语 =
// extract-npcs-era-guard.test.ts。

const SCRIPT = join(process.cwd(), 'tools', 'extract-itemrare.mjs');
const LIVE_RARE = join(process.cwd(), 'src', 'data', 'vanilla-itemrare.json');
const LIVE_VALUE = join(process.cwd(), 'src', 'data', 'vanilla-itemvalue.json');
const md5 = (p: string) => createHash('md5').update(readFileSync(p)).digest('hex');
// ★macOS /var→/private/var 符号链接:import.meta.url 是 realpath 而 pathToFileURL(argv[1])
//   不是——mutant 脚本放 /var 下会因 URL 不匹配跳过 CLI 分支。临时目录一律取 realpath。
const TMP = realpathSync(tmpdir());
/** 拒绝路径测试的注入面:SW_OUT 重定向写盘(守卫失灵时测试也伤不到现库)+探测路径
 *  显式钉回现库(缺省探测路径跟随 SW_OUT,不钉=探测落空,守卫测不到真实现库)。 */
const rejectEnv = (dir: string) => ({
  ...process.env,
  SW_OUT: dir,
  SW_ITEMRARE_JSON: LIVE_RARE,
  SW_ITEMVALUE_JSON: LIVE_VALUE,
});

/** 零增量夹具：键集 ⊆ 1456 重产输出集（守卫判据=只看 id 覆盖不看值；值取现库真实终值） */
const CLEAN_RARE = JSON.stringify({ 3860: 8, 3319: 1 });
const CLEAN_VALUE = JSON.stringify({ 757: 1000000, 319: 200 });
/** 增量夹具：6147 = 1457 新物品首 id（1456 重产盖不住 = 缺键型物证） */
const INCREMENT_RARE = JSON.stringify({ 3860: 8, 6147: 8 });
const INCREMENT_VALUE = JSON.stringify({ 757: 1000000, 6147: 5000 });

describe('extract-itemrare 追加时代守卫（缺键型增量拦截面）', () => {
  it('行为面:现库增量态下默认运行被拒（exit 1+物证+活通道指引）,现库字节零改动', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: rejectEnv(dir),   // SW_OUT 重定向:守卫失灵时测试也伤不到现库
      });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('拒绝全量重写');
      expect(r.stderr).toContain('SW_ITEM_VER=1456');                    // 重产源版本动态标注（缺省 1456）
      expect(r.stderr).toContain('vanilla-itemrare.json 缺 50 个 id');    // 真实增量物证（1293+6147-6195）
      expect(r.stderr).toContain('vanilla-itemvalue.json 缺 49 个 id');   // （6147-6195）
      expect(r.stderr).toContain('1293');                                // ≤6146 的 1457 新增 rare 档也被动态探测捕获
      expect(r.stderr).toContain('6147');                                // 1457 新物品段首 id
      expect(r.stderr).toContain('SW_ITEM_VER=1457');                    // 正常更新流指引
      expect(r.stderr).toContain('recon-item-1456-1457.mjs');            // 活通道指引
      expect(r.stderr).toContain('--force-full');                        // 双旗逃生指引
      expect(md5(LIVE_RARE)).toBe(beforeR);                              // 拒绝路径零写盘
      expect(md5(LIVE_VALUE)).toBe(beforeV);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('行为面:--force-full 单旗在增量态仍被拒（双旗第二键 --overwrite-append-era 在位）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: rejectEnv(dir),
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

  it('行为面:双旗逃生门放行（SW_OUT 注入 /tmp,全量重算=真实覆写语义,现库零接触）', () => {
    const dir = mkdtempSync(join(TMP, 'itemrare-guard-'));
    const beforeR = md5(LIVE_RARE);
    const beforeV = md5(LIVE_VALUE);
    try {
      const r = spawnSync('node', [SCRIPT, '--force-full', '--overwrite-append-era'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, SW_OUT: dir },
      });
      expect(r.status).toBe(0);
      const rare = JSON.parse(readFileSync(join(dir, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      const value = JSON.parse(readFileSync(join(dir, 'vanilla-itemvalue.json'), 'utf8')) as Record<string, number>;
      expect(Object.keys(rare).length).toBeGreaterThan(3000);   // 1456 全量重算产物
      expect(rare['6147']).toBeUndefined();                     // 重产(缺省 1456)确实不含 1457 新物品段——双旗=明示放弃增量
      expect(Object.keys(value).length).toBeGreaterThan(4000);
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
      expect(Object.keys(rare).length).toBe(3275);   // 与现库同基数（零缺失）
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
  // 证明「守卫是缺键型增量下唯一的拦截面」，摘 guard 必红（1456 裸跑事故重演）。
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
        env: { ...process.env, SW_ITEMRARE_JSON: rareF, SW_ITEMVALUE_JSON: valueF, SW_OUT: dir },
      });
      expect(r.status).toBe(0);                                 // 无 guard → 放行
      const written = JSON.parse(readFileSync(join(dir, 'vanilla-itemrare.json'), 'utf8')) as Record<string, number>;
      expect(written['6147']).toBeUndefined();                  // 1457 新物品段被静默洗掉=事故重演
      expect(md5(LIVE_RARE)).toBe(beforeR);                     // 注入面隔离,现库零接触
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
