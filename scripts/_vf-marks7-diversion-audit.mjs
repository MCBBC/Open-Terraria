// 回落门漏网审计(第二批标注 34 格):
// 对每格输出:diverted(重算 crossesForeignMergeDirt)/邻8类型(vanilla域)/链帧。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const MAP = '/Users/vinlic/Downloads/map-FTW_V2 (7).json';
const MARKS = JSON.parse(fs.readFileSync('/Users/vinlic/Downloads/marks-FTW_V2 (7).json', 'utf8')).marks;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveJson = fs.readFileSync(MAP, 'utf8');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
await p.evaluate((t) => window.__swLoadJson(t), saveJson);
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__swGame?.renderer)) break; }
await sleep(3000);
const res = await p.evaluate(async (marks) => {
  const vfSetMod = await import('/src/render/VanillaFraming.ts');
  const sets = vfSetMod.VANILLA_FRAME_SETS;
  const st = window.__swGame.world.store;
  const rock = window.__swGame.world.rockLevel ?? 0;
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const VAN = ['x', 'grass', 'grass', 'grass', '', '', 'copper6', 'ore7', 'ore8', 'ore9']; // 简易无关
  function divertFor(x, y) {
    const ci = st.idx(x, y);
    if (!st.flags[ci]) return false;
    const van0 = vfSetMod.vanillaIdOf ? vfSetMod.vanillaIdOf(st.type[ci]) : -9;
    void van0;
    // 复刻 VanillaTiler 门逻辑(经 vanillaIdOf)
    const tmod = window.__v2i_test;
    void tmod;
    let centerVan = null;
    const nbVan = [];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (!st.inBounds(nx, ny)) { nbVan.push(-2); continue; }
      const ni = st.idx(nx, ny);
      if (!st.flags[ni]) { nbVan.push(-1); continue; }
      nbVan.push(t(ni));
    }
    function t(i) { return st.type[i]; }
    return { nbRaw: nbVan };
  }
  const rows = [];
  for (const m of marks) {
    const { x, y } = m;
    const rawInfo = divertFor(x, y);
    // 真门逻辑用同款函数:这里独立复刻(vanillaIdOf 从 TileMergeFamily 取)
    const fm = await import('/src/render/TileMergeFamily.ts');
    const ci = st.idx(x, y);
    const van0 = fm.vanillaIdOf(st.type[ci]);
    const inDirt = !!sets.MERGE_DIRT[van0];
    let foreign = false; const vanNb = [];
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (!st.inBounds(nx, ny)) { vanNb.push(-2); continue; }
      const ni = st.idx(nx, ny);
      if (!st.flags[ni]) { vanNb.push(-1); continue; }
      const nv = fm.vanillaIdOf(st.type[ni]);
      vanNb.push(nv);
      if (nv !== van0 && sets.MERGE_DIRT[nv]) foreign = true;
    }
    const v = vfSetMod.vanillaFrameFor(st, x, y, st, ((x * 7) + (y * 11)) % 3, rock, true);
    rows.push({
      no: m.no, x, y, k: m.typeKey, centerVan: van0, inDirt,
      foreignDiverts: foreign,
      willUseChainStamp: !foreign,
      chainFx: v.fx, chainFy: v.fy,
      nbVan: vanNb.join(','), nbRaw: rawInfo.nbRaw.join(','),
    });
  }
  const notDiverted = rows.filter((r) => !r.foreignDiverts);
  return { total: rows.length, notDivertedCount: notDiverted.length, notDiverted: notDiverted.slice(0, 12), rows };
}, MARKS);
fs.writeFileSync('/Users/vinlic/.claude/jobs/4a66e745/tmp/marks7-audit.json', JSON.stringify(res.rows, null, 1));
console.log(JSON.stringify({ total: res.total, notDiverted: res.notDivertedCount }));
for (const r of res.notDiverted ?? []) console.log(`#${r.no} (${r.x},${r.y}) ${r.k} centerVan=${r.centerVan} inDirt=${r.inDirt} nb=[${r.nbVan}] stamp=(${r.chainFx},${r.chainFy})`);
await b.close();
