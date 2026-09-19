// 提取旅行商人动态商店池（Chest.SetupTravelShop_GetItem/GetPainting，Chest.cs:786-1240）：
// 每条 `RollLuck(rarity[N]) == 0 [&& cond] → it = X` 解析为 {id, tier, cond}
// 语义（GetItem 体内顺序执行、后命中覆盖前者）在运行期按原顺序复现。
import { readFileSync, writeFileSync } from 'fs';

// SW_TREE（★BJ183 2026-09-20 缺省 Terarria1456→1457；SetupTravelShop_GetItem/GetPainting
// 两版源级 diff=0——但【盘上数据面领先于本提取器】（richer cond 词表 anyBossKill/
// downed_4/downedMechBossAny + ids 多件组 2281-2283 + 66 条 vs 本器 65 条）,全量重产
// 会回退——重产前先恢复提取器词表,见 BJ183 登记债）；配 --out 落 /tmp（禁直接覆盖现库）
const TREE = process.env.SW_TREE || 'Terarria1457';
if (!/^(Terarria14(56|57))$/.test(TREE)) throw new Error(`SW_TREE 非法: ${TREE}`);
const chest = readFileSync(`/Users/vinlic/Project/GLM/SandboxWorld/${TREE}/Terraria/Chest.cs`, 'utf8');

function extractPool(fnName) {
  const start = chest.indexOf(`public static void ${fnName}`);
  const end = chest.indexOf('\n\tpublic static', start + 10);
  const body = chest.slice(start, end);
  const entries = [];
  // if (RollLuck(rarity[N]) == 0 [&& cond]) { it = X; }
  const re = /RollLuck\(rarity\[(\d)\]\) == 0(.*?)\)\s*\n\t*\{\s*\n\s*it = (\d+);/g;
  let m;
  while ((m = re.exec(body))) {
    let condText = m[2] ?? '';
    if (condText.startsWith(' &&')) condText = condText.slice(3).trim();
    // 条件文本 → 本作旗标 token；未知条件 → skip
    let cond = null;
    if (condText.includes('hardMode') && condText.includes('downedMechBoss')) cond = 'hardModeMech';
    else if (condText.includes('hardMode')) cond = 'hardMode';
    else if (condText.includes('downedBoss3')) cond = 'downedBoss3';
    else if (condText.includes('shadowOrbSmashed')) cond = 'shadowOrbSmashed';
    else if (condText.includes('downedMoonlord')) cond = 'downedMoonlord';
    else if (condText.includes('downedMartians')) cond = 'downedMartians';
    else if (condText.includes('downedFrost')) cond = 'downedFrost';
    else if (condText.includes('downedPirates')) cond = 'downedPirates';
    else if (condText.includes('downedGoblins')) cond = 'downedGoblins';
    else if (condText.includes('downedPlantBoss')) cond = 'downedPlantBoss';
    else if (condText.includes('dontStarveWorld')) cond = 'skip'; // 饥荒种子
    else if (condText) cond = 'skip';
    entries.push({ id: Number(m[3]), tier: Number(m[1]), cond });
  }
  return entries;
}

const items = extractPool('SetupTravelShop_GetItem');
const paintings = extractPool('SetupTravelShop_GetPainting');
const outIdx = process.argv.indexOf('--out');
const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : 'src/data/vanilla-travelshop.json';
writeFileSync(OUT_PATH, JSON.stringify({ items, paintings, src: TREE }));
console.log('items:', items.length, 'paintings:', paintings.length,
  '| skip:', [...items, ...paintings].filter((e) => e.cond === 'skip').length);
