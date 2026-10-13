// j 循环门链重演统计（SolidTile/CanHit 通过率）
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: 'bj669g', size: 'small' });
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
});
await page.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { lightningAuraCanHitFrom } = await import('/src/entities/MinionProj.ts');
  const p = g.player;
  const sentry = new MinionProj(p.cx + 40, p.cy + 20, 688, 10, 0, true, 0, false, () => g.player);
  g.entities.add(sentry, 'projectiles');
  window.__replay = { lightningAuraCanHitFrom, sentry };
});
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const { lightningAuraCanHitFrom, sentry } = window.__replay;
  const g = window.__swGame;
  const st = g.world.store;
  const cx = sentry.cx, fieldCy = sentry.auraCy, side = sentry.auraSide;
  const arcR = (side - 40) / 2;
  const anchorY = sentry.y + 40;
  let total = 0, nUx = 0, nSolid = 0, nCanHit = 0, nPass = 0, up = 0, down = 0;
  for (let i = 0; i < 4000; i++) {
    total++;
    const ang = Math.random() * Math.PI * 2;
    const ux = Math.cos(ang), uy = Math.sin(ang);
    if (Math.abs(ux) < 0.12) continue;
    nUx++;
    const tx2 = cx + ux * arcR, ty2 = fieldCy + uy * arcR;
    const txc = Math.floor(tx2 / 16), tyc = Math.floor(ty2 / 16);
    if (st.isSolid(txc, tyc)) { nSolid++; if (uy < 0) up++; else down++; continue; }
    if (!lightningAuraCanHitFrom(st, cx, fieldCy - side / 2 + 20, tx2, ty2)) { nCanHit++; continue; }
    nPass++;
  }
  return { side, arcR, anchorY, fieldCy, total, nUx, nSolid, nCanHit, nPass, solidUp: up, solidDown: down };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
