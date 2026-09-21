// ★BJ245 聚焦补拍：仪式环可见性取证（主探针相机钉未生效的根因排查面）。
// 玩家直接落到邪教徒旁（相机跟随=天然钉相）+ zoom3 + ensureVImage('Extra_30')
// 命中计数（画路径真跑证据）+ 双相位截图。
import { launchBrowser, openPage, bootstrap, createGame, godMode, freezeClock,
  teleport, front, pump, saveCanvasShot, resolveShotPath, saveJson, ledger }
  from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
const errors = [];
const page = await openPage(browser, { errors });
try {
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot?.ok !== false, JSON.stringify(boot ?? {}));
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('世界已建', gen.ok);
  await godMode(page, true);
  await freezeClock(page, { tod: 0.5 });
  await pump(page, 5);

  // 生成邪教徒（离玩家 300px，平地）+ 钉仪式态
  const cult = await page.evaluate(async () => {
    const g = window.__swGame;
    const meta = await window.__swFlow.spawnVanillaEnemy(439, g.player.cx + 300, g.player.cy - 16);
    if (!meta) return { ok: false, why: 'spawn-failed' };
    const e = (g.entities.enemies ?? []).find((n) => n.id === meta.id);
    if (!e) return { ok: false, why: 'no-ref' };
    e.ai0 = 5; e.ai1 = 15; e.spawnAlpha = 0; e.iframes = 2; e.vx = 0; e.vy = 0;
    e.__px = e.cx; e.__py = e.cy;
    // ★ai0/ai1 用访问器拦截冻结——pump() 同步步进不经 rAF,赋值式钉会被 AI 内
    // ai1+=1 自由推进到 30（ ritual circle 490 提前落地,首跑已证）。
    const phase = () => window.__bj245Phase ?? 15;
    Object.defineProperty(e, 'ai0', { get: () => 5, set: () => {} });
    Object.defineProperty(e, 'ai1', { get: phase, set: () => {} });
    Object.defineProperty(e, 'spawnAlpha', { get: () => 0, set: () => {} });
    const loop = () => {
      const c = window.__bj245Cult;
      if (c) {
        c.iframes = 2;
        c.x = c.__px - c.w / 2; c.y = c.__py - c.h / 2; c.vx = 0; c.vy = 0;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.__bj245Cult = e;
    // Extra_30 命中计数（drawCultistGhosts/drawCultistRitualRing 活画路径证据）
    const hits = { n: 0 };
    const orig = g.atlas.ensureVImage.bind(g.atlas);
    g.atlas.ensureVImage = (file) => {
      if (String(file).includes('Extra_30')) hits.n++;
      return orig(file);
    };
    window.__bj245Hits = hits;
    return { ok: true, id: meta.id, cx: e.cx, cy: e.cy };
  });
  L.chk('439 生成+钉态', cult.ok, JSON.stringify(cult));
  await pump(page, 25);                                  // Extra_30 懒加载窗

  // 玩家落 cultist 旁（相机跟随=同框）+ zoom3——用【实时位】（钉位循环已冻结其坐标）
  await pump(page, 3);
  const live = await page.evaluate(() => ({ x: window.__bj245Cult.cx, y: window.__bj245Cult.cy }));
  await teleport(page, live.x - 60, live.y, { snapCamera: true, zeroVel: true });
  await page.evaluate(() => {
    const g = window.__swGame;
    g.camera.zoom = 2; g.camera.zoomTarget = 2;
    const loop = () => {
      const cam = window.__swGame?.camera;
      if (cam) { cam.zoom = 2; cam.zoomTarget = 2; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await pump(page, 20);
  await saveCanvasShot(page, resolveShotPath('bj245-ring-focus-ai1-15'));
  const mid = await page.evaluate(() => {
    const c = window.__bj245Cult, g = window.__swGame;
    const [sx, sy] = g.camera.worldToScreen(c.cx, c.cy);
    return { hits: window.__bj245Hits.n, ai1: c.ai1, zoom: g.camera.zoom,
      cult: { x: c.cx, y: c.cy, dead: c.dead, sx: Math.round(sx), sy: Math.round(sy) },
      cam: { x: g.camera.x, y: g.camera.y },
      player: { x: g.player.cx, y: g.player.cy } };
  });
  L.chk('Extra_30 ensureVImage 命中>0（环画路径在跑）', mid.hits > 0, JSON.stringify(mid));
  await page.evaluate(() => { window.__bj245Phase = 22; });
  await pump(page, 12);
  await saveCanvasShot(page, resolveShotPath('bj245-ring-focus-ai1-22'));
  const fin = await page.evaluate(() => ({ hits: window.__bj245Hits.n, ai1: window.__bj245Cult.ai1 }));
  L.chk('第二相位后命中增长', fin.hits > mid.hits, JSON.stringify(fin));
  // ---- 像素差分取证：环开（ai0=5,ai1=16 半径 37）vs 环关（ai0=4 门跳过）——
  // 差分像素局限在【本体盒外】（环半径 37 > 本体半宽 12+2px 余量）=环真身。
  const diff = await page.evaluate(() => {
    const g = window.__swGame;
    const c = window.__bj245Cult;
    const cv = g.renderer.canvas;
    const [sx, sy] = g.camera.worldToScreen(c.cx, c.cy);
    const R = 110;   // 覆盖半径 37×zoom2+贴图半高 32×2
    const x0 = Math.max(0, Math.round(sx - R)), y0 = Math.max(0, Math.round(sy - R));
    const w = Math.min(cv.width - x0, 2 * R), h = Math.min(cv.height - y0, 2 * R);
    const grab = () => {
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const ctx2 = c2.getContext('2d', { willReadFrequently: true });
      ctx2.drawImage(cv, x0, y0, w, h, 0, 0, w, h);
      return ctx2.getImageData(0, 0, w, h).data;
    };
    const a = grab();
    // 环关：ai0 访问器改 4（门跳过;本体帧机状态 4=等待态,帧面在盒内,盒外应零差）
    Object.defineProperty(c, 'ai0', { get: () => 4, set: () => {} });
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const b = grab();
      Object.defineProperty(c, 'ai0', { get: () => 5, set: () => {} });
      // 本体盒（世界 24×50,zoom2,屏心 sy 对应 cult 中心）
      const bw = Math.round(c.w * g.camera.zoom) + 6, bh = Math.round(c.h * g.camera.zoom) + 6;
      const bx0 = Math.round(sx - bw / 2) - x0, by0 = Math.round(sy - bh / 2) - y0;
      let out = 0, inb = 0;
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const inBody = xx >= bx0 && xx < bx0 + bw && yy >= by0 && yy < by0 + bh;
          const i = (yy * w + xx) * 4;
          const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
          if (d > 24) { if (inBody) inb++; else out++; }
        }
      }
      res({ out, inb, w, h });
    })));
  });
  L.chk('环像素差分（盒外差分>80=环真身可见;盒内差分=本体帧面不计）',
    diff.out > 80, JSON.stringify(diff));
  L.chk('零 pageerror', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
  saveJson(`${process.env.SW_PROBE_OUT ?? '/tmp/probe-out'}/bj245-ring-focus.json`, { cult, mid, fin });
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
