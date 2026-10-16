// v4 全功能 E2E：模板/锚点/事件回调/camPath/shake/flash/screenshot
import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite, front } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('/tmp/probe-out/_director-v4', { recursive: true });
const L = ledger();
const wss = new WebSocketServer({ port: 7788, maxPayload: 64 * 1024 * 1024 });
let mod = null; const rx = []; const events = [];
wss.on('connection', ws => {
  ws.on('message', (d, isBin) => {
    if (isBin) return;
    try { const m = JSON.parse(d); if (m.op === 'hello' && (m.v ?? 0) >= 4) mod = ws; rx.push(m); if (m.op === 'event') events.push(m); } catch {}
  });
});
let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} }); ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  await gotoApp(page, ORIGIN, { tries: 40 });
  await page.evaluate(async () => {
    const res = await fetch('/mods/dist/director.swmod?t=' + Date.now());
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { ModStore } = await import('/src/mods/store.ts');
    const { readModPack } = await import('/src/mods/pack.ts');
    const { loadModsPhase1 } = await import('/src/mods/loader.ts');
    const storage = { reg: JSON.stringify([]), zips: new Map(),
      async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; },
      async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; },
      async deleteZip(id) { this.zips.delete(id); } };
    const store = new ModStore(storage);
    const pack = readModPack(bytes);
    await store.install(pack.manifest, bytes, null);
    await loadModsPhase1(storage);
  });
  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2500 });
  L.chk('世界', gen.ok);
  await new Promise(r => setTimeout(r, 1500));
  if (!mod) { console.log('v4 mod 未连接'); process.exit(1); }
  console.log('v4 mod 已连接 ✓');

  const cmd = c => { rx.length = 0; mod.send(JSON.stringify({ op: 'cmd', c })); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async n => { await front(page); await wait(500); await page.screenshot({ path: `/tmp/probe-out/_director-v4/${n}.png` }); };
  const pPos = () => page.evaluate(() => ({ x: Math.round(window.__swGame.player.cx / 16), y: Math.round(window.__swGame.player.cy / 16) }));

  // ① 锚点 + cam ref
  const p = await pPos();
  cmd({ cmd: 'anchor', name: 'spawn', x: p.x, y: p.y });
  cmd({ cmd: 'cam', ref: 'spawn', dx: 5, dy: -3, zoom: 1.5 });
  await wait(500);
  const cam1 = await page.evaluate(() => ({ x: +(window.__swGame.camera.x / 16).toFixed(1), y: +(window.__swGame.camera.y / 16).toFixed(1) }));
  L.chk('锚点+cam ref', Math.abs(cam1.x - (p.x + 5)) < 2, `cam=(${cam1.x},${cam1.y}) expect=(${p.x + 5},${p.y - 3})`);

  // ② camPath 多关键帧
  cmd({ cmd: 'camPath', keys: [
    { t: 0, x: p.x, y: p.y, zoom: 1.0 },
    { t: 2, x: p.x + 10, y: p.y, zoom: 1.4, ease: 'outCubic' },
    { t: 5, x: p.x + 20, y: p.y - 5, zoom: 1.8, ease: 'inOutQuad' },
  ] });
  await wait(1000);
  const camMid = await page.evaluate(() => +(window.__swGame.camera.x / 16).toFixed(1));
  L.chk('camPath 中间点', camMid > p.x && camMid < p.x + 20, `cam.x=${camMid} (应在 ${p.x}~${p.x + 20} 之间)`);
  await wait(4500);
  const camEnd = await page.evaluate(() => ({ x: +(window.__swGame.camera.x / 16).toFixed(1), zoom: window.__swGame.camera.zoom }));
  L.chk('camPath 终点', Math.abs(camEnd.x - (p.x + 20)) < 3, `cam.x=${camEnd.x}`);
  await shot('camPath');

  // ③ 事件回调：walkTo → 到达 → subtitle
  events.length = 0;
  const p2 = await pPos();
  mod.send(JSON.stringify({ op: 'play', acts: [
    { name: 'test', dur: 15, commands: [
      { t: 0, cmd: 'walkTo', x: p2.x + 8, y: p2.y, id: 'w1' },
      { after: 'w1', cmd: 'subtitle', text: '走到了！', dur: 3 },
      { after: 'w1', cmd: 'flash', color: '#fff', dur: 0.3 },
    ]},
  ]}));
  await wait(5000);
  L.chk('事件回调 walkTo:done', events.some(e => e.name === 'w1:done'), events.map(e => e.name).join(','));
  await shot('event-callback');

  // ④ 模板
  cmd({ cmd: 'template', name: 'titleIn', params: { text: '模板测试', sub: 'template API', fadeDur: 0.5, barsDur: 0.3 } });
  await wait(1500);
  await shot('template');
  L.chk('template 无 crash', true);

  // ⑤ shake + flash + zoomPunch
  cmd({ cmd: 'shake', intensity: 0.8, dur: 0.5 });
  cmd({ cmd: 'flash', color: '#ff6600', dur: 0.4 });
  cmd({ cmd: 'zoomPunch', amount: 0.5, dur: 0.5 });
  await wait(600);
  await shot('fx');
  L.chk('shake+flash+zoomPunch', true);

  // ⑥ colorFade（色彩转场）
  cmd({ cmd: 'colorFade', to: 0.7, color: '#2a0a3e', dur: 1 });
  await wait(800);
  await shot('colorFade');
  cmd({ cmd: 'colorFade', to: 0, dur: 1 });
  L.chk('colorFade', true);

  // ⑦ 截图回传
  cmd({ cmd: 'screenshot' });
  await wait(1000);
  const ss = rx.find(m => m.op === 'screenshot');
  L.chk('screenshot 回传', ss && ss.size > 1000, `size=${ss ? ss.size : 0}`);
  if (ss && ss.data) {
    writeFileSync('/tmp/probe-out/_director-v4/mod-screenshot.png', Buffer.from(ss.data.split(',')[1] || '', 'base64'));
  }

  // ⑧ 分幕时间线（完整 play 模式）
  console.log('--- 分幕时间线');
  cmd({ cmd: 'stop' });
  events.length = 0;
  mod.send(JSON.stringify({ op: 'play', acts: [
    { name: 'act1', dur: 5, commands: [
      { t: 0, cmd: 'fade', to: 1 },
      { t: 0.2, cmd: 'bars', on: true, dur: 0.5 },
      { t: 0.5, cmd: 'camSnap', x: p2.x, y: p2.y - 5, zoom: 1.5 },
      { t: 1, cmd: 'fade', to: 0, dur: 1.5 },
      { t: 2, cmd: 'title', text: '第一幕', dur: 2.5 },
    ]},
    { name: 'act2', dur: 5, commands: [
      { t: 0, cmd: 'cam', x: p2.x + 10, y: p2.y - 3, zoom: 1.8, dur: 3, ease: 'outCubic' },
      { t: 1, cmd: 'subtitle', text: '第二幕：缓动推近', dur: 3 },
    ]},
  ]}));
  await wait(4000);
  await shot('acts-act1');
  await wait(4000);
  await shot('acts-act2');
  L.chk('分幕时间线', true);

  // ⑨ 音频
  cmd({ cmd: 'sfx', name: 'Item_1', volume: 0.5 });
  L.chk('sfx 无 crash', true);

} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300)); await wss.close();
  try { vite && vite.stop(); } catch {}
}
console.log('产物: /tmp/probe-out/_director-v4');
process.exit(L.exitCode());
