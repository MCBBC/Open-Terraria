// IIII236 统一探针框架自测:CLI 参数/环境解析/杀树契约/统计与看门狗/台账/
// 坑表默认值与代码同步(防文档漂移)/框架不触 src 生产面。
// 本套件零网络零浏览器;socket 测试用本机回环瞬时端口(vitest 默认超时 5s 内完成)。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

// @ts-expect-error - untyped .mjs harness module
import { parseArgs, resolveSeed, sizeDims, sizeCode, pickFreePort, portBusy, SIZE_PRESETS } from '../tools/probe/lib/env.mjs';
// @ts-expect-error - untyped .mjs harness module
import { lsofListeners, killTree } from '../tools/probe/lib/vite.mjs';
// @ts-expect-error - untyped .mjs harness module
import { descendantsOf, killDescendants, runWithTimeout, psTable } from '../tools/probe/lib/proc.mjs';   // IIII245 J 域
// @ts-expect-error - untyped .mjs harness module
import { allRuns, compareAB, DEFAULT_RUNS } from '../tools/probe/lib/stats.mjs';
// @ts-expect-error - untyped .mjs harness module
import { withTimeout, stepWatchdog } from '../tools/probe/lib/watchdog.mjs';
// @ts-expect-error - untyped .mjs harness module
import { Ledger } from '../tools/probe/lib/ledger.mjs';
// @ts-expect-error - untyped .mjs harness module
import { CHEATSHEET, cheatsheetText, CHEATSHEET_GROUPS } from '../tools/probe/lib/cheatsheet.mjs';
// @ts-expect-error - untyped .mjs harness module
import { __clockFreezeInPage, __clockUnfreezeInPage, __clockSetInPage, __clockInfoInPage } from '../tools/probe/lib/clock.mjs';
// @ts-expect-error - untyped .mjs harness module
import { __callGameInPage, callGame } from '../tools/probe/lib/game.mjs';
// @ts-expect-error - untyped .mjs harness module
import { __dismissWelcomeInPage } from '../tools/probe/lib/boot.mjs';
// @ts-expect-error - untyped .mjs harness module
import { TOD, resolveTod, __stageInPage, __torchInjectInPage, __relightInPage } from '../tools/probe/lib/staging.mjs';
// @ts-expect-error - untyped .mjs harness module
import { fingerprintOf, resolveShotPath } from '../tools/probe/lib/shot.mjs';
// @ts-expect-error - untyped .mjs harness module
import { nextFrame, __nextFrameInPage } from '../tools/probe/lib/pump.mjs';
// @ts-expect-error - untyped .mjs harness module
import { fnv1a32, STORE_FNV_CHANNELS, fingerprintStoreChannels, __fnvStoreInPage, fnvStore } from '../tools/probe/lib/world.mjs';
// @ts-expect-error - untyped .mjs harness module
import { __tileIdBySheetInPage, __spawnEnemyInPage, __spawnTownNPCInPage, __clearEnemiesInPage, __giveItemsInPage } from '../tools/probe/lib/entities.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));   // game/tests
const GAME = dirname(ROOT);

function listenOn(port: number): Promise<net.Server> {
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

// ═══════════════ IIII245 J 域两坑收编(全后代树杀 + runWithTimeout) ═══════════════

describe('IIIII245 J5/J6 进程树收尾域(proc.mjs)', () => {
  /** ps 层"进程已消失"复核(杀完到 ps 摘除有收割延迟,轮询兜) */
  const gone = async (pid: number) => {
    for (let i = 0; i < 20; i++) {
      if (!psTable().has(pid)) return true;
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  };

  it('descendantsOf 纯表递归正确(直链/分叉/多级/无关节点;不含根自身)', () => {
    const t = new Map<number, number>([[10, 1], [20, 10], [30, 20], [50, 10], [40, 99]]);
    expect(descendantsOf(1, t).sort((a: number, b: number) => a - b)).toEqual([10, 20, 30, 50]);
    expect(descendantsOf(10, t).sort((a: number, b: number) => a - b)).toEqual([20, 30, 50]);
    expect(descendantsOf(30, t)).toEqual([]);   // 叶子=无后代
    expect(descendantsOf(40, t)).toEqual([]);   // 挂在无关父下,不被 1 的树收进来
    expect(descendantsOf(999, t)).toEqual([]);
  });

  it('J5 全后代树杀:真进程树(子→孙两级)递归收集+两段收口净', async () => {
    const { spawn } = await import('node:child_process');
    // 父进程再 spawn 一层孙代并把孙 pid 报出来=两级真树
    const parent = spawn(process.execPath, ['-e',
      `const { spawn } = require('child_process');
       const c = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
       console.log('G' + c.pid);
       setInterval(() => {}, 1000);`],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const gpid = await new Promise<number>((resolve, reject) => {
      let buf = '';
      const t = setTimeout(() => reject(new Error('grandchild pid 超时')), 5000);
      parent.stdout!.on('data', (d: Buffer) => {
        buf += d.toString();
        const m = buf.match(/G(\d+)/);
        if (m) { clearTimeout(t); resolve(Number(m[1])); }
      });
    });
    try {
      // 收集正确性:两级都在自树内(只读断言,不动兄弟进程)
      const before = descendantsOf(process.pid);
      expect(before).toContain(parent.pid!);
      expect(before).toContain(gpid);
      // 两段杀:以 parent 为根(防 vitest 并行池里误伤兄弟 worker——root 语义即"只杀这棵子树")
      const r = await killDescendants({ root: parent.pid!, termMs: 600, killWaitMs: 400 });
      expect(r.targets).toEqual([gpid]);
      expect(r.survivors).toEqual([]);
      expect(await gone(gpid)).toBe(true);
    } finally {
      try { parent.kill('SIGKILL'); } catch { /* 已死 */ }
    }
    expect(await gone(parent.pid!)).toBe(true);
  }, 20_000);

  it('J6 runWithTimeout:快速完成如实上报(timedOut=false+stdout)', async () => {
    const r = await runWithTimeout('echo probe-iii245-ok', 5000);
    expect(r.timedOut).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.stdout).toContain('probe-iii245-ok');
    expect(r.pid).toBeGreaterThan(0);
  });

  it('J6 runWithTimeout:硬超时触发+组杀净(不陪长跑命令悬挂)', async () => {
    const t0 = Date.now();
    const r = await runWithTimeout('sleep 30', 500, { termMs: 400 });
    const wall = Date.now() - t0;
    expect(r.timedOut).toBe(true);
    expect(r.ok).toBe(false);
    expect(wall).toBeGreaterThanOrEqual(500);
    expect(wall).toBeLessThan(10_000);          // 真硬杀,不是陪 sleep 30 跑满
    expect(await gone(r.pid)).toBe(true);       // 本尊确实被收割
  }, 20_000);

  it('guide↔lib 同步:J5/J6 已入坑表,API 三件在 proc.mjs 真身', () => {
    const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
    expect(guide).toContain('| J5 |');
    expect(guide).toContain('| J6 |');
    expect(guide).toContain('killDescendants');
    expect(guide).toContain('runWithTimeout');
    const proc = readFileSync(join(GAME, 'tools/probe/lib/proc.mjs'), 'utf8');
    for (const t of ['export function descendantsOf', 'export async function killDescendants', 'export function runWithTimeout']) {
      expect(proc).toContain(t);
    }
  });
});

describe('统计面(6× 重复纪律)', () => {
  it('DEFAULT_RUNS=6(Math.random 实体 A/B 的最低重复数)', () => {
    expect(DEFAULT_RUNS).toBe(6);
  });
  it('allRuns/compareAB 全一致判定', () => {
    expect(allRuns([1, 1, 1], (v: number) => v === 1).all).toBe(true);
    const bad = allRuns([1, 0, 1], (v: number) => v === 1);
    expect(bad.all).toBe(false);
    expect(bad.passes).toBe(2);
    expect(compareAB([1, 1], [0, 0], (v: number) => v === 1, (v: number) => v === 0).verdict).toBe(true);
    expect(compareAB([1, 0], [0, 0], (v: number) => v === 1, (v: number) => v === 0).verdict).toBe(false);
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
    expect(sw.log.filter((l: { ok: boolean }) => !l.ok).length).toBe(1);
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
    const files = ['tools/probe.mjs', 'tools/probe/lib/env.mjs', 'tools/probe/lib/vite.mjs', 'tools/probe/lib/proc.mjs', 'tools/probe/lib/browser.mjs',
      'tools/probe/lib/boot.mjs', 'tools/probe/lib/game.mjs', 'tools/probe/lib/pump.mjs', 'tools/probe/lib/camera.mjs',
      'tools/probe/lib/shot.mjs', 'tools/probe/lib/record.mjs', 'tools/probe/lib/world.mjs', 'tools/probe/lib/stats.mjs',
      'tools/probe/lib/watchdog.mjs', 'tools/probe/lib/ledger.mjs', 'tools/probe/lib/clock.mjs', 'tools/probe/lib/cheatsheet.mjs',
      'tools/probe/lib/presets.mjs', 'tools/probe/lib/staging.mjs', 'tools/probe/lib/entities.mjs', 'tools/probe/lib/index.mjs',
      'tools/probe/lib/perf.mjs', 'tools/probe/lib/perf-scenarios.mjs', 'tools/probe/lib/perf-analyze.mjs',
      'tools/probe/perf.mjs'];
    for (const f of files) {
      const s = readFileSync(join(GAME, f), 'utf8');
      expect(s.match(/from\s+'[^']*\/src\//g), `${f} 引用了 src/`).toBeNull();
    }
  });
});

// ═══════════════ IIII238 收编批(237 实战摩擦四条) ═══════════════

/** CHEATSHEET 桶条目形状(untyped .mjs 导入的 unknown 收窄,仅测试内类型面) */
type CheatsheetEntry = { name: string; file: string; token: string; note: string };

describe('IIIII238 ① 速查表源同步守卫(CHEATSHEET 每条锚定 src 真定义)', () => {
  it('每条 {file,token} 的 token 都字面存在于声明的 src 文件(防臆造/防漂移)', () => {
    let n = 0;
    for (const [group, entries] of Object.entries(CHEATSHEET) as [string, CheatsheetEntry[]][]) {
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
    const all = Object.values(CHEATSHEET).flat() as CheatsheetEntry[];
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
      expect(L.lines.some((l: string) => l.startsWith('STEP: caseA '))).toBe(true);
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
      expect(L.lines.some((l: string) => l.startsWith('STEP: caseB '))).toBe(true);
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

function readDirSafe(p: string): string[] {
  try {
    return (readdirSync(p) as string[]).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

// ═══════════════ IIII240 收编批(截图三坑:昼夜可见性/角色对框/欢迎弹窗) ═══════════════

/** 与 TileStore 同构的最小假 store(Node 直跑 staging 页内函数;SoA 通道齐) */
function fakeStore(W = 64, H = 80, floorY = 40, floorType = 1) {
  const n = W * H;
  const st = {
    w: W, h: H,
    flags: new Uint8Array(n), type: new Uint8Array(n), liquid: new Uint8Array(n),
    wire: new Uint8Array(n), half: new Uint8Array(n), slope: new Uint8Array(n), paint: new Uint8Array(n),
    idx: (x: number, y: number) => y * W + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H,
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) {
      const i = y * W + x;
      st.type[i] = t; st.flags[i] = t ? 1 : 0;
      st.frameX[i] = fx; st.frameY[i] = fy;
    },
    isSolid(x: number, y: number) { const i = y * W + x; return !!(st.flags[i] && (st.type[i] === 1 || st.type[i] === 2)); },
    frameX: new Uint8Array(n), frameY: new Uint8Array(n),
  } as never as Record<string, unknown> & {
    flags: Uint8Array; type: Uint8Array; idx: (x: number, y: number) => number;
    setTile: (x: number, y: number, t: number, fx?: number, fy?: number) => void;
    isSolid: (x: number, y: number) => boolean; w: number; h: number;
    liquid: Uint8Array; wire: Uint8Array; half: Uint8Array; slope: Uint8Array; paint: Uint8Array; frameX: Uint8Array; frameY: Uint8Array;
  };
  for (let x = 0; x < W; x++) st.setTile(x, floorY, floorType);
  return st;
}

function fakeGame(st: ReturnType<typeof fakeStore>, opts: { lighting?: unknown; flow?: unknown } = {}) {
  return {
    world: { store: st },
    player: { x: 500, y: 500, w: 20, h: 42, vx: 3, vy: 4, cx: 510, cy: 521, inv: { slots: [], selected: -1 } },
    camera: { x: 0, y: 0 },
    entities: { add: (_: unknown, __: string) => {}, npcs: [], enemies: [] },
    ...(opts.lighting ? { lighting: opts.lighting } : {}),
    ...(opts.flow ? { flow: opts.flow } : {}),
  };
}

describe('IIIII240 ① 昼夜预设 TOD/resolveTod(与 src Clock 常量字面同步)', () => {
  it('dawn/dusk 与 src/world/World.ts Clock.DAWN/DUSK 字面一致(防 src 漂移)', () => {
    const s = srcSafe('src/world/World.ts') ?? '';
    expect(s).toMatch(/DAWN = 4\.5 \/ 24/);
    expect(s).toMatch(/DUSK = 19\.5 \/ 24/);
    expect(TOD.dawn).toBe(4.5 / 24);
    expect(TOD.dusk).toBe(19.5 / 24);
    expect(TOD.day).toBe(0.5);            // 正午:dayFactor=1
    expect(TOD.night).toBe(22 / 24);      // 夜中段:避开 ±0.04 晨昏过渡带
  });
  it('resolveTod:预设/数字折回/null 透传/未知报 why', () => {
    expect(resolveTod(null).tod).toBeNull();
    expect(resolveTod(undefined).tod).toBeNull();
    expect(resolveTod('DAY').tod).toBe(0.5);
    expect(resolveTod('night').tod).toBe(22 / 24);
    expect(resolveTod('dusk').tod).toBeCloseTo(19.5 / 24, 12);
    expect(resolveTod(0.4).tod).toBeCloseTo(0.4, 12);
    expect(resolveTod(1.5).tod).toBeCloseTo(0.5, 12);     // 折回 0..1
    expect(resolveTod(-0.25).tod).toBeCloseTo(0.75, 12);
    expect(resolveTod('noon').ok).toBe(false);
    expect(resolveTod(Number.NaN).ok).toBe(false);
  });
  it('fingerprintOf:纯色窗 distinct=1;异帧指纹必异;页内 eval 重建与 Node 同源', () => {
    const uni = new Uint8Array(64 * 4).fill(0);      // 全黑窗(哨兵黑的指纹形态)
    expect(fingerprintOf(uni).distinct).toBe(1);
    const a = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]);
    const b = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
    expect(fingerprintOf(a).fnv).not.toBe(fingerprintOf(b).fnv);
    // litStats 页内按 toString 注入同一函数——重建路径与 Node 直跑逐位一致
    const rebuilt = eval('(' + fingerprintOf.toString() + ')') as typeof fingerprintOf;
    const px = new Uint8Array(4096);
    for (let i = 0; i < px.length; i += 4) { px[i] = (i * 7) & 255; px[i + 1] = (i * 13) & 255; px[i + 2] = (i * 29) & 255; px[i + 3] = 255; }
    expect(rebuilt(px)).toEqual(fingerprintOf(px));
  });
});

describe('IIIII240 ③ 欢迎弹窗自动关(__dismissWelcomeInPage 对假 doc 直跑)', () => {
  type El = { textContent?: string; click?: () => void; remove?: () => void; removed?: boolean; clicked?: boolean };
  function fakeDoc(root: El | null, buttons: El[] = []) {
    return {
      getElementById: (id: string) => (id === 'sw-welcome-announce' && root && !root.removed ? root : null),
      querySelectorAll: () => buttons.filter((b) => !b.removed),
    };
  }
  const ackStore: Record<string, string> = {};
  beforeEach(() => {
    delete ackStore['sw.welcome.announce.acked'];
    (globalThis as unknown as { localStorage?: unknown }).localStorage = {
      setItem: (k: string, v: string) => { ackStore[k] = v; },
    };
  });
  afterEach(() => { delete (globalThis as unknown as { localStorage?: unknown }).localStorage; });

  it('① 正统关法:按钮「我已知晓」click + ack 落袋 + 根节点移除(how=button)', () => {
    const root: El = { removed: false, remove() { root.removed = true; } };
    const btn: El = { textContent: '我已知晓', clicked: false, click() { btn.clicked = true; root.remove?.(); } };
    const r = __dismissWelcomeInPage({ doc: fakeDoc(root, [btn]) as unknown as Document });
    expect(r).toEqual({ ok: true, how: 'button' });
    expect(btn.clicked).toBe(true);
    expect(root.removed).toBe(true);
    expect(ackStore['sw.welcome.announce.acked']).toBe('1');   // 原生 ack 语义=永久关
  });
  it('② 兜底:按钮缺失/文案变体 → 摘根 + 补写 ack(how=removed)', () => {
    const root: El = { textContent: '欢迎来到 SandboxWorld', removed: false, remove() { root.removed = true; } };
    const r = __dismissWelcomeInPage({ doc: fakeDoc(root, []) as unknown as Document });
    expect(r).toEqual({ ok: true, how: 'removed' });
    expect(root.removed).toBe(true);
    expect(ackStore['sw.welcome.announce.acked']).toBe('1');
  });
  it('③ 本就没弹=absent 不算失败;无 doc 报 why;createGame/presets 默认关(UI 模板 keepDialogs)', () => {
    expect(__dismissWelcomeInPage({ doc: fakeDoc(null) as unknown as Document })).toEqual({ ok: true, how: 'absent' });
    expect(__dismissWelcomeInPage({ doc: undefined as unknown as Document })).toEqual({ ok: false, why: 'no-doc' });
    const game = srcSafe('tools/probe/lib/game.mjs') ?? '';
    expect(game).toContain('keepDialogs = false');
    expect(game).toContain('dismissWelcome(page)');
    expect(srcSafe('tools/probe/lib/presets.mjs')).toContain('keepDialogs: true');
  });
});

describe('IIIII240 ② staging 布景(__stageInPage/__torchInjectInPage 对假 store 直跑)', () => {
  beforeEach(() => {
    (globalThis as unknown as { window?: unknown }).window = {};
  });
  afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });

  it('stage:寻地面+清整带+铺地板+火把行+目标物+玩家传送+相机对框 全链', async () => {
    const st = fakeStore();
    st.setTile(33, 38, 3);                       // 清整带内预置杂物(非火把行/非目标格)→ 应被清掉
    const g = fakeGame(st);
    (globalThis as unknown as { window?: unknown }).window = { __swGame: g };
    const r = await __stageInPage({
      at: { tx: 32, ty: 30 }, w: 20, h: 12,
      platform: { tile: 2, rows: 1 },
      light: { torchTile: 77, hold: false, step: 6 },
      tiles: [{ dx: 0, dy: -1, tile: 9, frameX: 5 }],
      player: true, camera: true,
    });
    expect(r.ok).toBe(true);
    expect(r.cy).toBe(40);                       // 自动寻地面:30 → 40 第一块实心
    expect(st.type[st.idx(32, 40)]).toBe(2);     // 地板行铺上
    expect(st.flags[st.idx(33, 38)]).toBe(0);    // 清整带杂物已清(G9)
    expect(r.torches).toBeGreaterThan(0);        // 火把行(照明花园模式)
    for (let x = 23; x <= 41; x += 6) {          // step=6 自 x0+2=23 起
      if (st.flags[st.idx(x, 39)]) expect(st.type[st.idx(x, 39)]).toBe(77);
    }
    expect(st.type[st.idx(32, 39)]).toBe(9);     // 目标物落位
    expect(st.frameX[st.idx(32, 39)]).toBe(5);
    expect(r.placed).toBe(1);
    const p = g.player;
    expect(p.vx).toBe(0); expect(p.vy).toBe(0);  // 清速度
    expect(p.y).toBeLessThan(40 * 16);           // 玩家在地面以上
    expect(Math.floor((p.x + p.w / 2) / 16)).toBe(32);   // 布景中心
    expect(g.camera.x).toBe(32 * 16 + 8);        // 相机直写对框(0.15 缓动旁路)
    expect(g.camera.y).toBe((40 - 3) * 16);
  });
  it('stage:light.addLight 走引擎动态光并标 dirty;缺 __swGame 报 no-game', async () => {
    const st = fakeStore();
    const calls: number[][] = [];
    const lighting = { addLight: (...a: number[]) => { calls.push(a); }, dirty: false };
    const g = fakeGame(st, { lighting });
    (globalThis as unknown as { window?: unknown }).window = { __swGame: g };
    const r = await __stageInPage({ at: { tx: 32, ty: 30 }, light: { torchTile: 77, hold: false, addLight: [1, 1, 0.9] } });
    expect(r.ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].slice(0, 2)).toEqual([32, 38]);
    expect(lighting.dirty).toBe(true);
    (globalThis as unknown as { window?: unknown }).window = {};
    expect((await __stageInPage({})).why).toBe('no-game');
  });
  it('torch 注入:本格锚/向下找地面/无地面报 why(持久光源≠瞬态 AddLight;同 evaluate 读回写面)', async () => {
    const st = fakeStore();
    (globalThis as unknown as { window?: unknown }).window = { __swGame: fakeGame(st) };
    const r1 = await __torchInjectInPage({ tx: 10, ty: 39, torchTile: 77 });
    expect(r1).toMatchObject({ ok: true, at: [10, 39], active: true, type: 77 });   // 同 evaluate 证明写面落袋
    expect(st.type[st.idx(10, 39)]).toBe(77);
    const r2 = await __torchInjectInPage({ tx: 20, ty: 37, torchTile: 77 });   // 40 有地面 → 落 39
    expect(r2).toMatchObject({ ok: true, at: [20, 39], active: true, type: 77 });
    const st2 = fakeStore(64, 80, 40);
    for (let y = 39; y <= 44; y++) st2.setTile(30, y, 1);                      // 竖墙挡锚
    (globalThis as unknown as { window?: unknown }).window = { __swGame: fakeGame(st2) };
    const r3 = await __torchInjectInPage({ tx: 30, ty: 30, torchTile: 77, depth: 3 });
    expect(r3.ok).toBe(false);
  });
  it('relight:grid 光阵+越界跳过+标 dirty', () => {
    const st = fakeStore(64, 80, 40);
    const calls: number[][] = [];
    const lighting = { addLight: (...a: number[]) => { calls.push(a); }, dirty: false };
    (globalThis as unknown as { window?: unknown }).window = { __swGame: fakeGame(st, { lighting }) };
    const r = __relightInPage({ wx: 8, wy: 8, grid: 2, spacing: 10 });         // 中心(0,0) → 两侧有负格越界
    expect(r.ok).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThan(4);                                      // 越界格被跳过
    expect(lighting.dirty).toBe(true);
  });
});

describe('IIIII240 ④ 坑表三坑条目+API 面同步(guide↔lib 防漂移)', () => {
  const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
  it('三坑各一条已入坑表(C11 弹窗/D11 昼夜/E12 对框)', () => {
    expect(guide).toMatch(/^\| C11 \|.*dismissWelcome/m);
    expect(guide).toMatch(/^\| D11 \|.*screenshot/m);
    expect(guide).toMatch(/^\| E12 \|.*ensureContent/m);
  });
  it('API 面与 lib 源一致(screenshot/ensureContent/stage/resolveTod/keepDialogs)', () => {
    const shotSrc = srcSafe('tools/probe/lib/shot.mjs') ?? '';
    const stagingSrc = srcSafe('tools/probe/lib/staging.mjs') ?? '';
    for (const token of ['screenshot(page, name', 'ensureContent(page', 'resolveShotPath', 'convergeTicks', "onDark = 'torch'"]) {
      expect(shotSrc).toContain(token);
    }
    for (const token of ['screenshot', 'ensureContent', 'resolveShotPath', 'convergeTicks', 'onDark']) {
      expect(guide).toContain(token);
    }
    expect(stagingSrc).toContain('export function resolveTod');
    expect(stagingSrc).toContain('export async function stage(');
    expect(guide).toContain('staging');
    expect(guide).toContain('keepDialogs');
    expect(guide).toContain('resolveTod');
  });
  it('resolveShotPath:裸名归 SW_PROBE_OUT/shots,补 .png,带 / 直通', () => {
    const orig = process.env.SW_PROBE_OUT;
    try {
      delete process.env.SW_PROBE_OUT;
      expect(resolveShotPath('foo')).toBe('/tmp/probe-out/shots/foo.png');
      process.env.SW_PROBE_OUT = '/tmp/iii240-out';
      expect(resolveShotPath('bar')).toBe('/tmp/iii240-out/shots/bar.png');
      expect(resolveShotPath('baz.png')).toBe('/tmp/iii240-out/shots/baz.png');
      expect(resolveShotPath('/abs/dir/x.png')).toBe('/abs/dir/x.png');
      expect(resolveShotPath('x', '/tmp/custom-out')).toBe('/tmp/custom-out/shots/x.png');
    } finally {
      if (orig === undefined) delete process.env.SW_PROBE_OUT; else process.env.SW_PROBE_OUT = orig;
    }
  });
});

// ═══════════════ IIII242 收编批(IIIRS241 快赢三件:G8 等帧/G9 store 指纹/G4 实体反查组) ═══════════════

describe('IIIII242 G8 nextFrame(rAF 等帧;与 perf 互斥注释钉死)', () => {
  const rafQ: Array<(t: number) => void> = [];
  let frontCalls = 0;
  beforeEach(() => {
    rafQ.length = 0;
    frontCalls = 0;
    (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame =
      (cb: (t: number) => void) => { rafQ.push(cb); return rafQ.length; };
    (globalThis as unknown as { window?: unknown }).window = {};
  });
  afterEach(() => {
    delete (globalThis as unknown as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('双 rAF 帧边界:首帧回调不 resolve,第二帧才解;bringToFront 先置前(后台页节流坑)', async () => {
    const fakePage = { evaluate: async (fn: (a: unknown) => unknown, arg: unknown) => fn(arg), bringToFront: async () => { frontCalls++; } };
    const p = nextFrame(fakePage as never);
    await new Promise((r) => setTimeout(r, 0));        // 让 front→evaluate 微任务链走完(等待自身才挂 rAF)
    expect(rafQ.length).toBe(1);                       // 首个 rAF 已排队
    rafQ.splice(0).forEach((cb) => cb(16));
    expect(rafQ.length).toBe(1);                       // 双 rAF:内层又排一帧(单 rAF 回调在绘制前触发,不保证渲染周期已过)
    rafQ.splice(0).forEach((cb) => cb(32));
    await expect(p).resolves.toBe(true);
    expect(frontCalls).toBe(1);
  });
  it('__nextFrameInPage 页内核直跑同语义(多帧=循环调用)', async () => {
    const p1 = __nextFrameInPage();
    const p2 = __nextFrameInPage();
    rafQ.splice(0).forEach((cb) => cb(16));            // 两个等待各放行一帧
    rafQ.splice(0).forEach((cb) => cb(33));
    rafQ.splice(0).forEach((cb) => cb(49));
    rafQ.splice(0).forEach((cb) => cb(65));
    await expect(p1).resolves.toBe(true);
    await expect(p2).resolves.toBe(true);
  });
  it('与 perf 互斥纪律注释在源(泵/等帧工具 perf 窗内皆禁)', () => {
    const pumpSrc = srcSafe('tools/probe/lib/pump.mjs') ?? '';
    expect(pumpSrc).toContain('与 perf 互斥');
    expect(pumpSrc).toContain('双 rAF');
    const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
    expect(guide).toContain('nextFrame');
  });
});

describe('IIIII242 G9 fnvStore(_worldgen-hash 唯一实现入库金标化)', () => {
  /** 已知小 store(2×2;通道内容手选,指纹值经 Math.imul×BigInt 双算术路径互证后钉死)。 */
  function tinyStore() {
    return {
      w: 2, h: 2,
      type: new Uint16Array([1, 2, 3, 4]),
      wall: new Uint16Array([0, 0, 0, 5]),
      liquid: new Uint8Array([0, 255, 0, 0]),
      liquidType: new Uint8Array([0, 1, 0, 0]),
      half: new Uint8Array([1, 0, 0, 0]),
      slope: new Uint8Array([0, 2, 0, 0]),
      frameX: new Uint16Array([7, 0, 0, 0]),
      frameY: new Uint16Array([0, 0, 9, 0]),
      paint: new Uint8Array([0, 0, 15, 0]),
      coat: new Uint8Array([0, 0, 0, 1]),
    };
  }
  it('fnv1a32 对 FNV-1a 标准向量(空串/"a"/"foobar")', () => {
    expect(fnv1a32(new Uint8Array(0))).toBe('811c9dc5');
    expect(fnv1a32(new Uint8Array([97]))).toBe('e40c292c');
    expect(fnv1a32(new TextEncoder().encode('foobar'))).toBe('bf9cf968');
  });
  it('已知小 store 十通道指纹逐位钉死(Uint16 通道按 LE 字节展开)', () => {
    expect(fingerprintStoreChannels(tinyStore())).toEqual({
      size: '2x2',
      type: '4ef5d981', wall: 'ddd50d58', liquid: 'b78320a0', liquidType: '0caf41ca',
      half: 'fb69b604', slope: 'cdc88e7f', frameX: '83bd5402', frameY: 'cd172adc',
      paint: 'a97ab292', coat: '4a95f382',
    });
  });
  it('通道隔离(单字节改动只动本通道)+channels 子集过滤+确定性', () => {
    const st = tinyStore();
    const a = fingerprintStoreChannels(st);
    st.liquid[1] = 254;
    const b = fingerprintStoreChannels(st);
    expect(b.liquid).not.toBe(a.liquid);
    expect(b.type).toBe(a.type);
    expect(b.coat).toBe(a.coat);
    expect(fingerprintStoreChannels(st, ['type', 'wall'])).toEqual({ size: '2x2', type: a.type, wall: a.wall });
    expect(fingerprintStoreChannels(st)).toEqual(b);
  });
  it('与 scripts/_worldgen-hash.mjs 同源守卫(通道序+字节展开式逐条,改金标口径必爆红)', () => {
    const script = readFileSync(join(GAME, 'scripts/_worldgen-hash.mjs'), 'utf8');
    const names = [...script.matchAll(/(\w+): fnv\(/g)].map((m) => m[1]);
    expect(names).toEqual(Object.keys(STORE_FNV_CHANNELS));   // 通道集与序=金标序
    const worldSrc = srcSafe('tools/probe/lib/world.mjs') ?? '';
    for (const m of script.matchAll(/fnv\((new Uint8Array\(st\.\w+\.buffer\)|st\.\w+)\)/g)) {
      expect(worldSrc).toContain(m[1]);                        // 字节提取式逐条同源
    }
  });
  it('fnvStore 通吃 page|store 直跑(同值);no-store 报 why', async () => {
    const st = tinyStore();
    (globalThis as unknown as { window?: unknown }).window = { __swGame: { world: { store: st } } };
    const direct = await fnvStore(st as never);
    const viaPage = await fnvStore({ evaluate: async (fn: (a: unknown) => unknown, arg: unknown) => fn(arg) } as never, {});
    expect(direct.ok).toBe(true);
    expect(viaPage).toEqual(direct);
    (globalThis as unknown as { window?: unknown }).window = {};
    expect(__fnvStoreInPage()).toEqual({ ok: false, why: 'no-store' });
    expect(await fnvStore({} as never)).toEqual({ ok: false, why: 'no-store' });
  });
});

describe('IIIII242 G4 实体/物品/反查组(假 window 直跑,零浏览器)', () => {
  type Win = Record<string, any>;
  let win: Win;
  beforeEach(() => {
    win = {};
    (globalThis as unknown as { window?: unknown }).window = win;
  });
  afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window; });
  const fakePage = { evaluate: async (fn: (a: unknown) => unknown, arg: unknown) => fn(arg) };

  it('tileIdBySheet 查表版:命中回 {ok,id,key};未登记报 no-sheet(与 findTileBySheet 扫描版并存)', async () => {
    const defs = [{ vanilla: { sheet: 7 }, key: 'stone_watcher' }, null, { vanilla: { sheet: 4 }, key: 'torch' }];
    await expect(__tileIdBySheetInPage({ sheet: 4, __TILE_DEFS: defs })).resolves.toEqual({ ok: true, id: 2, key: 'torch' });
    await expect(__tileIdBySheetInPage({ sheet: 999, __TILE_DEFS: defs })).resolves.toEqual({ ok: false, why: 'no-sheet', sheet: 999 });
    expect(srcSafe('tools/probe/lib/world.mjs')).toContain("d?.vanilla?.sheet === sheet");   // 谓词与扫描版同源
  });
  it('spawnEnemy:桥生成+aiInit 出生帧前落 ai 字段(坑表 I2);生成失败/缺桥报 why', async () => {
    const enemies: Array<Record<string, unknown>> = [];
    win.__swGame = { entities: { enemies } };
    win.__swFlow = {
      spawnVanillaEnemy: async (vid: number, x: number, y: number) => {
        if (vid === 999) return null;
        const e = { id: 7, x: x - 10, y: y - 15, hp: 100, ai1: 0, ai2: 0 };
        enemies.push(e);
        return { id: 7, x: e.x, y: e.y, hp: 100 };
      },
    };
    const r = await __spawnEnemyInPage({ vid: 290, x: 3200, y: 600, aiSrc: '((e) => { e.ai1 = 5; e.ai2 = 9; })' });
    expect(r).toEqual({ ok: true, id: 7, x: 3190, y: 585, hp: 100, refFound: true });
    expect(enemies[0].ai1).toBe(5);
    expect(enemies[0].ai2).toBe(9);
    expect(await __spawnEnemyInPage({ vid: 999, x: 0, y: 0 })).toEqual({ ok: false, why: 'spawn-failed', vid: 999 });
    delete win.__swFlow;
    expect(await __spawnEnemyInPage({ vid: 1, x: 0, y: 0 })).toEqual({ ok: false, why: 'no-bridge' });
  });
  it('spawnTownNPC:tile 锚=列心+脚底地面行顶(ctor 底锚)+home 站格缺省;未登记键拒生成(防 ctor 静默兜底)', async () => {
    const npcs: Array<unknown> = [];
    const added: Array<[unknown, string]> = [];
    class FakeTownNPC {
      x = 0; y = 0; w = 18; h = 40; vanillaId = 17; home: unknown = null;
      constructor(public key: string, cx: number, foot: number) { this.x = cx; this.y = foot - this.h; }
    }
    win.__swGame = { entities: { npcs, add: (e: unknown, bucket: string) => added.push([e, bucket]) } };
    const table = { merchant: { id: 17, extra: 9 } };
    const r = await __spawnTownNPCInPage({ key: 'merchant', tx: 100, ty: 200, __Ctor: FakeTownNPC, __TOWN_NPC_IDS: table });
    expect(r).toMatchObject({ ok: true, key: 'merchant', vid: 17, x: 100 * 16 + 8 - 9, y: 201 * 16 - 40, w: 18, h: 40 });
    expect(r).toMatchObject({ home: { x: 100, y: 200 } });   // home 缺省={tx,ty} 站格口径
    expect(added).toHaveLength(1);
    expect(added[0][1]).toBe('npcs');
    expect(await __spawnTownNPCInPage({ key: 'merchent', __Ctor: FakeTownNPC, __TOWN_NPC_IDS: table }))
      .toEqual({ ok: false, why: 'unknown-key:merchent' });
    (globalThis as unknown as { window?: unknown }).window = {};
    await expect(__spawnTownNPCInPage({ key: 'merchant' })).resolves.toEqual({ ok: false, why: 'no-game' });
  });
  it('clearEnemies:先验后清+计数回吐;臆造桶名不产生半清场;缺省不动 npcs', () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ i }));
    const entities = { enemies: mk(3), drops: mk(2), projectiles: mk(5), npcs: mk(1) } as Record<string, unknown[]>;
    win.__swGame = { entities };
    expect(__clearEnemiesInPage({})).toEqual({ ok: true, cleared: { enemies: 3, drops: 2, projectiles: 5 } });
    expect(entities.enemies).toEqual([]);
    expect(entities.npcs).toHaveLength(1);                 // 城镇居民夹具(_iii234 族)可共存
    entities.props = mk(4);
    expect(__clearEnemiesInPage({ kinds: ['enemies', 'props', 'nope'] })).toEqual({ ok: false, why: 'no-bucket:nope' });
    expect(entities.props).toHaveLength(4);                // 验证先于清空:零半清场
    expect(__clearEnemiesInPage({ kinds: ['props'] })).toEqual({ ok: true, cleared: { props: 4 } });
  });
  it('giveItems:vid→slot 显式弹药槽/自动位游标推进/wipe 全清/未知 vid+越界槽失败行/select 钉选中', () => {
    const slots: Array<unknown> = Array(58).fill(null);
    win.__swGame = { player: { inv: { slots, selected: -1 } } };
    win.__swFlow = { itemByVid: (vid: number) => (({ 9: 42, 75: 77 } as Record<number, number>)[vid] ?? -1) };
    const r = __giveItemsInPage({ items: [{ vid: 9, stack: 250, slot: 54 }, { vid: 75 }], select: 54 });
    expect(r).toMatchObject({ ok: true, selected: 54 });
    expect(r.placed).toEqual([
      { vid: 9, iid: 42, slot: 54, stack: 250 },           // 显式弹药槽(54-57,Inventory.ts:142 布局)
      { vid: 75, iid: 77, slot: 0, stack: 1 },             // 自动位=背包首个空格
    ]);
    expect(__giveItemsInPage({ items: [{ vid: 75 }] }).placed[0]).toMatchObject({ slot: 1 });   // 游标推进:0 已占→1
    const w = __giveItemsInPage({ items: [{ vid: 9, slot: 3 }], wipe: true });
    expect(w.placed).toEqual([{ vid: 9, iid: 42, slot: 3, stack: 1 }]);
    expect(slots[0]).toBeNull();                            // wipe 清全 58 格(含钱币/弹药)
    expect(slots[54]).toBeNull();
    const bad = __giveItemsInPage({ items: [{ vid: 5 }, { vid: 9, slot: 99 }] });
    expect(bad.ok).toBe(false);
    expect(bad.failed).toEqual([{ vid: 5, why: 'no-vid' }, { vid: 9, why: 'no-slot' }]);
    win.__swGame = { player: {} };
    expect(__giveItemsInPage({ items: [] })).toEqual({ ok: false, why: 'no-inv' });
  });
  it('页面包装导出齐(五件均经 lib index 出口)', () => {
    const src = srcSafe('tools/probe/lib/entities.mjs') ?? '';
    for (const fn of ['tileIdBySheet', 'spawnEnemy', 'spawnTownNPC', 'clearEnemies', 'giveItems']) {
      expect(src).toContain(`export async function ${fn}`);
      expect(readFileSync(join(GAME, 'tools/probe/lib/index.mjs'), 'utf8')).toContain("./entities.mjs");
    }
  });
});

describe('IIIII242 采用策略与 API 面同步(guide↔lib 防漂移)', () => {
  const guide = readFileSync(join(GAME, 'docs/methodology/probe-guide.md'), 'utf8');
  it('采用策略成节:新探针必须走框架;存量 1344 支按需渐进迁移(不强制)', () => {
    expect(guide).toContain('新探针必须走框架');
    expect(guide).toContain('按需渐进迁移');
    expect(guide).toContain('不强制');
    expect(guide).toContain('迁移样例');
  });
  it('迁移样例对照已收录(paladin 手写 spawn/removeEnemy → G4 包装)', () => {
    expect(guide).toContain('spawnPaladin');
    expect(guide).toContain('spawnEnemy(page, 290');
    expect(guide).toContain('removeEnemy');
    expect(guide).toContain('clearEnemies(page');
  });
  it('API 面三件入速查(entities/nextFrame/fnvStore)+互斥纪律入 guide', () => {
    expect(guide).toContain('nextFrame');
    expect(guide).toContain('fnvStore');
    expect(guide).toContain('tileIdBySheet');
    expect(guide).toContain('spawnTownNPC');
    expect(guide).toContain('giveItems');
    expect(srcSafe('tools/probe/lib/pump.mjs')).toContain('export async function nextFrame');
    expect(srcSafe('tools/probe/lib/world.mjs')).toContain('export async function fnvStore');
    expect(srcSafe('tools/probe/lib/entities.mjs')).toContain('export async function spawnEnemy');
  });
});
