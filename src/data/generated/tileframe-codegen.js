// framing-gen.js — 由 gen-codegen.mjs 从 tileframe-program.json 机械生成;勿手改
'use strict';
function makeFrame(TR) {
  const OUT = [0, 0];
  const TE = (t, v, s) => { if (TR !== undefined) { TR.push(t + '=' + String(v) + '|' + s); } return v; }
  return function frame(MF, S, SETREF, TM, LOC, PRED, DRV, i, j, num0, num60, _VR_, rl, _SLP_, _HLF_, TU, TD, TL, TR, TUL, TUR, TDL, TDR) {
    let up=-1,down=-1,left=-1,right=-1,upLeft=-1,upRight=-1,downLeft=-1,downRight=-1;
    let OLDFX=0, OLDFY=0, num11=0, FLAG=false, resetFrame=true, frameX=0, frameY=0;
    let num = num0;
    let num6 = num60;
    let rectInit; // 解释器动态属性缺省 undefined(未播种),let 缺省初值一致
    let VNUM = () => (((i * 7) + (j * 11)) % 3);
    let num2, num3, flag, flag2, flag3, num4, num5, flag4, flag5, flag6, num7, num9, num10, mergesWithDirtInASpecialWay, flag7, num12, flag8, flag9, flag10, flag11, num13, num14, num15, num16, num17, flag12, num18, flag13, num19, num20, num21, num22, num23;
    let _rx = -1, _ry = -1;
    const _SNP_ = () => [i, j, up, down, left, right, upLeft, upRight, downLeft, downRight, num, num11, num6, OLDFX, OLDFY, FLAG, resetFrame, frameX, frameY, rectInit, num12, mergesWithDirtInASpecialWay, MF.up, MF.down, MF.left, MF.right].map((x) => x === undefined ? "~" : String(x)).join(";");
    if ((S.tileStone(num))) {
     num = (1);
    }
    frameX = OLDFX;
    frameY = OLDFY;
    rectInit = null;
    upLeft = -(1);
    up = -(1);
    upRight = -(1);
    left = -(1);
    right = -(1);
    downLeft = -(1);
    down = -(1);
    downRight = -(1);
    if ((TL.bare!=null&&TL.act())) {
     left = (S.tileStone(TL.type)?(1):TL.type);
     if ((TL.slope()==(1)||TL.slope()==(3))) {
      left = -(1);
     }
    }
    if ((TR.bare!=null&&TR.act())) {
     right = (S.tileStone(TR.type)?(1):TR.type);
     if ((TR.slope()==(2)||TR.slope()==(4))) {
      right = -(1);
     }
    }
    if ((TU.bare!=null&&TU.act())) {
     up = (S.tileStone(TU.type)?(1):TU.type);
     if ((TU.slope()==(3)||TU.slope()==(4))) {
      up = -(1);
     }
    }
    if ((TD.bare!=null&&TD.act())) {
     down = (S.tileStone(TD.type)?(1):TD.type);
     if ((TD.slope()==(1)||TD.slope()==(2))) {
      down = -(1);
     }
    }
    if ((TUL.bare!=null&&TUL.act())) {
     upLeft = (S.tileStone(TUL.type)?(1):TUL.type);
    }
    if ((TUR.bare!=null&&TUR.act())) {
     upRight = (S.tileStone(TUR.type)?(1):TUR.type);
    }
    if ((TDL.bare!=null&&TDL.act())) {
     downLeft = (S.tileStone(TDL.type)?(1):TDL.type);
    }
    if ((TDR.bare!=null&&TDR.act())) {
     downRight = (S.tileStone(TDR.type)?(1):TDR.type);
    }
    if ((_SLP_==(2))) {
     up = -(1);
     left = -(1);
    }
    if ((_SLP_==(1))) {
     up = -(1);
     right = -(1);
    }
    if ((_SLP_==(4))) {
     down = -(1);
     left = -(1);
    }
    if ((_SLP_==(3))) {
     down = -(1);
     right = -(1);
    }
    if ((num==(668))) {
     num = (0);
    }
    if ((num==(697))) {
     num = (51);
    }
    {
     const _10000=((0));
     const _10001=S["Dirt"];
     { const _c=up; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10000; } }
     { const _c=down; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10000; } }
     { const _c=left; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10000; } }
     { const _c=right; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10000; } }
     { const _c=upLeft; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10000; } }
     { const _c=upRight; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10000; } }
     { const _c=downLeft; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10000; } }
     { const _c=downRight; if ((_10001!==null?(_c>-1&&_10001(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10000; } }
    }
    switch (num) {
    case 147: {
      {
       const _10002=(num);
       const _10003=S["tileBrick"];
       const _10004=S["DontMergeWithSnow"];
       { const _c=up; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10002; } }
       { const _c=down; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10002; } }
       { const _c=left; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10002; } }
       { const _c=right; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10002; } }
       { const _c=upLeft; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10002; } }
       { const _c=upRight; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10002; } }
       { const _c=downLeft; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10002; } }
       { const _c=downRight; if ((_10003!==null?(_c>-1&&_10003(_c)):(_c===null)) && !( (_10004)!==null&&_c>-1&&_10004(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10002; } }
      }
      ; /* break @L82798(解释器同序:顺序结构下无操作) */
    } break;
    case 161: {
    } break;
    case 162: {
      {
       const _10005=(num);
       const _10006=S["tileBrick"];
       const _10007=S["IcesSnow"];
       { const _c=up; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10005; } }
       { const _c=down; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10005; } }
       { const _c=left; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10005; } }
       { const _c=right; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10005; } }
       { const _c=upLeft; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10005; } }
       { const _c=upRight; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10005; } }
       { const _c=downLeft; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10005; } }
       { const _c=downRight; if ((_10006!==null?(_c>-1&&_10006(_c)):(_c===null)) && !( (_10007)!==null&&_c>-1&&_10007(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10005; } }
      }
      ; /* break @L82807(解释器同序:顺序结构下无操作) */
    } break;
    case 163: {
    } break;
    case 164: {
    } break;
    case 200: {
      {
       const _10008=(num);
       const _10009=S["tileBrick"];
       const _10010=S["Snow"];
       { const _c=up; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10008; } }
       { const _c=down; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10008; } }
       { const _c=left; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10008; } }
       { const _c=right; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10008; } }
       { const _c=upLeft; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10008; } }
       { const _c=upRight; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10008; } }
       { const _c=downLeft; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10008; } }
       { const _c=downRight; if ((_10009!==null?(_c>-1&&_10009(_c)):(_c===null)) && !( (_10010)!==null&&_c>-1&&_10010(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10008; } }
      }
      ; /* break @L82804(解释器同序:顺序结构下无操作) */
    } break;
    case 738: {
      {
       const _10011=(num);
       const _10012=S["tileBrick"];
       const _10013=S["Snow"];
       { const _c=up; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10011; } }
       { const _c=down; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10011; } }
       { const _c=left; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10011; } }
       { const _c=right; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10011; } }
       { const _c=upLeft; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10011; } }
       { const _c=upRight; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10011; } }
       { const _c=downLeft; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10011; } }
       { const _c=downRight; if ((_10012!==null?(_c>-1&&_10012(_c)):(_c===null)) && !( (_10013)!==null&&_c>-1&&_10013(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10011; } }
      }
      ; /* break @L82810(解释器同序:顺序结构下无操作) */
    } break;
    case 747: {
      {
       const _10014=(num);
       const _10015=S["tileBrick"];
       const _10016=((53));
       { const _c=up; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { up=_10014; } }
       { const _c=down; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { down=_10014; } }
       { const _c=left; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { left=_10014; } }
       { const _c=right; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { right=_10014; } }
       { const _c=upLeft; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { upLeft=_10014; } }
       { const _c=upRight; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { upRight=_10014; } }
       { const _c=downLeft; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { downLeft=_10014; } }
       { const _c=downRight; if ((_10015!==null?(_c>-1&&_10015(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (_10016)!==null&&_c===(_10016) ) ) { downRight=_10014; } }
      }
      ; /* break @L82813(解释器同序:顺序结构下无操作) */
    } break;
    default: {
      if ((S.tileBrick(num))) {
       switch (num) {
       case 60: {
       } break;
       case 70: {
       } break;
       case 633: {
         {
          const _10017=(num);
          const _10018=S["tileBrick"];
          const _10019=S["Ash"];
          { const _c=up; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10017; } }
          { const _c=down; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10017; } }
          { const _c=left; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10017; } }
          { const _c=right; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10017; } }
          { const _c=upLeft; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10017; } }
          { const _c=upRight; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10017; } }
          { const _c=downLeft; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10017; } }
          { const _c=downRight; if ((_10018!==null?(_c>-1&&_10018(_c)):(_c===null)) && !( (_10019)!==null&&_c>-1&&_10019(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10017; } }
         }
         ; /* break @L82827(解释器同序:顺序结构下无操作) */
       } break;
       case 661: {
       } break;
       case 662: {
         {
          const _10020=(num);
          const _10021=S["tileBrick"];
          const _10022=S["Mud"];
          { const _c=up; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10020; } }
          { const _c=down; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10020; } }
          { const _c=left; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10020; } }
          { const _c=right; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10020; } }
          { const _c=upLeft; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10020; } }
          { const _c=upRight; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10020; } }
          { const _c=downLeft; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10020; } }
          { const _c=downRight; if ((_10021!==null?(_c>-1&&_10021(_c)):(_c===null)) && !( (_10022)!==null&&_c>-1&&_10022(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10020; } }
         }
         ; /* break @L82824(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         {
          const _10023=(num);
          const _10024=S["tileBrick"];
          { const _c=up; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10023; } }
          { const _c=down; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10023; } }
          { const _c=left; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10023; } }
          { const _c=right; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10023; } }
          { const _c=upLeft; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10023; } }
          { const _c=upRight; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10023; } }
          { const _c=downLeft; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10023; } }
          { const _c=downRight; if ((_10024!==null?(_c>-1&&_10024(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10023; } }
         }
         ; /* break @L82830(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       if ((S.tilePile(num))) {
        {
         const _10025=(num);
         const _10026=S["tilePile"];
         { const _c=up; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10025; } }
         { const _c=down; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10025; } }
         { const _c=left; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10025; } }
         { const _c=right; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10025; } }
         { const _c=upLeft; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10025; } }
         { const _c=upRight; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10025; } }
         { const _c=downLeft; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10025; } }
         { const _c=downRight; if ((_10026!==null?(_c>-1&&_10026(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10025; } }
        }
       }
      }
      ; /* break @L82837(解释器同序:顺序结构下无操作) */
    }
    }
    num2 = TD.fy??(-(1));
    num3 = TU.fy??(-(1));
    flag = false;
    switch (num) {
    case 1: {
    } break;
    case 25: {
    } break;
    case 117: {
    } break;
    case 147: {
    } break;
    case 161: {
    } break;
    case 163: {
    } break;
    case 164: {
    } break;
    case 200: {
    } break;
    case 203: {
    } break;
    case 225: {
      flag = true;
      ; /* break @L82858(解释器同序:顺序结构下无操作) */
    } break;
    default: {
      flag = false;
      ; /* break @L82846(解释器同序:顺序结构下无操作) */
    }
    }
    if ((S.tileMoss(num))) {
     flag = true;
    }
    flag2 = num2==(0)||num2==(72);
    flag3 = num3==(54)||num3==(90);
    if (((down==(165))&flag&flag2)) {
     down = num;
    }
    if (((up==(165))&flag&flag3)) {
     up = num;
    }
    num4 = TD.fy??(-(1));
    num5 = TU.fy??(-(1));
    flag4 = false;
    switch (num) {
    case 1: {
    } break;
    case 25: {
    } break;
    case 117: {
    } break;
    case 147: {
    } break;
    case 161: {
    } break;
    case 163: {
    } break;
    case 164: {
    } break;
    case 200: {
    } break;
    case 203: {
    } break;
    case 225: {
      flag4 = true;
      ; /* break @L82893(解释器同序:顺序结构下无操作) */
    } break;
    default: {
      flag4 = false;
      ; /* break @L82881(解释器同序:顺序结构下无操作) */
    }
    }
    if ((S.tileMoss(num))) {
     flag4 = true;
    }
    flag5 = num4==(0);
    flag6 = ((up==(693))?(num5>=(18)):(num5>=(36)));
    if (((down==(693)||down==(694))&flag4&flag5)) {
     down = num;
    }
    if (((up==(693)||up==(694))&flag4&flag6)) {
     up = num;
    }
    if (((_SLP_==(1)||_SLP_==(2))&&down>-(1)&&!S["Platforms"](down))) {
     down = num;
    }
    if ((up>-(1)&&TU.bare!=null&&(TU.slope()==(1)||TU.slope()==(2))&&!S["Platforms"](up))) {
     up = num;
    }
    if (((_SLP_==(3)||_SLP_==(4))&&up>-(1)&&!S["Platforms"](up))) {
     up = num;
    }
    if ((down>-(1)&&TD.bare!=null&&(TD.slope()==(3)||TD.slope()==(4))&&!S["Platforms"](down))) {
     down = num;
    }
    if ((num==(124))) {
     if ((up>-(1)&&S.tileSolid(up)&&!S["Platforms"](up))) {
      up = num;
     }
     if ((down>-(1)&&S.tileSolid(down)&&!S["Platforms"](down))) {
      down = num;
     }
    }
    if ((up>-(1)&&TU.bare!=null&&TU.half()&&!S["Platforms"](up))) {
     up = num;
    }
    if ((left>-(1)&&TL.bare!=null&&TL.half())) {
     if ((_HLF_)) {
      left = num;
     } else {
      if ((TL.type!=num)) {
       left = -(1);
      }
     }
    }
    if ((right>-(1)&&TR.bare!=null&&TR.half())) {
     if ((_HLF_)) {
      right = num;
     } else {
      if ((TR.type!=num)) {
       right = -(1);
      }
     }
    }
    if ((_HLF_)) {
     if ((left!=num)) {
      left = -(1);
     }
     if ((right!=num)) {
      right = -(1);
     }
     up = -(1);
    }
    if ((TD.bare!=null&&TD.half())) {
     down = -(1);
    }
    MF.up = false;
    MF.down = false;
    MF.left = false;
    MF.right = false;
    num6 = (0);
    if ((resetFrame)) {
     num6 = (_VR_);
     VNUM = (num6);
    } else {
     num6 = VNUM();
    }
    if ((S.tileLargeFrames(num)==(1))) {
     num7 = j%(4);
    }
    if ((S.tileLargeFrames(num)==(2))) {
     num9 = i%(2);
     num10 = j%(2);
     num6 = num9+num10*(2);
    }
    if ((!S.tileRope(num)&&S["BlockMergesWithMergeAllBlock"](num))) {
     {
      const _10027=(num);
      const _10028=S["tileBlendAll"];
      { const _c=up; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10027; } }
      { const _c=down; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10027; } }
      { const _c=left; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10027; } }
      { const _c=right; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10027; } }
      { const _c=upLeft; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10027; } }
      { const _c=upRight; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10027; } }
      { const _c=downLeft; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10027; } }
      { const _c=downRight; if ((_10028!==null?(_c>-1&&_10028(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10027; } }
     }
    }
    if ((S.tileBlendAll(num))) {
     {
      const _10029=(num);
      const _10030=S["BlockMergesWithMergeAllBlock"];
      { const _c=up; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10029; } }
      { const _c=down; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10029; } }
      { const _c=left; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10029; } }
      { const _c=right; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10029; } }
      { const _c=upLeft; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10029; } }
      { const _c=upRight; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10029; } }
      { const _c=downLeft; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10029; } }
      { const _c=downRight; if ((_10030!==null?(_c>-1&&_10030(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10029; } }
     }
    }
    if ((S["ForcedDirtMerging"](num))) {
     {
      const _10031=(num);
      const _10032=S["Dirt"];
      { const _c=up; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10031; } }
      { const _c=down; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10031; } }
      { const _c=left; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10031; } }
      { const _c=right; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10031; } }
      { const _c=upLeft; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10031; } }
      { const _c=upRight; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10031; } }
      { const _c=downLeft; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10031; } }
      { const _c=downRight; if ((_10032!==null?(_c>-1&&_10032(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10031; } }
     }
    }
    if ((S["Dirt"](num))) {
     if ((up>-(1)&&S.tileMergeDirt(up))) {
      DRV.tf((i)-i,(j-(1))-j);
      if ((MF.down)) {
       up = num;
      }
     } else {
      if ((up==(147))) {
       DRV.tf((i)-i,(j-(1))-j);
       if ((MF.down)) {
        up = num;
       }
      }
     }
     if ((down>-(1)&&S.tileMergeDirt(down))) {
      DRV.tf((i)-i,(j+(1))-j);
      if ((MF.up)) {
       down = num;
      }
     } else {
      if ((down==(147))) {
       DRV.tf((i)-i,(j+(1))-j);
       if ((MF.up)) {
        down = num;
       }
      }
     }
     if ((left>-(1)&&S.tileMergeDirt(left))) {
      DRV.tf((i-(1))-i,(j)-j);
      if ((MF.right)) {
       left = num;
      }
     } else {
      if ((left==(147))) {
       DRV.tf((i-(1))-i,(j)-j);
       if ((MF.right)) {
        left = num;
       }
      }
     }
     if ((right>-(1)&&S.tileMergeDirt(right))) {
      DRV.tf((i+(1))-i,(j)-j);
      if ((MF.left)) {
       right = num;
      }
     } else {
      if ((right==(147))) {
       DRV.tf((i+(1))-i,(j)-j);
       if ((MF.left)) {
        right = num;
       }
      }
     }
     mergesWithDirtInASpecialWay = SETREF["Conversion.MergesWithDirtInASpecialWay"];
     if ((up>-(1)&&LOC.mergesWithDirtInASpecialWay(up))) {
      up = num;
     }
     if ((down>-(1)&&LOC.mergesWithDirtInASpecialWay(down))) {
      down = num;
     }
     if ((left>-(1)&&LOC.mergesWithDirtInASpecialWay(left))) {
      left = num;
     }
     if ((right>-(1)&&LOC.mergesWithDirtInASpecialWay(right))) {
      right = num;
     }
     if ((upLeft>-(1)&&S.tileMergeDirt(upLeft))) {
      upLeft = num;
     } else {
      if ((upLeft>-(1)&&LOC.mergesWithDirtInASpecialWay(upLeft))) {
       upLeft = num;
      }
     }
     if ((upRight>-(1)&&S.tileMergeDirt(upRight))) {
      upRight = num;
     } else {
      if ((upRight>-(1)&&LOC.mergesWithDirtInASpecialWay(upRight))) {
       upRight = num;
      }
     }
     if ((downLeft>-(1)&&S.tileMergeDirt(downLeft))) {
      downLeft = num;
     } else {
      if ((downLeft>-(1)&&LOC.mergesWithDirtInASpecialWay(downLeft))) {
       downLeft = num;
      }
     }
     if ((downRight>-(1)&&S.tileMergeDirt(downRight))) {
      downRight = num;
     } else {
      if ((downRight>-(1)&&LOC.mergesWithDirtInASpecialWay(downRight))) {
       downRight = num;
      }
     }
     {
      const _10033=((0));
      const _10034=S["Dirt"];
      { const _c=up; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10033; } }
      { const _c=down; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10033; } }
      { const _c=left; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10033; } }
      { const _c=right; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10033; } }
      { const _c=upLeft; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10033; } }
      { const _c=upRight; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10033; } }
      { const _c=downLeft; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10033; } }
      { const _c=downRight; if ((_10034!==null?(_c>-1&&_10034(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10033; } }
     }
     {
      const _10035=(-(2));
      const _10036=S["Mud"];
      { const _c=up; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10035; } }
      { const _c=down; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10035; } }
      { const _c=left; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10035; } }
      { const _c=right; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10035; } }
      { const _c=upLeft; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10035; } }
      { const _c=upRight; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10035; } }
      { const _c=downLeft; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10035; } }
      { const _c=downRight; if ((_10036!==null?(_c>-1&&_10036(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10035; } }
     }
     {
      const _10037=((0));
      const _10038=((191));
      { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10037; } }
      { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10037; } }
      { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10037; } }
      { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10037; } }
      { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10037; } }
      { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10037; } }
      { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10037; } }
      { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10038)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10037; } }
     }
     if ((up>-(1)&&S["ForcedDirtMerging"](up))) {
      up = num;
     }
     if ((down>-(1)&&S["ForcedDirtMerging"](down))) {
      down = num;
     }
     if ((left>-(1)&&S["ForcedDirtMerging"](left))) {
      left = num;
     }
     if ((right>-(1)&&S["ForcedDirtMerging"](right))) {
      right = num;
     }
     if ((upLeft>-(1)&&S["ForcedDirtMerging"](upLeft))) {
      upLeft = num;
     }
     if ((upRight>-(1)&&S["ForcedDirtMerging"](upRight))) {
      upRight = num;
     }
     if ((downLeft>-(1)&&S["ForcedDirtMerging"](downLeft))) {
      downLeft = num;
     }
     if ((downRight>-(1)&&S["ForcedDirtMerging"](downRight))) {
      downRight = num;
     }
    } else {
     if ((S.tileRope(num))) {
      if ((num!=(504)&&up!=num&&PRED.IsRope(i,j-(1)))) {
       up = num;
      }
      if ((down!=num&&(PRED.IsRope(i,j+(1))||down==(698)))) {
       down = num;
      }
      if ((num!=(504)&&up>-(1)&&S.tileSolid(up)&&!S.tileSolidTop(up))) {
       up = num;
      }
      if ((down>-(1)&&S.tileSolid(down))) {
       down = num;
      }
      if ((num!=(504)&&up!=num)) {
       if ((left>-(1)&&S.tileSolid(left))) {
        left = num;
       }
       if ((right>-(1)&&S.tileSolid(right))) {
        right = num;
       }
      }
      if ((up==-(1))) {
       DRV.tf((i)-i,(j-(1))-j);
      }
      if ((down==-(1))) {
       DRV.tf((i)-i,(j+(1))-j);
      }
     } else {
      switch (num) {
      case 53: {
        {
         const _10039=(num);
         const _10040=((397));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { DRV.tf(0,-1); if (MF.down) { up=_10039; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { DRV.tf(0,1); if (MF.up) { down=_10039; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { DRV.tf(-1,0); if (MF.right) { left=_10039; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { DRV.tf(1,0); if (MF.left) { right=_10039; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { upLeft=_10039; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { upRight=_10039; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { downLeft=_10039; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10040))) { downRight=_10039; } }
        }
        {
         const _10041=(num);
         const _10042=((396));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { DRV.tf(0,-1); if (MF.down) { up=_10041; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { DRV.tf(0,1); if (MF.up) { down=_10041; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { DRV.tf(-1,0); if (MF.right) { left=_10041; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { DRV.tf(1,0); if (MF.left) { right=_10041; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { upLeft=_10041; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { upRight=_10041; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { downLeft=_10041; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10042))) { downRight=_10041; } }
        }
        ; /* break @L83218(解释器同序:顺序结构下无操作) */
      } break;
      case 112: {
        {
         const _10043=(num);
         const _10044=((398));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { DRV.tf(0,-1); if (MF.down) { up=_10043; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { DRV.tf(0,1); if (MF.up) { down=_10043; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { DRV.tf(-1,0); if (MF.right) { left=_10043; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { DRV.tf(1,0); if (MF.left) { right=_10043; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { upLeft=_10043; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { upRight=_10043; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { downLeft=_10043; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10044))) { downRight=_10043; } }
        }
        {
         const _10045=(num);
         const _10046=((400));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { DRV.tf(0,-1); if (MF.down) { up=_10045; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { DRV.tf(0,1); if (MF.up) { down=_10045; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { DRV.tf(-1,0); if (MF.right) { left=_10045; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { DRV.tf(1,0); if (MF.left) { right=_10045; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { upLeft=_10045; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { upRight=_10045; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { downLeft=_10045; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10046))) { downRight=_10045; } }
        }
        ; /* break @L83226(解释器同序:顺序结构下无操作) */
      } break;
      case 116: {
        {
         const _10047=(num);
         const _10048=((402));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { DRV.tf(0,-1); if (MF.down) { up=_10047; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { DRV.tf(0,1); if (MF.up) { down=_10047; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { DRV.tf(-1,0); if (MF.right) { left=_10047; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { DRV.tf(1,0); if (MF.left) { right=_10047; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { upLeft=_10047; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { upRight=_10047; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { downLeft=_10047; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10048))) { downRight=_10047; } }
        }
        {
         const _10049=(num);
         const _10050=((403));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { DRV.tf(0,-1); if (MF.down) { up=_10049; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { DRV.tf(0,1); if (MF.up) { down=_10049; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { DRV.tf(-1,0); if (MF.right) { left=_10049; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { DRV.tf(1,0); if (MF.left) { right=_10049; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { upLeft=_10049; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { upRight=_10049; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { downLeft=_10049; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10050))) { downRight=_10049; } }
        }
        ; /* break @L83230(解释器同序:顺序结构下无操作) */
      } break;
      case 234: {
        {
         const _10051=(num);
         const _10052=((399));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { DRV.tf(0,-1); if (MF.down) { up=_10051; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { DRV.tf(0,1); if (MF.up) { down=_10051; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { DRV.tf(-1,0); if (MF.right) { left=_10051; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { DRV.tf(1,0); if (MF.left) { right=_10051; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { upLeft=_10051; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { upRight=_10051; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { downLeft=_10051; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10052))) { downRight=_10051; } }
        }
        {
         const _10053=(num);
         const _10054=((401));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { DRV.tf(0,-1); if (MF.down) { up=_10053; } } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { DRV.tf(0,1); if (MF.up) { down=_10053; } } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { DRV.tf(-1,0); if (MF.right) { left=_10053; } } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { DRV.tf(1,0); if (MF.left) { right=_10053; } } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { upLeft=_10053; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { upRight=_10053; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { downLeft=_10053; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10054))) { downRight=_10053; } }
        }
        ; /* break @L83222(解释器同序:顺序结构下无操作) */
      } break;
      }
     }
    }
    if ((S.tileMergeDirt(num))) {
     {
      const _10055=(-(2));
      const _10056=S["Dirt"];
      { const _c=up; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10055; } }
      { const _c=down; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10055; } }
      { const _c=left; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10055; } }
      { const _c=right; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10055; } }
      { const _c=upLeft; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10055; } }
      { const _c=upRight; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10055; } }
      { const _c=downLeft; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10055; } }
      { const _c=downRight; if ((_10056!==null?(_c>-1&&_10056(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10055; } }
     }
     if ((num==(1))) {
      if ((j>SETREF.rockLayer)) {
       {
        const _10057=(num);
        const _10058=S["Mud"];
        { const _c=up; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { DRV.tf(0,-1); if (MF.down) { up=_10057; } } }
        { const _c=down; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { DRV.tf(0,1); if (MF.up) { down=_10057; } } }
        { const _c=left; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { DRV.tf(-1,0); if (MF.right) { left=_10057; } } }
        { const _c=right; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { DRV.tf(1,0); if (MF.left) { right=_10057; } } }
        { const _c=upLeft; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { upLeft=_10057; } }
        { const _c=upRight; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { upRight=_10057; } }
        { const _c=downLeft; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { downLeft=_10057; } }
        { const _c=downRight; if ((_10058!==null?(_c>-1&&_10058(_c)):(_c===null))) { downRight=_10057; } }
       }
      }
      {
       const _10059=(num);
       const _10060=S["Ash"];
       { const _c=up; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { DRV.tf(0,-1); if (MF.down) { up=_10059; } } }
       { const _c=down; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { DRV.tf(0,1); if (MF.up) { down=_10059; } } }
       { const _c=left; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { DRV.tf(-1,0); if (MF.right) { left=_10059; } } }
       { const _c=right; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { DRV.tf(1,0); if (MF.left) { right=_10059; } } }
       { const _c=upLeft; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { upLeft=_10059; } }
       { const _c=upRight; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { upRight=_10059; } }
       { const _c=downLeft; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { downLeft=_10059; } }
       { const _c=downRight; if ((_10060!==null?(_c>-1&&_10060(_c)):(_c===null))) { downRight=_10059; } }
      }
     }
    } else {
     switch (num) {
     case 32: {
       if ((down==(23))) {
        down = num;
       }
       ; /* break @L83327(解释器同序:顺序结构下无操作) */
     } break;
     case 51: {
       {
        const _10061=(num);
        const _10062=S["AllTiles"];
        const _10063=S["tileNoAttach"];
        { const _c=up; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10061; } }
        { const _c=down; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10061; } }
        { const _c=left; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10061; } }
        { const _c=right; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10061; } }
        { const _c=upLeft; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10061; } }
        { const _c=upRight; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10061; } }
        { const _c=downLeft; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10061; } }
        { const _c=downRight; if ((_10062!==null?(_c>-1&&_10062(_c)):(_c===null)) && !( (_10063)!==null&&_c>-1&&_10063(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10061; } }
       }
       ; /* break @L83348(解释器同序:顺序结构下无操作) */
     } break;
     case 57: {
       {
        const _10064=(-(2));
        const _10065=((1));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10064; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10064; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10064; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10064; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10064; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10064; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10064; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10065)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10064; } }
       }
       {
        const _10066=(num);
        const _10067=((633));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10066; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10066; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10066; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10066; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10066; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10066; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10066; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10067)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10066; } }
       }
       {
        const _10068=(num);
        const _10069=S["HellSpecial"];
        { const _c=up; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { DRV.tf(0,-1); if (MF.down) { up=_10068; } } }
        { const _c=down; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { DRV.tf(0,1); if (MF.up) { down=_10068; } } }
        { const _c=left; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { DRV.tf(-1,0); if (MF.right) { left=_10068; } } }
        { const _c=right; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { DRV.tf(1,0); if (MF.left) { right=_10068; } } }
        { const _c=upLeft; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { upLeft=_10068; } }
        { const _c=upRight; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { upRight=_10068; } }
        { const _c=downLeft; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { downLeft=_10068; } }
        { const _c=downRight; if ((_10069!==null?(_c>-1&&_10069(_c)):(_c===null))) { downRight=_10068; } }
       }
       ; /* break @L83258(解释器同序:顺序结构下无操作) */
     } break;
     case 58: {
     } break;
     case 59: {
       if ((j>SETREF.rockLayer)) {
        {
         const _10070=(-(2));
         const _10071=((1));
         { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10070; } }
         { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10070; } }
         { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10070; } }
         { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10070; } }
         { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10070; } }
         { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10070; } }
         { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10070; } }
         { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10071)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10070; } }
        }
       }
       {
        const _10072=(num);
        const _10073=S["GrassSpecial"];
        { const _c=up; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10072; } }
        { const _c=down; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10072; } }
        { const _c=left; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10072; } }
        { const _c=right; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10072; } }
        { const _c=upLeft; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10072; } }
        { const _c=upRight; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10072; } }
        { const _c=downLeft; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10072; } }
        { const _c=downRight; if ((_10073!==null?(_c>-1&&_10073(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10072; } }
       }
       {
        const _10074=(num);
        const _10075=S["JungleSpecial"];
        { const _c=up; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { DRV.tf(0,-1); if (MF.down) { up=_10074; } } }
        { const _c=down; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { DRV.tf(0,1); if (MF.up) { down=_10074; } } }
        { const _c=left; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { DRV.tf(-1,0); if (MF.right) { left=_10074; } } }
        { const _c=right; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { DRV.tf(1,0); if (MF.left) { right=_10074; } } }
        { const _c=upLeft; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { upLeft=_10074; } }
        { const _c=upRight; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { upRight=_10074; } }
        { const _c=downLeft; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { downLeft=_10074; } }
        { const _c=downRight; if ((_10075!==null?(_c>-1&&_10075(_c)):(_c===null))) { downRight=_10074; } }
       }
       if ((j<SETREF.rockLayer)) {
        {
         const _10076=(num);
         const _10077=S["Dirt"];
         { const _c=up; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { DRV.tf(0,-1); if (MF.down) { up=_10076; } } }
         { const _c=down; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { DRV.tf(0,1); if (MF.up) { down=_10076; } } }
         { const _c=left; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { DRV.tf(-1,0); if (MF.right) { left=_10076; } } }
         { const _c=right; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { DRV.tf(1,0); if (MF.left) { right=_10076; } } }
         { const _c=upLeft; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { upLeft=_10076; } }
         { const _c=upRight; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { upRight=_10076; } }
         { const _c=downLeft; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { downLeft=_10076; } }
         { const _c=downRight; if ((_10077!==null?(_c>-1&&_10077(_c)):(_c===null))) { downRight=_10076; } }
        }
       } else {
        {
         const _10078=(num);
         const _10079=S["Dirt"];
         { const _c=up; if ((_10079!==null?(_c>-1&&_10079(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10078; } }
         { const _c=down; if ((_10079!==null?(_c>-1&&_10079(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10078; } }
         { const _c=left; if ((_10079!==null?(_c>-1&&_10079(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10078; } }
         { const _c=right; if ((_10079!==null?(_c>-1&&_10079(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10078; } }
        }
       }
       ; /* break @L83274(解释器同序:顺序结构下无操作) */
     } break;
     case 60: {
       {
        const _10080=((59));
        const _10081=((211));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10081)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10080; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10081)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10080; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10081)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10080; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10081)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10080; } }
       }
       ; /* break @L83285(解释器同序:顺序结构下无操作) */
     } break;
     case 69: {
       if ((down==(60))) {
        down = num;
       }
       ; /* break @L83339(解释器同序:顺序结构下无操作) */
     } break;
     case 75: {
     } break;
     case 76: {
       {
        const _10082=(-(2));
        const _10083=S["Ash"];
        { const _c=up; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10082; } }
        { const _c=down; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10082; } }
        { const _c=left; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10082; } }
        { const _c=right; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10082; } }
        { const _c=upLeft; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10082; } }
        { const _c=upRight; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10082; } }
        { const _c=downLeft; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10082; } }
        { const _c=downRight; if ((_10083!==null?(_c>-1&&_10083(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10082; } }
       }
       ; /* break @L83253(解释器同序:顺序结构下无操作) */
     } break;
     case 147: {
       {
        const _10084=(num);
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { DRV.tf(0,-1); if (MF.down) { up=_10084; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { DRV.tf(0,1); if (MF.up) { down=_10084; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { DRV.tf(-1,0); if (MF.right) { left=_10084; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { DRV.tf(1,0); if (MF.left) { right=_10084; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { upLeft=_10084; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { upRight=_10084; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { downLeft=_10084; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===null))) { downRight=_10084; } }
       }
       ; /* break @L83311(解释器同序:顺序结构下无操作) */
     } break;
     case 161: {
     } break;
     case 162: {
       {
        const _10085=(-(2));
        const _10086=S["IcesSnow"];
        { const _c=up; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10085; } }
        { const _c=down; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10085; } }
        { const _c=left; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10085; } }
        { const _c=right; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10085; } }
        { const _c=upLeft; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10085; } }
        { const _c=upRight; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10085; } }
        { const _c=downLeft; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10085; } }
        { const _c=downRight; if ((_10086!==null?(_c>-1&&_10086(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10085; } }
       }
       ; /* break @L83321(解释器同序:顺序结构下无操作) */
     } break;
     case 163: {
     } break;
     case 164: {
     } break;
     case 189: {
       {
        const _10087=(num);
        const _10088=S["MergesWithClouds"];
        { const _c=up; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { DRV.tf(0,-1); if (MF.down) { up=_10087; } } }
        { const _c=down; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { DRV.tf(0,1); if (MF.up) { down=_10087; } } }
        { const _c=left; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { DRV.tf(-1,0); if (MF.right) { left=_10087; } } }
        { const _c=right; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { DRV.tf(1,0); if (MF.left) { right=_10087; } } }
        { const _c=upLeft; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { upLeft=_10087; } }
        { const _c=upRight; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { upRight=_10087; } }
        { const _c=downLeft; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { downLeft=_10087; } }
        { const _c=downRight; if ((_10088!==null?(_c>-1&&_10088(_c)):(_c===null))) { downRight=_10087; } }
       }
       ; /* break @L83288(解释器同序:顺序结构下无操作) */
     } break;
     case 191: {
       {
        const _10089=(-(2));
        const _10090=((192));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10089; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10089; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10089; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10089; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10089; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10089; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10089; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10090)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10089; } }
       }
       {
        const _10091=(num);
        const _10092=S["Dirt"];
        { const _c=up; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10091; } }
        { const _c=down; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10091; } }
        { const _c=left; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10091; } }
        { const _c=right; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10091; } }
        { const _c=upLeft; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10091; } }
        { const _c=upRight; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10091; } }
        { const _c=downLeft; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10091; } }
        { const _c=downRight; if ((_10092!==null?(_c>-1&&_10092(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10091; } }
       }
       ; /* break @L83355(解释器同序:顺序结构下无操作) */
     } break;
     case 192: {
       {
        const _10093=(num);
        const _10094=((191));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { DRV.tf(0,-1); if (MF.down) { up=_10093; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { DRV.tf(0,1); if (MF.up) { down=_10093; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { DRV.tf(-1,0); if (MF.right) { left=_10093; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { DRV.tf(1,0); if (MF.left) { right=_10093; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { upLeft=_10093; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { upRight=_10093; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { downLeft=_10093; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10094))) { downRight=_10093; } }
       }
       ; /* break @L83351(解释器同序:顺序结构下无操作) */
     } break;
     case 196: {
       {
        const _10095=(-(2));
        const _10096=((189));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10095; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10095; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10095; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10095; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10095; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10095; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10095; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10096)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10095; } }
       }
       {
        const _10097=(num);
        const _10098=((460));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10097; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10097; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10097; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10097; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10097; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10097; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10097; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10098)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10097; } }
       }
       ; /* break @L83292(解释器同序:顺序结构下无操作) */
     } break;
     case 200: {
     } break;
     case 211: {
       {
        const _10099=((59));
        const _10100=((60));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10100)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10099; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10100)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10099; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10100)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10099; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10100)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10099; } }
       }
       {
        const _10101=(-(2));
        const _10102=S["Mud"];
        { const _c=up; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10101; } }
        { const _c=down; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10101; } }
        { const _c=left; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10101; } }
        { const _c=right; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10101; } }
        { const _c=upLeft; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10101; } }
        { const _c=upRight; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10101; } }
        { const _c=downLeft; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10101; } }
        { const _c=downRight; if ((_10102!==null?(_c>-1&&_10102(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10101; } }
       }
       ; /* break @L83278(解释器同序:顺序结构下无操作) */
     } break;
     case 224: {
       {
        const _10103=(-(2));
        const _10104=((147));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10103; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10103; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10103; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10103; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10103; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10103; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10103; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10104)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10103; } }
       }
       ; /* break @L83318(解释器同序:顺序结构下无操作) */
     } break;
     case 225: {
     } break;
     case 226: {
       {
        const _10105=(-(2));
        const _10106=S["Mud"];
        { const _c=up; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10105; } }
        { const _c=down; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10105; } }
        { const _c=left; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10105; } }
        { const _c=right; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10105; } }
        { const _c=upLeft; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10105; } }
        { const _c=upRight; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10105; } }
        { const _c=downLeft; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10105; } }
        { const _c=downRight; if ((_10106!==null?(_c>-1&&_10106(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10105; } }
       }
       ; /* break @L83282(解释器同序:顺序结构下无操作) */
     } break;
     case 352: {
       if ((down==(199))) {
        down = num;
       }
       ; /* break @L83333(解释器同序:顺序结构下无操作) */
     } break;
     case 383: {
       {
        const _10107=(-(2));
        const _10108=((384));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10107; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10107; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10107; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10107; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10107; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10107; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10107; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10108)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10107; } }
       }
       {
        const _10109=(num);
        const _10110=S["Mud"];
        { const _c=up; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10109; } }
        { const _c=down; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10109; } }
        { const _c=left; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10109; } }
        { const _c=right; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10109; } }
        { const _c=upLeft; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10109; } }
        { const _c=upRight; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10109; } }
        { const _c=downLeft; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10109; } }
        { const _c=downRight; if ((_10110!==null?(_c>-1&&_10110(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10109; } }
       }
       ; /* break @L83362(解释器同序:顺序结构下无操作) */
     } break;
     case 384: {
       {
        const _10111=(num);
        const _10112=((383));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { DRV.tf(0,-1); if (MF.down) { up=_10111; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { DRV.tf(0,1); if (MF.up) { down=_10111; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { DRV.tf(-1,0); if (MF.right) { left=_10111; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { DRV.tf(1,0); if (MF.left) { right=_10111; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { upLeft=_10111; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { upRight=_10111; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { downLeft=_10111; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10112))) { downRight=_10111; } }
       }
       ; /* break @L83358(解释器同序:顺序结构下无操作) */
     } break;
     case 396: {
       {
        const _10113=(-(2));
        const _10114=((397));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10113; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10113; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10113; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10113; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10113; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10113; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10113; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10114)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10113; } }
       }
       {
        const _10115=(-(2));
        const _10116=((53));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10115; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10115; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10115; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10115; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10115; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10115; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10115; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10116)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10115; } }
       }
       {
        const _10117=(num);
        const _10118=((404));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { DRV.tf(0,-1); if (MF.down) { up=_10117; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { DRV.tf(0,1); if (MF.up) { down=_10117; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { DRV.tf(-1,0); if (MF.right) { left=_10117; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { DRV.tf(1,0); if (MF.left) { right=_10117; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { upLeft=_10117; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { upRight=_10117; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { downLeft=_10117; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10118))) { downRight=_10117; } }
       }
       ; /* break @L83378(解释器同序:顺序结构下无操作) */
     } break;
     case 397: {
       {
        const _10119=(-(2));
        const _10120=((53));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10119; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10119; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10119; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10119; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10119; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10119; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10119; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10120)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10119; } }
       }
       {
        const _10121=(num);
        const _10122=((396));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { DRV.tf(0,-1); if (MF.down) { up=_10121; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { DRV.tf(0,1); if (MF.up) { down=_10121; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { DRV.tf(-1,0); if (MF.right) { left=_10121; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { DRV.tf(1,0); if (MF.left) { right=_10121; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { upLeft=_10121; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { upRight=_10121; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { downLeft=_10121; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10122))) { downRight=_10121; } }
       }
       ; /* break @L83373(解释器同序:顺序结构下无操作) */
     } break;
     case 398: {
       {
        const _10123=(-(2));
        const _10124=((112));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10123; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10123; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10123; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10123; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10123; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10123; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10123; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10124)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10123; } }
       }
       {
        const _10125=(num);
        const _10126=((400));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { DRV.tf(0,-1); if (MF.down) { up=_10125; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { DRV.tf(0,1); if (MF.up) { down=_10125; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { DRV.tf(-1,0); if (MF.right) { left=_10125; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { DRV.tf(1,0); if (MF.left) { right=_10125; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { upLeft=_10125; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { upRight=_10125; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { downLeft=_10125; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10126))) { downRight=_10125; } }
       }
       ; /* break @L83382(解释器同序:顺序结构下无操作) */
     } break;
     case 399: {
       {
        const _10127=(-(2));
        const _10128=((234));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10127; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10127; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10127; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10127; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10127; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10127; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10127; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10128)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10127; } }
       }
       {
        const _10129=(num);
        const _10130=((401));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { DRV.tf(0,-1); if (MF.down) { up=_10129; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { DRV.tf(0,1); if (MF.up) { down=_10129; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { DRV.tf(-1,0); if (MF.right) { left=_10129; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { DRV.tf(1,0); if (MF.left) { right=_10129; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { upLeft=_10129; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { upRight=_10129; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { downLeft=_10129; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10130))) { downRight=_10129; } }
       }
       ; /* break @L83390(解释器同序:顺序结构下无操作) */
     } break;
     case 400: {
       {
        const _10131=(-(2));
        const _10132=((398));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10131; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10131; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10131; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10131; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10131; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10131; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10131; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10132)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10131; } }
       }
       {
        const _10133=(-(2));
        const _10134=((112));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10133; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10133; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10133; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10133; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10133; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10133; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10133; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10134)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10133; } }
       }
       ; /* break @L83386(解释器同序:顺序结构下无操作) */
     } break;
     case 401: {
       {
        const _10135=(-(2));
        const _10136=((399));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10135; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10135; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10135; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10135; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10135; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10135; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10135; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10136)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10135; } }
       }
       {
        const _10137=(-(2));
        const _10138=((234));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10137; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10137; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10137; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10137; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10137; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10137; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10137; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10138)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10137; } }
       }
       ; /* break @L83394(解释器同序:顺序结构下无操作) */
     } break;
     case 402: {
       {
        const _10139=(-(2));
        const _10140=((116));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10139; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10139; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10139; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10139; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10139; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10139; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10139; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10140)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10139; } }
       }
       {
        const _10141=(num);
        const _10142=((403));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { DRV.tf(0,-1); if (MF.down) { up=_10141; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { DRV.tf(0,1); if (MF.up) { down=_10141; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { DRV.tf(-1,0); if (MF.right) { left=_10141; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { DRV.tf(1,0); if (MF.left) { right=_10141; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { upLeft=_10141; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { upRight=_10141; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { downLeft=_10141; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10142))) { downRight=_10141; } }
       }
       ; /* break @L83398(解释器同序:顺序结构下无操作) */
     } break;
     case 403: {
       {
        const _10143=(-(2));
        const _10144=((402));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10143; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10143; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10143; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10143; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10143; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10143; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10143; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10144)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10143; } }
       }
       {
        const _10145=(-(2));
        const _10146=((116));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10145; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10145; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10145; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10145; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10145; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10145; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10145; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10146)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10145; } }
       }
       ; /* break @L83402(解释器同序:顺序结构下无操作) */
     } break;
     case 404: {
       {
        const _10147=(-(2));
        const _10148=((396));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10147; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10147; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10147; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10147; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10147; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10147; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10147; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10148)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10147; } }
       }
       {
        const _10149=(num);
        const _10150=((407));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { DRV.tf(0,-1); if (MF.down) { up=_10149; } } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { DRV.tf(0,1); if (MF.up) { down=_10149; } } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { DRV.tf(-1,0); if (MF.right) { left=_10149; } } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { DRV.tf(1,0); if (MF.left) { right=_10149; } } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { upLeft=_10149; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { upRight=_10149; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { downLeft=_10149; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10150))) { downRight=_10149; } }
       }
       ; /* break @L83369(解释器同序:顺序结构下无操作) */
     } break;
     case 407: {
       {
        const _10151=(-(2));
        const _10152=((404));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10151; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10151; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10151; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10151; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10151; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10151; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10151; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10152)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10151; } }
       }
       ; /* break @L83365(解释器同序:顺序结构下无操作) */
     } break;
     case 460: {
       {
        const _10153=(-(2));
        const _10154=((189));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10153; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10153; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10153; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10153; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10153; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10153; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10153; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10154)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10153; } }
       }
       {
        const _10155=(num);
        const _10156=((196));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10155; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10155; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10155; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10155; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10155; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10155; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10155; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10156)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10155; } }
       }
       ; /* break @L83296(解释器同序:顺序结构下无操作) */
     } break;
     case 655: {
       if ((down==(60))) {
        down = num;
       }
       ; /* break @L83345(解释器同序:顺序结构下无操作) */
     } break;
     case 717: {
       {
        const _10157=(-(2));
        const _10158=((189));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10157; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10157; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10157; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10157; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10157; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10157; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10157; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10158)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10157; } }
       }
       {
        const _10159=(num);
        const _10160=((717));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10159; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10159; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10159; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10159; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10159; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10159; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10159; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10160)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10159; } }
       }
       ; /* break @L83300(解释器同序:顺序结构下无操作) */
     } break;
     case 718: {
       {
        const _10161=(-(2));
        const _10162=((189));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10161; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10161; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10161; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10161; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10161; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10161; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10161; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10162)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10161; } }
       }
       {
        const _10163=(num);
        const _10164=((718));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10163; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10163; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10163; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10163; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10163; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10163; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10163; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10164)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10163; } }
       }
       ; /* break @L83304(解释器同序:顺序结构下无操作) */
     } break;
     case 719: {
       {
        const _10165=(-(2));
        const _10166=((189));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10165; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10165; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10165; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10165; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10165; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10165; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10165; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10166)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10165; } }
       }
       {
        const _10167=(num);
        const _10168=((719));
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10167; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10167; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10167; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10167; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10167; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10167; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10167; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10168)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10167; } }
       }
       ; /* break @L83308(解释器同序:顺序结构下无操作) */
     } break;
     }
    }
    if ((num==(0))) {
     {
      const _10169=(num);
      const _10170=S["tileMoss"];
      { const _c=up; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10169; } }
      { const _c=down; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10169; } }
      { const _c=left; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10169; } }
      { const _c=right; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10169; } }
      { const _c=upLeft; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10169; } }
      { const _c=upRight; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10169; } }
      { const _c=downLeft; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10169; } }
      { const _c=downRight; if ((_10170!==null?(_c>-1&&_10170(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10169; } }
     }
     {
      const _10171=(num);
      const _10172=S["tileMossBrick"];
      { const _c=up; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10171; } }
      { const _c=down; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10171; } }
      { const _c=left; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10171; } }
      { const _c=right; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10171; } }
      { const _c=upLeft; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10171; } }
      { const _c=upRight; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10171; } }
      { const _c=downLeft; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10171; } }
      { const _c=downRight; if ((_10172!==null?(_c>-1&&_10172(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10171; } }
     }
    } else {
     if ((S.tileMoss(num)||S["tileMossBrick"](num))) {
      {
       const _10173=(num);
       const _10174=S["Dirt"];
       { const _c=up; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10173; } }
       { const _c=down; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10173; } }
       { const _c=left; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10173; } }
       { const _c=right; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10173; } }
       { const _c=upLeft; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10173; } }
       { const _c=upRight; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10173; } }
       { const _c=downLeft; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10173; } }
       { const _c=downRight; if ((_10174!==null?(_c>-1&&_10174(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10173; } }
      }
     } else {
      if ((S.tileStone(num)||num==(1))) {
       {
        const _10175=(num);
        const _10176=S["tileMoss"];
        { const _c=up; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10175; } }
        { const _c=down; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10175; } }
        { const _c=left; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10175; } }
        { const _c=right; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10175; } }
        { const _c=upLeft; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10175; } }
        { const _c=upRight; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10175; } }
        { const _c=downLeft; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10175; } }
        { const _c=downRight; if ((_10176!==null?(_c>-1&&_10176(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10175; } }
       }
      } else {
       if ((num==(38))) {
        {
         const _10177=(num);
         const _10178=S["tileMossBrick"];
         { const _c=up; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10177; } }
         { const _c=down; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10177; } }
         { const _c=left; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10177; } }
         { const _c=right; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10177; } }
         { const _c=upLeft; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10177; } }
         { const _c=upRight; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10177; } }
         { const _c=downLeft; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10177; } }
         { const _c=downRight; if ((_10178!==null?(_c>-1&&_10178(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10177; } }
        }
       }
      }
     }
    }
    if ((S["Conversion.Grass"](num))) {
     {
      const _10179=(num);
      const _10180=S["Ore"];
      { const _c=up; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10179; } }
      { const _c=down; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10179; } }
      { const _c=left; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10179; } }
      { const _c=right; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10179; } }
      { const _c=upLeft; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10179; } }
      { const _c=upRight; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10179; } }
      { const _c=downLeft; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10179; } }
      { const _c=downRight; if ((_10180!==null?(_c>-1&&_10180(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10179; } }
     }
    } else {
     if ((S["Ore"](num))) {
      {
       const _10181=(num);
       const _10182=S["Conversion.Grass"];
       { const _c=up; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10181; } }
       { const _c=down; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10181; } }
       { const _c=left; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10181; } }
       { const _c=right; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10181; } }
       { const _c=upLeft; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10181; } }
       { const _c=upRight; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10181; } }
       { const _c=downLeft; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10181; } }
       { const _c=downRight; if ((_10182!==null?(_c>-1&&_10182(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10181; } }
      }
     }
    }
    switch (num) {
    case 53: {
      {
       const _10183=(num);
       const _10184=((747));
       { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { DRV.tf(0,-1); if (MF.down) { up=_10183; } } }
       { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { DRV.tf(0,1); if (MF.up) { down=_10183; } } }
       { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { DRV.tf(-1,0); if (MF.right) { left=_10183; } } }
       { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { DRV.tf(1,0); if (MF.left) { right=_10183; } } }
       { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { upLeft=_10183; } }
       { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { upRight=_10183; } }
       { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { downLeft=_10183; } }
       { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10184))) { downRight=_10183; } }
      }
      ; /* break @L83434(解释器同序:顺序结构下无操作) */
    } break;
    case 747: {
      {
       const _10185=(-(2));
       const _10186=((53));
       { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10185; } }
       { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10185; } }
       { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10185; } }
       { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10185; } }
       { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10185; } }
       { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10185; } }
       { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10185; } }
       { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10186)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10185; } }
      }
      ; /* break @L83437(解释器同序:顺序结构下无操作) */
    } break;
    }
    if ((S["Snow"](num))) {
     {
      const _10187=(num);
      const _10188=((170));
      { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { DRV.tf(0,-1); if (MF.down) { up=_10187; } } }
      { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { DRV.tf(0,1); if (MF.up) { down=_10187; } } }
      { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { DRV.tf(-1,0); if (MF.right) { left=_10187; } } }
      { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { DRV.tf(1,0); if (MF.left) { right=_10187; } } }
      { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { upLeft=_10187; } }
      { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { upRight=_10187; } }
      { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { downLeft=_10187; } }
      { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10188))) { downRight=_10187; } }
     }
    } else {
     if ((num==(170))) {
      {
       const _10189=(-(2));
       const _10190=S["Snow"];
       { const _c=up; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10189; } }
       { const _c=down; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10189; } }
       { const _c=left; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10189; } }
       { const _c=right; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10189; } }
       { const _c=upLeft; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10189; } }
       { const _c=upRight; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10189; } }
       { const _c=downLeft; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10189; } }
       { const _c=downRight; if ((_10190!==null?(_c>-1&&_10190(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10189; } }
      }
     }
    }
    if ((S["Snow"](num))) {
     {
      const _10191=(num);
      const _10192=((738));
      { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { DRV.tf(0,-1); if (MF.down) { up=_10191; } } }
      { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { DRV.tf(0,1); if (MF.up) { down=_10191; } } }
      { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { DRV.tf(-1,0); if (MF.right) { left=_10191; } } }
      { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { DRV.tf(1,0); if (MF.left) { right=_10191; } } }
      { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { upLeft=_10191; } }
      { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { upRight=_10191; } }
      { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { downLeft=_10191; } }
      { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10192))) { downRight=_10191; } }
     }
    } else {
     if ((num==(738))) {
      {
       const _10193=(-(2));
       const _10194=S["Snow"];
       { const _c=up; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10193; } }
       { const _c=down; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10193; } }
       { const _c=left; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10193; } }
       { const _c=right; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10193; } }
       { const _c=upLeft; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10193; } }
       { const _c=upRight; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10193; } }
       { const _c=downLeft; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10193; } }
       { const _c=downRight; if ((_10194!==null?(_c>-1&&_10194(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10193; } }
      }
     }
    }
    if ((num>=(0)&&num<800&&S["Mud"](num))) {
     {
      const _10195=(num);
      const _10196=S["OreMergesWithMud"];
      { const _c=up; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10195; } }
      { const _c=down; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10195; } }
      { const _c=left; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10195; } }
      { const _c=right; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10195; } }
      { const _c=upLeft; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10195; } }
      { const _c=upRight; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10195; } }
      { const _c=downLeft; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10195; } }
      { const _c=downRight; if ((_10196!==null?(_c>-1&&_10196(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10195; } }
     }
    } else {
     if ((S["OreMergesWithMud"](num))) {
      {
       const _10197=(num);
       const _10198=S["Mud"];
       { const _c=up; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10197; } }
       { const _c=down; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10197; } }
       { const _c=left; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10197; } }
       { const _c=right; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10197; } }
       { const _c=upLeft; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10197; } }
       { const _c=upRight; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10197; } }
       { const _c=downLeft; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10197; } }
       { const _c=downRight; if ((_10198!==null?(_c>-1&&_10198(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10197; } }
      }
     }
    }
    flag7 = false;
    if ((num==(2)||num==(23)||num==(661)||num==(662)||num==(60)||num==(477)||num==(492)||num==(70)||num==(109)||num==(199)||S.tileMoss(num)||S["NeedsGrassFraming"](num)||S["tileMossBrick"](num))) {
     flag7 = true;
     {
      const _10199=(num);
      const _10200=(-(1));
      const _10201=S["tileSolid"];
      { const _c=up; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { up=_10200; } }
      { const _c=down; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { down=_10200; } }
      { const _c=left; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { left=_10200; } }
      { const _c=right; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { right=_10200; } }
      { const _c=upLeft; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { upLeft=_10200; } }
      { const _c=upRight; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { upRight=_10200; } }
      { const _c=downLeft; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { downLeft=_10200; } }
      { const _c=downRight; if (_c>-1 && _c!==_10199 && !( (_10201)!==null && _10201(_c) ) && ( (null)===null || _c!==(null) ) ) { downRight=_10200; } }
     }
     num11 = S["NeedsGrassFramingDirt"](num);
     if ((num==(60)||num==(70)||num==(661)||num==(662))) {
      num11 = (59);
     } else {
      if ((S.tileMoss(num))) {
       num11 = (1);
      } else {
       if ((S["tileMossBrick"](num))) {
        num11 = (38);
       } else {
        switch (num) {
        case 2: {
        } break;
        case 23: {
          {
           const _10202=(num11);
           const _10203=((2));
           { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10202; } }
           { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10202; } }
           { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10202; } }
           { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10202; } }
           { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10202; } }
           { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10202; } }
           { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10202; } }
           { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10203)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10202; } }
          }
          ; /* break @L83491(解释器同序:顺序结构下无操作) */
        } break;
        case 477: {
          {
           const _10204=(num11);
           const _10205=((23));
           { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10204; } }
           { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10204; } }
           { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10204; } }
           { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10204; } }
           { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10204; } }
           { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10204; } }
           { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10204; } }
           { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10205)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10204; } }
          }
          ; /* break @L83488(解释器同序:顺序结构下无操作) */
        } break;
        }
       }
      }
     }
     { if (!DRV.inv()) {
       if (DRV.cull(0,-1)) { up = -1; }
       if (DRV.cull(0,1)) { down = -1; }
       if (DRV.cull(-1,0)) { left = -1; }
       if (DRV.cull(1,0)) { right = -1; }
       if (DRV.cull(-1,-1)) { upLeft = -1; }
       if (DRV.cull(1,-1)) { upRight = -1; }
       if (DRV.cull(-1,1)) { downLeft = -1; }
       if (DRV.cull(1,1)) { downRight = -1; }
     } }
     if ((up!=num&&up!=num11&&(down==num||down==num11))) {
      if ((left==num11&&right==num)) {
       switch (num6) {
       case 0: {
         _rx = (0);
         _ry = (198);
         ; /* break @L83504(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (18);
         _ry = (198);
         ; /* break @L83508(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (36);
         _ry = (198);
         ; /* break @L83512(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       if ((left==num&&right==num11)) {
        switch (num6) {
        case 0: {
          _rx = (54);
          _ry = (198);
          ; /* break @L83522(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (72);
          _ry = (198);
          ; /* break @L83526(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (90);
          _ry = (198);
          ; /* break @L83530(解释器同序:顺序结构下无操作) */
        }
        }
       }
      }
     } else {
      if ((down!=num&&down!=num11&&(up==num||up==num11))) {
       if ((left==num11&&right==num)) {
        switch (num6) {
        case 0: {
          _rx = (0);
          _ry = (216);
          ; /* break @L83543(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (18);
          _ry = (216);
          ; /* break @L83547(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (36);
          _ry = (216);
          ; /* break @L83551(解释器同序:顺序结构下无操作) */
        }
        }
       } else {
        if ((left==num&&right==num11)) {
         switch (num6) {
         case 0: {
           _rx = (54);
           _ry = (216);
           ; /* break @L83561(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (72);
           _ry = (216);
           ; /* break @L83565(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (90);
           _ry = (216);
           ; /* break @L83569(解释器同序:顺序结构下无操作) */
         }
         }
        }
       }
      } else {
       if ((left!=num&&left!=num11&&(right==num||right==num11))) {
        if ((up==num11&&down==num)) {
         switch (num6) {
         case 0: {
           _rx = (72);
           _ry = (144);
           ; /* break @L83582(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (72);
           _ry = (162);
           ; /* break @L83586(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (72);
           _ry = (180);
           ; /* break @L83590(解释器同序:顺序结构下无操作) */
         }
         }
        } else {
         if ((down==num&&up==num11)) {
          switch (num6) {
          case 0: {
            _rx = (72);
            _ry = (90);
            ; /* break @L83600(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (72);
            _ry = (108);
            ; /* break @L83604(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (72);
            _ry = (126);
            ; /* break @L83608(解释器同序:顺序结构下无操作) */
          }
          }
         }
        }
       } else {
        if ((right!=num&&right!=num11&&(left==num||left==num11))) {
         if ((up==num11&&down==num)) {
          switch (num6) {
          case 0: {
            _rx = (90);
            _ry = (144);
            ; /* break @L83621(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (90);
            _ry = (162);
            ; /* break @L83625(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (90);
            _ry = (180);
            ; /* break @L83629(解释器同序:顺序结构下无操作) */
          }
          }
         } else {
          if ((down==num&&right==up)) {
           switch (num6) {
           case 0: {
             _rx = (90);
             _ry = (90);
             ; /* break @L83639(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (90);
             _ry = (108);
             ; /* break @L83643(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (90);
             _ry = (126);
             ; /* break @L83647(解释器同序:顺序结构下无操作) */
           }
           }
          }
         }
        } else {
         if ((up==num&&down==num&&left==num&&right==num)) {
          if ((upLeft!=num&&upRight!=num&&downLeft!=num&&downRight!=num)) {
           if ((downRight==num11)) {
            switch (num6) {
            case 0: {
              _rx = (108);
              _ry = (324);
              ; /* break @L83662(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (126);
              _ry = (324);
              ; /* break @L83666(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (144);
              _ry = (324);
              ; /* break @L83670(解释器同序:顺序结构下无操作) */
            }
            }
           } else {
            if ((upRight==num11)) {
             switch (num6) {
             case 0: {
               _rx = (108);
               _ry = (342);
               ; /* break @L83680(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (126);
               _ry = (342);
               ; /* break @L83684(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (144);
               _ry = (342);
               ; /* break @L83688(解释器同序:顺序结构下无操作) */
             }
             }
            } else {
             if ((downLeft==num11)) {
              switch (num6) {
              case 0: {
                _rx = (108);
                _ry = (360);
                ; /* break @L83698(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (126);
                _ry = (360);
                ; /* break @L83702(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (144);
                _ry = (360);
                ; /* break @L83706(解释器同序:顺序结构下无操作) */
              }
              }
             } else {
              if ((upLeft==num11)) {
               switch (num6) {
               case 0: {
                 _rx = (108);
                 _ry = (378);
                 ; /* break @L83716(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (126);
                 _ry = (378);
                 ; /* break @L83720(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (144);
                 _ry = (378);
                 ; /* break @L83724(解释器同序:顺序结构下无操作) */
               }
               }
              } else {
               switch (num6) {
               case 0: {
                 _rx = (144);
                 _ry = (234);
                 ; /* break @L83734(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (198);
                 _ry = (234);
                 ; /* break @L83738(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (252);
                 _ry = (234);
                 ; /* break @L83742(解释器同序:顺序结构下无操作) */
               }
               }
              }
             }
            }
           }
          } else {
           if ((upLeft!=num&&downRight!=num)) {
            switch (num6) {
            case 0: {
              _rx = (36);
              _ry = (306);
              ; /* break @L83753(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (54);
              _ry = (306);
              ; /* break @L83757(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (72);
              _ry = (306);
              ; /* break @L83761(解释器同序:顺序结构下无操作) */
            }
            }
           } else {
            if ((upRight!=num&&downLeft!=num)) {
             switch (num6) {
             case 0: {
               _rx = (90);
               _ry = (306);
               ; /* break @L83771(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (108);
               _ry = (306);
               ; /* break @L83775(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (126);
               _ry = (306);
               ; /* break @L83779(解释器同序:顺序结构下无操作) */
             }
             }
            } else {
             if ((upLeft!=num&&upRight==num&&downLeft==num&&downRight==num)) {
              switch (num6) {
              case 0: {
                _rx = (54);
                _ry = (108);
                ; /* break @L83789(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (54);
                _ry = (144);
                ; /* break @L83793(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (54);
                _ry = (180);
                ; /* break @L83797(解释器同序:顺序结构下无操作) */
              }
              }
             } else {
              if ((upLeft==num&&upRight!=num&&downLeft==num&&downRight==num)) {
               switch (num6) {
               case 0: {
                 _rx = (36);
                 _ry = (108);
                 ; /* break @L83807(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (36);
                 _ry = (144);
                 ; /* break @L83811(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (36);
                 _ry = (180);
                 ; /* break @L83815(解释器同序:顺序结构下无操作) */
               }
               }
              } else {
               if ((upLeft==num&&upRight==num&&downLeft!=num&&downRight==num)) {
                switch (num6) {
                case 0: {
                  _rx = (54);
                  _ry = (90);
                  ; /* break @L83825(解释器同序:顺序结构下无操作) */
                } break;
                case 1: {
                  _rx = (54);
                  _ry = (126);
                  ; /* break @L83829(解释器同序:顺序结构下无操作) */
                } break;
                default: {
                  _rx = (54);
                  _ry = (162);
                  ; /* break @L83833(解释器同序:顺序结构下无操作) */
                }
                }
               } else {
                if ((upLeft==num&&upRight==num&&downLeft==num&&downRight!=num)) {
                 switch (num6) {
                 case 0: {
                   _rx = (36);
                   _ry = (90);
                   ; /* break @L83843(解释器同序:顺序结构下无操作) */
                 } break;
                 case 1: {
                   _rx = (36);
                   _ry = (126);
                   ; /* break @L83847(解释器同序:顺序结构下无操作) */
                 } break;
                 default: {
                   _rx = (36);
                   _ry = (162);
                   ; /* break @L83851(解释器同序:顺序结构下无操作) */
                 }
                 }
                }
               }
              }
             }
            }
           }
          }
         } else {
          if ((up==num&&down==num11&&left==num&&right==num&&upLeft==-(1)&&upRight==-(1))) {
           switch (num6) {
           case 0: {
             _rx = (108);
             _ry = (18);
             ; /* break @L83862(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (126);
             _ry = (18);
             ; /* break @L83866(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (144);
             _ry = (18);
             ; /* break @L83870(解释器同序:顺序结构下无操作) */
           }
           }
          } else {
           if ((up==num11&&down==num&&left==num&&right==num&&downLeft==-(1)&&downRight==-(1))) {
            switch (num6) {
            case 0: {
              _rx = (108);
              _ry = (36);
              ; /* break @L83880(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (126);
              _ry = (36);
              ; /* break @L83884(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (144);
              _ry = (36);
              ; /* break @L83888(解释器同序:顺序结构下无操作) */
            }
            }
           } else {
            if ((up==num&&down==num&&left==num11&&right==num&&upRight==-(1)&&downRight==-(1))) {
             switch (num6) {
             case 0: {
               _rx = (198);
               _ry = (0);
               ; /* break @L83898(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (198);
               _ry = (18);
               ; /* break @L83902(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (198);
               _ry = (36);
               ; /* break @L83906(解释器同序:顺序结构下无操作) */
             }
             }
            } else {
             if ((up==num&&down==num&&left==num&&right==num11&&upLeft==-(1)&&downLeft==-(1))) {
              switch (num6) {
              case 0: {
                _rx = (180);
                _ry = (0);
                ; /* break @L83916(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (180);
                _ry = (18);
                ; /* break @L83920(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (180);
                _ry = (36);
                ; /* break @L83924(解释器同序:顺序结构下无操作) */
              }
              }
             } else {
              if ((up==num&&down==num11&&left==num&&right==num)) {
               if ((upRight!=-(1))) {
                switch (num6) {
                case 0: {
                  _rx = (54);
                  _ry = (108);
                  ; /* break @L83936(解释器同序:顺序结构下无操作) */
                } break;
                case 1: {
                  _rx = (54);
                  _ry = (144);
                  ; /* break @L83940(解释器同序:顺序结构下无操作) */
                } break;
                default: {
                  _rx = (54);
                  _ry = (180);
                  ; /* break @L83944(解释器同序:顺序结构下无操作) */
                }
                }
               } else {
                if ((upLeft!=-(1))) {
                 switch (num6) {
                 case 0: {
                   _rx = (36);
                   _ry = (108);
                   ; /* break @L83954(解释器同序:顺序结构下无操作) */
                 } break;
                 case 1: {
                   _rx = (36);
                   _ry = (144);
                   ; /* break @L83958(解释器同序:顺序结构下无操作) */
                 } break;
                 default: {
                   _rx = (36);
                   _ry = (180);
                   ; /* break @L83962(解释器同序:顺序结构下无操作) */
                 }
                 }
                }
               }
              } else {
               if ((up==num11&&down==num&&left==num&&right==num)) {
                if ((downRight!=-(1))) {
                 switch (num6) {
                 case 0: {
                   _rx = (54);
                   _ry = (90);
                   ; /* break @L83975(解释器同序:顺序结构下无操作) */
                 } break;
                 case 1: {
                   _rx = (54);
                   _ry = (126);
                   ; /* break @L83979(解释器同序:顺序结构下无操作) */
                 } break;
                 default: {
                   _rx = (54);
                   _ry = (162);
                   ; /* break @L83983(解释器同序:顺序结构下无操作) */
                 }
                 }
                } else {
                 if ((downLeft!=-(1))) {
                  switch (num6) {
                  case 0: {
                    _rx = (36);
                    _ry = (90);
                    ; /* break @L83993(解释器同序:顺序结构下无操作) */
                  } break;
                  case 1: {
                    _rx = (36);
                    _ry = (126);
                    ; /* break @L83997(解释器同序:顺序结构下无操作) */
                  } break;
                  default: {
                    _rx = (36);
                    _ry = (162);
                    ; /* break @L84001(解释器同序:顺序结构下无操作) */
                  }
                  }
                 }
                }
               } else {
                if ((up==num&&down==num&&left==num&&right==num11)) {
                 if ((upLeft!=-(1))) {
                  switch (num6) {
                  case 0: {
                    _rx = (54);
                    _ry = (90);
                    ; /* break @L84014(解释器同序:顺序结构下无操作) */
                  } break;
                  case 1: {
                    _rx = (54);
                    _ry = (126);
                    ; /* break @L84018(解释器同序:顺序结构下无操作) */
                  } break;
                  default: {
                    _rx = (54);
                    _ry = (162);
                    ; /* break @L84022(解释器同序:顺序结构下无操作) */
                  }
                  }
                 } else {
                  if ((downLeft!=-(1))) {
                   switch (num6) {
                   case 0: {
                     _rx = (54);
                     _ry = (108);
                     ; /* break @L84032(解释器同序:顺序结构下无操作) */
                   } break;
                   case 1: {
                     _rx = (54);
                     _ry = (144);
                     ; /* break @L84036(解释器同序:顺序结构下无操作) */
                   } break;
                   default: {
                     _rx = (54);
                     _ry = (180);
                     ; /* break @L84040(解释器同序:顺序结构下无操作) */
                   }
                   }
                  }
                 }
                } else {
                 if ((up==num&&down==num&&left==num11&&right==num)) {
                  if ((upRight!=-(1))) {
                   switch (num6) {
                   case 0: {
                     _rx = (36);
                     _ry = (90);
                     ; /* break @L84053(解释器同序:顺序结构下无操作) */
                   } break;
                   case 1: {
                     _rx = (36);
                     _ry = (126);
                     ; /* break @L84057(解释器同序:顺序结构下无操作) */
                   } break;
                   default: {
                     _rx = (36);
                     _ry = (162);
                     ; /* break @L84061(解释器同序:顺序结构下无操作) */
                   }
                   }
                  } else {
                   if ((downRight!=-(1))) {
                    switch (num6) {
                    case 0: {
                      _rx = (36);
                      _ry = (108);
                      ; /* break @L84071(解释器同序:顺序结构下无操作) */
                    } break;
                    case 1: {
                      _rx = (36);
                      _ry = (144);
                      ; /* break @L84075(解释器同序:顺序结构下无操作) */
                    } break;
                    default: {
                      _rx = (36);
                      _ry = (180);
                      ; /* break @L84079(解释器同序:顺序结构下无操作) */
                    }
                    }
                   }
                  }
                 } else {
                  if (((up==num11&&down==num&&left==num&&right==num)||(up==num&&down==num11&&left==num&&right==num)||(up==num&&down==num&&left==num11&&right==num)||(up==num&&down==num&&left==num&&right==num11))) {
                   switch (num6) {
                   case 0: {
                     _rx = (18);
                     _ry = (18);
                     ; /* break @L84090(解释器同序:顺序结构下无操作) */
                   } break;
                   case 1: {
                     _rx = (36);
                     _ry = (18);
                     ; /* break @L84094(解释器同序:顺序结构下无操作) */
                   } break;
                   default: {
                     _rx = (54);
                     _ry = (18);
                     ; /* break @L84098(解释器同序:顺序结构下无操作) */
                   }
                   }
                  }
                 }
                }
               }
              }
             }
            }
           }
          }
         }
        }
       }
      }
     }
     if (((up==num||up==num11)&&(down==num||down==num11)&&(left==num||left==num11)&&(right==num||right==num11))) {
      if ((upLeft!=num&&upLeft!=num11&&(upRight==num||upRight==num11)&&(downLeft==num||downLeft==num11)&&(downRight==num||downRight==num11))) {
       switch (num6) {
       case 0: {
         _rx = (54);
         _ry = (108);
         ; /* break @L84110(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (54);
         _ry = (144);
         ; /* break @L84114(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (54);
         _ry = (180);
         ; /* break @L84118(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       if ((upRight!=num&&upRight!=num11&&(upLeft==num||upLeft==num11)&&(downLeft==num||downLeft==num11)&&(downRight==num||downRight==num11))) {
        switch (num6) {
        case 0: {
          _rx = (36);
          _ry = (108);
          ; /* break @L84128(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (36);
          _ry = (144);
          ; /* break @L84132(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (36);
          _ry = (180);
          ; /* break @L84136(解释器同序:顺序结构下无操作) */
        }
        }
       } else {
        if ((downLeft!=num&&downLeft!=num11&&(upLeft==num||upLeft==num11)&&(upRight==num||upRight==num11)&&(downRight==num||downRight==num11))) {
         switch (num6) {
         case 0: {
           _rx = (54);
           _ry = (90);
           ; /* break @L84146(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (54);
           _ry = (126);
           ; /* break @L84150(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (54);
           _ry = (162);
           ; /* break @L84154(解释器同序:顺序结构下无操作) */
         }
         }
        } else {
         if ((downRight!=num&&downRight!=num11&&(upLeft==num||upLeft==num11)&&(downLeft==num||downLeft==num11)&&(upRight==num||upRight==num11))) {
          switch (num6) {
          case 0: {
            _rx = (36);
            _ry = (90);
            ; /* break @L84164(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (36);
            _ry = (126);
            ; /* break @L84168(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (36);
            _ry = (162);
            ; /* break @L84172(解释器同序:顺序结构下无操作) */
          }
          }
         }
        }
       }
      }
     }
     if ((up!=num11&&up!=num&&down==num&&left!=num11&&left!=num&&right==num&&downRight!=num11&&downRight!=num)) {
      switch (num6) {
      case 0: {
        _rx = (90);
        _ry = (270);
        ; /* break @L84183(解释器同序:顺序结构下无操作) */
      } break;
      case 1: {
        _rx = (108);
        _ry = (270);
        ; /* break @L84187(解释器同序:顺序结构下无操作) */
      } break;
      default: {
        _rx = (126);
        _ry = (270);
        ; /* break @L84191(解释器同序:顺序结构下无操作) */
      }
      }
     } else {
      if ((up!=num11&&up!=num&&down==num&&left==num&&right!=num11&&right!=num&&downLeft!=num11&&downLeft!=num)) {
       switch (num6) {
       case 0: {
         _rx = (144);
         _ry = (270);
         ; /* break @L84201(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (162);
         _ry = (270);
         ; /* break @L84205(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (180);
         _ry = (270);
         ; /* break @L84209(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       if ((down!=num11&&down!=num&&up==num&&left!=num11&&left!=num&&right==num&&upRight!=num11&&upRight!=num)) {
        switch (num6) {
        case 0: {
          _rx = (90);
          _ry = (288);
          ; /* break @L84219(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (108);
          _ry = (288);
          ; /* break @L84223(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (126);
          _ry = (288);
          ; /* break @L84227(解释器同序:顺序结构下无操作) */
        }
        }
       } else {
        if ((down!=num11&&down!=num&&up==num&&left==num&&right!=num11&&right!=num&&upLeft!=num11&&upLeft!=num)) {
         switch (num6) {
         case 0: {
           _rx = (144);
           _ry = (288);
           ; /* break @L84237(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (162);
           _ry = (288);
           ; /* break @L84241(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (180);
           _ry = (288);
           ; /* break @L84245(解释器同序:顺序结构下无操作) */
         }
         }
        } else {
         if ((up!=num&&up!=num11&&down==num&&left==num&&right==num&&downLeft!=num&&downLeft!=num11&&downRight!=num&&downRight!=num11)) {
          switch (num6) {
          case 0: {
            _rx = (144);
            _ry = (216);
            ; /* break @L84255(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (198);
            _ry = (216);
            ; /* break @L84259(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (252);
            _ry = (216);
            ; /* break @L84263(解释器同序:顺序结构下无操作) */
          }
          }
         } else {
          if ((down!=num&&down!=num11&&up==num&&left==num&&right==num&&upLeft!=num&&upLeft!=num11&&upRight!=num&&upRight!=num11)) {
           switch (num6) {
           case 0: {
             _rx = (144);
             _ry = (252);
             ; /* break @L84273(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (198);
             _ry = (252);
             ; /* break @L84277(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (252);
             _ry = (252);
             ; /* break @L84281(解释器同序:顺序结构下无操作) */
           }
           }
          } else {
           if ((left!=num&&left!=num11&&down==num&&up==num&&right==num&&upRight!=num&&upRight!=num11&&downRight!=num&&downRight!=num11)) {
            switch (num6) {
            case 0: {
              _rx = (126);
              _ry = (234);
              ; /* break @L84291(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (180);
              _ry = (234);
              ; /* break @L84295(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (234);
              _ry = (234);
              ; /* break @L84299(解释器同序:顺序结构下无操作) */
            }
            }
           } else {
            if ((right!=num&&right!=num11&&down==num&&up==num&&left==num&&upLeft!=num&&upLeft!=num11&&downLeft!=num&&downLeft!=num11)) {
             switch (num6) {
             case 0: {
               _rx = (162);
               _ry = (234);
               ; /* break @L84309(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (216);
               _ry = (234);
               ; /* break @L84313(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (270);
               _ry = (234);
               ; /* break @L84317(解释器同序:顺序结构下无操作) */
             }
             }
            } else {
             if ((up!=num11&&up!=num&&(down==num11||down==num)&&left==num11&&right==num11)) {
              switch (num6) {
              case 0: {
                _rx = (36);
                _ry = (270);
                ; /* break @L84327(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (54);
                _ry = (270);
                ; /* break @L84331(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (72);
                _ry = (270);
                ; /* break @L84335(解释器同序:顺序结构下无操作) */
              }
              }
             } else {
              if ((down!=num11&&down!=num&&(up==num11||up==num)&&left==num11&&right==num11)) {
               switch (num6) {
               case 0: {
                 _rx = (36);
                 _ry = (288);
                 ; /* break @L84345(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (54);
                 _ry = (288);
                 ; /* break @L84349(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (72);
                 _ry = (288);
                 ; /* break @L84353(解释器同序:顺序结构下无操作) */
               }
               }
              } else {
               if ((left!=num11&&left!=num&&(right==num11||right==num)&&up==num11&&down==num11)) {
                switch (num6) {
                case 0: {
                  _rx = (0);
                  _ry = (270);
                  ; /* break @L84363(解释器同序:顺序结构下无操作) */
                } break;
                case 1: {
                  _rx = (0);
                  _ry = (288);
                  ; /* break @L84367(解释器同序:顺序结构下无操作) */
                } break;
                default: {
                  _rx = (0);
                  _ry = (306);
                  ; /* break @L84371(解释器同序:顺序结构下无操作) */
                }
                }
               } else {
                if ((right!=num11&&right!=num&&(left==num11||left==num)&&up==num11&&down==num11)) {
                 switch (num6) {
                 case 0: {
                   _rx = (18);
                   _ry = (270);
                   ; /* break @L84381(解释器同序:顺序结构下无操作) */
                 } break;
                 case 1: {
                   _rx = (18);
                   _ry = (288);
                   ; /* break @L84385(解释器同序:顺序结构下无操作) */
                 } break;
                 default: {
                   _rx = (18);
                   _ry = (306);
                   ; /* break @L84389(解释器同序:顺序结构下无操作) */
                 }
                 }
                } else {
                 if ((up==num&&down==num11&&left==num11&&right==num11)) {
                  switch (num6) {
                  case 0: {
                    _rx = (198);
                    _ry = (288);
                    ; /* break @L84399(解释器同序:顺序结构下无操作) */
                  } break;
                  case 1: {
                    _rx = (216);
                    _ry = (288);
                    ; /* break @L84403(解释器同序:顺序结构下无操作) */
                  } break;
                  default: {
                    _rx = (234);
                    _ry = (288);
                    ; /* break @L84407(解释器同序:顺序结构下无操作) */
                  }
                  }
                 } else {
                  if ((up==num11&&down==num&&left==num11&&right==num11)) {
                   switch (num6) {
                   case 0: {
                     _rx = (198);
                     _ry = (270);
                     ; /* break @L84417(解释器同序:顺序结构下无操作) */
                   } break;
                   case 1: {
                     _rx = (216);
                     _ry = (270);
                     ; /* break @L84421(解释器同序:顺序结构下无操作) */
                   } break;
                   default: {
                     _rx = (234);
                     _ry = (270);
                     ; /* break @L84425(解释器同序:顺序结构下无操作) */
                   }
                   }
                  } else {
                   if ((up==num11&&down==num11&&left==num&&right==num11)) {
                    switch (num6) {
                    case 0: {
                      _rx = (198);
                      _ry = (306);
                      ; /* break @L84435(解释器同序:顺序结构下无操作) */
                    } break;
                    case 1: {
                      _rx = (216);
                      _ry = (306);
                      ; /* break @L84439(解释器同序:顺序结构下无操作) */
                    } break;
                    default: {
                      _rx = (234);
                      _ry = (306);
                      ; /* break @L84443(解释器同序:顺序结构下无操作) */
                    }
                    }
                   } else {
                    if ((up==num11&&down==num11&&left==num11&&right==num)) {
                     switch (num6) {
                     case 0: {
                       _rx = (144);
                       _ry = (306);
                       ; /* break @L84453(解释器同序:顺序结构下无操作) */
                     } break;
                     case 1: {
                       _rx = (162);
                       _ry = (306);
                       ; /* break @L84457(解释器同序:顺序结构下无操作) */
                     } break;
                     default: {
                       _rx = (180);
                       _ry = (306);
                       ; /* break @L84461(解释器同序:顺序结构下无操作) */
                     }
                     }
                    }
                   }
                  }
                 }
                }
               }
              }
             }
            }
           }
          }
         }
        }
       }
      }
     }
     if ((up!=num&&up!=num11&&down==num&&left==num&&right==num)) {
      if (((downLeft==num11||downLeft==num)&&downRight!=num11&&downRight!=num)) {
       switch (num6) {
       case 0: {
         _rx = (0);
         _ry = (324);
         ; /* break @L84473(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (18);
         _ry = (324);
         ; /* break @L84477(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (36);
         _ry = (324);
         ; /* break @L84481(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       if (((downRight==num11||downRight==num)&&downLeft!=num11&&downLeft!=num)) {
        switch (num6) {
        case 0: {
          _rx = (54);
          _ry = (324);
          ; /* break @L84491(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (72);
          _ry = (324);
          ; /* break @L84495(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (90);
          _ry = (324);
          ; /* break @L84499(解释器同序:顺序结构下无操作) */
        }
        }
       }
      }
     } else {
      if ((down!=num&&down!=num11&&up==num&&left==num&&right==num)) {
       if (((upLeft==num11||upLeft==num)&&upRight!=num11&&upRight!=num)) {
        switch (num6) {
        case 0: {
          _rx = (0);
          _ry = (342);
          ; /* break @L84512(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (18);
          _ry = (342);
          ; /* break @L84516(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (36);
          _ry = (342);
          ; /* break @L84520(解释器同序:顺序结构下无操作) */
        }
        }
       } else {
        if (((upRight==num11||upRight==num)&&upLeft!=num11&&upLeft!=num)) {
         switch (num6) {
         case 0: {
           _rx = (54);
           _ry = (342);
           ; /* break @L84530(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (72);
           _ry = (342);
           ; /* break @L84534(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (90);
           _ry = (342);
           ; /* break @L84538(解释器同序:顺序结构下无操作) */
         }
         }
        }
       }
      } else {
       if ((left!=num&&left!=num11&&up==num&&down==num&&right==num)) {
        if (((upRight==num11||upRight==num)&&downRight!=num11&&downRight!=num)) {
         switch (num6) {
         case 0: {
           _rx = (54);
           _ry = (360);
           ; /* break @L84551(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (72);
           _ry = (360);
           ; /* break @L84555(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (90);
           _ry = (360);
           ; /* break @L84559(解释器同序:顺序结构下无操作) */
         }
         }
        } else {
         if (((downRight==num11||downRight==num)&&upRight!=num11&&upRight!=num)) {
          switch (num6) {
          case 0: {
            _rx = (0);
            _ry = (360);
            ; /* break @L84569(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (18);
            _ry = (360);
            ; /* break @L84573(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (36);
            _ry = (360);
            ; /* break @L84577(解释器同序:顺序结构下无操作) */
          }
          }
         }
        }
       } else {
        if ((right!=num&&right!=num11&&up==num&&down==num&&left==num)) {
         if (((upLeft==num11||upLeft==num)&&downLeft!=num11&&downLeft!=num)) {
          switch (num6) {
          case 0: {
            _rx = (0);
            _ry = (378);
            ; /* break @L84590(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (18);
            _ry = (378);
            ; /* break @L84594(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (36);
            _ry = (378);
            ; /* break @L84598(解释器同序:顺序结构下无操作) */
          }
          }
         } else {
          if (((downLeft==num11||downLeft==num)&&upLeft!=num11&&upLeft!=num)) {
           switch (num6) {
           case 0: {
             _rx = (54);
             _ry = (378);
             ; /* break @L84608(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (72);
             _ry = (378);
             ; /* break @L84612(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (90);
             _ry = (378);
             ; /* break @L84616(解释器同序:顺序结构下无操作) */
           }
           }
          }
         }
        }
       }
      }
     }
     if (((up==num||up==num11)&&(down==num||down==num11)&&(left==num||left==num11)&&(right==num||right==num11)&&upLeft!=-(1)&&upRight!=-(1)&&downLeft!=-(1)&&downRight!=-(1))) {
      if (((i+j)%(2)==(1))) {
       switch (num6) {
       case 0: {
         _rx = (108);
         _ry = (198);
         ; /* break @L84629(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (126);
         _ry = (198);
         ; /* break @L84633(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (144);
         _ry = (198);
         ; /* break @L84637(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       switch (num6) {
       case 0: {
         _rx = (18);
         _ry = (18);
         ; /* break @L84647(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (36);
         _ry = (18);
         ; /* break @L84651(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (54);
         _ry = (18);
         ; /* break @L84655(解释器同序:顺序结构下无操作) */
       }
       }
      }
     }
     if ((num11>=(0)&&num11<800&&S["Dirt"](num11))) {
      {
       const _10206=(-(2));
       const _10207=S["Dirt"];
       { const _c=up; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10206; } }
       { const _c=down; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10206; } }
       { const _c=left; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10206; } }
       { const _c=right; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10206; } }
       { const _c=upLeft; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10206; } }
       { const _c=upRight; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10206; } }
       { const _c=downLeft; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10206; } }
       { const _c=downRight; if ((_10207!==null?(_c>-1&&_10207(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10206; } }
      }
     } else {
      if ((num11>=(0)&&num11<800&&S["Mud"](num11))) {
       {
        const _10208=(-(2));
        const _10209=S["Mud"];
        { const _c=up; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10208; } }
        { const _c=down; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10208; } }
        { const _c=left; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10208; } }
        { const _c=right; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10208; } }
        { const _c=upLeft; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10208; } }
        { const _c=upRight; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10208; } }
        { const _c=downLeft; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10208; } }
        { const _c=downRight; if ((_10209!==null?(_c>-1&&_10209(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10208; } }
       }
      } else {
       {
        const _10210=(-(2));
        const _10211=(num11);
        { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10210; } }
        { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10210; } }
        { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10210; } }
        { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10210; } }
        { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10210; } }
        { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10210; } }
        { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10210; } }
        { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10211)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10210; } }
       }
      }
     }
     { if (!DRV.inv()) {
       if (DRV.cull(0,-1)) { up = -1; }
       if (DRV.cull(0,1)) { down = -1; }
       if (DRV.cull(-1,0)) { left = -1; }
       if (DRV.cull(1,0)) { right = -1; }
       if (DRV.cull(-1,-1)) { upLeft = -1; }
       if (DRV.cull(1,-1)) { upRight = -1; }
       if (DRV.cull(-1,1)) { downLeft = -1; }
       if (DRV.cull(1,1)) { downRight = -1; }
     } }
    }
    {
     const _10212=(num);
     const _10214=(num);
     const _10213=(dd)=>TM[_10214]?.[dd]??false;
     { const _c=up; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10212; } }
     { const _c=down; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10212; } }
     { const _c=left; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10212; } }
     { const _c=right; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10212; } }
     { const _c=upLeft; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10212; } }
     { const _c=upRight; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10212; } }
     { const _c=downLeft; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10212; } }
     { const _c=downRight; if ((_10213!==null?(_c>-1&&_10213(_c)):(_c===null)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10212; } }
    }
    if ((_rx==-(1)&&_ry==-(1)&&(S.tileMergeDirt(num)||(num>-(1)&&S["ChecksForMerge"](num))))) {
     if ((!flag7)) {
      flag7 = true;
      {
       const _10215=(num);
       const _10216=(-(1));
       const _10217=S["tileSolid"];
       { const _c=up; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { up=_10216; } }
       { const _c=down; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { down=_10216; } }
       { const _c=left; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { left=_10216; } }
       { const _c=right; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { right=_10216; } }
       { const _c=upLeft; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { upLeft=_10216; } }
       { const _c=upRight; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { upRight=_10216; } }
       { const _c=downLeft; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { downLeft=_10216; } }
       { const _c=downRight; if (_c>-1 && _c!==_10215 && !( (_10217)!==null && _10217(_c) ) && ( (null)===null || _c!==(null) ) ) { downRight=_10216; } }
      }
     }
     if ((up>-(1)&&up!=num)) {
      up = -(1);
     }
     if ((down>-(1)&&down!=num)) {
      down = -(1);
     }
     if ((left>-(1)&&left!=num)) {
      left = -(1);
     }
     if ((right>-(1)&&right!=num)) {
      right = -(1);
     }
     { if (!DRV.inv()) {
       if (DRV.cull(0,-1)) { up = -1; }
       if (DRV.cull(0,1)) { down = -1; }
       if (DRV.cull(-1,0)) { left = -1; }
       if (DRV.cull(1,0)) { right = -1; }
       if (DRV.cull(-1,-1)) { upLeft = -1; }
       if (DRV.cull(1,-1)) { upRight = -1; }
       if (DRV.cull(-1,1)) { downLeft = -1; }
       if (DRV.cull(1,1)) { downRight = -1; }
     } }
     if ((up!=-(1)&&down!=-(1)&&left!=-(1)&&right!=-(1))) {
      if ((up==-(2)&&down==num&&left==num&&right==num)) {
       switch (num6) {
       case 0: {
         _rx = (144);
         _ry = (108);
         ; /* break @L84707(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (162);
         _ry = (108);
         ; /* break @L84711(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (180);
         _ry = (108);
         ; /* break @L84715(解释器同序:顺序结构下无操作) */
       }
       }
       MF.up = true;
      } else {
       if ((up==num&&down==-(2)&&left==num&&right==num)) {
        switch (num6) {
        case 0: {
          _rx = (144);
          _ry = (90);
          ; /* break @L84726(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (162);
          _ry = (90);
          ; /* break @L84730(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (180);
          _ry = (90);
          ; /* break @L84734(解释器同序:顺序结构下无操作) */
        }
        }
        MF.down = true;
       } else {
        if ((up==num&&down==num&&left==-(2)&&right==num)) {
         switch (num6) {
         case 0: {
           _rx = (162);
           _ry = (126);
           ; /* break @L84745(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (162);
           _ry = (144);
           ; /* break @L84749(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (162);
           _ry = (162);
           ; /* break @L84753(解释器同序:顺序结构下无操作) */
         }
         }
         MF.left = true;
        } else {
         if ((up==num&&down==num&&left==num&&right==-(2))) {
          switch (num6) {
          case 0: {
            _rx = (144);
            _ry = (126);
            ; /* break @L84764(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (144);
            _ry = (144);
            ; /* break @L84768(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (144);
            _ry = (162);
            ; /* break @L84772(解释器同序:顺序结构下无操作) */
          }
          }
          MF.right = true;
         } else {
          if ((up==-(2)&&down==num&&left==-(2)&&right==num)) {
           switch (num6) {
           case 0: {
             _rx = (36);
             _ry = (90);
             ; /* break @L84783(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (36);
             _ry = (126);
             ; /* break @L84787(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (36);
             _ry = (162);
             ; /* break @L84791(解释器同序:顺序结构下无操作) */
           }
           }
           MF.up = true;
           MF.left = true;
          } else {
           if ((up==-(2)&&down==num&&left==num&&right==-(2))) {
            switch (num6) {
            case 0: {
              _rx = (54);
              _ry = (90);
              ; /* break @L84803(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (54);
              _ry = (126);
              ; /* break @L84807(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (54);
              _ry = (162);
              ; /* break @L84811(解释器同序:顺序结构下无操作) */
            }
            }
            MF.up = true;
            MF.right = true;
           } else {
            if ((up==num&&down==-(2)&&left==-(2)&&right==num)) {
             switch (num6) {
             case 0: {
               _rx = (36);
               _ry = (108);
               ; /* break @L84823(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (36);
               _ry = (144);
               ; /* break @L84827(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (36);
               _ry = (180);
               ; /* break @L84831(解释器同序:顺序结构下无操作) */
             }
             }
             MF.down = true;
             MF.left = true;
            } else {
             if ((up==num&&down==-(2)&&left==num&&right==-(2))) {
              switch (num6) {
              case 0: {
                _rx = (54);
                _ry = (108);
                ; /* break @L84843(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (54);
                _ry = (144);
                ; /* break @L84847(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (54);
                _ry = (180);
                ; /* break @L84851(解释器同序:顺序结构下无操作) */
              }
              }
              MF.down = true;
              MF.right = true;
             } else {
              if ((up==num&&down==num&&left==-(2)&&right==-(2))) {
               switch (num6) {
               case 0: {
                 _rx = (180);
                 _ry = (126);
                 ; /* break @L84863(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (180);
                 _ry = (144);
                 ; /* break @L84867(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (180);
                 _ry = (162);
                 ; /* break @L84871(解释器同序:顺序结构下无操作) */
               }
               }
               MF.left = true;
               MF.right = true;
              } else {
               if ((up==-(2)&&down==-(2)&&left==num&&right==num)) {
                switch (num6) {
                case 0: {
                  _rx = (144);
                  _ry = (180);
                  ; /* break @L84883(解释器同序:顺序结构下无操作) */
                } break;
                case 1: {
                  _rx = (162);
                  _ry = (180);
                  ; /* break @L84887(解释器同序:顺序结构下无操作) */
                } break;
                default: {
                  _rx = (180);
                  _ry = (180);
                  ; /* break @L84891(解释器同序:顺序结构下无操作) */
                }
                }
                MF.up = true;
                MF.down = true;
               } else {
                if ((up==-(2)&&down==num&&left==-(2)&&right==-(2))) {
                 switch (num6) {
                 case 0: {
                   _rx = (198);
                   _ry = (90);
                   ; /* break @L84903(解释器同序:顺序结构下无操作) */
                 } break;
                 case 1: {
                   _rx = (198);
                   _ry = (108);
                   ; /* break @L84907(解释器同序:顺序结构下无操作) */
                 } break;
                 default: {
                   _rx = (198);
                   _ry = (126);
                   ; /* break @L84911(解释器同序:顺序结构下无操作) */
                 }
                 }
                 MF.up = true;
                 MF.left = true;
                 MF.right = true;
                } else {
                 if ((up==num&&down==-(2)&&left==-(2)&&right==-(2))) {
                  switch (num6) {
                  case 0: {
                    _rx = (198);
                    _ry = (144);
                    ; /* break @L84924(解释器同序:顺序结构下无操作) */
                  } break;
                  case 1: {
                    _rx = (198);
                    _ry = (162);
                    ; /* break @L84928(解释器同序:顺序结构下无操作) */
                  } break;
                  default: {
                    _rx = (198);
                    _ry = (180);
                    ; /* break @L84932(解释器同序:顺序结构下无操作) */
                  }
                  }
                  MF.down = true;
                  MF.left = true;
                  MF.right = true;
                 } else {
                  if ((up==-(2)&&down==-(2)&&left==num&&right==-(2))) {
                   switch (num6) {
                   case 0: {
                     _rx = (216);
                     _ry = (144);
                     ; /* break @L84945(解释器同序:顺序结构下无操作) */
                   } break;
                   case 1: {
                     _rx = (216);
                     _ry = (162);
                     ; /* break @L84949(解释器同序:顺序结构下无操作) */
                   } break;
                   default: {
                     _rx = (216);
                     _ry = (180);
                     ; /* break @L84953(解释器同序:顺序结构下无操作) */
                   }
                   }
                   MF.up = true;
                   MF.down = true;
                   MF.right = true;
                  } else {
                   if ((up==-(2)&&down==-(2)&&left==-(2)&&right==num)) {
                    switch (num6) {
                    case 0: {
                      _rx = (216);
                      _ry = (90);
                      ; /* break @L84966(解释器同序:顺序结构下无操作) */
                    } break;
                    case 1: {
                      _rx = (216);
                      _ry = (108);
                      ; /* break @L84970(解释器同序:顺序结构下无操作) */
                    } break;
                    default: {
                      _rx = (216);
                      _ry = (126);
                      ; /* break @L84974(解释器同序:顺序结构下无操作) */
                    }
                    }
                    MF.up = true;
                    MF.down = true;
                    MF.left = true;
                   } else {
                    if ((up==-(2)&&down==-(2)&&left==-(2)&&right==-(2))) {
                     switch (num6) {
                     case 0: {
                       _rx = (108);
                       _ry = (198);
                       ; /* break @L84987(解释器同序:顺序结构下无操作) */
                     } break;
                     case 1: {
                       _rx = (126);
                       _ry = (198);
                       ; /* break @L84991(解释器同序:顺序结构下无操作) */
                     } break;
                     default: {
                       _rx = (144);
                       _ry = (198);
                       ; /* break @L84995(解释器同序:顺序结构下无操作) */
                     }
                     }
                     MF.up = true;
                     MF.down = true;
                     MF.left = true;
                     MF.right = true;
                    } else {
                     if ((up==num&&down==num&&left==num&&right==num)) {
                      if ((upLeft==-(2))) {
                       switch (num6) {
                       case 0: {
                         _rx = (18);
                         _ry = (108);
                         ; /* break @L85011(解释器同序:顺序结构下无操作) */
                       } break;
                       case 1: {
                         _rx = (18);
                         _ry = (144);
                         ; /* break @L85015(解释器同序:顺序结构下无操作) */
                       } break;
                       default: {
                         _rx = (18);
                         _ry = (180);
                         ; /* break @L85019(解释器同序:顺序结构下无操作) */
                       }
                       }
                      }
                      if ((upRight==-(2))) {
                       switch (num6) {
                       case 0: {
                         _rx = (0);
                         _ry = (108);
                         ; /* break @L85029(解释器同序:顺序结构下无操作) */
                       } break;
                       case 1: {
                         _rx = (0);
                         _ry = (144);
                         ; /* break @L85033(解释器同序:顺序结构下无操作) */
                       } break;
                       default: {
                         _rx = (0);
                         _ry = (180);
                         ; /* break @L85037(解释器同序:顺序结构下无操作) */
                       }
                       }
                      }
                      if ((downLeft==-(2))) {
                       switch (num6) {
                       case 0: {
                         _rx = (18);
                         _ry = (90);
                         ; /* break @L85047(解释器同序:顺序结构下无操作) */
                       } break;
                       case 1: {
                         _rx = (18);
                         _ry = (126);
                         ; /* break @L85051(解释器同序:顺序结构下无操作) */
                       } break;
                       default: {
                         _rx = (18);
                         _ry = (162);
                         ; /* break @L85055(解释器同序:顺序结构下无操作) */
                       }
                       }
                      }
                      if ((downRight==-(2))) {
                       switch (num6) {
                       case 0: {
                         _rx = (0);
                         _ry = (90);
                         ; /* break @L85065(解释器同序:顺序结构下无操作) */
                       } break;
                       case 1: {
                         _rx = (0);
                         _ry = (126);
                         ; /* break @L85069(解释器同序:顺序结构下无操作) */
                       } break;
                       default: {
                         _rx = (0);
                         _ry = (162);
                         ; /* break @L85073(解释器同序:顺序结构下无操作) */
                       }
                       }
                      }
                     }
                    }
                   }
                  }
                 }
                }
               }
              }
             }
            }
           }
          }
         }
        }
       }
      }
     } else {
      if ((num!=(2)&&num!=(23)&&num!=(60)&&num!=(70)&&num!=(109)&&num!=(199)&&num!=(477)&&num!=(492)&&num!=(633)&&num!=(661)&&num!=(662))) {
       if ((up==-(1)&&down==-(2)&&left==num&&right==num)) {
        switch (num6) {
        case 0: {
          _rx = (234);
          _ry = (0);
          ; /* break @L85089(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (252);
          _ry = (0);
          ; /* break @L85093(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (270);
          _ry = (0);
          ; /* break @L85097(解释器同序:顺序结构下无操作) */
        }
        }
        MF.down = true;
       } else {
        if ((up==-(2)&&down==-(1)&&left==num&&right==num)) {
         switch (num6) {
         case 0: {
           _rx = (234);
           _ry = (18);
           ; /* break @L85108(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (252);
           _ry = (18);
           ; /* break @L85112(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (270);
           _ry = (18);
           ; /* break @L85116(解释器同序:顺序结构下无操作) */
         }
         }
         MF.up = true;
        } else {
         if ((up==num&&down==num&&left==-(1)&&right==-(2))) {
          switch (num6) {
          case 0: {
            _rx = (234);
            _ry = (36);
            ; /* break @L85127(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (252);
            _ry = (36);
            ; /* break @L85131(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (270);
            _ry = (36);
            ; /* break @L85135(解释器同序:顺序结构下无操作) */
          }
          }
          MF.right = true;
         } else {
          if ((up==num&&down==num&&left==-(2)&&right==-(1))) {
           switch (num6) {
           case 0: {
             _rx = (234);
             _ry = (54);
             ; /* break @L85146(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (252);
             _ry = (54);
             ; /* break @L85150(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (270);
             _ry = (54);
             ; /* break @L85154(解释器同序:顺序结构下无操作) */
           }
           }
           MF.left = true;
          }
         }
        }
       }
      }
      if ((up!=-(1)&&down!=-(1)&&left==-(1)&&right==num)) {
       if ((up==-(2)&&down==num)) {
        switch (num6) {
        case 0: {
          _rx = (72);
          _ry = (144);
          ; /* break @L85168(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (72);
          _ry = (162);
          ; /* break @L85172(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (72);
          _ry = (180);
          ; /* break @L85176(解释器同序:顺序结构下无操作) */
        }
        }
        MF.up = true;
       } else {
        if ((down==-(2)&&up==num)) {
         switch (num6) {
         case 0: {
           _rx = (72);
           _ry = (90);
           ; /* break @L85187(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (72);
           _ry = (108);
           ; /* break @L85191(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (72);
           _ry = (126);
           ; /* break @L85195(解释器同序:顺序结构下无操作) */
         }
         }
         MF.down = true;
        }
       }
      } else {
       if ((up!=-(1)&&down!=-(1)&&left==num&&right==-(1))) {
        if ((up==-(2)&&down==num)) {
         switch (num6) {
         case 0: {
           _rx = (90);
           _ry = (144);
           ; /* break @L85209(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (90);
           _ry = (162);
           ; /* break @L85213(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (90);
           _ry = (180);
           ; /* break @L85217(解释器同序:顺序结构下无操作) */
         }
         }
         MF.up = true;
        } else {
         if ((down==-(2)&&up==num)) {
          switch (num6) {
          case 0: {
            _rx = (90);
            _ry = (90);
            ; /* break @L85228(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (90);
            _ry = (108);
            ; /* break @L85232(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (90);
            _ry = (126);
            ; /* break @L85236(解释器同序:顺序结构下无操作) */
          }
          }
          MF.down = true;
         }
        }
       } else {
        if ((up==-(1)&&down==num&&left!=-(1)&&right!=-(1))) {
         if ((left==-(2)&&right==num)) {
          switch (num6) {
          case 0: {
            _rx = (0);
            _ry = (198);
            ; /* break @L85250(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (18);
            _ry = (198);
            ; /* break @L85254(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (36);
            _ry = (198);
            ; /* break @L85258(解释器同序:顺序结构下无操作) */
          }
          }
          MF.left = true;
         } else {
          if ((right==-(2)&&left==num)) {
           switch (num6) {
           case 0: {
             _rx = (54);
             _ry = (198);
             ; /* break @L85269(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (72);
             _ry = (198);
             ; /* break @L85273(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (90);
             _ry = (198);
             ; /* break @L85277(解释器同序:顺序结构下无操作) */
           }
           }
           MF.right = true;
          }
         }
        } else {
         if ((up==num&&down==-(1)&&left!=-(1)&&right!=-(1))) {
          if ((left==-(2)&&right==num)) {
           switch (num6) {
           case 0: {
             _rx = (0);
             _ry = (216);
             ; /* break @L85291(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (18);
             _ry = (216);
             ; /* break @L85295(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (36);
             _ry = (216);
             ; /* break @L85299(解释器同序:顺序结构下无操作) */
           }
           }
           MF.left = true;
          } else {
           if ((right==-(2)&&left==num)) {
            switch (num6) {
            case 0: {
              _rx = (54);
              _ry = (216);
              ; /* break @L85310(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (72);
              _ry = (216);
              ; /* break @L85314(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (90);
              _ry = (216);
              ; /* break @L85318(解释器同序:顺序结构下无操作) */
            }
            }
            MF.right = true;
           }
          }
         } else {
          if ((up!=-(1)&&down!=-(1)&&left==-(1)&&right==-(1))) {
           if ((up==-(2)&&down==-(2))) {
            switch (num6) {
            case 0: {
              _rx = (108);
              _ry = (216);
              ; /* break @L85332(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (108);
              _ry = (234);
              ; /* break @L85336(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (108);
              _ry = (252);
              ; /* break @L85340(解释器同序:顺序结构下无操作) */
            }
            }
            MF.up = true;
            MF.down = true;
           } else {
            if ((up==-(2))) {
             switch (num6) {
             case 0: {
               _rx = (126);
               _ry = (144);
               ; /* break @L85352(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (126);
               _ry = (162);
               ; /* break @L85356(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (126);
               _ry = (180);
               ; /* break @L85360(解释器同序:顺序结构下无操作) */
             }
             }
             MF.up = true;
            } else {
             if ((down==-(2))) {
              switch (num6) {
              case 0: {
                _rx = (126);
                _ry = (90);
                ; /* break @L85371(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (126);
                _ry = (108);
                ; /* break @L85375(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (126);
                _ry = (126);
                ; /* break @L85379(解释器同序:顺序结构下无操作) */
              }
              }
              MF.down = true;
             }
            }
           }
          } else {
           if ((up==-(1)&&down==-(1)&&left!=-(1)&&right!=-(1))) {
            if ((left==-(2)&&right==-(2))) {
             switch (num6) {
             case 0: {
               _rx = (162);
               _ry = (198);
               ; /* break @L85393(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (180);
               _ry = (198);
               ; /* break @L85397(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (198);
               _ry = (198);
               ; /* break @L85401(解释器同序:顺序结构下无操作) */
             }
             }
             MF.left = true;
             MF.right = true;
            } else {
             if ((left==-(2))) {
              switch (num6) {
              case 0: {
                _rx = (0);
                _ry = (252);
                ; /* break @L85413(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (18);
                _ry = (252);
                ; /* break @L85417(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (36);
                _ry = (252);
                ; /* break @L85421(解释器同序:顺序结构下无操作) */
              }
              }
              MF.left = true;
             } else {
              if ((right==-(2))) {
               switch (num6) {
               case 0: {
                 _rx = (54);
                 _ry = (252);
                 ; /* break @L85432(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (72);
                 _ry = (252);
                 ; /* break @L85436(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (90);
                 _ry = (252);
                 ; /* break @L85440(解释器同序:顺序结构下无操作) */
               }
               }
               MF.right = true;
              }
             }
            }
           } else {
            if ((up==-(2)&&down==-(1)&&left==-(1)&&right==-(1))) {
             switch (num6) {
             case 0: {
               _rx = (108);
               _ry = (144);
               ; /* break @L85452(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (108);
               _ry = (162);
               ; /* break @L85456(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (108);
               _ry = (180);
               ; /* break @L85460(解释器同序:顺序结构下无操作) */
             }
             }
             MF.up = true;
            } else {
             if ((up==-(1)&&down==-(2)&&left==-(1)&&right==-(1))) {
              switch (num6) {
              case 0: {
                _rx = (108);
                _ry = (90);
                ; /* break @L85471(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (108);
                _ry = (108);
                ; /* break @L85475(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (108);
                _ry = (126);
                ; /* break @L85479(解释器同序:顺序结构下无操作) */
              }
              }
              MF.down = true;
             } else {
              if ((up==-(1)&&down==-(1)&&left==-(2)&&right==-(1))) {
               switch (num6) {
               case 0: {
                 _rx = (0);
                 _ry = (234);
                 ; /* break @L85490(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (18);
                 _ry = (234);
                 ; /* break @L85494(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (36);
                 _ry = (234);
                 ; /* break @L85498(解释器同序:顺序结构下无操作) */
               }
               }
               MF.left = true;
              } else {
               if ((up==-(1)&&down==-(1)&&left==-(1)&&right==-(2))) {
                switch (num6) {
                case 0: {
                  _rx = (54);
                  _ry = (234);
                  ; /* break @L85509(解释器同序:顺序结构下无操作) */
                } break;
                case 1: {
                  _rx = (72);
                  _ry = (234);
                  ; /* break @L85513(解释器同序:顺序结构下无操作) */
                } break;
                default: {
                  _rx = (90);
                  _ry = (234);
                  ; /* break @L85517(解释器同序:顺序结构下无操作) */
                }
                }
                MF.right = true;
               }
              }
             }
            }
           }
          }
         }
        }
       }
      }
     }
    }
    num12 = (0);
    if ((S["HasSlopeFrames"](num))) {
     if ((num12==(0))) {
      flag8 = num==up&&TU.bare!=null&&TU.tops();
      flag9 = num==left&&TL.bare!=null&&TL.lefts();
      flag10 = num==right&&TR.bare!=null&&TR.rights();
      flag11 = num==down&&TD.bare!=null&&TD.bots();
      num13 = (0);
      num14 = (0);
      if ((flag8 ? 1 : 0+flag9 ? 1 : 0+flag10 ? 1 : 0+flag11 ? 1 : 0>(2))) {
       num15 = (TU.bare!=null&&TU.slope()==(1)) ? 1 : 0+(TR.bare!=null&&TR.slope()==(1)) ? 1 : 0+(TD.bare!=null&&TD.slope()==(4)) ? 1 : 0+(TL.bare!=null&&TL.slope()==(4)) ? 1 : 0;
       num16 = (TU.bare!=null&&TU.slope()==(2)) ? 1 : 0+(TR.bare!=null&&TR.slope()==(3)) ? 1 : 0+(TD.bare!=null&&TD.slope()==(3)) ? 1 : 0+(TL.bare!=null&&TL.slope()==(2)) ? 1 : 0;
       if ((num15==num16)) {
        num13 = (2);
        num14 = (4);
       } else {
        if ((num15>num16)) {
         num17 = num==upLeft&&TUL.bare!=null&&TUL.slope()==(0);
         flag12 = num==downRight&&TDR.bare!=null&&TDR.slope()==(0);
         if ((num17&flag12)) {
          num14 = (4);
         } else {
          if ((flag12)) {
           num13 = (6);
          } else {
           num13 = (7);
           num14 = (1);
          }
         }
        } else {
         num18 = num==upRight&&TUR.bare!=null&&TUR.slope()==(0);
         flag13 = num==downLeft&&TDL.bare!=null&&TDL.slope()==(0);
         if ((num18&flag13)) {
          num14 = (4);
          num13 = (1);
         } else {
          if ((flag13)) {
           num13 = (7);
          } else {
           num13 = (6);
           num14 = (1);
          }
         }
        }
       }
       _rx = ((18)+num13)*(18);
       _ry = num14*(18);
      } else {
       if (((flag8&flag9)&&num==down&&num==right)) {
        num14 = (2);
       } else {
        if (((flag8&flag10)&&num==down&&num==left)) {
         num13 = (1);
         num14 = (2);
        } else {
         if (((flag10&flag11)&&num==up&&num==left)) {
          num13 = (1);
          num14 = (3);
         } else {
          if (((flag11&flag9)&&num==up&&num==right)) {
           num14 = (3);
          }
         }
        }
       }
       if ((num13!=(0)||num14!=(0))) {
        _rx = ((18)+num13)*(18);
        _ry = num14*(18);
       }
      }
     }
     if ((num12>=(2)&&(_rx<(0)||_ry<(0)))) {
      num19 = -(1);
      num20 = -(1);
      num21 = -(1);
      num22 = (0);
      num23 = (0);
      switch (num12) {
      case 2: {
        num19 = left;
        num20 = down;
        num21 = downLeft;
        num22 = num22 + 1;
        ; /* break @L85624(解释器同序:顺序结构下无操作) */
      } break;
      case 3: {
        num19 = right;
        num20 = down;
        num21 = downRight;
        ; /* break @L85629(解释器同序:顺序结构下无操作) */
      } break;
      case 4: {
        num19 = left;
        num20 = up;
        num21 = upLeft;
        num22 = num22 + 1;
        num23 = num23 + 1;
        ; /* break @L85636(解释器同序:顺序结构下无操作) */
      } break;
      case 5: {
        num19 = right;
        num20 = up;
        num21 = upRight;
        num23 = num23 + 1;
        ; /* break @L85642(解释器同序:顺序结构下无操作) */
      } break;
      }
      if ((num!=num19||num!=num20||num!=num21)) {
       if ((num==num19&&num==num20)) {
        num22 = num22 + ((2));
       } else {
        if ((num==num19)) {
         num22 = num22 + ((4));
        } else {
         if ((num==num20)) {
          num22 = num22 + ((4));
          num23 = num23 + ((2));
         } else {
          num22 = num22 + ((2));
          num23 = num23 + ((2));
         }
        }
       }
      }
      _rx = ((18)+num22)*(18);
      _ry = num23*(18);
     }
    }
    if ((_rx<(0)||_ry<(0))) {
     if ((!flag7)) {
      flag7 = true;
      {
       const _10218=(num);
       const _10219=(-(1));
       const _10220=S["tileSolid"];
       { const _c=up; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { up=_10219; } }
       { const _c=down; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { down=_10219; } }
       { const _c=left; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { left=_10219; } }
       { const _c=right; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { right=_10219; } }
       { const _c=upLeft; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { upLeft=_10219; } }
       { const _c=upRight; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { upRight=_10219; } }
       { const _c=downLeft; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { downLeft=_10219; } }
       { const _c=downRight; if (_c>-1 && _c!==_10218 && !( (_10220)!==null && _10220(_c) ) && ( (null)===null || _c!==(null) ) ) { downRight=_10219; } }
      }
      { if (!DRV.inv()) {
        if (DRV.cull(0,-1)) { up = -1; }
        if (DRV.cull(0,1)) { down = -1; }
        if (DRV.cull(-1,0)) { left = -1; }
        if (DRV.cull(1,0)) { right = -1; }
        if (DRV.cull(-1,-1)) { upLeft = -1; }
        if (DRV.cull(1,-1)) { upRight = -1; }
        if (DRV.cull(-1,1)) { downLeft = -1; }
        if (DRV.cull(1,1)) { downRight = -1; }
      } }
     }
     if ((num==(2)||num==(23)||num==(60)||num==(70)||num==(109)||num==(199)||num==(477)||num==(492)||num==(633)||num==(661)||num==(662)||S.tileMoss(num)||S["tileMossBrick"](num))) {
      {
       const _10221=(num);
       const _10222=(-(2));
       { const _c=up; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { up=_10221; } }
       { const _c=down; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { down=_10221; } }
       { const _c=left; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { left=_10221; } }
       { const _c=right; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { right=_10221; } }
       { const _c=upLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upLeft=_10221; } }
       { const _c=upRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { upRight=_10221; } }
       { const _c=downLeft; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downLeft=_10221; } }
       { const _c=downRight; if ((null!==null?(_c>-1&&null(_c)):(_c===_10222)) && !( (null)!==null&&_c>-1&&null(_c) ) && !( (null)!==null&&_c===(null) ) ) { downRight=_10221; } }
      }
      { if (!DRV.inv()) {
        if (DRV.cull(0,-1)) { up = -1; }
        if (DRV.cull(0,1)) { down = -1; }
        if (DRV.cull(-1,0)) { left = -1; }
        if (DRV.cull(1,0)) { right = -1; }
        if (DRV.cull(-1,-1)) { upLeft = -1; }
        if (DRV.cull(1,-1)) { upRight = -1; }
        if (DRV.cull(-1,1)) { downLeft = -1; }
        if (DRV.cull(1,1)) { downRight = -1; }
      } }
     }
     if ((up==num&&down==num&&left==num&&right==num)) {
      if ((upLeft!=num&&upRight!=num)) {
       switch (num6) {
       case 0: {
         _rx = (108);
         _ry = (18);
         ; /* break @L85691(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (126);
         _ry = (18);
         ; /* break @L85695(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (144);
         _ry = (18);
         ; /* break @L85699(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       if ((downLeft!=num&&downRight!=num)) {
        switch (num6) {
        case 0: {
          _rx = (108);
          _ry = (36);
          ; /* break @L85709(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (126);
          _ry = (36);
          ; /* break @L85713(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (144);
          _ry = (36);
          ; /* break @L85717(解释器同序:顺序结构下无操作) */
        }
        }
       } else {
        if ((upLeft!=num&&downLeft!=num)) {
         switch (num6) {
         case 0: {
           _rx = (180);
           _ry = (0);
           ; /* break @L85727(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (180);
           _ry = (18);
           ; /* break @L85731(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (180);
           _ry = (36);
           ; /* break @L85735(解释器同序:顺序结构下无操作) */
         }
         }
        } else {
         if ((upRight!=num&&downRight!=num)) {
          switch (num6) {
          case 0: {
            _rx = (198);
            _ry = (0);
            ; /* break @L85745(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (198);
            _ry = (18);
            ; /* break @L85749(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (198);
            _ry = (36);
            ; /* break @L85753(解释器同序:顺序结构下无操作) */
          }
          }
         } else {
          switch (num6) {
          case 0: {
            _rx = (18);
            _ry = (18);
            ; /* break @L85763(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (36);
            _ry = (18);
            ; /* break @L85767(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (54);
            _ry = (18);
            ; /* break @L85771(解释器同序:顺序结构下无操作) */
          }
          }
         }
        }
       }
      }
     } else {
      if ((up!=num&&down==num&&left==num&&right==num)) {
       switch (num6) {
       case 0: {
         _rx = (18);
         _ry = (0);
         ; /* break @L85782(解释器同序:顺序结构下无操作) */
       } break;
       case 1: {
         _rx = (36);
         _ry = (0);
         ; /* break @L85786(解释器同序:顺序结构下无操作) */
       } break;
       default: {
         _rx = (54);
         _ry = (0);
         ; /* break @L85790(解释器同序:顺序结构下无操作) */
       }
       }
      } else {
       if ((up==num&&down!=num&&left==num&&right==num)) {
        switch (num6) {
        case 0: {
          _rx = (18);
          _ry = (36);
          ; /* break @L85800(解释器同序:顺序结构下无操作) */
        } break;
        case 1: {
          _rx = (36);
          _ry = (36);
          ; /* break @L85804(解释器同序:顺序结构下无操作) */
        } break;
        default: {
          _rx = (54);
          _ry = (36);
          ; /* break @L85808(解释器同序:顺序结构下无操作) */
        }
        }
       } else {
        if ((up==num&&down==num&&left!=num&&right==num)) {
         switch (num6) {
         case 0: {
           _rx = (0);
           _ry = (0);
           ; /* break @L85818(解释器同序:顺序结构下无操作) */
         } break;
         case 1: {
           _rx = (0);
           _ry = (18);
           ; /* break @L85822(解释器同序:顺序结构下无操作) */
         } break;
         default: {
           _rx = (0);
           _ry = (36);
           ; /* break @L85826(解释器同序:顺序结构下无操作) */
         }
         }
        } else {
         if ((up==num&&down==num&&left==num&&right!=num)) {
          switch (num6) {
          case 0: {
            _rx = (72);
            _ry = (0);
            ; /* break @L85836(解释器同序:顺序结构下无操作) */
          } break;
          case 1: {
            _rx = (72);
            _ry = (18);
            ; /* break @L85840(解释器同序:顺序结构下无操作) */
          } break;
          default: {
            _rx = (72);
            _ry = (36);
            ; /* break @L85844(解释器同序:顺序结构下无操作) */
          }
          }
         } else {
          if ((up!=num&&down==num&&left!=num&&right==num)) {
           switch (num6) {
           case 0: {
             _rx = (0);
             _ry = (54);
             ; /* break @L85854(解释器同序:顺序结构下无操作) */
           } break;
           case 1: {
             _rx = (36);
             _ry = (54);
             ; /* break @L85858(解释器同序:顺序结构下无操作) */
           } break;
           default: {
             _rx = (72);
             _ry = (54);
             ; /* break @L85862(解释器同序:顺序结构下无操作) */
           }
           }
          } else {
           if ((up!=num&&down==num&&left==num&&right!=num)) {
            switch (num6) {
            case 0: {
              _rx = (18);
              _ry = (54);
              ; /* break @L85872(解释器同序:顺序结构下无操作) */
            } break;
            case 1: {
              _rx = (54);
              _ry = (54);
              ; /* break @L85876(解释器同序:顺序结构下无操作) */
            } break;
            default: {
              _rx = (90);
              _ry = (54);
              ; /* break @L85880(解释器同序:顺序结构下无操作) */
            }
            }
           } else {
            if ((up==num&&down!=num&&left!=num&&right==num)) {
             switch (num6) {
             case 0: {
               _rx = (0);
               _ry = (72);
               ; /* break @L85890(解释器同序:顺序结构下无操作) */
             } break;
             case 1: {
               _rx = (36);
               _ry = (72);
               ; /* break @L85894(解释器同序:顺序结构下无操作) */
             } break;
             default: {
               _rx = (72);
               _ry = (72);
               ; /* break @L85898(解释器同序:顺序结构下无操作) */
             }
             }
            } else {
             if ((up==num&&down!=num&&left==num&&right!=num)) {
              switch (num6) {
              case 0: {
                _rx = (18);
                _ry = (72);
                ; /* break @L85908(解释器同序:顺序结构下无操作) */
              } break;
              case 1: {
                _rx = (54);
                _ry = (72);
                ; /* break @L85912(解释器同序:顺序结构下无操作) */
              } break;
              default: {
                _rx = (90);
                _ry = (72);
                ; /* break @L85916(解释器同序:顺序结构下无操作) */
              }
              }
             } else {
              if ((up==num&&down==num&&left!=num&&right!=num)) {
               switch (num6) {
               case 0: {
                 _rx = (90);
                 _ry = (0);
                 ; /* break @L85926(解释器同序:顺序结构下无操作) */
               } break;
               case 1: {
                 _rx = (90);
                 _ry = (18);
                 ; /* break @L85930(解释器同序:顺序结构下无操作) */
               } break;
               default: {
                 _rx = (90);
                 _ry = (36);
                 ; /* break @L85934(解释器同序:顺序结构下无操作) */
               }
               }
              } else {
               if ((up!=num&&down!=num&&left==num&&right==num)) {
                switch (num6) {
                case 0: {
                  _rx = (108);
                  _ry = (72);
                  ; /* break @L85944(解释器同序:顺序结构下无操作) */
                } break;
                case 1: {
                  _rx = (126);
                  _ry = (72);
                  ; /* break @L85948(解释器同序:顺序结构下无操作) */
                } break;
                default: {
                  _rx = (144);
                  _ry = (72);
                  ; /* break @L85952(解释器同序:顺序结构下无操作) */
                }
                }
               } else {
                if ((up!=num&&down==num&&left!=num&&right!=num)) {
                 switch (num6) {
                 case 0: {
                   _rx = (108);
                   _ry = (0);
                   ; /* break @L85962(解释器同序:顺序结构下无操作) */
                 } break;
                 case 1: {
                   _rx = (126);
                   _ry = (0);
                   ; /* break @L85966(解释器同序:顺序结构下无操作) */
                 } break;
                 default: {
                   _rx = (144);
                   _ry = (0);
                   ; /* break @L85970(解释器同序:顺序结构下无操作) */
                 }
                 }
                } else {
                 if ((up==num&&down!=num&&left!=num&&right!=num)) {
                  switch (num6) {
                  case 0: {
                    _rx = (108);
                    _ry = (54);
                    ; /* break @L85980(解释器同序:顺序结构下无操作) */
                  } break;
                  case 1: {
                    _rx = (126);
                    _ry = (54);
                    ; /* break @L85984(解释器同序:顺序结构下无操作) */
                  } break;
                  default: {
                    _rx = (144);
                    _ry = (54);
                    ; /* break @L85988(解释器同序:顺序结构下无操作) */
                  }
                  }
                 } else {
                  if ((up!=num&&down!=num&&left!=num&&right==num)) {
                   switch (num6) {
                   case 0: {
                     _rx = (162);
                     _ry = (0);
                     ; /* break @L85998(解释器同序:顺序结构下无操作) */
                   } break;
                   case 1: {
                     _rx = (162);
                     _ry = (18);
                     ; /* break @L86002(解释器同序:顺序结构下无操作) */
                   } break;
                   default: {
                     _rx = (162);
                     _ry = (36);
                     ; /* break @L86006(解释器同序:顺序结构下无操作) */
                   }
                   }
                  } else {
                   if ((up!=num&&down!=num&&left==num&&right!=num)) {
                    switch (num6) {
                    case 0: {
                      _rx = (216);
                      _ry = (0);
                      ; /* break @L86016(解释器同序:顺序结构下无操作) */
                    } break;
                    case 1: {
                      _rx = (216);
                      _ry = (18);
                      ; /* break @L86020(解释器同序:顺序结构下无操作) */
                    } break;
                    default: {
                      _rx = (216);
                      _ry = (36);
                      ; /* break @L86024(解释器同序:顺序结构下无操作) */
                    }
                    }
                   } else {
                    if ((up!=num&&down!=num&&left!=num&&right!=num)) {
                     switch (num6) {
                     case 0: {
                       _rx = (162);
                       _ry = (54);
                       ; /* break @L86034(解释器同序:顺序结构下无操作) */
                     } break;
                     case 1: {
                       _rx = (180);
                       _ry = (54);
                       ; /* break @L86038(解释器同序:顺序结构下无操作) */
                     } break;
                     default: {
                       _rx = (198);
                       _ry = (54);
                       ; /* break @L86042(解释器同序:顺序结构下无操作) */
                     }
                     }
                    }
                   }
                  }
                 }
                }
               }
              }
             }
            }
           }
          }
         }
        }
       }
      }
     }
    }
    if ((_rx<=-(1)||_ry<=-(1))) {
     if ((num6<=(0))) {
      _rx = (18);
      _ry = (18);
     } else {
      if ((num6==(1))) {
       _rx = (36);
       _ry = (18);
      }
     }
     if ((num6>=(2))) {
      _rx = (54);
      _ry = (18);
     }
    }
    if ((S.tileLargeFrames(num)==(1)&&num6==(3))) {
     _ry = rectY + ((90));
    }
    if ((S.tileLargeFrames(num)==(2)&&num6==(3))) {
     _ry = rectY + ((90));
    }
    OUT[0] = (_rx < 0 || _ry < 0) ? 0 : _rx;
    OUT[1] = (_rx < 0 || _ry < 0) ? 0 : _ry;
    return OUT;
  };
}
export { makeFrame };
