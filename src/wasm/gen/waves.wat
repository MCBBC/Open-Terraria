(module
 (type $0 (func (result i32)))
 (type $1 (func (param i32) (result i32)))
 (type $2 (func (param i32 i32)))
 (type $3 (func (param i32 i32) (result i32)))
 (type $4 (func (param i32 i32 i64)))
 (type $5 (func (param i32 i32 i32 i32 f64) (result i32)))
 (type $6 (func (result i64)))
 (global $src/wasm/waves.as/rSrc (mut i32) (i32.const 0))
 (global $src/wasm/waves.as/gSrc (mut i32) (i32.const 0))
 (global $src/wasm/waves.as/rDst (mut i32) (i32.const 0))
 (global $src/wasm/waves.as/gDst (mut i32) (i32.const 0))
 (global $src/wasm/waves.as/capCells (mut i32) (i32.const 0))
 (global $~lib/rt/tlsf/ROOT (mut i32) (i32.const 0))
 (memory $0 0)
 (export "wavesVersion" (func $src/wasm/waves.as/wavesVersion))
 (export "wavesInit" (func $src/wasm/waves.as/wavesInit))
 (export "wavesRBuf" (func $src/wasm/waves.as/wavesRBuf))
 (export "wavesGBuf" (func $src/wasm/waves.as/wavesGBuf))
 (export "wavesR2Buf" (func $src/wasm/waves.as/wavesR2Buf))
 (export "wavesG2Buf" (func $src/wasm/waves.as/wavesG2Buf))
 (export "wavesCaps" (func $src/wasm/waves.as/wavesCaps))
 (export "wavesStep" (func $src/wasm/waves.as/wavesStep))
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
 (func $src/wasm/waves.as/wavesVersion (result i32)
  i32.const 1
 )
 (func $src/wasm/waves.as/wavesStep (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 f64) (result i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  (local $8 i32)
  (local $9 i32)
  (local $10 i32)
  (local $11 f64)
  (local $12 f64)
  (local $13 f64)
  (local $14 f64)
  (local $15 i32)
  (local $16 i32)
  (local $17 i32)
  (local $18 i32)
  (local $19 i32)
  (local $20 i32)
  (local $21 i32)
  global.get $src/wasm/waves.as/capCells
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
  i32.const 8192
  i32.gt_s
  i32.or
  local.get $1
  i32.const 8192
  i32.gt_s
  i32.or
  if
   i32.const 0
   return
  end
  global.get $src/wasm/waves.as/capCells
  local.get $0
  local.get $1
  i32.mul
  i32.lt_s
  if
   i32.const 0
   return
  end
  local.get $2
  i32.const -1048576
  i32.lt_s
  local.get $2
  i32.const 1048576
  i32.gt_s
  i32.or
  local.get $3
  i32.const -1048576
  i32.lt_s
  i32.or
  local.get $3
  i32.const 1048576
  i32.gt_s
  i32.or
  if
   i32.const 0
   return
  end
  local.get $2
  local.get $3
  i32.or
  i32.eqz
  if
   i32.const 0
   local.set $3
   loop $for-loop|0
    local.get $1
    local.get $3
    i32.gt_s
    if
     local.get $0
     local.get $3
     i32.mul
     local.set $5
     local.get $3
     i32.const 1
     i32.sub
     i32.const 0
     local.get $3
     i32.const 0
     i32.gt_s
     select
     local.get $0
     i32.mul
     local.set $6
     local.get $3
     i32.const 1
     i32.add
     local.get $1
     i32.const 1
     i32.sub
     local.tee $2
     local.get $2
     local.get $3
     i32.gt_s
     select
     local.get $0
     i32.mul
     local.set $7
     i32.const 0
     local.set $2
     loop $for-loop|1
      local.get $0
      local.get $2
      i32.gt_s
      if
       local.get $2
       local.get $5
       i32.add
       i32.const 2
       i32.shl
       local.tee $8
       global.get $src/wasm/waves.as/rSrc
       i32.add
       f32.load
       f64.promote_f32
       local.tee $11
       local.get $11
       f64.add
       f64.const -1
       f64.add
       local.set $11
       global.get $src/wasm/waves.as/rDst
       local.get $8
       i32.add
       f64.const 0
       f64.const 256
       local.get $11
       global.get $src/wasm/waves.as/rSrc
       local.get $2
       i32.const 1
       i32.sub
       i32.const 0
       local.get $2
       i32.const 0
       i32.gt_s
       select
       local.get $5
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       global.get $src/wasm/waves.as/rSrc
       local.get $2
       i32.const 1
       i32.add
       local.get $0
       i32.const 1
       i32.sub
       local.tee $9
       local.get $2
       local.get $9
       i32.lt_s
       select
       local.get $5
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       f64.add
       global.get $src/wasm/waves.as/rSrc
       local.get $2
       local.get $6
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       f64.add
       global.get $src/wasm/waves.as/rSrc
       local.get $2
       local.get $7
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       f64.add
       f64.const 0.25
       f64.mul
       local.get $11
       f64.sub
       f64.const 2
       f64.mul
       f64.add
       global.get $src/wasm/waves.as/gSrc
       local.get $8
       i32.add
       f32.load
       f64.promote_f32
       f64.const -0.5
       f64.add
       f64.const 3.3333333333333335
       f64.mul
       local.tee $12
       local.get $12
       f64.abs
       f64.mul
       f64.add
       local.get $4
       f64.mul
       local.tee $12
       f64.const 0.5
       f64.mul
       f64.const 0.5
       f64.add
       f64.const 512
       f64.mul
       local.tee $13
       f64.ceil
       local.tee $14
       local.get $14
       f64.const -1
       f64.add
       local.get $14
       f64.const -0.5
       f64.add
       local.get $13
       f64.le
       select
       local.tee $13
       f64.const 0
       f64.lt
       if (result f64)
        f64.const 0
       else
        f64.const 1
        local.get $13
        f64.const 0.001953125
        f64.mul
        local.get $13
        f64.const 512
        f64.gt
        select
       end
       f64.const 256
       f64.mul
       local.tee $13
       f64.ceil
       local.tee $14
       local.get $14
       f64.const -1
       f64.add
       local.get $14
       f64.const -0.5
       f64.add
       local.get $13
       f64.le
       select
       local.tee $13
       local.get $13
       f64.const 256
       f64.gt
       select
       local.get $13
       f64.const 0
       f64.le
       select
       f64.const 0.00390625
       f64.mul
       f32.demote_f64
       f32.store
       global.get $src/wasm/waves.as/gDst
       local.get $8
       i32.add
       f64.const 0
       f64.const 256
       f64.const 1
       f64.const -1
       local.get $12
       local.get $11
       f64.sub
       local.tee $11
       local.get $11
       f64.const 0
       f64.lt
       select
       local.get $11
       f64.const 0
       f64.gt
       select
       f64.const 0.3
       f64.mul
       local.get $11
       f64.abs
       f64.sqrt
       f64.mul
       f64.const 0.5
       f64.add
       f64.const 256
       f64.mul
       local.tee $11
       f64.ceil
       local.tee $12
       local.get $12
       f64.const -1
       f64.add
       local.get $12
       f64.const -0.5
       f64.add
       local.get $11
       f64.le
       select
       local.tee $11
       local.get $11
       f64.const 256
       f64.gt
       select
       local.get $11
       f64.const 0
       f64.lt
       select
       f64.const 0.00390625
       f64.mul
       f32.demote_f64
       f32.store
       local.get $2
       i32.const 1
       i32.add
       local.set $2
       br $for-loop|1
      end
     end
     local.get $3
     i32.const 1
     i32.add
     local.set $3
     br $for-loop|0
    end
   end
   i32.const 1
   return
  end
  loop $for-loop|2
   local.get $1
   local.get $6
   i32.gt_s
   if
    local.get $1
    i32.const 1
    i32.sub
    local.tee $5
    local.get $6
    local.get $3
    i32.sub
    local.tee $8
    i32.const 0
    local.get $8
    i32.const 0
    i32.ge_s
    local.tee $9
    select
    local.tee $7
    local.get $5
    local.get $7
    i32.lt_s
    select
    local.get $0
    i32.mul
    local.set $15
    local.get $5
    local.get $8
    i32.const 1
    i32.sub
    local.tee $7
    i32.const 0
    local.get $7
    i32.const 0
    i32.ge_s
    select
    local.tee $7
    local.get $5
    local.get $7
    i32.lt_s
    select
    local.get $0
    i32.mul
    local.set $16
    local.get $5
    local.get $8
    i32.const 1
    i32.add
    local.tee $7
    i32.const 0
    local.get $7
    i32.const 0
    i32.ge_s
    select
    local.tee $7
    local.get $5
    local.get $7
    i32.lt_s
    select
    local.get $0
    i32.mul
    local.set $17
    local.get $0
    local.get $6
    i32.mul
    local.set $7
    local.get $9
    local.get $1
    local.get $8
    i32.gt_s
    i32.and
    local.set $18
    i32.const 0
    local.set $5
    loop $for-loop|3
     local.get $0
     local.get $5
     i32.gt_s
     if
      local.get $5
      local.get $7
      i32.add
      i32.const 2
      i32.shl
      local.set $8
      block $for-continue|3
       local.get $18
       i32.eqz
       local.get $5
       local.get $2
       i32.sub
       local.tee $19
       i32.const 0
       i32.lt_s
       i32.or
       local.get $0
       local.get $19
       i32.le_s
       i32.or
       if
        global.get $src/wasm/waves.as/rDst
        local.get $8
        i32.add
        f32.const 0.5
        f32.store
        global.get $src/wasm/waves.as/gDst
        local.get $8
        i32.add
        f32.const 0.5
        f32.store
        br $for-continue|3
       end
       global.get $src/wasm/waves.as/rDst
       local.get $8
       i32.add
       f64.const 0
       f64.const 256
       local.get $0
       i32.const 1
       i32.sub
       local.tee $9
       local.get $19
       i32.const 0
       local.get $19
       i32.const 0
       i32.ge_s
       select
       local.tee $10
       local.get $9
       local.get $10
       i32.lt_s
       select
       local.tee $10
       local.get $15
       i32.add
       i32.const 2
       i32.shl
       local.tee $20
       global.get $src/wasm/waves.as/rSrc
       i32.add
       f32.load
       f64.promote_f32
       local.tee $11
       local.get $11
       f64.add
       f64.const -1
       f64.add
       local.tee $11
       global.get $src/wasm/waves.as/rSrc
       local.get $9
       local.get $19
       i32.const 1
       i32.sub
       local.tee $21
       i32.const 0
       local.get $21
       i32.const 0
       i32.ge_s
       select
       local.tee $21
       local.get $9
       local.get $21
       i32.lt_s
       select
       local.get $15
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       global.get $src/wasm/waves.as/rSrc
       local.get $9
       local.get $19
       i32.const 1
       i32.add
       local.tee $19
       i32.const 0
       local.get $19
       i32.const 0
       i32.ge_s
       select
       local.tee $19
       local.get $9
       local.get $19
       i32.lt_s
       select
       local.get $15
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       f64.add
       global.get $src/wasm/waves.as/rSrc
       local.get $10
       local.get $16
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       f64.add
       global.get $src/wasm/waves.as/rSrc
       local.get $10
       local.get $17
       i32.add
       i32.const 2
       i32.shl
       i32.add
       f32.load
       f64.promote_f32
       f64.const 2
       f64.mul
       f64.const -1
       f64.add
       f64.add
       f64.const 0.25
       f64.mul
       local.get $11
       f64.sub
       f64.const 2
       f64.mul
       f64.add
       local.get $20
       global.get $src/wasm/waves.as/gSrc
       i32.add
       f32.load
       f64.promote_f32
       f64.const -0.5
       f64.add
       f64.const 3.3333333333333335
       f64.mul
       local.tee $12
       local.get $12
       f64.abs
       f64.mul
       f64.add
       local.get $4
       f64.mul
       local.tee $12
       f64.const 0.5
       f64.mul
       f64.const 0.5
       f64.add
       f64.const 512
       f64.mul
       local.tee $13
       f64.ceil
       local.tee $14
       local.get $14
       f64.const -1
       f64.add
       local.get $14
       f64.const -0.5
       f64.add
       local.get $13
       f64.le
       select
       local.tee $13
       f64.const 0
       f64.lt
       if (result f64)
        f64.const 0
       else
        f64.const 1
        local.get $13
        f64.const 0.001953125
        f64.mul
        local.get $13
        f64.const 512
        f64.gt
        select
       end
       f64.const 256
       f64.mul
       local.tee $13
       f64.ceil
       local.tee $14
       local.get $14
       f64.const -1
       f64.add
       local.get $14
       f64.const -0.5
       f64.add
       local.get $13
       f64.le
       select
       local.tee $13
       local.get $13
       f64.const 256
       f64.gt
       select
       local.get $13
       f64.const 0
       f64.le
       select
       f64.const 0.00390625
       f64.mul
       f32.demote_f64
       f32.store
       global.get $src/wasm/waves.as/gDst
       local.get $8
       i32.add
       f64.const 0
       f64.const 256
       f64.const 1
       f64.const -1
       local.get $12
       local.get $11
       f64.sub
       local.tee $11
       local.get $11
       f64.const 0
       f64.lt
       select
       local.get $11
       f64.const 0
       f64.gt
       select
       f64.const 0.3
       f64.mul
       local.get $11
       f64.abs
       f64.sqrt
       f64.mul
       f64.const 0.5
       f64.add
       f64.const 256
       f64.mul
       local.tee $11
       f64.ceil
       local.tee $12
       local.get $12
       f64.const -1
       f64.add
       local.get $12
       f64.const -0.5
       f64.add
       local.get $11
       f64.le
       select
       local.tee $11
       local.get $11
       f64.const 256
       f64.gt
       select
       local.get $11
       f64.const 0
       f64.lt
       select
       f64.const 0.00390625
       f64.mul
       f32.demote_f64
       f32.store
      end
      local.get $5
      i32.const 1
      i32.add
      local.set $5
      br $for-loop|3
     end
    end
    local.get $6
    i32.const 1
    i32.add
    local.set $6
    br $for-loop|2
   end
  end
  i32.const 1
 )
 (func $src/wasm/waves.as/wavesRBuf (result i32)
  global.get $src/wasm/waves.as/rSrc
 )
 (func $src/wasm/waves.as/wavesR2Buf (result i32)
  global.get $src/wasm/waves.as/rDst
 )
 (func $src/wasm/waves.as/wavesInit (param $0 i32) (result i32)
  (local $1 i32)
  global.get $src/wasm/waves.as/capCells
  if
   i32.const 1
   return
  end
  local.get $0
  i32.const 0
  i32.le_s
  local.get $0
  i32.const 4194304
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
  global.set $src/wasm/waves.as/rSrc
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/waves.as/gSrc
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/waves.as/rDst
  local.get $1
  call $~lib/memory/heap.alloc
  global.set $src/wasm/waves.as/gDst
  local.get $0
  global.set $src/wasm/waves.as/capCells
  i32.const 1
 )
 (func $src/wasm/waves.as/wavesGBuf (result i32)
  global.get $src/wasm/waves.as/gSrc
 )
 (func $src/wasm/waves.as/wavesG2Buf (result i32)
  global.get $src/wasm/waves.as/gDst
 )
 (func $src/wasm/waves.as/wavesCaps (result i64)
  global.get $src/wasm/waves.as/capCells
  i64.extend_i32_s
 )
)
