// 往返完整性:generateWorld → saveGame → loadSave 逐 tile 对比
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const { saveGame, loadSave } = await import('/src/save/SaveFile.ts');
  const { Player } = await import('/src/entities/Player.ts').catch(() => ({}));
  const world = await mod.generateWorld({ width: 2100, height: 700, seedText: 'rt1', name: 't' });
  const st = world.store;
  const stats = (store, label) => {
    let floating = 0, jg = 0, jgYMin = 1e9;
    for (let x = 1; x < store.w - 1; x++) for (let y = 1; y < store.h - 1; y++) {
      const i = store.idx(x, y);
      if (store.flags[i] && !store.flags[store.idx(x,y+1)] && !store.flags[store.idx(x-1,y)] && !store.flags[store.idx(x+1,y)] && !store.flags[store.idx(x,y-1)]) floating++;
      // jgrass y 最小值(用 mud id 近似:取 TILE_DEFS 查 key)
    }
    return { label, floating };
  };
  const before = stats(st, 'before');
  // saveGame 需要 Player —— 构造最小假 player(只访问 inv.slots/selected/x/y/hp)
  const tiles = await import('/src/data/tiles.ts');
  const fakePlayer = { hp: 100, x: 100, y: 100, inv: { slots: Array(40).fill(null), selected: 0 } };
  const json = saveGame(world, fakePlayer, 0);
  const loaded = loadSave(json).world;
  const after = stats(loaded.store, 'after');
  // 逐 tile 对比 type/flags
  let mismatch = 0, mm = [];
  for (let i = 0; i < st.type.length; i++) {
    const a = st.type[i], b = loaded.store.type[i];
    const af = st.flags[i], bf = loaded.store.flags[i];
    if (a !== b || af !== bf) {
      mismatch++;
      if (mm.length < 5) mm.push({ i: i, x: i % st.w, y: Math.floor(i / st.w), a, b, af, bf });
    }
  }
  return { before, after, mismatch, mm };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
