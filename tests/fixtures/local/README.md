# 本地证据档案库（tests/fixtures/local/）

★C 档测试可移植性（2026-10-18 用户拍板）：他人 clone 后 `npm run test` 全绿、
零本机路径依赖（全仓 tests/tools 禁用户家目录绝对路径与微信 wxid 字面量）。

本目录收编**用户取证存档**（原散落 `~/Downloads` 与微信收件路径的 .wld/.json 档案），
统一脱敏命名、gzip 压缩、git 跟踪。存取一律走 `tests/fixturePath.ts`：

```ts
import { readLocalFixture, readLocalFixtureText, localFixtureMissing } from '../fixturePath';

it.skipIf(localFixtureMissing('bj641-anniversary-seed.wld'))('真档复现', () => {
  const world = parseWldToSave(new Uint8Array(readLocalFixture('bj641-anniversary-seed.wld')));
  // ...
});
```

- 档案在=真跑（本机零语义变化）；缺档=`skip`+一条 console 提示（clone 侧正常形态，不红）。
- `SW_LOCAL_FIXTURE_DIR` 可整目录重定向；`SW_PROJECT_ROOT` 可重定向仓库外反编译树根。

## 档案清单（原名 → 脱敏名 → 来源案件）

| 脱敏名（gz） | 原名（收编时已 md5 全等校验） | 来源案件 | 消费测试 |
|---|---|---|---|
| `bj641-anniversary-seed.wld.gz` | 十周年纪念种子(2).wld（微信收件副本与 Downloads 副本 md5 全等，自微信路径拷出即脱敏） | BJ641 提炼机通电不提炼（用户实报）+ BJ647 巫医/海盗瞬移 + BJ658 明胶水晶 | tests/bj641-user-wld-repro / tools/_bj641、_bj647、_bj658-wld-evidence |
| `starter-map-26.json.gz` | map-Starter_World (26).json | 平台-楼梯过渡取证批（用户 Starter_World 系列存档） | tests/platform-stair-transition、_mdir、_mdiff、_masym |
| `starter-map-25.json.gz` | map-Starter_World (25).json | 同上系列（存档侦查对拍用） | tests/_saverecon |
| `starter-sbw-20260831.json.gz` | Starter_World-20260831-2315.sbw.json | 2026-08-31 存档时序侦查（sbw 存档域） | tests/_stairsave2、_extract-fixture |
| `wanderer-tongue-map.json.gz` | map-流浪汉舌.json | 史莱姆穿角相位取证（用户世界「流浪汉舌」） | tests/slime-corner-phase-through、_scratch-slime-terrain |
| `hungry-manor-map.json.gz` | map-饥饿的庄园.json | 用户世界「饥饿的庄园」存档分析 | tests/_user-save-analyze |
| `naive-cobalt-peak.wld.gz` | 天真的钴最高点.wld | zz-wc 走带计数对拍（用户种子「天真的钴最高点」） | tests/zz-wc-verify2、zz-wc-count2 |
| `naive-cobalt-peak-1.wld.gz` | 天真的钴最高点(1).wld | BJ281 海螺落位物证第二档 | tools/_bj281-wld-evidence（SW_ORACLE 门控） |
| `ftw-v2.wld.gz` | FTW V2.wld | FTW(for the worthy) 种子真值档：vanilla-framing 金标 + vf 家族 codegen 对拍 | tests/vanilla-framing-golden、_vf-codegen-parity、_vf-fixture-dump、_vf-grass-region、_vf-grass-seam-debug、_vf-marks-statediff |
| `starter-master.wld.gz` | Starter_World Master.wld | wld 熔炉映射提取 | tests/wld-furnace-mapping |
| `fx55-soul-hex.wld.gz` | 欺诈的灵魂祸根.wld | FX55 蛋定位探针（用户种子「欺诈的灵魂祸根」） | tests/_fx55-egg-locate |
| `ftw-v2-marks.json.gz` | marks-FTW_V2 (6).json | vf 家族 marks 状态差分 | tests/_vf-marks-statediff |
| `zz-gold-test.wld.gz` | GoldTest.wld（本机 Terraria 存档目录） | zz-gold 金档 parseWld 冒烟 | tests/zz-gold |
| `ftw-v2-marks-chain.txt` | marks-chain-dump.txt（原 .claude/jobs 会话临时产物） | 同上（marks 链 dump） | tests/_vf-marks-statediff |

## 不可收编面（残留声明）

- `~/GoldenChains/`（x86 对拍真值链 dump 桶群，体积/语义不可收编）：探针一律 env 门控
  缺省 skip（`GOLDENCHAINS_ROOT`/`SW_GOLDENCHAINS_ROOT` 可重定向），缺目录不红。
- 反编译树 `Terarria1457/1458`、`Terraria-Map-Editor`、`CalamityModPublic`（game/ 兄弟
  目录，仓库外）：消费测试 existsSync + `skipIf` 缺树跳过；`SW_PROJECT_ROOT` 可重定向。
- 用户 `.plr` 私有档、真机 trace、`.claude/jobs` 会话临时件：不收编；相关测试缺档即 skip。
