// mod loader L2 真机 E2E 探针(2026-10-04):装 mod→reload→装载/entry/系统钩/图标/
// 自定义 AI 召唤 全链验证。node 侧构 zip(fflate),浏览器侧经 __swMods 句柄装包。
// 用法:SW_ORIGIN 指向私有 vite 实例(5201+ 端口约定)。
import puppeteer from 'puppeteer-core';
import { zipSync, strToU8 } from 'fflate';

const ENTRY_JS = `
export default function main(sw) {
  const state = { ai: 0, use: 0, pre: 0, post: 0, worldLoad: 0, worldUnload: 0 };
  globalThis.__modL2State = state;
  sw.npcAi('demo_slime', (e) => { state.ai++; e.vy = -0.4; });
  sw.itemUse('demo_sword', () => { state.use++; return true; });
  sw.system({
    preUpdate: () => { state.pre++; },
    postEntities: () => { state.post++; },
    onWorldLoad: () => { state.worldLoad++; },
    onWorldUnload: () => { state.worldUnload++; },
  });
}
`;

// 1×1 PNG(物品图标可见性=位图解码成功即可;像素级对拍另批)
// ★node 下 Uint8Array.from(atob()) 产全零(2026-10-04 实证)——必须 Buffer.from
const PNG_1PX = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
));
const demoZip = () => zipSync({
  'mod.json': strToU8(JSON.stringify({ id: 'demo', name: 'Demo Mod', version: '1.0.0', api: 1, side: 'both' })),
  'content/items/demo_sword.json': strToU8(JSON.stringify({
    key: 'demo_sword', name: '示范剑', rare: 2, value: 2000, maxStack: 1,
    combat: { damage: 25, useTime: 22, useAnimation: 22, melee: true }, func: { useStyle: 1 },
    texture: 'textures/items/demo_sword.png',
  })),
  'content/npcs/demo_slime.json': strToU8(JSON.stringify({
    key: 'demo_slime', name: '示范史莱姆', aiStyle: 1, lifeMax: 30, damage: 8, defense: 4,
    width: 22, height: 18, frames: 2, HitSound: 'NPC_Hit_1', DeathSound: 'NPC_Killed_1',
    texture: 'textures/npcs/demo_slime.png',
  })),
  'textures/items/demo_sword.png': PNG_1PX,
  'textures/npcs/demo_slime.png': PNG_1PX,
  'scripts/main.js': strToU8(ENTRY_JS),
});

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 160)); });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';

// ---- ① 装 mod(经 __swMods.install;zip 字节经 base64 过墙) ----
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 12000));
const b64 = Buffer.from(demoZip()).toString('base64');
const installed = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return await window.__swMods.install(bytes);
}, b64).catch(e => ({ evalFail: String(e).slice(0, 150) }));
console.log('INSTALLED:', JSON.stringify(installed));

// ---- ② reload 后验证装载 + entry 执行(blob URL import)+ L1 注册 ----
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 14000));
const boot = await page.evaluate(() => {
  const r = window.__swMods?.result?.() ?? null;
  return {
    loaded: r?.loaded?.map((m) => ({ id: m.manifest.id, counts: m.counts })) ?? null,
    errors: r?.errors ?? null,
    l2State: globalThis.__modL2State ?? null,
  };
}).catch(e => ({ evalFail: String(e).slice(0, 150) }));
console.log('BOOT:', JSON.stringify(boot));

// ---- ③ ?play=small 进世界:系统钩跑动+图标+召唤 mod NPC(自定义 AI) ----
const page2 = await browser.newPage();
const errs2 = [];
page2.on('pageerror', (e) => errs2.push('PAGEERR: ' + String(e).slice(0, 200)));
page2.on('console', (m) => { if (m.type() === 'error') errs2.push('CONSOLE: ' + m.text().slice(0, 160)); });
await page2.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 30000));
const ingame = await page2.evaluate(async () => {
  const g = window.__swGame;
  if (!g || !g.player) return { fail: 'no game' };
  // mod 物品入包 → 图标(vicon 覆盖键)
  g.player.inv.slots[0] = { id: 30000, stack: 1 };
  await new Promise((r) => setTimeout(r, 300));
  const icon = window.__swAtlas?.vicon?.(30000) ?? null;
  // 召唤 mod NPC(800=示范史莱姆)→ mod AI 接管
  g.debugSpawnNpc?.(800, 1, false);
  await new Promise((r) => setTimeout(r, 1200));
  const modNpc = g.entities.enemies.find((e) => e.vanillaId === 800) ?? null;
  return {
    iconOk: !!(icon && icon.img && icon.img.width > 0),
    iconW: icon?.img?.width ?? null,
    modNpcAlive: !!modNpc && !modNpc.dead,
    modNpcCount: g.entities.enemies.filter((e) => e.vanillaId === 800).length,
    state: globalThis.__modL2State ?? null,
    saveHeaderMods: null,
  };
}).catch(e => ({ evalFail: String(e).slice(0, 200) }));
console.log('INGAME:', JSON.stringify(ingame));

// ---- ④ 系统钩节奏取证(1s 后计数差 ≈60 → fixedUpdate 每拍派发) ----
await new Promise(r => setTimeout(r, 1000));
const cadence = await page2.evaluate(() => globalThis.__modL2State ?? null)
  .catch(e => ({ evalFail: String(e).slice(0, 150) }));
console.log('CADENCE(+1s):', JSON.stringify(cadence));
console.log('ERRS:', JSON.stringify({ boot: errs.slice(0, 4), ingame: errs2.slice(0, 4) }));
await browser.close();
