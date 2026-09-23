// ★C9 光照 Worker 浏览器探针（?lightworker=1）:完整消息回路验证。
// 双臂对照:worker 臂(旗开)应满足 posted>0/results>0/falls=0 且引擎公共面光照非平凡
// (天空光/点光产出);main 臂(旗关)应 on=false 零分叉。另有相机移动(teleport)触发
// 区域迁移后的续跑验证。混沌类分歧(C8 判例)不在本探针断言范围。
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});

async function probe(tag, flag) {
  const page = await openPage(browser, {});
  const warns = [];
  page.on('console', (m) => {
    const t = m.text?.() ?? '';
    if (/LightWorker|lightworker/i.test(t) || m.type?.() === 'error') warns.push(`[${m.type?.()}]` + t.slice(0, 200));
  });
  page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 200)));
  const url = flag ? `${ORIGIN}/?lightworker=1&pbust=${Date.now()}` : `${ORIGIN}/?pbust=${Date.now()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const boot = await bootstrap(page, ORIGIN);
  const boot2 = boot.ok ? boot : await bootstrap(page, ORIGIN);
  if (!boot2.ok) { console.log(`[${tag}] bootstrap FAIL:`, boot2.why, 'warns=', JSON.stringify(warns.slice(0, 8))); await page.close(); return null; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) { console.log(`[${tag}] createGame FAIL:`, gen.why); await page.close(); return null; }

  // 跑 ~45 真实渲染帧(worker 消息往返 + warmup→live 切换)
  for (let i = 0; i < 45; i++) await nextFrame(page);
  const r1 = await page.evaluate(async () => {
    const lw = await import('/src/lighting/LightWorkerLink.ts');
    const g = window.__swGame; const L = g.lighting;
    const nonzero = (a) => { let n = 0, mx = 0; for (let i = 0; i < a.length; i++) { if (a[i] > 0) n++; if (a[i] > mx) mx = a[i]; } return { n, mx }; };
    const ptx = Math.floor(g.player.x / 16), pty = Math.floor(g.player.y / 16);
    return {
      stat: lw.lightWorkerStats(),
      region: { rx: L.rx, ry: L.ry, rw: L.rw, rh: L.rh, len: L.r.length },
      nz: nonzero(L.r), nzG: nonzero(L.g), nzB: nonzero(L.b),
      at: { player: L.lightAt(ptx, pty), sky: L.lightAt(ptx, Math.max(0, pty - 40)), deep: L.lightAt(ptx, Math.min(g.world.h - 1, pty + 120)) },
      perFrameCount: L.perFrameCount,
    };
  }).catch((e) => ({ evalErr: String(e).slice(0, 160) }));

  // 相机迁移:远处传送 → 区域重算 → worker 续跑 30 帧
  const w = await page.evaluate(() => { const g = window.__swGame; return { w: g.world.w, h: g.world.h }; });
  await teleport(page, Math.floor(w.w / 2) * 16, Math.floor(w.h * 0.4) * 16);
  for (let i = 0; i < 30; i++) await nextFrame(page);
  const r2 = await page.evaluate(async () => {
    const lw = await import('/src/lighting/LightWorkerLink.ts');
    const g = window.__swGame; const L = g.lighting;
    let n = 0, mx = 0;
    for (let i = 0; i < L.r.length; i++) { if (L.r[i] > 0) n++; if (L.r[i] > mx) mx = L.r[i]; }
    return { stat: lw.lightWorkerStats(), region: { rx: L.rx, ry: L.ry, rw: L.rw, rh: L.rh }, nzR: { n, mx } };
  }).catch((e) => ({ evalErr: String(e).slice(0, 160) }));

  console.log(`[${tag}] 首段=`, JSON.stringify(r1));
  console.log(`[${tag}] 迁移后=`, JSON.stringify(r2));
  console.log(`[${tag}] warns=`, JSON.stringify(warns.slice(0, 10)));
  await page.close();
  return { r1, r2, warns };
}

// ★预热臂（探针框架已知 flake:C8 注释「冷臂桥等 >180s 偶发,热身后必过」——三连跑
//  实锤首臂必中、与旗无关）:弃用页烧暖浏览器+模块图后,真双臂再跑。
async function warmup() {
  const page = await openPage(browser, {});
  const boot = await bootstrap(page, ORIGIN);
  console.log('[warmup] boot=', boot.ok);
  await page.close().catch(() => {});
}
await warmup();

const mainArm = await probe('main', false);
const workerArm = await probe('worker', true);
const ok = workerArm && mainArm
  && workerArm.r1?.stat?.on === true && workerArm.r1.stat.posted > 0 && workerArm.r1.stat.results > 0
  && workerArm.r1.stat.falls === 0 && workerArm.r2?.stat?.results > workerArm.r1.stat.results
  && workerArm.r1.nz?.n > 0 && workerArm.r1.region.len > 0
  && mainArm.r1?.stat?.on === false
  && workerArm.warns.length === 0;
console.log('[c9-probe]', ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
