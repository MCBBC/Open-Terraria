// GLM娘 mod 打包:game/mods/glmgirl/ → .swmod(zip;mod.json 根 + content/ + textures/ + i18n/)
// 用法: node scripts/build-glmgirl-mod.mjs [输出路径=mods/dist/glmgirl.swmod]
// (在 game/ 目录下运行;fflate 走本仓依赖)
import fs from 'node:fs'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'

const SRC = path.resolve('mods/glmgirl')
const OUT = path.resolve(process.argv[2] ?? 'mods/dist/glmgirl.swmod')

const files = {}
function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(p, r)
    else files[r] = e.name.endsWith('.json') ? strToU8(fs.readFileSync(p, 'utf8')) : new Uint8Array(fs.readFileSync(p))
  }
}
walk(SRC)

// 布局自检:mod.json 必须在根;三张必需件齐
for (const need of ['mod.json', 'content/npcs/glm_girl.json', 'textures/npc/glm_girl.png', 'textures/npc/head.png', 'i18n/zh-Hans.json', 'i18n/en-US.json']) {
  if (!files[need]) throw new Error(`缺必需件: ${need}`)
}

const zipped = zipSync(files, { level: 9 })
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, zipped)
console.log(`${OUT}: ${Object.keys(files).length} 文件, ${(zipped.length / 1024).toFixed(1)} KB`)
