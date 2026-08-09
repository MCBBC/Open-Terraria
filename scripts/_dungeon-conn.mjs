// 地牢塔→地下连通性探查:从塔内厅向下 BFS 非实心格,报告封死位置
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const w = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'dconn', name: 't' });
  const st = w.store;
  const DEFS = tiles.TILE_DEFS;
  const BRICKS = new Set(['v_41_blue_brick','v_43_green_brick','v_44_pink_brick'].map(k=>tiles.TILE_BY_KEY[k]));
  // 找塔:地表附近(groundLevel±40)成片的 dungeon brick
  let towers = [];
  for (let x = 100; x < st.w - 100; x += 5) {
    for (let y = Math.max(2, w.groundLevel - 50); y < w.groundLevel + 30; y++) {
      if (BRICKS.has(st.type[st.idx(x,y)]) && st.flags[st.idx(x,y)]) { towers.push([x,y]); break; }
    }
  }
  if (!towers.length) return { err: 'no tower found' };
  // 取最左塔,在其下方找塔内空气起点(墙=地牢墙 7/8/9)
  const [tx, ty] = towers[0];
  const isDW = (x,y) => { const wl = st.wall[st.idx(x,y)]; return wl>=7&&wl<=9; };
  let start = null;
  for (let y = ty; y < ty + 40 && !start; y++) {
    for (let x = tx; x < tx + 40; x++) {
      if (!st.flags[st.idx(x,y)] && isDW(x,y)) { start = [x,y]; break; }
    }
  }
  if (!start) return { err: 'no foyer air', towers: towers.length };
  // BFS 非实心(只走 type!=spike 等都算可通过——非 solid def)
  const seen = new Set();
  const q = [start];
  seen.add(start[0]+','+start[1]);
  let maxDepth = 0, sealInfo = [];
  const solidAt = (x,y) => {
    if (!st.inBounds(x,y)) return true;
    const i = st.idx(x,y);
    return st.flags[i] && !!DEFS[st.type[i]]?.solid;
  };
  while (q.length) {
    const [x,y] = q.shift();
    maxDepth = Math.max(maxDepth, y);
    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx, ny=y+dy, k=nx+','+ny;
      if (seen.has(k) || ny<0 || ny>=st.h) continue;
      if (solidAt(nx,ny)) {
        // 记录阻挡物类型(限塔区下方)
        if (ny > start[1] && sealInfo.length < 12) {
          const i = st.idx(nx,ny);
          sealInfo.push({ x:nx, y:ny, t: DEFS[st.type[i]]?.key, wall: st.wall[i] });
        }
        continue;
      }
      seen.add(k);
      q.push([nx,ny]);
      if (q.length > 60000) { q.length = 0; break; }
    }
  }
  return { tower: [tx,ty], start, reachedMaxY: maxDepth, ws: w.groundLevel, sealSample: sealInfo };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
