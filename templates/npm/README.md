# @sandboxworld/mod-api

SandboxWorld mod 开发类型包(P6):`sw` 门面(ModContext)与全部 spec 类型的
TypeScript 声明。**内容为引擎 `game/src/mods/{api,hooks,buffs}.ts` 的手写镜像**——
引擎侧权威,升级引擎后随批章更新本包。

## 用法(mod 工程)

```sh
npm i -D @sandboxworld/mod-api
```

`tsconfig.json`:

```json
{ "compilerOptions": { "strict": true, "noEmit": true },
  "include": ["node_modules/@sandboxworld/mod-api/mod-api.d.ts", "scripts/**/*.ts"] }
```

`scripts/main.ts`:

```ts
import type { ModContext } from '@sandboxworld/mod-api';

export default function main(sw: ModContext): void {
  sw.log('hello', sw.config.get('power'));
  // 全 API 补全/类型检查随 d.ts 生效
}
```

打包:`npx esbuild scripts/main.ts --bundle --format=esm --outfile=.build/main.js`
→ 产物改名 `scripts/main.js` 入 .swmod(`sw-mod build`)。

## 发布

包根=本目录;`npm publish --access public`(需 @sandboxworld scope 权限)。
版本号对齐引擎 mod API 版本(api=1 ⇒ 包 1.x)。
