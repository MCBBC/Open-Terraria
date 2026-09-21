// ★BJ236 GetAlpha 长尾续批实机探针——剑气 116（出生梯+脉动）/磁球 254（min(1,life/30)
// 加算白）/彩虹荧光棒 1089（FlickerClock 基色乘色 source-over×70/255）。
// 判据：
//  · 116: 子步龄 ramp 1..4→ga0 / 6→0.1 / 15→1(α=255) / 脉动 17 拍 225/255、25 拍 0、34 拍回 1
//  · 254: ga=1（life 900）→ life=15 → 0.5；drawImage 时点快照 op='lighter'
//  · 1089: 乘面 pass op='source-over' × ga=70/255、乘面为离屏 canvas（非原贴图）；
//    无钟回退档不触发（页面 r.lighting.clock 在位）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => {
  const g = window.__swGame;
  return g && g.player && g.renderer && g.world;
}, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  // 冻结时钟（Game.clock.tick 实例掩蔽——tools/probe/lib/clock.mjs 同式）
  const clock = g.world.clock;
  const tod0 = clock.timeOfDay;
  clock.tick = () => {};
  clock.timeOfDay = 0.5;
  document.querySelectorAll('button').forEach((b) => { if (/我已知晓/.test(b.textContent ?? '')) b.click(); });
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const { GlowstickProj } = await import('/src/entities/WeaponProj.ts');
  // drawImage 时点快照 spy ctx
  const mkSpy = () => {
    const recs = []; const snaps = [];
    let cur = null;
    const base = {
      canvas: g.renderer.canvas, save() { recs.push(cur = { op: 'source-over', alpha: 1, imgs: 0 }); },
      restore() { cur = null; }, drawImage() { if (cur) { cur.imgs++; snaps.push({ op: cur.op, alpha: cur.alpha }); } },
    };
    const skip = new Set(['save', 'restore', 'drawImage']);
    for (const m of ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'closePath', 'ellipse', 'setLineDash', 'translate', 'rotate', 'scale']) base[m] = () => {};
    const ctx = new Proxy(base, {
      get(t, k) {
        if (k === 'globalCompositeOperation' || k === 'globalAlpha') {
          return cur ? cur[k === 'globalCompositeOperation' ? 'op' : 'alpha'] : undefined;
        }
        return t[k];
      },
      set(t, k, v) {
        if (k === 'globalCompositeOperation' || k === 'globalAlpha') {
          if (cur) cur[k === 'globalCompositeOperation' ? 'op' : 'alpha'] = v;
          return true;
        }
        t[k] = v; return true;
      },
    });
    return { ctx, recs, snaps };
  };
  const px = g.player.cx, py = g.player.cy - 200;   // 玩家上方空中（避开 HOUSE 隐身盒）
  const step = (a, n) => { for (let i = 0; i < n; i++) a.fixedUpdate(1 / 60, g); };
  // 贴图预热（projSprite 懒加载,未就绪时 draw 走无图兜底=无 drawImage 快照）
  const { projSprite } = await import('/src/entities/Arrow.ts');
  projSprite(254); projSprite(1089);
  for (let i = 0; i < 40 && !(projSprite(254) && projSprite(1089)); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  // ---- 116 剑气（EU=0 → 1 子步/update;采样点=第 N 次 fixedUpdate 后）----
  const beam = new Arrow(px, py, 6, 0, 40, 1, 116, {});
  beam.noTileCollide = true; beam.ownerPlayer = g.player;
  g.entities.add(beam, 'projectiles');
  const ga = (o) => o.drawGlobalAlpha();
  const s116 = {};
  step(beam, 6); s116.u6 = +ga(beam).toFixed(4);
  step(beam, 8); s116.u14 = +ga(beam).toFixed(4);
  step(beam, 1); s116.u15 = ga(beam);
  step(beam, 1); s116.u16 = ga(beam); s116.scale16 = +beam.drawScale.toFixed(3);
  step(beam, 1); s116.u17 = +ga(beam).toFixed(4);
  step(beam, 8); s116.u25 = ga(beam);
  step(beam, 1); s116.u26 = +ga(beam).toFixed(4);
  step(beam, 8); s116.u34 = ga(beam);
  beam.dead = true;
  // ---- 254 磁球 ----
  const orb = new Arrow(px + 60, py, 0, 0, 10, 1, 254, {});
  orb.noTileCollide = true; orb.ownerPlayer = g.player;
  g.entities.add(orb, 'projectiles');
  const s254 = { life0: orb.life, ga: ga(orb) };
  const spy254 = mkSpy();
  orb.draw({ ctx: spy254.ctx }, {});
  s254.snap = spy254.snaps[0] ?? null;
  orb.life = 15; s254.ga15 = +ga(orb).toFixed(4);
  orb.dead = true;
  // ---- 1089 彩虹荧光棒（FlickerClock 基色乘色）----
  const clk = g.lighting?.clock ?? g.renderer.lighting?.clock;
  const disco = clk ? clk.discoColor() : null;
  const rb = new GlowstickProj(px - 60, py, 0, 0, 1089);
  g.entities.add(rb, 'projectiles');
  const spy1089 = mkSpy();
  rb.draw({ ctx: spy1089.ctx, lighting: { clock: clk } }, {});
  const s1089 = { disco, snap: spy1089.snaps[0] ?? null, snapN: spy1089.snaps.length };
  rb.dead = true;
  return { s116, s254, s1089, tod0 };
});
console.log('BJ236_PROBE=' + JSON.stringify(out, null, 1));
console.log('pageerrors:', errs.length ? errs.slice(0, 3) : 'none');
await browser.close().catch(() => {});
const ok = (() => {
  const { s116, s254, s1089 } = out;
  const c1 = s116.u6 === 0.1 && s116.u14 === 0.9 && s116.u15 === 1
    && s116.u16 === 1 && Math.abs(s116.scale16 - 0.98) < 1e-3 && Math.abs(s116.u17 - 225 / 255) < 1e-3
    && s116.u25 === 0 && Math.abs(s116.u26 - 30 / 255) < 1e-3 && s116.u34 === 1;
  const c2 = s254.life0 === 900 && s254.ga === 1 && s254.snap && s254.snap.op === 'lighter'
    && s254.snap.alpha === 1 && Math.abs(s254.ga15 - 0.5) < 1e-3;
  const c3 = s1089.snap && s1089.snap.op === 'source-over' && Math.abs(s1089.snap.alpha - 70 / 255) < 1e-3
    && Array.isArray(s1089.disco) && s1089.snapN >= 1;
  return c1 && c2 && c3;
})();
console.log('BJ236_VERDICT=' + (ok ? 'GREEN' : 'RED'));
process.exit(ok && errs.length === 0 ? 0 : 1);
