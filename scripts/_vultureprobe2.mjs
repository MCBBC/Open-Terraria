// 真实沙漠世界秃鹫生成链探针:找地表沙面,以玩家视角跑 spawner.spawn(),
// 统计生成物的初始落点/1s 后状态(ai0/离地高度)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let ok = false;
for (let att = 0; att < 12 && !ok; att++) {
  try {
    await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const r = await page.evaluate(() => new Promise((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (window.__swGame?.player) {
          clearInterval(iv);
          const g = window.__swGame;
          const st = g.world.store;
          // 找一段地表沙面(列向下扫到首个实心=沙)
          let found = null;
          for (let x = 700; x < 4000 && !found; x += 7) {
            for (let y = Math.floor(g.world.groundLevel) - 60; y < g.world.groundLevel + 40; y++) {
              const t = st.type[st.idx(x, y)];
              if (st.flags[st.idx(x, y)] && t === 22 /* sand */) { found = { x, y }; break; }
            }
          }
          if (!found) { res('no-sand'); return; }
          g.player.x = found.x * 16; g.player.y = (found.y - 6) * 16;
          g.player.vx = 0; g.player.vy = 0;
          window.__found = found;
          res(JSON.stringify(found));
        } else if (Date.now() - t0 > 120000) { clearInterval(iv); res('timeout'); }
      }, 300);
    }));
    console.log('spot:', r);
    ok = r !== 'no-sand' && r !== 'timeout';
    if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }
  } catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
const r2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const { VanillaSpawner } = await import('/src/world/spawn/VanillaSpawner.ts');
  const { RNG } = await import('/src/core/rng.ts');
  const sp = new VanillaSpawner(g.world);
  sp.setPlayerFlags(false, false);
  const out = { vultures: [], others: {} };
  for (let k = 0; k < 600; k++) {
    const e = sp.spawn(g.player.cx, g.player.cy, new RNG(k * 104729 + 7), 40, 25);
    if (!e) continue;
    const id = e.vanillaId;
    if (id === 61) {
      out.vultures.push({ x: Math.round(e.x / 16), y: Math.round(e.y / 16), spawnY: sp.currentSpawnY, ai0: e.ai0 });
    } else {
      out.others[id] = (out.others[id] || 0) + 1;
    }
  }
  // 观察存活的秃鹫 2s(玩家原地不动 → 应保持栖息)
  await new Promise((r2) => setTimeout(r2, 2000));
  for (const e of window.__swGame.entities.enemies) {
    if (e.vanillaId === 61) {
      (out.vultures2 ??= []).push({ ai0: e.ai0, x: Math.round(e.x / 16), y: Math.round(e.y / 16), vy: +e.vy.toFixed(2), ground: e.onGround });
    }
  }
  return out;
});
console.log(JSON.stringify(r2).slice(0, 500));
await browser.close();
