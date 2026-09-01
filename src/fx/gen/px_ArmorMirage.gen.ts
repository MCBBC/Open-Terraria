/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=126, 实指令=24,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorMirage(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#4 op:0x01 */
let tmp4_3 = C[17];
R[3] = tmp4_3;
/* inst#5 op:0x04 */
let tmp5_0 = T[1] * R[3] + (-C[13]);
R[0] = tmp5_0;
/* inst#6 op:0x01 */
let tmp6_0 = C[20];
let tmp6_1 = C[21];
R[4] = tmp6_0;
R[5] = tmp6_1;
/* inst#7 op:0x04 */
let tmp7_0 = R[0] * C[0] + R[4];
R[0] = tmp7_0;
/* inst#8 op:0x04 */
let tmp8_0 = R[0] * R[5] + C[4];
R[0] = tmp8_0;
/* inst#9 op:0x04 */
let tmp9_0 = R[0] * C[22] + C[23];
R[0] = tmp9_0;
/* inst#10 op:0x13 */
let tmp10_0 = R[0] - Math.floor(R[0]);
R[0] = tmp10_0;
/* inst#11 op:0x04 */
let tmp11_0 = R[0] * C[24] + C[25];
R[0] = tmp11_0;
/* inst#12 op:0x25 */
R[5] = Math.sin(R[0]);
/* inst#13 op:0x05 */
let tmp13_0 = R[5] * C[8];
R[0] = tmp13_0;
/* inst#14 op:0x01 */
let tmp14_0 = (-R[0]);
R[4] = tmp14_0;
/* inst#15 op:0x01 */
let tmp15_1 = C[26];
R[5] = tmp15_1;
/* inst#16 op:0x02 */
let tmp16_0 = R[4] + T[0];
let tmp16_1 = R[5] + T[1];
R[4] = tmp16_0;
R[5] = tmp16_1;
/* inst#17 op:0x01 */
let tmp17_1 = C[26];
R[1] = tmp17_1;
/* inst#18 op:0x02 */
let tmp18_0 = R[0] + T[0];
let tmp18_1 = R[1] + T[1];
R[0] = tmp18_0;
R[1] = tmp18_1;
/* inst#19 op:0x42 */
SAM[0](R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#20 op:0x42 */
SAM[0](R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#21 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#22 op:0x01 */
let tmp22_0 = R[4];
R[0] = tmp22_0;
/* inst#23 op:0x01 */
let tmp23_3 = C[27];
R[3] = tmp23_3;
/* inst#24 op:0x01 */
let tmp24_1 = R[9];
R[1] = tmp24_1;
/* inst#25 op:0x05 */
let tmp25_0 = R[11] * R[0];
let tmp25_1 = R[11] * R[1];
let tmp25_2 = R[11] * R[2];
let tmp25_3 = R[11] * R[3];
R[0] = tmp25_0;
R[1] = tmp25_1;
R[2] = tmp25_2;
R[3] = tmp25_3;
/* inst#26 op:0x05 */
let tmp26_0 = R[0] * V[0];
let tmp26_1 = R[1] * V[1];
let tmp26_2 = R[2] * V[2];
let tmp26_3 = R[3] * V[3];
R[0] = tmp26_0;
R[1] = tmp26_1;
R[2] = tmp26_2;
R[3] = tmp26_3;
/* inst#27 op:0x01 */
let tmp27_0 = R[0];
let tmp27_1 = R[1];
let tmp27_2 = R[2];
let tmp27_3 = R[3];
O[0] = tmp27_0;
O[1] = tmp27_1;
O[2] = tmp27_2;
O[3] = tmp27_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

