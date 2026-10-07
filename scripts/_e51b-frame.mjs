// ★E51b 案②活机复测:有头浏览器真实帧预算——E51 诚实边界(headless SwiftShader 帧耗
//  未采信)清偿。修前臂=E51 刀A 旧语义回退(运行时 setTintAtlasInvalidateRect(null)
//  =页级 bump)+?empslice=0(刀B 前烘焙链);修后臂=缺省(矩形级精确失效+cut+uTint)。
//  采样:帧耗 p50/p95(rAF 间距,--disable-gpu-vsync --disable-frame-rate-limit=不封顶
//  真实预算)+GLStats swpipe 上传账+er: 重传字节(texFromRegion 拦截)+bump 计数
//  (atlas 页 texEpoch 逐帧采样差分)。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=560000 scripts/_e51b-frame.mjs
import { launchBrowser, openPage, cleanStorage, ackWelcome, createGame, sleep } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const N = Number(process.env.E51B_FRAMES || 400);

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

const INSTALL = `(() => {
  const g = window.__swGame;
  if (globalThis.__e51bInst) return;
  const ren = g.renderer;
  const st = globalThis.__e51bInst = { erN: 0, erBytes: 0, otherN: 0, otherBytes: 0 };
  return (async () => {
    const GLS = await import('/src/render/GLSpriteLayer.ts');
    const proto = GLS.GLSpriteLayer.prototype;
    if (!proto.__e51bWrapped) {
      proto.__e51bWrapped = true;
      const ofr = proto.texFromRegion;
      proto.texFromRegion = function (key, img, sx, sy, sw, sh) {
        const r = ofr.call(this, key, img, sx, sy, sw, sh);
        if (r) {
          const b = r.bytes ?? (r.w * r.h * 4);
          if (String(key).indexOf('er:') === 0) { st.erN++; st.erBytes += b; }
          else { st.otherN++; st.otherBytes += b; }
        }
        return r;
      };
    }
  })();
})()`;

const SETUP = `(() => {
  const g = window.__swGame;
  globalThis.__e51pin = setInterval(() => {
    let e = null;
    for (const en of (g.entities.enemies ?? [])) if (en.vanillaId === 636) { e = en; break; }
    if (!e) {
      import('/src/entities/Enemy.ts').then(({ Enemy }) => {
        const ne = Enemy.fromVanilla(636, g.player.cx + 260, g.player.cy - 140);
        if (ne) g.entities.add(ne, 'enemies');
      });
      return;
    }
    e.dead = false; e.spawnAlpha = 0;
    if (e.hp > 1) e.hp = 1;
    e.ai3 = 1; e.ai2 = 2;
    e.cx = g.player.cx + 260; e.cy = g.player.cy - 140;
    e.despawnTimer = 750;
    const p2 = g.player;
    if (p2) { p2.hp = p2.maxHp; p2.dead = false; }
  }, 8);
})()`;

const SAMPLE = async (want) => {
    const g = window.__swGame;
    const ds = [];
    const ep = () => {
      const pages = g.renderer.tintAtlas.pages ?? [];
      let s = '';
      for (const p of pages) s += (globalThis.__e51bEpochOf ? globalThis.__e51bEpochOf(p.cv) : 0) + ',';
      return s;
    };
    const T = await import('/src/render/texId.ts');
    globalThis.__e51bEpochOf = T.texEpoch;
    return await new Promise((done) => {
      let last = performance.now(), lastEp = ep(), bumps = 0, uploaded = 0, upMB = 0, draws = 0, n = 0;
      const st = globalThis.__e51bInst;
      const e0 = { erN: st.erN, erBytes: st.erBytes };
      const loop = (t) => {
        ds.push(t - last); last = t;
        const e1 = ep();
        if (e1 !== lastEp) { const a = lastEp.split(','), b2 = e1.split(','); for (let i = 0; i < Math.max(a.length, b2.length); i++) if (a[i] !== b2[i]) bumps++; lastEp = e1; }
        const s = window.__swGPULog?.snapshot?.();
        const c = s?.ctxs?.swpipe;
        if (c) { uploaded += c.frameUp; upMB += c.frameUpMB; draws += c.frameDraws; }
        n++;
        if (n < want) requestAnimationFrame(loop);
        else {
          const arr = [...ds].sort((a, b) => a - b);
          const pct = (p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
          done({ frames: arr.length, p50: +pct(0.5).toFixed(2), p95: +pct(0.95).toFixed(2), p99: +pct(0.99).toFixed(2),
            mean: +(ds.reduce((a, b) => a + b, 0) / ds.length).toFixed(2), max: +arr[arr.length - 1].toFixed(2),
            bumps, upPerFrame: +(uploaded / arr.length).toFixed(1), upMBPerFrame: +(upMB / arr.length).toFixed(3),
            drawsPerFrame: +(draws / arr.length).toFixed(1),
            erRetxN: st.erN - e0.erN, erRetxMB: +((st.erBytes - e0.erBytes) / 1048576).toFixed(1) });
        }
      };
      requestAnimationFrame(loop);
    });
  };

async function arm(label, url, mutate) {
  // ★有头=真实 GPU(macOS);--disable-gpu-vsync --disable-frame-rate-limit=不封顶真实预算
  const browser = await launchBrowser({
    headed: true,
    extraArgs: ['--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
  const page = await openPage(browser, ORIGIN, { width: 1280, height: 800 });
  const boot = await bootManual(page, ORIGIN, url);
  if (!boot?.ok) { console.error(label, 'boot fail', boot); await browser.close(); return null; }
  const made = await createGame(page, { mode: 'direct', seed: 'e51fr', size: 'small', pinRandom: 20261007, log: () => {} });
  if (!made?.ok) { console.error(label, 'createGame fail'); await browser.close(); return null; }
  await page.evaluate(INSTALL);
  await sleep(600);
  await page.evaluate(SETUP);
  await sleep(2500);   // 预热:boss 入场+键域热身
  if (mutate) {
    await page.evaluate(mutate);
    await sleep(800);
  }
  const r = await page.evaluate(SAMPLE, N);
  console.log(`[${label}]`, JSON.stringify(r));
  await browser.close();
  return r;
}

console.log('== 案② 活机有头复测:EoL atk8 战斗场景,修前(E51 前) vs 修后 ==');
// ★相隔离+重试(有头 boot 偶发桥超时):E51B_ARM=pre/post 选臂,单进程单臂
const which = process.env.E51B_ARM || 'both';
const withRetry = async (label, url, mutate) => {
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await arm(label, url, mutate);
      if (r) return r;
      throw new Error('null result');
    } catch (e) {
      console.error(label, `尝试${a} 失败:`, String(e).slice(0, 120));
      if (a === 3) return null;
      await new Promise((r2) => setTimeout(r2, 5000));
    }
  }
};
const pre = which === 'both' || which === 'pre'
  ? await withRetry('修前(页bump+烘焙链)', '/', async () => {
    (await import('/src/render/TintAtlas.ts')).setTintAtlasInvalidateRect(null);
    (await import('/src/render/Renderer.ts')).Renderer.empGhostSliceOff = true;
  }) : null;
const post = which === 'both' || which === 'post'
  ? await withRetry('修后(精确失效+uTint)', '/', null) : null;
if (pre && post) {
  console.log('== 对比 ==');
  console.log(JSON.stringify({
    frameP50: [pre.p50, post.p50], frameP95: [pre.p95, post.p95], frameP99: [pre.p99, post.p99],
    frameMean: [pre.mean, post.mean], frameMax: [pre.max, post.max],
    bumps: [pre.bumps, post.bumps],
    erRetxMB: [pre.erRetxMB, post.erRetxMB], erRetxN: [pre.erRetxN, post.erRetxN],
    upMBPerFrame: [pre.upMBPerFrame, post.upMBPerFrame],
  }, null, 1));
}
process.exit(0);
