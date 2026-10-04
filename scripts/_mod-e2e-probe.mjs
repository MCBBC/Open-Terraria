// mod loader P2 真机 E2E 探针(2026-10-04):装 mod→reload→装载/entry/声明弹幕/
// buff tick/ModProj 实体 全链验证。node 侧构 zip(fflate),浏览器侧经 __swMods 装包。
// ★page.evaluate 内 import 必须带 .ts 全名(vite dev 无扩展名=第二模块实例判例)。
import puppeteer from 'puppeteer-core';
import { zipSync, strToU8 } from 'fflate';

const ENTRY_JS = `
export default function main(sw) {
  const state = { ai: 0, use: 0, pre: 0, post: 0, worldLoad: 0, worldUnload: 0, buffTick: 0, boltUpdate: 0 };
  globalThis.__modL2State = state;
  sw.npcAi('demo_slime', (e) => { state.ai++; e.vy = -0.4; });
  sw.projectileHook('demo_bolt', { update: () => { state.boltUpdate++; } });
  sw.buff('demo_might', { name: '示范之力', texture: 'textures/buff/might.png',
    onTick: () => { state.buffTick++; } });
  sw.itemUse('demo_sword', () => { state.use++; return true; });
  sw.system({
    preUpdate: () => { state.pre++; },
    postEntities: () => { state.post++; },
    onWorldLoad: () => { state.worldLoad++; },
    onWorldUnload: () => { state.worldUnload++; },
  });
  sw.log('ready, power=', sw.config.get('power'));
}
`;

// 1×1 PNG(★node 下 Uint8Array.from(atob()) 产全零——必须 Buffer.from)
const PNG_1PX = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
));
const demoZip = () => zipSync({
  'mod.json': strToU8(JSON.stringify({
    id: 'demo', name: 'Demo Mod', version: '1.0.0', api: 1, side: 'both',
    config: { power: { type: 'number', default: 2, min: 1, max: 10, label: '倍率' } },
  })),
  'content/items/demo_sword.json': strToU8(JSON.stringify({
    key: 'demo_sword', name: '示范剑', rare: 2, value: 2000, maxStack: 1,
    combat: { damage: 25, knockBack: 5.5, useTime: 22, useAnimation: 22, melee: true, autoReuse: true },
    func: { useStyle: 1, autoReuse: 1 },
    texture: 'textures/items/demo_sword.png',
  })),
  'content/items/demo_caster.json': strToU8(JSON.stringify({
    key: 'demo_caster', name: '示范发射器', maxStack: 1,
    combat: { damage: 30, knockBack: 4, useTime: 18, useAnimation: 18, shoot: 'proj:demo_bolt', shootSpeed: 11, noMelee: true, autoReuse: true },
    func: { useStyle: 1, autoReuse: 1 },
    texture: 'textures/items/demo_sword.png',
  })),
  'content/npcs/demo_slime.json': strToU8(JSON.stringify({
    key: 'demo_slime', name: '示范史莱姆', aiStyle: 1, lifeMax: 30, damage: 8, defense: 4,
    width: 22, height: 18, frames: 2, HitSound: 'NPC_Hit_1', DeathSound: 'NPC_Killed_1',
    texture: 'textures/npcs/demo_slime.png',
  })),
  'content/projectiles/demo_bolt.json': strToU8(JSON.stringify({
    key: 'demo_bolt', texture: 'textures/proj/bolt.png', gravity: 0.05, lifetime: 90,
    pierce: 0, width: 12, height: 12, rotateToVelocity: true,
  })),
  'textures/items/demo_sword.png': PNG_1PX,
  'textures/npcs/demo_slime.png': PNG_1PX,
  'textures/proj/bolt.png': PNG_1PX,
  'textures/buff/might.png': PNG_1PX,
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

// ---- ① 装 mod → reload → 装载/entry 验证 ----
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
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 14000));
const boot = await page.evaluate(() => {
  const r = window.__swMods?.result?.() ?? null;
  return {
    loaded: r?.loaded?.map((m) => ({ id: m.manifest.id, counts: m.counts })) ?? null,
    errors: r?.errors ?? null,
    l2: globalThis.__modL2State ?? null,
  };
}).catch(e => ({ evalFail: String(e).slice(0, 150) }));
console.log('BOOT:', JSON.stringify(boot));

// ---- ② ?play=small 进世界:弹幕实体/buff tick/系统钩 ----
const page2 = await browser.newPage();
const errs2 = [];
page2.on('pageerror', (e) => errs2.push('PAGEERR: ' + String(e).slice(0, 200)));
page2.on('console', (m) => { if (m.type() === 'error') errs2.push('CONSOLE: ' + m.text().slice(0, 160)); });
await page2.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 30000));
const ingame = await page2.evaluate(async () => {
  const g = window.__swGame;
  if (!g || !g.player) return { fail: 'no game' };
  // ① 声明弹换算:cast 表 shoot=allocated projId
  const { itemCombat } = await import('/src/data/vanillaItemCombat.ts');
  const casterShoot = itemCombat(30000)?.shoot;   // demo_caster=30001(键序 sword<caster? 字典序 demo_caster<demo_sword → caster=30000!)
  // ② ModProj 直造(经实例化域):cister 弹向右飞
  const { ModProj } = await import('/src/entities/ModProj.ts');
  const pid = typeof casterShoot === "number" ? casterShoot : 2001;
  const mp = new ModProj(g.player.x + 20, g.player.y, 6, 0, 30, 4, pid, true);
  g.entities.add(mp, 'projectiles');
  const alive0 = g.entities.projectiles.includes(mp);
  // ③ buff 施加:mod buff type → player.buffs.apply → onTick 逐 tick
  const { modBuffTypeOf } = await import('/src/mods/buffs.ts');
  const bt = modBuffTypeOf('demo', 'demo_might');
  g.player.buffs.apply(bt, 5);
  const buffInBar = g.player.buffs.active.has(bt);
  await new Promise((r) => setTimeout(r, 1500));
  return {
    casterShoot, projSpawned: alive0,
    projDeadAfterFlight: mp.dead || !g.entities.projectiles.includes(mp),
    buffInBar, buffApplied: true,
    state: globalThis.__modL2State ?? null,
  };
}).catch(e => ({ evalFail: String(e).slice(0, 200) }));
console.log('INGAME:', JSON.stringify(ingame));
await new Promise(r => setTimeout(r, 1000));
const cadence = await page2.evaluate(() => globalThis.__modL2State ?? null)
  .catch(e => ({ evalFail: String(e).slice(0, 150) }));
console.log('CADENCE(+1s):', JSON.stringify(cadence));
console.log('ERRS:', JSON.stringify({ boot: errs.slice(0, 4), ingame: errs2.slice(0, 4) }));
await browser.close();
