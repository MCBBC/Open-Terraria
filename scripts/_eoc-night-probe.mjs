// EoC 自然召唤排查探针（2026-08-28 用户报：收到"邪恶存在"消息但整夜未生成）。
// 流程：载 FTW V2 存档 → 关介绍面板 → 满足 roll 条件直接置 pending + 跳夜中段
// → 捕获 [EoC-*] console 埋点 → 回读 pending/EoC 实体状态。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const p = await b.newPage();
const logs = [];
p.on('console', (m) => { const t = m.text(); if (t.includes('[EoC-') || t.includes('[rload] Wall')) logs.push(t); });
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));
await p.goto(ORIGIN + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 120000 });

const conv = await p.evaluate(async (b64) => {
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(parseWldToSave(buf).save);
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv);
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  await sleep(1000);
  inGame = await p.evaluate(() => !!(window.__swGame && window.__swGame.player));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await sleep(3000);
for (let k = 0; k < 4; k++) { await p.mouse.click(617, 695); await sleep(900); }

// ---- 测试 A：直接置 pending + 跳夜中段（消费端直测）----
// 第一步：先跳时钟跨 DUSK（roll 块会跑一次并清 pending，defense 不达标无妨）
await p.evaluate(() => {
  const g = window.__swGame, w = g.world, DUSK = 19.5 / 24;
  w.clock.timeOfDay = DUSK + 0.375 * 0.3;
});
await sleep(1500);
// 第 1.5 步：夜早段（nightTicks<4860）置 pending 存活性回归——修复前每帧被清
await p.evaluate(() => {
  const g = window.__swGame, w = g.world, DUSK = 19.5 / 24;
  w.clock.timeOfDay = DUSK + 0.375 * 0.1;   // nightTicks≈8640? 0.375*0.1/0.375... =0.1 段→3240<4860
  g.spawnEyePending = true;
});
await sleep(2000);
const survive = await p.evaluate(() => ({
  pending: window.__swGame.spawnEyePending,
  nightTicks: Math.round((((window.__swGame.world.clock.timeOfDay - 19.5/24) % 1 + 1) % 1) / (1 - (19.5/24 - 4.5/24)) * 32400),
}));
console.log('存活回归(期望 pending=true):', JSON.stringify(survive));
// 第二步：跨 DUSK 之后再置 pending（对消费端的干净直测）
const setup = await p.evaluate(() => {
  const g = window.__swGame, w = g.world;
  g.player.baseMaxHp = 400;
  g.player.defense = 30;
  g.spawnEyePending = true;
  return { t: w.clock.timeOfDay, isDay: w.clock.isDay, gl: w.groundLevel, pending: g.spawnEyePending };
});
console.log('SETUP:', JSON.stringify(setup));
await sleep(4000);
const after = await p.evaluate(() => {
  const g = window.__swGame;
  return {
    pending: g.spawnEyePending,
    eoc: (g.entities.enemies ?? []).filter((e) => !e.dead && e.vanillaId === 4).length,
    boss: !!g.boss,
    t: g.world.clock.timeOfDay,
  };
});
console.log('测试A结果:', JSON.stringify(after));
console.log('--- 埋点日志 ---');
for (const l of logs) console.log(l);
await b.close();
