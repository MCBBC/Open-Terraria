// BJ474 现场态检查：裸装玩家为何进 spawnFastRunParticles 翅靴支
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/index.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const SAVE_PATH = process.env.SAVE || needInput(join(DOWNLOADS, 'map-天真的钴最高点 (3).json'));
const saveJson = readFileSync(SAVE_PATH, 'utf8');
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.evaluate(async (text) => {
  const m = await import('/src/save/KvStore.ts');
  await m.kvDelete('sandboxworld.worlds.index');
  for (let i = 1; i <= 8; i++) await m.kvDelete(`sandboxworld.world.${i}`);
  return m.kvSet('sandboxworld.quicksave', text);
}, saveJson);
await page.goto(ORIGIN + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!window.__swFlow).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => new Promise((resolve) => {
  const w = window;
  if (w.__swGame?.world?.store) return resolve({ skip: true });
  const to = setTimeout(() => resolve({ timeout: true }), 120000);
  Promise.resolve(w.__swFlow.quickLoad()).then(() => { clearTimeout(to); resolve({ ok: true }); },
    (e) => { clearTimeout(to); resolve({ err: String(e).slice(0, 300) }); });
}));
await new Promise((r) => setTimeout(r, 8000));
const st = await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  const eq0 = p.equipStats;
  const inv = p.inv;
  const armor = p.inv.armor?.slice(0, 20)?.map((it) => it ? (it.id ?? it) : 0) ?? [];
  const vanity = p.inv.armor?.slice(10)?.map((it) => it ? (it.id ?? it) : 0) ?? [];
  const defs = (id) => { try { const d = window.TILE_BY_KEY ? null : null; return null; } catch { return null; } };
  return {
    wing: eq0.wing ? { logic: eq0.wing.logic, slot: eq0.wing.slot, hidden: eq0.wing.hidden } : null,
    bootFx: eq0.bootFx,
    wingDyeVid_probe: p.wingDyeVid ? p.wingDyeVid() : 'nofn',
    armorIds: armor,
    vanityIds: vanity,
    held: inv.heldItem ? (inv.heldItem()?.id ?? null) : null,
    maxRun: eq0.maxRun, accRun: eq0.accRun,
    vx: p.vx, vy: p.vy, onGround: p.onGround,
  };
});
console.log(JSON.stringify(st, null, 1));
await browser.close();

