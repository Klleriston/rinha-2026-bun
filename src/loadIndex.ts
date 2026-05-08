import { gunzipSync } from 'zlib';
import type { VectorIndex } from './types';

const DIMS   = 14;
const VEC_SZ = DIMS * 4;

export async function loadIndex(path: string): Promise<VectorIndex> {
  if (path.endsWith('.bin')) {
    const buf   = await Bun.file(path).arrayBuffer();
    const count = new DataView(buf).getUint32(0, true);
    const flatVectors = new Float32Array(buf, 4, count * DIMS);
    const isFraud     = new Uint8Array(buf, 4 + count * VEC_SZ, count);
    console.log(`[loadIndex] JS scan (bin) — ${count} referências carregadas`);
    return { type: 'js', flatVectors, isFraud, count };
  }

  const compressed   = new Uint8Array(await Bun.file(path).arrayBuffer());
  const decompressed = gunzipSync(compressed);
  const raw: { vector: number[]; is_fraud: boolean }[] = JSON.parse(
    new TextDecoder().decode(decompressed),
  );
  const count       = raw.length;
  const flatVectors = new Float32Array(count * DIMS);
  const isFraud     = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    flatVectors.set(raw[i].vector, i * DIMS);
    isFraud[i] = raw[i].is_fraud ? 1 : 0;
  }
  console.log(`[loadIndex] JS scan (JSON) — ${count} referências carregadas`);
  return { type: 'js', flatVectors, isFraud, count };
}
