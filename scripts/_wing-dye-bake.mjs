// ★翼染冻结·烘焙离线判别（2026-09-27）：染料烘焙本身 vs 槽串味。
//  产三图: A=素切片 B=wingTexSource(lime) 实物 C=手工 applyDyeToImageData;
//  micro-test: B 烘后记 hash → 换键再烘 → 复验 B 是否被覆写(条目独立性)。
//  运行: SW_ORIGIN=http://localhost:5228 node tools/run-diag.mjs --timeout=180000 scripts/_wing-dye-bake.mjs /tmp/wing-bake
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUTDIR = process.argv.slice(4).find((a) => a.startsWith('/')) || '/tmp/wing-bake';
mkdirSync(OUTDIR, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer, { timeout: 120000 });

const out = await page.evaluate(async () => {
  const r = window.__swGame.renderer;
  const proto = Object.getPrototypeOf(r);
  const { dyeApplyOf } = await import('/src/data/vanillaDyes.ts');
  let tex = r.atlas.ensureVImage('vanilla/Wings_1.png');
  for (let i = 0; i < 40 && !(tex && tex.width > 0); i++) {
    await new Promise((res) => setTimeout(res, 50));
    tex = r.atlas.ensureVImage('vanilla/Wings_1.png');
  }
  if (!tex || !tex.width) return { err: 'no-tex' };
  const fh = Math.floor(tex.height / 4);
  const mk = () => { const c = document.createElement('canvas'); c.width = tex.width; c.height = fh; return c; };
  // A 素切片
  const ca = mk(); const xa = ca.getContext('2d');
  xa.drawImage(tex, 0, 0, tex.width, fh, 0, 0, tex.width, fh);
  // C 手工染(bake 链同式)
  const cc = mk(); const xc = cc.getContext('2d', { willReadFrequently: true });
  xc.drawImage(tex, 0, 0, tex.width, fh, 0, 0, tex.width, fh);
  const id = xc.getImageData(0, 0, tex.width, fh);
  const emu = dyeApplyOf(1007);
  emu.uniforms.uDirection = 1;
  proto.applyDyeToImageData.call(r, id.data, tex.width, fh, emu, { sx: 0, sy: 0, sheetW: tex.width, sheetH: tex.height });
  xc.putImageData(id, 0, 0);
  // B wingTexSource 实物
  const cb = proto.wingTexSource.call(r, tex, 0, 0, tex.width, fh, dyeApplyOf(1007), null);
  let micro = null;
  if (cb) {
    const h32 = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
    const grab = (cv) => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const before = h32(grab(cb));
    const beforeObj = cb;
    const cb2 = proto.wingTexSource.call(r, tex, 0, fh, tex.width, fh, dyeApplyOf(1007), null);
    const after = h32(grab(cb));
    micro = { before, after, sameCanvas: cb === cb2, poisoned: before !== after, entries: r.wingBakeCache.size, entryCanvases: new Set([...r.wingBakeCache.values()]).size, entryIsScratch: cb === r.wingTintScratch };
  }
  const save = (cv, name) => {
    const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
    c2.getContext('2d').drawImage(cv, 0, 0);
    return { name, png: c2.toDataURL('image/png'), w: cv.width, h: cv.height };
  };
  const shots = [save(ca, 'A_plain'), save(cc, 'C_manualDye')];
  if (cb) shots.push(save(cb, 'B_wingTexSource'));
  return { texW: tex.width, fh, shots, micro };
});
if (out.err) { console.log(JSON.stringify(out)); process.exit(1); }
for (const s of out.shots) writeFileSync(`${OUTDIR}/${s.name}_${s.w}x${s.h}.png`, Buffer.from(s.png.split(',')[1], 'base64'));
console.log(JSON.stringify({ texW: out.texW, fh: out.fh, micro: out.micro, files: out.shots.map((s) => s.name) }, null, 1));
await browser.close();
process.exit(0);
