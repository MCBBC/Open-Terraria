// ★E51b A/B 呈现层验证 v2:同场景冻结截图差分（底噪自检+无切旗对照+阳性对照）。
//  ★v1 三伪影定谳:①boss 出生态 180t 未完→冻结帧无环(阳性对照缺失)→修=ai0 钉 8
//   +ai1 钉 45(环窗正中 e7=0.75/e8=1/lum=0.75);②直传 `async ()` 字符串=函数对象
//   不可序列化=计数恒 {}→修=IIFE+createGame 后即装(世界层运行期调用全量入账);
//   ③boss 血条追色条慢动画(墙钟域,~100px@顶带)=P 臂底噪/差分主体→修=win 顶沿
//   钉 220 排除条带+无切旗对照量化剩余环境漂移。
//  臂P(2D ?bgl=0):缺省(加色主部分解) vs empparts=0(旧 tq 链)→期望环区 ≤~4LSB;
//  臂Z(GL 缺省):缺省 vs empparts=0(分支不可达,计数恒 0)→期望 diffPx=0。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=400000 scripts/_e51b-ab.mjs
import { launchBrowser, openPage, cleanStorage, ackWelcome, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';

async function bootManual(page, origin, url) {
  await page.goto(origin + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await cleanStorage(page, { welcomeAck: true });
  await page.goto(`${origin}${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const ok = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
    if (ok) { await ackWelcome(page, true); return { ok: true }; }
    await new Promise((r) => setTimeout(r, 500));
  }
  return { ok: false, why: 'bridge-timeout' };
}

/** 计数器安装（createGame 后即装=运行期世界层调用全量入账）。 */
const INSTALL = `(() => {
  const g = window.__swGame;
  if (globalThis.__e51bCnt) return;
  globalThis.__e51bCnt = { scratch: 0, old: 0, oldNull: 0 };
  const os = g.renderer.empGhostTinted;
  g.renderer.empGhostTinted = function (i, sx, sy, sw, sh, t) {
    globalThis.__e51bCnt.scratch++;
    return os.call(this, i, sx, sy, sw, sh, t);
  };
  const ot = g.renderer.tintedSprite;
  g.renderer.tintedSprite = function (k, f, c) {
    if (String(k).indexOf('emp|') === 0) {
      globalThis.__e51bCnt.old++;
      const r = ot.call(this, k, f, c);
      if (!r) globalThis.__e51bCnt.oldNull++;
      return r;
    }
    return ot.call(this, k, f, c);
  };
})()`;
const READ = `(() => ({ scratch: globalThis.__e51bCnt.scratch, old: globalThis.__e51bCnt.old, oldNull: globalThis.__e51bCnt.oldNull }))()`;

/** 场景构建:ai0 钉 8+ai1 钉 45(环窗正中 e7=0.75/e8=1/lum=0.75),boss 恒在环恒可见。 */
async function buildScene(page) {
  await page.evaluate(async () => {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const g = window.__swGame;
    globalThis.__e51pin = setInterval(() => {
      const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
      if (!e) {
        const ne = Enemy.fromVanilla(636, g.player.cx + 260, g.player.cy - 250);
        if (ne) g.entities.add(ne, 'enemies');
        return;
      }
      e.dead = false; e.spawnAlpha = 0;
      if (e.hp > 1) e.hp = 1;
      e.ai0 = 8; e.ai1 = 45;            // ★E51b:atk8+环窗正中
      e.ai3 = 1; e.ai2 = 2;
      e.vx = 0; e.vy = 0; e.cx = g.camera.x + 300; e.cy = g.camera.y - 100;
      e.despawnTimer = 750;
      const p2 = g.player;
      if (p2) { p2.hp = p2.maxHp; p2.dead = false; }
    }, 8);
  });
  await sleep(2200);
  await page.evaluate(() => { window.__swGame.paused = true; });
  await sleep(300);
}

const diff = (a, b, win) => {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { fatal: 'size' };
  const x0 = Math.max(0, win?.x ?? 0), y0 = Math.max(0, win?.y ?? 0);
  const x1 = Math.min(A.width, win ? win.x + win.w : A.width);
  const y1 = Math.min(A.height, win ? win.y + win.h : A.height);
  let n = 0, maxCh = 0, maxAt = null;
  const pts = [];
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  const d = A.data, e = B.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * A.width + x) * 4;
      let px = 0, dvAbs = 0;
      for (let c = 0; c < 3; c++) {
        const dv = Math.abs(d[i + c] - e[i + c]);
        if (dv > px) { px = dv; dvAbs = dv; }
      }
      if (px > 0) {
        n++;
        bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y);
        if (pts.length < 6) pts.push([x, y, dvAbs]);
        if (px > maxCh) { maxCh = px; maxAt = i / 4; }
      }
    }
  }
  return { diffPx: n, maxCh, maxAt, bbox: n ? [bx0, by0, bx1, by1] : null, pts };
};

async function abPair(label, url, switchFlag) {
  const browser = await launchBrowser({ headless: true });
  const page = await openPage(browser, ORIGIN, { width: 1280, height: 800 });
  const boot = await bootManual(page, ORIGIN, url);
  if (!boot?.ok) throw new Error('boot fail ' + label + ' ' + JSON.stringify(boot));
  const made = await createGame(page, { mode: 'direct', seed: 'e51ab', size: 'small', pinRandom: 20261006, log: () => {} });
  if (!made?.ok) throw new Error('createGame fail ' + label);
  await page.evaluate(INSTALL);
  await page.evaluate(async () => {
    const m = await import('/src/entities/Enemy.ts');
    globalThis.__veRead = m.visEffectFrames;
  });
  await sleep(800);
  await buildScene(page);
  await sleep(400);
  const win = await page.evaluate(() => {
    const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e) return null;
    const zoom = cam.zoom ?? 1;
    const sx = Math.round((e.cx - cam.x) * zoom + cv.width / 2);
    const sy = Math.round((e.cy - cam.y) * zoom + cv.height / 2);
    // ★win 顶沿 400:排除 boss 头顶墙钟动画带(血条追色/!情绪泡/帽冠,y<400 实测污染带)
    return { x: Math.max(0, sx - 360), y: Math.max(400, sy - 360), w: 720, h: Math.min(380, 800 - Math.max(400, sy - 360)) };
  });
  const cnt1 = await page.evaluate(READ);
  // ★v3:暂停态【手动同步重渲染】A/B——g.render() 直调(渲染循环暂停期跳过世界层,
  //  v2 计数器恒等实证)→ 同一冻结游戏态下两次全渲染,旗面为唯一变量:
  //  ①同旗重渲染对照=确定性自检(须 diffPx=0,非 0=探针伪影) ②切旗重渲染=纯链差。
  const s1 = await page.evaluate(() => { window.__swGame.render(); return true; }).then(() => page.screenshot({ type: 'png' }));
  const sN = await page.evaluate(() => { window.__swGame.render(); return true; }).then(() => page.screenshot({ type: 'png' }));
  const ambient = diff(s1, sN, win);
  console.log(`[${label}] 同旗重渲染对照(确定性自检,缺省链):`, JSON.stringify(ambient));
  if (switchFlag) {
    await page.evaluate(switchFlag);
    await sleep(300);
    // ★v4 决定性实验:旧链自身双拍——若 ≠0,则全帧差分的非确定性=旧链图集史伪影
    const o1 = await page.evaluate(() => { window.__swGame.render(); return true; }).then(() => page.screenshot({ type: 'png' }));
    const o2 = await page.evaluate(() => { window.__swGame.render(); return true; }).then(() => page.screenshot({ type: 'png' }));
    console.log(`[${label}] 旧链自身双拍对照:`, JSON.stringify(diff(o1, o2, win)));
  }
  const st1 = await page.evaluate(() => {
    const g = window.__swGame, e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    const ren = g.renderer, A = ren.atlas;
    const dim = (p2, rows) => { if (!p2) return null; const fh = Math.floor(p2.sh / rows); return [p2.sw, fh]; };
    return { ve: Math.round(globalThis.__veRead()), cam: [g.camera.x, g.camera.y], e: e ? [e.cx, e.cy, e.ai1, e.animT, e.facing, e.vx, e.vy] : null,
      dims: { wing: dim(A.vmisc('vanilla/Extra_159.png'), 11), shader: dim(A.vmisc('vanilla/Extra_157.png'), 11),
        body: A.vnpc(636, 1) ? [A.vnpc(636, 1).sw, A.vnpc(636, 1).sh] : null,
        w187: dim(A.vmisc('vanilla/Extra_187.png'), 8), armL: dim(A.vmisc('vanilla/Extra_158.png'), 7) } };
  });
  const cnt2 = await page.evaluate(READ);
  const s2 = await page.evaluate(() => { window.__swGame.render(); return true; }).then(() => page.screenshot({ type: 'png' }));
  const st2 = await page.evaluate(() => {
    const g = window.__swGame, e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    return { ve: Math.round(globalThis.__veRead()), cam: [g.camera.x, g.camera.y], e: e ? [e.cx, e.cy, e.ai1, e.animT, e.facing, e.vx, e.vy] : null };
  });
  console.log('[state]', JSON.stringify({ st1, st2 }));
  if (process.env.E51B_DUMP) {
    const fs = await import('node:fs');
    fs.writeFileSync(`/tmp/e51b-${label}-sN.png`, sN);
    fs.writeFileSync(`/tmp/e51b-${label}-s2.png`, s2);
  }
  await browser.close();
  return { win, cnt1, cnt2, ambient, d: diff(sN, s2, win) };
}

console.log('== 臂P:2D 缺省(逐调 scratch) vs empscratch=0(旧 tq 链)——期望环区 ≤~4LSB ==');
const P = await abPair('P(2D)', '/?bgl=0',
  () => import('/src/render/Renderer.ts').then((m) => { m.Renderer.empGhostScratchOff = true; }));
console.log('P1 计数(新链,阳性对照须 scratch>0):', JSON.stringify(P.cnt1), '→ P2:', JSON.stringify(P.cnt2));
console.log('臂P 差分(sN vs s2):', JSON.stringify(P.d));

console.log('== 臂Z:GL 缺省 vs empscratch=0(分支不可达)——期望 diffPx=0 ==');
const Z = await abPair('Z(GL)', '/',
  () => import('/src/render/Renderer.ts').then((m) => { m.Renderer.empGhostScratchOff = true; }));
console.log('Z1:', JSON.stringify(Z.cnt1), '→ Z2:', JSON.stringify(Z.cnt2));
console.log('臂Z 差分:', JSON.stringify(Z.d));
process.exit(0);
