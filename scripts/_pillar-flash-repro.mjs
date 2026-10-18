// ★四柱区远景云+山瞬闪消失复现探针 v2（2026-10-03）
//  v2 要点:
//  · CDP Page.startScreencast(fromSurface)=合成器闩到的【真实呈现帧】流——用户所见
//    的直接证据;node 侧 pngjs 流式解码,环缓冲 10 帧,异常判据命中即落盘。
//    判据:①全帧均亮<12(黑帧) ②与前一呈现帧像素差>25(层消失/出现边界)
//    ③HUD 均亮<8(顶层清屏态)。
//  · 场景修正:柱区锚 tile~180(surface-120),四柱+仆从 spawn 在界内。
//  · 逐 rAF 状态行+fixedUpdate 步计数包装+缩略图逐帧像素差(帧尾一致态)。
//  运行:SW_ORIGIN=http://localhost:5205 node tools/run-diag.mjs --timeout=280000 scripts/_pillar-flash-repro.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const PLR_PATH = process.env.SW_PLR || needInput(join(DOWNLOADS, 'Vinlic (1).plr'));
let plrB64 = '';
try { plrB64 = readFileSync(PLR_PATH).toString('base64'); } catch { console.log('plr not found, fallback zenith-only'); }

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
const FLAGS = process.env.SW_FLAGS || '';
const RUN_MS = Number(process.env.SW_RUN_MS || 100000);
const OUT = 'shots/pillarflash/';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({ headed: true, extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
console.log('browser up');
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().slice(0, 1).toUpperCase() + ' ' + m.text().slice(0, 220)); });

await bootstrap(page, ORIGIN + '/' + (FLAGS ? '?' + FLAGS + '&' : ''));
const gen = await createGame(page, { mode: 'direct', seed: '118606602', size: 'medium', pinRandom: 20261003 });
console.log('createGame:', gen?.ok, gen?.why ?? '');
if (!gen?.ok) { await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

// ---- CDP screencast:合成器真实呈现帧流 ----
const cdp = await page.target().createCDPSession();
const ring = [];            // { ts, png(Buffer), w, h, lum, black }
const saved = [];           // 落盘登记
let scStats = { n: 0, flagged: 0, black: 0, bigdiff: 0, saveErr: '' };
let prevLum = null, prevPx = null;
const W = 640;
let scSeq = 0;
const onFrame = async (ev) => {
  try {
    const wall = Date.now();
    const buf = Buffer.from(ev.data, 'base64');
    const png = PNG.sync.read(buf);
    const { width: w, height: h, data } = png;
    let sum = 0, dark = 0;
    const step = 4 * 3;   // 每第3像素
    let cnt = 0;
    for (let i = 0; i < data.length; i += step) {
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      sum += l; if (l < 10) dark++; cnt++;
    }
    const lum = sum / cnt;
    const darkRatio = dark / cnt;
    let bigdiff = 0;
    if (prevPx && prevPx.length === data.length) {
      let dsum = 0, dn = 0;
      for (let i = 0; i < data.length; i += 4 * 7) { dsum += Math.abs(data[i] - prevPx[i]) + Math.abs(data[i + 1] - prevPx[i + 1]) + Math.abs(data[i + 2] - prevPx[i + 2]); dn++; }
      bigdiff = dsum / dn / 3;
    }
    prevPx = data.slice();
    const flags = [];
    if (lum < 12) { flags.push('BLACK'); scStats.black++; }
    if (prevLum !== null && Math.abs(lum - prevLum) > 22) flags.push('LUMJUMP');
    if (bigdiff > 25) { flags.push('DIFF'); scStats.bigdiff++; }
    scSeq++;
    ring.push({ seq: scSeq, wall, w, h, lum: +lum.toFixed(1), dark: +darkRatio.toFixed(3), diff: +bigdiff.toFixed(1), flags, buf });
    if (ring.length > 12) ring.shift();
    if (flags.length) {
      scStats.flagged++;
      for (const f of ring) {
        const name = `${OUT}sc-${String(f.seq).padStart(6, '0')}.png`;
        if (!saved.find((s) => s.name === name)) {
          try { writeFileSync(name, f.buf); } catch (e) { scStats.saveErr = String(e).slice(0, 120); }
          saved.push({ name, seq: f.seq, wall: f.wall, lum: f.lum, diff: f.diff, flags: f.flags });
        }
      }
    }
    scStats.n++;
    prevLum = lum;
  } catch (e) { if (!scStats.saveErr) scStats.saveErr = 'decode:' + String(e).slice(0, 100); }
  try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch { /* - */ }
};
cdp.on('Page.screencastFrame', (ev) => { void onFrame(ev); });
await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: W, maxHeight: 400 });

// ---- 场景:用户原案复刻(seed 118606602 medium,groundLevel 493,柱位/飞行带 1:1) ----
const setup = await page.evaluate(async (plrB64) => {
  const g = window.__swGame;
  const out = {};
  window.__plrB64 = plrB64;
  g.lighting.clock.timeOfDay = 0.5355555555554474;   // 用户案钟面(白昼 12:51)
  const surf = g.world.store.surfaceY ?? 493;
  g.player.debugGod = true;
  g.player.x = 40096.56549999999;
  g.player.y = 5734;
  g.player.vx = 0; g.player.vy = 0;
  g.player.statLife = 500;
  void g.__swFlow;
  // 用户案三柱(世界坐标 px)
  const spawned = [];
  for (const [id, x, y] of [[422, 40095, 5227.747648419854], [507, 59983, 4971.697648419886], [517, 82239, 5979.697648419886]]) {
    const e = window.__swFlow.spawnVanillaEnemy(id, x, y);
    spawned.push(e ? `${id}:ok@${Math.round(e.cx / 16)},${Math.round(e.cy / 16)}` : `${id}:null`);
  }
  const iid = window.__swFlow.itemByVid(4956);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  // 载入用户 .plr(翅膀/配饰/盔甲/染料全套——飞行能力来自角色本体)
  if (window.__plrB64) {
    try {
      const { parsePlr } = await import('/src/save/PlrImport.ts').catch(() => import('/src/save/PlrImport'));
      const raw = Uint8Array.from(atob(window.__plrB64), (c) => c.charCodeAt(0));
      const parsed = parsePlr(raw);
      const ps = parsed.playerState;
      if (ps.inventory) g.player.inv.slots = ps.inventory.map((s2) => s2 ? { id: s2.id, stack: s2.stack ?? 1, fav: false } : null);
      if (ps.armor) g.player.inv.armor = ps.armor.map((s2) => s2 ? { id: s2.id, stack: s2.stack ?? 1, fav: false } : null);
      if (ps.dye) g.player.inv.dye = ps.dye.map((s2) => s2 ? { id: s2.id, stack: s2.stack ?? 1, fav: false } : null);
      if (typeof ps.selected === 'number' && ps.selected >= 0) g.player.inv.selected = Math.min(ps.selected, 9);
      if (ps.hp) { g.player.statLife = ps.hp; g.player.statLifeMax2 = Math.max(g.player.statLifeMax2, ps.hp); }
      out.plr = { name: parsed.appearance?.name ?? '?', ver: parsed.version, slots: ps.inventory?.length ?? 0, armor: ps.armor?.length ?? 0 };
    } catch (e) { out.plr = 'ERR:' + String(e).slice(0, 90); }
  }
  // fixedUpdate 步计数包装(逐帧步数)
  window.__fuCount = 0; window.__rCount = 0;
  const fu0 = g.fixedUpdate.bind(g);
  g.fixedUpdate = (...a) => { window.__fuCount++; return fu0(...a); };
  out.surfaceY = surf; out.playerY = g.player.y;
  out.spawned = spawned;
  out.atmo = +g.renderer.sky.atmoValue(g.camera.y).toFixed(3);
  out.enemies = [...(g.entities?.enemies ?? [])].length;
  out.towers = (() => { try { const le = g.world.lunarEvent; return le ? Object.entries(le.shield ?? {}).map(([k, v]) => k + ':' + v).join(',') : 'none'; } catch { return 'ERR'; } })();
  return out;
}, plrB64);
console.log('setup:', JSON.stringify(setup));
await new Promise((r) => setTimeout(r, 800));
// 翅膀验证:统计 wing 槽
const wingCheck = await page.evaluate(() => {
  const g = window.__swGame;
  const arm = g.player.inv.armor ?? [];
  const wingSlots = [];
  for (let i = 0; i < arm.length; i++) {
    const s = arm[i];
    if (!s) continue;
    const def = g.items?.def?.(s.id) ?? null;
    if (def?.wingSlot > 0 || def?.wing > 0) wingSlots.push(i + ':' + (def.name || s.id));
  }
  const sel = g.player.inv.slots?.[g.player.inv.selected];
  return { wingSlots, sel: sel?.id, armorN: arm.filter(Boolean).length };
});
console.log('wingCheck:', JSON.stringify(wingCheck));

// ---- 逐 rAF 状态行 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__rows = [];
  window.__thumbs = [];
  window.__running = true;
  window.__ctxLost = [];
  window.addEventListener('contextlost', (e) => window.__ctxLost.push({ t: Date.now(), tgt: (e.target?.id || e.target?.tagName || '?') }), true);
  window.addEventListener('contextrestored', (e) => window.__ctxLost.push({ t: Date.now(), rest: 1, tgt: (e.target?.id || e.target?.tagName || '?') }), true);
  // 缩略图面
  const SAMP_W = 32, SAMP_H = 18;
  const samp = document.createElement('canvas');
  samp.width = SAMP_W * 3; samp.height = SAMP_H;
  const sc2 = samp.getContext('2d', { willReadFrequently: true });
  let n = 0;
  const tick = () => {
    if (!window.__running) return;
    n++;
    let row;
    try {
      const sv = r.swPipe?.screenStackView;
      const ts = r.sky.towerSky;
      let nearD = -1, alive = 0;
      for (const e of g.entities?.enemies ?? []) {
        if (![422, 493, 507, 517].includes(e.vanillaId) || e.dead) continue;
        alive++;
        const d = Math.hypot(e.cx - g.player.cx, e.cy - g.player.cy);
        if (nearD < 0 || d < nearD) nearD = Math.round(d);
      }
      row = {
        n, fu: window.__fuCount, t: +performance.now().toFixed(1), wall: Date.now(),
        pt: Math.round(g.player.cx / 16) + ',' + Math.round(g.player.cy / 16),
        ct: Math.round(g.camera.x / 16) + ',' + Math.round(g.camera.y / 16),
        alive, nearD,
        tsf: ts ? Math.max(ts.solar?.fade ?? 0, ts.nebula?.fade ?? 0, ts.stardust?.fade ?? 0, ts.vortex?.fade ?? 0).toFixed(2) : '-',
        c10e: !!r._c10eFrame, wK: r._worldLowK, acc: r._accMode, bgl: r.bglPathUsed,
        wcCre: r.b2bWorldCanvasCreations, opS: r._opresentSky ? 1 : 0, opU: !!r.opresentUsed,
        sm: !!r.swPipe?.screenStackMode, stackN: sv ? sv.length : -1, stack: sv ? sv.map((f) => f.name).join('|') : 'x',
        sfx: r.sfxPathUsed, cp: r.cloudPathUsed, cm: r.cloudMergeUsed, compo: r.composePathUsed,
        fdg: !!r.sky.farDeferGate, atmo: +r.sky.atmoValue(g.camera.y).toFixed(3),
        flash: r.hasBgFlash(), tint: r.sky.hasSkyWeatherTint(),
        veil: !!g._tpVeil, freeze: !!g._entryFreeze, paused: !!g.paused,
        pd: r.swPipe ? (r.swPipe.unavailable ? Math.round(performance.now() - r.swPipe.diedAt) : 0) : -1,
        cd: r.cloudPipeLayer ? (r.cloudPipeLayer.unavailable ? Math.round(performance.now() - r.cloudPipeLayer.diedAt) : 0) : -1,
        wd: r.worldPipeLayer ? (r.worldPipeLayer.unavailable ? Math.round(performance.now() - r.worldPipeLayer.diedAt) : 0) : -1,
        cw: r.canvas.width, ch: r.canvas.height,
        en: (g.entities?.enemies ?? []).length,
      };
      window.__fuCount = 0;
    } catch (e) { row = { n, err: String(e).slice(0, 80) }; }
    window.__rows.push(row);
    if (n % 4 === 0) {
      try {
        sc2.clearRect(0, 0, samp.width, samp.height);
        const sky = r.skyCanvas, glc = r.glCanvasEl || (r.swPipe && r.swPipe.canvas), hud = r.canvas;
        if (sky) sc2.drawImage(sky, 0, 0, sky.width, sky.height, 0, 0, SAMP_W, SAMP_H);
        if (glc) sc2.drawImage(glc, 0, 0, glc.width, glc.height, SAMP_W, 0, SAMP_W, SAMP_H);
        if (hud) sc2.drawImage(hud, 0, 0, hud.width, hud.height, SAMP_W * 2, 0, SAMP_W, SAMP_H);
        const d = sc2.getImageData(0, 0, samp.width, samp.height).data;
        const lumOf = (cxi) => { let s2 = 0, cnt = 0; for (let y = 0; y < SAMP_H; y++) for (let x = 0; x < SAMP_W; x++) { const i = ((y * samp.width) + cxi * SAMP_W + x) * 4; s2 += (d[i] + d[i + 1] + d[i + 2]) / 3; cnt++; } return +(s2 / cnt).toFixed(1); };
        window.__thumbs.push({ n, wall: row.wall ?? Date.now(), sky: lumOf(0), gl: lumOf(1), hud: lumOf(2) });
      } catch { /* - */ }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// ---- 驾驶:用户案飞行带(y 3682↔5734,vy±11 反复升降)+天顶剑连击 ----
await page.mouse.move(900, 300);
await page.mouse.down();
const drive = (async () => {
  const t0 = Date.now();
  let up = true;
  while (Date.now() - t0 < RUN_MS) {
    await page.evaluate((u) => { window.__swGame.player.vy = u ? -11 : 11; window.__swGame.player.vyTarget = undefined; }, up);
    // 每 300ms 校向:到达带端翻转
    for (let k = 0; k < 10; k++) {
      await new Promise((r) => setTimeout(r, 300));
      const atBound = await page.evaluate((u) => u ? window.__swGame.player.y <= 3800 : window.__swGame.player.y >= 5600, up).catch(() => true);
      if (atBound) break;
    }
    up = !up;
  }
})();
for (let i = 0; i * 5000 < RUN_MS; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  await page.screenshot({ path: `${OUT}t${i * 5}s.png` }).catch(() => {});
}
await drive;
await page.mouse.up();
await page.evaluate(() => { window.__running = false; });
await cdp.send('Page.stopScreencast');

const rows = await page.evaluate(() => window.__rows);
const thumbs = await page.evaluate(() => window.__thumbs);
const ctxLost = await page.evaluate(() => window.__ctxLost);
writeFileSync(`${OUT}rows.json`, JSON.stringify(rows));
writeFileSync(`${OUT}thumbs.json`, JSON.stringify(thumbs));
writeFileSync(`${OUT}ctxlost.json`, JSON.stringify(ctxLost));
writeFileSync(`${OUT}saved-frames.json`, JSON.stringify(saved));
if (ctxLost.length) console.log('=== contextlost/restored 事件 ===');
for (const c of ctxLost.slice(0, 20)) console.log(`  wall=${c.t} ${c.rest ? 'RESTORED' : 'LOST'} ${c.tgt}`);
console.log(`screencast frames=${scStats.n} flagged=${scStats.flagged} black=${scStats.black} bigdiff=${scStats.bigdiff} saved=${saved.length} saveErr=${scStats.saveErr}`);
console.log(`rows=${rows.length}`);
// 状态分布
const dist = (k) => { const m = {}; for (const r2 of rows) { const v = String(r2[k]); m[v] = (m[v] || 0) + 1; } return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8)); };
console.log('acc:', JSON.stringify(dist('acc')));
console.log('sfx:', JSON.stringify(dist('sfx')));
console.log('cm:', JSON.stringify(dist('cm')));
console.log('bgl:', JSON.stringify(dist('bgl')));
console.log('wK:', JSON.stringify(dist('wK')));
console.log('c10e:', JSON.stringify(dist('c10e')));
console.log('veil:', JSON.stringify(dist('veil')));
console.log('fu steps/frame 分布:', (() => { const m = {}; for (const r2 of rows) { const v = String(r2.fu); m[v] = (m[v] || 0) + 1; } return JSON.stringify(m); })());
// 黑帧/大差帧的行对齐(wall clock)
if (saved.length) {
  console.log('=== 异常呈现帧(前 16) ===');
  for (const s of saved.filter((x) => x.flags.length).slice(0, 16)) {
    const near = rows.filter((r2) => Math.abs(r2.wall - s.wall) < 30).slice(0, 1);
    console.log(`  seq=${s.seq} wall=${s.wall} lum=${s.lum} diff=${s.diff} [${s.flags.join(',')}]`);
    for (const r2 of near) console.log(`     ~n=${r2.n} pt:${r2.pt} ct:${r2.ct} alive:${r2.alive} nearD:${r2.nearD} tsf:${r2.tsf} c10e:${r2.c10e ? 1 : 0} wK:${r2.wK} acc:${r2.acc} bgl:${r2.bgl} opS:${r2.opS} opU:${r2.opU ? 1 : 0} stackN:${r2.stackN}[${String(r2.stack).slice(0, 60)}] sfx:${r2.sfx} pd:${r2.pd} cd:${r2.cd} wd:${r2.wd} veil:${r2.veil ? 1 : 0}`);
  }
  // 暗段聚合+段内状态摘要
  const blacks = saved.filter((s) => s.flags.includes('BLACK'));
  const segs = [];
  for (const b of blacks) { const l = segs[segs.length - 1]; if (l && b.wall - l.end < 150) { l.end = b.wall; l.n++; } else segs.push({ start: b.wall, end: b.wall, n: 1 }); }
  console.log('=== 暗段 ===');
  for (const sg of segs) {
    const win = rows.filter((r2) => r2.wall >= sg.start - 150 && r2.wall <= sg.end + 150);
    if (!win.length) continue;
    const pts = [...new Set(win.map((r2) => r2.pt))].slice(0, 6);
    const cts = [...new Set(win.map((r2) => r2.ct))].slice(0, 4);
    console.log(`  seg ${sg.start}-${sg.end} (${sg.end - sg.start}ms n=${sg.n}) rows=${win.length} pt:[${pts.join(' ')}] ct:[${cts.join(' ')}] alive:${win[0].alive}->${win[win.length - 1].alive} tsf:${win[0].tsf}->${win[win.length - 1].tsf} sfx:[${[...new Set(win.map((r2) => r2.sfx))].join(',')}] pd:[${[...new Set(win.map((r2) => r2.pd))].join(',')}] cd:[${[...new Set(win.map((r2) => r2.cd))].join(',')}]`);
  }
}
// 缩略图亮度时间线(暗窗对齐)
const darkThumbs = thumbs.filter((t) => t.gl < 8);
console.log('=== gl 画布亮度 <8 的缩略帧(前 20) ===');
for (const t of darkThumbs.slice(0, 20)) {
  const rw = rows.find((r2) => Math.abs(r2.wall - t.wall) < 25);
  console.log(`  n=${t.n} sky:${t.sky} gl:${t.gl} hud:${t.hud}${rw ? ` | pt:${rw.pt} alive:${rw.alive} nearD:${rw.nearD} tsf:${rw.tsf} c10e:${rw.c10e ? 1 : 0} stackN:${rw.stackN}[${String(rw.stack).slice(0, 50)}] sfx:${rw.sfx}` : ''}`);
}
console.log('errs:', errs.slice(0, 8));
await browser.close();
process.exit(0);
