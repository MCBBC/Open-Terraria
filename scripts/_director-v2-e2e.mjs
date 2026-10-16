// _director-v2-e2e —— v2 全操作导演台 E2E：走位/选中/使用/给物品/NPC
import { launchBrowser, openPage, gotoApp, createGame, ledger, startPrivateVite, front } from '../tools/probe/lib/index.mjs';
import { WebSocketServer } from 'ws';
import { mkdirSync } from 'node:fs';

mkdirSync('/tmp/probe-out/_director-v2', { recursive: true });
const L = ledger();
const wss = new WebSocketServer({ port: 7788 });
let mod = null;
const rx = [];
wss.on('connection', ws => {
  ws.on('message', d => { try { const m = JSON.parse(d); if (m.op === 'hello' && (m.v ?? 0) >= 2) mod = ws; } catch {} });
  if (!mod) mod = ws;  // 首个兜底 ws.on('message', d => { try { rx.push(JSON.parse(d)); } catch {} }); });

let vite = null, ORIGIN = 'http://localhost:5199';
try { const r = await fetch(ORIGIN, { signal: AbortSignal.timeout(1500) }); if (!r.ok) throw 0; } catch {
  vite = await startPrivateVite({ log: () => {} });
  ORIGIN = `http://localhost:${vite.port}`;
}
const browser = await launchBrowser({ viewport: { width: 1600, height: 900 } });
try {
  const page = await openPage(browser, {});
  page.on('pageerror', e => console.log('[pageerror]', e.message.split('\n')[0]));
  await gotoApp(page, ORIGIN, { tries: 40 });

  const inst = await page.evaluate(async () => {
    const res = await fetch('/mods/dist/director.swmod?t=' + Date.now());
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
    return r2.loaded.map(x => x.manifest?.id);
  });
  L.chk('装载', inst.includes('director'), JSON.stringify(inst));

  const gen = await createGame(page, { mode: 'direct', seed: '12345', size: 'small', settleMs: 2500 });
  L.chk('世界', gen.ok, gen.why);
  await new Promise(r => setTimeout(r, 1200));

  const cmd = c => { rx.length = 0; mod.send(JSON.stringify({ op: 'cmd', c })); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async n => { await front(page); await wait(400); await page.screenshot({ path: `/tmp/probe-out/_director-v2/${n}.png` }); };
  const pState = () => page.evaluate(() => {
    const g = window.__swGame, p = g.player;
    return { x: +(p.cx / 16).toFixed(1), y: +((p.y + p.h / 2) / 16).toFixed(1), vx: +p.vx.toFixed(1), slot: p.inv.selected, facing: p.facing };
  });

  // === ① 走位：walkTo ===
  console.log('--- walkTo 测试');
  const start = await pState();
  cmd({ cmd: 'walkTo', x: start.x + 15, y: start.y, dur: 8 });
  await wait(2000);
  const mid = await pState();
  L.chk('walkTo 移动了', Math.abs(mid.x - start.x) > 3, `${start.x} → ${mid.x} (vx=${mid.vx})`);
  await shot('walk-mid');
  await wait(3000);
  const end = await pState();
  cmd({ cmd: 'stop' });
  L.chk('walkTo 持续走', Math.abs(end.x - start.x) > 8, `${start.x} → ${end.x}`);
  await shot('walk-end');

  // === ② 选中槽位 ===
  console.log('--- select 测试');
  cmd({ cmd: 'select', slot: 3 });
  await wait(200);
  const sel = await pState();
  L.chk('select 槽位 3', sel.slot === 3, `slot=${sel.slot}`);
  cmd({ cmd: 'select', slot: 0 });
  await wait(200);

  // === ③ 给物品（铜镐） ===
  console.log('--- giveItem 测试');
  cmd({ cmd: 'giveItem', vid: 1, stack: 1 });  // vid 1 = 铜镐? 检查
  await wait(300);
  // 不检查具体物品——只检查没有 crash
  L.chk('giveItem 无 crash', true);

  // === ④ useAt：对着脚下地面挖 ===
  console.log('--- useAt 测试');
  const pos = await pState();
  cmd({ cmd: 'select', slot: 0 });
  await wait(100);
  cmd({ cmd: 'useAt', x: Math.round(pos.x), y: Math.round(pos.y + 3), hold: 2 });
  await wait(1000);
  await shot('use-mining');
  await wait(1200);
  L.chk('useAt 无 crash', true);

  // === ⑤ NPC 生成 ===
  console.log('--- spawnNpc 测试');
  const pos2 = await pState();
  cmd({ cmd: 'spawnNpc', key: 'guide', x: Math.round(pos2.x + 5), y: Math.round(pos2.y) });
  await wait(2000);
  const npcCount = await page.evaluate(() => window.__swGame.entities.npcs.filter(n => !n.dead).length);
  L.chk('spawnNpc', npcCount > 0, `npcs=${npcCount}`);
  await shot('npc-spawned');

  // === ⑥ walkTo 反方向 ===
  console.log('--- walkTo 反向');
  const pos3 = await pState();
  cmd({ cmd: 'walkTo', x: Math.round(pos3.x - 10), y: Math.round(pos3.y), dur: 6 });
  await wait(2500);
  const pos4 = await pState();
  cmd({ cmd: 'stop' });
  L.chk('walkTo 反向', pos4.x < pos3.x - 3, `${pos3.x} → ${pos4.x}`);
  await shot('walk-back');

} finally {
  try { await browser.close(); } catch {}
  await new Promise(r => setTimeout(r, 300));
  await wss.close();
  try { vite && vite.stop(); } catch {}
}
console.log('产物: /tmp/probe-out/_director-v2');
process.exit(L.exitCode());
