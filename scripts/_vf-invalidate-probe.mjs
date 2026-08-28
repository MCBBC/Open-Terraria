// vf 帧缓存失效端到端探针:真实管线( TileStore.setTile → onTileChanged →
// markDirtyAround → invalidateVanillaFrameAt → vanillaFrameFor 重算)验证
// 挖掘/回填/静默区域编辑三种路径下邻居帧现场刷新。
// 2026-08-28 定谳的病灶:写入键 j*st.w+i 与失效键 j*100000+i 公式错位 ⇒ 失效删空。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 900, height: 600 } });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const conv = await p.evaluate(async (b64) => {
  const m = await import('/src/wld/WldImport.ts');
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(m.parseWldToSave(buf).save);
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv);
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(3000);
const res = await p.evaluate(async () => {
  const vf = await import('/src/render/VanillaFraming.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const rock = g.world.rockLevel ?? 0;
  const v2iSheet = (t) => t; // 内部 id 域直查
  // 选样:沙漠表面实心沙格 A,左右邻同为实心沙(内部 id 22)
  let A = null;
  outer: for (let y = 440; y < 480; y++) {
    for (let x = 3950; x < 3995; x++) {
      const t = (xx, yy) => st.flags[st.idx(xx, yy)] ? st.type[st.idx(xx, yy)] : 0;
      if (t(x, y) === 22 && t(x - 1, y) === 22 && t(x + 1, y) === 22 && t(x, y - 1) !== 22) { A = [x, y]; break outer; }
    }
  }
  if (!A) return { error: 'no-sample' };
  const [ax, ay] = A;
  const bx = ax - 1, by = ay;
  const variant = ((ax * 7) + (ay * 11)) % 3;
  const frame = () => vf.vanillaFrameFor(st, ax, ay, st, variant, rock);
  const f0 = frame();
  // ①挖掘路径(普通 setTile → 监听 → markDirtyAround)
  st.setTile(bx, by, 0);
  const f1 = frame();
  // ②回填(应恢复)
  st.setTile(bx, by, 22);
  const f2 = frame();
  // ③静默区域路径(陨石/祭坛族:setTileSilent + markDirtyArea)
  st.setTileSilent(bx, by, 0);
  g.chunks.markDirtyArea(bx - 1, by - 1, bx + 1, by + 1);
  const f3 = frame();
  st.setTile(bx, by, 22); // 复原
  return {
    sample: [ax, ay], f0: [f0.fx, f0.fy], f1: [f1.fx, f1.fy], f2: [f2.fx, f2.fy], f3: [f3.fx, f3.fy],
    digChanged: f1.fx !== f0.fx || f1.fy !== f0.fy,
    refillRestored: f2.fx === f0.fx && f2.fy === f0.fy,
    silentAreaChanged: f3.fx !== f0.fx || f3.fy !== f0.fy,
  };
});
console.log(JSON.stringify(res));
await b.close();
