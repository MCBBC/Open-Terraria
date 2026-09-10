// IIII236 统一探针框架自测:CLI 参数/环境解析/杀树契约/统计与看门狗/台账/
// 坑表默认值与代码同步(防文档漂移)/框架不触 src 生产面。
// 本套件零网络零浏览器;socket 测试用本机回环瞬时端口(vitest 默认超时 5s 内完成)。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

import { parseArgs, resolveSeed, sizeDims, sizeCode, pickFreePort, portBusy, SIZE_PRESETS } from '../tools/probe/lib/env.mjs';
import { lsofListeners, killTree } from '../tools/probe/lib/vite.mjs';
import { allRuns, compareAB, DEFAULT_RUNS } from '../tools/probe/lib/stats.mjs';
import { withTimeout, stepWatchdog } from '../tools/probe/lib/watchdog.mjs';
import { Ledger } from '../tools/probe/lib/ledger.mjs';
import { CHEATSHEET, cheatsheetText, CHEATSHEET_GROUPS } from '../tools/probe/lib/cheatsheet.mjs';
import { __clockFreezeInPage, __clockUnfreezeInPage, __clockSetInPage, __clockInfoInPage } from '../tools/probe/lib/clock.mjs';
import { __callGameInPage, callGame } from '../tools/probe/lib/game.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));   // game/tests
const GAME = dirname(ROOT);

function listenOn(port): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer(() => { /* 有人连就算忙 */ });
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

describe('probe CLI 参数面(parseArgs)', () => {
  it('--k=v / --k v / --flag 三形态 + 位置参数', () => {
    const { opts, positionals } = parseArgs(['run', 'scripts/_x.mjs', '--seed=zenith', '--size', 'small', '--headed', '--timeout=123']);
    expect(opts).toEqual({ seed: 'zenith', size: 'small', headed: true, timeout: '123' });
    expect(positionals).toEqual(['run', 'scripts/_x.mjs']);
  });
  it('未知键透传不报错并登记', () => {
    const { opts, unknown } = parseArgs(['--mystery=1']);
    expect(opts.mystery).toBe('1');
    expect(unknown).toContain('mystery');
  });
});

describe('种子与尺寸预设(坑表 C 域默认值)', () => {
  it('彩蛋别名逐字对齐 SeedEasterEggs 注册表', () => {
    expect(resolveSeed('zenith')).toBe('get fixed boi');
    expect(resolveSeed('drunk')).toBe('05162020');
    expect(resolveSeed('anniversary')).toBe('celebrationmk10');
    expect(resolveSeed('bees')).toBe('not the bees');
    expect(resolveSeed('05162020')).toBe('05162020');   // 字面量直通
    expect(resolveSeed('')).toBe('');
  });
  it('尺寸预设 = main.ts ?play= 字面映射(4200×1200/6400×1800/8400×2400)', () => {
    expect(SIZE_PRESETS.small).toEqual([4200, 1200]);
    expect(SIZE_PRESETS.medium).toEqual([6400, 1800]);
    expect(SIZE_PRESETS.large).toEqual([8400, 2400]);
    expect(sizeDims('small')).toEqual([4200, 1200]);
    expect(sizeDims(2)).toEqual([8400, 2400]);
    expect(sizeCode('small')).toBe(0);
    expect(sizeCode(2)).toBe(2);
  });
});

describe('端口面(IIIRS216 lsof-kill 契约)', () => {
  it('占用端口被 pickFreePort 跳过', async () => {
    const busy = 5320 + (process.pid % 200);   // 回环测试位,避开 52xx 会话约定区
    const srv = await listenOn(busy);
    try {
      expect(await portBusy(busy)).toBe(true);
      const picked = await pickFreePort(busy, 5);
      expect(picked).toBeGreaterThan(busy);
    } finally {
      srv.close();
    }
  });
  it('lsofListeners 对空闲端口=空,对监听端口=pid;killTree 收口后监听者=0', async () => {
    const port = 5340 + (process.pid % 100);
    const srv = await listenOn(port);
    try {
      expect(lsofListeners(port).length).toBeGreaterThan(0);
    } finally {
      srv.close();
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(lsofListeners(port)).toEqual([]);
    // killTree 全流程:起一个真 server 进程,杀完必须 0 监听(杀树判例的回归锚)
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, ['-e', `require('net').createServer(()=>{}).listen(${port},'127.0.0.1')`], { detached: true, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 700));
    expect(lsofListeners(port).length).toBeGreaterThan(0);
    const r = await killTree(port, child);
    expect(r.listenersLeft).toBe(0);
    expect(lsofListeners(port)).toEqual([]);
  }, 15000);
});

describe('统计面(6× 重复纪律)', () => {
  it('DEFAULT_RUNS=6(Math.random 实体 A/B 的最低重复数)', () => {
    expect(DEFAULT_RUNS).toBe(6);
  });
  it('allRuns/compareAB 全一致判定', () => {
    expect(allRuns([1, 1, 1], (v) => v === 1).all).toBe(true);
    const bad = allRuns([1, 0, 1], (v) => v === 1);
    expect(bad.all).toBe(false);
    expect(bad.passes).toBe(2);
    expect(compareAB([1, 1], [0, 0], (v) => v === 1, (v) => v === 0).verdict).toBe(true);
    expect(compareAB([1, 0], [0, 0], (v) => v === 1, (v) => v === 0).verdict).toBe(false);
  });
});

describe('看门狗与台账', () => {
  it('withTimeout 超时抛错/按时 resolve', async () => {
    await expect(withTimeout(new Promise(() => {}), 30, '永挂步')).rejects.toThrow(/永挂步/);
    await expect(withTimeout(Promise.resolve(7), 1000, 'ok')).resolves.toBe(7);
  });
  it('stepWatchdog 记账+预算耗尽收紧步超时', async () => {
    const sw = stepWatchdog({ budgetMs: 5000, defaultStepMs: 1000 });
    await sw.step('快步', async () => 1);
    await expect(sw.step('慢步', () => new Promise(() => {}))).rejects.toThrow(/慢步/);
    expect(sw.log.filter((l) => !l.ok).length).toBe(1);
    expect(sw.elapsed()).toBeGreaterThan(0);
  });
  it('Ledger chk 聚合+退出码 0/2', () => {
    const L = new Ledger({ quiet: true });
    L.chk('a', true);
    L.chk('b', false, '细节');
    expect(L.ok).toBe(false);
    expect(L.exitCode()).toBe(2);
    const P = new Ledger({ quiet: true });
    P.chk('a', true);
    expect(P.exitCode()).toBe(0);
  });
});

describe('坑表默认值与代码同步(docs/methodology/probe-guide.md 防漂移)', () => {
  const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
  const src = (p: string) => readFileSync(join(GAME, p), 'utf8');

  it('坑表四列结构齐备(现象/根因/解法/归入 API)', () => {
    expect(guide).toContain('| 现象 | 根因 | 解法 |');
    expect(guide.match(/^\| [A-J]\d+ \|/gm)?.length ?? 0).toBeGreaterThanOrEqual(40);
  });
  it('文档引用的默认值与 lib 源一致', () => {
    expect(guide).toContain('step=30');                    // pump 分段
    expect(src('tools/probe/lib/pump.mjs')).toContain('step = 30');
    expect(guide).toContain('runs=6');
    expect(src('tools/probe/lib/stats.mjs')).toContain('DEFAULT_RUNS = 6');
    expect(guide).toContain('1280×800');
    expect(src('tools/probe/lib/browser.mjs')).toContain('width: 1280, height: 800');
    expect(guide).toContain('5201');                        // 私有端口基
    expect(src('tools/probe/lib/env.mjs')).toContain('5201');
    expect(guide).toContain('pumpUntil(step=17');
    expect(src('tools/probe/lib/pump.mjs')).toContain('step = 17');
  });
  it('IDB 名与 KvStore.DB_NAME 一致(坑表 C6)', () => {
    expect(src('tools/probe/lib/boot.mjs')).toContain("'sandboxworld'");
    expect(src('src/save/KvStore.ts')).toMatch(/DB_NAME = 'sandboxworld'/);
  });
  it('坑表 memory 判例锚存在(memory 目录同名额/前缀)', () => {
    // memory 目录在用户 home(不在仓库内);异机无此目录时跳过(可移植性)
    const memRoot = join(homedir(), '.claude', 'projects', '-Users-vinlic-Project-GLM-SandboxWorld', 'memory');
    const memFiles = readDirSafe(memRoot);
    if (!memFiles.length) return;
    // 只取「判例」列(每行末列)里的 kebab-case 名;引用常用缩写,做前缀匹配
    const anchors = new Set<string>();
    for (const line of guide.split('\n')) {
      if (!line.startsWith('| ')) continue;
      const cells = line.split('|').map((c) => c.trim());
      const last = cells[cells.length - 2] ?? '';
      for (const m of last.matchAll(/\b([a-z0-9]+(?:-[a-z0-9]+){2,})\b/g)) {
        if (m[1].length >= 12) anchors.add(m[1]);
      }
    }
    expect(anchors.size).toBeGreaterThanOrEqual(5);
    for (const name of anchors) {
      const hit = memFiles.some((f) => f === `${name}.md` || f.startsWith(name));
      expect(hit, `memory 缺判例锚: ${name}`).toBe(true);
    }
  });
});

describe('框架不触 src 生产面', () => {
  it('tools/probe 全域零 import src/', () => {
    const files = ['tools/probe.mjs', 'tools/probe/lib/env.mjs', 'tools/probe/lib/vite.mjs', 'tools/probe/lib/browser.mjs',
      'tools/probe/lib/boot.mjs', 'tools/probe/lib/game.mjs', 'tools/probe/lib/pump.mjs', 'tools/probe/lib/camera.mjs',
      'tools/probe/lib/shot.mjs', 'tools/probe/lib/record.mjs', 'tools/probe/lib/world.mjs', 'tools/probe/lib/stats.mjs',
      'tools/probe/lib/watchdog.mjs', 'tools/probe/lib/ledger.mjs', 'tools/probe/lib/clock.mjs', 'tools/probe/lib/cheatsheet.mjs',
      'tools/probe/lib/presets.mjs', 'tools/probe/lib/index.mjs'];
    for (const f of files) {
      const s = readFileSync(join(GAME, f), 'utf8');
      expect(s.match(/from\s+'[^']*\/src\//g), `${f} 引用了 src/`).toBeNull();
    }
  });
});

// ═══════════════ IIII238 收编批(237 实战摩擦四条) ═══════════════

describe('IIIII238 ① 速查表源同步守卫(CHEATSHEET 每条锚定 src 真定义)', () => {
  it('每条 {file,token} 的 token 都字面存在于声明的 src 文件(防臆造/防漂移)', () => {
    let n = 0;
    for (const [group, entries] of Object.entries(CHEATSHEET)) {
      expect(entries.length, `组 ${group} 非空`).toBeGreaterThan(0);
      for (const e of entries) {
        n++;
        const s = srcSafe(e.file);
        expect(s, `文件缺失: ${e.file}(${group}.${e.name})`).not.toBeNull();
        expect(s!.includes(e.token), `token 不在 ${e.file}: ${group}.${e.name} → "${e.token}"`).toBe(true);
      }
    }
    expect(n).toBeGreaterThanOrEqual(40);   // 速查面不缩水(47 条起)
  });
  it('237 三处猜错点在表内有钉(stack 非 count/__swTiles/ash 素名)', () => {
    const all = Object.values(CHEATSHEET).flat();
    expect(all.some((e) => e.name === 'ItemDrop.stack' && e.note.includes('count'))).toBe(true);
    expect(all.some((e) => e.name === '__swTiles' && e.note.includes('TILE_BY_KEY'))).toBe(true);
    expect(all.some((e) => e.token === "key: 'ash',")).toBe(true);
  });
  it('cheatsheetText 人类可读输出含分组标题+过滤生效', () => {
    const full = cheatsheetText();
    for (const g of Object.values(CHEATSHEET_GROUPS)) expect(full).toContain(g);
    expect(cheatsheetText('vanillaMainTime')).toContain('vanillaMainTime');
    expect(cheatsheetText('vanillaMainTime')).not.toContain('ItemDrop.stack');
  });
  it('guide「常用字段真名」节与 lib 数据同源(三坑点+字段名都在文档)', () => {
    const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
    expect(guide).toContain('常用字段真名');
    expect(guide).toContain('ItemDrop.stack');
    expect(guide).toContain('__swTiles');
    expect(guide).toContain("'ash'");
    expect(guide).toContain('Clock.vanillaMainTime');
    expect(guide).toContain('node tools/probe.mjs fields');
  });
});

describe('IIIII238 ④ freezeClock 夹具(页内函数对假 window 直跑,零浏览器)', () => {
  /** 与 src/world/World.ts Clock 同构的假钟(推进公式一致:24min 全周期)。 */
  class FakeClock {
    static DAWN = 4.5 / 24;
    static DUSK = 19.5 / 24;
    timeOfDay = 0.5;
    dayCount = 1;
    moonPhase = 0;
    bloodMoon = false;
    tick(dtMs: number) {
      this.timeOfDay += dtMs / 86_400_000;
      while (this.timeOfDay >= 1) { this.timeOfDay -= 1; this.dayCount++; }
    }
    static vanillaMainTime(tod: number): number {
      if (tod >= FakeClock.DAWN && tod < FakeClock.DUSK) return (tod - FakeClock.DAWN) * 86400;
      return ((((tod - FakeClock.DUSK) % 1) + 1) % 1) * 86400;
    }
    get isDay(): boolean { return this.timeOfDay > FakeClock.DAWN && this.timeOfDay < FakeClock.DUSK; }
    get hourFloat(): number { return this.timeOfDay * 24; }
  }

  let gameRef: { world: { clock: FakeClock } };
  beforeEach(() => {
    gameRef = { world: { clock: new FakeClock() } };
    (globalThis as unknown as { window?: unknown }).window = { __swGame: gameRef };
    delete (globalThis as { __swClockFrozen?: unknown }).__swClockFrozen;
  });
  afterEach(() => {
    delete (globalThis as { __swClockFrozen?: unknown }).__swClockFrozen;
    delete (globalThis as { window?: unknown }).window;
  });

  it('freeze 钉钟面后 tick 不走(pump 域冻结);夜 20:00 isDay=false', () => {
    const r = __clockFreezeInPage({ tod: 20 / 24 });
    expect(r.ok).toBe(true);
    expect(r.tod).toBeCloseTo(20 / 24, 12);
    expect(r.isDay).toBe(false);
    for (let i = 0; i < 60; i++) gameRef.world.clock.tick(16.666);   // 模拟 60t 泵+真实帧
    expect(gameRef.world.clock.timeOfDay).toBe(20 / 24);             // 钟面纹丝不动
    expect(__clockInfoInPage().frozen).toBe(true);
  });
  it('freeze 缺省不钉钟面,只冻结推进', () => {
    gameRef.world.clock.timeOfDay = 12 / 24;
    const r = __clockFreezeInPage({});
    expect(r.ok).toBe(true);
    expect(r.tod).toBe(12 / 24);
    gameRef.world.clock.tick(3_600_000);   // 整 1h 也推不动
    expect(gameRef.world.clock.timeOfDay).toBe(12 / 24);
  });
  it('unfreeze 恢复推进+钟面回滚冻结前值(冻结窗像没发生过)', () => {
    gameRef.world.clock.timeOfDay = 10 / 24;
    const tod0 = gameRef.world.clock.timeOfDay;
    __clockFreezeInPage({ tod: 22 / 24 });
    const u = __clockUnfreezeInPage();
    expect(u.ok).toBe(true);
    expect(gameRef.world.clock.timeOfDay).toBe(tod0);   // 回滚到冻结前
    gameRef.world.clock.tick(86_400_000 / 24);          // 解冻后恢复推进(1h)
    expect(gameRef.world.clock.timeOfDay).toBeCloseTo(11 / 24, 10);
    expect(__clockInfoInPage().frozen).toBe(false);
  });
  it('重复 freeze=改钉保持冻结;未冻结 unfreeze 报 why;缺 __swGame 报 no-clock', () => {
    __clockFreezeInPage({ tod: 20 / 24 });
    const again = __clockFreezeInPage({ tod: 21 / 24 });
    expect(again.already).toBe(true);
    expect(gameRef.world.clock.timeOfDay).toBe(21 / 24);
    gameRef.world.clock.tick(1000);
    expect(gameRef.world.clock.timeOfDay).toBe(21 / 24);
    __clockUnfreezeInPage();
    expect(__clockUnfreezeInPage()).toEqual({ ok: false, why: 'not-frozen' });
    (globalThis as unknown as { window?: unknown }).window = {};   // 桥在但没进世界 → no-clock
    expect(__clockFreezeInPage({ tod: 0.5 }).why).toBe('no-clock');
  });
  it('clockSet 单钉不冻结;clockInfo 吐 vanillaMainTime 分段 ticks(夜 20:00≈1800)', () => {
    const s = __clockSetInPage({ tod: 20 / 24 });
    expect(s.ok).toBe(true);
    const info = __clockInfoInPage();
    expect(info.ok).toBe(true);
    expect(info.isDay).toBe(false);
    expect(info.vanillaMainTime).toBeCloseTo(1800, 6);   // 夜 20:00=分段 ticks 1800(IIIII237 语义锚)
    gameRef.world.clock.tick(16.666);   // 未冻结:推进照常
    expect(gameRef.world.clock.timeOfDay).toBeGreaterThan(20 / 24);
    expect(__clockInfoInPage().frozen).toBe(false);
  });
});

describe('IIIII238 ② callGame(TS private 运行时直调)', () => {
  beforeEach(() => {
    delete (globalThis as { __swClockFrozen?: unknown }).__swClockFrozen;
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('页内直调:private 方法返回 value;缺失/抛错回 {ok:false,why}', () => {
    const g = {
      secret: (a: number, b: number) => a + b,
      boom: () => { throw new Error('故意炸'); },
    };
    (globalThis as unknown as { window?: unknown }).window = { __swGame: g };
    const ok = __callGameInPage({ method: 'secret', args: [2, 3] });
    expect(ok).toEqual({ ok: true, value: 5 });
    expect(__callGameInPage({ method: 'nope' })).toEqual({ ok: false, why: 'no-method:nope' });
    const bad = __callGameInPage({ method: 'boom' });
    expect(bad.ok).toBe(false);
    expect(bad.why).toContain('故意炸');
  });
  it('callGame 页面包装:方法名与参数整体序列化进 evaluate', async () => {
    const g = { isAlchemyPlantHarvestable: (style: number, y: number) => style === 5 && y > 100 };
    (globalThis as unknown as { window?: unknown }).window = { __swGame: g };
    const fakePage = { evaluate: async (fn: (a: unknown) => unknown, arg: unknown) => fn(arg) };
    const r = await callGame(fakePage as never, 'isAlchemyPlantHarvestable', 5, 422);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(true);
  });
  it('guide 坑表 G11+API 面已收录(lib 同步)', () => {
    const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
    expect(guide).toMatch(/^\| G11 \|.*private/m);
    expect(guide).toContain('callGame');
    expect(readFileSync(join(GAME, 'tools/probe/lib/game.mjs'), 'utf8')).toContain('export async function callGame');
  });
});

describe('IIIII238 ③ 分步计时(Ledger.step+CLI 总耗时)', () => {
  it('step 打 ▶/◀ 行+耗时,返回值透传,STEP 行入台账', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (m?: unknown) => { logs.push(String(m)); };
    try {
      const L = new Ledger();
      const v = await L.step('caseA', async () => 42);
      expect(v).toBe(42);
      expect(logs.some((l) => l.startsWith('▶ caseA (t+'))).toBe(true);
      expect(logs.some((l) => /^◀ caseA \d+\.\ds \(t\+/.test(l))).toBe(true);
      expect(L.lines.some((l) => l.startsWith('STEP: caseA '))).toBe(true);
      expect(L.ok).toBe(true);
    } finally {
      console.log = orig;
    }
  });
  it('step 内抛错也收 ◀ 行(finally 语义),异常原样上抛', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (m?: unknown) => { logs.push(String(m)); };
    try {
      const L = new Ledger({ quiet: true });
      await expect(L.step('caseB', async () => { throw new Error('x'); })).rejects.toThrow('x');
      expect(L.lines.some((l) => l.startsWith('STEP: caseB '))).toBe(true);
    } finally {
      console.log = orig;
    }
    void logs;
  });
  it('elapsed 格式(<60s 秒/≥60s 分秒)与 quiet 静默', async () => {
    const L = new Ledger({ quiet: true });
    expect(L.elapsed()).toMatch(/^(\d+\.\ds|\d+m\d{2}s)$/);
    const logs: string[] = [];
    const orig = console.log;
    console.log = (m?: unknown) => { logs.push(String(m)); };
    try {
      await L.step('silent', async () => 1);
      expect(logs).toEqual([]);
    } finally {
      console.log = orig;
    }
  });
  it('guide+CLI 已收录计时面(fields 子命令/总耗时/step)', () => {
    const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
    expect(guide).toContain('step(name,fn)');
    expect(guide).toContain('总耗时');
    expect(readFileSync(join(GAME, 'tools/probe/lib/ledger.mjs'), 'utf8')).toContain('async step(name, fn)');
    const cli = readFileSync(join(GAME, 'tools/probe.mjs'), 'utf8');
    expect(cli).toContain("cmd === 'fields'");
    expect(cli).toContain('总耗时');
  });
});

function srcSafe(p: string): string | null {
  try {
    return readFileSync(join(GAME, p), 'utf8');
  } catch {
    return null;
  }
}

function existsSafe(p: string): boolean {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

function readDirSafe(p: string): string[] {
  try {
    return (readdirSync(p) as string[]).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}
