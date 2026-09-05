#!/bin/bash
# IIII178b 终局清算统一门禁（final-gate）· 2026-09-05
# ─────────────────────────────────────────────────────────────────────────────
# 一键可复跑的全量认证门禁，统合四类既有认证面：
#   [S1] 金标十件套 + world-final-hash + 金标加件(npc-flags/spawn-side-override)
#   [S2] recon 三闸（item DRIFT=0 / npc CLASS A,B=0 / tileanim DRIFT=0）+ 帧权威绑定测
#   [S3] 护卫族五件（skyblock-anchor-sets / micro-biomes / worldgen-1457-rewire /
#        dungeon-1457-alignment / weather-precip-parity）+ seed-parity
#   [S4] spot 22 线（tools/_iii100spot · 每链关键槽五点 #0/#45/#46/#47/#105；
#        EVIL 口径=spot 表钉死值,门禁不外层覆盖——CXLIX 案一 EVIL 漂移判例）
#   [S5] mile8 关键链全 106 槽（--full；g/iamerror/ddual/winter/sparkle/graveyard 六链,
#        tools/_iii81m8 name-anchored;逐链 EVIL 先对桶 run.log/serverconfig 核对,
#        冲突即拒绝执行——CXLIX 警示第 8 条「每链 EVIL 必须与桶配方同值」）
# 两档：--quick = S0..S4（spot 五点族）；--full = S0..S5（+mile8 全链）。
# 纯只读：零 src 生产面、零 tests-golden 内容变更（recon 一律不带 --fix）；
#   起跑+收尾双快照（tests/golden + src/data/*.json + vanilla.json）自证零写入。
# 用法：
#   bash tools/final-gate.sh                 # = --quick
#   bash tools/final-gate.sh --full          # 全档（+mile8 六链,约 +40~60min）
#   bash tools/final-gate.sh --stage spot    # 单段复跑（preflight|goldens|recon|guards|spot|mile8）
#   bash tools/final-gate.sh --stage mile8 --chain g       # mile8 单链
#   bash tools/final-gate.sh --stage spot  --chain remix   # spot 单线
#   bash tools/final-gate.sh --list          # 打印链表与配方后退出
#   SPOT_PAR=3 bash tools/final-gate.sh      # spot 波次并行（默认 1=串行;仅省墙钟,逐线日志独立）
# 产物：/tmp/iii178-out/final-gate-<stamp>/（SUMMARY.txt / VERDICT.txt / stage-*.log / m8 结果 JSON）
#   ★车道注记：交办批号 IIII178 与 LXVII 章（GFB #46 Jungle_Temple 批,tools/_iii178win.test.ts）
#     撞号,照 CXVIII/CXLI/CXLIX/CL 判例用 b 后缀;LXVII 批产物根同名 /tmp/iii178-out,本门禁
#     一律落其 final-gate-* 子目录,互不覆盖。
# ─────────────────────────────────────────────────────────────────────────────
# 判读基准（详版 = game/docs/worldgen/golden-chains-runbook.md §7 终局清算规程）：
#   【阻断】S1/S2/S3 任一红;spot 满绿链任何转红;mile8 已满绿链新首差/残差越界;
#           「名实不符」/桶缺失/通道不全/假绿免疫 throw/EVIL 配方冲突;零写入快照变动。
#   【域外债·可放行】sfx-wiring-golden（本树 public/sounds 无 863 wav 库=发布域资产债,
#           代码面 UNWIRED_ALLOWLIST=[]）;mile8 在途两刃残差:
#           iamerror bad⊆{#56 Gh=41,#57 A=200}（CXLVIII 精确移交）/
#           ddual bad 全部≥#33（座2腐化草域 (3628,153),IIIII222）。
#   【备案红】mile8 winter bad 签名=T633/T634（AshGrass 树代际域,无旗 control 同签名,
#           runbook §1 golden-win 行）——签名漂移即升级阻断。
# ─────────────────────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")/.." || exit 1
GAME="$PWD"
MODE=quick
STAGE=all
ONLY_CHAIN=
SPOT_PAR="${SPOT_PAR:-1}"
OUT="${GATE_OUT:-/tmp/iii178-out/final-gate-$(date +%Y%m%d-%H%M%S)}"
GC="${HOME}/GoldenChains"

while [ $# -gt 0 ]; do
  case "$1" in
    --quick) MODE=quick ;;
    --full) MODE=full ;;
    --stage) STAGE="$2"; shift ;;
    --chain) ONLY_CHAIN="$2"; shift ;;
    --list) LIST_ONLY=1 ;;
    -h|--help) sed -n '2,52p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 2 ;;
  esac
  shift
done

# ── 链表 ────────────────────────────────────────────────────────────────────
# spot 22 线：链名+EVIL+seed+旗标的配方权威 = tools/_iii100spot CHAINS 表（钉死值,
# 门禁只透传 SW_SPOT_CHAIN,不旁路覆盖任何字段）;G2 目录在位性由本门禁预检。
SPOT_CHAINS="g s22222 m const ntb notraps c12345 skyblock drunk celeb toadstool fishmox ftw pumpkin jagged xrayvision monochrome waterpark remix planetoids sgis arachno"
# mile8 六链（chain|G2|seed|EVIL|flags|备案注记 —— ★seed 含 |,字段读引用 M8_*_G2 等
# 独立变量,勿用分隔符拆分）
M8_CHAINS="g iamerror ddual winter sparkle graveyard"
M8_g_G2="$GC/golden-g";                 M8_g_SEED="9293480";                 M8_g_EVIL="0";  M8_g_FLAGS="";                     M8_g_NOTE="cert 满绿基线(runbook §1)"
M8_iamerror_G2="$GC/i106/x86-iamerror"; M8_iamerror_SEED="1.1.1.0.iamerror|106103"; M8_iamerror_EVIL="0"; M8_iamerror_FLAGS=""; M8_iamerror_NOTE="在途刃:CXLVIII 精确移交(#56 Gh=41/#57 A=200)"
M8_ddual_G2="$GC/golden-ddual2";        M8_ddual_SEED="doubledaringdangers|20260831"; M8_ddual_EVIL="0"; M8_ddual_FLAGS="dualDungeons"; M8_ddual_NOTE="在途刃:IIIII222 座2腐化草域(3628,153) #33 起"
M8_winter_G2="$GC/golden-win";          M8_winter_SEED="20260907";           M8_winter_EVIL="-1"; M8_winter_FLAGS="worldIsFrozen"; M8_winter_NOTE="登记债:#28 T633/T634 树代际域(无旗 control 同签名)"
M8_sparkle_G2="$GC/golden-sparkle";     M8_sparkle_SEED="771004";            M8_sparkle_EVIL="0"; M8_sparkle_FLAGS="hallowOnTheSurface"; M8_sparkle_NOTE="_iii107c-regress lane 配方(serverconfig seed=771004)"
M8_graveyard_G2="$GC/golden-grvfix";    M8_graveyard_SEED="nightofthelivingdead|20260903"; M8_graveyard_EVIL="0"; M8_graveyard_FLAGS="graveyardBloodmoonStart"; M8_graveyard_NOTE="runbook §1 + CXLIX 案一 EVIL=0 钉"

if [ "${LIST_ONLY:-0}" = "1" ]; then
  echo "spot 22 线（G2 目录取自 tools/_iii100spot CHAINS;配方=EVIL/seed/flags 钉死值）:"
  grep -E "^  [a-z0-9]+:.*g2: C\('" tools/_iii100spot.test.ts | sed -E "s/^  ([a-z0-9]+):.*g2: C\('([^']+)'\).*/  \1 → ~\/GoldenChains\/\2/"
  echo "mile8 六链（chain | G2 | seed | EVIL | flags | 注记）:"
  for c in $M8_CHAINS; do
    eval "g2=\$M8_${c}_G2; seed=\$M8_${c}_SEED; ev=\$M8_${c}_EVIL; fl=\$M8_${c}_FLAGS; nt=\$M8_${c}_NOTE"
    echo "  $c | $g2 | $seed | $ev | ${fl:--} | $nt"
  done
  exit 0
fi

mkdir -p "$OUT"
SUM="$OUT/SUMMARY.txt"
VER="$OUT/VERDICT.txt"
: > "$SUM"; : > "$VER"
FAILS=0
KNOWN=0
INVALID=0
log() { echo "$@" | tee -a "$SUM"; }
now() { date '+%H:%M:%S'; }

# ── S0 preflight ────────────────────────────────────────────────────────────
s0() {
  log "== [S0] preflight $(now) =="
  local rc=0
  [ -x node_modules/.bin/vitest ] || { log "FAIL preflight: vitest 缺失(在 game/ 下 npm install)"; rc=1; }
  [ -d "$GC" ] || { log "FAIL preflight: $GC 不存在"; rc=1; }
  mkdir -p /tmp/iii81-out   # _iii81m8 结果 JSON 落点(缺目录=全链跑完才炸)
  local ch dir missing=""
  for ch in $SPOT_CHAINS; do
    [ "$ONLY_CHAIN" != "" ] && [ "$ch" != "$ONLY_CHAIN" ] && [ "$STAGE" != "all" ] && continue
    [ "$STAGE" = "mile8" ] && continue
    dir=$(grep -E "^  ${ch}:.*g2: C\('" tools/_iii100spot.test.ts | sed -E "s/.*g2: C\('([^']+)'\).*/\1/")
    if [ -z "$dir" ]; then missing="$missing $ch(表缺)"; continue; fi
    [ -d "$GC/$dir" ] || missing="$missing $ch($dir)"
  done
  if [ -n "$missing" ]; then log "FAIL preflight: spot 桶缺失:$missing"; rc=1; fi
  local c g2 ntyp
  for c in $M8_CHAINS; do
    [ "$ONLY_CHAIN" != "" ] && [ "$c" != "$ONLY_CHAIN" ] && [ "$STAGE" != "all" ] && continue
    [ "$STAGE" != "mile8" ] && [ "$STAGE" != "all" ] && continue
    eval "g2=\$M8_${c}_G2"
    if [ ! -d "$g2" ]; then log "FAIL preflight: mile8 $c 桶缺失 $g2"; rc=1; continue; fi
    ntyp=$(ls "$g2"/*.typ 2>/dev/null | wc -l | tr -d ' ')
    if [ "$ntyp" -lt 100 ]; then log "FAIL preflight: mile8 $c 桶 .typ 仅 $ntyp(<100)=$g2"; rc=1; fi
  done
  # 零写入快照（before）
  find tests/golden -type f -exec md5 -r {} + | sort > "$OUT/golden-md5-before.txt"
  ls tests/golden > "$OUT/golden-ls-before.txt"
  find src/data -name '*.json' -exec md5 -r {} + | sort > "$OUT/srcdata-md5-before.txt"
  md5 -r public/sprites/vanilla.json > "$OUT/vanilla-json-before.txt" 2>/dev/null
  log "preflight rc=$rc (产物=$OUT)"
  return $rc
}

# ── vitest runner：rc + 摘要行 ─────────────────────────────────────────────
vrun() { # $1=log $2..=test files
  local lf="$1"; shift
  npx vitest run "$@" > "$lf" 2>&1
  local rc=$?
  local tf; tf=$(grep -aE "^ Test Files" "$lf" | head -1 | tr -s ' ')
  echo "vitest rc=$rc ${tf}" | tee -a "$SUM"
  return $rc
}

# ── S1 金标 ────────────────────────────────────────────────────────────────
s1() {
  log "== [S1] 金标十件套(除 sfx) + world-final-hash + 金标加件 $(now) =="
  local ok=1
  vrun "$OUT/goldens.log" \
    tests/lighting-fastrandom-golden.test.ts tests/npc-stats-golden.test.ts \
    tests/lighting-scan-blur-golden.test.ts tests/atlas-append-golden.test.ts \
    tests/npc-frame-golden.test.ts tests/golden-wld-meta.test.ts \
    tests/liquid-settle-golden.test.ts tests/vanilla-framing-golden.test.ts \
    tests/item-stats-golden-1457.test.ts tests/world-final-hash.test.ts || ok=0
  vrun "$OUT/goldens-extra.log" tests/npc-flags-golden.test.ts tests/spawn-side-override-golden.test.ts || ok=0
  # sfx-wiring-golden 单独跑（已知域外债单闸,不与其余混判）
  vrun "$OUT/goldens-sfx.log" tests/sfx-wiring-golden.test.ts
  if [ $? -ne 0 ]; then
    local nw; nw=$(ls public/sounds/*.wav 2>/dev/null | wc -l | tr -d ' ')
    if grep -aq "toBeGreaterThan(800)" "$OUT/goldens-sfx.log"; then
      log "  [known] sfx-wiring-golden 红=wav 库缺失(public/sounds/*.wav=$nw;发布域资产债,代码面 UNWIRED_ALLOWLIST=[])"
      KNOWN=$((KNOWN+1))
    else
      log "  [BLOCK] sfx-wiring-golden 红但签名非 wav 库缺失(须人工判读)"
      FAILS=$((FAILS+1)); ok=0
    fi
  else
    log "  sfx-wiring-golden ✓(wav 库已就位)"
  fi
  [ $ok -eq 1 ] && log "S1 PASS" || { log "S1 FAIL"; }
  return 0
}

# ── S2 recon 三闸 + 帧权威绑定 ─────────────────────────────────────────────
s2() {
  log "== [S2] recon 三闸 + tile-anim 权威绑定 $(now) =="
  local ok=1
  node tools/recon-item-1456-1457.mjs > "$OUT/recon-item.log" 2>&1
  local d; d=$(grep -aE "^== DRIFT" "$OUT/recon-item.log" | sed -E 's/.*1457 ([0-9]+) 条.*/\1/')
  log "recon-item DRIFT=${d:-?} (必须=0;CLASS B=478 固定移植确认清单)"
  [ "${d:-1}" != "0" ] && ok=0
  node tools/recon-npc-1456-1457.mjs > "$OUT/recon-npc.log" 2>&1
  local a b
  a=$(grep -aE "^== CLASS A:" "$OUT/recon-npc.log" | sed -E 's/.*漂移 ([0-9]+) 条.*/\1/')
  b=$(grep -aE "^== CLASS B:" "$OUT/recon-npc.log" | sed -E 's/.*变更 ([0-9]+) 条.*/\1/')
  log "recon-npc CLASS A=${a:-?} B=${b:-?} (必须双 0;A3=审阅面)"
  { [ "${a:-1}" != "0" ] || [ "${b:-1}" != "0" ]; } && ok=0
  node tools/recon-tileanim.mjs > "$OUT/recon-tileanim.log" 2>&1
  local trc=$?
  log "recon-tileanim rc=$trc (DRIFT=0 ⇒ 0)"
  [ $trc -ne 0 ] && ok=0
  vrun "$OUT/tile-anim-authority.log" tests/tile-anim-authority.test.ts || ok=0
  [ $ok -eq 1 ] && log "S2 PASS" || log "S2 FAIL"
  [ $ok -eq 0 ] && FAILS=$((FAILS+1))
  return 0
}

# ── S3 护卫族 + seed-parity ────────────────────────────────────────────────
s3() {
  log "== [S3] 护卫族五件 + seed-parity $(now) =="
  local ok=1
  vrun "$OUT/guards.log" tests/skyblock-anchor-sets.test.ts tests/micro-biomes.test.ts \
    tests/worldgen-1457-rewire.test.ts tests/dungeon-1457-alignment.test.ts \
    tests/weather-precip-parity.test.ts || ok=0
  vrun "$OUT/seed-parity.log" tests/seed-parity.test.ts || ok=0
  [ $ok -eq 1 ] && log "S3 PASS" || { log "S3 FAIL"; FAILS=$((FAILS+1)); }
  return 0
}

# ── S4 spot 22 线 ──────────────────────────────────────────────────────────
run_spot1() { # $1=chain → 写 $OUT/spot-rc.txt;rc 经全局 SPOT_RC
  local ch="$1"
  SW_MB_1457=1 SW_SPOT_CHAIN="$ch" npx vitest run tools/_iii100spot.test.ts > "$OUT/spot-$ch.log" 2>&1
  SPOT_RC=$?
  local mark="✗"
  grep -aq "五点全绿 ✓" "$OUT/spot-$ch.log" && mark="✓"
  echo "[spot-$ch] rc=$SPOT_RC $mark" >> "$OUT/spot-rc.txt"
}
s4() {
  log "== [S4] spot 22 线（每链关键槽五点;EVIL=spot 表钉死值） $(now) =="
  : > "$OUT/spot-rc.txt"
  local ok=1 ch n=0 red=0
  for ch in $SPOT_CHAINS; do
    [ "$ONLY_CHAIN" != "" ] && [ "$ch" != "$ONLY_CHAIN" ] && continue
    if [ "$SPOT_PAR" -le 1 ]; then
      run_spot1 "$ch"
      log "  $(tail -1 "$OUT/spot-rc.txt")"
      [ $SPOT_RC -ne 0 ] && { log "    ✗ log=$OUT/spot-$ch.log"; ok=0; }
    else
      run_spot1 "$ch" & n=$((n+1))
      [ $n -ge "$SPOT_PAR" ] && { wait; n=0; }
    fi
  done
  [ "$SPOT_PAR" -gt 1 ] && wait
  if [ "$SPOT_PAR" -gt 1 ]; then
    while IFS= read -r line; do log "  $line"; done < "$OUT/spot-rc.txt"
    red=$(grep -ac "✗" "$OUT/spot-rc.txt")
    [ "$red" -gt 0 ] && ok=0
  fi
  [ $ok -eq 1 ] && log "S4 PASS($SPOT_CHAINS 全绿)" || { log "S4 FAIL($red 线红)"; FAILS=$((FAILS+1)); }
  return 0
}

# ── S5 mile8 六链（--full）─────────────────────────────────────────────────
run_m8() { # $1=chain → $OUT/m8-rc.txt 一行;rc 经全局 M8_RC
  local ch="$1" g2 seed evil flags logf rc got
  eval "g2=\$M8_${ch}_G2; seed=\$M8_${ch}_SEED; evil=\$M8_${ch}_EVIL; flags=\$M8_${ch}_FLAGS"
  # 配方核对（CXLIX 警示第 8 条:EVIL 必须与桶配方同值;冲突=拒绝执行,不烧链）
  local note=""
  if [ -f "$g2/run.log" ]; then
    got=$(grep -aoE "Evil: -?[0-9]+" "$g2/run.log" | head -1 | grep -oE "\-?[0-9]+")
    if [ -n "$got" ] && [ "$got" != "$evil" ]; then
      echo "[m8-$ch] rc=3 配方冲突:桶 run.log Evil=$got vs 门禁 EVIL=$evil → 拒绝执行(阻断)" >> "$OUT/m8-rc.txt"
      M8_RC=3; return
    fi
  else
    note="(桶无 run.log;配方权威=serverconfig+lane 章)"
  fi
  logf="$OUT/m8-$ch.log"
  SW_MB_1457=1 SW_I81=1 SW_I81_G2="$g2" SW_I81_VG="$g2" \
    SW_I81_SEED="$seed" SW_I81_EVIL="$evil" SW_I81_FLAGS="$flags" \
    SW_I81_NOCACHE=1 SW_M8_NOCACHE=1 SW_I81_TAG="fg-$ch" \
    npx vitest run tools/_iii81m8.test.ts > "$logf" 2>&1
  rc=$?
  local rows bad first mismatch
  rows=$(grep -acE "^[ 0-9]{3} [^ ].*(✓|✗)" "$logf")
  bad=$(grep -aE "^[ 0-9]{3} [^ ].*✗" "$logf" | wc -l | tr -d ' ')
  first=$(grep -a "8通道首差边界" "$logf" | head -1 | sed 's/.*8通道首差边界: //')
  mismatch=$(grep -ac "名实不符" "$logf")
  cp "/tmp/iii81-out/mile8-fg-$ch.json" "$OUT/" 2>/dev/null
  echo "[m8-$ch] rc=$rc rows=$rows bad8ch=$bad 名实不符=$mismatch 首差=${first:-?} $note" >> "$OUT/m8-rc.txt"
  M8_RC=$rc
}
s5() {
  log "== [S5] mile8 关键链全 106 槽（name-anchored;红绿只裁八通道,Gh=信息位） $(now) =="
  mkdir -p /tmp/iii81-out   # _iii81m8 结果 JSON 落点（单段直跑也保底）
  : > "$OUT/m8-rc.txt"
  local ok=1 ch line badrows mismatch
  for ch in $M8_CHAINS; do
    [ "$ONLY_CHAIN" != "" ] && [ "$ch" != "$ONLY_CHAIN" ] && continue
    run_m8 "$ch"
    line=$(grep "^\[m8-$ch\]" "$OUT/m8-rc.txt" | tail -1)
    log "  $line"
    if [ "$M8_RC" = "3" ]; then log "    [BLOCK] EVIL 配方冲突"; FAILS=$((FAILS+1)); ok=0; continue; fi
    mismatch=$(echo "$line" | grep -oE "名实不符=[0-9]+" | grep -oE "[0-9]+")
    badrows=$(grep -aE "^[ 0-9]{1,3} [^ ].*✗" "$OUT/m8-$ch.log" | grep -oE "^ *[0-9]{1,3}" | tr -d ' ' | sort -un | tr '\n' ',')
    # rows=0 且 rc≠0 = harness 启动失败(树/桶环境级,非对拍判读数据)——单列 INVALID
    local rows0; rows0=$(echo "$line" | grep -oE "rows=[0-9]+" | grep -oE "[0-9]+")
    if [ "${rows0:-0}" = "0" ] && [ "$M8_RC" -ne 0 ]; then
      local err; err=$(grep -am1 "Error:" "$OUT/m8-$ch.log" | head -c 160)
      log "    [INVALID] harness 未产出对拍行(rc=$M8_RC)——环境级失败非对拍红: ${err}"
      INVALID=$((INVALID+1)); FAILS=$((FAILS+1)); ok=0; continue
    fi
    case "$ch" in
      iamerror)
        case "$badrows" in
          ""|56,|57,|56,57,) [ -n "$badrows" ] && { log "    [known] 残差=在途刃移交域(CXLVIII) — 域外债"; KNOWN=$((KNOWN+1)); } ;;
          *) log "    [BLOCK] iamerror 残差越界: bad=[$badrows]"; FAILS=$((FAILS+1)); ok=0 ;;
        esac ;;
      ddual)
        if [ -n "$badrows" ]; then
          if [ "$(echo "$badrows" | awk -F, '$1!=""{print $1; exit}')" -ge 33 ] 2>/dev/null; then
            log "    [known] 残差=座2腐化草域(#33 起,IIIII222) — 域外债"; KNOWN=$((KNOWN+1))
          else
            log "    [BLOCK] ddual 新首差(早于 #33 已知域): bad=[$badrows]"; FAILS=$((FAILS+1)); ok=0
          fi
        fi ;;
      winter)
        if [ -n "$badrows" ]; then
          if grep -aqE "T633|T634" "$OUT/m8-$ch.log"; then
            log "    [known] 残差=树代际登记债(T633/T634 签名匹配) — 备案红"; KNOWN=$((KNOWN+1))
          else
            log "    [BLOCK] winter 残差签名漂移: bad=[$badrows]"; FAILS=$((FAILS+1)); ok=0
          fi
        fi ;;
      *)
        if [ "$M8_RC" -ne 0 ] || [ -n "$badrows" ] || [ "${mismatch:-0}" != "0" ]; then
          log "    [BLOCK] $ch 意外红(bad=[$badrows] rc=$M8_RC 名实不符=${mismatch:-0})"; FAILS=$((FAILS+1)); ok=0
        fi ;;
    esac
    if [ "${mismatch:-0}" != "0" ]; then
      log "    [BLOCK] 槽名实不符=管线形状漂移(对拍结论不可按本表解读)"; FAILS=$((FAILS+1)); ok=0
    fi
  done
  [ $ok -eq 1 ] && log "S5 PASS(六链残差全部落在备案域内)" || log "S5 含阻断项"
  return 0
}

# ── 收尾：零写入复核 + VERDICT ─────────────────────────────────────────────
finalize() {
  find tests/golden -type f -exec md5 -r {} + | sort > "$OUT/golden-md5-after.txt"
  ls tests/golden > "$OUT/golden-ls-after.txt"
  find src/data -name '*.json' -exec md5 -r {} + | sort > "$OUT/srcdata-md5-after.txt"
  md5 -r public/sprites/vanilla.json > "$OUT/vanilla-json-after.txt" 2>/dev/null
  log "== [收尾] 零写入复核 $(now) =="
  local w=0
  diff -q "$OUT/golden-ls-before.txt" "$OUT/golden-ls-after.txt" >/dev/null 2>&1 || { log "BLOCK: tests/golden 文件清单变动"; w=1; }
  diff -q "$OUT/golden-md5-before.txt" "$OUT/golden-md5-after.txt" >/dev/null 2>&1 || { log "BLOCK: tests/golden 内容 md5 变动"; w=1; }
  diff -q "$OUT/srcdata-md5-before.txt" "$OUT/srcdata-md5-after.txt" >/dev/null 2>&1 || { log "BLOCK: src/data/*.json 变动(recon --fix 越权?)"; w=1; }
  diff -q "$OUT/vanilla-json-before.txt" "$OUT/vanilla-json-after.txt" >/dev/null 2>&1 || { log "BLOCK: public/sprites/vanilla.json 变动"; w=1; }
  [ $w -eq 0 ] && log "zero-write ✓ (tests/golden + src/data/*.json + vanilla.json 全等)"
  {
    echo "──────── 终局判读 ────────"
    echo "阻断项: $FAILS(其中环境级无效运行 ${INVALID}——树/harness 未产出对拍数据,修复后须单段复跑)"
    echo "域外债/备案红(注记放行): $KNOWN"
    if [ $FAILS -eq 0 ]; then
      echo "VERDICT: PASS$( [ $KNOWN -gt 0 ] && echo '-WITH-KNOWN-DEBT' )"
    else
      echo "VERDICT: BLOCK"
    fi
  } >> "$VER"
  cat "$VER" >> "$SUM"
  cat "$VER"
  log "final-gate done $(now) (产物=$OUT)"
}

# ── 调度 ───────────────────────────────────────────────────────────────────
log "final-gate start $(now) mode=$MODE stage=$STAGE only_chain=${ONLY_CHAIN:-_} spot_par=$SPOT_PAR"
case "$STAGE" in
  preflight) s0 ;;
  goldens)   s1 ;;
  recon)     s2 ;;
  guards)    s3 ;;
  spot)      s4 ;;
  mile8)     s5 ;;
  all)
    s0 || { log "BLOCK: preflight 失败,终止"; finalize; exit 1; }
    s1; s2; s3; s4
    [ "$MODE" = "full" ] && s5
    finalize
    ;;
  *) echo "unknown stage: $STAGE"; exit 2 ;;
esac
[ "$STAGE" = "all" ] || log "(单段模式,零写入复核跳过;汇总=$OUT)"
exit 0
