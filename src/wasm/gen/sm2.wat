(module
 (type $0 (func (result i32)))
 (type $1 (func (param f64) (result f64)))
 (type $2 (func (param i32) (result i32)))
 (type $3 (func (param f64 f64) (result f64)))
 (type $4 (func (param i32 i32)))
 (type $5 (func (param i32 i32) (result i32)))
 (type $6 (func (param i32 f64 f64 i32 i32 i32 i32)))
 (type $7 (func (param i32 i32 f64 f64 f64 f64 i32 i32)))
 (type $8 (func (param i32 i32 i32 i32 i32)))
 (type $9 (func (param i32 i32 i64)))
 (type $10 (func (param i32 i32 i32 f64 f64 f64 i32 f64 f64 f64 f64) (result i32)))
 (type $11 (func (param i32 i32 f64 f64 i32 i32 i32)))
 (type $12 (func (param i32 i32 i32 i32) (result i32)))
 (type $13 (func (param i32 i32 i32 f64 f64 f64 f64) (result i32)))
 (type $14 (func (param i32 i32 i32) (result i32)))
 (type $15 (func (param i32)))
 (type $16 (func (result i64)))
 (type $17 (func (param f64 f64 f64) (result f64)))
 (type $18 (func (param i32 f64 f64) (result i32)))
 (import "Math" "pow" (func $src/wasm/sm2.as/mpow (param f64 f64) (result f64)))
 (import "Math" "log2" (func $src/wasm/sm2.as/mlog2 (param f64) (result f64)))
 (import "Math" "sin" (func $src/wasm/sm2.as/msin (param f64) (result f64)))
 (import "Math" "hypot" (func $src/wasm/sm2.as/mhypot (param f64 f64 f64) (result f64)))
 (import "Math" "cos" (func $src/wasm/sm2.as/mcos (param f64) (result f64)))
 (global $src/wasm/sm2.as/tokBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/constBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/outBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/rBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/vBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/oBase (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/sampOutBuf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilA (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilB (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilC (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/bilD (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/nanCell (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texW (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texH (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tokCap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/texCap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/outCap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/inited (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/progTable (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/curReadSet (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex1Buf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex2Buf (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex1Cap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex2Cap (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex1W (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex1H (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex2W (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex2H (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex1Set (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/tex2Set (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/runModes (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/runHasRect (mut i32) (i32.const 0))
 (global $src/wasm/sm2.as/runSX (mut f64) (f64.const 0))
 (global $src/wasm/sm2.as/runSY (mut f64) (f64.const 0))
 (global $src/wasm/sm2.as/runSheetW (mut f64) (f64.const 0))
 (global $src/wasm/sm2.as/runSheetH (mut f64) (f64.const 0))
 (global $~lib/rt/tlsf/ROOT (mut i32) (i32.const 0))
 (memory $0 0)
 (export "sm2Version" (func $src/wasm/sm2.as/sm2Version))
 (export "sm2Init" (func $src/wasm/sm2.as/sm2Init))
 (export "sm2TokenBuf" (func $src/wasm/sm2.as/sm2TokenBuf))
 (export "sm2ConstBuf" (func $src/wasm/sm2.as/sm2ConstBuf))
 (export "sm2TexBuf" (func $src/wasm/sm2.as/sm2TexBuf))
 (export "sm2OutBuf" (func $src/wasm/sm2.as/sm2OutBuf))
 (export "sm2Caps" (func $src/wasm/sm2.as/sm2Caps))
 (export "sm2UploadTex" (func $src/wasm/sm2.as/sm2UploadTex))
 (export "sm2Tex1Buf" (func $src/wasm/sm2.as/sm2Tex1Buf))
 (export "sm2Tex2Buf" (func $src/wasm/sm2.as/sm2Tex2Buf))
 (export "sm2ClearTex" (func $src/wasm/sm2.as/sm2ClearTex))
 (export "sm2UploadProgram" (func $src/wasm/sm2.as/sm2UploadProgram))
 (export "sm2RunImage2" (func $src/wasm/sm2.as/sm2RunImage2))
 (export "sm2RunImage" (func $src/wasm/sm2.as/sm2RunImage))
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
 (func $src/wasm/sm2.as/sampleBilinearBuf (param $0 i32) (param $1 f64) (param $2 f64) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32)
  (local $7 i32)
  (local $8 f64)
  (local $9 f64)
  (local $10 f64)
  (local $11 f64)
  (local $12 f64)
  local.get $1
  local.get $3
  f64.convert_i32_s
  local.tee $9
  f64.mul
  f64.const -0.5
  f64.add
  local.tee $8
  f64.floor
  local.set $10
  local.get $2
  local.get $4
  f64.convert_i32_s
  local.tee $1
  f64.mul
  f64.const -0.5
  f64.add
  local.tee $11
  f64.floor
  local.set $2
  local.get $8
  local.get $10
  f64.sub
  local.set $12
  local.get $11
  local.get $2
  f64.sub
  local.set $11
  local.get $0
  local.get $5
  local.get $10
  local.get $2
  local.get $9
  local.get $1
  local.get $3
  global.get $src/wasm/sm2.as/bilA
  call $src/wasm/sm2.as/bilCorner
  local.get $0
  local.get $5
  local.get $10
  f64.const 1
  f64.add
  local.tee $8
  local.get $2
  local.get $9
  local.get $1
  local.get $3
  global.get $src/wasm/sm2.as/bilB
  call $src/wasm/sm2.as/bilCorner
  local.get $0
  local.get $5
  local.get $10
  local.get $2
  f64.const 1
  f64.add
  local.tee $2
  local.get $9
  local.get $1
  local.get $3
  global.get $src/wasm/sm2.as/bilC
  call $src/wasm/sm2.as/bilCorner
  local.get $0
  local.get $5
  local.get $8
  local.get $2
  local.get $9
  local.get $1
  local.get $3
  global.get $src/wasm/sm2.as/bilD
  call $src/wasm/sm2.as/bilCorner
  loop $for-loop|0
   local.get $7
   i32.const 4
   i32.lt_s
   if
    local.get $7
    i32.const 3
    i32.shl
    local.tee $0
    global.get $src/wasm/sm2.as/bilA
    i32.add
    f64.load
    local.tee $1
    global.get $src/wasm/sm2.as/bilB
    local.get $0
    i32.add
    f64.load
    local.get $1
    f64.sub
    local.get $12
    f64.mul
    f64.add
    local.set $1
    local.get $0
    local.get $6
    i32.add
    local.get $1
    global.get $src/wasm/sm2.as/bilC
    local.get $0
    i32.add
    f64.load
    local.tee $2
    global.get $src/wasm/sm2.as/bilD
    local.get $0
    i32.add
    f64.load
    local.get $2
    f64.sub
    local.get $12
    f64.mul
    f64.add
    local.get $1
    f64.sub
    local.get $11
    f64.mul
    f64.add
    f64.store
    local.get $7
    i32.const 1
    i32.add
    local.set $7
    br $for-loop|0
   end
  end
 )
 (func $src/wasm/sm2.as/bilCorner (param $0 i32) (param $1 i32) (param $2 f64) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 i32) (param $7 i32)
  local.get $1
  if (result f64)
   local.get $2
   local.get $4
   call $~lib/math/NativeMath.mod
   local.get $4
   f64.add
   local.get $4
   call $~lib/math/NativeMath.mod
   local.set $4
   local.get $3
   local.get $5
   call $~lib/math/NativeMath.mod
   local.get $5
   f64.add
   local.get $5
   call $~lib/math/NativeMath.mod
  else
   f64.const 0
   local.get $4
   f64.const -1
   f64.add
   local.get $2
   local.get $2
   local.get $4
   f64.ge
   select
   local.get $2
   f64.const 0
   f64.lt
   select
   local.set $4
   f64.const 0
   local.get $5
   f64.const -1
   f64.add
   local.get $3
   local.get $3
   local.get $5
   f64.ge
   select
   local.get $3
   f64.const 0
   f64.lt
   select
  end
  local.set $2
  local.get $7
  local.get $0
  block $__inlined_func$src/wasm/sm2.as/truncI32$63 (result i32)
   i32.const 0
   local.get $4
   local.get $4
   f64.ne
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$63
   drop
   i32.const 2147483647
   local.get $4
   f64.const 2147483647
   f64.ge
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$63
   drop
   i32.const -2147483648
   local.get $4
   f64.const -2147483648
   f64.le
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$63
   drop
   local.get $4
   i32.trunc_sat_f64_s
  end
  block $__inlined_func$src/wasm/sm2.as/truncI32$62 (result i32)
   i32.const 0
   local.get $2
   local.get $2
   f64.ne
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$62
   drop
   i32.const 2147483647
   local.get $2
   f64.const 2147483647
   f64.ge
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$62
   drop
   i32.const -2147483648
   local.get $2
   f64.const -2147483648
   f64.le
   br_if $__inlined_func$src/wasm/sm2.as/truncI32$62
   drop
   local.get $2
   i32.trunc_sat_f64_s
  end
  local.get $6
  i32.mul
  i32.add
  i32.const 2
  i32.shl
  i32.add
  local.tee $0
  i32.load8_u
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store
  local.get $7
  local.get $0
  i32.load8_u offset=1
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store offset=8
  local.get $7
  local.get $0
  i32.load8_u offset=2
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store offset=16
  local.get $7
  local.get $0
  i32.load8_u offset=3
  f64.convert_i32_u
  f64.const 255
  f64.div
  f64.store offset=24
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
 (func $src/wasm/sm2.as/decodeSrc (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  local.get $4
  i32.const 16
  i32.shr_u
  i32.const 3
  i32.and
  local.get $4
  i32.const 18
  i32.shr_u
  i32.const 3
  i32.and
  i32.const 2
  i32.shl
  i32.or
  local.get $4
  i32.const 20
  i32.shr_u
  i32.const 3
  i32.and
  i32.const 4
  i32.shl
  i32.or
  local.get $4
  i32.const 22
  i32.shr_u
  i32.const 3
  i32.and
  i32.const 6
  i32.shl
  i32.or
  local.set $5
  local.get $0
  local.get $1
  i32.add
  block $__inlined_func$src/wasm/sm2.as/bindPtrDec$43 (result i32)
   local.get $4
   i32.const 2047
   i32.and
   local.tee $1
   i32.const 5
   i32.shl
   local.tee $6
   global.get $src/wasm/sm2.as/constBuf
   i32.add
   global.get $src/wasm/sm2.as/nanCell
   local.get $1
   i32.const 64
   i32.lt_u
   select
   local.get $4
   i32.const 28
   i32.shr_u
   i32.const 7
   i32.and
   local.get $4
   i32.const 8
   i32.shr_u
   i32.const 24
   i32.and
   i32.or
   local.tee $7
   i32.const 2
   i32.eq
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   local.get $7
   i32.eqz
   if
    local.get $1
    i32.const 32
    i32.lt_u
    if
     global.get $src/wasm/sm2.as/curReadSet
     i32.const 1
     local.get $1
     i32.shl
     i32.or
     global.set $src/wasm/sm2.as/curReadSet
     global.get $src/wasm/sm2.as/rBase
     local.get $6
     i32.add
     br $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
    end
    global.get $src/wasm/sm2.as/nanCell
    br $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   end
   local.get $1
   i32.const 5
   i32.shl
   local.tee $6
   global.get $src/wasm/sm2.as/vBase
   i32.add
   global.get $src/wasm/sm2.as/nanCell
   local.get $1
   i32.const 2
   i32.lt_u
   select
   local.get $7
   i32.const 1
   i32.eq
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   global.get $src/wasm/sm2.as/tBase
   local.get $6
   i32.add
   global.get $src/wasm/sm2.as/nanCell
   local.get $1
   i32.const 8
   i32.lt_u
   select
   local.get $7
   i32.const 3
   i32.eq
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   global.get $src/wasm/sm2.as/oBase
   local.get $7
   i32.const 8
   i32.eq
   local.get $7
   i32.const 7
   i32.eq
   i32.or
   br_if $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   drop
   local.get $1
   i32.const 32
   i32.lt_u
   if
    global.get $src/wasm/sm2.as/curReadSet
    i32.const 1
    local.get $1
    i32.shl
    i32.or
    global.set $src/wasm/sm2.as/curReadSet
    global.get $src/wasm/sm2.as/rBase
    local.get $6
    i32.add
    br $__inlined_func$src/wasm/sm2.as/bindPtrDec$43
   end
   global.get $src/wasm/sm2.as/nanCell
  end
  i32.store
  local.get $0
  local.get $2
  i32.add
  local.get $5
  i32.store
  local.get $4
  i32.const 24
  i32.shr_u
  i32.const 15
  i32.and
  i32.const 1
  i32.eq
  if
   local.get $0
   i32.const -64
   i32.sub
   local.tee $0
   local.get $0
   i32.load
   i32.const 1
   local.get $3
   i32.shl
   i32.or
   i32.store
  end
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
 (func $src/wasm/sm2.as/sm2RunImage2 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 i32) (param $7 f64) (param $8 f64) (param $9 f64) (param $10 f64) (result i32)
  (local $11 i32)
  (local $12 i64)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  block $folding-inner0
   global.get $src/wasm/sm2.as/inited
   i32.eqz
   br_if $folding-inner0
   local.get $0
   i32.eqz
   local.get $0
   i32.const 256
   i32.gt_u
   i32.or
   br_if $folding-inner0
   global.get $src/wasm/sm2.as/progTable
   local.get $0
   i32.const 1
   i32.sub
   i32.const 3
   i32.shl
   i32.add
   i32.load
   local.tee $11
   i32.eqz
   br_if $folding-inner0
   local.get $2
   i32.const 0
   i32.le_s
   local.get $1
   i32.const 0
   i32.le_s
   i32.or
   br_if $folding-inner0
   local.get $1
   i64.extend_i32_s
   local.get $2
   i64.extend_i32_s
   i64.mul
   i64.const 2
   i64.shl
   local.tee $12
   global.get $src/wasm/sm2.as/texCap
   i64.extend_i32_s
   i64.gt_u
   br_if $folding-inner0
   global.get $src/wasm/sm2.as/outCap
   i64.extend_i32_s
   local.get $12
   i64.lt_u
   br_if $folding-inner0
   local.get $1
   global.set $src/wasm/sm2.as/texW
   local.get $2
   global.set $src/wasm/sm2.as/texH
   local.get $6
   global.set $src/wasm/sm2.as/runModes
   local.get $9
   f64.const 0
   f64.gt
   global.set $src/wasm/sm2.as/runHasRect
   local.get $7
   global.set $src/wasm/sm2.as/runSX
   local.get $8
   global.set $src/wasm/sm2.as/runSY
   local.get $9
   global.set $src/wasm/sm2.as/runSheetW
   local.get $10
   global.set $src/wasm/sm2.as/runSheetH
   global.get $src/wasm/sm2.as/vBase
   i32.const 0
   i32.const 64
   memory.fill
   global.get $src/wasm/sm2.as/vBase
   f64.const 0
   f64.const 1
   local.get $3
   local.get $3
   f64.const 1
   f64.gt
   select
   local.get $3
   f64.const 0
   f64.lt
   select
   f64.store
   global.get $src/wasm/sm2.as/vBase
   f64.const 0
   f64.const 1
   local.get $4
   local.get $4
   f64.const 1
   f64.gt
   select
   local.get $4
   f64.const 0
   f64.lt
   select
   f64.store offset=8
   global.get $src/wasm/sm2.as/vBase
   f64.const 0
   f64.const 1
   local.get $5
   local.get $5
   f64.const 1
   f64.gt
   select
   local.get $5
   f64.const 0
   f64.lt
   select
   f64.store offset=16
   global.get $src/wasm/sm2.as/vBase
   f64.const 1
   f64.store offset=24
   global.get $src/wasm/sm2.as/tBase
   i32.const 0
   i32.const 256
   memory.fill
   local.get $1
   f64.convert_i32_s
   local.set $3
   local.get $2
   f64.convert_i32_s
   local.set $4
   i32.const 0
   local.set $6
   loop $for-loop|0
    local.get $2
    local.get $6
    i32.gt_s
    if
     i32.const 0
     local.set $0
     loop $for-loop|1
      local.get $0
      local.get $1
      i32.lt_s
      if
       local.get $1
       local.get $6
       i32.mul
       local.get $0
       i32.add
       i32.const 2
       i32.shl
       local.set $13
       local.get $11
       global.get $src/wasm/sm2.as/runHasRect
       if (result f64)
        global.get $src/wasm/sm2.as/runSX
        local.get $0
        f64.convert_i32_s
        f64.add
        f64.const 0.5
        f64.add
        global.get $src/wasm/sm2.as/runSheetW
        f64.div
       else
        local.get $0
        f64.convert_i32_s
        f64.const 0.5
        f64.add
        local.get $3
        f64.div
       end
       global.get $src/wasm/sm2.as/runHasRect
       if (result f64)
        global.get $src/wasm/sm2.as/runSY
        local.get $6
        f64.convert_i32_s
        f64.add
        f64.const 0.5
        f64.add
        global.get $src/wasm/sm2.as/runSheetH
        f64.div
       else
        local.get $6
        f64.convert_i32_s
        f64.const 0.5
        f64.add
        local.get $4
        f64.div
       end
       call $src/wasm/sm2.as/execPixel
       if
        global.get $src/wasm/sm2.as/outBuf
        local.get $13
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$178 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load
         local.tee $5
         local.get $5
         f64.const 1
         f64.gt
         select
         local.get $5
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $5
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$178
         drop
         i32.const 255
         local.get $5
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$178
         drop
         local.get $5
         local.get $5
         f64.floor
         local.tee $5
         f64.sub
         local.set $7
         local.get $5
         i32.trunc_sat_f64_u
         local.tee $14
         local.get $7
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$178
         drop
         local.get $14
         i32.const 1
         i32.add
         local.tee $15
         local.get $7
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$178
         drop
         local.get $15
         local.get $14
         local.get $14
         i32.const 1
         i32.and
         select
        end
        i32.store8
        global.get $src/wasm/sm2.as/outBuf
        local.get $13
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$180 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load offset=8
         local.tee $5
         local.get $5
         f64.const 1
         f64.gt
         select
         local.get $5
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $5
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$180
         drop
         i32.const 255
         local.get $5
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$180
         drop
         local.get $5
         local.get $5
         f64.floor
         local.tee $5
         f64.sub
         local.set $7
         local.get $5
         i32.trunc_sat_f64_u
         local.tee $14
         local.get $7
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$180
         drop
         local.get $14
         i32.const 1
         i32.add
         local.tee $15
         local.get $7
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$180
         drop
         local.get $15
         local.get $14
         local.get $14
         i32.const 1
         i32.and
         select
        end
        i32.store8 offset=1
        global.get $src/wasm/sm2.as/outBuf
        local.get $13
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$182 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load offset=16
         local.tee $5
         local.get $5
         f64.const 1
         f64.gt
         select
         local.get $5
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $5
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$182
         drop
         i32.const 255
         local.get $5
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$182
         drop
         local.get $5
         local.get $5
         f64.floor
         local.tee $5
         f64.sub
         local.set $7
         local.get $5
         i32.trunc_sat_f64_u
         local.tee $14
         local.get $7
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$182
         drop
         local.get $14
         i32.const 1
         i32.add
         local.tee $15
         local.get $7
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$182
         drop
         local.get $15
         local.get $14
         local.get $14
         i32.const 1
         i32.and
         select
        end
        i32.store8 offset=2
        global.get $src/wasm/sm2.as/outBuf
        local.get $13
        i32.add
        block $__inlined_func$src/wasm/sm2.as/toU8$184 (result i32)
         i32.const 0
         f64.const 0
         f64.const 1
         global.get $src/wasm/sm2.as/oBase
         f64.load offset=24
         local.tee $5
         local.get $5
         f64.const 1
         f64.gt
         select
         local.get $5
         f64.const 0
         f64.lt
         select
         f64.const 255
         f64.mul
         local.tee $5
         f64.const 0
         f64.gt
         i32.eqz
         br_if $__inlined_func$src/wasm/sm2.as/toU8$184
         drop
         i32.const 255
         local.get $5
         f64.const 255
         f64.ge
         br_if $__inlined_func$src/wasm/sm2.as/toU8$184
         drop
         local.get $5
         local.get $5
         f64.floor
         local.tee $5
         f64.sub
         local.set $7
         local.get $5
         i32.trunc_sat_f64_u
         local.tee $13
         local.get $7
         f64.const 0.5
         f64.lt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$184
         drop
         local.get $13
         i32.const 1
         i32.add
         local.tee $14
         local.get $7
         f64.const 0.5
         f64.gt
         br_if $__inlined_func$src/wasm/sm2.as/toU8$184
         drop
         local.get $14
         local.get $13
         local.get $13
         i32.const 1
         i32.and
         select
        end
        i32.store8 offset=3
       else
        global.get $src/wasm/sm2.as/outBuf
        local.get $13
        i32.add
        local.tee $13
        i32.const 0
        i32.store8
        local.get $13
        i32.const 0
        i32.store8 offset=1
        local.get $13
        i32.const 0
        i32.store8 offset=2
        local.get $13
        i32.const 0
        i32.store8 offset=3
       end
       local.get $0
       i32.const 1
       i32.add
       local.set $0
       br $for-loop|1
      end
     end
     local.get $6
     i32.const 1
     i32.add
     local.set $6
     br $for-loop|0
    end
   end
   i32.const 1
   return
  end
  i32.const 0
 )
 (func $src/wasm/sm2.as/sampleSlotN (param $0 i32) (param $1 i32) (param $2 f64) (param $3 f64) (param $4 i32) (param $5 i32) (param $6 i32)
  (local $7 f64)
  (local $8 i32)
  local.get $0
  i32.const 1
  i32.eq
  if (result i32)
   global.get $src/wasm/sm2.as/runModes
   i32.const 2
   i32.shr_u
   i32.const 3
   i32.and
  else
   global.get $src/wasm/sm2.as/runModes
   i32.const 4
   i32.shr_u
   i32.const 3
   i32.and
  end
  local.tee $0
  i32.const 2
  i32.eq
  if
   local.get $5
   f64.convert_i32_s
   local.set $7
   local.get $3
   local.get $3
   f64.floor
   f64.sub
   local.set $3
   block $__inlined_func$src/wasm/sm2.as/truncI32$65 (result i32)
    i32.const 0
    local.get $2
    local.get $2
    f64.floor
    f64.sub
    local.get $4
    f64.convert_i32_s
    f64.mul
    local.tee $2
    local.get $2
    f64.ne
    br_if $__inlined_func$src/wasm/sm2.as/truncI32$65
    drop
    i32.const 2147483647
    local.get $2
    f64.const 2147483647
    f64.ge
    br_if $__inlined_func$src/wasm/sm2.as/truncI32$65
    drop
    i32.const -2147483648
    local.get $2
    f64.const -2147483648
    f64.le
    br_if $__inlined_func$src/wasm/sm2.as/truncI32$65
    drop
    local.get $2
    i32.trunc_sat_f64_s
   end
   local.set $0
   block $__inlined_func$src/wasm/sm2.as/truncI32$66 (result i32)
    i32.const 0
    local.get $3
    local.get $7
    f64.mul
    local.tee $2
    local.get $2
    f64.ne
    br_if $__inlined_func$src/wasm/sm2.as/truncI32$66
    drop
    i32.const 2147483647
    local.get $2
    f64.const 2147483647
    f64.ge
    br_if $__inlined_func$src/wasm/sm2.as/truncI32$66
    drop
    i32.const -2147483648
    local.get $2
    f64.const -2147483648
    f64.le
    br_if $__inlined_func$src/wasm/sm2.as/truncI32$66
    drop
    local.get $2
    i32.trunc_sat_f64_s
   end
   local.set $8
   local.get $5
   i32.const 1
   i32.sub
   local.set $5
   local.get $6
   local.get $1
   local.get $4
   i32.const 1
   i32.sub
   local.tee $1
   local.get $0
   i32.lt_s
   if (result i32)
    local.get $1
   else
    local.get $0
   end
   local.get $5
   local.get $8
   local.get $5
   local.get $8
   i32.lt_s
   select
   local.get $4
   i32.mul
   i32.add
   i32.const 2
   i32.shl
   i32.add
   local.tee $0
   i32.load8_u
   f64.convert_i32_u
   f64.const 255
   f64.div
   f64.store
   local.get $6
   local.get $0
   i32.load8_u offset=1
   f64.convert_i32_u
   f64.const 255
   f64.div
   f64.store offset=8
   local.get $6
   local.get $0
   i32.load8_u offset=2
   f64.convert_i32_u
   f64.const 255
   f64.div
   f64.store offset=16
   local.get $6
   local.get $0
   i32.load8_u offset=3
   f64.convert_i32_u
   f64.const 255
   f64.div
   f64.store offset=24
   return
  end
  local.get $0
  i32.const 1
  i32.eq
  if
   local.get $1
   local.get $2
   local.get $2
   f64.floor
   f64.sub
   local.get $3
   local.get $3
   f64.floor
   f64.sub
   local.get $4
   local.get $5
   i32.const 0
   local.get $6
   call $src/wasm/sm2.as/sampleBilinearBuf
   return
  end
  local.get $0
  i32.const 3
  i32.eq
  if
   local.get $1
   local.get $2
   local.get $3
   local.get $4
   local.get $5
   i32.const 1
   local.get $6
   call $src/wasm/sm2.as/sampleBilinearBuf
   return
  end
  local.get $1
  local.get $2
  local.get $3
  local.get $4
  local.get $5
  i32.const 0
  local.get $6
  call $src/wasm/sm2.as/sampleBilinearBuf
 )
 (func $src/wasm/sm2.as/opNops (param $0 i32) (result i32)
  local.get $0
  i32.eqz
  if
   i32.const 0
   return
  end
  local.get $0
  i32.const 6
  i32.eq
  local.get $0
  i32.const 1
  i32.eq
  i32.or
  local.get $0
  i32.const 7
  i32.eq
  i32.or
  local.get $0
  i32.const 14
  i32.eq
  i32.or
  local.get $0
  i32.const 15
  i32.eq
  i32.or
  local.get $0
  i32.const 19
  i32.eq
  i32.or
  local.get $0
  i32.const 35
  i32.eq
  i32.or
  local.get $0
  i32.const 36
  i32.eq
  i32.or
  if
   i32.const 2
   return
  end
  local.get $0
  i32.const 3
  i32.eq
  local.get $0
  i32.const 2
  i32.eq
  i32.or
  local.get $0
  i32.const 5
  i32.eq
  i32.or
  local.get $0
  i32.const 8
  i32.eq
  i32.or
  local.get $0
  i32.const 9
  i32.eq
  i32.or
  local.get $0
  i32.const 10
  i32.eq
  i32.or
  local.get $0
  i32.const 11
  i32.eq
  i32.or
  local.get $0
  i32.const 12
  i32.eq
  i32.or
  local.get $0
  i32.const 13
  i32.eq
  i32.or
  local.get $0
  i32.const 32
  i32.eq
  i32.or
  local.get $0
  i32.const 33
  i32.eq
  i32.or
  if
   i32.const 3
   return
  end
  local.get $0
  i32.const 18
  i32.eq
  local.get $0
  i32.const 4
  i32.eq
  i32.or
  local.get $0
  i32.const 37
  i32.eq
  i32.or
  local.get $0
  i32.const 88
  i32.eq
  i32.or
  local.get $0
  i32.const 90
  i32.eq
  i32.or
  if
   i32.const 4
   return
  end
  local.get $0
  i32.const 31
  i32.eq
  if
   i32.const 2
   return
  end
  local.get $0
  i32.const 65
  i32.eq
  if
   i32.const 1
   return
  end
  local.get $0
  i32.const 66
  i32.eq
  if
   i32.const 3
   return
  end
  local.get $0
  i32.const 81
  i32.eq
  if
   i32.const 5
   return
  end
  i32.const -1
 )
 (func $src/wasm/sm2.as/sm2Version (result i32)
  i32.const 2
 )
 (func $src/wasm/sm2.as/sm2UploadTex (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (result i32)
  global.get $src/wasm/sm2.as/inited
  i32.eqz
  if
   i32.const 0
   return
  end
  local.get $2
  i32.const 0
  i32.le_s
  local.get $1
  i32.const 0
  i32.le_s
  i32.or
  local.get $3
  i32.const 0
  i32.le_s
  i32.or
  if
   i32.const 0
   return
  end
  local.get $0
  i32.const 1
  i32.eq
  if
   local.get $1
   global.get $src/wasm/sm2.as/tex1Cap
   i32.gt_s
   if
    local.get $1
    call $~lib/memory/heap.alloc
    local.tee $0
    i32.eqz
    if
     i32.const 0
     return
    end
    local.get $0
    global.set $src/wasm/sm2.as/tex1Buf
    local.get $1
    global.set $src/wasm/sm2.as/tex1Cap
   end
   local.get $2
   global.set $src/wasm/sm2.as/tex1W
   local.get $3
   global.set $src/wasm/sm2.as/tex1H
   i32.const 1
   global.set $src/wasm/sm2.as/tex1Set
   global.get $src/wasm/sm2.as/tex1Buf
   return
  end
  local.get $0
  i32.const 2
  i32.eq
  if
   local.get $1
   global.get $src/wasm/sm2.as/tex2Cap
   i32.gt_s
   if
    local.get $1
    call $~lib/memory/heap.alloc
    local.tee $0
    i32.eqz
    if
     i32.const 0
     return
    end
    local.get $0
    global.set $src/wasm/sm2.as/tex2Buf
    local.get $1
    global.set $src/wasm/sm2.as/tex2Cap
   end
   local.get $2
   global.set $src/wasm/sm2.as/tex2W
   local.get $3
   global.set $src/wasm/sm2.as/tex2H
   i32.const 1
   global.set $src/wasm/sm2.as/tex2Set
   global.get $src/wasm/sm2.as/tex2Buf
   return
  end
  i32.const 0
 )
 (func $src/wasm/sm2.as/sm2UploadProgram (param $0 i32) (param $1 i32) (result i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  global.get $src/wasm/sm2.as/inited
  i32.eqz
  if
   i32.const 0
   return
  end
  local.get $0
  i32.const 0
  i32.le_s
  local.get $0
  global.get $src/wasm/sm2.as/tokCap
  i32.gt_s
  i32.or
  if
   i32.const 0
   return
  end
  loop $while-continue|0
   local.get $0
   local.get $2
   i32.gt_s
   if
    block $while-break|0
     global.get $src/wasm/sm2.as/tokBuf
     local.set $5
     local.get $0
     local.get $2
     i32.le_s
     if (result i32)
      i32.const 0
     else
      local.get $5
      local.get $2
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     i32.const 65535
     i32.and
     local.tee $5
     i32.const 65535
     i32.eq
     br_if $while-break|0
     local.get $5
     call $src/wasm/sm2.as/opNops
     local.tee $6
     i32.const 0
     i32.lt_s
     br_if $while-break|0
     local.get $6
     local.get $2
     i32.const 1
     i32.add
     i32.add
     local.set $2
     local.get $5
     i32.const 31
     i32.eq
     br_if $while-continue|0
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $while-continue|0
    end
   end
  end
  local.get $3
  i32.const 96
  i32.mul
  local.tee $2
  i32.const 48
  i32.add
  local.get $3
  i32.const 5
  i32.shl
  i32.add
  call $~lib/memory/heap.alloc
  local.set $10
  local.get $2
  local.get $10
  i32.const 48
  i32.add
  local.tee $2
  i32.add
  local.set $11
  i32.const 0
  global.set $src/wasm/sm2.as/curReadSet
  local.get $10
  local.get $3
  i32.store
  local.get $10
  local.get $1
  i32.store offset=4
  local.get $2
  local.set $1
  i32.const 0
  local.set $2
  loop $while-continue|1
   local.get $0
   local.get $2
   i32.gt_s
   if
    block $while-break|1
     global.get $src/wasm/sm2.as/tokBuf
     local.set $3
     local.get $0
     local.get $2
     i32.le_s
     if (result i32)
      i32.const 0
     else
      local.get $3
      local.get $2
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     i32.const 65535
     i32.and
     local.tee $12
     i32.const 65535
     i32.eq
     br_if $while-break|1
     local.get $12
     call $src/wasm/sm2.as/opNops
     local.tee $13
     i32.const 0
     i32.lt_s
     br_if $while-break|1
     global.get $src/wasm/sm2.as/tokBuf
     local.set $3
     local.get $0
     local.get $2
     i32.const 1
     i32.add
     local.tee $2
     i32.le_s
     if (result i32)
      i32.const 0
     else
      local.get $3
      local.get $2
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $3
     global.get $src/wasm/sm2.as/tokBuf
     local.set $5
     local.get $2
     i32.const 1
     i32.add
     local.tee $6
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $5
      local.get $6
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $5
     global.get $src/wasm/sm2.as/tokBuf
     local.set $6
     local.get $2
     i32.const 2
     i32.add
     local.tee $7
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $6
      local.get $7
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $6
     global.get $src/wasm/sm2.as/tokBuf
     local.set $7
     local.get $2
     i32.const 3
     i32.add
     local.tee $8
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $7
      local.get $8
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $7
     global.get $src/wasm/sm2.as/tokBuf
     local.set $8
     local.get $2
     i32.const 4
     i32.add
     local.tee $9
     local.get $0
     i32.ge_s
     if (result i32)
      i32.const 0
     else
      local.get $8
      local.get $9
      i32.const 2
      i32.shl
      i32.add
      i32.load
     end
     local.set $8
     local.get $2
     local.get $13
     i32.add
     local.set $2
     local.get $12
     i32.const 31
     i32.eq
     br_if $while-continue|1
     local.get $12
     i32.const 81
     i32.eq
     if
      local.get $1
      i32.const 1
      i32.store
      local.get $1
      i32.const 15
      i32.store offset=4
      local.get $3
      i32.const 2047
      i32.and
      local.set $9
      local.get $1
      block $__inlined_func$src/wasm/sm2.as/bindDstDec$53 (result i32)
       global.get $src/wasm/sm2.as/oBase
       local.get $3
       i32.const 28
       i32.shr_u
       i32.const 7
       i32.and
       local.get $3
       i32.const 8
       i32.shr_u
       i32.const 24
       i32.and
       i32.or
       local.tee $3
       i32.const 8
       i32.eq
       local.get $3
       i32.const 7
       i32.eq
       i32.or
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$53
       drop
       local.get $9
       i32.const 5
       i32.shl
       local.tee $12
       global.get $src/wasm/sm2.as/constBuf
       i32.add
       i32.const 0
       local.get $9
       i32.const 64
       i32.lt_u
       select
       local.get $3
       i32.const 2
       i32.eq
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$53
       drop
       global.get $src/wasm/sm2.as/rBase
       local.get $12
       i32.add
       i32.const 0
       local.get $9
       i32.const 32
       i32.lt_u
       select
      end
      i32.store offset=8
      local.get $11
      local.get $4
      i32.const 5
      i32.shl
      i32.add
      local.tee $3
      local.get $5
      f32.reinterpret_i32
      f64.promote_f32
      f64.store
      local.get $3
      local.get $6
      f32.reinterpret_i32
      f64.promote_f32
      f64.store offset=8
      local.get $3
      local.get $7
      f32.reinterpret_i32
      f64.promote_f32
      f64.store offset=16
      local.get $3
      local.get $8
      f32.reinterpret_i32
      f64.promote_f32
      f64.store offset=24
      local.get $1
      local.get $3
      i32.store offset=16
      local.get $1
      i32.const 228
      i32.store offset=24
      local.get $1
      global.get $src/wasm/sm2.as/nanCell
      i32.store offset=32
      local.get $1
      i32.const 0
      i32.store offset=40
      local.get $1
      global.get $src/wasm/sm2.as/nanCell
      i32.store offset=48
      local.get $1
      i32.const 0
      i32.store offset=56
      local.get $1
      i32.const -64
      i32.sub
      i32.const 0
      i32.store
      local.get $1
      i32.const 255
      i32.store offset=68
     else
      local.get $3
      i32.const 16
      i32.shr_u
      i32.const 15
      i32.and
      local.set $14
      local.get $3
      i32.const 2047
      i32.and
      local.set $8
      local.get $1
      i32.const 0
      local.get $12
      block $__inlined_func$src/wasm/sm2.as/bindDstDec$60 (result i32)
       global.get $src/wasm/sm2.as/oBase
       local.get $3
       i32.const 28
       i32.shr_u
       i32.const 7
       i32.and
       local.get $3
       i32.const 8
       i32.shr_u
       i32.const 24
       i32.and
       i32.or
       local.tee $9
       i32.const 8
       i32.eq
       local.get $9
       i32.const 7
       i32.eq
       i32.or
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$60
       drop
       local.get $8
       i32.const 5
       i32.shl
       local.tee $15
       global.get $src/wasm/sm2.as/constBuf
       i32.add
       i32.const 0
       local.get $8
       i32.const 64
       i32.lt_u
       select
       local.get $9
       i32.const 2
       i32.eq
       br_if $__inlined_func$src/wasm/sm2.as/bindDstDec$60
       drop
       global.get $src/wasm/sm2.as/rBase
       local.get $15
       i32.add
       i32.const 0
       local.get $8
       i32.const 32
       i32.lt_u
       select
      end
      local.tee $8
      i32.eqz
      local.get $14
      i32.eqz
      i32.or
      select
      i32.store
      local.get $1
      local.get $14
      i32.const 16
      i32.const 0
      local.get $3
      i32.const 20
      i32.shr_u
      i32.const 15
      i32.and
      i32.const 1
      i32.eq
      select
      i32.or
      i32.store offset=4
      local.get $1
      local.get $8
      i32.store offset=8
      local.get $1
      i32.const -64
      i32.sub
      i32.const 0
      i32.store
      local.get $1
      i32.const 16
      i32.const 24
      i32.const 0
      local.get $5
      call $src/wasm/sm2.as/decodeSrc
      local.get $13
      i32.const 3
      i32.ge_s
      if
       local.get $1
       i32.const 32
       i32.const 40
       i32.const 1
       local.get $6
       call $src/wasm/sm2.as/decodeSrc
      else
       local.get $1
       global.get $src/wasm/sm2.as/nanCell
       i32.store offset=32
       local.get $1
       i32.const 0
       i32.store offset=40
      end
      local.get $13
      i32.const 4
      i32.ge_s
      if
       local.get $1
       i32.const 48
       i32.const 56
       i32.const 2
       local.get $7
       call $src/wasm/sm2.as/decodeSrc
      else
       local.get $1
       global.get $src/wasm/sm2.as/nanCell
       i32.store offset=48
       local.get $1
       i32.const 0
       i32.store offset=56
      end
      local.get $1
      i32.const 255
      local.get $6
      i32.const 2047
      i32.and
      local.get $12
      i32.const 66
      i32.ne
      select
      i32.store offset=68
     end
     local.get $1
     i32.const 96
     i32.add
     local.set $1
     local.get $4
     i32.const 1
     i32.add
     local.set $4
     br $while-continue|1
    end
   end
  end
  i32.const 0
  local.set $1
  i32.const 0
  local.set $0
  loop $for-loop|2
   local.get $0
   i32.const 32
   i32.lt_s
   if
    global.get $src/wasm/sm2.as/curReadSet
    i32.const 1
    local.get $0
    i32.shl
    i32.and
    if
     local.get $10
     i32.const 16
     i32.add
     local.get $1
     i32.add
     local.get $0
     i32.store8
     local.get $1
     i32.const 1
     i32.add
     local.set $1
    end
    local.get $0
    i32.const 1
    i32.add
    local.set $0
    br $for-loop|2
   end
  end
  local.get $10
  global.get $src/wasm/sm2.as/curReadSet
  i32.store offset=8
  local.get $10
  local.get $1
  i32.store offset=12
  i32.const 0
  local.set $0
  loop $for-loop|3
   local.get $0
   i32.const 256
   i32.lt_s
   if
    global.get $src/wasm/sm2.as/progTable
    local.get $0
    i32.const 3
    i32.shl
    i32.add
    local.tee $1
    i32.load
    i32.eqz
    if
     local.get $1
     local.get $10
     i32.store
     local.get $0
     i32.const 1
     i32.add
     return
    end
    local.get $0
    i32.const 1
    i32.add
    local.set $0
    br $for-loop|3
   end
  end
  i32.const 0
 )
 (func $src/wasm/sm2.as/sm2TokenBuf (result i32)
  global.get $src/wasm/sm2.as/tokBuf
 )
 (func $src/wasm/sm2.as/sm2TexBuf (result i32)
  global.get $src/wasm/sm2.as/texBuf
 )
 (func $src/wasm/sm2.as/sm2Tex2Buf (result i32)
  global.get $src/wasm/sm2.as/tex2Buf
 )
 (func $src/wasm/sm2.as/sm2Tex1Buf (result i32)
  global.get $src/wasm/sm2.as/tex1Buf
 )
 (func $src/wasm/sm2.as/sm2RunImage (param $0 i32) (param $1 i32) (param $2 i32) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 f64) (result i32)
  local.get $0
  local.get $1
  local.get $2
  local.get $3
  local.get $4
  local.get $5
  i32.const 0
  f64.const 0
  f64.const 0
  f64.const 0
  f64.const 0
  call $src/wasm/sm2.as/sm2RunImage2
 )
 (func $src/wasm/sm2.as/sm2OutBuf (result i32)
  global.get $src/wasm/sm2.as/outBuf
 )
 (func $src/wasm/sm2.as/sm2Init (param $0 i32) (param $1 i32) (param $2 i32) (result i32)
  global.get $src/wasm/sm2.as/inited
  if
   i32.const 1
   return
  end
  local.get $1
  i32.const 0
  i32.le_s
  local.get $0
  i32.const 0
  i32.le_s
  i32.or
  local.get $2
  i32.const 0
  i32.le_s
  i32.or
  if
   i32.const 0
   return
  end
  local.get $0
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/tokBuf
  i32.const 2048
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/constBuf
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/texBuf
  local.get $2
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/outBuf
  i32.const 1024
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/rBase
  i32.const 256
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/tBase
  i32.const 64
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/vBase
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/oBase
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/sampOutBuf
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilA
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilB
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilC
  i32.const 32
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/bilD
  i32.const 8
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/nanCell
  global.get $src/wasm/sm2.as/nanCell
  f64.const nan:0x8000000000000
  f64.store
  i32.const 2048
  call $~lib/memory/heap.alloc
  global.set $src/wasm/sm2.as/progTable
  global.get $src/wasm/sm2.as/progTable
  i32.const 0
  i32.const 2048
  memory.fill
  local.get $0
  global.set $src/wasm/sm2.as/tokCap
  local.get $1
  global.set $src/wasm/sm2.as/texCap
  local.get $2
  global.set $src/wasm/sm2.as/outCap
  i32.const 1
  global.set $src/wasm/sm2.as/inited
  i32.const 1
 )
 (func $src/wasm/sm2.as/sm2ConstBuf (result i32)
  global.get $src/wasm/sm2.as/constBuf
 )
 (func $src/wasm/sm2.as/sm2ClearTex (param $0 i32)
  local.get $0
  i32.const 1
  i32.eq
  if
   i32.const 0
   global.set $src/wasm/sm2.as/tex1Set
  else
   local.get $0
   i32.const 2
   i32.eq
   if
    i32.const 0
    global.set $src/wasm/sm2.as/tex2Set
   end
  end
 )
 (func $src/wasm/sm2.as/sm2Caps (result i64)
  global.get $src/wasm/sm2.as/outCap
  i64.extend_i32_s
  global.get $src/wasm/sm2.as/tokCap
  i64.extend_i32_s
  i64.const 40
  i64.shl
  global.get $src/wasm/sm2.as/texCap
  i64.extend_i32_s
  i64.const 20
  i64.shl
  i64.or
  i64.or
 )
 (func $src/wasm/sm2.as/execPixel (param $0 i32) (param $1 f64) (param $2 f64) (result i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  (local $16 i32)
  (local $17 f64)
  (local $18 f64)
  global.get $src/wasm/sm2.as/rBase
  i32.const 0
  i32.const 1024
  memory.fill
  global.get $src/wasm/sm2.as/oBase
  i32.const 0
  i32.const 32
  memory.fill
  global.get $src/wasm/sm2.as/tBase
  local.get $1
  f64.store
  global.get $src/wasm/sm2.as/tBase
  local.get $2
  f64.store offset=8
  local.get $0
  i32.load
  local.set $5
  local.get $0
  i32.load offset=12
  local.set $6
  loop $for-loop|0
   local.get $3
   local.get $6
   i32.lt_s
   if
    global.get $src/wasm/sm2.as/rBase
    local.get $0
    i32.const 16
    i32.add
    local.get $3
    i32.add
    i32.load8_u
    i32.const 5
    i32.shl
    i32.add
    local.tee $7
    f64.const 0
    f64.store
    local.get $7
    f64.const 0
    f64.store offset=8
    local.get $7
    f64.const 0
    f64.store offset=16
    local.get $7
    f64.const 0
    f64.store offset=24
    local.get $3
    i32.const 1
    i32.add
    local.set $3
    br $for-loop|0
   end
  end
  local.get $0
  i32.const 48
  i32.add
  local.set $0
  loop $for-loop|1
   local.get $4
   local.get $5
   i32.lt_s
   if
    block $for-continue|1
     local.get $0
     i32.load
     local.tee $6
     i32.const 65
     i32.eq
     if
      local.get $0
      i32.load offset=16
      local.tee $3
      local.get $0
      i32.load offset=24
      local.tee $6
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $0
      i32.const -64
      i32.sub
      i32.load
      i32.const 1
      i32.and
      local.tee $7
      select
      f64.const 0
      f64.lt
      if (result i32)
       i32.const 1
      else
       local.get $3
       local.get $6
       i32.const 2
       i32.shr_u
       i32.const 3
       i32.and
       i32.const 3
       i32.shl
       i32.add
       f64.load
       local.tee $1
       f64.neg
       local.get $1
       local.get $7
       select
       f64.const 0
       f64.lt
      end
      if (result i32)
       i32.const 1
      else
       local.get $3
       local.get $6
       i32.const 4
       i32.shr_u
       i32.const 3
       i32.and
       i32.const 3
       i32.shl
       i32.add
       f64.load
       local.tee $1
       f64.neg
       local.get $1
       local.get $7
       select
       f64.const 0
       f64.lt
      end
      if
       i32.const 0
       return
      end
      br $for-continue|1
     end
     local.get $0
     i32.load offset=4
     local.tee $7
     i32.const 15
     i32.and
     local.tee $8
     i32.eqz
     br_if $for-continue|1
     local.get $0
     i32.load offset=8
     local.tee $3
     i32.eqz
     br_if $for-continue|1
     local.get $7
     i32.const 16
     i32.and
     i32.const 0
     i32.ne
     local.set $7
     local.get $0
     i32.const -64
     i32.sub
     i32.load
     local.set $9
     block $break|2
      block $case24|2
       block $case23|2
        block $case22|2
         block $case21|2
          block $case20|2
           block $case19|2
            block $case18|2
             block $case17|2
              block $case16|2
               block $case15|2
                block $case14|2
                 block $case13|2
                  block $case12|2
                   block $case11|2
                    block $case10|2
                     block $case9|2
                      block $case8|2
                       block $case7|2
                        block $case6|2
                         block $case5|2
                          block $case4|2
                           block $case3|2
                            block $case2|2
                             block $case1|2
                              local.get $6
                              i32.const 1
                              i32.ne
                              if
                               local.get $6
                               i32.const 2
                               i32.eq
                               br_if $case1|2
                               local.get $6
                               i32.const 3
                               i32.eq
                               br_if $case2|2
                               local.get $6
                               i32.const 4
                               i32.eq
                               br_if $case3|2
                               local.get $6
                               i32.const 5
                               i32.eq
                               br_if $case4|2
                               local.get $6
                               i32.const 6
                               i32.eq
                               br_if $case5|2
                               local.get $6
                               i32.const 7
                               i32.eq
                               br_if $case6|2
                               local.get $6
                               i32.const 8
                               i32.eq
                               br_if $case7|2
                               local.get $6
                               i32.const 9
                               i32.eq
                               br_if $case8|2
                               local.get $6
                               i32.const 10
                               i32.eq
                               br_if $case9|2
                               local.get $6
                               i32.const 11
                               i32.eq
                               br_if $case10|2
                               local.get $6
                               i32.const 12
                               i32.eq
                               br_if $case11|2
                               local.get $6
                               i32.const 13
                               i32.eq
                               br_if $case12|2
                               local.get $6
                               i32.const 14
                               i32.eq
                               br_if $case13|2
                               local.get $6
                               i32.const 15
                               i32.eq
                               br_if $case14|2
                               local.get $6
                               i32.const 18
                               i32.eq
                               br_if $case15|2
                               local.get $6
                               i32.const 19
                               i32.eq
                               br_if $case16|2
                               local.get $6
                               i32.const 32
                               i32.eq
                               br_if $case17|2
                               local.get $6
                               i32.const 33
                               i32.eq
                               br_if $case18|2
                               local.get $6
                               i32.const 35
                               i32.eq
                               br_if $case19|2
                               local.get $6
                               i32.const 36
                               i32.eq
                               br_if $case20|2
                               local.get $6
                               i32.const 37
                               i32.eq
                               br_if $case21|2
                               local.get $6
                               i32.const 66
                               i32.eq
                               br_if $case22|2
                               local.get $6
                               i32.const 88
                               i32.eq
                               br_if $case23|2
                               local.get $6
                               i32.const 90
                               i32.eq
                               br_if $case24|2
                               br $break|2
                              end
                              local.get $0
                              i32.load offset=16
                              local.set $6
                              local.get $0
                              i32.load offset=24
                              local.set $10
                              local.get $9
                              i32.const 1
                              i32.and
                              local.set $9
                              local.get $8
                              i32.const 1
                              i32.and
                              if
                               local.get $6
                               local.get $10
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $3
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store
                              end
                              local.get $8
                              i32.const 2
                              i32.and
                              if
                               local.get $6
                               local.get $10
                               i32.const 2
                               i32.shr_u
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $3
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store offset=8
                              end
                              local.get $8
                              i32.const 4
                              i32.and
                              if
                               local.get $6
                               local.get $10
                               i32.const 4
                               i32.shr_u
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $3
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store offset=16
                              end
                              local.get $8
                              i32.const 8
                              i32.and
                              if
                               local.get $6
                               local.get $10
                               i32.const 6
                               i32.shr_u
                               i32.const 3
                               i32.and
                               i32.const 3
                               i32.shl
                               i32.add
                               f64.load
                               local.tee $1
                               f64.neg
                               local.get $1
                               local.get $9
                               select
                               local.set $1
                               local.get $3
                               local.get $7
                               if (result f64)
                                f64.const 0
                                f64.const 1
                                local.get $1
                                local.get $1
                                f64.const 1
                                f64.gt
                                select
                                local.get $1
                                f64.const 0
                                f64.lt
                                select
                               else
                                local.get $1
                               end
                               f64.store offset=24
                              end
                              br $break|2
                             end
                             local.get $0
                             i32.load offset=16
                             local.set $6
                             local.get $0
                             i32.load offset=24
                             local.set $10
                             local.get $9
                             i32.const 1
                             i32.and
                             local.set $11
                             local.get $0
                             i32.load offset=32
                             local.set $12
                             local.get $0
                             i32.load offset=40
                             local.set $13
                             local.get $9
                             i32.const 2
                             i32.and
                             i32.const 0
                             i32.ne
                             local.set $9
                             local.get $8
                             i32.const 1
                             i32.and
                             if
                              local.get $6
                              local.get $10
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $3
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store
                             end
                             local.get $8
                             i32.const 2
                             i32.and
                             if
                              local.get $6
                              local.get $10
                              i32.const 2
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 2
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $3
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store offset=8
                             end
                             local.get $8
                             i32.const 4
                             i32.and
                             if
                              local.get $6
                              local.get $10
                              i32.const 4
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 4
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $3
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store offset=16
                             end
                             local.get $8
                             i32.const 8
                             i32.and
                             if
                              local.get $6
                              local.get $10
                              i32.const 6
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $11
                              select
                              local.get $12
                              local.get $13
                              i32.const 6
                              i32.shr_u
                              i32.const 3
                              i32.and
                              i32.const 3
                              i32.shl
                              i32.add
                              f64.load
                              local.tee $1
                              f64.neg
                              local.get $1
                              local.get $9
                              select
                              f64.add
                              local.set $1
                              local.get $3
                              local.get $7
                              if (result f64)
                               f64.const 0
                               f64.const 1
                               local.get $1
                               local.get $1
                               f64.const 1
                               f64.gt
                               select
                               local.get $1
                               f64.const 0
                               f64.lt
                               select
                              else
                               local.get $1
                              end
                              f64.store offset=24
                             end
                             br $break|2
                            end
                            local.get $0
                            i32.load offset=16
                            local.set $6
                            local.get $0
                            i32.load offset=24
                            local.set $10
                            local.get $9
                            i32.const 1
                            i32.and
                            local.set $11
                            local.get $0
                            i32.load offset=32
                            local.set $12
                            local.get $0
                            i32.load offset=40
                            local.set $13
                            local.get $9
                            i32.const 2
                            i32.and
                            i32.const 0
                            i32.ne
                            local.set $9
                            local.get $8
                            i32.const 1
                            i32.and
                            if
                             local.get $6
                             local.get $10
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $3
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store
                            end
                            local.get $8
                            i32.const 2
                            i32.and
                            if
                             local.get $6
                             local.get $10
                             i32.const 2
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 2
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $3
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store offset=8
                            end
                            local.get $8
                            i32.const 4
                            i32.and
                            if
                             local.get $6
                             local.get $10
                             i32.const 4
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 4
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $3
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store offset=16
                            end
                            local.get $8
                            i32.const 8
                            i32.and
                            if
                             local.get $6
                             local.get $10
                             i32.const 6
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $11
                             select
                             local.get $12
                             local.get $13
                             i32.const 6
                             i32.shr_u
                             i32.const 3
                             i32.and
                             i32.const 3
                             i32.shl
                             i32.add
                             f64.load
                             local.tee $1
                             f64.neg
                             local.get $1
                             local.get $9
                             select
                             f64.sub
                             local.set $1
                             local.get $3
                             local.get $7
                             if (result f64)
                              f64.const 0
                              f64.const 1
                              local.get $1
                              local.get $1
                              f64.const 1
                              f64.gt
                              select
                              local.get $1
                              f64.const 0
                              f64.lt
                              select
                             else
                              local.get $1
                             end
                             f64.store offset=24
                            end
                            br $break|2
                           end
                           local.get $0
                           i32.load offset=16
                           local.set $6
                           local.get $0
                           i32.load offset=24
                           local.set $10
                           local.get $9
                           i32.const 1
                           i32.and
                           local.set $11
                           local.get $0
                           i32.load offset=32
                           local.set $12
                           local.get $0
                           i32.load offset=40
                           local.set $13
                           local.get $9
                           i32.const 2
                           i32.and
                           i32.const 0
                           i32.ne
                           local.set $14
                           local.get $0
                           i32.load offset=48
                           local.set $15
                           local.get $0
                           i32.load offset=56
                           local.set $16
                           local.get $9
                           i32.const 4
                           i32.and
                           i32.const 0
                           i32.ne
                           local.set $9
                           local.get $8
                           i32.const 1
                           i32.and
                           if
                            local.get $6
                            local.get $10
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $3
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store
                           end
                           local.get $8
                           i32.const 2
                           i32.and
                           if
                            local.get $6
                            local.get $10
                            i32.const 2
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 2
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 2
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $3
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store offset=8
                           end
                           local.get $8
                           i32.const 4
                           i32.and
                           if
                            local.get $6
                            local.get $10
                            i32.const 4
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 4
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 4
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $3
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store offset=16
                           end
                           local.get $8
                           i32.const 8
                           i32.and
                           if
                            local.get $6
                            local.get $10
                            i32.const 6
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $11
                            select
                            local.get $12
                            local.get $13
                            i32.const 6
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $14
                            select
                            f64.mul
                            local.get $15
                            local.get $16
                            i32.const 6
                            i32.shr_u
                            i32.const 3
                            i32.and
                            i32.const 3
                            i32.shl
                            i32.add
                            f64.load
                            local.tee $1
                            f64.neg
                            local.get $1
                            local.get $9
                            select
                            f64.add
                            local.set $1
                            local.get $3
                            local.get $7
                            if (result f64)
                             f64.const 0
                             f64.const 1
                             local.get $1
                             local.get $1
                             f64.const 1
                             f64.gt
                             select
                             local.get $1
                             f64.const 0
                             f64.lt
                             select
                            else
                             local.get $1
                            end
                            f64.store offset=24
                           end
                           br $break|2
                          end
                          local.get $0
                          i32.load offset=16
                          local.set $6
                          local.get $0
                          i32.load offset=24
                          local.set $10
                          local.get $9
                          i32.const 1
                          i32.and
                          local.set $11
                          local.get $0
                          i32.load offset=32
                          local.set $12
                          local.get $0
                          i32.load offset=40
                          local.set $13
                          local.get $9
                          i32.const 2
                          i32.and
                          i32.const 0
                          i32.ne
                          local.set $9
                          local.get $8
                          i32.const 1
                          i32.and
                          if
                           local.get $6
                           local.get $10
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $3
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store
                          end
                          local.get $8
                          i32.const 2
                          i32.and
                          if
                           local.get $6
                           local.get $10
                           i32.const 2
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 2
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $3
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store offset=8
                          end
                          local.get $8
                          i32.const 4
                          i32.and
                          if
                           local.get $6
                           local.get $10
                           i32.const 4
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 4
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $3
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store offset=16
                          end
                          local.get $8
                          i32.const 8
                          i32.and
                          if
                           local.get $6
                           local.get $10
                           i32.const 6
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $11
                           select
                           local.get $12
                           local.get $13
                           i32.const 6
                           i32.shr_u
                           i32.const 3
                           i32.and
                           i32.const 3
                           i32.shl
                           i32.add
                           f64.load
                           local.tee $1
                           f64.neg
                           local.get $1
                           local.get $9
                           select
                           f64.mul
                           local.set $1
                           local.get $3
                           local.get $7
                           if (result f64)
                            f64.const 0
                            f64.const 1
                            local.get $1
                            local.get $1
                            f64.const 1
                            f64.gt
                            select
                            local.get $1
                            f64.const 0
                            f64.lt
                            select
                           else
                            local.get $1
                           end
                           f64.store offset=24
                          end
                          br $break|2
                         end
                         local.get $0
                         i32.load offset=16
                         local.set $6
                         local.get $0
                         i32.load offset=24
                         local.set $10
                         local.get $9
                         i32.const 1
                         i32.and
                         local.set $9
                         local.get $8
                         i32.const 1
                         i32.and
                         if
                          f64.const 1
                          local.get $6
                          local.get $10
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $3
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store
                         end
                         local.get $8
                         i32.const 2
                         i32.and
                         if
                          f64.const 1
                          local.get $6
                          local.get $10
                          i32.const 2
                          i32.shr_u
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $3
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store offset=8
                         end
                         local.get $8
                         i32.const 4
                         i32.and
                         if
                          f64.const 1
                          local.get $6
                          local.get $10
                          i32.const 4
                          i32.shr_u
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $3
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store offset=16
                         end
                         local.get $8
                         i32.const 8
                         i32.and
                         if
                          f64.const 1
                          local.get $6
                          local.get $10
                          i32.const 6
                          i32.shr_u
                          i32.const 3
                          i32.and
                          i32.const 3
                          i32.shl
                          i32.add
                          f64.load
                          local.tee $1
                          f64.neg
                          local.get $1
                          local.get $9
                          select
                          f64.div
                          local.set $1
                          local.get $3
                          local.get $7
                          if (result f64)
                           f64.const 0
                           f64.const 1
                           local.get $1
                           local.get $1
                           f64.const 1
                           f64.gt
                           select
                           local.get $1
                           f64.const 0
                           f64.lt
                           select
                          else
                           local.get $1
                          end
                          f64.store offset=24
                         end
                         br $break|2
                        end
                        local.get $0
                        i32.load offset=16
                        local.set $6
                        local.get $0
                        i32.load offset=24
                        local.set $10
                        local.get $9
                        i32.const 1
                        i32.and
                        local.set $9
                        local.get $8
                        i32.const 1
                        i32.and
                        if
                         f64.const 1
                         local.get $6
                         local.get $10
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $3
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store
                        end
                        local.get $8
                        i32.const 2
                        i32.and
                        if
                         f64.const 1
                         local.get $6
                         local.get $10
                         i32.const 2
                         i32.shr_u
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $3
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store offset=8
                        end
                        local.get $8
                        i32.const 4
                        i32.and
                        if
                         f64.const 1
                         local.get $6
                         local.get $10
                         i32.const 4
                         i32.shr_u
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $3
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store offset=16
                        end
                        local.get $8
                        i32.const 8
                        i32.and
                        if
                         f64.const 1
                         local.get $6
                         local.get $10
                         i32.const 6
                         i32.shr_u
                         i32.const 3
                         i32.and
                         i32.const 3
                         i32.shl
                         i32.add
                         f64.load
                         local.tee $1
                         f64.neg
                         local.get $1
                         local.get $9
                         select
                         f64.sqrt
                         f64.div
                         local.set $1
                         local.get $3
                         local.get $7
                         if (result f64)
                          f64.const 0
                          f64.const 1
                          local.get $1
                          local.get $1
                          f64.const 1
                          f64.gt
                          select
                          local.get $1
                          f64.const 0
                          f64.lt
                          select
                         else
                          local.get $1
                         end
                         f64.store offset=24
                        end
                        br $break|2
                       end
                       local.get $0
                       i32.load offset=16
                       local.tee $6
                       local.get $0
                       i32.load offset=24
                       local.tee $10
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       i32.const 1
                       i32.and
                       local.tee $11
                       select
                       local.get $0
                       i32.load offset=32
                       local.tee $12
                       local.get $0
                       i32.load offset=40
                       local.tee $13
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       i32.const 2
                       i32.and
                       i32.const 0
                       i32.ne
                       local.tee $9
                       select
                       f64.mul
                       local.get $6
                       local.get $10
                       i32.const 2
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $11
                       select
                       local.get $12
                       local.get $13
                       i32.const 2
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       select
                       f64.mul
                       f64.add
                       local.get $6
                       local.get $10
                       i32.const 4
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $11
                       select
                       local.get $12
                       local.get $13
                       i32.const 4
                       i32.shr_u
                       i32.const 3
                       i32.and
                       i32.const 3
                       i32.shl
                       i32.add
                       f64.load
                       local.tee $1
                       f64.neg
                       local.get $1
                       local.get $9
                       select
                       f64.mul
                       f64.add
                       local.set $1
                       local.get $8
                       i32.const 1
                       i32.and
                       if
                        local.get $3
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store
                       end
                       local.get $8
                       i32.const 2
                       i32.and
                       if
                        local.get $3
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store offset=8
                       end
                       local.get $8
                       i32.const 4
                       i32.and
                       if
                        local.get $3
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store offset=16
                       end
                       local.get $8
                       i32.const 8
                       i32.and
                       if
                        local.get $3
                        local.get $7
                        if (result f64)
                         f64.const 0
                         f64.const 1
                         local.get $1
                         local.get $1
                         f64.const 1
                         f64.gt
                         select
                         local.get $1
                         f64.const 0
                         f64.lt
                         select
                        else
                         local.get $1
                        end
                        f64.store offset=24
                       end
                       br $break|2
                      end
                      local.get $0
                      i32.load offset=16
                      local.tee $6
                      local.get $0
                      i32.load offset=24
                      local.tee $10
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      i32.const 1
                      i32.and
                      local.tee $11
                      select
                      local.get $0
                      i32.load offset=32
                      local.tee $12
                      local.get $0
                      i32.load offset=40
                      local.tee $13
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      i32.const 2
                      i32.and
                      i32.const 0
                      i32.ne
                      local.tee $9
                      select
                      f64.mul
                      local.get $6
                      local.get $10
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.mul
                      f64.add
                      local.get $6
                      local.get $10
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.mul
                      f64.add
                      local.get $6
                      local.get $10
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.mul
                      f64.add
                      local.set $1
                      local.get $8
                      i32.const 1
                      i32.and
                      if
                       local.get $3
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store
                      end
                      local.get $8
                      i32.const 2
                      i32.and
                      if
                       local.get $3
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store offset=8
                      end
                      local.get $8
                      i32.const 4
                      i32.and
                      if
                       local.get $3
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store offset=16
                      end
                      local.get $8
                      i32.const 8
                      i32.and
                      if
                       local.get $3
                       local.get $7
                       if (result f64)
                        f64.const 0
                        f64.const 1
                        local.get $1
                        local.get $1
                        f64.const 1
                        f64.gt
                        select
                        local.get $1
                        f64.const 0
                        f64.lt
                        select
                       else
                        local.get $1
                       end
                       f64.store offset=24
                      end
                      br $break|2
                     end
                     local.get $0
                     i32.load offset=16
                     local.set $6
                     local.get $0
                     i32.load offset=24
                     local.set $10
                     local.get $9
                     i32.const 1
                     i32.and
                     local.set $11
                     local.get $0
                     i32.load offset=32
                     local.set $12
                     local.get $0
                     i32.load offset=40
                     local.set $13
                     local.get $9
                     i32.const 2
                     i32.and
                     i32.const 0
                     i32.ne
                     local.set $9
                     local.get $8
                     i32.const 1
                     i32.and
                     if
                      local.get $6
                      local.get $10
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $3
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store
                     end
                     local.get $8
                     i32.const 2
                     i32.and
                     if
                      local.get $6
                      local.get $10
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 2
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $3
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store offset=8
                     end
                     local.get $8
                     i32.const 4
                     i32.and
                     if
                      local.get $6
                      local.get $10
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 4
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $3
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store offset=16
                     end
                     local.get $8
                     i32.const 8
                     i32.and
                     if
                      local.get $6
                      local.get $10
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $11
                      select
                      local.get $12
                      local.get $13
                      i32.const 6
                      i32.shr_u
                      i32.const 3
                      i32.and
                      i32.const 3
                      i32.shl
                      i32.add
                      f64.load
                      local.tee $1
                      f64.neg
                      local.get $1
                      local.get $9
                      select
                      f64.min
                      local.set $1
                      local.get $3
                      local.get $7
                      if (result f64)
                       f64.const 0
                       f64.const 1
                       local.get $1
                       local.get $1
                       f64.const 1
                       f64.gt
                       select
                       local.get $1
                       f64.const 0
                       f64.lt
                       select
                      else
                       local.get $1
                      end
                      f64.store offset=24
                     end
                     br $break|2
                    end
                    local.get $0
                    i32.load offset=16
                    local.set $6
                    local.get $0
                    i32.load offset=24
                    local.set $10
                    local.get $9
                    i32.const 1
                    i32.and
                    local.set $11
                    local.get $0
                    i32.load offset=32
                    local.set $12
                    local.get $0
                    i32.load offset=40
                    local.set $13
                    local.get $9
                    i32.const 2
                    i32.and
                    i32.const 0
                    i32.ne
                    local.set $9
                    local.get $8
                    i32.const 1
                    i32.and
                    if
                     local.get $6
                     local.get $10
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $3
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store
                    end
                    local.get $8
                    i32.const 2
                    i32.and
                    if
                     local.get $6
                     local.get $10
                     i32.const 2
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 2
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $3
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store offset=8
                    end
                    local.get $8
                    i32.const 4
                    i32.and
                    if
                     local.get $6
                     local.get $10
                     i32.const 4
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 4
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $3
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store offset=16
                    end
                    local.get $8
                    i32.const 8
                    i32.and
                    if
                     local.get $6
                     local.get $10
                     i32.const 6
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $11
                     select
                     local.get $12
                     local.get $13
                     i32.const 6
                     i32.shr_u
                     i32.const 3
                     i32.and
                     i32.const 3
                     i32.shl
                     i32.add
                     f64.load
                     local.tee $1
                     f64.neg
                     local.get $1
                     local.get $9
                     select
                     f64.max
                     local.set $1
                     local.get $3
                     local.get $7
                     if (result f64)
                      f64.const 0
                      f64.const 1
                      local.get $1
                      local.get $1
                      f64.const 1
                      f64.gt
                      select
                      local.get $1
                      f64.const 0
                      f64.lt
                      select
                     else
                      local.get $1
                     end
                     f64.store offset=24
                    end
                    br $break|2
                   end
                   local.get $0
                   i32.load offset=16
                   local.set $6
                   local.get $0
                   i32.load offset=24
                   local.set $10
                   local.get $9
                   i32.const 1
                   i32.and
                   local.set $11
                   local.get $0
                   i32.load offset=32
                   local.set $12
                   local.get $0
                   i32.load offset=40
                   local.set $13
                   local.get $9
                   i32.const 2
                   i32.and
                   i32.const 0
                   i32.ne
                   local.set $9
                   local.get $8
                   i32.const 1
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $6
                    local.get $10
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $3
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store
                   end
                   local.get $8
                   i32.const 2
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $6
                    local.get $10
                    i32.const 2
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 2
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $3
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store offset=8
                   end
                   local.get $8
                   i32.const 4
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $6
                    local.get $10
                    i32.const 4
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 4
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $3
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store offset=16
                   end
                   local.get $8
                   i32.const 8
                   i32.and
                   if
                    f64.const 1
                    f64.const 0
                    local.get $6
                    local.get $10
                    i32.const 6
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $11
                    select
                    local.get $12
                    local.get $13
                    i32.const 6
                    i32.shr_u
                    i32.const 3
                    i32.and
                    i32.const 3
                    i32.shl
                    i32.add
                    f64.load
                    local.tee $1
                    f64.neg
                    local.get $1
                    local.get $9
                    select
                    f64.lt
                    select
                    local.set $1
                    local.get $3
                    local.get $7
                    if (result f64)
                     f64.const 0
                     f64.const 1
                     local.get $1
                     local.get $1
                     f64.const 1
                     f64.gt
                     select
                     local.get $1
                     f64.const 0
                     f64.lt
                     select
                    else
                     local.get $1
                    end
                    f64.store offset=24
                   end
                   br $break|2
                  end
                  local.get $0
                  i32.load offset=16
                  local.set $6
                  local.get $0
                  i32.load offset=24
                  local.set $10
                  local.get $9
                  i32.const 1
                  i32.and
                  local.set $11
                  local.get $0
                  i32.load offset=32
                  local.set $12
                  local.get $0
                  i32.load offset=40
                  local.set $13
                  local.get $9
                  i32.const 2
                  i32.and
                  i32.const 0
                  i32.ne
                  local.set $9
                  local.get $8
                  i32.const 1
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $6
                   local.get $10
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $3
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store
                  end
                  local.get $8
                  i32.const 2
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $6
                   local.get $10
                   i32.const 2
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 2
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $3
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store offset=8
                  end
                  local.get $8
                  i32.const 4
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $6
                   local.get $10
                   i32.const 4
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 4
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $3
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store offset=16
                  end
                  local.get $8
                  i32.const 8
                  i32.and
                  if
                   f64.const 1
                   f64.const 0
                   local.get $6
                   local.get $10
                   i32.const 6
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $11
                   select
                   local.get $12
                   local.get $13
                   i32.const 6
                   i32.shr_u
                   i32.const 3
                   i32.and
                   i32.const 3
                   i32.shl
                   i32.add
                   f64.load
                   local.tee $1
                   f64.neg
                   local.get $1
                   local.get $9
                   select
                   f64.ge
                   select
                   local.set $1
                   local.get $3
                   local.get $7
                   if (result f64)
                    f64.const 0
                    f64.const 1
                    local.get $1
                    local.get $1
                    f64.const 1
                    f64.gt
                    select
                    local.get $1
                    f64.const 0
                    f64.lt
                    select
                   else
                    local.get $1
                   end
                   f64.store offset=24
                  end
                  br $break|2
                 end
                 local.get $0
                 i32.load offset=16
                 local.set $6
                 local.get $0
                 i32.load offset=24
                 local.set $10
                 local.get $9
                 i32.const 1
                 i32.and
                 local.set $9
                 local.get $8
                 i32.const 1
                 i32.and
                 if
                  f64.const 2
                  local.get $6
                  local.get $10
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $src/wasm/sm2.as/mpow
                  local.set $1
                  local.get $3
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store
                 end
                 local.get $8
                 i32.const 2
                 i32.and
                 if
                  f64.const 2
                  local.get $6
                  local.get $10
                  i32.const 2
                  i32.shr_u
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $src/wasm/sm2.as/mpow
                  local.set $1
                  local.get $3
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store offset=8
                 end
                 local.get $8
                 i32.const 4
                 i32.and
                 if
                  f64.const 2
                  local.get $6
                  local.get $10
                  i32.const 4
                  i32.shr_u
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $src/wasm/sm2.as/mpow
                  local.set $1
                  local.get $3
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store offset=16
                 end
                 local.get $8
                 i32.const 8
                 i32.and
                 if
                  f64.const 2
                  local.get $6
                  local.get $10
                  i32.const 6
                  i32.shr_u
                  i32.const 3
                  i32.and
                  i32.const 3
                  i32.shl
                  i32.add
                  f64.load
                  local.tee $1
                  f64.neg
                  local.get $1
                  local.get $9
                  select
                  call $src/wasm/sm2.as/mpow
                  local.set $1
                  local.get $3
                  local.get $7
                  if (result f64)
                   f64.const 0
                   f64.const 1
                   local.get $1
                   local.get $1
                   f64.const 1
                   f64.gt
                   select
                   local.get $1
                   f64.const 0
                   f64.lt
                   select
                  else
                   local.get $1
                  end
                  f64.store offset=24
                 end
                 br $break|2
                end
                local.get $0
                i32.load offset=16
                local.set $6
                local.get $0
                i32.load offset=24
                local.set $10
                local.get $9
                i32.const 1
                i32.and
                local.set $9
                local.get $8
                i32.const 1
                i32.and
                if
                 local.get $6
                 local.get $10
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $src/wasm/sm2.as/mlog2
                 local.set $1
                 local.get $3
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store
                end
                local.get $8
                i32.const 2
                i32.and
                if
                 local.get $6
                 local.get $10
                 i32.const 2
                 i32.shr_u
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $src/wasm/sm2.as/mlog2
                 local.set $1
                 local.get $3
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store offset=8
                end
                local.get $8
                i32.const 4
                i32.and
                if
                 local.get $6
                 local.get $10
                 i32.const 4
                 i32.shr_u
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $src/wasm/sm2.as/mlog2
                 local.set $1
                 local.get $3
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store offset=16
                end
                local.get $8
                i32.const 8
                i32.and
                if
                 local.get $6
                 local.get $10
                 i32.const 6
                 i32.shr_u
                 i32.const 3
                 i32.and
                 i32.const 3
                 i32.shl
                 i32.add
                 f64.load
                 local.tee $1
                 f64.neg
                 local.get $1
                 local.get $9
                 select
                 call $src/wasm/sm2.as/mlog2
                 local.set $1
                 local.get $3
                 local.get $7
                 if (result f64)
                  f64.const 0
                  f64.const 1
                  local.get $1
                  local.get $1
                  f64.const 1
                  f64.gt
                  select
                  local.get $1
                  f64.const 0
                  f64.lt
                  select
                 else
                  local.get $1
                 end
                 f64.store offset=24
                end
                br $break|2
               end
               local.get $0
               i32.load offset=16
               local.set $6
               local.get $0
               i32.load offset=24
               local.set $10
               local.get $9
               i32.const 1
               i32.and
               local.set $11
               local.get $0
               i32.load offset=32
               local.set $12
               local.get $0
               i32.load offset=40
               local.set $13
               local.get $9
               i32.const 2
               i32.and
               i32.const 0
               i32.ne
               local.set $14
               local.get $0
               i32.load offset=48
               local.set $15
               local.get $0
               i32.load offset=56
               local.set $16
               local.get $9
               i32.const 4
               i32.and
               i32.const 0
               i32.ne
               local.set $9
               local.get $8
               i32.const 1
               i32.and
               if
                local.get $6
                local.get $10
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $3
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store
               end
               local.get $8
               i32.const 2
               i32.and
               if
                local.get $6
                local.get $10
                i32.const 2
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 2
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 2
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $3
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store offset=8
               end
               local.get $8
               i32.const 4
               i32.and
               if
                local.get $6
                local.get $10
                i32.const 4
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 4
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 4
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $3
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store offset=16
               end
               local.get $8
               i32.const 8
               i32.and
               if
                local.get $6
                local.get $10
                i32.const 6
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $11
                select
                local.tee $1
                local.get $12
                local.get $13
                i32.const 6
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $2
                f64.neg
                local.get $2
                local.get $14
                select
                f64.mul
                f64.const 1
                local.get $1
                f64.sub
                local.get $15
                local.get $16
                i32.const 6
                i32.shr_u
                i32.const 3
                i32.and
                i32.const 3
                i32.shl
                i32.add
                f64.load
                local.tee $1
                f64.neg
                local.get $1
                local.get $9
                select
                f64.mul
                f64.add
                local.set $1
                local.get $3
                local.get $7
                if (result f64)
                 f64.const 0
                 f64.const 1
                 local.get $1
                 local.get $1
                 f64.const 1
                 f64.gt
                 select
                 local.get $1
                 f64.const 0
                 f64.lt
                 select
                else
                 local.get $1
                end
                f64.store offset=24
               end
               br $break|2
              end
              local.get $0
              i32.load offset=16
              local.set $6
              local.get $0
              i32.load offset=24
              local.set $10
              local.get $9
              i32.const 1
              i32.and
              local.set $9
              local.get $8
              i32.const 1
              i32.and
              if
               local.get $6
               local.get $10
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $3
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store
              end
              local.get $8
              i32.const 2
              i32.and
              if
               local.get $6
               local.get $10
               i32.const 2
               i32.shr_u
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $3
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store offset=8
              end
              local.get $8
              i32.const 4
              i32.and
              if
               local.get $6
               local.get $10
               i32.const 4
               i32.shr_u
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $3
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store offset=16
              end
              local.get $8
              i32.const 8
              i32.and
              if
               local.get $6
               local.get $10
               i32.const 6
               i32.shr_u
               i32.const 3
               i32.and
               i32.const 3
               i32.shl
               i32.add
               f64.load
               local.tee $1
               f64.neg
               local.get $1
               local.get $9
               select
               local.tee $1
               local.get $1
               f64.floor
               f64.sub
               local.set $1
               local.get $3
               local.get $7
               if (result f64)
                f64.const 0
                f64.const 1
                local.get $1
                local.get $1
                f64.const 1
                f64.gt
                select
                local.get $1
                f64.const 0
                f64.lt
                select
               else
                local.get $1
               end
               f64.store offset=24
              end
              br $break|2
             end
             local.get $0
             i32.load offset=16
             local.get $0
             i32.load offset=24
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             i32.const 1
             i32.and
             select
             f64.abs
             local.get $0
             i32.load offset=32
             local.get $0
             i32.load offset=40
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             i32.const 2
             i32.and
             select
             call $src/wasm/sm2.as/mpow
             local.set $1
             local.get $8
             i32.const 1
             i32.and
             if
              local.get $3
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store
             end
             local.get $8
             i32.const 2
             i32.and
             if
              local.get $3
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store offset=8
             end
             local.get $8
             i32.const 4
             i32.and
             if
              local.get $3
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store offset=16
             end
             local.get $8
             i32.const 8
             i32.and
             if
              local.get $3
              local.get $7
              if (result f64)
               f64.const 0
               f64.const 1
               local.get $1
               local.get $1
               f64.const 1
               f64.gt
               select
               local.get $1
               f64.const 0
               f64.lt
               select
              else
               local.get $1
              end
              f64.store offset=24
             end
             br $break|2
            end
            local.get $0
            i32.load offset=16
            local.set $6
            local.get $0
            i32.load offset=24
            local.set $10
            local.get $9
            i32.const 1
            i32.and
            local.set $11
            local.get $0
            i32.load offset=32
            local.set $12
            local.get $0
            i32.load offset=40
            local.set $13
            local.get $9
            i32.const 2
            i32.and
            i32.const 0
            i32.ne
            local.set $9
            local.get $8
            i32.const 1
            i32.and
            if
             local.get $6
             local.get $10
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             local.get $6
             local.get $10
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             f64.sub
             local.set $1
             local.get $3
             local.get $7
             if (result f64)
              f64.const 0
              f64.const 1
              local.get $1
              local.get $1
              f64.const 1
              f64.gt
              select
              local.get $1
              f64.const 0
              f64.lt
              select
             else
              local.get $1
             end
             f64.store
            end
            local.get $8
            i32.const 2
            i32.and
            if
             local.get $6
             local.get $10
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             local.get $6
             local.get $10
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 4
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             f64.sub
             local.set $1
             local.get $3
             local.get $7
             if (result f64)
              f64.const 0
              f64.const 1
              local.get $1
              local.get $1
              f64.const 1
              f64.gt
              select
              local.get $1
              f64.const 0
              f64.lt
              select
             else
              local.get $1
             end
             f64.store offset=8
            end
            local.get $8
            i32.const 4
            i32.and
            if
             local.get $6
             local.get $10
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             local.get $6
             local.get $10
             i32.const 2
             i32.shr_u
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $11
             select
             local.get $12
             local.get $13
             i32.const 3
             i32.and
             i32.const 3
             i32.shl
             i32.add
             f64.load
             local.tee $1
             f64.neg
             local.get $1
             local.get $9
             select
             f64.mul
             f64.sub
             local.set $1
             local.get $3
             local.get $7
             if (result f64)
              f64.const 0
              f64.const 1
              local.get $1
              local.get $1
              f64.const 1
              f64.gt
              select
              local.get $1
              f64.const 0
              f64.lt
              select
             else
              local.get $1
             end
             f64.store offset=16
            end
            local.get $8
            i32.const 8
            i32.and
            if
             local.get $3
             f64.const 0
             f64.store offset=24
            end
            br $break|2
           end
           local.get $0
           i32.load offset=16
           local.set $6
           local.get $0
           i32.load offset=24
           local.set $10
           local.get $9
           i32.const 1
           i32.and
           local.set $9
           local.get $8
           i32.const 1
           i32.and
           if
            local.get $6
            local.get $10
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $3
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store
           end
           local.get $8
           i32.const 2
           i32.and
           if
            local.get $6
            local.get $10
            i32.const 2
            i32.shr_u
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $3
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store offset=8
           end
           local.get $8
           i32.const 4
           i32.and
           if
            local.get $6
            local.get $10
            i32.const 4
            i32.shr_u
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $3
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store offset=16
           end
           local.get $8
           i32.const 8
           i32.and
           if
            local.get $6
            local.get $10
            i32.const 6
            i32.shr_u
            i32.const 3
            i32.and
            i32.const 3
            i32.shl
            i32.add
            f64.load
            local.tee $1
            f64.neg
            local.get $1
            local.get $9
            select
            f64.abs
            local.set $1
            local.get $3
            local.get $7
            if (result f64)
             f64.const 0
             f64.const 1
             local.get $1
             local.get $1
             f64.const 1
             f64.gt
             select
             local.get $1
             f64.const 0
             f64.lt
             select
            else
             local.get $1
            end
            f64.store offset=24
           end
           br $break|2
          end
          local.get $0
          i32.load offset=16
          local.tee $6
          local.get $0
          i32.load offset=24
          local.tee $10
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          i32.const 1
          i32.and
          local.tee $9
          select
          local.tee $1
          local.get $6
          local.get $10
          i32.const 2
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $2
          f64.neg
          local.get $2
          local.get $9
          select
          local.tee $2
          local.get $6
          local.get $10
          i32.const 4
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $17
          f64.neg
          local.get $17
          local.get $9
          select
          local.tee $17
          call $src/wasm/sm2.as/mhypot
          local.tee $18
          f64.const 1
          local.get $18
          local.get $18
          f64.eq
          local.get $18
          f64.const 0
          f64.ne
          i32.and
          select
          local.set $18
          local.get $8
          i32.const 1
          i32.and
          if
           local.get $1
           local.get $18
           f64.div
           local.set $1
           local.get $3
           local.get $7
           if (result f64)
            f64.const 0
            f64.const 1
            local.get $1
            local.get $1
            f64.const 1
            f64.gt
            select
            local.get $1
            f64.const 0
            f64.lt
            select
           else
            local.get $1
           end
           f64.store
          end
          local.get $8
          i32.const 2
          i32.and
          if
           local.get $2
           local.get $18
           f64.div
           local.set $1
           local.get $3
           local.get $7
           if (result f64)
            f64.const 0
            f64.const 1
            local.get $1
            local.get $1
            f64.const 1
            f64.gt
            select
            local.get $1
            f64.const 0
            f64.lt
            select
           else
            local.get $1
           end
           f64.store offset=8
          end
          local.get $8
          i32.const 4
          i32.and
          if
           local.get $17
           local.get $18
           f64.div
           local.set $1
           local.get $3
           local.get $7
           if (result f64)
            f64.const 0
            f64.const 1
            local.get $1
            local.get $1
            f64.const 1
            f64.gt
            select
            local.get $1
            f64.const 0
            f64.lt
            select
           else
            local.get $1
           end
           f64.store offset=16
          end
          local.get $8
          i32.const 8
          i32.and
          if
           local.get $3
           f64.const 0
           f64.store offset=24
          end
          br $break|2
         end
         local.get $0
         i32.load offset=16
         local.set $6
         local.get $0
         i32.load offset=24
         local.set $10
         local.get $9
         i32.const 1
         i32.and
         local.set $9
         local.get $8
         i32.const 1
         i32.and
         if
          local.get $6
          local.get $10
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          call $src/wasm/sm2.as/mcos
          local.set $1
          local.get $3
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store
         end
         local.get $8
         i32.const 2
         i32.and
         if
          local.get $6
          local.get $10
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          call $src/wasm/sm2.as/msin
          local.set $1
          local.get $3
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store offset=8
         end
         local.get $8
         i32.const 4
         i32.and
         if
          local.get $6
          local.get $10
          i32.const 4
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          local.set $1
          local.get $3
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store offset=16
         end
         local.get $8
         i32.const 8
         i32.and
         if
          local.get $6
          local.get $10
          i32.const 6
          i32.shr_u
          i32.const 3
          i32.and
          i32.const 3
          i32.shl
          i32.add
          f64.load
          local.tee $1
          f64.neg
          local.get $1
          local.get $9
          select
          local.set $1
          local.get $3
          local.get $7
          if (result f64)
           f64.const 0
           f64.const 1
           local.get $1
           local.get $1
           f64.const 1
           f64.gt
           select
           local.get $1
           f64.const 0
           f64.lt
           select
          else
           local.get $1
          end
          f64.store offset=24
         end
         br $break|2
        end
        local.get $0
        i32.load offset=16
        local.tee $6
        local.get $0
        i32.load offset=24
        local.tee $10
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $9
        i32.const 1
        i32.and
        local.tee $9
        select
        local.set $1
        local.get $6
        local.get $10
        i32.const 2
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $2
        f64.neg
        local.get $2
        local.get $9
        select
        local.set $2
        local.get $0
        i32.load offset=68
        local.tee $6
        if
         global.get $src/wasm/sm2.as/tex1Set
         i32.const 0
         local.get $6
         i32.const 1
         i32.eq
         select
         if
          i32.const 1
          global.get $src/wasm/sm2.as/tex1Buf
          local.get $1
          local.get $2
          global.get $src/wasm/sm2.as/tex1W
          global.get $src/wasm/sm2.as/tex1H
          global.get $src/wasm/sm2.as/sampOutBuf
          call $src/wasm/sm2.as/sampleSlotN
         else
          global.get $src/wasm/sm2.as/tex2Set
          i32.const 0
          local.get $6
          i32.const 2
          i32.eq
          select
          if
           i32.const 2
           global.get $src/wasm/sm2.as/tex2Buf
           local.get $1
           local.get $2
           global.get $src/wasm/sm2.as/tex2W
           global.get $src/wasm/sm2.as/tex2H
           global.get $src/wasm/sm2.as/sampOutBuf
           call $src/wasm/sm2.as/sampleSlotN
          else
           local.get $8
           i32.const 1
           i32.and
           if
            local.get $3
            f64.const 0
            f64.store
           end
           local.get $8
           i32.const 2
           i32.and
           if
            local.get $3
            f64.const 0
            f64.store offset=8
           end
           local.get $8
           i32.const 4
           i32.and
           if
            local.get $3
            f64.const 0
            f64.store offset=16
           end
           local.get $8
           i32.const 8
           i32.and
           if
            local.get $3
            f64.const 1
            f64.store offset=24
           end
           br $break|2
          end
         end
        else
         global.get $src/wasm/sm2.as/texBuf
         global.get $src/wasm/sm2.as/runHasRect
         if (result f64)
          local.get $2
          global.get $src/wasm/sm2.as/runSheetH
          f64.mul
          global.get $src/wasm/sm2.as/runSY
          f64.sub
          global.get $src/wasm/sm2.as/texH
          f64.convert_i32_s
          f64.div
          local.set $2
          local.get $1
          global.get $src/wasm/sm2.as/runSheetW
          f64.mul
          global.get $src/wasm/sm2.as/runSX
          f64.sub
          global.get $src/wasm/sm2.as/texW
          f64.convert_i32_s
          f64.div
         else
          local.get $1
         end
         local.get $2
         global.get $src/wasm/sm2.as/texW
         global.get $src/wasm/sm2.as/texH
         i32.const 0
         global.get $src/wasm/sm2.as/sampOutBuf
         call $src/wasm/sm2.as/sampleBilinearBuf
        end
        local.get $8
        i32.const 1
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load
         local.set $1
         local.get $3
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store
        end
        local.get $8
        i32.const 2
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load offset=8
         local.set $1
         local.get $3
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store offset=8
        end
        local.get $8
        i32.const 4
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load offset=16
         local.set $1
         local.get $3
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store offset=16
        end
        local.get $8
        i32.const 8
        i32.and
        if
         global.get $src/wasm/sm2.as/sampOutBuf
         f64.load offset=24
         local.set $1
         local.get $3
         local.get $7
         if (result f64)
          f64.const 0
          f64.const 1
          local.get $1
          local.get $1
          f64.const 1
          f64.gt
          select
          local.get $1
          f64.const 0
          f64.lt
          select
         else
          local.get $1
         end
         f64.store offset=24
        end
        br $break|2
       end
       local.get $0
       i32.load offset=16
       local.set $6
       local.get $0
       i32.load offset=24
       local.set $10
       local.get $9
       i32.const 1
       i32.and
       local.set $11
       local.get $0
       i32.load offset=32
       local.set $12
       local.get $0
       i32.load offset=40
       local.set $13
       local.get $9
       i32.const 2
       i32.and
       i32.const 0
       i32.ne
       local.set $14
       local.get $0
       i32.load offset=48
       local.set $15
       local.get $0
       i32.load offset=56
       local.set $16
       local.get $9
       i32.const 4
       i32.and
       i32.const 0
       i32.ne
       local.set $9
       local.get $8
       i32.const 1
       i32.and
       if
        local.get $6
        local.get $10
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $3
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store
       end
       local.get $8
       i32.const 2
       i32.and
       if
        local.get $6
        local.get $10
        i32.const 2
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 2
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 2
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $3
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store offset=8
       end
       local.get $8
       i32.const 4
       i32.and
       if
        local.get $6
        local.get $10
        i32.const 4
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 4
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 4
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $3
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store offset=16
       end
       local.get $8
       i32.const 8
       i32.and
       if
        local.get $6
        local.get $10
        i32.const 6
        i32.shr_u
        i32.const 3
        i32.and
        i32.const 3
        i32.shl
        i32.add
        f64.load
        local.tee $1
        f64.neg
        local.get $1
        local.get $11
        select
        f64.const 0
        f64.ge
        if (result f64)
         local.get $12
         local.get $13
         i32.const 6
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $14
         select
        else
         local.get $15
         local.get $16
         i32.const 6
         i32.shr_u
         i32.const 3
         i32.and
         i32.const 3
         i32.shl
         i32.add
         f64.load
         local.tee $1
         f64.neg
         local.get $1
         local.get $9
         select
        end
        local.set $1
        local.get $3
        local.get $7
        if (result f64)
         f64.const 0
         f64.const 1
         local.get $1
         local.get $1
         f64.const 1
         f64.gt
         select
         local.get $1
         f64.const 0
         f64.lt
         select
        else
         local.get $1
        end
        f64.store offset=24
       end
       br $break|2
      end
      local.get $0
      i32.load offset=16
      local.tee $6
      local.get $0
      i32.load offset=24
      local.tee $10
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $9
      i32.const 1
      i32.and
      local.tee $11
      select
      local.get $0
      i32.load offset=32
      local.tee $12
      local.get $0
      i32.load offset=40
      local.tee $13
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $9
      i32.const 2
      i32.and
      i32.const 0
      i32.ne
      local.tee $14
      select
      f64.mul
      local.get $6
      local.get $10
      i32.const 2
      i32.shr_u
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $11
      select
      local.get $12
      local.get $13
      i32.const 2
      i32.shr_u
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $14
      select
      f64.mul
      f64.add
      local.get $0
      i32.load offset=48
      local.get $0
      i32.load offset=56
      i32.const 3
      i32.and
      i32.const 3
      i32.shl
      i32.add
      f64.load
      local.tee $1
      f64.neg
      local.get $1
      local.get $9
      i32.const 4
      i32.and
      select
      f64.add
      local.set $1
      local.get $8
      i32.const 1
      i32.and
      if
       local.get $3
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store
      end
      local.get $8
      i32.const 2
      i32.and
      if
       local.get $3
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store offset=8
      end
      local.get $8
      i32.const 4
      i32.and
      if
       local.get $3
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store offset=16
      end
      local.get $8
      i32.const 8
      i32.and
      if
       local.get $3
       local.get $7
       if (result f64)
        f64.const 0
        f64.const 1
        local.get $1
        local.get $1
        f64.const 1
        f64.gt
        select
        local.get $1
        f64.const 0
        f64.lt
        select
       else
        local.get $1
       end
       f64.store offset=24
      end
     end
    end
    local.get $4
    i32.const 1
    i32.add
    local.set $4
    local.get $0
    i32.const 96
    i32.add
    local.set $0
    br $for-loop|1
   end
  end
  i32.const 1
 )
)
