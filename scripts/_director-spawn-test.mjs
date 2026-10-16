// 导演模式 spawn 修复验证探针(2026-10-16)：spawnMob/spawnNpc 的 blob 上下文动态
// import 修复（location.origin 全 URL）。自含 ws 服务(7788)，不依赖 /tmp 服务。
// 链：装mod → reload → hello → newWorld(小世界快生成) → 世界就绪 → 下发 spawn 三连
// → 断言 ack + 无 resolve 错误 + listNpcs 有实体。
import puppeteer from 'puppeteer-core';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { WebSocketServer } from 'ws';

const MOD_DIR = new URL('../mods/director/', import.meta.url).pathname;
function walkZip(dir, base = '') {
  const out = {};
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`, rel = base + f;
    if (statSync(p).isDirectory()) Object.assign(out, walkZip(p, rel + '/'));
    else out[rel] = new Uint8Array(readFileSync(p));
  }
  return out;
}
const modZip = zipSync(walkZip(MOD_DIR));

// ── 迷你导演服务 ──
const results = { acks: [], errors: [], npcs: null, spawnOk: false, npcOk: false };
let testSent = false;
const wss = new WebSocketServer({ port: 7788, maxPayload: 64 * 1024 * 1024 });
const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));

wss.on('connection', ws => {
  console.log('[srv] mod 已连接');
  ws.on('message', d => {
    try {
      const m = JSON.parse(d);
      if (m.op === 'hello' && m.v >= 4) {
        console.log('[srv] hello v' + m.v + ' → newWorld(小)');
        setTimeout(() => send(ws, { op: 'cmd', c: { cmd: 'newWorld', seed: 'spawn-test', w: 1200, h: 400 } }), 300);
      }
      if (m.op === 'ack') results.acks.push(m.c);
      if (m.op === 'error') { results.errors.push(m.msg); console.log('[srv] ✗', m.msg.slice(0, 120)); }
      if (m.op === 'npcs') results.npcs = m.list;
      if (m.op === 'status' && !testSent && m.scene === 'world' && m.fps > 0 && m.player) {
        testSent = true;
        const px = Math.round(m.player.x), py = Math.round(m.player.y);
        console.log(`[srv] 世界就绪 player@${px},${py} → spawn 三连`);
        send(ws, { op: 'cmd', c: { cmd: 'spawnMob', vid: 1, x: px + 4, y: py - 2 } });      // 绿史莱姆
        send(ws, { op: 'cmd', c: { cmd: 'spawnNpc', key: 'guide', x: px - 4, y: py - 2 } }); // 向导
        send(ws, { op: 'cmd', c: { cmd: 'spawnMob', vid: 4, x: px + 8, y: py - 2 } });      // 僵尸(夜怪)
        setTimeout(() => send(ws, { op: 'cmd', c: { cmd: 'listNpcs' } }), 2500);
        setTimeout(() => { results.spawnDone = true; }, 4000);
      }
    } catch {}
  });
});

// ── 浏览器 ──
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pg] PAGEERR:', String(e).slice(0, 160)));
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 8000));
const b64 = Buffer.from(modZip).toString('base64');
const installed = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return await window.__swMods.install(bytes);
}, b64).catch(e => ({ fail: String(e).slice(0, 120) }));
console.log('[pg] INSTALL:', JSON.stringify(installed).slice(0, 120));
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 11000));

// 等测试完成（最长 70s）
const t0 = Date.now();
while (!results.spawnDone && Date.now() - t0 < 70000) await new Promise(r => setTimeout(r, 2000));

// 页面侧独立断言：实体桶里真有东西
const pageCheck = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g || !g.world) return { inWorld: false };
  return {
    inWorld: true,
    enemies: (g.entities.enemies || []).filter(e => !e.dead).length,
    npcs: (g.entities.npcs || []).filter(e => !e.dead).length,
    critters: (g.entities.critters || []).filter(e => !e.dead).length,
  };
}).catch(e => ({ fail: String(e).slice(0, 120) }));

const resolveErr = results.errors.filter(e => e.includes('resolve module'));
const spawnAcked = results.acks.some(a => a.startsWith('spawnMob'));
const npcAcked = results.acks.some(a => a.startsWith('spawnNpc'));
console.log('══════ 断言 ══════');
console.log('acks:', JSON.stringify(results.acks.filter(a => a.startsWith('spawn') || a.startsWith('newWorld'))));
console.log('resolve 错误:', resolveErr.length, '| 其他错误:', results.errors.length - resolveErr.length);
console.log('页面实体:', JSON.stringify(pageCheck));
console.log('listNpcs:', JSON.stringify(results.npcs)?.slice(0, 200));
const PASS = spawnAcked && npcAcked && resolveErr.length === 0 && pageCheck.inWorld && (pageCheck.enemies + pageCheck.npcs + pageCheck.critters) > 0;
console.log(PASS ? '✅ spawn 修复验证 PASS' : '❌ FAIL');
wss.close(); await browser.close(); process.exit(PASS ? 0 : 1);
