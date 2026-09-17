// BJ109 落刀批收官探针（A/C/D/E/F/G/H/I 全链）：自然态全链 + F6 直召场景 + 阴性测。
// A=zone 无事件门（事件态+F6 态都应刷月柱小怪；远离 4000px 外零刷）
// D=塔心 x=tx*16（cx%16===0；旧 +8 时恒 ≡8）
// G=护盾泡泡 / H=glow 呼吸 / I=FilterTower 染色 —— 截图证据 + 产位状态断言
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const LUNAR_SET = new Set([402, 405, 406, 407, 409, 411, 412, 413, 414, 415, 416, 417, 418, 419, 420, 421, 423, 424, 425, 426, 427, 428, 429, 518, 519]);

async function boot(browser, tag) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* noop */ }
  });
  await page.goto(ORIGIN + '/?play=small&' + tag + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 1500));
  return { page, errors };
}

function placeOnGround(g, cxPx) {
  const st = g.world.store;
  const tx = Math.max(4, Math.min(st.w - 5, Math.floor(cxPx / 16)));
  for (let y = 20; y < st.h - 20; y++) {
    if (st.isSolid(tx, y) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2) && !st.isSolid(tx, y - 3)) {
      g.player.x = tx * 16 - g.player.w / 2;
      g.player.y = (y - 3) * 16 - g.player.h;
      g.player.vy = 0;
      return { tx, ty: y };
    }
  }
  return null;
}

function towerOf(g, id) {
  return [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === id).pop() ?? null;
}

async function sampleLunar(page, seconds, tag) {
  const seen = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) {
    const ids = await page.evaluate(() =>
      [...window.__swGame.entities.enemies]
        .filter((e) => !e.dead && e.vanillaId != null).map((e) => e.vanillaId));
    for (const id of ids) if (LUNAR_SET.has(id)) seen.add(id);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`[spawn-sample] ${tag}: lunarMinionKinds=${seen.size} ids=[${[...seen].sort((a, b) => a - b).join(',')}]`);
  return seen;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const out = { scene1: {}, scene2: {}, scene3: {} };

try {
  // ---- 场景 1：自然态全链（事件激活路径） ----
  {
    const { page, errors } = await boot(browser, 'bj109f1');
    await page.evaluate(() => {
      const g = window.__swGame;
      g.triggerLunarApocalypse();   // WorldGen.TriggerLunarApocalypse（真塔落位路径）
    });
    await new Promise((r) => setTimeout(r, 1500));
    const s1 = await page.evaluate(() => {
      const g = window.__swGame;
      const towers = [517, 422, 507, 493].map((id) => {
        const t = [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === id).pop();
        return t ? { id, cx: t.cx, cxMod16: ((t.cx % 16) + 16) % 16, w: t.w } : { id, missing: true };
      });
      return { towers, active: g.world.lunarEvent.active, shieldSolar: g.world.lunarEvent.shield.solar };
    });
    out.scene1.towers = s1.towers;
    out.scene1.active = s1.active;
    out.scene1.d_centerX_mod16_all_zero = s1.towers.every((t) => t.missing || t.cxMod16 === 0);
    console.log('[scene1] towers:', JSON.stringify(s1.towers));
    console.log('[scene1] D 塔心 x≡0(mod16):', out.scene1.d_centerX_mod16_all_zero, ' active:', s1.active, ' shieldSolar:', s1.shieldSolar);
    // 玩家放日耀塔（517）正下方地表
    await page.evaluate(() => {
      const g = window.__swGame;
      const t = [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === 517).pop();
      const st = g.world.store;
      const tx = Math.max(4, Math.min(st.w - 5, Math.floor(t.cx / 16)));
      for (let y = 20; y < st.h - 20; y++) {
        if (st.isSolid(tx, y) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2) && !st.isSolid(tx, y - 3)) {
          g.player.x = tx * 16 - g.player.w / 2;
          g.player.y = (y - 3) * 16 - g.player.h;
          g.player.vy = 0;
          break;
        }
      }
    });
    await new Promise((r) => setTimeout(r, 2500));
    // I 产位态
    const filterState = await page.evaluate(() => {
      const g = window.__swGame;
      const r = g.renderer;
      const tgt = r._lunarTowerFilterTarget(r._frameEntities, g.player.cx, g.player.cy, g.world);
      return { tgt: tgt ? { key: tgt.key, x: tgt.x, y: tgt.y, shieldUp: tgt.shieldUp } : null, opacity: r._towerFilterOpacity };
    });
    out.scene1.filter = filterState;
    console.log('[scene1] I FilterTower 产位:', JSON.stringify(filterState));
    // 视觉证据（G 泡泡 / H glow 呼吸 / I 染色）：日耀塔搬到玩家旁（相机取景稳定,
    // _tower-glow-probe4 同款 canvas 采样）
    await page.evaluate(() => {
      const g = window.__swGame;
      const t = [...g.entities.enemies].filter((e) => !e.dead && e.vanillaId === 517).pop();
      t.x = g.player.cx + 60 - t.w / 2;
      t.y = g.player.cy - 40 - t.h / 2;
    });
    await new Promise((r) => setTimeout(r, 3000));
    const vis = await page.evaluate(() => {
      const g = window.__swGame;
      const t = [...g.entities.enemies].find((e) => e.vanillaId === 517 && !e.dead);
      if (!t) return null;
      const c1 = g.camera.worldToScreen(t.x, t.y), c2 = g.camera.worldToScreen(t.x + t.w, t.y + t.h);
      const cv = g.renderer.canvas, ctx = g.renderer.ctx;
      const B = 60;   // 泡/glow 带
      const x0 = Math.max(0, Math.floor(c1[0]) - B), y0 = Math.max(0, Math.floor(c1[1]) - B);
      const x1 = Math.min(cv.width, Math.ceil(c2[0]) + B), y1 = Math.min(cv.height, Math.ceil(c2[1]) + B);
      const bw = x1 - x0, bh = y1 - y0;
      const grab = () => {
        const d = ctx.getImageData(x0, y0, bw, bh).data;
        let sum = 0, n = 0, mx = 0;
        for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += v; n++; if (v > mx) mx = v; }
        return { mean: sum / n, max: mx };
      };
      const a = grab();
      // 远处对照区（画面左下角 80×80）
      const cd = ctx.getImageData(8, cv.height - 88, 80, 80).data;
      let cs = 0;
      for (let i = 0; i < cd.length; i += 4) cs += (cd[i] + cd[i + 1] + cd[i + 2]) / 3;
      const ctrl = cs / (80 * 80);
      return { bandA: a, ctrl, box: { x0, y0, bw, bh } };
    });
    await new Promise((r) => setTimeout(r, 400));
    const vis2 = await page.evaluate((box) => {
      const g = window.__swGame;
      const d = g.renderer.ctx.getImageData(box.x0, box.y0, box.bw, box.bh).data;
      let sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { sum += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }
      return sum / n;
    }, vis.box);
    out.scene1.bubbleBand = { meanA: vis.bandA.mean, max: vis.bandA.max, ctrl: vis.ctrl, meanB: vis2, breathDiff: Math.abs(vis2 - vis.bandA.mean) };
    console.log('[scene1] G/H 塔带亮度: A.mean=', vis.bandA.mean.toFixed(1), ' A.max=', vis.bandA.max, ' 对照区=', vis.ctrl.toFixed(1), ' B.mean=', vis2.toFixed(1), ' 呼吸差=', Math.abs(vis2 - vis.bandA.mean).toFixed(2));
    // 全页截图（载入提示应已退场）
    await page.screenshot({ path: '/tmp/bj109-final-scene1-full.png' });
    console.log('[scene1] 截图: /tmp/bj109-final-scene1-full.png');
    // A 事件态孵化采样 30s
    const seen = await sampleLunar(page, 30, 'scene1-event-active');
    out.scene1.lunarKinds = seen.size;
    console.log('[scene1] 页面错误:', errors.length);
    await page.close();
  }

  // ---- 场景 2：F6 直召（事件不激活）→ A 行为测 ----
  {
    const { page, errors } = await boot(browser, 'bj109f2');
    const pre = await page.evaluate(() => {
      const g = window.__swGame;
      g.debugSpawnNpc(517, 1, false);
      const t = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 517);
      t.x = g.player.cx + 300 - t.w / 2;
      const ground = (function () {
        const st = g.world.store;
        const tx = Math.max(4, Math.min(st.w - 5, Math.floor(g.player.cx / 16)));
        for (let y = 20; y < st.h - 20; y++) {
          if (st.isSolid(tx, y) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2) && !st.isSolid(tx, y - 3)) return y;
        }
        return null;
      })();
      if (ground) { g.player.y = (ground - 3) * 16 - g.player.h; g.player.vy = 0; }
      t.x = g.player.cx + 300 - t.w / 2;
      t.y = g.player.cy - 600 - t.h / 2;
      return { active: g.world.lunarEvent.active, dist: Math.hypot(t.cx - g.player.cx, t.cy - g.player.cy) };
    });
    console.log('[scene2] F6 召塔: active(应 false)=', pre.active, ' 距玩家=', Math.round(pre.dist));
    out.scene2.activeFalse = pre.active === false;
    const seen = await sampleLunar(page, 30, 'scene2-f6-no-event');
    out.scene2.lunarKinds = seen.size;
    out.scene2.a_behavior_pass = seen.size >= 1;
    console.log('[scene2] A 行为测(≥1 只月柱小怪):', out.scene2.a_behavior_pass, ' 页面错误:', errors.length);
    await page.close();
  }

  // ---- 场景 3：阴性测（塔同场,玩家 >4000px 外 → 零刷） ----
  {
    const { page, errors } = await boot(browser, 'bj109f3');
    const pre = await page.evaluate(() => {
      const g = window.__swGame;
      g.debugSpawnNpc(517, 1, false);
      const t = [...g.entities.enemies].reverse().find((e) => !e.dead && e.vanillaId === 517);
      t.x = g.player.cx - t.w / 2;
      t.y = g.player.cy - 600 - t.h / 2;
      // 玩家搬走 5000px（同高度带地表）
      const st = g.world.store;
      const tx = Math.max(4, Math.min(st.w - 5, Math.floor(g.player.cx / 16) + 320));
      for (let y = 20; y < st.h - 20; y++) {
        if (st.isSolid(tx, y) && !st.isSolid(tx, y - 1) && !st.isSolid(tx, y - 2) && !st.isSolid(tx, y - 3)) {
          g.player.x = tx * 16 - g.player.w / 2;
          g.player.y = (y - 3) * 16 - g.player.h;
          g.player.vy = 0;
          break;
        }
      }
      return { dist: Math.hypot(t.cx - g.player.cx, t.cy - g.player.cy), active: g.world.lunarEvent.active };
    });
    console.log('[scene3] 玩家距塔=', Math.round(pre.dist), '(>4000) active=', pre.active);
    out.scene3.distOver4000 = pre.dist > 4000;
    const seen = await sampleLunar(page, 14, 'scene3-negative-far');
    out.scene3.lunarKinds = seen.size;
    out.scene3.a_negative_pass = seen.size === 0;
    console.log('[scene3] A 阴性测(零刷):', out.scene3.a_negative_pass, ' 页面错误:', errors.length);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('[SUMMARY]', JSON.stringify(out));
