// ★E51 bosskeep:①boss 生命周期轨迹轮询(死因实证) ②钉位绘制面跑通验证。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=200000 scripts/_e51-bosskeep.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { spawnEnemy } from '../tools/probe/lib/entities.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const page = await openPage(await launchBrowser({ headless: true }), ORIGIN, { width: 1280, height: 800 });
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail', boot); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'e51x0', size: 'small', pinRandom: 20261006, log: () => {} });
console.log('createGame:', made?.ok);

const sp = await spawnEnemy(page, 636, 0, 0, (e, g) => { e.cx = g.player.cx + 280; e.cy = g.player.cy - 120; e.ai3 = 1; });
console.log('spawn:', JSON.stringify(sp));

// 轨迹轮询 5s
for (let i = 0; i < 10; i++) {
  await sleep(500);
  const st = await page.evaluate(() => {
    const g = window.__swGame;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e) return { gone: true };
    return { alive: !e.dead, hp: e.hp, maxHp: e.maxHp, ai3: e.ai3, cx: Math.round(e.cx), cy: Math.round(e.cy), spawnAlpha: e.spawnAlpha, despawnTimer: e.despawnTimer, justHit: e.justHit, active: e.active };
  });
  console.log(`t=${(i + 1) * 0.5}s:`, JSON.stringify(st));
  if (st.gone || st.alive === false) break;
}

// 钉位策略:每帧钉 ai3=1+位置+hp,验证绘制面(drawEmpress 计数+tintedSprite 计数)
const r = await page.evaluate(async () => {
  const TA = await import('/src/render/TintAtlas.ts');
  const C = globalThis.__e51 = { empress: 0, tinted: 0, allocs: 0, recycled: 0, bakeMiss: 0 };
  const ren = window.__swGame.renderer;
  const oEmp = ren.drawEmpress;
  ren.drawEmpress = function (e) { C.empress++; return oEmp.call(this, e); };
  const oTint = ren.tintedSprite;
  ren.tintedSprite = function (k, f, c) { C.tinted++; return oTint.call(this, k, f, c); };
  const taProto = TA.TintAtlas.prototype;
  const oAlloc = taProto.alloc;
  taProto.alloc = function (w, h) { const r = oAlloc.call(this, w, h); C.allocs++; if (r && r[3]) C.recycled++; return r; };
  const oBake = taProto.bake;
  taProto.bake = function (key, w, h, p) { const had = this.entries.has(key); const r = oBake.call(this, key, w, h, p); if (!had) C.bakeMiss++; return r; };
  globalThis.__e51Pin = setInterval(() => {
    const g = window.__swGame;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e || e.dead) {   // 死了就重生
      e && (e.dead = false);
      return;
    }
    e.ai3 = 1;
    e.cx = g.player.cx + 280; e.cy = g.player.cy - 120;
    e.hp = e.maxHp; e.despawnTimer = 750;
    if (e.vx !== undefined) { e.vx = 0; e.vy = 0; }
  }, 16);
  return true;
});
console.log('pin installed:', r);
await page.evaluate(() => { const C = globalThis.__e51; C.empress = 0; C.tinted = 0; C.allocs = 0; C.recycled = 0; C.bakeMiss = 0; });
await sleep(4000);
const c = await page.evaluate(() => globalThis.__e51);
console.log('4s 钉位窗口计数:', JSON.stringify(c));
await page.evaluate(() => clearInterval(globalThis.__e51Pin));
process.exit(0);
