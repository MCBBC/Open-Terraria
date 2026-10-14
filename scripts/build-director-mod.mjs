// 导演模式 mod 打包:game/mods/director/ → mods/dist/director.swmod
// 用法: node scripts/build-director-mod.mjs   (在 game/ 目录下运行)
import fs from 'node:fs'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'

const SRC = path.resolve('mods/director')
const OUT = path.resolve('mods/dist/director.swmod')
const files = {}
function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(p, r)
    else files[r] = e.name.endsWith('.json') ? strToU8(fs.readFileSync(p, 'utf8')) : new Uint8Array(fs.readFileSync(p))
  }
}
walk(SRC)
for (const need of ['mod.json', 'scripts/main.js']) if (!files[need]) throw new Error(`缺必需件: ${need}`)
const zipped = zipSync(files, { level: 9 })
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, zipped)
console.log(`${OUT}: ${Object.keys(files).length} 文件, ${(zipped.length / 1024).toFixed(1)} KB`)
