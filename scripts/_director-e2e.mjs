// _director-e2e —— 导演模式全链路 E2E：
//   内嵌 wss(7788,即「导演服务」角色) → 装 mod → 建世界 → 握手 → 下发时间线 → 截图+数值验证
import { launchBrowser, openPage, gotoApp, createGame, pump, ledger, startPrivateVite, front } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.env.SW_PROBE_OUT || '/tmp/probe-out/_director-e2e';
mkdirSync(out, { recursive: true });
const L = ledger();

// ① 内嵌导演服务（协议与 server.mjs 同）
const wss = new WebSocketServer({ port: 7788 });
let mod = null;
const got = { hello: false, status: 0, acks: [] };
wss.on('connection', ws => {
  mod = ws;
  ws.on('message', d => {
    try {
      const m = JSON.parse(d);
      if (m.op === 'hello') got.hello = true;
      else if (m.op === 'status') got.status++;
      else if (m.op === 'ack') got.acks.push(m.c);
    } catch {}
  });
});

// ② 私有 vite + 页面 + 装 mod + 建世界
const vite = await startPrivateVite({ log: () => {} });
const ORIGIN = `http://localhost:${vite.port}`;
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  await gotoApp(page, ORIGIN, { tries: 40 });
  const inst = await page.evaluate(async () => {
    try {
      const res = await fetch('/mods/dist/director.swmod?t=' + Date.now());
      if (!res.ok) return ['fetch ' + res.status];
      const bytes = new Uint8Array(await res.arrayBuffer());
      const { ModStore } = await import('/src/mods/store.ts');
      const { readModPack } = await import('/src/mods/pack.ts');
      const { loadModsPhase1 } = await import('/src/mods/loader.ts');
      const storage = {
        reg: JSON.stringify([]), zips: new Map(),
        async getRegistry() { return this.reg; }, async setRegistry(j) { this.reg = j; },
        async putZip(id, b) { this.zips.set(id, b); return true; }, async getZip(id) { return this.zips.get(id) ?? null; },
        async deleteZip(id) { this.zips.delete(id); }
      };
      const store = new ModStore(storage);
      const pack = readModPack(bytes);
      await store.install(pack.manifest, bytes, null);
      const r2 = await loadModsPhase1(storage);
      return r2.loaded.length ? r2.loaded.map(m => m.manifest?.id ?? m.id) : ['load:0 ' + r2.errors.map(e => e.error).join(';')];
    } catch (e) { return [String(e && e.message || e)]; }
  });
  L.chk('mod 安装+装载', inst[0] === 'director', JSON.stringify(inst));

  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2500 });
  L.chk('世界已建', gen.ok, gen.why);
  await new Promise(r => setTimeout(r, 2000));
  L.chk('mod 握手 hello', got.hello);
  L.chk('mod 心跳 status≥1', got.status >= 1, `n=${got.status}`);

  // ③ 下发演出时间线
  const TL = [
    { t: 0.0, cmd: 'fade', to: 1 },
    { t: 0.1, cmd: 'bars', on: true },
    { t: 0.1, cmd: 'input', lock: true },
    { t: 0.3, cmd: 'camSnap', x: 2095, y: 340, zoom: 1.7 },
    { t: 0.6, cmd: 'fade', to: 0, dur: 1.0 },
    { t: 0.8, cmd: 'title', text: '导演模式 E2E', sub: 'WebSocket 驱动实机演出', dur: 2.6 },
    { t: 1.0, cmd: 'subtitle', text: '相机正在被服务端指令推着走。', dur: 3.5 },
    { t: 1.2, cmd: 'cam', x: 2160, y: 345, zoom: 1.9, dur: 4.5 },
  ];
  mod.send(JSON.stringify({ op: 'play', tl: TL }));
  await new Promise(r => setTimeout(r, 2000));
  await front(page); await pump(page, 12);
  await page.screenshot({ path: join(out, 'e2e-title.png') });
  await new Promise(r => setTimeout(r, 2600));
  await front(page); await pump(page, 12);
  await page.screenshot({ path: join(out, 'e2e-mid.png') });

  // ④ 数值验证：相机被驱动 / zoom 生效 / 输入锁
  const st = await page.evaluate(() => {
    const g = window.__swGame;
    return {
      cam: { x: g.camera.x / 16, y: g.camera.y / 16, zoom: g.camera.zoom },
      inputX: g.player.inputX,
    };
  });
  const moved = Math.abs(st.cam.x - 2095) > 6 || Math.abs(st.cam.y - 340) > 2;
  L.chk('相机被驱动（已离开起点）', moved, JSON.stringify(st.cam));
  L.chk('zoom ≥1.5（趋近 1.9）', st.cam.zoom > 1.5, `zoom=${st.cam.zoom}`);
  L.chk('ack 收到（play）', got.acks.some(a => String(a).includes('play')), got.acks.join(','));

  // ⑤ player 隐藏 + 时间控制单测
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'player', hide: true } }));
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'time', tod: 0.95, freeze: true } }));
  await new Promise(r => setTimeout(r, 900));
  await front(page); await pump(page, 12);
  const st2 = await page.evaluate(() => {
    const g = window.__swGame;
    return { tod: g.world.clock.timeOfDay, frozen: !!g.world.clock.__dirFrozen };
  });
  await page.screenshot({ path: join(out, 'e2e-hide-night.png') });
  L.chk('时间钉到 0.95', Math.abs(st2.tod - 0.95) < 0.02, `tod=${st2.tod}`);
  L.chk('钟已冻结', st2.frozen);
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'player', hide: false } }));
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'time', freeze: false } }));
} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300));
  await wss.close();
  try { vite.stop(); } catch {}
}

console.log('产物:', out);
process.exit(L.exitCode());
