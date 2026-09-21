/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=176, 实指令=35,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorDev(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x02 */
let tmp5_3 = T[1] + C[8];
R[3] = tmp5_3;
/* inst#6 op:0x04 */
let tmp6_0 = R[3] * C[28] + C[29];
R[0] = tmp6_0;
/* inst#7 op:0x13 */
let tmp7_0 = R[0] - Math.floor(R[0]);
R[0] = tmp7_0;
/* inst#8 op:0x04 */
let tmp8_0 = R[0] * C[30] + C[31];
R[0] = tmp8_0;
/* inst#9 op:0x25 */
R[5] = Math.sin(R[0]);
/* inst#10 op:0x05 */
let tmp10_0 = R[5] * C[32];
R[0] = tmp10_0;
/* inst#11 op:0x13 */
let tmp11_0 = R[0] - Math.floor(R[0]);
R[0] = tmp11_0;
/* inst#12 op:0x05 */
let tmp12_0 = R[0] * C[0];
R[0] = tmp12_0;
/* inst#13 op:0x05 */
let tmp13_0 = R[0] * C[16];
R[0] = tmp13_0;
/* inst#14 op:0x02 */
let tmp14_1 = R[0] + R[0];
R[1] = tmp14_1;
/* inst#15 op:0x01 */
let tmp15_0 = C[20];
R[4] = tmp15_0;
/* inst#16 op:0x04 */
let tmp16_2 = T[0] * R[4] + (-C[12]);
R[2] = tmp16_2;
/* inst#17 op:0x05 */
let tmp17_2 = R[2] * C[4];
R[2] = sat(tmp17_2);
/* inst#18 op:0x04 */
let tmp18_3 = R[2] * C[33] + C[34];
R[3] = tmp18_3;
/* inst#19 op:0x05 */
let tmp19_2 = R[2] * R[2];
R[2] = tmp19_2;
/* inst#20 op:0x04 */
let tmp20_1 = R[3] * R[2] + R[1];
R[1] = tmp20_1;
/* inst#21 op:0x02 */
let tmp21_0 = R[1] + (-C[0]);
R[4] = tmp21_0;
/* inst#22 op:0x01 */
let tmp22_1 = T[1];
R[5] = tmp22_1;
/* inst#23 op:0x01 */
let tmp23_3 = C[35];
R[3] = tmp23_3;
/* inst#24 op:0x04 */
let tmp24_0 = R[0] * R[3] + (-C[0]);
R[8] = tmp24_0;
/* inst#25 op:0x01 */
let tmp25_1 = C[25];
R[1] = tmp25_1;
/* inst#26 op:0x04 */
let tmp26_0 = R[0] * R[1] + (-C[0]);
R[0] = tmp26_0;
/* inst#27 op:0x01 */
let tmp27_1 = C[24];
R[9] = tmp27_1;
/* inst#28 op:0x02 */
let tmp28_0 = R[8] + T[0];
let tmp28_1 = R[9] + T[1];
R[8] = tmp28_0;
R[9] = tmp28_1;
/* inst#29 op:0x01 */
let tmp29_1 = C[24];
R[1] = tmp29_1;
/* inst#30 op:0x02 */
let tmp30_0 = R[0] + T[0];
let tmp30_1 = R[1] + T[1];
R[0] = tmp30_0;
R[1] = tmp30_1;
/* inst#31 op:0x42 */
SAM[0]!(R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#32 op:0x42 */
SAM[0]!(R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#33 op:0x42 */
SAM[0]!(R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#34 op:0x01 */
let tmp34_0 = R[4];
R[0] = tmp34_0;
/* inst#35 op:0x01 */
let tmp35_1 = R[9];
R[1] = tmp35_1;
/* inst#36 op:0x01 */
let tmp36_3 = C[26];
R[3] = tmp36_3;
/* inst#37 op:0x05 */
let tmp37_0 = R[7] * R[0];
let tmp37_1 = R[7] * R[1];
let tmp37_2 = R[7] * R[2];
let tmp37_3 = R[7] * R[3];
R[0] = tmp37_0;
R[1] = tmp37_1;
R[2] = tmp37_2;
R[3] = tmp37_3;
/* inst#38 op:0x05 */
let tmp38_0 = R[0] * V[0];
let tmp38_1 = R[1] * V[1];
let tmp38_2 = R[2] * V[2];
let tmp38_3 = R[3] * V[3];
R[0] = tmp38_0;
R[1] = tmp38_1;
R[2] = tmp38_2;
R[3] = tmp38_3;
/* inst#39 op:0x01 */
let tmp39_0 = R[0];
let tmp39_1 = R[1];
let tmp39_2 = R[2];
let tmp39_3 = R[3];
O[0] = tmp39_0;
O[1] = tmp39_1;
O[2] = tmp39_2;
O[3] = tmp39_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

