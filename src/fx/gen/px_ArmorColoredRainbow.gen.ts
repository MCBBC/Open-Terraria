/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=177, 实指令=36,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorColoredRainbow(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#3 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#4 op:0x01 */
let tmp4_3 = C[20];
R[7] = tmp4_3;
/* inst#5 op:0x04 */
let tmp5_0 = T[0] * R[7] + (-C[16]);
R[4] = tmp5_0;
/* inst#6 op:0x05 */
let tmp6_0 = R[4] * C[0];
R[4] = sat(tmp6_0);
/* inst#7 op:0x04 */
let tmp7_1 = R[4] * C[24] + C[25];
R[5] = tmp7_1;
/* inst#8 op:0x05 */
let tmp8_0 = R[4] * R[4];
R[4] = tmp8_0;
/* inst#9 op:0x05 */
let tmp9_0 = R[5] * R[4];
R[4] = tmp9_0;
/* inst#10 op:0x04 */
let tmp10_0 = R[4] * C[31] + C[28];
let tmp10_1 = R[4] * C[31] + C[29];
let tmp10_2 = R[4] * C[31] + C[30];
R[4] = tmp10_0;
R[5] = tmp10_1;
R[6] = tmp10_2;
/* inst#11 op:0x23 */
let tmp11_0 = Math.abs(R[4]);
let tmp11_1 = Math.abs(R[5]);
let tmp11_2 = Math.abs(R[6]);
R[8] = tmp11_0;
R[9] = tmp11_1;
R[10] = tmp11_2;
/* inst#12 op:0x13 */
let tmp12_0 = R[8] - Math.floor(R[8]);
let tmp12_1 = R[9] - Math.floor(R[9]);
let tmp12_2 = R[10] - Math.floor(R[10]);
R[8] = tmp12_0;
R[9] = tmp12_1;
R[10] = tmp12_2;
/* inst#13 op:0x58 */
let tmp13_0 = R[4] >= 0 ? R[8] : (-R[8]);
let tmp13_1 = R[5] >= 0 ? R[9] : (-R[9]);
let tmp13_2 = R[6] >= 0 ? R[10] : (-R[10]);
R[4] = tmp13_0;
R[5] = tmp13_1;
R[6] = tmp13_2;
/* inst#14 op:0x04 */
let tmp14_0 = R[4] * C[25] + C[26];
let tmp14_1 = R[5] * C[25] + C[26];
let tmp14_2 = R[6] * C[25] + C[26];
R[4] = tmp14_0;
R[5] = tmp14_1;
R[6] = tmp14_2;
/* inst#15 op:0x23 */
let tmp15_0 = Math.abs(R[4]);
let tmp15_1 = Math.abs(R[5]);
let tmp15_2 = Math.abs(R[6]);
R[4] = tmp15_0;
R[5] = tmp15_1;
R[6] = tmp15_2;
/* inst#16 op:0x02 */
let tmp16_0 = (-R[4]) + C[27];
let tmp16_1 = (-R[5]) + C[27];
let tmp16_2 = (-R[6]) + C[27];
R[4] = tmp16_0;
R[5] = tmp16_1;
R[6] = tmp16_2;
/* inst#17 op:0x02 */
let tmp17_0 = (-R[4]) + C[27];
let tmp17_1 = (-R[5]) + C[27];
let tmp17_2 = (-R[6]) + C[27];
R[8] = tmp17_0;
R[9] = tmp17_1;
R[10] = tmp17_2;
/* inst#18 op:0x0b */
let tmp18_3 = Math.max(R[1], R[2]);
R[7] = tmp18_3;
/* inst#19 op:0x0b */
let tmp19_3 = Math.max(R[0], R[7]);
R[11] = tmp19_3;
/* inst#20 op:0x0a */
let tmp20_3 = Math.min(R[2], R[1]);
R[7] = tmp20_3;
/* inst#21 op:0x0a */
let tmp21_3 = Math.min(R[7], R[0]);
R[15] = tmp21_3;
/* inst#22 op:0x02 */
let tmp22_3 = R[11] + R[15];
R[7] = tmp22_3;
/* inst#23 op:0x02 */
let tmp23_3 = R[11] + (-R[15]);
R[11] = tmp23_3;
/* inst#24 op:0x05 */
let tmp24_3 = R[11] * C[12];
R[11] = tmp24_3;
/* inst#25 op:0x01 */
let tmp25_0 = C[4];
R[0] = tmp25_0;
/* inst#26 op:0x04 */
let tmp26_3 = R[11] * R[0] + C[8];
R[11] = tmp26_3;
/* inst#27 op:0x04 */
let tmp27_0 = R[7] * (-C[32]) + C[33];
R[0] = tmp27_0;
/* inst#28 op:0x04 */
let tmp28_0 = R[0] * (-R[8]) + C[27];
let tmp28_1 = R[0] * (-R[9]) + C[27];
let tmp28_2 = R[0] * (-R[10]) + C[27];
R[0] = tmp28_0;
R[1] = tmp28_1;
R[2] = tmp28_2;
/* inst#29 op:0x05 */
let tmp29_0 = R[4] * R[7];
let tmp29_1 = R[5] * R[7];
let tmp29_2 = R[6] * R[7];
R[4] = tmp29_0;
R[5] = tmp29_1;
R[6] = tmp29_2;
/* inst#30 op:0x04 */
let tmp30_0 = R[7] * (-C[32]) + C[32];
R[8] = tmp30_0;
/* inst#31 op:0x58 */
let tmp31_0 = R[8] >= 0 ? R[4] : R[0];
let tmp31_1 = R[8] >= 0 ? R[5] : R[1];
let tmp31_2 = R[8] >= 0 ? R[6] : R[2];
R[0] = tmp31_0;
R[1] = tmp31_1;
R[2] = tmp31_2;
/* inst#32 op:0x04 */
let tmp32_0 = R[7] * (-C[32]) + R[0];
let tmp32_1 = R[7] * (-C[32]) + R[1];
let tmp32_2 = R[7] * (-C[32]) + R[2];
R[0] = tmp32_0;
R[1] = tmp32_1;
R[2] = tmp32_2;
/* inst#33 op:0x05 */
let tmp33_0 = R[7] * C[32];
R[4] = tmp33_0;
/* inst#34 op:0x04 */
let tmp34_0 = R[11] * R[0] + R[4];
let tmp34_1 = R[11] * R[1] + R[4];
let tmp34_2 = R[11] * R[2] + R[4];
R[4] = tmp34_0;
R[5] = tmp34_1;
R[6] = tmp34_2;
/* inst#35 op:0x01 */
let tmp35_3 = C[27];
R[7] = tmp35_3;
/* inst#36 op:0x05 */
let tmp36_0 = R[3] * R[4];
let tmp36_1 = R[3] * R[5];
let tmp36_2 = R[3] * R[6];
let tmp36_3 = R[3] * R[7];
R[0] = tmp36_0;
R[1] = tmp36_1;
R[2] = tmp36_2;
R[3] = tmp36_3;
/* inst#37 op:0x05 */
let tmp37_0 = R[0] * V[0];
let tmp37_1 = R[1] * V[1];
let tmp37_2 = R[2] * V[2];
let tmp37_3 = R[3] * V[3];
R[0] = tmp37_0;
R[1] = tmp37_1;
R[2] = tmp37_2;
R[3] = tmp37_3;
/* inst#38 op:0x01 */
let tmp38_0 = R[0];
let tmp38_1 = R[1];
let tmp38_2 = R[2];
let tmp38_3 = R[3];
O[0] = tmp38_0;
O[1] = tmp38_1;
O[2] = tmp38_2;
O[3] = tmp38_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

