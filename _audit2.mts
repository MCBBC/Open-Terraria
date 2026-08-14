// 疑似 56 件逐一对照原版:它们是功能盔甲(有 def,非 vanity)还是漏提?
import { readFileSync } from 'node:fs';
import statsJson from './src/data/vanilla-itemstats.json';
const STATS = statsJson as Record<string, any>;
const src = readFileSync('../Terarria1456/Terraria/Item.cs', 'utf8').split('\n');
// 找 case N 块内的字段(含 helper:DefaultToVanity/DefaultToHeadArmor 等)
function caseBlock(vid: number): string[] {
  const start = src.findIndex((l) => l === `\t\tcase ${vid}:`);
  if (start < 0) return [];
  const out = [];
  for (let j = start + 1; j < src.length; j++) {
    if (/^\t\tcase \d+:/.test(src[j]) || /^\t\t\}/.test(src[j])) break;
    out.push(src[j]);
  }
  return out;
}
const samples = [229, 373, 848, 1159, 1933, 3801];
for (const vid of samples) {
  const blk = caseBlock(vid);
  const hasVan = blk.some((l) => l.includes('vanity = true'));
  const def = blk.find((l) => l.includes('defense'));
  console.log(vid, 'vanity:', hasVan, '| def:', def?.trim() ?? '无', '| 块行数:', blk.length);
}
