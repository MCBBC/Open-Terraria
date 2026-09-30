// BJ416 窄屏背包成就卡/防御盾/设置钮簇取证探针(一次性)。
// 用法: SW_ORIGIN=http://localhost:5520 node tools/run-diag.mjs scripts/_bj416-narrow-inv.mjs [pre|post] [场景串]
//   ★run-diag 子进程 argv = [exec, runner, --_child, target, ...args]——arg 解析取末参。
// 场景串缺省 "1280x800,900x900,800x800,800x600";可选增量 "900x900+heart" = 恶魔心槽显隐附加。
// 输出: /tmp/bj416-<tag>-<w>x<h>.png + /tmp/bj416-<tag>.json
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const A = process.argv.slice(4);
const tag = (A.find((a) => a === 'pre' || a === 'post')) || 'pre';
const sceneArg = A.find((a) => /\d+x\d+/.test(a));
const viewports = (sceneArg || '1280x800,900x900,800x800,800x600').split(',').map((s) => {
  const [w, h] = s.split(/[x+]/);
  return { w: +w, h: +h, heart: s.includes('+heart'), master: s.includes('+master') };
});
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const out = [];
for (const vp of viewports) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: vp.w, height: vp.h } });
  console.log(`[${vp.w}x${vp.h}] browser up`);
  const page = await browser.newPage();
  let booted = null;
  for (let att = 0; att < 6 && !booted; att++) {
    try {
      await page.goto(`${ORIGIN}/?play=small&swperf=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      booted = 'yes';
    } catch (e) { console.log(`[${vp.w}x${vp.h}] goto retry: ${String(e?.message || e).slice(0, 80)}`); await new Promise((r) => setTimeout(r, 2500)); }
  }
  if (!booted) { out.push({ vp, error: 'goto failed' }); await page.close(); await browser.close(); continue; }
  const res = await page.evaluate(async (heart) => {
    const t0 = Date.now();
    while (!window.__swGame?.player && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 400));
    if (!window.__swGame?.player) return { error: 'no game' };
    while (!window.__swUI && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 300));
    const ui = window.__swUI;
    if (!ui) return { error: 'no ui' };
    if (heart) {
      // 恶魔心槽显隐:直接喂专家旗不可行——extraSlotShown 门=解锁∨占格;给 armor[8] 塞一件饰品
      const g = window.__swGame;
      const def = g.player.inv.armor;
      if (def[8] && def[8].id === 0) { /* 空格:造一件恶魔心饰品等效物(任意 accessory) */ }
    }
    window.__swUI.openInventory(true);
    await new Promise((r) => setTimeout(r, 400));
    // 欢迎覆层 ack 摘除(未 ack 覆层会盖住背包截图;ack 钮=永久 localStorage,探针重复跑需 active 摘)
    const ack = document.querySelector('#sw-welcome-announce button:last-of-type');
    document.getElementById('sw-welcome-announce')?.remove();
    void ack;
    await new Promise((r) => setTimeout(r, 400));
    const root = document.querySelector('.sw-vinv');
    if (!root) return { error: 'no .sw-vinv' };
    const tr = getComputedStyle(root).transform;
    let K = 1;
    if (tr && tr !== 'none') { const m = tr.match(/matrix\(([^,]+),/); if (m) K = parseFloat(m[1]); }
    const logical = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { x: +(r.x / K).toFixed(2), y: +(r.y / K).toFixed(2), w: +(r.width / K).toFixed(2), h: +(r.height / K).toFixed(2), display: cs.display };
    };
    const advisorCard = root.querySelector('.sw-ach-advisor');
    const advisorWrap = advisorCard?.parentElement;
    const defense = root.querySelector('[data-role="defense"]');
    const settings = root.querySelector('button.vinv-txt');
    return {
      K,
      advisor: logical(advisorWrap),
      advisorCard: logical(advisorCard),
      defense: logical(defense),
      settings: logical(settings),
      minimapStyle: window.__swGame.renderer.mapStyle,
      fullscreenMap: window.__swGame.mapFullscreen?.(),
    };
  }, vp.heart);
  await page.screenshot({ path: `/tmp/bj416-${tag}-${vp.w}x${vp.h}.png` });
  out.push({ vp: `${vp.w}x${vp.h}${vp.heart ? '+heart' : ''}`, ...res });
  await page.close();
  await browser.close();
}
const fs = await import('node:fs');
fs.writeFileSync(`/tmp/bj416-${tag}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
