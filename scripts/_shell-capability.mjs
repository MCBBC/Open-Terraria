#!/usr/bin/env node
// 壳能力五断言探针（桌面化方案 M2 验收，见计划与 docs/desktop-packaging-research.md）。
//
// 用法（game/ 目录下）：
//   SW_PORT 无关——本探针自带被测壳进程：
//   1. 先起私有静态预览实例（遵循并行会话约定，端口自选 52xx）：
//        npx vite preview --port 5207 --outDir dist-release --strictPort &
//   2. 跑探针：
//        node tools/run-diag.mjs --timeout=300000 scripts/_shell-capability.mjs \
//          [--url http://localhost:5207/?...]
//
// 断言：
//   ① SW 注册成功且首会话受控（sw.js 有 clients.claim()）
//   ② CacheStorage put/match 字节数守恒（自定义 scheme 拒收问题的 Chromium 侧验证）
//   ③ isSecureContext === true（AssetCache 环境门三条件之一）
//   ④ primeBootAssets 等价信号：sw-assets-v* 缓存中出现 audios/music/Music_50.mp3
//     （p0 哨兵；dev 形态需 ?sw 开闸，preview/dist-release 为 PROD 天然放行）
//   ⑤ 首屏截图哈希（INFO 记录，动画导致不做像素级死断言）
//
// 进程卫生：electron 子进程由本脚本全生命周期托管；watchdog SIGKILL 兜底下也有
// exit 钩子补杀，防止孤儿实例占住 52xx。

import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const DESKTOP_DIR = join(HERE, '..', 'desktop');

let url = ''; // 空 = 内嵌自包含形态(壳自己起环回服务);显式传入则测远程目标
{
  const i = process.argv.indexOf('--url');
  if (i !== -1 && process.argv[i + 1]) url = process.argv[i + 1];
  const j = process.argv.findIndex((a) => a.startsWith('--url='));
  if (j !== -1) url = process.argv[j].slice(6);
}
// AssetCache 环境门：dev 形态需要 ?sw 显式开闸（PROD 构建天然满足，参数幂等无害）
if (url && !/[?&]sw\b/.test(url)) url += (url.includes('?') ? '&' : '?') + 'sw';

const SENTINEL = 'audios/music/Music_50.mp3';
const BOOT_MS = Number(process.env.SHELL_PROBE_BOOT_MS || 120_000);

let electronProc = null;
let tmpUserData = null;
const jobTmp = process.env.CLAUDE_JOB_DIR ? join(process.env.CLAUDE_JOB_DIR, 'tmp') : tmpdir();

process.on('exit', killHard);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killHard(); process.exit(130); });

function killHard() {
  try {
    if (electronProc?.pid && !electronProc.killed) {
      try { process.kill(-electronProc.pid, 'SIGKILL'); } catch { try { electronProc.kill('SIGKILL'); } catch {} }
    }
  } catch {}
}

async function freePort(prefer) {
  for (const p of [prefer, ...Array.from({ length: 20 }, (_, k) => prefer + 1 + k)]) {
    const ok = await new Promise((res) => {
      const s = createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  return 0; // 让系统随机挑
}

async function waitCdpEndpoint(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl || null;
    } catch {}
    await sleep(300);
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

async function main() {
  const cdpPort = await freePort(9447);
  const userData = mkdtempSync(join(jobTmp, 'shell-probe-'));
  tmpUserData = userData;

  console.log(`[probe] target=${url}`);
  console.log(`[probe] cdp=:${cdpPort} userData=${userData}`);

  electronProc = spawn(join(DESKTOP_DIR, 'node_modules', '.bin', 'electron'), ['.'], {
    cwd: DESKTOP_DIR,
    detached: true, // 独立进程组，便于整体 SIGKILL
    env: {
      ...process.env,
      ...(url ? { SANDBOX_DESKTOP_URL: url } : {}),
      SANDBOX_DESKTOP_CDP_PORT: String(cdpPort),
      SANDBOX_DESKTOP_USERDATA: userData,
      ELECTRON_ENABLE_LOGGING: '0',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  electronProc.unref();

  const wsEndpoint = await waitCdpEndpoint(cdpPort, 30_000);
  if (!wsEndpoint) throw new Error('CDP 30s 未就绪（Electron 启动失败？）');

  // 版本兼容：老 API 无 connectOverCDP，经 /json/version 拿 ws 端点直接 connect
  const browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
  try {
    let page = null;
    const wantOrigin = url ? new URL(url).origin : '';
    for (let t = 0; t < 60 && !page; t++) {
      await sleep(500);
      for (const tgt of browser.targets()) {
        const u = tgt.url?.() || '';
        // 泛化匹配:任一 http(s) 页面即可——内嵌形态地址是随机环回端口,
        // 显式 --url 时优先按 origin 对号(观测纪律:连接必须 defaultViewport:null)
        if (tgt.type() === 'page' && /^https?:/i.test(u) &&
            (!wantOrigin || u.startsWith(wantOrigin))) {
          page = await tgt.page();
          break;
        }
      }
    }
    if (!page) throw new Error('未找到页面 target（壳是否加载了目标站点？）');
    await page.setViewport({ width: 1280, height: 720 }).catch(() => {});
    await page.bringToFront().catch(() => {});

    const results = [];

    // ---- ① SW 注册 + 受控 ----
    let controlled = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      controlled = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) return { reg: false, controller: false };
        const ctl = navigator.serviceWorker.controller ?? (await navigator.serviceWorker.ready).controller;
        return { reg: true, controller: !!ctl };
      });
      if (controlled.reg && controlled.controller) break;
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(1500);
    }
    results.push(['① SW 注册并受控', !!controlled?.reg && !!controlled?.controller]);

    // ---- ② CacheStorage put/match 字节守恒 ----
    const cons = await page.evaluate(async () => {
      try {
        const c = await caches.open('__shell_probe__');
        const data = crypto.getRandomValues(new Uint8Array(4096)).buffer;
        await c.put('/__shell_probe__/blob', new Response(data));
        const hit = await c.match('/__shell_probe__/blob');
        if (!hit) return { ok: false, why: 'match miss' };
        const back = new Uint8Array(await hit.arrayBuffer());
        const want = new Uint8Array(data);
        const same = back.length === want.length && back.every((b, i) => b === want[i]);
        return { ok: same, why: same ? '' : '字节不守恒', putLen: want.length, gotLen: back.length };
      } catch (e) {
        return { ok: false, why: String(e) };
      }
    });
    results.push([`② CacheStorage 字节守恒(${cons.putLen}/${cons.gotLen})`, cons.ok, cons.why]);

    // ---- ③ isSecureContext ----
    const secure = await page.evaluate(() => ({ v: self.isSecureContext, proto: location.protocol }));
    results.push([`③ isSecureContext(${secure.proto})`, secure.v === true]);

    // ---- ④ primeBootAssets 等价哨兵 ----
    const sentinelOk = await (async () => {
      const deadline = Date.now() + BOOT_MS;
      while (Date.now() < deadline) {
        const hit = await page.evaluate(async (want) => {
          try {
            for (const key of await caches.keys()) {
              if (!key.startsWith('sw-assets-v')) continue;
              if (await (await caches.open(key)).match(want)) return key;
            }
          } catch {}
          return null;
        }, SENTINEL);
        if (hit) return hit;
        await sleep(2500);
      }
      return null;
    })();
    results.push(
      sentinelOk
        ? [`④ primeBootAssets 哨兵 ${SENTINEL}（cache=${sentinelOk}）`, true]
        : [`④ primeBootAssets 哨兵 ${SENTINEL} 在 ${BOOT_MS / 1000}s 内未入缓存`, false],
    );

    // ---- ⑤ 首屏截图哈希（INFO） ----
    try {
      const shot = await page.screenshot({ type: 'png' });
      const h = createHash('sha256').update(shot).digest('hex').slice(0, 16);
      results.push([`⑤ 首屏截图 sha256:${h} (${shot.length}B, INFO 不判定)`, true]);
    } catch (e) {
      results.push([`⑤ 截图失败(INFO): ${String(e).slice(0, 80)}`, true]);
    }

    let fail = 0;
    console.log('\n===== 壳能力五断言 =====');
    for (const [label, ok, note] of results) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? '  ← ' + note : ''}`);
      if (!ok) fail++;
    }
    console.log(`=======================\n${fail ? `结论: ${fail} 项失败` : '结论: 全绿'}`);
    process.exitCode = fail ? 1 : 0;
  } finally {
    await browser.disconnect().catch(() => {});
  }
}

try {
  await main();
} catch (e) {
  console.error('[probe] 异常:', e);
  process.exitCode = 1;
} finally {
  killHard();
  if (electronProc?.pid) await sleep(800); // 给 SIGKILL 留落点
  if (tmpUserData) {
    try {
      rmSync(tmpUserData, { recursive: true, force: true });
    } catch {}
  }
}
