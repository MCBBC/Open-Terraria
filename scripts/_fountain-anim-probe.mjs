// 喷泉（tile 207）动画验收探针（2026-08-27 用户报猩红喷泉切帧错误）。
// 原版语义（GetTileDrawData case 207 :6007-6028）：sheet 7 带 = 关态整图(带0) + 6 帧开态水花；
//   关态（frameY<72,放置默认）静止；开态（frameY≥72,SwitchFountain frameY±72）
//   addFrY=((全局帧+左列x%6)%6)*72 —— 逐喷泉 x 错相。
// SW 修复前：无门（关态也滚带）+ 帧数 floor(504/72)=7（第 7 帧越界回退 (0,0) 帧=回闪关态）+ 无相位。
// 采集：直接 setTile 两座 style4（猩红）喷泉（vanilla 帧编码），采样烘焙 chunk 层
//   anchor 格 16×16 ≈10 次（动画 5 tick/帧），与贴图期望帧逐像素分类：
//   A 关态：全部采样 ≡ 带帧 (144,0)
//   B 开态：采样 ∈ {(144,72+i*72)|i=0..5}，≥2 档（在动），永不 ≡ 关态帧（无回闪）
//   C 相位：A/B 左列 x 差 7（%6=1）→ 同时刻 idx 恒差 1
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const OUT = process.env.OUT ?? '/tmp/fountain-anim';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'], defaultViewport: { width: 1512, height: 862 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(ORIGIN + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 120000 });
const conv = await p.evaluate(async (b64) => {
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return { json: JSON.stringify((await import('/src/wld/WldImport.ts')).parseWldToSave(buf).save) };
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv.json);
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  await sleep(1000);
  inGame = await p.evaluate(() => !!(window.__swGame && window.__swGame.renderer && window.__swGame.player));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await sleep(4000);
// 传送到空旷沙地附近
await p.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3900 * 16; g.player.y = 452 * 16;
  g.player.vx = 0; g.player.vy = 0;
});
await sleep(4000);
// 关掉欢迎弹窗，保证截图可读
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button, .btn, [class*=button]')]
    .find((el) => (el.textContent ?? '').includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(1500);

const result = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { fountainYOffset } = await import('/src/render/TileAnim.ts');
  const T207 = TILE_BY_KEY['v_207_water_fountains'];
  const STYLE = 4; // 猩红（items.ts FOUNTAIN_ITEM_STYLE 942→4）
  const FX0 = 3896, FY0 = 466; // 喷泉 A 左上；466..469 四行，地面 470
  const FX1 = 3903, FY1 = 466; // 喷泉 B（左列 x 差 7）

  // 平地：清空上方、铺实心沙
  for (let x = FX0 - 2; x <= FX1 + 3; x++) {
    for (let y = FY0 - 2; y <= FY1 + 1; y++) st.setTile(x, y, 0, 0, 0);
    st.setTile(x, FY1 + 1, TILE_BY_KEY['v_53_sand_block'], 0, 0);
  }
  const place = (ax, ay, on) => {
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 4; dy++) {
      st.setTile(ax + dx, ay + dy, T207, STYLE * 36 + dx * 18, dy * 18 + (on ? 72 : 0));
    }
  };
  place(FX0, FY0, false); // A 关态
  place(FX1, FY1, true);  // B 开态
  const dirty = new Set();
  for (const [ax, ay] of [[FX0, FY0], [FX1, FY1]]) {
    for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 4; dy++) {
      dirty.add(Math.floor((ax + dx) / 16) + ',' + Math.floor((ay + dy) / 16));
    }
  }
  for (const k of dirty) { const [cx, cy] = k.split(',').map(Number); g.chunks.markDirty(cx, cy); }
  await new Promise((r) => setTimeout(r, 800));

  // 期望帧表：sheet 贴图。★喷泉有 tileTop+2 下移（DRAW_Y_OFFSET[207]=2，TileObjectData
  //  DrawYOffset=2）：渲染 16×16 = 源帧 rows0..13 落在格 rows2..15、rows0..1 透明
  const img = g.chunks.autotiler.atlas.ensureVImage('vanilla/Tiles_207.png');
  const icv = document.createElement('canvas'); icv.width = img.width; icv.height = img.height;
  const ictx = icv.getContext('2d', { willReadFrequently: true });
  ictx.drawImage(img, 0, 0);
  // 期望 16 行合成（+2 下移 + 上格溢出延续，仙人掌同机制）：
  //   格 rows0..1 = dy>0 ? 上格源 rows14..15 : 透明；rows2..15 = 本格源 rows0..13
  // 带 b：0=关（sy=dy*18）；1..6=开（sy=72+dy*18+(b-1)*72）。dy=0 行跨带全同（PIL 实证），
  // 分类用 dy=2 格（7 档全分辨）。
  const cellAt = (dx, dy, b) => {
    const sy = b === 0 ? dy * 18 : 72 + dy * 18 + (b - 1) * 72;
    return ictx.getImageData(STYLE * 36 + dx * 18, sy, 16, 16).data;
  };
  const expected16 = (dx, dy, b) => {
    const own = cellAt(dx, dy, b), up = dy > 0 ? cellAt(dx, dy - 1, b) : null;
    const out = new Uint8ClampedArray(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const o = (y * 16 + x) * 4;
      if (y < 2) {
        if (up) { out[o] = up[(y + 14) * 16 * 4 + x * 4]; out[o + 1] = up[(y + 14) * 16 * 4 + x * 4 + 1]; out[o + 2] = up[(y + 14) * 16 * 4 + x * 4 + 2]; out[o + 3] = up[(y + 14) * 16 * 4 + x * 4 + 3]; }
      } else {
        const s = ((y - 2) * 16 + x) * 4;
        out[o] = own[s]; out[o + 1] = own[s + 1]; out[o + 2] = own[s + 2]; out[o + 3] = own[s + 3];
      }
    }
    return out;
  };
  const eq16 = (d, e) => {
    for (let k = 0; k < 16 * 16 * 4; k++) if (Math.abs(d[k] - e[k]) > 1) return false;
    return true;
  };
  const expOff2 = expected16(0, 2, 0);
  const expOn2 = [];
  for (let b = 1; b <= 6; b++) expOn2.push(expected16(0, 2, b));
  const classifyCell = (d) => eq16(d, expOff2) ? 'OFF' : (() => {
    const i = expOn2.findIndex((e) => eq16(d, e));
    return i >= 0 ? 'on' + i : '??';
  })();

  // 读烘焙 chunk 层 anchor 格（dx=0,dy=0 → 世界 (ax,ay)）
  const readCell = (wx, wy) => {
    const cx = Math.floor(wx / 16), cy = Math.floor(wy / 16);
    const ch = g.chunks.get(cx, cy);
    if (!ch || !ch.tile) return null;
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
    return tctx.getImageData((wx - cx * 16) * 16, (wy - cy * 16) * 16, 16, 16).data;
  };

  // 单元式验证 fountainYOffset 语义（对照当刻全局帧 g=animFrameIdx(207,504)）
  const { animFrameIdx } = await import('/src/render/TileAnim.ts');
  const gNow = animFrameIdx(207, 504);
  const fy = {
    offStatic: fountainYOffset(0, FX0, STYLE * 36) === 0 && fountainYOffset(54, FX0, 162) === 54,
    onLeftCol: fountainYOffset(72, FX1, STYLE * 36) === 72 + ((gNow + (FX1 % 6)) % 6) * 72,
    onRightCol: fountainYOffset(90, FX1 + 1, STYLE * 36 + 18) === 90 + ((gNow + (FX1 % 6)) % 6) * 72,
    wrap6: (() => { // idx 恒在 0..5：任意 (g+phase) 组合源 y ≤ 126+360=486 < 504
      let ok = true;
      for (let g2 = 0; g2 < 6; g2++) for (let ph = 0; ph < 6; ph++) {
        const y = 72 + ((g2 + ph) % 6) * 72;
        if (y + 18 > 504) ok = false;
      }
      return ok;
    })(),
  };

  // 采样读 dy=2 格（世界 y = ay+2）
  // 阶段1：A 关态 / B 开态 采样 12 次
  const N = 12;
  const seqA = [], seqB = [];
  for (let s = 0; s < N; s++) {
    await new Promise((r) => setTimeout(r, 130));
    const a = readCell(FX0, FY0 + 2), bb = readCell(FX1, FY1 + 2);
    if (!a || !bb) return { err: 'no-chunk' };
    seqA.push(classifyCell(a));
    seqB.push(classifyCell(bb));
  }
  // 阶段2：A 也开（模拟 SwitchFountain frameY±72）→ 相位差 = (FX1-FX0)%6 = 1
  for (let dy = 0; dy < 4; dy++) st.setTile(FX0, FY0 + dy, T207, STYLE * 36, dy * 18 + 72);
  for (let dx = -1; dx <= 2; dx++) g.chunks.markDirty(Math.floor((FX0 + dx) / 16), Math.floor((FY0 + 2) / 16));
  await new Promise((r) => setTimeout(r, 800));
  const seqA2 = [], seqB2 = [];
  for (let s = 0; s < N; s++) {
    await new Promise((r) => setTimeout(r, 130));
    const a = readCell(FX0, FY0 + 2), bb = readCell(FX1, FY1 + 2);
    if (!a || !bb) return { err: 'no-chunk2' };
    seqA2.push(classifyCell(a));
    seqB2.push(classifyCell(bb));
  }
  const distinctB = [...new Set(seqB.filter((s) => s.startsWith('on')))];
  const distinctA2 = [...new Set(seqA2.filter((s) => s.startsWith('on')))];
  const pairs = seqA2.map((s, i) => [s, seqB2[i]])
    .filter(([a, bb]) => a.startsWith('on') && bb.startsWith('on'))
    .every(([a, bb]) => ((Number(a.slice(2)) + 1) % 6) === Number(bb.slice(2)));
  return {
    unit: fy,
    seqA_off: seqA,
    seqB_on: seqB,
    onDistinctBands: distinctB.length,
    onNeverOff: !seqB.includes('OFF'),
    onAllClassified: !seqB.includes('??') && !seqA.includes('??'),
    seqA2_on: seqA2,
    seqB2_on: seqB2,
    phaseShiftOK: pairs,
    a2Distinct: distinctA2.length,
  };
});
console.log(JSON.stringify(result, null, 1));
fs.mkdirSync(OUT, { recursive: true });
await p.screenshot({ path: OUT + '/shot.png' });
console.log('截图 →', OUT + '/shot.png');
await b.close();
