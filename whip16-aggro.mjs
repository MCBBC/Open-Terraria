// ⑫-2 aggro 不转身门：满潜行（aggro<0）+ 远距（>尺寸和/4+800）+ 未挥击 → 敌保持旧朝向
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const r = {};
  if (g.renderer.fullMap?.open) g.renderer.fullMap.open = false;
  // 敌固定在原地（直造+钉住），距玩家 >1000px（>门限）
  const en = Enemy.fromVanilla(3, pl.cx + 1200, pl.cy);
  en.id = g.entities.nextId++; en.maxHp = 1e9; en.hp = 1e9;
  en.facing = 1; // 初始朝右（玩家在左）
  g.entities.add(en, 'enemies');
  // ① 无潜行：玩家在敌左侧 → seekDirX 应翻 -1
  pl.stealth = 1; // 1=完全可见 aggro=0
  r.aggroNone = { v: pl.aggro, dir: en.seekDirX(pl) };
  // ② 满潜行（蘑菇矿套）+ 远距 + 未挥击：保持 1（不转身）
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  [1546, 1549, 1550].forEach((v, i) => { pl.inv.armor[i] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[v]], stack: 1 }; });
  pl.stealth = 0; // 0=完全隐匿 aggro=-750
  pl.useTime = 0;
  r.stealthFar = { v: pl.aggro, dir: en.seekDirX(pl) };
  // ③ 潜行但挥击中（useTime>0）：正常转身 -1
  pl.useTime = 5;
  r.stealthSwing = { dir: en.seekDirX(pl) };
  // ④ 潜行但近距（<门限）：正常转身
  pl.useTime = 0;
  const nx = en.cx - 60; const ox = pl.x; // 门限≈(尺寸和/4+800)≈830px；近距须<80px
  pl.x = nx - pl.w / 2;
  r.stealthNear = { dir: en.seekDirX(pl) };
  pl.x = ox;
  en.dead = true;
  return r;
});
console.log(JSON.stringify(out));
const ok = out.aggroNone.dir === -1 && out.aggroNone.v === 0
  && out.stealthFar.v === -750 && out.stealthFar.dir === 1
  && out.stealthSwing.dir === -1 && out.stealthNear.dir === -1;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
