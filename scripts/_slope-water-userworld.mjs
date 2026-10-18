// ★liqgl 水体闪烁·用户世界复现(2026-09-28):注入用户存档(marks-Starter_World 51/
//  map-Starter_World 36 导出=sandboxworld.save JSON)→?quickload 载入→玩家原位
//  (丛林水池 slope2 阶梯)实况逐帧扫水体区——"闪帧"=像素色偏离自身时序中位>阈。
//  双臂:B 缺省(liqgl) vs C ?liqgl=0。闪帧留全帧快照归档 /tmp。
// 运行:SW_ORIGIN=http://localhost:5240 SAVE=~/Downloads/map-Starter_World\ \(36\).json \
//   node tools/run-diag.mjs scripts/_slope-water-userworld.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const SAVE_PATH = process.env.SAVE || needInput(join(DOWNLOADS, 'map-Starter_World (36).json'));
const saveJson = (await import('node:fs')).readFileSync(SAVE_PATH, 'utf8');
console.log('save json bytes:', saveJson.length);

const browser = await launchBrowser({});

async function arm(query, label) {
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push('PE: ' + e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type()[0].toUpperCase() + 'E: ' + m.text().slice(0, 160)); });
  // 注入存档(IDB kv;先 bare 导航同源)
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  // 用 app 自己的 kvSet 写(自建 object store;裸 IDB open 无 onupgradeneeded=空库
  // transaction('kv') 同步抛 NotFoundError——首跑注入静默失败=『没有可用的快速存档』)
  const how = await page.evaluate(async (text) => {
    const m = await import('/src/save/KvStore.ts');
    // ★2026-09-28 补丁:共享探针 profile 里先前的 createGame 探针已留下
    //  sandboxworld.worlds.index（非空）→ WorldStore.ensureLoaded 迁移门
    //  (index.length===0 && !raw) 不触发 → 单槽 quicksave 被无视=『没有可用的
    //  快速存档』假超时。注入前清索引,强制走迁移路径。
    await m.kvDelete('sandboxworld.worlds.index');
    for (let i = 1; i <= 8; i++) await m.kvDelete(`sandboxworld.world.${i}`);
    return m.kvSet('sandboxworld.quicksave', text);
  }, saveJson);
  console.log(`[${label}] kvSet →`, how);
  // quickload 进世界
  const qs = (query ? query.replace(/^\?/, '') + '&' : '') + 'quickload=1&t=' + Date.now();
  await page.goto(ORIGIN + '/?' + qs, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  const t0 = Date.now(); let ok = false; let lastState = '';
  while (Date.now() - t0 < 300000) {
    const st = await page.evaluate(() => ({
      game: !!window.__swGame, world: !!window.__swGame?.world,
      store: !!window.__swGame?.world?.store,
      flow: typeof window.__swFlow,
      btns: Array.from(document.querySelectorAll('button')).length,
      splash: !!document.querySelector('canvas'),
      body: document.body.innerText.slice(0, 80).replace(/\n/g, ' '),
    })).catch(() => ({ err: 'eval' }));
    lastState = JSON.stringify(st).slice(0, 160);
    ok = st.game && st.world && st.store;
    if (ok) break;
    if (Date.now() - t0 < 25000 || Date.now() - t0 > 250000) console.log(`[${label}] ${JSON.stringify(st).slice(0, 140)} errs=${errs.slice(-2).join('|')}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) {
    console.log(`[${label}] lastState: ${lastState}`);
    console.log(`[${label}] url: ${page.url().slice(0, 120)}`);
    const dlg = await page.evaluate(() => ({
      btns: Array.from(document.querySelectorAll('button')).map((b) => b.textContent?.slice(0, 40)),
      text: document.body.innerText.slice(0, 200).replace(/\n/g, '|'),
    })).catch(() => null);
    console.log(`[${label}] dialog:`, JSON.stringify(dlg));
    await page.screenshot({ path: `/tmp/userworld-${label}-stuck.png` });
    throw new Error('quickload-timeout ' + label);
  }
  for (const b of document.querySelectorAll('button')) { void b; }
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  });
  // 场景核实+采样格网:玩家周身水体(tile 4585-4606, 424-445 内的液体格)
  const pts = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer;
    const st = g.world.store, W = g.world.w;
    const cam = g.camera, dpr = window.devicePixelRatio, zoom = cam.zoom;
    const dev = (wx, wy) => [Math.round((wx - cam.x) * zoom * dpr + r.canvas.width / 2),
      Math.round((wy - cam.y) * zoom * dpr + r.canvas.height / 2)];
    // 扫玩家周边 40×30 格的液体格,每格中心取 1 采样点(限视口内)
    const pts = [];
    const px0 = Math.floor(g.player.x / 16), py0 = Math.floor(g.player.y / 16);
    for (let ty = py0 - 12; ty <= py0 + 12; ty++) {
      for (let tx = px0 - 20; tx <= px0 + 20; tx++) {
        const i = ty * W + tx;
        if (st.liquid[i] > 200) {
          const [x, y] = dev(tx * 16 + 8, ty * 16 + 8);
          if (x > 40 && x < r.canvas.width - 40 && y > 40 && y < r.canvas.height - 40) pts.push([x, y, tx, ty]);
        }
      }
    }
    const lc = document.createElement('canvas');
    lc.width = r.canvas.width; lc.height = r.canvas.height;
    window.__samp = { pts, lc, lx: lc.getContext('2d', { willReadFrequently: true }) };
    window.__player = { x: g.player.x, y: g.player.y };
    return { n: pts.length, player: [g.player.x, g.player.y], head: pts.slice(0, 3) };
  });
  console.log(`[${label}] player=${JSON.stringify(pts.player)} 水采样点=${pts.n}`);
  if (pts.n < 8) { console.log(`[${label}] 采样点不足,玩家不在水中?`); await page.close(); return null; }

  // 时序 600 帧:逐帧采全点;闪帧=任一点偏离自身中位>26
  const N = 600;
  const series = [];
  for (let i = 0; i < N; i++) {
    const s = await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow ?? performance.now()) + 16.6667;
      g.frame(window.__vnow);
      const { pts, lc, lx } = window.__samp;
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.drawImage(g.renderer.canvas, 0, 0);
      const out = new Array(pts.length);
      for (let k = 0; k < pts.length; k++) {
        const d = lx.getImageData(pts[k][0], pts[k][1], 1, 1).data;
        out[k] = [d[0], d[1], d[2]];
      }
      return out;
    });
    series.push(s);
  }
  // 闪帧检测:逐点时序中位 → 偏离>26 的帧
  const flashes = [];
  const P = series[0].length;
  for (let i = 0; i < N; i++) {
    const hot = [];
    for (let k = 0; k < P; k++) {
      const med = [0, 1, 2].map((c) => {
        const col = series.map((f) => f[k][c]).sort((a, b) => a - b);
        return col[Math.floor(N / 2)];
      });
      const d = Math.max(Math.abs(series[i][k][0] - med[0]), Math.abs(series[i][k][1] - med[1]), Math.abs(series[i][k][2] - med[2]));
      if (d > 26) hot.push({ k, d, rgb: series[i][k], med });
    }
    if (hot.length >= 3) flashes.push({ i, n: hot.length, top: hot.sort((a, b) => b.d - a.d).slice(0, 3) });
  }
  console.log(`[${label}] 闪帧(≥3 点偏离>26): ${flashes.length}/${N}`);
  for (const f of flashes.slice(0, 10)) {
    console.log(`  @${f.i}: ${f.n} 点 | ${f.top.map((h) => `#${h.k} ${h.rgb} vs med ${h.med} (d=${h.d})`).join(' | ')}`);
  }
  if (flashes.length) {
    writeFileSync(`/tmp/slope-userworld-${label}-flash.json`, JSON.stringify({ flashes: flashes.slice(0, 40), pts: pts.head }));
  }
  console.log(`[${label}] errors:`, errs.slice(0, 2));
  await page.close();
  return flashes.length;
}

const b = await arm('', 'B');
const c = await arm('?liqgl=0', 'C');
console.log(`结论: B 闪帧=${b}  C 闪帧=${c}`);
process.exit(0);
