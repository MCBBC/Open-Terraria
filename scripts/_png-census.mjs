// PNG 尺寸普查:解析 IHDR 头(不解码)统计各目录解码后 RGBA 总量
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function pngSize(file) {
  const fd = readFileSync(file);
  if (fd.length < 24 || fd.readUInt32BE(12) !== 0x49484452) return null; // IHDR
  return { w: fd.readUInt32BE(16), h: fd.readUInt32BE(20) };
}

function census(dir, label) {
  let count = 0, px = 0, disk = 0;
  const top = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const p = join(dir, f);
    const s = pngSize(p);
    const d = statSync(p).size;
    disk += d;
    if (!s) continue;
    count++;
    px += s.w * s.h;
    top.push({ f, ...s, mb: +((s.w * s.h * 4) / 1048576).toFixed(1), diskKB: +(d / 1024).toFixed(0) });
  }
  top.sort((a, b) => b.w * b.h - a.w * a.h);
  console.log(`${label}: ${count} 张, 磁盘 ${Math.round(disk / 1048576)}MB, 解码 RGBA ${Math.round((px * 4) / 1048576)}MB`);
  for (const t of top.slice(0, 8)) console.log(`  ${t.f} ${t.w}×${t.h} → ${t.mb}MB (磁盘 ${t.diskKB}KB)`);
  return { count, diskMB: Math.round(disk / 1048576), decodedMB: Math.round((px * 4) / 1048576) };
}

const base = '/Users/vinlic/Project/GLM/SandboxWorld/game/public/sprites';
const r1 = census(join(base, 'vanilla'), 'vanilla/');
census(join(base, 'vanilla-ui'), 'vanilla-ui/');
// 根目录程序化图集(hardAlpha 会再复制一份 canvas → ×2)
census(base, 'sprites 根(程序化,×2)');
// npc 贴图单独看
import { readdirSync as rd } from 'fs';
const npcDir = join(base, 'vanilla', 'npc');
try { census(npcDir, 'vanilla/npc/'); } catch { /* 无子目录 */ }
