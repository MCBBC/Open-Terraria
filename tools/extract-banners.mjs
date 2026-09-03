// 提取 BannerSystem 映射(NPCtoBanner switch / BannerToItem 特例+级联区间 /
// BannerToNPC 规范代表 / KillsToBanner)
// ★2026-09-03：基准 1456 → 1457（CLAUDE.md 1457 权威；NPCtoBanner/BannerToItem/
// BannerToNPC/KillsToBanner 四面 1456↔1457 逐值相同——1457 仅动 claimable/net 面）,
// BannerToNPC 为本批新增（旗达标公告规范名 Game.ts 消费,BannerSystem.cs:249-255）。
import { readFileSync, writeFileSync } from 'fs';
const src = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria.GameContent/BannerSystem.cs', 'utf8');
const itemSrc = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/Terraria.ID/ItemID.cs', 'utf8');

// 1) NPCtoBanner:switch fall-through 组 → npcId: bannerId
const npcToBanner = {};
{
  const start = src.indexOf('public static int NPCtoBanner');
  const body = src.slice(start, src.indexOf('public static', start + 40));
  const re = /case (\d+):\s*(?:return (\d+);)?/g;
  let group = [];
  let m;
  while ((m = re.exec(body))) {
    if (m[2] !== undefined) {
      const banner = +m[2];
      for (const n of group) npcToBanner[n] = banner;
      npcToBanner[+m[1]] = banner;
      group = [];
    } else group.push(+m[1]);
  }
}

// 2) BannerToItem:特例 if 链 + 级联区间 if (banner >= X) return base + banner - X
const bannerToItem = {};
const bannerRanges = [];
{
  const start = src.indexOf('public static int BannerToItem');
  const body = src.slice(start, src.indexOf('public static', start + 40));
  let m;
  const reIf = /if \(banner == (\d+)\)\s*\{\s*return (\d+);/g;
  while ((m = reIf.exec(body))) bannerToItem[+m[1]] = +m[2];
  const reR = /if \(banner (>=?) (\d+)\)\s*\{\s*return (\d+) \+ banner - (\d+);/g;
  while ((m = reR.exec(body))) bannerRanges.push({ gt: m[1] === '>', min: +m[2], base: +m[3], off: +m[4] });
  // 末段无条件 return base + banner - off（1..min 区间兜底）
  if ((m = body.match(/\n\t\treturn (\d+) \+ banner - (\d+);/))) {
    bannerRanges.push({ gt: false, min: 1, base: +m[1], off: +m[2] });
  }
}

// 3) BannerToNPC:旗种 → 规范代表 NPC id（BannerSystem.cs:1156 switch,1..292 全表 +
//  `_ => 0` 兜底）。同旗多 NPC（如蓝史莱姆 74/297/298 同旗 8）原版公告/tooltip 一律
//  取此规范 id 的名字——不能用 npcToBanner 反查的最小 npc id 顶替（机制不同）。
const bannerToNpc = {};
{
  const start = src.indexOf('public static int BannerToNPC');
  const body = src.slice(start, src.indexOf('public static', start + 40));
  let m;
  const re = /(\d+) => (\d+)/g;
  while ((m = re.exec(body))) bannerToNpc[+m[1]] = +m[2];
}

// 4) KillsToBanner:CreateIntSet(默认, k,v,...)
const killsToBanner = {};
{
  const m = itemSrc.match(/KillsToBanner = Factory\.CreateIntSet\(([^)]*)\)/);
  const parts = m[1].split(',').map((s) => s.trim());
  killsToBanner['*'] = +parts[0];
  for (let i = 1; i + 1 < parts.length; i += 2) killsToBanner[+parts[i]] = +parts[i + 1];
}

writeFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/vanilla-banners.json',
  JSON.stringify({ npcToBanner, bannerToItem, bannerRanges, bannerToNpc, killsToBanner }, null, 1));
console.log('npcToBanner:', Object.keys(npcToBanner).length,
  '| 特例:', Object.keys(bannerToItem).length,
  '| 区间:', bannerRanges.length,
  '| bannerToNpc:', Object.keys(bannerToNpc).length,
  '| kills 特例:', Object.keys(killsToBanner).length - 1);
