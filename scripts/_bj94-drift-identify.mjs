// ★BJ94 诊断:全帧对拍残差点识别(移动 ~12×10px 斑点 @ y≈109-120)
// 假设:坠落星(fallen star)之类掉落物/小动物在冻结钟下仍逐帧漂移——
// 若 drops/critters 屏幕坐标落在差分 bbox 域内 = 源识别成立(与 flag 无关的本底漂)。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj94-drift-identify.mjs
import { launchBrowser, openPage, bootstrap, createGame, teleport, pump, ledger, front } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: process.env.SW_SEED || '05162020', size: process.env.SW_SIZE || 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__T0 = 8_640_000_000;
    performance.now = () => window.__T0;
    Date.now = () => window.__T0;
    let s = 0xb177 >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const w = g.world.weather;
    if (w) { try { w.maxRaining = 0; w.raining = false; w.windSpeedCurrent = 0; } catch { /* */ } }
    for (const k of ['critters', 'props', 'enemies', 'drops', 'projectiles']) {
      const b = g.entities?.[k];
      if (Array.isArray(b)) b.length = 0;
    }
    window.__R = (tick) => {
      s = 0xb177 >>> 0;
      const t = g.renderer.animTick;
      g.renderer.animTick = tick;
      g.render();
      g.renderer.animTick = t;
    };
    window.__SNAP = () => {
      const g2 = window.__swGame;
      const cam = g2.camera;
      const ent = (arr, tag) => (arr ?? []).filter((e) => e && !e.dead).slice(0, 8).map((e) => ({
        tag, vid: e.vanillaId ?? e.dropId ?? e.id ?? null,
        sx: Math.round((e.x - cam.x) * (cam.zoom || 1)),
        sy: Math.round((e.y - cam.y) * (cam.zoom || 1)),
        vx: e.vx, vy: e.vy,
      }));
      return [
        ...ent(g2.entities.drops, 'drop'),
        ...ent(g2.entities.critters, 'critter'),
        ...ent(g2.entities.props, 'prop'),
        ...ent(g2.entities.projectiles, 'proj'),
        ...ent(g2.entities.enemies, 'enemy'),
      ];
    };
  });
  await front(page);
  const s = await page.evaluate(() => {
    const g = window.__swGame; const st = g.world.store; const gl = g.world.groundLevel;
    const x = Math.min(st.w - 40, Math.floor(g.player.cx / 16) + 60);
    return { wx: x * 16, wy: (gl - 4) * 16 };
  });
  await teleport(page, s.wx, s.wy);
  await pump(page, 30, { clearEnemies: true });
  await page.evaluate(() => { window.__warm = window.__swGame.renderer.animTick + 9; });
  for (let i = 0; i < 900; i++) await page.evaluate(() => { window.__R(++window.__warm); });
  // 连续 6 手动帧:每帧 dump 实体屏幕位(找移动斑点)
  for (let f = 0; f < 6; f++) {
    const ents = await page.evaluate(() => { window.__R(++window.__warm); return window.__SNAP(); });
    L.say(`frame ${f}: ${JSON.stringify(ents)}`);
  }
  L.say('identify-done');
  process.exit(L.exitCode());
} finally {
  await browser.close();
}
