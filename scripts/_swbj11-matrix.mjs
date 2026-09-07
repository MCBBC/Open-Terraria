// SW-BJ11 2026-09-07 定谳探针 v4:全矩阵扫描(变体×发×帧×甲) 独立原版式 vs 本仓烘焙
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = '/tmp/swbj11';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj11-profile',
  args: ['--no-first-run'], defaultViewport: { width: 400, height: 300 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FW = 40, FH = 56;
  const imgCache = new Map();
  async function V(name) {
    if (imgCache.has(name)) return imgCache.get(name);
    const img = new Image();
    const ok = await new Promise((res) => {
      img.onload = () => res(true); img.onerror = () => res(false);
      img.src = '/sprites/vanilla/' + name;
    });
    if (!ok && !name.startsWith('Player_0_')) return V(name.replace(/^Player_\d+_/, 'Player_0_'));
    if (!ok) throw new Error('missing ' + name);
    imgCache.set(name, img);
    return img;
  }
  const OFFS = [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];
  function armCell(row) {
    switch (row) {
      case 0: return [2, 0]; case 1: return [3, 0]; case 2: return [4, 0]; case 3: return [5, 0];
      case 4: return [6, 0]; case 5: return [2, 1]; case 6: return [3, 1];
      case 7: case 8: case 9: case 10: return [4, 1];
      case 11: case 12: case 13: return [3, 1];
      case 14: return [5, 1]; case 15: case 16: return [6, 1]; case 17: return [5, 1];
      default: return [3, 1];
    }
  }
  const scratch = document.createElement('canvas');
  scratch.width = FW; scratch.height = FH;
  const sc = scratch.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingEnabled = false;
  function blit(img, sx, sy, h = FH) {
    sc.clearRect(0, 0, FW, FH);
    sc.drawImage(img, sx, sy, FW, h, 0, 0, FW, h);
    return scratch;
  }
  async function vanillaFrame(row, equip, variant, hair) {
    const out = document.createElement('canvas');
    out.width = FW; out.height = FH;
    const c = out.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = false;
    const hg = OFFS[row] - 2;
    const [ax, ay] = armCell(row);
    const torsoX = row === 5 ? 1 : 0;
    const female = variant !== 0 && variant !== 1 && variant !== 2 && variant !== 3 && variant !== 8 && variant !== 10;
    const dy = female ? 2 : 0;
    const g = (n) => `Player_${variant}_${n}.png`;
    const s0 = await V(g(0)), s1 = await V(g(1)), s2 = await V(g(2));
    const s3 = await V(g(3)), s4 = await V(g(4)), s5 = await V(g(5));
    const s6 = await V(g(6)), s7 = await V(g(7)), s8 = await V(g(8));
    const s10 = await V(g(10)), s11 = await V(g(11)), s12 = await V(g(12));
    const s13 = await V(g(13));
    // GetHairSettings(Player.cs:16645-16760):head 0/全发档=完整发;帽发档=Alt 发;其余=整隐
    const FULL_HAIR = new Set([10, 12, 28, 42, 62, 97, 106, 113, 116, 119, 133, 138, 139, 163, 178, 181, 191, 198, 217, 218, 220, 222, 224, 225, 228, 229, 230, 232, 235, 238, 242, 243, 244, 245, 272, 273, 274, 277, 284, 290]);
    const HAT_HAIR = new Set([13, 14, 15, 16, 18, 21, 24, 25, 26, 29, 40, 44, 51, 56, 59, 60, 63, 64, 65, 67, 68, 69, 81, 92, 94, 95, 100, 114, 121, 126, 130, 136, 140, 143, 145, 158, 159, 161, 182, 184, 190, 195, 215, 216, 219, 223, 226, 227, 231, 233, 234, 262, 263, 264, 265, 267, 275, 279, 280, 281, 286, 289, 292]);
    const headIdx = equip?.head ?? 0;
    const hairMode = headIdx === 0 || FULL_HAIR.has(headIdx) ? 'full' : HAT_HAIR.has(headIdx) ? 'alt' : 'none';
    const hairImg = hairMode === 'none' ? null : await V(`${hairMode === 'alt' ? 'Player_HairAlt' : 'Player_Hair'}_${hair + 1}.png`);
    const hy = Math.max(0, row - 6) * FH;
    // backHairDraw(Player.cs:17030):51-115 带缺口 + {6,133,134,146,162}
    const BACK_HAIR = (h2) => (h2 === 6 || h2 === 133 || h2 === 134 || h2 === 146 || h2 === 162)
      || (h2 > 50 && (h2 < 56 || h2 > 63) && (h2 < 74 || h2 > 77) && (h2 < 88 || h2 > 89)
        && h2 !== 94 && h2 !== 100 && h2 !== 104 && h2 !== 112 && h2 < 116);
    if (hairImg && BACK_HAIR(hair)) c.drawImage(hairImg, 0, hy, FW, FH, 0, 0, FW, FH);
    if (!equip?.legs) {
      c.drawImage(s10, 0, row * FH, FW, FH, 0, 0, FW, FH);
      c.drawImage(s11, 0, row * FH, FW, FH, 0, 0, FW, FH);
      c.drawImage(s12, 0, row * FH, FW, FH, 0, 0, FW, FH);
    } else {
      // 12_Skin_Composite :1289 皮肤腿在甲下(IsBottomOverridden 白名单外)——
      // 坐姿 hidesBottomSkin 不画;袍/裙族(LEGS_HIDE_SKIN)不画
      const LEGS_HIDE = new Set([55, 63, 67, 106, 138, 140, 143, 217, 222, 226, 228]);
      const la = await V(`Armor_Legs_${equip.legs}.png`);
      if (!LEGS_HIDE.has(equip.legs)) c.drawImage(s10, 0, row * FH, FW, FH, 0, 0, FW, FH);
      c.drawImage(la, 0, row * FH, FW, FH, 0, 0, FW, FH);
    }
    c.drawImage(blit(s3, torsoX * FW, dy * FH), 0, hg);
    c.drawImage(blit(s4, FW, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s4, torsoX * FW, dy * FH), 0, hg);
    c.drawImage(blit(s4, 0, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s6, FW, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s6, torsoX * FW, dy * FH), 0, hg);
    c.drawImage(blit(s6, 0, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s7, ax * FW, (ay + 2) * FH), 0, hg);
    c.drawImage(blit(s5, ax * FW, (ay + 2) * FH), 0, hg);
    c.drawImage(blit(s8, ax * FW, (ay + 2) * FH), 0, hg);
    c.drawImage(blit(s13, ax * FW, (ay + 2) * FH), 0, hg);
    if (equip?.body) {
      const ba = await V(`Armor_Armor_${equip.body}.png`);
      c.drawImage(blit(ba, FW, (1 + dy) * FH), 0, hg);   // 后肩
      c.drawImage(blit(ba, ax * FW, (ay + 2) * FH), 0, hg);
      c.drawImage(blit(ba, torsoX * FW, dy * FH), 0, hg);
      c.drawImage(blit(ba, 0, (1 + dy) * FH), 0, hg);    // 前肩
      c.drawImage(blit(ba, ax * FW, ay * FH), 0, hg);
    } else {
      c.drawImage(blit(s7, ax * FW, ay * FH), 0, hg);
      c.drawImage(blit(s8, ax * FW, ay * FH), 0, hg);
      c.drawImage(blit(s13, ax * FW, ay * FH), 0, hg);
      c.drawImage(blit(s6, ax * FW, ay * FH), 0, hg);
    }
    c.drawImage(s0, 0, row * FH, FW, FH, 0, 0, FW, FH);
    c.drawImage(s1, 0, row * FH, FW, FH, 0, 0, FW, FH);
    c.drawImage(s2, 0, row * FH, FW, FH, 0, 0, FW, FH);
    if (hairImg) {
      const frontH = BACK_HAIR(hair) ? 26 : FH;
      c.drawImage(hairImg, 0, hy, FW, frontH, 0, 0, FW, frontH);
    }
    if (equip?.head) {
      const ha = await V(`Armor_Head_${equip.head}.png`);
      c.drawImage(ha, 0, row * FH, FW, FH, 0, 0, FW, FH);
    }
    return c.getImageData(0, 0, FW, FH);
  }
  const m = await import('/src/player/PaperDoll.ts');
  const baseApp = { name: 'probe', hair: 1, skinVariant: 0,
    hairColor: { r: 120, g: 80, b: 40 }, skinColor: { r: 255, g: 219, b: 172 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 187, g: 79, b: 60 },
    undershirtColor: { r: 130, g: 130, b: 130 }, pantsColor: { r: 95, g: 105, b: 200 },
    shoeColor: { r: 150, g: 110, b: 80 }, difficulty: 0 };
  async function oursFrame(row, equip, variant, hair) {
    const a = { ...baseApp, skinVariant: variant, hair };
    const opts = row === 0 ? undefined : { rows: { body: row, legs: row } };
    let d = null;
    for (let k = 0; k < 12 && !d; k++) { d = m.compositePaperDoll(a, equip, opts); if (!d) await sleep(300); }
    await sleep(500);
    d = m.compositePaperDoll(a, equip, opts);
    if (!d) return null;
    const cv = document.createElement('canvas');
    cv.width = FW; cv.height = FH;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = false;
    const isFull = d.height >= 20 * FH;
    c.drawImage(d, 0, (isFull ? row : 0) * FH, FW, FH, 0, 0, FW, FH);
    return c.getImageData(0, 0, FW, FH);
  }
  function diffPx(v, o) {
    if (!v || !o) return { n: -1 };
    let mm = 0; const cells = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const va = v.data[(y * FW + x) * 4 + 3] > 24, oa = o.data[(y * FW + x) * 4 + 3] > 24;
      if (va !== oa) { mm++; if (cells.length < 400) cells.push([x, y, va ? 1 : 0, oa ? 1 : 0]); }
    }
    return { n: mm, cells };
  }
  const results = [];
  const rowsTest = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const states = [];
  // 裸肤:男0/女4 × 发0/1/2 × 全帧
  for (const variant of [0, 4]) for (const hair of [0, 1, 2]) {
    for (const row of rowsTest) states.push({ row, equip: null, variant, hair, tag: `bare v${variant} h${hair} r${row}` });
  }
  // 甲族:男0/女4 × 铜银金套装 站姿+行走行
  const sets = [[1, 1, 1], [2, 2, 2], [3, 3, 3], [4, 4, 4], [5, 5, 5]];
  for (const eq of sets) {
    for (const variant of [0, 4]) {
      for (const row of [0, 6, 7, 8, 9, 14, 15]) states.push({ row, equip: { head: eq[0], body: eq[1], legs: eq[2] }, variant, hair: variant === 0 ? 1 : 8, tag: `armor h${eq[0]}b${eq[1]}l${eq[2]} v${variant} r${row}` });
    }
  }
  for (const st of states) {
    const d = diffPx(await vanillaFrame(st.row, st.equip, st.variant, st.hair), await oursFrame(st.row, st.equip, st.variant, st.hair));
    if (d.n !== 0) results.push({ tag: st.tag, n: d.n, cells: d.cells });
  }
  return results;
}).catch((e) => ({ err: String(e && e.stack || e).slice(0, 400) }));
console.log(JSON.stringify(out).slice(0, 8000));
writeFileSync(OUT + '/matrix.json', JSON.stringify(out, null, 1));
console.log('MATRIX-DONE', Array.isArray(out) ? `${out.length} nonzero states` : '');
await browser.close();
