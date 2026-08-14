// 一次性探针:自造键多语言端到端(切语言 → Lang.text 解析 → 图鉴面板 DOM 接线)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&l10ne2e=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 800));

const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  // ① 切 en-US:全部自造键应出英文
  await g.lang ? null : null;
  const { Lang } = await import('/src/i18n/Lang.ts');
  await Lang.setLanguage('en-US');
  out.enSearch = Lang.text('Mods.SandboxWorld.Bestiary.Search');
  out.enMpTitle = Lang.text('Mods.SandboxWorld.MP.Title');
  out.enTime = Lang.text('Game.Time', '09:30');
  out.enArrived = Lang.text('Mods.SandboxWorld.Toast.NpcArrived', 'Slime');
  out.enStyle = Lang.text('UI.HealthManaStyle_New');
  // ② 切回 zh-Hans
  await Lang.setLanguage('zh-Hans');
  out.zhSearch = Lang.text('Mods.SandboxWorld.Bestiary.Search');
  out.zhMpTitle = Lang.text('Mods.SandboxWorld.MP.Title');
  out.zhTime = Lang.text('Game.Time', '09:30');
  out.zhArrived = Lang.text('Mods.SandboxWorld.Toast.NpcArrived', '史莱姆');
  out.zhStyle = Lang.text('UI.HealthManaStyle_New');
  return out;
});
const A = [];
const ok = (n, c) => A.push({ name: n, pass: !!c });
ok('en-Bestiary.Search=Search', r.enSearch === 'Search');
ok('en-MP.Title=Multiplayer', r.enMpTitle === 'Multiplayer');
ok('en-Game.Time含09:30', /09:30/.test(r.enTime) && r.enTime !== 'Game.Time');
ok('en-NpcArrived含Slime', /Slime/.test(r.enArrived));
ok('en-HealthManaStyle_New=Fancy', r.enStyle === 'Fancy');
ok('zh-Bestiary.Search=搜索', r.zhSearch === '搜索');
ok('zh-MP.Title=多人联机', r.zhMpTitle === '多人联机');
ok('zh-Game.Time含09:30', /09:30/.test(r.zhTime) && r.zhTime !== 'Game.Time');
ok('zh-NpcArrived含史莱姆', r.zhArrived.includes('史莱姆'));
ok('zh-HealthManaStyle_New=精致', r.zhStyle === '精致');
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, r, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
