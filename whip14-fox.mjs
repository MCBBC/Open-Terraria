// ⑤ Foxparks 喷火通道：召唤 1094 后按住 5664 → 1106 火舌连发（4t/发）
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
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  function ITEM_BYID_FIX(v) { return ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[v]]; }
  pl.inv.slots[0] = { id: ITEM_BYID_FIX(5664), stack: 1 }; pl.inv.selected = 0; pl.useTime = 0;
  let flames = 0;
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, b2) => { if (e?.projId === 1106) flames++; return origAdd(e, b2); };
  g.input.mouseX = g.renderer.canvas.width / 2 + 100; g.input.mouseY = g.renderer.canvas.height / 2;
  const hold = setInterval(() => { g.input.mouseDown = true; }, 50); // 模拟按住（summon case 会清一次）
  await new Promise(s2 => setTimeout(s2, 1500));  // ~90t → ~22 发
  clearInterval(hold);
  g.input.mouseDown = false;
  await new Promise(s2 => setTimeout(s2, 300));
  g.entities.add = origAdd;
  const minion = g.entities.projectiles.find((e) => e?.projId === 1094);
  return { flames, channelOff: minion ? !minion.foxChannel : 'nominion' };
});
console.log(JSON.stringify(out));
const ok = out.flames >= 10 && out.channelOff === true;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
