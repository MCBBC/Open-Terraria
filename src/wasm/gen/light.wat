(module
 (type $0 (func (result i32)))
 (type $1 (func (param i32 i32)))
 (type $2 (func (param i32) (result i32)))
 (type $3 (func (param i32 i32 i32 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64)))
 (type $4 (func (param f64 f64) (result f64)))
 (type $5 (func (param f64) (result f64)))
 (type $6 (func (param i32 i32) (result i32)))
 (type $7 (func (param i32 i32 i64)))
 (type $8 (func (param i32)))
 (type $9 (func))
 (type $10 (func (param i32 i32 i32 i32 i32 i32 f64 f64 i32 i32 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 i32 i32 i32) (result i32)))
 (type $11 (func (result i64)))
 (type $12 (func (param i32 i32 i32 f64 f64 f64 f64 f64 f64 f64 f64 f64) (result i32)))
 (global $src/wasm/light.as/rBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/gBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/bBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/maskBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/lutBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/capCells (mut i32) (i32.const 0))
 (global $src/wasm/light.as/typeBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/flagsBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/fxBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/fyBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/wallBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/liqBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/liqTBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/halfBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/slopeBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/wireBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/paintBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/paintWallBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/coatBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/spListBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/spCount (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblBlocks (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblNoSun (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblCracked (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblAllowWater (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblMush (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblFlicker (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblHasLight (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblSpecial (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblSheet (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblLightR (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblLightG (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblLightB (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblWallLight (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblWallEmHas (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblWallEmGated (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblWallEmR (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblWallEmG (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblWallEmB (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblTorch (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblGlass (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblPaint (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblTogAxis (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tblTogDelta (mut i32) (i32.const 0))
 (global $src/wasm/light.as/tablesReady (mut i32) (i32.const 0))
 (global $src/wasm/light.as/pixelBlockId (mut i32) (i32.const -1))
 (global $src/wasm/light.as/rndSeed (mut f64) (f64.const 0))
 (global $src/wasm/light.as/masterSeed (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gGl (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gLava (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gSkyR (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gSkyG (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gSkyB (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gDk (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gSwa (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gHellR (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gHellG (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gHellB (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gLavaV (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gOsc (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gDr (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gDg (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gDb (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gDemon (mut f64) (f64.const 0))
 (global $src/wasm/light.as/gCloudType (mut i32) (i32.const -1))
 (global $src/wasm/light.as/gCloudDay (mut i32) (i32.const 0))
 (global $src/wasm/light.as/gShowInv (mut i32) (i32.const 0))
 (global $src/wasm/light.as/gWw (mut i32) (i32.const 0))
 (global $src/wasm/light.as/gHashX0 (mut i32) (i32.const 0))
 (global $src/wasm/light.as/gHashY0 (mut i32) (i32.const 0))
 (global $src/wasm/light.as/sRetR (mut f64) (f64.const 0))
 (global $src/wasm/light.as/sRetG (mut f64) (f64.const 0))
 (global $src/wasm/light.as/sRetB (mut f64) (f64.const 0))
 (global $~lib/rt/tlsf/ROOT (mut i32) (i32.const 0))
 (memory $0 0)
 (export "lightVersion" (func $src/wasm/light.as/lightVersion))
 (export "lightInit" (func $src/wasm/light.as/lightInit))
 (export "lightRBuf" (func $src/wasm/light.as/lightRBuf))
 (export "lightGBuf" (func $src/wasm/light.as/lightGBuf))
 (export "lightBBuf" (func $src/wasm/light.as/lightBBuf))
 (export "lightMaskBuf" (func $src/wasm/light.as/lightMaskBuf))
 (export "lightLutBuf" (func $src/wasm/light.as/lightLutBuf))
 (export "lightCaps" (func $src/wasm/light.as/lightCaps))
 (export "lightTypeBuf" (func $src/wasm/light.as/lightTypeBuf))
 (export "lightFlagsBuf" (func $src/wasm/light.as/lightFlagsBuf))
 (export "lightFxBuf" (func $src/wasm/light.as/lightFxBuf))
 (export "lightFyBuf" (func $src/wasm/light.as/lightFyBuf))
 (export "lightWallBuf" (func $src/wasm/light.as/lightWallBuf))
 (export "lightLiqBuf" (func $src/wasm/light.as/lightLiqBuf))
 (export "lightLiqTBuf" (func $src/wasm/light.as/lightLiqTBuf))
 (export "lightHalfBuf" (func $src/wasm/light.as/lightHalfBuf))
 (export "lightSlopeBuf" (func $src/wasm/light.as/lightSlopeBuf))
 (export "lightWireBuf" (func $src/wasm/light.as/lightWireBuf))
 (export "lightPaintBuf" (func $src/wasm/light.as/lightPaintBuf))
 (export "lightPaintWallBuf" (func $src/wasm/light.as/lightPaintWallBuf))
 (export "lightCoatBuf" (func $src/wasm/light.as/lightCoatBuf))
 (export "lightSpListBuf" (func $src/wasm/light.as/lightSpListBuf))
 (export "lightTblBlocks" (func $src/wasm/light.as/lightTblBlocks))
 (export "lightTblNoSun" (func $src/wasm/light.as/lightTblNoSun))
 (export "lightTblCracked" (func $src/wasm/light.as/lightTblCracked))
 (export "lightTblAllowWater" (func $src/wasm/light.as/lightTblAllowWater))
 (export "lightTblMush" (func $src/wasm/light.as/lightTblMush))
 (export "lightTblFlicker" (func $src/wasm/light.as/lightTblFlicker))
 (export "lightTblHasLight" (func $src/wasm/light.as/lightTblHasLight))
 (export "lightTblSpecial" (func $src/wasm/light.as/lightTblSpecial))
 (export "lightTblSheet" (func $src/wasm/light.as/lightTblSheet))
 (export "lightTblLightR" (func $src/wasm/light.as/lightTblLightR))
 (export "lightTblLightG" (func $src/wasm/light.as/lightTblLightG))
 (export "lightTblLightB" (func $src/wasm/light.as/lightTblLightB))
 (export "lightTblWallLight" (func $src/wasm/light.as/lightTblWallLight))
 (export "lightTblWallEmHas" (func $src/wasm/light.as/lightTblWallEmHas))
 (export "lightTblWallEmGated" (func $src/wasm/light.as/lightTblWallEmGated))
 (export "lightTblWallEmR" (func $src/wasm/light.as/lightTblWallEmR))
 (export "lightTblWallEmG" (func $src/wasm/light.as/lightTblWallEmG))
 (export "lightTblWallEmB" (func $src/wasm/light.as/lightTblWallEmB))
 (export "lightTblTorch" (func $src/wasm/light.as/lightTblTorch))
 (export "lightTblGlass" (func $src/wasm/light.as/lightTblGlass))
 (export "lightTblPaint" (func $src/wasm/light.as/lightTblPaint))
 (export "lightTblTogAxis" (func $src/wasm/light.as/lightTblTogAxis))
 (export "lightTblTogDelta" (func $src/wasm/light.as/lightTblTogDelta))
 (export "lightTablesReady" (func $src/wasm/light.as/lightTablesReady))
 (export "lightMarkTablesReady" (func $src/wasm/light.as/lightMarkTablesReady))
 (export "lightSetPixelBlock" (func $src/wasm/light.as/lightSetPixelBlock))
 (export "lightBlur" (func $src/wasm/light.as/lightBlur))
 (export "lightExport" (func $src/wasm/light.as/lightExport))
 (export "memory" (memory $0))
 (func $~lib/memory/heap.alloc (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  global.get $~lib/rt/tlsf/ROOT
  i32.eqz
  if
   memory.size
   local.tee $2
   i32.const 0
   i32.le_s
   if (result i32)
    i32.const 1
    local.get $2
    i32.sub
    memory.grow
    i32.const 0
    i32.lt_s
   else
    i32.const 0
   end
   if
    unreachable
   end
   i32.const 1024
   i32.const 0
   i32.store
   i32.const 2592
   i32.const 0
   i32.store
   loop $for-loop|0
    local.get $1
    i32.const 23
    i32.lt_u
    if
     local.get $1
     i32.const 2
     i32.shl
     i32.const 1024
     i32.add
     i32.const 0
     i32.store offset=4
     i32.const 0
     local.set $2
     loop $for-loop|1
      local.get $2
      i32.const 16
      i32.lt_u
      if
       local.get $1
       i32.const 4
       i32.shl
       local.get $2
       i32.add
       i32.const 2
       i32.shl
       i32.const 1024
       i32.add
       i32.const 0
       i32.store offset=96
       local.get $2
       i32.const 1
       i32.add
       local.set $2
       br $for-loop|1
      end
     end
     local.get $1
     i32.const 1
     i32.add
     local.set $1
     br $for-loop|0
    end
   end
   i32.const 1024
   i32.const 2596
   memory.size
   i64.extend_i32_s
   i64.const 16
   i64.shl
   call $~lib/rt/tlsf/addMemory
   i32.const 1024
   global.set $~lib/rt/tlsf/ROOT
  end
  local.get $0
  i32.const 1073741820
  i32.gt_u
  if
   unreachable
  end
  global.get $~lib/rt/tlsf/ROOT
  local.tee $1
  local.get $0
  i32.const 12
  i32.le_u
  if (result i32)
   i32.const 12
  else
   local.get $0
   i32.const 19
   i32.add
   i32.const -16
   i32.and
   i32.const 4
   i32.sub
  end
  local.tee $3
  call $~lib/rt/tlsf/searchBlock
  local.tee $0
  i32.eqz
  if
   local.get $3
   i32.const 256
   i32.ge_u
   if (result i32)
    local.get $3
    i32.const 536870910
    i32.lt_u
    if (result i32)
     local.get $3
     i32.const 1
     i32.const 27
     local.get $3
     i32.clz
     i32.sub
     i32.shl
     i32.add
     i32.const 1
     i32.sub
    else
     local.get $3
    end
   else
    local.get $3
   end
   i32.const 4
   local.get $1
   i32.load offset=1568
   memory.size
   local.tee $0
   i32.const 16
   i32.shl
   i32.const 4
   i32.sub
   i32.ne
   i32.shl
   i32.add
   i32.const 65535
   i32.add
   i32.const -65536
   i32.and
   i32.const 16
   i32.shr_u
   local.set $2
   local.get $0
   local.get $2
   local.get $0
   local.get $2
   i32.gt_s
   select
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $2
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
   local.get $1
   local.get $0
   i32.const 16
   i32.shl
   memory.size
   i64.extend_i32_s
   i64.const 16
   i64.shl
   call $~lib/rt/tlsf/addMemory
   local.get $1
   local.get $3
   call $~lib/rt/tlsf/searchBlock
   local.set $0
  end
  local.get $0
  i32.load
  drop
  local.get $1
  local.get $0
  call $~lib/rt/tlsf/removeBlock
  local.get $0
  i32.load
  local.tee $2
  i32.const -4
  i32.and
  local.get $3
  i32.sub
  local.tee $4
  i32.const 16
  i32.ge_u
  if
   local.get $0
   local.get $3
   local.get $2
   i32.const 2
   i32.and
   i32.or
   i32.store
   local.get $0
   i32.const 4
   i32.add
   local.get $3
   i32.add
   local.tee $2
   local.get $4
   i32.const 4
   i32.sub
   i32.const 1
   i32.or
   i32.store
   local.get $1
   local.get $2
   call $~lib/rt/tlsf/insertBlock
  else
   local.get $0
   local.get $2
   i32.const -2
   i32.and
   i32.store
   local.get $0
   i32.const 4
   i32.add
   local.get $0
   i32.load
   i32.const -4
   i32.and
   i32.add
   local.tee $1
   local.get $1
   i32.load
   i32.const -3
   i32.and
   i32.store
  end
  local.get $0
  i32.const 4
  i32.add
 )
 (func $src/wasm/light.as/reseedLocal (param $0 i32) (param $1 i32)
  (local $2 f64)
  (local $3 f64)
  local.get $0
  global.get $src/wasm/light.as/gHashY0
  i32.add
  f64.convert_i32_s
  f64.const 2654435761
  f64.mul
  local.get $1
  global.get $src/wasm/light.as/gHashX0
  i32.add
  f64.convert_i32_s
  f64.add
  local.tee $2
  local.get $2
  f64.const 2.3283064365386963e-10
  f64.mul
  f64.floor
  f64.const 4294967296
  f64.mul
  f64.sub
  local.tee $2
  f64.const -4294967296
  f64.add
  local.get $2
  local.get $2
  f64.const 2147483648
  f64.ge
  select
  i32.trunc_sat_f64_s
  f64.convert_i32_s
  call $src/wasm/light.as/nextSeed48
  local.tee $2
  f64.const 5.9604644775390625e-08
  f64.mul
  f64.floor
  i32.trunc_sat_f64_s
  local.tee $0
  global.get $src/wasm/light.as/masterSeed
  local.tee $3
  f64.const 5.9604644775390625e-08
  f64.mul
  f64.floor
  i32.trunc_sat_f64_s
  local.tee $1
  i32.xor
  f64.convert_i32_s
  f64.const 16777216
  f64.mul
  local.get $2
  local.get $0
  f64.convert_i32_s
  f64.const 16777216
  f64.mul
  f64.sub
  i32.trunc_sat_f64_s
  local.get $3
  local.get $1
  f64.convert_i32_s
  f64.const 16777216
  f64.mul
  f64.sub
  i32.trunc_sat_f64_s
  i32.xor
  f64.convert_i32_s
  f64.add
  global.set $src/wasm/light.as/rndSeed
 )
 (func $src/wasm/light.as/nextSeed48 (param $0 f64) (result f64)
  (local $1 f64)
  local.get $0
  f64.const 281474976710656
  f64.add
  local.get $0
  local.get $0
  f64.const 0
  f64.lt
  select
  local.tee $0
  f64.const 5.9604644775390625e-08
  f64.mul
  f64.floor
  local.tee $1
  f64.const 15525485
  f64.mul
  local.get $0
  local.get $1
  f64.const 16777216
  f64.mul
  f64.sub
  local.tee $0
  f64.const 1502
  f64.mul
  f64.add
  f64.const 16777216
  call $~lib/math/NativeMath.mod
  f64.const 16777216
  f64.mul
  local.get $0
  f64.const 15525485
  f64.mul
  f64.add
  f64.const 11
  f64.add
  local.tee $0
  f64.const -281474976710656
  f64.add
  local.get $0
  local.get $0
  f64.const 281474976710656
  f64.ge
  select
 )
 (func $src/wasm/light.as/blurLine (param $0 i32) (param $1 i32) (param $2 i32) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 f64) (param $7 f64) (param $8 f64) (param $9 f64) (param $10 f64) (param $11 f64) (param $12 f64) (param $13 f64) (param $14 f64)
  (local $15 f64)
  (local $16 f64)
  (local $17 f64)
  (local $18 f64)
  (local $19 f64)
  (local $20 f64)
  (local $21 i32)
  (local $22 i32)
  (local $23 i32)
  (local $24 i32)
  (local $25 i32)
  i32.const 1
  local.set $22
  i32.const 1
  local.set $24
  i32.const 1
  local.set $23
  loop $for-loop|0
   local.get $2
   if
    local.get $0
    i32.const 2
    i32.shl
    local.tee $21
    global.get $src/wasm/light.as/rBuf
    i32.add
    f32.load
    f64.promote_f32
    local.set $20
    global.get $src/wasm/light.as/gBuf
    local.get $21
    i32.add
    f32.load
    f64.promote_f32
    local.set $19
    global.get $src/wasm/light.as/bBuf
    local.get $21
    i32.add
    f32.load
    f64.promote_f32
    local.set $18
    local.get $17
    local.get $20
    f64.lt
    if
     i32.const 0
     local.set $22
     local.get $20
     local.set $17
    end
    local.get $16
    local.get $19
    f64.lt
    if
     i32.const 0
     local.set $24
     local.get $19
     local.set $16
    end
    local.get $15
    local.get $18
    f64.lt
    if
     i32.const 0
     local.set $23
     local.get $18
     local.set $15
    end
    local.get $22
    i32.eqz
    if
     local.get $17
     f64.const 0.0185
     f64.lt
     if
      i32.const 1
      local.set $22
     else
      local.get $17
      local.get $20
      f64.ge
      if
       global.get $src/wasm/light.as/rBuf
       local.get $0
       i32.const 2
       i32.shl
       i32.add
       local.get $17
       f32.demote_f64
       f32.store
      end
     end
    end
    local.get $24
    i32.eqz
    if
     local.get $16
     f64.const 0.0185
     f64.lt
     if
      i32.const 1
      local.set $24
     else
      local.get $16
      local.get $19
      f64.ge
      if
       global.get $src/wasm/light.as/gBuf
       local.get $0
       i32.const 2
       i32.shl
       i32.add
       local.get $16
       f32.demote_f64
       f32.store
      end
     end
    end
    local.get $23
    i32.eqz
    if
     local.get $15
     f64.const 0.0185
     f64.lt
     if
      i32.const 1
      local.set $23
     else
      local.get $15
      local.get $18
      f64.ge
      if
       global.get $src/wasm/light.as/bBuf
       local.get $0
       i32.const 2
       i32.shl
       i32.add
       local.get $15
       f32.demote_f64
       f32.store
      end
     end
    end
    local.get $23
    i32.eqz
    local.get $22
    i32.eqz
    local.tee $25
    local.get $24
    i32.eqz
    i32.or
    i32.or
    if
     global.get $src/wasm/light.as/maskBuf
     local.get $0
     i32.add
     i32.load8_u
     local.tee $21
     if (result f64)
      local.get $21
      i32.const 1
      i32.eq
      if (result f64)
       local.get $17
       local.get $4
       f64.mul
       local.get $17
       local.get $25
       select
       local.set $17
       local.get $16
       local.get $16
       local.get $4
       f64.mul
       local.get $24
       select
       local.set $16
       local.get $15
       local.get $15
       local.get $4
       f64.mul
       local.get $23
       select
      else
       local.get $21
       i32.const 2
       i32.eq
       if (result f64)
        global.get $src/wasm/light.as/lutBuf
        local.get $0
        i32.add
        i32.load8_u
        if (result f64)
         local.get $17
         local.get $17
         local.get $7
         f64.mul
         local.get $22
         select
         local.set $17
         local.get $16
         local.get $16
         local.get $9
         f64.mul
         local.get $24
         select
         local.set $16
         local.get $15
         local.get $15
         local.get $11
         f64.mul
         local.get $23
         select
        else
         local.get $17
         local.get $17
         local.get $6
         f64.mul
         local.get $22
         select
         local.set $17
         local.get $16
         local.get $16
         local.get $8
         f64.mul
         local.get $24
         select
         local.set $16
         local.get $15
         local.get $15
         local.get $10
         f64.mul
         local.get $23
         select
        end
       else
        local.get $21
        i32.const 3
        i32.eq
        if (result f64)
         local.get $17
         local.get $17
         local.get $12
         f64.mul
         local.get $22
         select
         local.set $17
         local.get $16
         local.get $16
         local.get $13
         f64.mul
         local.get $24
         select
         local.set $16
         local.get $15
         local.get $15
         local.get $14
         f64.mul
         local.get $23
         select
        else
         local.get $17
         local.get $17
         local.get $5
         f64.mul
         local.get $22
         select
         local.set $17
         local.get $16
         local.get $16
         local.get $5
         f64.mul
         local.get $24
         select
         local.set $16
         local.get $15
         local.get $15
         local.get $5
         f64.mul
         local.get $23
         select
        end
       end
      end
     else
      local.get $17
      local.get $3
      f64.mul
      local.get $17
      local.get $25
      select
      local.set $17
      local.get $16
      local.get $16
      local.get $3
      f64.mul
      local.get $24
      select
      local.set $16
      local.get $15
      local.get $15
      local.get $3
      f64.mul
      local.get $23
      select
     end
     local.set $15
    end
    local.get $0
    local.get $1
    i32.add
    local.set $0
    local.get $2
    i32.const 1
    i32.sub
    local.set $2
    br $for-loop|0
   end
  end
 )
 (func $~lib/rt/tlsf/removeBlock (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  local.get $1
  i32.load
  i32.const -4
  i32.and
  local.tee $3
  i32.const 256
  i32.lt_u
  if (result i32)
   local.get $3
   i32.const 4
   i32.shr_u
  else
   i32.const 31
   i32.const 1073741820
   local.get $3
   local.get $3
   i32.const 1073741820
   i32.ge_u
   select
   local.tee $3
   i32.clz
   i32.sub
   local.tee $4
   i32.const 7
   i32.sub
   local.set $2
   local.get $3
   local.get $4
   i32.const 4
   i32.sub
   i32.shr_u
   i32.const 16
   i32.xor
  end
  local.set $3
  local.get $1
  i32.load offset=8
  local.set $5
  local.get $1
  i32.load offset=4
  local.tee $4
  if
   local.get $4
   local.get $5
   i32.store offset=8
  end
  local.get $5
  if
   local.get $5
   local.get $4
   i32.store offset=4
  end
  local.get $1
  local.get $0
  local.get $2
  i32.const 4
  i32.shl
  local.get $3
  i32.add
  i32.const 2
  i32.shl
  i32.add
  local.tee $1
  i32.load offset=96
  i32.eq
  if
   local.get $1
   local.get $5
   i32.store offset=96
   local.get $5
   i32.eqz
   if
    local.get $0
    local.get $2
    i32.const 2
    i32.shl
    i32.add
    local.tee $1
    i32.load offset=4
    i32.const -2
    local.get $3
    i32.rotl
    i32.and
    local.set $3
    local.get $1
    local.get $3
    i32.store offset=4
    local.get $3
    i32.eqz
    if
     local.get $0
     local.get $0
     i32.load
     i32.const -2
     local.get $2
     i32.rotl
     i32.and
     i32.store
    end
   end
  end
 )
 (func $src/wasm/light.as/rndNext (param $0 f64) (param $1 f64) (result f64)
  (local $2 f64)
  (local $3 i32)
  (local $4 i32)
  (local $5 f64)
  (local $6 f64)
  local.get $1
  local.get $0
  f64.sub
  local.tee $5
  f64.const 0
  f64.le
  if
   local.get $0
   return
  end
  block $__inlined_func$src/wasm/light.as/rndNextBelow$44
   local.get $5
   i32.trunc_sat_f64_s
   local.tee $3
   local.get $3
   i32.const 0
   local.get $3
   i32.sub
   i32.and
   i32.eq
   if
    global.get $src/wasm/light.as/rndSeed
    call $src/wasm/light.as/nextSeed48
    global.set $src/wasm/light.as/rndSeed
    local.get $5
    global.get $src/wasm/light.as/rndSeed
    i64.trunc_sat_f64_s
    i64.const 17
    i64.shr_s
    f64.convert_i64_s
    f64.mul
    f64.const 4.656612873077393e-10
    f64.mul
    f64.floor
    local.set $2
    br $__inlined_func$src/wasm/light.as/rndNextBelow$44
   end
   loop $for-loop|0
    local.get $4
    i32.eqz
    if
     global.get $src/wasm/light.as/rndSeed
     call $src/wasm/light.as/nextSeed48
     global.set $src/wasm/light.as/rndSeed
     global.get $src/wasm/light.as/rndSeed
     i64.trunc_sat_f64_s
     i64.const 17
     i64.shr_s
     f64.convert_i64_s
     local.tee $1
     local.get $5
     call $~lib/math/NativeMath.mod
     local.set $6
     local.get $1
     f64.const 2147483647
     local.get $5
     f64.const -1
     f64.add
     f64.sub
     f64.le
     if
      i32.const 1
      local.set $4
      local.get $6
      local.set $2
     end
     br $for-loop|0
    end
   end
  end
  local.get $2
  local.get $0
  f64.add
 )
 (func $~lib/rt/tlsf/searchBlock (param $0 i32) (param $1 i32) (result i32)
  (local $2 i32)
  local.get $1
  i32.const 256
  i32.lt_u
  if
   local.get $1
   i32.const 4
   i32.shr_u
   local.set $1
  else
   local.get $1
   i32.const 536870910
   i32.lt_u
   if
    local.get $1
    i32.const 1
    i32.const 27
    local.get $1
    i32.clz
    i32.sub
    i32.shl
    i32.add
    i32.const 1
    i32.sub
    local.set $1
   end
   local.get $1
   i32.const 31
   local.get $1
   i32.clz
   i32.sub
   local.tee $2
   i32.const 4
   i32.sub
   i32.shr_u
   i32.const 16
   i32.xor
   local.set $1
   local.get $2
   i32.const 7
   i32.sub
   local.set $2
  end
  local.get $0
  local.get $2
  i32.const 2
  i32.shl
  i32.add
  i32.load offset=4
  i32.const -1
  local.get $1
  i32.shl
  i32.and
  local.tee $1
  if (result i32)
   local.get $0
   local.get $1
   i32.ctz
   local.get $2
   i32.const 4
   i32.shl
   i32.add
   i32.const 2
   i32.shl
   i32.add
   i32.load offset=96
  else
   local.get $0
   i32.load
   i32.const -1
   local.get $2
   i32.const 1
   i32.add
   i32.shl
   i32.and
   local.tee $1
   if (result i32)
    local.get $0
    local.get $0
    local.get $1
    i32.ctz
    local.tee $0
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=4
    i32.ctz
    local.get $0
    i32.const 4
    i32.shl
    i32.add
    i32.const 2
    i32.shl
    i32.add
    i32.load offset=96
   else
    i32.const 0
   end
  end
 )
 (func $~lib/rt/tlsf/insertBlock (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  local.get $1
  i32.const 4
  i32.add
  local.tee $6
  local.get $1
  i32.load
  local.tee $3
  i32.const -4
  i32.and
  i32.add
  local.tee $4
  i32.load
  local.tee $2
  i32.const 1
  i32.and
  if
   local.get $0
   local.get $4
   call $~lib/rt/tlsf/removeBlock
   local.get $1
   local.get $3
   i32.const 4
   i32.add
   local.get $2
   i32.const -4
   i32.and
   i32.add
   local.tee $3
   i32.store
   local.get $1
   i32.load
   i32.const -4
   i32.and
   local.get $6
   i32.add
   local.tee $4
   i32.load
   local.set $2
  end
  local.get $3
  i32.const 2
  i32.and
  if
   local.get $1
   i32.const 4
   i32.sub
   i32.load
   local.tee $1
   i32.load
   local.set $6
   local.get $0
   local.get $1
   call $~lib/rt/tlsf/removeBlock
   local.get $1
   local.get $6
   i32.const 4
   i32.add
   local.get $3
   i32.const -4
   i32.and
   i32.add
   local.tee $3
   i32.store
  end
  local.get $4
  local.get $2
  i32.const 2
  i32.or
  i32.store
  local.get $4
  i32.const 4
  i32.sub
  local.get $1
  i32.store
  local.get $0
  local.get $3
  i32.const -4
  i32.and
  local.tee $2
  i32.const 256
  i32.lt_u
  if (result i32)
   local.get $2
   i32.const 4
   i32.shr_u
  else
   i32.const 31
   i32.const 1073741820
   local.get $2
   local.get $2
   i32.const 1073741820
   i32.ge_u
   select
   local.tee $2
   i32.clz
   i32.sub
   local.tee $3
   i32.const 7
   i32.sub
   local.set $5
   local.get $2
   local.get $3
   i32.const 4
   i32.sub
   i32.shr_u
   i32.const 16
   i32.xor
  end
  local.tee $2
  local.get $5
  i32.const 4
  i32.shl
  i32.add
  i32.const 2
  i32.shl
  i32.add
  i32.load offset=96
  local.set $3
  local.get $1
  i32.const 0
  i32.store offset=4
  local.get $1
  local.get $3
  i32.store offset=8
  local.get $3
  if
   local.get $3
   local.get $1
   i32.store offset=4
  end
  local.get $0
  local.get $5
  i32.const 4
  i32.shl
  local.get $2
  i32.add
  i32.const 2
  i32.shl
  i32.add
  local.get $1
  i32.store offset=96
  local.get $0
  local.get $0
  i32.load
  i32.const 1
  local.get $5
  i32.shl
  i32.or
  i32.store
  local.get $0
  local.get $5
  i32.const 2
  i32.shl
  i32.add
  local.tee $0
  local.get $0
  i32.load offset=4
  i32.const 1
  local.get $2
  i32.shl
  i32.or
  i32.store offset=4
 )
 (func $~lib/rt/tlsf/addMemory (param $0 i32) (param $1 i32) (param $2 i64)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  local.get $1
  i32.const 19
  i32.add
  i32.const -16
  i32.and
  i32.const 4
  i32.sub
  local.set $1
  local.get $0
  i32.load offset=1568
  local.tee $3
  if
   local.get $3
   local.get $1
   i32.const 16
   i32.sub
   local.tee $5
   i32.eq
   if
    local.get $3
    i32.load
    local.set $4
    local.get $5
    local.set $1
   end
  end
  local.get $2
  i32.wrap_i64
  i32.const -16
  i32.and
  local.get $1
  i32.sub
  local.tee $3
  i32.const 20
  i32.lt_u
  if
   return
  end
  local.get $1
  local.get $4
  i32.const 2
  i32.and
  local.get $3
  i32.const 8
  i32.sub
  local.tee $3
  i32.const 1
  i32.or
  i32.or
  i32.store
  local.get $1
  i32.const 0
  i32.store offset=4
  local.get $1
  i32.const 0
  i32.store offset=8
  local.get $1
  i32.const 4
  i32.add
  local.get $3
  i32.add
  local.tee $3
  i32.const 2
  i32.store
  local.get $0
  local.get $3
  i32.store offset=1568
  local.get $0
  local.get $1
  call $~lib/rt/tlsf/insertBlock
 )
 (func $~lib/math/NativeMath.mod (param $0 f64) (param $1 f64) (result f64)
  (local $2 i64)
  (local $3 i64)
  (local $4 i64)
  (local $5 i64)
  (local $6 i64)
  (local $7 i64)
  (local $8 i64)
  local.get $1
  f64.abs
  f64.const 1
  f64.eq
  if
   local.get $0
   local.get $0
   f64.trunc
   f64.sub
   local.get $0
   f64.copysign
   return
  end
  local.get $1
  i64.reinterpret_f64
  local.tee $6
  i64.const 52
  i64.shr_u
  i64.const 2047
  i64.and
  local.set $7
  local.get $6
  i64.const 1
  i64.shl
  local.tee $4
  i64.eqz
  local.get $0
  i64.reinterpret_f64
  local.tee $3
  i64.const 52
  i64.shr_u
  i64.const 2047
  i64.and
  local.tee $8
  i64.const 2047
  i64.eq
  i32.or
  local.get $1
  local.get $1
  f64.ne
  i32.or
  if
   local.get $0
   local.get $1
   f64.mul
   local.tee $0
   local.get $0
   f64.div
   return
  end
  local.get $3
  i64.const 1
  i64.shl
  local.tee $2
  local.get $4
  i64.le_u
  if
   local.get $0
   local.get $2
   local.get $4
   i64.ne
   f64.convert_i32_u
   f64.mul
   return
  end
  local.get $3
  i64.const 63
  i64.shr_u
  local.set $5
  local.get $8
  i64.eqz
  if (result i64)
   local.get $3
   i64.const 1
   local.get $8
   local.get $3
   i64.const 12
   i64.shl
   i64.clz
   i64.sub
   local.tee $8
   i64.sub
   i64.shl
  else
   local.get $3
   i64.const 4503599627370495
   i64.and
   i64.const 4503599627370496
   i64.or
  end
  local.set $2
  local.get $7
  i64.eqz
  if (result i64)
   local.get $6
   i64.const 1
   local.get $7
   local.get $6
   i64.const 12
   i64.shl
   i64.clz
   i64.sub
   local.tee $7
   i64.sub
   i64.shl
  else
   local.get $6
   i64.const 4503599627370495
   i64.and
   i64.const 4503599627370496
   i64.or
  end
  local.set $3
  loop $while-continue|0
   local.get $7
   local.get $8
   i64.lt_s
   if
    local.get $2
    local.get $3
    i64.ge_u
    if (result i64)
     local.get $2
     local.get $3
     i64.eq
     if
      local.get $0
      f64.const 0
      f64.mul
      return
     end
     local.get $2
     local.get $3
     i64.sub
    else
     local.get $2
    end
    i64.const 1
    i64.shl
    local.set $2
    local.get $8
    i64.const 1
    i64.sub
    local.set $8
    br $while-continue|0
   end
  end
  local.get $2
  local.get $3
  i64.ge_u
  if
   local.get $2
   local.get $3
   i64.eq
   if
    local.get $0
    f64.const 0
    f64.mul
    return
   end
   local.get $2
   local.get $3
   i64.sub
   local.set $2
  end
  local.get $8
  local.get $2
  i64.const 11
  i64.shl
  i64.clz
  local.tee $4
  i64.sub
  local.set $3
  local.get $2
  local.get $4
  i64.shl
  local.set $2
  local.get $3
  i64.const 0
  i64.gt_s
  if (result i64)
   local.get $2
   i64.const 4503599627370496
   i64.sub
   local.get $3
   i64.const 52
   i64.shl
   i64.or
  else
   local.get $2
   i64.const 1
   local.get $3
   i64.sub
   i64.shr_u
  end
  local.get $5
  i64.const 63
  i64.shl
  i64.or
  f64.reinterpret_i64
 )
 (func $src/wasm/light.as/blurPass (param $0 i32) (param $1 i32) (param $2 i32) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 f64) (param $7 f64) (param $8 f64) (param $9 f64) (param $10 f64) (param $11 f64) (param $12 f64) (param $13 f64) (param $14 f64)
  (local $15 i32)
  (local $16 i32)
  (local $17 i32)
  loop $for-loop|0
   local.get $0
   local.get $15
   i32.gt_s
   if
    local.get $15
    local.get $0
    local.get $1
    local.get $2
    i32.sub
    local.tee $17
    local.get $3
    local.get $4
    local.get $5
    local.get $6
    local.get $7
    local.get $8
    local.get $9
    local.get $10
    local.get $11
    local.get $12
    local.get $13
    local.get $14
    call $src/wasm/light.as/blurLine
    local.get $1
    i32.const 1
    i32.sub
    local.get $0
    i32.mul
    local.get $15
    i32.add
    i32.const 0
    local.get $0
    i32.sub
    local.get $17
    local.get $3
    local.get $4
    local.get $5
    local.get $6
    local.get $7
    local.get $8
    local.get $9
    local.get $10
    local.get $11
    local.get $12
    local.get $13
    local.get $14
    call $src/wasm/light.as/blurLine
    local.get $15
    i32.const 1
    i32.add
    local.set $15
    br $for-loop|0
   end
  end
  loop $for-loop|1
   local.get $1
   local.get $16
   i32.gt_s
   if
    local.get $0
    local.get $16
    i32.mul
    local.tee $15
    i32.const 1
    local.get $0
    local.get $2
    i32.sub
    local.tee $17
    local.get $3
    local.get $4
    local.get $5
    local.get $6
    local.get $7
    local.get $8
    local.get $9
    local.get $10
    local.get $11
    local.get $12
    local.get $13
    local.get $14
    call $src/wasm/light.as/blurLine
    local.get $0
    local.get $15
    i32.add
    i32.const 1
    i32.sub
    i32.const -1
    local.get $17
    local.get $3
    local.get $4
    local.get $5
    local.get $6
    local.get $7
    local.get $8
    local.get $9
    local.get $10
    local.get $11
    local.get $12
    local.get $13
    local.get $14
    call $src/wasm/light.as/blurLine
    local.get $16
    i32.const 1
    i32.add
    local.set $16
    br $for-loop|1
   end
  end
 )
 (func $src/wasm/light.as/surfaceSkyAs (param $0 i32) (param $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  global.get $src/wasm/light.as/gWw
  local.tee $4
  local.get $1
  i32.mul
  local.get $0
  i32.add
  local.tee $2
  i32.const 1
  i32.shl
  local.tee $6
  global.get $src/wasm/light.as/typeBuf
  i32.add
  i32.load16_u
  local.set $3
  global.get $src/wasm/light.as/flagsBuf
  local.get $2
  i32.add
  i32.load8_u
  local.set $5
  block $folding-inner2
   block $folding-inner1
    global.get $src/wasm/light.as/wallBuf
    local.get $6
    i32.add
    i32.load16_u
    local.tee $6
    if (result i32)
     local.get $6
     i32.const 512
     i32.lt_u
     if (result i32)
      global.get $src/wasm/light.as/tblWallLight
      local.get $6
      i32.add
      i32.load8_u
     else
      i32.const 0
     end
    else
     i32.const 1
    end
    if (result i32)
     i32.const 0
    else
     global.get $src/wasm/light.as/gShowInv
     i32.const 1
     global.get $src/wasm/light.as/coatBuf
     local.get $2
     i32.add
     i32.load8_u
     i32.const 4
     i32.and
     select
    end
    br_if $folding-inner2
    local.get $3
    i32.const 0
    local.get $5
    select
    if (result i32)
     global.get $src/wasm/light.as/tblAllowWater
     local.get $3
     i32.add
     i32.load8_u
    else
     i32.const 0
    end
    br_if $folding-inner1
    local.get $3
    i32.const 0
    local.get $5
    select
    if (result i32)
     global.get $src/wasm/light.as/tblNoSun
     local.get $3
     i32.add
     i32.load8_u
    else
     i32.const 0
    end
    if
     i32.const 0
     global.get $src/wasm/light.as/gShowInv
     i32.const 1
     global.get $src/wasm/light.as/coatBuf
     local.get $2
     i32.add
     i32.load8_u
     i32.const 2
     i32.and
     select
     global.get $src/wasm/light.as/slopeBuf
     local.get $2
     i32.add
     i32.load8_u
     if (result i32)
      i32.const 1
     else
      global.get $src/wasm/light.as/halfBuf
      local.get $2
      i32.add
      i32.load8_u
     end
     select
     br_if $folding-inner2
     global.get $src/wasm/light.as/liqBuf
     local.get $2
     local.get $4
     i32.sub
     i32.add
     i32.load8_u
     if (result i32)
      i32.const 1
     else
      global.get $src/wasm/light.as/liqBuf
      local.get $2
      local.get $4
      i32.add
      i32.add
      i32.load8_u
     end
     if (result i32)
      i32.const 1
     else
      global.get $src/wasm/light.as/liqBuf
      local.get $2
      i32.const 1
      i32.sub
      i32.add
      i32.load8_u
     end
     if (result i32)
      i32.const 1
     else
      global.get $src/wasm/light.as/liqBuf
      local.get $2
      i32.const 1
      i32.add
      i32.add
      i32.load8_u
     end
     br_if $folding-inner2
    end
    global.get $src/wasm/light.as/liqBuf
    local.get $2
    i32.add
    i32.load8_u
    i32.const 200
    i32.lt_u
    if
     global.get $src/wasm/light.as/halfBuf
     local.get $2
     i32.add
     i32.load8_u
     if (result i32)
      global.get $src/wasm/light.as/liqBuf
      local.get $2
      local.get $4
      i32.sub
      i32.add
      i32.load8_u
      i32.const 200
      i32.ge_u
     else
      i32.const 0
     end
     br_if $folding-inner2
     br $folding-inner1
    end
    global.get $src/wasm/light.as/gSwa
    f64.const 0
    f64.gt
    if
     local.get $1
     local.get $0
     call $src/wasm/light.as/reseedLocal
     f64.const 0
     global.set $src/wasm/light.as/sRetR
     f64.const 0
     global.set $src/wasm/light.as/sRetG
     global.get $src/wasm/light.as/rndSeed
     call $src/wasm/light.as/nextSeed48
     global.set $src/wasm/light.as/rndSeed
     global.get $src/wasm/light.as/gSkyB
     f64.const 0.175
     f64.mul
     global.get $src/wasm/light.as/rndSeed
     i64.trunc_sat_f64_s
     i64.const 24
     i64.shr_s
     f64.convert_i64_s
     f64.const 5.9604644775390625e-08
     f64.mul
     f64.const 0.13
     f64.mul
     f64.const 1
     f64.add
     f64.mul
     global.get $src/wasm/light.as/gSwa
     f64.mul
     global.set $src/wasm/light.as/sRetB
     return
    end
    br $folding-inner2
   end
   global.get $src/wasm/light.as/gSkyR
   global.set $src/wasm/light.as/sRetR
   global.get $src/wasm/light.as/gSkyG
   global.set $src/wasm/light.as/sRetG
   global.get $src/wasm/light.as/gSkyB
   global.set $src/wasm/light.as/sRetB
   return
  end
  f64.const 0
  global.set $src/wasm/light.as/sRetR
  f64.const 0
  global.set $src/wasm/light.as/sRetG
  f64.const 0
  global.set $src/wasm/light.as/sRetB
 )
 (func $src/wasm/light.as/lightWireBuf (result i32)
  global.get $src/wasm/light.as/wireBuf
 )
 (func $src/wasm/light.as/lightWallBuf (result i32)
  global.get $src/wasm/light.as/wallBuf
 )
 (func $src/wasm/light.as/lightVersion (result i32)
  i32.const 2
 )
 (func $src/wasm/light.as/lightTypeBuf (result i32)
  global.get $src/wasm/light.as/typeBuf
 )
 (func $src/wasm/light.as/lightTblWallLight (result i32)
  global.get $src/wasm/light.as/tblWallLight
 )
 (func $src/wasm/light.as/lightTblWallEmR (result i32)
  global.get $src/wasm/light.as/tblWallEmR
 )
 (func $src/wasm/light.as/lightTblWallEmHas (result i32)
  global.get $src/wasm/light.as/tblWallEmHas
 )
 (func $src/wasm/light.as/lightTblWallEmGated (result i32)
  global.get $src/wasm/light.as/tblWallEmGated
 )
 (func $src/wasm/light.as/lightTblWallEmG (result i32)
  global.get $src/wasm/light.as/tblWallEmG
 )
 (func $src/wasm/light.as/lightTblWallEmB (result i32)
  global.get $src/wasm/light.as/tblWallEmB
 )
 (func $src/wasm/light.as/lightTblTorch (result i32)
  global.get $src/wasm/light.as/tblTorch
 )
 (func $src/wasm/light.as/lightTblTogDelta (result i32)
  global.get $src/wasm/light.as/tblTogDelta
 )
 (func $src/wasm/light.as/lightTblTogAxis (result i32)
  global.get $src/wasm/light.as/tblTogAxis
 )
 (func $src/wasm/light.as/lightTblSpecial (result i32)
  global.get $src/wasm/light.as/tblSpecial
 )
 (func $src/wasm/light.as/lightTblSheet (result i32)
  global.get $src/wasm/light.as/tblSheet
 )
 (func $src/wasm/light.as/lightTblPaint (result i32)
  global.get $src/wasm/light.as/tblPaint
 )
 (func $src/wasm/light.as/lightTblNoSun (result i32)
  global.get $src/wasm/light.as/tblNoSun
 )
 (func $src/wasm/light.as/lightTblMush (result i32)
  global.get $src/wasm/light.as/tblMush
 )
 (func $src/wasm/light.as/lightTblLightR (result i32)
  global.get $src/wasm/light.as/tblLightR
 )
 (func $src/wasm/light.as/lightTblLightG (result i32)
  global.get $src/wasm/light.as/tblLightG
 )
 (func $src/wasm/light.as/lightTblLightB (result i32)
  global.get $src/wasm/light.as/tblLightB
 )
 (func $src/wasm/light.as/lightTblHasLight (result i32)
  global.get $src/wasm/light.as/tblHasLight
 )
 (func $src/wasm/light.as/lightTblGlass (result i32)
  global.get $src/wasm/light.as/tblGlass
 )
 (func $src/wasm/light.as/lightTblFlicker (result i32)
  global.get $src/wasm/light.as/tblFlicker
 )
 (func $src/wasm/light.as/lightTblCracked (result i32)
  global.get $src/wasm/light.as/tblCracked
 )
 (func $src/wasm/light.as/lightTblBlocks (result i32)
  global.get $src/wasm/light.as/tblBlocks
 )
 (func $src/wasm/light.as/lightTblAllowWater (result i32)
  global.get $src/wasm/light.as/tblAllowWater
 )
 (func $src/wasm/light.as/lightTablesReady (result i32)
  global.get $src/wasm/light.as/tablesReady
  i32.const 0
  i32.ne
 )
 (func $src/wasm/light.as/lightSpListBuf (result i32)
  global.get $src/wasm/light.as/spListBuf
 )
 (func $src/wasm/light.as/lightSlopeBuf (result i32)
  global.get $src/wasm/light.as/slopeBuf
 )
 (func $src/wasm/light.as/lightSetPixelBlock (param $0 i32)
  local.get $0
  global.set $src/wasm/light.as/pixelBlockId
 )
 (func $src/wasm/light.as/lightRBuf (result i32)
  global.get $src/wasm/light.as/rBuf
 )
 (func $src/wasm/light.as/lightPaintWallBuf (result i32)
  global.get $src/wasm/light.as/paintWallBuf
 )
 (func $src/wasm/light.as/lightPaintBuf (result i32)
  global.get $src/wasm/light.as/paintBuf
 )
 (func $src/wasm/light.as/lightMaskBuf (result i32)
  global.get $src/wasm/light.as/maskBuf
 )
 (func $src/wasm/light.as/lightMarkTablesReady
  i32.const 1
  global.set $src/wasm/light.as/tablesReady
 )
 (func $src/wasm/light.as/lightLutBuf (result i32)
  global.get $src/wasm/light.as/lutBuf
 )
 (func $src/wasm/light.as/lightLiqTBuf (result i32)
  global.get $src/wasm/light.as/liqTBuf
 )
 (func $src/wasm/light.as/lightLiqBuf (result i32)
  global.get $src/wasm/light.as/liqBuf
 )
 (func $src/wasm/light.as/lightInit (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  global.get $src/wasm/light.as/capCells
  if
   i32.const 1
   return
  end
  local.get $0
  i32.const 0
  i32.le_s
  local.get $0
  i32.const 16777216
  i32.gt_s
  i32.or
  if
   i32.const 0
   return
  end
  local.get $0
  i32.const 2
  i32.shl
  local.tee $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/rBuf
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/gBuf
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/bBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/maskBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/lutBuf
  local.get $0
  i32.const 1
  i32.shl
  local.tee $2
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/typeBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/flagsBuf
  local.get $2
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/fxBuf
  local.get $2
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/fyBuf
  local.get $2
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/wallBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/liqBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/liqTBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/halfBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/slopeBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/wireBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/paintBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/paintWallBuf
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/coatBuf
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/spListBuf
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblBlocks
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblNoSun
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblCracked
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblAllowWater
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblMush
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblFlicker
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblHasLight
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblSpecial
  i32.const 131072
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblSheet
  i32.const 262144
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblLightR
  i32.const 262144
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblLightG
  i32.const 262144
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblLightB
  i32.const 512
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblWallLight
  i32.const 512
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblWallEmHas
  i32.const 512
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblWallEmGated
  i32.const 2048
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblWallEmR
  i32.const 2048
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblWallEmG
  i32.const 2048
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblWallEmB
  i32.const 576
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblTorch
  i32.const 168
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblGlass
  i32.const 6144
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblPaint
  i32.const 65536
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblTogAxis
  i32.const 131072
  call $~lib/memory/heap.alloc
  global.set $src/wasm/light.as/tblTogDelta
  local.get $0
  global.set $src/wasm/light.as/capCells
  i32.const 1
 )
 (func $src/wasm/light.as/lightHalfBuf (result i32)
  global.get $src/wasm/light.as/halfBuf
 )
 (func $src/wasm/light.as/lightGBuf (result i32)
  global.get $src/wasm/light.as/gBuf
 )
 (func $src/wasm/light.as/lightFyBuf (result i32)
  global.get $src/wasm/light.as/fyBuf
 )
 (func $src/wasm/light.as/lightFxBuf (result i32)
  global.get $src/wasm/light.as/fxBuf
 )
 (func $src/wasm/light.as/lightFlagsBuf (result i32)
  global.get $src/wasm/light.as/flagsBuf
 )
 (func $src/wasm/light.as/lightExport (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 f64) (param $7 f64) (param $8 i32) (param $9 i32) (param $10 f64) (param $11 f64) (param $12 f64) (param $13 f64) (param $14 f64) (param $15 f64) (param $16 f64) (param $17 f64) (param $18 f64) (param $19 f64) (param $20 f64) (param $21 f64) (param $22 f64) (param $23 f64) (param $24 f64) (param $25 i32) (param $26 i32) (param $27 i32) (result i32)
  (local $28 i32)
  (local $29 i32)
  (local $30 i32)
  (local $31 i32)
  (local $32 i32)
  (local $33 i32)
  (local $34 i32)
  (local $35 i32)
  (local $36 i32)
  (local $37 i32)
  (local $38 i32)
  (local $39 i32)
  (local $40 i32)
  (local $41 i32)
  (local $42 i32)
  (local $43 i32)
  (local $44 i32)
  global.get $src/wasm/light.as/tablesReady
  i32.eqz
  global.get $src/wasm/light.as/capCells
  i32.eqz
  i32.or
  if
   i32.const -1
   return
  end
  local.get $1
  i32.const 0
  i32.le_s
  local.get $0
  i32.const 0
  i32.le_s
  i32.or
  local.get $4
  i32.const 0
  i32.le_s
  i32.or
  local.get $5
  i32.const 0
  i32.le_s
  i32.or
  if
   i32.const -1
   return
  end
  local.get $1
  i32.const 65536
  i32.gt_s
  local.get $0
  i32.const 65536
  i32.gt_s
  i32.or
  local.get $4
  i32.const 65536
  i32.gt_s
  i32.or
  local.get $5
  i32.const 65536
  i32.gt_s
  i32.or
  if
   i32.const -1
   return
  end
  global.get $src/wasm/light.as/capCells
  local.get $0
  local.get $1
  i32.mul
  i32.lt_s
  local.get $4
  local.get $5
  i32.mul
  local.tee $28
  global.get $src/wasm/light.as/capCells
  i32.gt_s
  i32.or
  if
   i32.const -1
   return
  end
  local.get $2
  local.get $3
  i32.or
  i32.const 0
  i32.lt_s
  local.get $2
  local.get $4
  i32.add
  local.get $0
  i32.gt_s
  i32.or
  local.get $3
  local.get $5
  i32.add
  local.get $1
  i32.gt_s
  i32.or
  if
   i32.const -1
   return
  end
  local.get $6
  global.set $src/wasm/light.as/gGl
  local.get $7
  global.set $src/wasm/light.as/gLava
  local.get $11
  global.set $src/wasm/light.as/gSkyR
  local.get $12
  global.set $src/wasm/light.as/gSkyG
  local.get $13
  global.set $src/wasm/light.as/gSkyB
  local.get $14
  global.set $src/wasm/light.as/gDk
  local.get $15
  global.set $src/wasm/light.as/gSwa
  local.get $16
  global.set $src/wasm/light.as/gHellR
  local.get $17
  global.set $src/wasm/light.as/gHellG
  local.get $18
  global.set $src/wasm/light.as/gHellB
  local.get $19
  global.set $src/wasm/light.as/gLavaV
  local.get $20
  global.set $src/wasm/light.as/gOsc
  local.get $21
  global.set $src/wasm/light.as/gDr
  local.get $22
  global.set $src/wasm/light.as/gDg
  local.get $23
  global.set $src/wasm/light.as/gDb
  local.get $24
  global.set $src/wasm/light.as/gDemon
  local.get $25
  global.set $src/wasm/light.as/gCloudType
  local.get $26
  global.set $src/wasm/light.as/gCloudDay
  local.get $27
  global.set $src/wasm/light.as/gShowInv
  local.get $0
  global.set $src/wasm/light.as/gWw
  local.get $8
  global.set $src/wasm/light.as/gHashX0
  local.get $9
  global.set $src/wasm/light.as/gHashY0
  local.get $10
  global.set $src/wasm/light.as/masterSeed
  i32.const 0
  global.set $src/wasm/light.as/spCount
  global.get $src/wasm/light.as/rBuf
  i32.const 0
  local.get $28
  i32.const 2
  i32.shl
  local.tee $8
  memory.fill
  global.get $src/wasm/light.as/gBuf
  i32.const 0
  local.get $8
  memory.fill
  global.get $src/wasm/light.as/bBuf
  i32.const 0
  local.get $8
  memory.fill
  global.get $src/wasm/light.as/maskBuf
  i32.const 0
  local.get $28
  memory.fill
  i32.const 1
  local.get $2
  i32.sub
  i32.const 0
  local.get $2
  i32.const 0
  i32.le_s
  select
  local.set $8
  local.get $4
  i32.const 1
  i32.sub
  local.tee $9
  local.get $0
  i32.const 2
  i32.sub
  local.get $2
  i32.sub
  local.tee $0
  local.get $0
  local.get $9
  i32.gt_s
  select
  local.set $9
  local.get $5
  i32.const 1
  i32.sub
  local.tee $0
  local.get $1
  i32.const 2
  i32.sub
  local.get $3
  i32.sub
  local.tee $1
  local.get $0
  local.get $1
  i32.lt_s
  select
  local.set $5
  i32.const 1
  local.get $3
  i32.sub
  i32.const 0
  local.get $3
  i32.const 0
  i32.le_s
  select
  local.set $27
  loop $for-loop|0
   local.get $5
   local.get $27
   i32.ge_s
   if
    local.get $3
    local.get $27
    i32.add
    local.tee $29
    global.get $src/wasm/light.as/gWw
    i32.mul
    local.set $25
    local.get $4
    local.get $27
    i32.mul
    local.set $26
    local.get $29
    f64.convert_i32_s
    local.tee $6
    global.get $src/wasm/light.as/gGl
    f64.le
    local.tee $30
    i32.eqz
    global.get $src/wasm/light.as/gLava
    local.get $6
    f64.lt
    i32.and
    local.set $28
    global.get $src/wasm/light.as/gSkyR
    global.get $src/wasm/light.as/gHellR
    local.get $30
    select
    local.set $15
    global.get $src/wasm/light.as/gSkyG
    global.get $src/wasm/light.as/gHellG
    local.get $30
    select
    local.set $16
    global.get $src/wasm/light.as/gSkyB
    global.get $src/wasm/light.as/gHellB
    local.get $30
    select
    local.set $17
    local.get $8
    local.set $0
    loop $for-loop|1
     local.get $0
     local.get $9
     i32.le_s
     if
      local.get $25
      local.get $0
      local.get $2
      i32.add
      local.tee $38
      i32.add
      local.tee $31
      global.get $src/wasm/light.as/flagsBuf
      i32.add
      i32.load8_u
      local.set $32
      local.get $31
      i32.const 1
      i32.shl
      local.tee $1
      global.get $src/wasm/light.as/wallBuf
      i32.add
      i32.load16_u
      local.set $33
      global.get $src/wasm/light.as/liqBuf
      local.get $31
      i32.add
      i32.load8_u
      local.set $39
      global.get $src/wasm/light.as/liqTBuf
      local.get $31
      i32.add
      i32.load8_u
      local.set $40
      global.get $src/wasm/light.as/coatBuf
      local.get $31
      i32.add
      i32.load8_u
      local.set $34
      local.get $0
      local.get $26
      i32.add
      local.tee $41
      global.get $src/wasm/light.as/maskBuf
      i32.add
      global.get $src/wasm/light.as/typeBuf
      local.get $1
      i32.add
      i32.load16_u
      local.tee $35
      global.get $src/wasm/light.as/gCloudType
      i32.eq
      if (result i32)
       global.get $src/wasm/light.as/gCloudDay
      else
       global.get $src/wasm/light.as/tblBlocks
       local.get $35
       i32.add
       i32.load8_u
      end
      local.tee $36
      i32.const 0
      local.get $32
      i32.const 0
      local.get $35
      select
      select
      if (result i32)
       global.get $src/wasm/light.as/gShowInv
       local.get $34
       i32.const 2
       i32.and
       i32.eqz
       i32.or
      else
       i32.const 0
      end
      if (result i32)
       global.get $src/wasm/light.as/wireBuf
       local.get $31
       i32.add
       i32.load8_u
       i32.const 32
       i32.and
      else
       i32.const 1
      end
      if (result i32)
       i32.const 1
      else
       global.get $src/wasm/light.as/slopeBuf
       local.get $31
       i32.add
       i32.load8_u
      end
      if (result i32)
       local.get $40
       i32.const 2
       i32.ne
       local.get $39
       i32.const 128
       i32.gt_u
       i32.and
       if (result i32)
        i32.const 3
        i32.const 2
        local.get $40
        i32.const 3
        i32.eq
        select
       else
        i32.const 0
       end
      else
       i32.const 4
       i32.const 1
       global.get $src/wasm/light.as/tblCracked
       local.get $35
       i32.add
       i32.load8_u
       select
      end
      i32.store8
      f64.const 0
      local.set $12
      f64.const 0
      local.set $13
      local.get $30
      if (result f64)
       local.get $38
       local.get $29
       call $src/wasm/light.as/surfaceSkyAs
       global.get $src/wasm/light.as/sRetG
       local.set $12
       global.get $src/wasm/light.as/sRetB
       local.set $13
       global.get $src/wasm/light.as/sRetR
      else
       local.get $28
       if (result f64)
        global.get $src/wasm/light.as/gWw
        local.tee $42
        local.get $29
        i32.mul
        local.get $38
        i32.add
        local.tee $37
        i32.const 1
        i32.shl
        local.tee $43
        global.get $src/wasm/light.as/typeBuf
        i32.add
        i32.load16_u
        local.set $44
        i32.const 0
        local.set $1
        block $__inlined_func$src/wasm/light.as/hellSkyAs$47
         global.get $src/wasm/light.as/wallBuf
         local.get $43
         i32.add
         i32.load16_u
         local.tee $43
         if (result i32)
          local.get $43
          i32.const 512
          i32.lt_u
          if (result i32)
           global.get $src/wasm/light.as/tblWallLight
           local.get $43
           i32.add
           i32.load8_u
          else
           i32.const 0
          end
         else
          i32.const 1
         end
         if (result i32)
          i32.const 0
         else
          global.get $src/wasm/light.as/gShowInv
          i32.const 1
          global.get $src/wasm/light.as/coatBuf
          local.get $37
          i32.add
          i32.load8_u
          i32.const 4
          i32.and
          select
         end
         br_if $__inlined_func$src/wasm/light.as/hellSkyAs$47
         local.get $44
         i32.const 0
         global.get $src/wasm/light.as/flagsBuf
         local.get $37
         i32.add
         i32.load8_u
         select
         if (result i32)
          global.get $src/wasm/light.as/tblNoSun
          local.get $44
          i32.add
          i32.load8_u
         else
          i32.const 0
         end
         if
          global.get $src/wasm/light.as/slopeBuf
          local.get $37
          i32.add
          i32.load8_u
          if (result i32)
           i32.const 1
          else
           global.get $src/wasm/light.as/halfBuf
           local.get $37
           i32.add
           i32.load8_u
           i32.const 0
           i32.ne
          end
          i32.eqz
          br_if $__inlined_func$src/wasm/light.as/hellSkyAs$47
          global.get $src/wasm/light.as/liqBuf
          local.get $37
          local.get $42
          i32.sub
          i32.add
          i32.load8_u
          if (result i32)
           i32.const 1
          else
           global.get $src/wasm/light.as/liqBuf
           local.get $37
           local.get $42
           i32.add
           i32.add
           i32.load8_u
          end
          if (result i32)
           i32.const 1
          else
           global.get $src/wasm/light.as/liqBuf
           local.get $37
           i32.const 1
           i32.sub
           i32.add
           i32.load8_u
          end
          if (result i32)
           i32.const 1
          else
           global.get $src/wasm/light.as/liqBuf
           local.get $37
           i32.const 1
           i32.add
           i32.add
           i32.load8_u
          end
          br_if $__inlined_func$src/wasm/light.as/hellSkyAs$47
         end
         global.get $src/wasm/light.as/liqBuf
         local.get $37
         i32.add
         i32.load8_u
         i32.const 200
         i32.ge_u
         br_if $__inlined_func$src/wasm/light.as/hellSkyAs$47
         global.get $src/wasm/light.as/halfBuf
         local.get $37
         i32.add
         i32.load8_u
         if (result i32)
          global.get $src/wasm/light.as/liqBuf
          local.get $37
          local.get $42
          i32.sub
          i32.add
          i32.load8_u
          i32.const 200
          i32.ge_u
         else
          i32.const 0
         end
         br_if $__inlined_func$src/wasm/light.as/hellSkyAs$47
         i32.const 1
         local.set $1
        end
        local.get $1
        if (result f64)
         global.get $src/wasm/light.as/gHellG
         local.set $12
         global.get $src/wasm/light.as/gHellB
         local.set $13
         global.get $src/wasm/light.as/gHellR
        else
         f64.const 0
        end
       else
        f64.const 0
       end
      end
      local.set $11
      local.get $33
      i32.const 93
      i32.le_u
      local.get $33
      i32.const 88
      i32.ge_u
      i32.and
      local.get $33
      i32.const 241
      i32.eq
      i32.or
      local.get $39
      i32.const 255
      i32.lt_u
      i32.and
      if
       local.get $32
       if (result i32)
        global.get $src/wasm/light.as/halfBuf
        local.get $31
        i32.add
        i32.load8_u
       else
        i32.const 1
       end
       if (result i32)
        i32.const 0
       else
        global.get $src/wasm/light.as/tblNoSun
        local.get $35
        i32.add
        i32.load8_u
       end
       i32.eqz
       if
        local.get $15
        i32.const 6
        local.get $33
        i32.const 88
        i32.sub
        local.get $33
        i32.const 241
        i32.eq
        select
        local.tee $1
        i32.const 5
        i32.eq
        if (result f64)
         global.get $src/wasm/light.as/gDg
         f64.const 0.2
         f64.mul
         f64.const 0.5
         f64.add
         local.set $12
         global.get $src/wasm/light.as/gDb
         f64.const 0.2
         f64.mul
         f64.const 0.5
         f64.add
         local.set $13
         global.get $src/wasm/light.as/gDr
         f64.const 0.2
         f64.mul
         f64.const 0.5
         f64.add
        else
         global.get $src/wasm/light.as/tblGlass
         local.get $1
         i32.const 3
         i32.mul
         local.tee $37
         i32.const 1
         i32.add
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.set $12
         global.get $src/wasm/light.as/tblGlass
         local.get $37
         i32.const 2
         i32.add
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.set $13
         global.get $src/wasm/light.as/tblGlass
         local.get $1
         i32.const 24
         i32.mul
         i32.add
         f64.load
        end
        f64.mul
        local.set $11
        local.get $17
        local.get $13
        f64.mul
        local.set $13
        local.get $16
        local.get $12
        f64.mul
        local.set $12
       end
      end
      local.get $30
      if
       local.get $12
       global.get $src/wasm/light.as/gDk
       f64.mul
       local.set $12
       local.get $13
       global.get $src/wasm/light.as/gDk
       f64.mul
       local.set $13
       local.get $11
       global.get $src/wasm/light.as/gDk
       f64.mul
       local.set $11
      end
      local.get $11
      f64.const 0
      local.get $11
      f64.const 0
      f64.gt
      select
      local.set $6
      local.get $12
      f64.const 0
      local.get $12
      f64.const 0
      f64.gt
      select
      local.set $7
      local.get $13
      f64.const 0
      local.get $13
      f64.const 0
      f64.gt
      select
      local.set $10
      local.get $33
      if
       local.get $36
       i32.const 0
       local.get $32
       i32.const 0
       local.get $35
       i32.const 0
       local.get $33
       select
       select
       select
       if (result i32)
        local.get $34
        i32.const 2
        i32.and
        i32.eqz
        global.get $src/wasm/light.as/gShowInv
        i32.const 0
        i32.ne
        i32.or
       else
        i32.const 0
       end
       local.set $1
       f64.const 0
       local.set $11
       f64.const 0
       local.set $12
       f64.const 0
       local.set $13
       local.get $33
       i32.const 512
       i32.lt_u
       if (result i32)
        global.get $src/wasm/light.as/tblWallEmHas
        local.get $33
        i32.add
        i32.load8_u
       else
        i32.const 0
       end
       if
        local.get $1
        i32.eqz
        global.get $src/wasm/light.as/tblWallEmGated
        local.get $33
        i32.add
        i32.load8_u
        i32.eqz
        i32.or
        if (result f64)
         local.get $33
         i32.const 2
         i32.shl
         local.tee $34
         global.get $src/wasm/light.as/tblWallEmG
         i32.add
         f32.load
         f64.promote_f32
         local.set $12
         global.get $src/wasm/light.as/tblWallEmB
         local.get $34
         i32.add
         f32.load
         f64.promote_f32
         local.set $13
         global.get $src/wasm/light.as/tblWallEmR
         local.get $34
         i32.add
         f32.load
         f64.promote_f32
        else
         f64.const 0
        end
        local.set $11
       else
        local.get $33
        i32.const 137
        i32.eq
        if (result f64)
         local.get $1
         if (result f64)
          f64.const 0
         else
          local.get $29
          local.get $38
          call $src/wasm/light.as/reseedLocal
          f64.const 270
          global.get $src/wasm/light.as/gOsc
          f64.sub
          f64.const 1500
          f64.div
          f64.const 0.4
          f64.add
          f64.const 0
          f64.const 50
          call $src/wasm/light.as/rndNext
          f64.const 0.0005
          f64.mul
          f64.add
          local.tee $11
          f64.const 0.5
          f64.mul
          local.set $12
          local.get $11
          f64.const 0.1
          f64.mul
         end
        else
         local.get $1
         i32.eqz
         local.get $33
         i32.const 44
         i32.eq
         local.tee $34
         local.get $33
         i32.const 346
         i32.eq
         i32.or
         i32.and
         if (result f64)
          global.get $src/wasm/light.as/gDr
          f64.const 0.15
          f64.const 0.25
          local.get $34
          select
          local.tee $13
          f64.mul
          local.set $11
          global.get $src/wasm/light.as/gDg
          local.get $13
          f64.mul
          local.set $12
          global.get $src/wasm/light.as/gDb
          local.get $13
          f64.mul
         else
          f64.const 0
         end
        end
        local.set $13
       end
       local.get $1
       i32.const 1
       local.get $33
       i32.const 357
       i32.eq
       local.get $33
       i32.const 175
       i32.eq
       i32.or
       if (result i32)
        global.get $src/wasm/light.as/paintWallBuf
        local.get $31
        i32.add
        i32.load8_u
       else
        i32.const 0
       end
       select
       i32.eqz
       if
        global.get $src/wasm/light.as/tblPaint
        global.get $src/wasm/light.as/paintWallBuf
        local.get $31
        i32.add
        i32.load8_u
        local.tee $1
        i32.const 24
        i32.mul
        i32.add
        f64.load
        f64.const 765
        f64.div
        local.set $11
        global.get $src/wasm/light.as/tblPaint
        local.get $1
        i32.const 3
        i32.mul
        local.tee $1
        i32.const 2
        i32.add
        i32.const 3
        i32.shl
        i32.add
        f64.load
        f64.const 765
        f64.div
        local.set $13
        global.get $src/wasm/light.as/tblPaint
        local.get $1
        i32.const 1
        i32.add
        i32.const 3
        i32.shl
        i32.add
        f64.load
        f64.const 765
        f64.div
        local.set $12
       end
       local.get $12
       local.get $7
       local.get $7
       local.get $12
       f64.lt
       select
       local.set $7
       local.get $13
       local.get $10
       local.get $10
       local.get $13
       f64.lt
       select
       local.set $10
       local.get $11
       local.get $6
       local.get $6
       local.get $11
       f64.lt
       select
       local.set $6
      end
      local.get $35
      i32.const 0
      local.get $32
      select
      if (result i32)
       local.get $31
       i32.const 1
       i32.shl
       local.tee $1
       global.get $src/wasm/light.as/fyBuf
       i32.add
       i32.load16_u
       local.set $32
       global.get $src/wasm/light.as/tblSheet
       local.get $35
       i32.const 1
       i32.shl
       i32.add
       i32.load16_s
       local.tee $33
       i32.const 349
       i32.eq
       global.get $src/wasm/light.as/fxBuf
       local.get $1
       i32.add
       i32.load16_u
       local.tee $1
       i32.const 36
       i32.lt_u
       i32.and
       i32.const 1
       i32.const 1
       local.get $35
       global.get $src/wasm/light.as/pixelBlockId
       i32.eq
       global.get $src/wasm/light.as/tblHasLight
       local.get $35
       i32.add
       i32.load8_u
       if (result i32)
        i32.const 1
       else
        global.get $src/wasm/light.as/tblMush
        local.get $35
        i32.add
        i32.load8_u
       end
       select
       select
       i32.eqz
       if
        local.get $35
        global.get $src/wasm/light.as/pixelBlockId
        i32.eq
        local.get $33
        i32.const 0
        i32.lt_s
        i32.or
        if (result i32)
         i32.const 1
        else
         block $__inlined_func$src/wasm/light.as/lightIsOnAs$48 (result i32)
          i32.const 1
          local.get $33
          i32.const 0
          i32.lt_s
          br_if $__inlined_func$src/wasm/light.as/lightIsOnAs$48
          drop
          i32.const 1
          global.get $src/wasm/light.as/tblTogDelta
          local.get $33
          i32.const 1
          i32.shl
          i32.add
          i32.load16_u
          local.tee $34
          i32.eqz
          br_if $__inlined_func$src/wasm/light.as/lightIsOnAs$48
          drop
          local.get $32
          local.get $1
          global.get $src/wasm/light.as/tblTogAxis
          local.get $33
          i32.add
          i32.load8_u
          select
          local.get $34
          i32.const 1
          i32.shl
          i32.rem_s
          local.get $34
          i32.lt_s
         end
        end
        if
         local.get $35
         global.get $src/wasm/light.as/pixelBlockId
         i32.eq
         if
          f64.const 1
          local.get $1
          i32.const 8
          i32.shr_u
          f64.convert_i32_s
          f64.const 255
          f64.div
          f64.const 2.5
          f64.mul
          local.tee $11
          local.get $11
          f64.const 1
          f64.gt
          select
          local.set $11
          f64.const 1
          local.get $1
          i32.const 255
          i32.and
          f64.convert_i32_s
          f64.const 255
          f64.div
          f64.const 2.5
          f64.mul
          local.tee $12
          local.get $12
          f64.const 1
          f64.gt
          select
          local.set $12
          f64.const 1
          local.get $32
          f64.convert_i32_s
          f64.const 255
          f64.div
          f64.const 2.5
          f64.mul
          local.tee $13
          local.get $13
          f64.const 1
          f64.gt
          select
          local.set $13
         else
          local.get $33
          i32.const 4
          i32.eq
          if
           local.get $32
           f64.convert_i32_s
           f64.const 22
           f64.div
           f64.floor
           i32.trunc_sat_f64_s
           i32.const 24
           i32.rem_s
           local.tee $1
           i32.const 7
           i32.eq
           if (result f64)
            global.get $src/wasm/light.as/gDemon
            f64.const 0.5
            f64.mul
            f64.const 1
            global.get $src/wasm/light.as/gDemon
            f64.sub
            local.tee $12
            f64.add
            local.set $11
            global.get $src/wasm/light.as/gDemon
            local.get $12
            f64.const 0.5
            f64.mul
            f64.add
            local.set $13
            f64.const 0.3
           else
            local.get $1
            i32.const 14
            i32.eq
            if (result f64)
             global.get $src/wasm/light.as/gDr
             local.set $11
             global.get $src/wasm/light.as/gDb
             local.set $13
             global.get $src/wasm/light.as/gDg
            else
             local.get $1
             i32.const 23
             i32.eq
             if (result f64)
              block $__inlined_func$src/wasm/light.as/clamp01$52 (result f64)
               f64.const 0
               f64.const 270
               global.get $src/wasm/light.as/gOsc
               f64.sub
               f64.const 900
               f64.div
               f64.const 0.9
               f64.add
               local.tee $11
               f64.const 0
               f64.lt
               br_if $__inlined_func$src/wasm/light.as/clamp01$52
               drop
               f64.const 1
               local.get $11
               f64.const 1
               f64.gt
               br_if $__inlined_func$src/wasm/light.as/clamp01$52
               drop
               local.get $11
              end
              local.tee $12
              f64.const 0.9
              f64.mul
              local.set $11
              local.get $12
              f64.const 1.2
              f64.mul
              local.set $13
              f64.const 0.55
             else
              global.get $src/wasm/light.as/tblTorch
              local.get $1
              i32.const 24
              i32.mul
              i32.add
              f64.load
              local.set $11
              global.get $src/wasm/light.as/tblTorch
              local.get $1
              i32.const 3
              i32.mul
              local.tee $1
              i32.const 2
              i32.add
              i32.const 3
              i32.shl
              i32.add
              f64.load
              local.set $13
              global.get $src/wasm/light.as/tblTorch
              local.get $1
              i32.const 1
              i32.add
              i32.const 3
              i32.shl
              i32.add
              f64.load
             end
            end
           end
           local.set $12
          else
           global.get $src/wasm/light.as/tblMush
           local.get $35
           i32.add
           i32.load8_u
           if
            local.get $29
            local.get $38
            call $src/wasm/light.as/reseedLocal
            f64.const 0
            local.set $11
            f64.const 28
            f64.const 42
            call $src/wasm/light.as/rndNext
            f64.const 0.005
            f64.mul
            f64.const 270
            global.get $src/wasm/light.as/gOsc
            f64.sub
            f64.const 1e3
            f64.div
            f64.add
            f64.const 0.5
            f64.mul
            f64.const 0.2
            f64.add
            local.set $12
            f64.const 1
            local.set $13
           else
            local.get $35
            i32.const 2
            i32.shl
            local.tee $1
            global.get $src/wasm/light.as/tblLightR
            i32.add
            f32.load
            f64.promote_f32
            local.set $11
            global.get $src/wasm/light.as/tblLightG
            local.get $1
            i32.add
            f32.load
            f64.promote_f32
            local.set $12
            global.get $src/wasm/light.as/tblLightB
            local.get $1
            i32.add
            f32.load
            f64.promote_f32
            local.set $13
            global.get $src/wasm/light.as/tblFlicker
            local.get $35
            i32.add
            i32.load8_u
            if
             local.get $29
             local.get $38
             call $src/wasm/light.as/reseedLocal
             local.get $11
             f64.const 28
             f64.const 42
             call $src/wasm/light.as/rndNext
             f64.const 0.005
             f64.mul
             f64.const 270
             global.get $src/wasm/light.as/gOsc
             f64.sub
             f64.const 700
             f64.div
             f64.add
             local.tee $14
             f64.add
             local.set $11
             local.get $13
             local.get $14
             f64.add
             local.set $13
             local.get $12
             local.get $14
             f64.add
             local.set $12
            end
            local.get $33
            i32.const 140
            i32.eq
            local.get $33
            i32.const 22
            i32.eq
            i32.or
            local.get $33
            i32.const 204
            i32.eq
            i32.or
            local.get $33
            i32.const 347
            i32.eq
            i32.or
            if
             f64.const 0
             local.get $11
             global.get $src/wasm/light.as/paintBuf
             local.get $31
             i32.add
             i32.load8_u
             local.tee $1
             i32.const 27
             i32.eq
             local.get $1
             i32.const 26
             i32.eq
             i32.or
             select
             local.set $11
            else
             local.get $33
             i32.const 739
             i32.eq
             if (result i32)
              global.get $src/wasm/light.as/paintBuf
              local.get $31
              i32.add
              i32.load8_u
             else
              i32.const 0
             end
             if
              global.get $src/wasm/light.as/tblPaint
              global.get $src/wasm/light.as/paintBuf
              local.get $31
              i32.add
              i32.load8_u
              local.tee $1
              i32.const 24
              i32.mul
              i32.add
              f64.load
              f64.const 255
              f64.div
              local.set $11
              global.get $src/wasm/light.as/tblPaint
              local.get $1
              i32.const 3
              i32.mul
              local.tee $1
              i32.const 2
              i32.add
              i32.const 3
              i32.shl
              i32.add
              f64.load
              f64.const 255
              f64.div
              local.set $13
              global.get $src/wasm/light.as/tblPaint
              local.get $1
              i32.const 1
              i32.add
              i32.const 3
              i32.shl
              i32.add
              f64.load
              f64.const 255
              f64.div
              local.set $12
             end
            end
           end
          end
         end
         local.get $6
         local.set $14
         block $__inlined_func$src/wasm/light.as/maxJs$53
          local.get $6
          local.get $6
          f64.ne
          br_if $__inlined_func$src/wasm/light.as/maxJs$53
          local.get $11
          local.set $14
          local.get $11
          local.get $11
          f64.ne
          br_if $__inlined_func$src/wasm/light.as/maxJs$53
          local.get $6
          local.set $14
          local.get $6
          local.get $11
          f64.gt
          br_if $__inlined_func$src/wasm/light.as/maxJs$53
          local.get $11
          local.set $14
          local.get $6
          local.get $11
          f64.lt
          br_if $__inlined_func$src/wasm/light.as/maxJs$53
          local.get $11
          f64.const 0
          f64.eq
          local.get $6
          f64.const 0
          f64.eq
          i32.and
          if
           f64.const 0
           local.set $14
           f64.const 1
           local.get $6
           f64.div
           f64.const 0
           f64.gt
           if (result i32)
            i32.const 1
           else
            f64.const 1
            local.get $11
            f64.div
            f64.const 0
            f64.gt
           end
           br_if $__inlined_func$src/wasm/light.as/maxJs$53
           local.get $11
           local.set $14
          end
         end
         local.get $14
         local.set $6
         block $__inlined_func$src/wasm/light.as/maxJs$54
          local.get $7
          local.tee $11
          local.get $11
          f64.ne
          br_if $__inlined_func$src/wasm/light.as/maxJs$54
          local.get $12
          local.tee $11
          local.get $11
          f64.ne
          br_if $__inlined_func$src/wasm/light.as/maxJs$54
          local.get $11
          local.get $7
          local.tee $11
          f64.lt
          br_if $__inlined_func$src/wasm/light.as/maxJs$54
          local.get $11
          local.get $12
          local.tee $11
          f64.lt
          br_if $__inlined_func$src/wasm/light.as/maxJs$54
          local.get $11
          f64.const 0
          f64.eq
          local.get $7
          f64.const 0
          f64.eq
          i32.and
          if
           f64.const 0
           local.set $11
           f64.const 1
           local.get $7
           f64.div
           f64.const 0
           f64.gt
           if (result i32)
            i32.const 1
           else
            f64.const 1
            local.get $12
            f64.div
            f64.const 0
            f64.gt
           end
           br_if $__inlined_func$src/wasm/light.as/maxJs$54
           local.get $12
           local.set $11
          end
         end
         local.get $11
         local.set $7
         block $__inlined_func$src/wasm/light.as/maxJs$55
          local.get $10
          local.tee $11
          local.get $11
          f64.ne
          br_if $__inlined_func$src/wasm/light.as/maxJs$55
          local.get $13
          local.tee $11
          local.get $11
          f64.ne
          br_if $__inlined_func$src/wasm/light.as/maxJs$55
          local.get $11
          local.get $10
          local.tee $11
          f64.lt
          br_if $__inlined_func$src/wasm/light.as/maxJs$55
          local.get $11
          local.get $13
          local.tee $11
          f64.lt
          br_if $__inlined_func$src/wasm/light.as/maxJs$55
          local.get $11
          f64.const 0
          f64.eq
          local.get $10
          f64.const 0
          f64.eq
          i32.and
          if
           f64.const 0
           local.set $11
           f64.const 1
           local.get $10
           f64.div
           f64.const 0
           f64.gt
           if (result i32)
            i32.const 1
           else
            f64.const 1
            local.get $13
            f64.div
            f64.const 0
            f64.gt
           end
           br_if $__inlined_func$src/wasm/light.as/maxJs$55
           local.get $13
           local.set $11
          end
         end
         local.get $11
         local.set $10
        end
       end
       global.get $src/wasm/light.as/tblSpecial
       local.get $35
       i32.add
       i32.load8_u
       if (result i32)
        global.get $src/wasm/light.as/spListBuf
        global.get $src/wasm/light.as/spCount
        i32.const 2
        i32.shl
        i32.add
        local.get $41
        i32.store
        global.get $src/wasm/light.as/spCount
        i32.const 1
        i32.add
        global.set $src/wasm/light.as/spCount
        i32.const 1
       else
        i32.const 0
       end
      else
       i32.const 0
      end
      i32.eqz
      if
       local.get $40
       i32.const 4
       i32.eq
       local.get $39
       i32.const 0
       i32.ne
       i32.and
       if
        f64.const 270
        global.get $src/wasm/light.as/gOsc
        f64.sub
        local.tee $11
        f64.const 900
        f64.div
        f64.const 0.7
        f64.add
        local.tee $12
        f64.const 0.6
        f64.mul
        local.tee $13
        local.get $6
        local.get $6
        local.get $13
        f64.lt
        select
        local.set $6
        local.get $11
        f64.const 125
        f64.div
        f64.const 0.7
        f64.add
        f64.const 0.25
        f64.mul
        local.tee $11
        local.get $7
        local.get $7
        local.get $11
        f64.lt
        select
        local.set $7
        local.get $12
        f64.const 0.9
        f64.mul
        local.tee $11
        local.get $10
        local.get $10
        local.get $11
        f64.lt
        select
        local.set $10
       else
        local.get $40
        i32.const 2
        i32.eq
        local.get $39
        i32.const 0
        i32.ne
        i32.and
        if
         global.get $src/wasm/light.as/gLavaV
         f64.const 0.6
         f64.mul
         local.tee $11
         local.get $7
         local.get $7
         local.get $11
         f64.lt
         select
         local.set $7
         global.get $src/wasm/light.as/gLavaV
         f64.const 0.2
         f64.mul
         local.tee $11
         local.get $10
         local.get $10
         local.get $11
         f64.lt
         select
         local.set $10
         global.get $src/wasm/light.as/gLavaV
         local.get $6
         global.get $src/wasm/light.as/gLavaV
         local.get $6
         f64.gt
         select
         local.set $6
        end
       end
      end
      local.get $41
      i32.const 2
      i32.shl
      local.tee $1
      global.get $src/wasm/light.as/rBuf
      i32.add
      local.get $6
      f32.demote_f64
      f32.store
      global.get $src/wasm/light.as/gBuf
      local.get $1
      i32.add
      local.get $7
      f32.demote_f64
      f32.store
      global.get $src/wasm/light.as/bBuf
      local.get $1
      i32.add
      local.get $10
      f32.demote_f64
      f32.store
      local.get $0
      i32.const 1
      i32.add
      local.set $0
      br $for-loop|1
     end
    end
    local.get $27
    i32.const 1
    i32.add
    local.set $27
    br $for-loop|0
   end
  end
  global.get $src/wasm/light.as/spCount
 )
 (func $src/wasm/light.as/lightCoatBuf (result i32)
  global.get $src/wasm/light.as/coatBuf
 )
 (func $src/wasm/light.as/lightCaps (result i64)
  global.get $src/wasm/light.as/capCells
  i64.extend_i32_s
 )
 (func $src/wasm/light.as/lightBlur (param $0 i32) (param $1 i32) (param $2 i32) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 f64) (param $7 f64) (param $8 f64) (param $9 f64) (param $10 f64) (param $11 f64) (result i32)
  (local $12 f64)
  (local $13 f64)
  (local $14 f64)
  global.get $src/wasm/light.as/capCells
  i32.eqz
  if
   i32.const 0
   return
  end
  local.get $1
  i32.const 0
  i32.le_s
  local.get $0
  i32.const 0
  i32.le_s
  i32.or
  local.get $0
  i32.const 65536
  i32.gt_s
  i32.or
  local.get $1
  i32.const 65536
  i32.gt_s
  i32.or
  if
   i32.const 0
   return
  end
  global.get $src/wasm/light.as/capCells
  local.get $0
  local.get $1
  i32.mul
  i32.lt_s
  if
   i32.const 0
   return
  end
  local.get $2
  i32.const 0
  i32.lt_s
  local.get $2
  local.get $0
  local.get $1
  local.get $0
  local.get $1
  i32.lt_s
  select
  i32.const 1
  i32.shr_s
  i32.gt_s
  i32.or
  if
   i32.const 0
   return
  end
  local.get $0
  local.get $1
  local.get $2
  local.get $3
  local.get $4
  local.get $5
  local.get $6
  f64.const 0.98
  f64.mul
  local.tee $12
  local.get $6
  f64.const 0.99
  f64.mul
  local.tee $6
  local.get $7
  f64.const 0.98
  f64.mul
  local.tee $13
  local.get $7
  f64.const 0.99
  f64.mul
  local.tee $7
  local.get $8
  f64.const 0.98
  f64.mul
  local.tee $14
  local.get $8
  f64.const 0.99
  f64.mul
  local.tee $8
  local.get $9
  local.get $10
  local.get $11
  call $src/wasm/light.as/blurPass
  local.get $0
  local.get $1
  local.get $2
  local.get $3
  local.get $4
  local.get $5
  local.get $12
  local.get $6
  local.get $13
  local.get $7
  local.get $14
  local.get $8
  local.get $9
  local.get $10
  local.get $11
  call $src/wasm/light.as/blurPass
  i32.const 1
 )
 (func $src/wasm/light.as/lightBBuf (result i32)
  global.get $src/wasm/light.as/bBuf
 )
)
