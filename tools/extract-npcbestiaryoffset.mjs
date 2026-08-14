// 提取 NPCID.Sets.NPCBestiaryDrawOffset（1.4.5.6，NPCID.cs）全表 →
// src/data/vanilla-npcbestiaryoffset.json。
// 三段合并（NPCBestiaryDrawOffsetCreation :4955-4975）：GetGroxEntries → GetLeinforsEntries
// → GetRedigitEntries 依次覆盖（后写胜）。字段见 struct NPCBestiaryDrawModifiers（:15-41）。
// 消费语义（UnlockableNPCEntryIcon.Update :52-82）：scale=Scale（portrait 模式 PortraitScale
// 优先）+ Position 偏移 + Hide 不画本体 + CustomTexturePath 替换贴图 + Frame 选帧 +
// Rotation 旋转 + Velocity/Direction/SpriteDirection/IsWet 动画与朝向。
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../../Terarria1456/Terraria.ID/NPCID.cs', import.meta.url).pathname;
const OUT = new URL('../src/data/vanilla-npcbestiaryoffset.json', import.meta.url).pathname;

const src = readFileSync(SRC, 'utf8');

function section(name) {
  const start = src.indexOf(`private static Dictionary<int, NPCBestiaryDrawModifiers> ${name}()`);
  if (start < 0) throw new Error(`找不到 ${name}`);
  const next = src.indexOf('private static Dictionary<int, NPCBestiaryDrawModifiers>', start + 60);
  return src.slice(start, next > 0 ? next : undefined);
}

function num(s) { return Number(s.replace(/f/g, '')); }

/** 单条目对象字面量 → 字段表 */
function parseEntry(body) {
  const o = {};
  let m;
  if ((m = body.match(/Position\s*=\s*new Vector2\(([^)]+)\)/))) {
    const [x, y] = m[1].split(',').map(num);
    o.position = [x, y];
  }
  if ((m = body.match(/PortraitPositionXOverride\s*=\s*([\d.]+)f?/))) o.portraitX = num(m[1]);
  if ((m = body.match(/PortraitPositionYOverride\s*=\s*([\d.]+)f?/))) o.portraitY = num(m[1]);
  if ((m = body.match(/Rotation\s*=\s*(-?[\d.]+)f?/))) o.rotation = num(m[1]);
  if ((m = body.match(/(?<!Portrait)Scale\s*=\s*(-?[\d.]+)f?/))) o.scale = num(m[1]);
  if ((m = body.match(/PortraitScale\s*=\s*(-?[\d.]+)f?/))) o.portraitScale = num(m[1]);
  if (/Hide\s*=\s*true/.test(body)) o.hide = true;
  if (/IsWet\s*=\s*true/.test(body)) o.wet = true;
  if ((m = body.match(/Frame\s*=\s*(\d+)/))) o.frame = Number(m[1]);
  if ((m = body.match(/Direction\s*=\s*(-?\d+)/))) o.direction = Number(m[1]);
  if ((m = body.match(/SpriteDirection\s*=\s*(-?\d+)/))) o.spriteDirection = Number(m[1]);
  if ((m = body.match(/Velocity\s*=\s*([\d.]+)f?/))) o.velocity = num(m[1]);
  if ((m = body.match(/CustomTexturePath\s*=\s*"([^"]+)"/))) {
    // Images/UI/Bestiary/NPCs/NPC_113 → 扁平化素材 basename
    o.customTexture = m[1].split('/').pop();
  }
  return o;
}

function parseSection(name) {
  const seg = section(name);
  const out = {};
  const re = /(-?\d+),\s*new NPCBestiaryDrawModifiers\((\d+)\)\s*\{/g;
  const opens = [];
  let m;
  while ((m = re.exec(seg))) opens.push({ id: Number(m[1]), braceAt: re.lastIndex });
  for (let i = 0; i < opens.length; i++) {
    const { id, braceAt } = opens[i];
    // 条目体 = 起始 { 到配对 }（体内容无嵌套花括号——已抽样核）
    const close = seg.indexOf('}', braceAt);
    const body = seg.slice(braceAt, close);
    const parsed = parseEntry(body);
    if (Object.keys(parsed).length) out[id] = parsed;
    else out[id] = {};   // 空修饰（如 new NPCBestiaryDrawModifiers(0) 无字段）——仍登记（语义=无覆盖）
  }
  return out;
}

// 覆盖序：grox 先铺 → leinfors 覆盖 → redigit 覆盖（Creation 循环序）
const merged = {};
for (const name of ['GetGroxEntries', 'GetLeinforsEntries', 'GetRedigitEntries']) {
  const sec = parseSection(name);
  let n = 0, s = 0;
  for (const [k, v] of Object.entries(sec)) {
    merged[k] = v;
    n++;
    if (v.scale != null || v.portraitScale != null) s++;
  }
  console.log(`${name}: ${n} 条（含 Scale ${s}）`);
}
writeFileSync(OUT, JSON.stringify(merged));
const total = Object.keys(merged).length;
const withScale = Object.values(merged).filter(v => v.scale != null || v.portraitScale != null).length;
const hidden = Object.values(merged).filter(v => v.hide).length;
const custom = Object.values(merged).filter(v => v.customTexture).length;
console.log(`合并 ${total} 条 → ${OUT}`);
console.log(`  Scale/PortraitScale ${withScale} / Hide ${hidden} / CustomTexture ${custom}`);
// 抽样核对（僵尸 3 仅 Velocity；50 KingSlime PortraitScale；113 骷髅商人 CustomTexture）
for (const probe of ['3', '50', '113', '4']) console.log(` ${probe}:`, JSON.stringify(merged[probe]));
