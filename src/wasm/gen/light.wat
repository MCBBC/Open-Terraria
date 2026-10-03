(module
 (type $0 (func (result i32)))
 (type $1 (func (param i32) (result i32)))
 (type $2 (func (param i32 i32 i32 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64 f64)))
 (type $3 (func (param i32 i32)))
 (type $4 (func (param i32 i32) (result i32)))
 (type $5 (func (param i32 i32 i64)))
 (type $6 (func (result i64)))
 (type $7 (func (param i32 i32 i32 f64 f64 f64 f64 f64 f64 f64 f64 f64) (result i32)))
 (global $src/wasm/light.as/rBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/gBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/bBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/maskBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/lutBuf (mut i32) (i32.const 0))
 (global $src/wasm/light.as/capCells (mut i32) (i32.const 0))
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
 (export "lightBlur" (func $src/wasm/light.as/lightBlur))
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
 (func $src/wasm/light.as/lightVersion (result i32)
  i32.const 1
 )
 (func $src/wasm/light.as/lightRBuf (result i32)
  global.get $src/wasm/light.as/rBuf
 )
 (func $src/wasm/light.as/lightMaskBuf (result i32)
  global.get $src/wasm/light.as/maskBuf
 )
 (func $src/wasm/light.as/lightLutBuf (result i32)
  global.get $src/wasm/light.as/lutBuf
 )
 (func $src/wasm/light.as/lightInit (param $0 i32) (result i32)
  (local $1 i32)
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
  global.set $src/wasm/light.as/capCells
  i32.const 1
 )
 (func $src/wasm/light.as/lightGBuf (result i32)
  global.get $src/wasm/light.as/gBuf
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
