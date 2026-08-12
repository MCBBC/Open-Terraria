// 阶段6 第三轮单测:替代矿配方可用性 + 水蜡烛刷怪加速
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const recipes = (await import('/src/data/recipes.ts')).RECIPES;
  const items = await import('/src/data/items.ts');
  // 1) 替代矿配方存在且 station/inputs 合法
  const need = ['tin_pickaxe', 'lead_sword', 'tungsten_bar', 'platinum_pickaxe'];
  const recipeOk = {};
  for (const k of need) {
    const r = recipes.find((x) => x.out === k);
    recipeOk[k] = !!r && r.station !== undefined
      && r.inputs.every(([ik]) => items.ITEM_BY_KEY[ik] !== undefined)
      && items.ITEM_BY_KEY[k] !== undefined;
  }
  // 2) 工具数值抽验(官方:铂镐 59% 挖力)
  const plat = items.ITEM_DEFS[items.ITEM_BY_KEY['platinum_pickaxe']];
  const toolOk = plat?.tool?.power === 59;
  // 3) 水蜡烛物品与放置 tile 存在
  const tiles = (await import('/src/data/tiles.ts')).TILE_BY_KEY;
  const wcOk = items.ITEM_BY_KEY['water_candle'] !== undefined && tiles['water_candle'] !== undefined;
  // 4) 配方总数
  return { recipeOk, toolOk, wcOk, totalRecipes: recipes.length };
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 3));
await browser.close();
