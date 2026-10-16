import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';
const L = ledger();
const wss = new WebSocketServer({ port: 7788 });
let mod = null; const rx = [];
const conns = [];
wss.on('connection', ws => {
  conns.push(ws);
  ws.on('message', d => {
    try {
      const m = JSON.parse(d);
      if (m.op === 'hello') {
        console.log(`hello: mod=${m.mod} v=${m.v} (连接 #${conns.length})`);
        if ((m.v ?? 0) >= 2) mod = ws;  // 只认 v2+
      }
      rx.push(m);
    } catch {}
  });
});
let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} }); ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 800, height: 600 } });
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
  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2000 });
  L.chk('世界', gen.ok);
  await new Promise(r => setTimeout(r, 1500));
  console.log(`连接数=${conns.length}, mod=${mod ? 'v2 ✓' : '未识别'}`);
  if (!mod) { L.chk('v2 mod 连接', false, '只收到旧版连接'); process.exit(1); }
  rx.length = 0;
  mod.send(JSON.stringify({ op: 'cmd', c: { cmd: 'setTile', x: 2095, y: 100, tile: 1 } }));
  await new Promise(r => setTimeout(r, 500));
  const ack = rx.find(m => m.op === 'ack' && String(m.c).includes('setTile'));
  console.log('ack:', ack ? ack.c : 'NONE');
  const t = await page.evaluate(() => window.__swGame.world.store.type[100 * window.__swGame.world.w + 2095]);
  console.log('实际读值:', t);
  L.chk('setTile', t === 1, `tile=${t}`);
} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300)); await wss.close();
  try { vite && vite.stop(); } catch {}
}
process.exit(L.exitCode());
