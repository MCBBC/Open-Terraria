// _mgcap-smoke —— MG 视频取景通道冒烟：进世界 → 钉钟 → 采几帧真实画面。
// 只读页面，不改任何 src；产物落 SW_PROBE_OUT。
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger, freezeClock, gotoApp, cleanStorage } from '../tools/probe/lib/index.mjs';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

const out = process.env.SW_PROBE_OUT || '/tmp/probe-out/_mgcap-smoke';
mkdirSync(out, { recursive: true });
const L = ledger();
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  const okNav = await gotoApp(page, process.env.SW_ORIGIN, { tries: 40 });
  L.chk('导航成功', okNav);
  const okBridge = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('桥就绪', !!okBridge);
  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 3000 });
  L.chk('世界已建', gen.ok, gen.why);
  if (gen.ok) {
    await pump(page, 60);
    const shots = [
      { name: 'world-day', tod: 'day' },
      { name: 'world-dusk', tod: 'dusk' },
      { name: 'world-night', tod: 'night' },
    ];
    for (const s of shots) {
      try { await freezeClock(page, { tod: s.tod }); } catch (e) { console.log('freeze fail', s.tod, e.message); }
      await pump(page, 30);
      const p = join(out, `${s.name}.png`);
      await page.screenshot({ path: p });
      console.log('shot ->', p);
    }
    const info = await page.evaluate(() => {
      const g = window.__swGame;
      return { w: g?.world?.width, h: g?.world?.height, seed: g?.world?.seed, zoom: g?.camera?.zoom, fps: g?.fps };
    });
    console.log('game info:', JSON.stringify(info));
  }
} finally {
  await browser.close();
}
process.exit(L.exitCode());
