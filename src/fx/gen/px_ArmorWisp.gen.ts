/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=112, 实指令=22,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorWisp(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x02 */
let tmp3_0 = R[1] + R[0];
R[0] = tmp3_0;
/* inst#4 op:0x02 */
let tmp4_0 = R[2] + R[0];
R[0] = tmp4_0;
/* inst#5 op:0x04 */
let tmp5_1 = R[0] * C[16] + C[18];
R[1] = tmp5_1;
/* inst#6 op:0x04 */
let tmp6_0 = R[0] * C[16] + C[17];
R[0] = tmp6_0;
/* inst#7 op:0x05 */
let tmp7_2 = R[1] * C[19];
R[2] = tmp7_2;
/* inst#8 op:0x0a */
let tmp8_3 = Math.min(R[2], C[20]);
R[7] = tmp8_3;
/* inst#9 op:0x01 */
let tmp9_0 = C[4];
let tmp9_1 = C[5];
let tmp9_2 = C[6];
R[4] = tmp9_0;
R[5] = tmp9_1;
R[6] = tmp9_2;
/* inst#10 op:0x04 */
let tmp10_0 = R[7] * R[4] + C[8];
let tmp10_1 = R[7] * R[5] + C[9];
let tmp10_2 = R[7] * R[6] + C[10];
R[4] = tmp10_0;
R[5] = tmp10_1;
R[6] = tmp10_2;
/* inst#11 op:0x05 */
let tmp11_3 = R[0] * C[19];
R[7] = tmp11_3;
/* inst#12 op:0x01 */
let tmp12_0 = C[12];
let tmp12_1 = C[13];
let tmp12_2 = C[14];
R[8] = tmp12_0;
R[9] = tmp12_1;
R[10] = tmp12_2;
/* inst#13 op:0x04 */
let tmp13_0 = R[7] * C[0] + R[8];
let tmp13_1 = R[7] * C[1] + R[9];
let tmp13_2 = R[7] * C[2] + R[10];
R[8] = tmp13_0;
R[9] = tmp13_1;
R[10] = tmp13_2;
/* inst#14 op:0x58 */
let tmp14_0 = R[1] >= 0 ? R[4] : R[8];
let tmp14_1 = R[1] >= 0 ? R[5] : R[9];
let tmp14_2 = R[1] >= 0 ? R[6] : R[10];
R[4] = tmp14_0;
R[5] = tmp14_1;
R[6] = tmp14_2;
/* inst#15 op:0x58 */
let tmp15_0 = R[0] >= 0 ? R[4] : C[12];
let tmp15_1 = R[0] >= 0 ? R[5] : C[13];
let tmp15_2 = R[0] >= 0 ? R[6] : C[14];
R[4] = tmp15_0;
R[5] = tmp15_1;
R[6] = tmp15_2;
/* inst#16 op:0x01 */
let tmp16_3 = C[20];
R[7] = tmp16_3;
/* inst#17 op:0x05 */
let tmp17_0 = R[3] * R[4];
let tmp17_1 = R[3] * R[5];
let tmp17_2 = R[3] * R[6];
let tmp17_3 = R[3] * R[7];
R[0] = tmp17_0;
R[1] = tmp17_1;
R[2] = tmp17_2;
R[3] = tmp17_3;
/* inst#18 op:0x0a */
let tmp18_0 = Math.min(R[0], C[20]);
let tmp18_1 = Math.min(R[1], C[20]);
let tmp18_2 = Math.min(R[2], C[20]);
let tmp18_3 = Math.min(R[3], C[20]);
R[4] = tmp18_0;
R[5] = tmp18_1;
R[6] = tmp18_2;
R[7] = tmp18_3;
/* inst#19 op:0x0b */
let tmp19_0 = Math.max(V[0], V[3]);
let tmp19_1 = Math.max(V[1], V[3]);
let tmp19_2 = Math.max(V[2], V[3]);
R[0] = tmp19_0;
R[1] = tmp19_1;
R[2] = tmp19_2;
/* inst#20 op:0x12 */
let tmp20_0 = (-C[17]) * R[0] + (1 - (-C[17])) * V[0];
let tmp20_1 = (-C[17]) * R[1] + (1 - (-C[17])) * V[1];
let tmp20_2 = (-C[17]) * R[2] + (1 - (-C[17])) * V[2];
R[8] = tmp20_0;
R[9] = tmp20_1;
R[10] = tmp20_2;
/* inst#21 op:0x01 */
let tmp21_3 = V[3];
R[11] = tmp21_3;
/* inst#22 op:0x05 */
let tmp22_0 = R[4] * R[8];
let tmp22_1 = R[5] * R[9];
let tmp22_2 = R[6] * R[10];
let tmp22_3 = R[7] * R[11];
R[0] = tmp22_0;
R[1] = tmp22_1;
R[2] = tmp22_2;
R[3] = tmp22_3;
/* inst#23 op:0x01 */
let tmp23_0 = R[0];
let tmp23_1 = R[1];
let tmp23_2 = R[2];
let tmp23_3 = R[3];
O[0] = tmp23_0;
O[1] = tmp23_1;
O[2] = tmp23_2;
O[3] = tmp23_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

