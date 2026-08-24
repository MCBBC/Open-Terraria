// 负缓存限时重试·端到端（2026-08-24）：注入首次 fetch 失败 → 合成回退 + failed
// → 15s 窗口后自动重载 → 死亡音恢复真声
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
// 首个 NPC_Killed_31.wav 请求注入失败（模拟 SW cache-miss + 网络抖动）
await page.evaluateOnNewDocument(() => {
  const orig = window.fetch.bind(window);
  let failedOnce = false;
  window.fetch = (input, init) => {
    const url = String(input);
    if (!failedOnce && url.includes('NPC_Killed_31.wav')) {
      failedOnce = true;
      return Promise.reject(new TypeError('simulated network failure'));
    }
    return orig(input, init);
  };
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const log = [];
  const origWav = g.sfx.playWavFile.bind(g.sfx);
  g.sfx.playWavFile = function (file, vol, x, y, pitch, replace) {
    const r = origWav(file, vol, x, y, pitch, replace);
    if (String(file).includes('Killed_31')) log.push({ phase: 'wav', ok: r, t: Math.round(performance.now()) });
    return r;
  };
  const origPlay = g.sfx.play.bind(g.sfx);
  g.sfx.play = function (name, vol, x, y) {
    if (String(name) === 'hit') log.push({ phase: 'synth-fallback', t: Math.round(performance.now()) });
    return origPlay(name, vol, x, y);
  };
  const kill = async () => {
    g.debugSpawnNpc(61, 1, false);
    await wait(2200);   // 预热窗口
    const v = (g.entities.enemies ?? []).find(e => e.vanillaId === 61 && !e.dead);
    if (v) v.hurt(9999, 0, 0, g, 0, false, 1);
    await wait(300);
  };
  await kill();                       // ① 首杀：fetch 已被注入失败 → 合成回退
  const failedAfter1 = g.sfx.failed.has('NPC_Killed_31');
  await wait(15500);                  // ② 过 15s 重试窗口
  const failedAfterWait = g.sfx.failed.has('NPC_Killed_31');
  await kill();                       // ③ 再杀：应重载成功 → 真声
  return { log, failedAfter1, failedAfterWait, bufReady: g.sfx.buffers.has('NPC_Killed_31') };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
const l = out.log;
const firstIsSynth = l.some(e => e.phase === 'synth-fallback');
const lastIsWavOk = l.filter(e => e.phase === 'wav').slice(-1)[0]?.ok === true;
// failedAfterWait 允许 true（惰性过期：过期条目等下次 ensureBuffer 查询才物理清除，行为已由 lastIsWavOk 验证）
process.exit(errors.length || !(firstIsSynth && lastIsWavOk && out.failedAfter1 && out.bufReady) ? 1 : 0);
