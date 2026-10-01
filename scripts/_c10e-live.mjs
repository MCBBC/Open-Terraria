// C10e 实机条件复现:零钉面/不暂停/默认画质/长时运行——逐时刻采样呈现面与路由账,
// 定位世界层断裂的转变时刻(实机症状:glCanvas 只剩 bg 会话内容)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 150)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
await bootstrap(page, ORIGIN + '/?c10e=1&fx=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
console.log('createGame:', !!gen?.ok);
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__probe = () => {
    const r2 = window.__swGame.renderer;
    const info = (src) => {
      const lc = document.createElement('canvas'); lc.width = 8; lc.height = 8;
      const c = lc.getContext('2d'); c.drawImage(src, 0, 0, src.width, src.height, 0, 0, 8, 8);
      return [...c.getImageData(0, 0, 8, 8).data.slice(0, 8)].join(',');
    };
    const gl = document.getElementById('sw-c10e-glcanvas');
    return {
      path: r2.composePathUsed, c10eFrame: r2._c10eFrame, inter: r2._c10eWorldToHud,
      merge: r2.cloudMergeUsed, opresent: r2.opresentUsed, stackMode: r2.swPipe ? r2.swPipe.screenStackMode : null,
      frameW: r2.swPipe ? r2.swPipe.frameW : 0, canvasW: r2.swPipe ? r2.swPipe.canvas.width : 0,
      glInDom: !!gl, glConnected: gl ? gl.isConnected : false,
      skyInDom: r2.skyCanvas ? r2.skyCanvas.isConnected : false,
      hudConnected: r2.canvas.isConnected,
      glCanvasElField: r2.glCanvasEl ? 'present' : 'null',
      domOrder: [...(r2.canvas.parentElement?.children ?? [])].map(c => c.id || c.tagName + (c === r2.canvas ? ':HUD' : '') + (c === r2.skyCanvas ? ':SKY' : '') + (c === r2.glCanvasEl ? ':GL' : '')).join('>'),
      hudCss: (r2.canvas.getAttribute('style') || '').slice(0, 80),
      glCss: (document.getElementById('sw-c10e-glcanvas')?.getAttribute('style') || '').slice(0, 100),
      swPipeAlive: r2.swPipe ? !r2.swPipe.unavailable : 'null',
      glCenter: gl ? (() => { const lc = document.createElement('canvas'); lc.width = 4; lc.height = 4; const c = lc.getContext('2d'); c.drawImage(gl, gl.width/2-2, gl.height/2-2, 4, 4, 0, 0, 4, 4); return [...c.getImageData(0,0,4,4).data.slice(0,8)].join(','); })() : 'no-gl',
      cpu: r2.isCpuRender(), wK: r2._worldLowK,
      bgl: r2.bglPathUsed, acc: r2._accMode, accGlw: r2._accGlw ? 'y' : 'n',
      wc: !!r2.worldCanvas, b2b: r2.constructor.b2b, bglFlag: r2.constructor.bgl, shim: r2.constructor.bglShim,
      bglStats: Object.entries(r2.bglPathStats).map(([k, v]) => k + ':' + v).join(' '),
      hudTerrain: (() => { const lc = document.createElement('canvas'); lc.width = 4; lc.height = 4; const c = lc.getContext('2d'); c.drawImage(r2.canvas, r2.canvas.width/2, r2.canvas.height - 120, 4, 4, 0, 0, 4, 4); return [...c.getImageData(0,0,4,4).data.slice(0,8)].join(','); })(),
      light: (() => { const g2 = window.__swGame; const L = g2.lighting; const st = g2.world.store;
        const tx = (g2.camera.x / 16) | 0, ty = (g2.camera.y / 16) | 0; const w = st.w;
        if (!L.r || L.r.length === 0) return 'no-arr';
        const i = (ty - L.ry) * L.rw + (tx - L.rx);
        const i2 = (ty - L.ry + 6) * L.rw + (tx - L.rx);
        return `cam=${L.r[i]},${L.g[i]},${L.b[i]} below=${L.r[i2]},${L.g[i2]},${L.b[i2]} rx=${L.rx} ry=${L.ry}`; })(),
      pend: (() => { const sky = r2.sky; return { lantern: sky.lanternOpacity, party: sky.fx && sky.fx.party, amb: sky.ambEntities.length, pendSpawn: sky.pendingAmbientSpawns.length, nextAtt: sky.ambNextAttempt, remote: sky.ambientRemoteDriven, drama: sky.dramaCore !== null, slime: sky.slimeSky.isActive, martin: sky.martianSky.isActive }; })(),
      hudCenter: (() => { const lc = document.createElement('canvas'); lc.width = 4; lc.height = 4; const c = lc.getContext('2d'); c.drawImage(r2.canvas, r2.canvas.width/2-2, r2.canvas.height/2-2, 4, 4, 0, 0, 4, 4); return [...c.getImageData(0,0,4,4).data.slice(0,8)].join(','); })(),
    };
  };
});
const samples = [];
for (let t = 0; t < 8; t++) {
  await new Promise((r) => setTimeout(r, 4000));
  const s = await page.evaluate(() => window.__probe());
  samples.push(`t=${(t + 1) * 4}s ${JSON.stringify(s)}`);
}
console.log(samples.join('\n'));
console.log('errs:', errs.slice(0, 4));
// 截图目检
await page.screenshot({ path: 'shots/c10e/live-8s.png' });
await new Promise((r) => setTimeout(r, 8000));
await page.screenshot({ path: 'shots/c10e/live-16s.png' });
console.log('shots saved');
process.exit(0);
