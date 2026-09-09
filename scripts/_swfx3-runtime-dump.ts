// SW-FX3 运行时 placeStyle dump 入口（esbuild 打包后由 _swfx3-placestyle-census.mjs 动态 import 对拍）：
//   npx esbuild scripts/_swfx3-runtime-dump.ts --bundle --format=esm --platform=node \
//     --outfile=/tmp/swfx3-items-bundle.mjs --log-level=warning
export { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
