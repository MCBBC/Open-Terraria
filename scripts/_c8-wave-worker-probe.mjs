// ★C8 波场注入验证：双模式对照,readGridR 非中性计数（注入致扰动）
//
// 修复案(2026-09-23,旧版三缺陷):
//  ① URL 旗拼成路径段(缺 ?) → 分模式显式 URL:worker=`?waveworker=1&pbust=`,main=`?pbust=`
//     (旧版两模式都打 waveworker=1,main 臂从未成立);
//  ② 传送后相机未移 → injectEntity 屏幕盒剔除把屏外注入全剔 → 改用探针库
//     teleport(page,wx,wy)(自带 camera 直写吸附);
//  ③ wash 强度 ∝ 速度(num3=0.05·√vel,静止湿玩家 washShapeValue flow=0 返 0)、
//     updateWaterWaves 在渲染帧侧(fixedUpdate 泵不触发) → 场景改为:最长水域 run
//     中点传送 + 键盘左右振荡 + 真实 rAF 帧等待(worker 消息往返需真实帧循环)。
import { launchBrowser, openPage, bootstrap, createGame, teleport, nextFrame, waitForBridge } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});

async function probe(tag, flag) {
  const page = await openPage(browser, {});
  const warns = [];
  page.on('console', (m) => {
    const t = m.text?.() ?? '';
    if (/WaveWaves|waveworker/i.test(t) || m.type?.() === 'error') warns.push(`[${m.type?.()}]` + t.slice(0, 200));
  });
  page.on('pageerror', (e) => warns.push('[pageerror]' + String(e?.message ?? e).slice(0, 200)));
  // ★修①:旗必须在 ? 后;双模式各自导航(main 臂无旗=原路径)
  const url = flag ? `${ORIGIN}/?waveworker=1&pbust=${Date.now()}` : `${ORIGIN}/?pbust=${Date.now()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const boot = await bootstrap(page, ORIGIN);
  // 首臂冷启动 flake(本机实测:冷臂桥等 >180s 偶发,与旗无关——热身后必过):重试一次
  const boot2 = boot.ok ? boot : await bootstrap(page, ORIGIN);
  if (!boot2.ok) {
    const st = await page.evaluate(() => ({
      href: location.href, flow: typeof window.__swFlow, ready: document.readyState,
      scripts: document.querySelectorAll('script').length,
    })).catch((e) => ({ evalErr: String(e).slice(0, 120) }));
    console.log(`[${tag}] bootstrap FAIL:`, boot2.why, JSON.stringify(st), 'warns=', JSON.stringify(warns.slice(0, 12)));
    await page.close(); return null;
  }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  if (!gen.ok) { console.log(`[${tag}] createGame FAIL:`, gen.why); await page.close(); return null; }

  // ★修②③:扫出生区附近最长横向 liquid run(run≥12,格本体与头顶非实心=可游),
  //   取 run 中点 teleport(库函数自带相机吸附)
  const spot = await page.evaluate(() => {
    const g = window.__swGame; const w = g.world; const st = w.store;
    const py0 = Math.floor(g.player.y / 16);
    const tyLo = Math.max(1, py0 - 60), tyHi = Math.min(w.h - 2, py0 + 220);
    let best = null;
    for (let ty = tyLo; ty <= tyHi; ty++) {
      let run = 0;
      for (let tx = 1; tx < w.w - 1; tx++) {
        if (st.liquid[st.idx(tx, ty)] > 0 && !st.isSolid(tx, ty) && !st.isSolid(tx, ty - 1)) { run++; continue; }
        if (run >= 12 && (!best || run > best.run)) best = { run, tx: tx - ((run / 2) | 0), ty };
        run = 0;
      }
      if (run >= 12 && (!best || run > best.run)) best = { run, tx: (w.w - 1) - ((run / 2) | 0), ty };
    }
    if (!best) return null;
    return { ...best, sx: Math.floor(g.player.x / 16), sy: py0 };
  });
  if (!spot) { console.log(`[${tag}] 无可游水域(run<12)`); await page.close(); return null; }
  const moved = await teleport(page, spot.tx * 16, spot.ty * 16 - 8);   // ★相机吸附内置
  if (!moved) { console.log(`[${tag}] teleport FAIL`); await page.close(); return null; }

  // ★修③:6 腿键盘振荡(~3.3s 真实渲染帧)——玩家恒湿且移动 → wash+涟漪持续注入;
  //   真实帧循环推进 updateWaterWaves + worker 消息往返
  for (let leg = 0; leg < 6; leg++) {
    const key = leg % 2 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    const until = Date.now() + 550;
    while (Date.now() < until) await nextFrame(page);
    await page.keyboard.up(key);
  }

  const r = await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => {
    const ww = m.waterWaves;
    const R = ww.readGridR();
    let nonNeutral = 0, maxd = 0;
    for (let i = 0; i < R.length; i++) { const dd = Math.abs(R[i] - 0.5); if (dd > 0.002) nonNeutral++; if (dd > maxd) maxd = dd; }
    const g = window.__swGame; const st = g.world.store;
    const ptx = Math.floor(g.player.x / 16), pty = Math.floor(g.player.y / 16);
    return {
      quality: ww.quality, gW: ww.gridW(), gH: ww.gridH(), nonNeutral, maxd: +maxd.toFixed(4),
      player: {
        tx: ptx, ty: pty, liquidHere: st.liquid[st.idx(ptx, pty)],
        wet: !!(g.player.wetSticky || g.player.inWater), wetCount: g.player.wetCount,
        vx: +Number(g.player.vx).toFixed(2),
      },
      stat: m.wwWorkerStats(),
    };
  }));
  r.spot = spot; r.warns = warns;
  console.log(`[${tag}]`, JSON.stringify(r));
  await page.close();
  return r;
}

// 预热导航:会话首臂要承担 SW 注册+资产管线首次灌库(实测桥等可 >180s,与旗无关)
// ——预热页只等桥不建世界,双臂都吃热缓存再跑。
{
  const page = await openPage(browser, {});
  await page.goto(`${ORIGIN}/?pbust=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await waitForBridge(page, { timeout: 300_000 }).catch(() => {});
  await page.close();
}
const M = await probe('main', false);
const W = await probe('worker', true);
await browser.close();
console.log('--- 判读 ---');
if (W && M) {
  const injAttempted = (s) => s.stat.washQ + s.stat.rippleQ;
  if (W.nonNeutral > 0 && M.nonNeutral > 0) {
    console.log(`worker=${W.nonNeutral} main=${M.nonNeutral} 双正 → C8 协议成立(${W.warns.length ? '注意 warns:' + W.warns.join('|') : '无回落告警'})`);
  } else if (W.nonNeutral === 0 && M.nonNeutral > 0) {
    console.log(`worker=0(main=${M.nonNeutral}) 且 worker 侧 washQ+rippleQ=${injAttempted(W)} posted=${W.stat.posted} fields=${W.stat.fields}` +
      ` → ${injAttempted(W) > 0 ? '注入已被 capture 吞但从未 postMessage/回传=C8 协议断链实锤' : 'worker 模式下零注入尝试=场景失效(另查)'}`);
  } else if (M.nonNeutral === 0 && injAttempted(M) === 0) {
    console.log(`双模式 nonNeutral=0 且 main 臂 washQ+rippleQ=0 → 主线程注入链在该场景失效(玩家 wet=${M.player.wet} wetCount=${M.player.wetCount} liquidHere=${M.player.liquidHere})=独立案`);
  } else {
    console.log(`worker=${W.nonNeutral} main=${M.nonNeutral} → 见原始数据人工判读`);
  }
} else {
  console.log('存在模式未跑完,见上方 FAIL 行');
}
process.exit(0);
