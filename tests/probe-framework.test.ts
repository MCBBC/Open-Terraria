// IIII236 统一探针框架自测:CLI 参数/环境解析/杀树契约/统计与看门狗/台账/
// 坑表默认值与代码同步(防文档漂移)/框架不触 src 生产面。
// 本套件零网络零浏览器;socket 测试用本机回环瞬时端口(vitest 默认超时 5s 内完成)。
import { describe, it, expect } from 'vitest';
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
      'tools/probe/lib/watchdog.mjs', 'tools/probe/lib/ledger.mjs', 'tools/probe/lib/presets.mjs', 'tools/probe/lib/index.mjs'];
    for (const f of files) {
      const s = readFileSync(join(GAME, f), 'utf8');
      expect(s.match(/from\s+'[^']*\/src\//g), `${f} 引用了 src/`).toBeNull();
    }
  });
});

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
