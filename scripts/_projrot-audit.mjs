// v4:按 combatWeapon() 派发语义(combatWeapon.ts:125-205)列"magic/shot 兜底 →
// Arrow generic"的已登记武器 × 原版 rotation 分类(修复候选)。
import { PROJECT_ROOT } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';

const ROOT = PROJECT_ROOT;
const src = readFileSync(`${ROOT}/Terarria1456/Terraria/Projectile.cs`, 'utf8');
const srcLines = src.split('\n');
const combat = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`, 'utf8'));
const pdat = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-projectiles.json`, 'utf8'));
const itemsSrc = readFileSync(`${ROOT}/game/src/data/items.ts`, 'utf8');
const registered = new Set([...itemsSrc.matchAll(/vi_(\d+)_/g)].map((m) => +m[1]));

function classifyRotation(type) {
  const hits = [];
  const re = new RegExp(`type == ${type}[^\\d]`);
  for (let i = 0; i < srcLines.length; i++) {
    if (!re.test(srcLines[i])) continue;
    for (let j = i; j < Math.min(i + 40, srcLines.length); j++) {
      const l = srcLines[j].trim();
      if (/^rotation (=|\+=)/.test(l)) hits.push(l);
      if (j > i && /^\t*(public|private|internal) /.test(l)) break;
    }
  }
  if (!hits.length) return 'NONE(基0)';
  const text = hits.join(' | ');
  const set = /rotation = /.test(text);
  if (set && /\+ 1\.57f|MathF\.PI \/ 2f/.test(text) && !/ToRotation\(\)[^-]/.test(text.replace(/\+ MathF\.PI \/ 2f/g, ''))) return 'UP(+90)';
  if (/rotation = velocity\.ToRotation\(\)/.test(text)) return 'RIGHT';
  if (/rotation = \(float\)Math\.Atan2\(velocity\.Y, velocity\.X\)/.test(text)) return 'RIGHT';
  if (/rotation \+= /.test(text) && !set) return 'WIGGLE(基0)';
  return 'OTHER:' + text.slice(0, 60);
}

// useCombatWeapon 内 magic 专属子分支(grep Game.ts):250/633;melee 分支侧发弹走同 generic
const rows = [];
for (const vid of registered) {
  const c = combat[String(vid)];
  if (!c || !c.shoot || c.useAmmo || c.ammo) continue;
  if (c.consumable && c.noMelee) continue;                  // 荧光棒/爆炸物族专属
  if (c.summon) continue;                                    // 召唤专属
  const pd = pdat[String(c.shoot)] ?? {};
  const ai = pd.aiStyle ?? 1;
  if ([3, 13, 19, 99, 15, 16, 161, 165, 14].includes(ai)) continue;  // 专属实体族
  const isMagic = !!(c.magic || c.mana);
  if (!isMagic && !(c.melee || c.ranged || c.noMelee)) continue;
  const dedicated = c.shoot === 250 || c.shoot === 633;
  if (dedicated) continue;
  rows.push({ vid, pid: c.shoot, ai, mode: classifyRotation(c.shoot), magic: isMagic });
}
rows.sort((a, b) => a.pid - b.pid || a.vid - b.vid);
let lastPid = -1;
for (const r of rows) {
  if (r.pid !== lastPid) { console.log(`\n-- proj ${r.pid} (aiStyle ${r.ai}) rotation=${r.mode}`); lastPid = r.pid; }
  console.log(`     item ${r.vid}${r.magic ? ' [magic]' : ''}`);
}
