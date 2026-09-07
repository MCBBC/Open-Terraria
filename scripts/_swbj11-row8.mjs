// SW-BJ11: h2 r8 残差定位 — 双方 y36-46 逐行占据
import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', userDataDir: '/tmp/swbj11-profile', args: ['--no-first-run'], defaultViewport: { width: 400, height: 300 } });
const p = await b.newPage();
p.setDefaultTimeout(240000);
await p.goto((process.env.SW_ORIGIN ?? 'http://localhost:5210') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);
const out = await p.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FW = 40, FH = 56;
  const imgCache = new Map();
  async function V(name) {
    if (imgCache.has(name)) return imgCache.get(name);
    const img = new Image();
    const ok = await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); img.src = '/sprites/vanilla/' + name; });
    if (!ok) throw new Error('missing ' + name);
    imgCache.set(name, img); return img;
  }
  const m = await import('/src/player/PaperDoll.ts');
  const a = { name: 'probe', hair: 1, skinVariant: 0,
    hairColor: { r: 120, g: 80, b: 40 }, skinColor: { r: 255, g: 219, b: 172 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 187, g: 79, b: 60 },
    undershirtColor: { r: 130, g: 130, b: 130 }, pantsColor: { r: 95, g: 105, b: 200 },
    shoeColor: { r: 150, g: 110, b: 80 }, difficulty: 0 };
  const equip = { head: 2, body: 2, legs: 2 };
  const row = 8;
  // ours
  let d = null;
  for (let k = 0; k < 12 && !d; k++) { d = m.compositePaperDoll(a, equip, { rows: { body: row, legs: row } }); if (!d) await sleep(300); }
  await sleep(600);
  d = m.compositePaperDoll(a, equip, { rows: { body: row, legs: row } });
  const ocv = document.createElement('canvas'); ocv.width = FW; ocv.height = FH;
  ocv.getContext('2d').drawImage(d, 0, 0, FW, FH, 0, 0, FW, FH);
  const od = ocv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, FW, FH).data;
  // ref(甲态,行8,hg=-2)
  const rc = document.createElement('canvas'); rc.width = FW; rc.height = FH;
  const c = rc.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingEnabled = false;
  const sc2 = document.createElement('canvas'); sc2.width = FW; sc2.height = FH;
  const s2 = sc2.getContext('2d', { willReadFrequently: true });
  s2.imageSmoothingEnabled = false;
  const blit = (img, sx, sy) => { s2.clearRect(0, 0, FW, FH); s2.drawImage(img, sx, sy, FW, FH, 0, 0, FW, FH); return sc2; };
  const hg = -2;
  const ax = 4, ay = 1;
  const la = await V('Armor_Legs_2.png'), ba = await V('Armor_Armor_2.png'), ha = await V('Armor_Head_2.png');
  const s10 = await V('Player_0_10.png');
  c.drawImage(la, 0, row * FH, FW, FH, 0, 0, FW, FH);
  c.drawImage(blit(ba, FW, FH), 0, hg);
  c.drawImage(blit(ba, ax * FW, (ay + 2) * FH), 0, hg);
  c.drawImage(blit(ba, 0, 0), 0, hg);
  c.drawImage(blit(ba, 0, FH), 0, hg);
  c.drawImage(blit(ba, ax * FW, ay * FH), 0, hg);
  const s0 = await V('Player_0_0.png'), s1 = await V('Player_0_1.png'), s2img = await V('Player_0_2.png');
  c.drawImage(s0, 0, row * FH, FW, FH, 0, 0, FW, FH);
  c.drawImage(s1, 0, row * FH, FW, FH, 0, 0, FW, FH);
  c.drawImage(s2img, 0, row * FH, FW, FH, 0, 0, FW, FH);
  c.drawImage(ha, 0, row * FH, FW, FH, 0, 0, FW, FH);
  const vd = c.getImageData(0, 0, FW, FH).data;
  const occ = (dd, y) => { let s = ''; for (let x = 8; x < 32; x++) s += dd[(y * FW + x) * 4 + 3] > 24 ? '#' : '.'; return s; };
  const lines = [];
  for (let y = 36; y <= 46; y++) lines.push(`y=${y} V:${occ(vd, y)}  O:${occ(od, y)}`);
  void s10;
  return lines;
}).catch((e) => [String(e).slice(0, 200)]);
console.log(out.join('\n'));
await b.close();
