// 城镇宠物行走帧序列取证:强制 vx 播放 60 tick,记录 drawImage 的 sy 序列
import puppeteer from 'puppeteer-core';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const KEYS = (process.env.PET_KEYS || 'town_bunny,town_cat').split(',');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
const res = await page.evaluate(async (keys) => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const mk = () => { const w = new World(240, 200, 777, 'pf'); for (let x=0;x<240;x++){for(let y=100;y<200;y++)w.store.setTile(x,y,1); w.store.setTile(x,99,3);} w.clock.time=13500; w.spawnX=60; w.spawnY=94; return w; };
  const load = async (w) => { const p = sf.buildSaveParts(w); await window.__swFlow.loadJson(sf.serializeSave(p.view,p.meta,p.player,0)); document.getElementById('sw-boot-prime')?.remove(); };
  await load(mk()); const g = window.__swGame; await g.whenFirstPaint(3);
  for (let t=0;t<60;t++){ let gone=true; for(const b of document.querySelectorAll('button')) if((b.textContent||'').includes('我已知晓')){b.click();gone=false;break;} if(gone)break; await new Promise(r=>setTimeout(r,100)); }
  if (g.player.dead) g.respawnPlayer?.();
  g.renderer.debugMode = false;
  try { localStorage.setItem('sw_npc_foot_flush','1'); } catch {}
  const frameSeq = new Map();
  window.__seq = frameSeq;
  // 帧-序列取证:直读实体自身 frame 字段(drawEnemy/drawTownNPC 均消费它)
  for (const k of keys) frameSeq.set(k, []);
  g.paused = false;
  let out = {};
  for (const key of keys) {
    const n = new TownNPC(key, (30 + keys.indexOf(key) * 6) * 16, 98 * 16);
    n.vx = 1.2;
    g.entities.npcs.push(n);
    const seq = [];
    for (let t = 0; t < 90; t++) {
      n.vx = 1.2;
      g.fixedUpdate(1 / 60);
      seq.push(n.frame);
    }
    arrRemove(g.entities.npcs, n);
    out[key] = [...new Set(seq)].sort((a, b) => a - b);
  }
  function arrRemove(arr, e) { const i = arr.indexOf(e); if (i >= 0) arr.splice(i, 1); }
  return out;
}, KEYS);
console.log(JSON.stringify(res, null, 1));
await browser.close();
