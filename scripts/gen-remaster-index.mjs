// 生成 public/sprites/remaster-index.json:全部 vanilla/ + vanilla-ui/ PNG 的
// {文件 → [宽,高]}(IHDR 直读,零依赖)。AssetCatalog 的 tile/wall/npc/projectile
// 帧枚举依赖 sheet 尺寸(枚举以实际尺寸步进,cols/rows 元数据不可信)。
// 素材重打包后(vanilla-atlas.mjs 触发)需重跑本脚本。
// 用法:cd game && node scripts/gen-remaster-index.mjs
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SPRITES = join(ROOT, 'public', 'sprites');

/** 读 PNG IHDR 宽高(8 字节签名 + 4 长度 + 4 'IHDR' 后即宽高,各 4 字节大端) */
function pngSize(file) {
  const fd = readFileSync(file);
  if (fd.length < 24 || fd.readUInt32BE(0) !== 0x89504e47) return null;
  return [fd.readUInt32BE(16), fd.readUInt32BE(20)];
}

function scan(dir, prefix) {
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith('.png')) continue;
    const sz = pngSize(join(dir, name));
    if (sz) out[`${prefix}${name}`] = sz;
  }
  return out;
}

const index = {
  generatedAt: new Date().toISOString(),
  vanilla: scan(join(SPRITES, 'vanilla'), 'vanilla/'),
  'vanilla-ui': scan(join(SPRITES, 'vanilla-ui'), 'vanilla-ui/'),
};
const total = Object.keys(index.vanilla).length + Object.keys(index['vanilla-ui']).length;
const out = join(SPRITES, 'remaster-index.json');
writeFileSync(out, JSON.stringify(index));
console.log(`[gen-remaster-index] ${total} 张(vanilla ${Object.keys(index.vanilla).length} + vanilla-ui ${Object.keys(index['vanilla-ui']).length}) → ${out}`);
if (existsSync(out)) {
  const kb = (statSync(out).size / 1024).toFixed(1);
  console.log(`[gen-remaster-index] 体积 ${kb}KB`);
}
