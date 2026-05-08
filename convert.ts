import { gunzipSync } from 'zlib';

const src    = process.argv[2] ?? './resources/references.json.gz';
const dst    = process.argv[3] ?? './resources/references.bin';
const STRIDE = parseInt(process.argv[4] ?? '200', 10);

console.log(`Lendo: ${src}`);
const compressed   = new Uint8Array(await Bun.file(src).arrayBuffer());
const decompressed = gunzipSync(compressed);
const raw: { vector: number[]; label?: string; is_fraud?: boolean }[] = JSON.parse(
  new TextDecoder().decode(decompressed),
);

const sampled = STRIDE > 1 ? raw.filter((_, i) => i % STRIDE === 0) : raw;
const count   = sampled.length;
console.log(`Entradas originais: ${raw.length}  →  amostradas (stride=${STRIDE}): ${count}`);

const headerSize  = 4;
const vectorsSize = count * 14 * 4;
const buf         = new ArrayBuffer(headerSize + vectorsSize + count);

new DataView(buf).setUint32(0, count, true);

const vectors = new Float32Array(buf, headerSize, count * 14);
const frauds  = new Uint8Array(buf, headerSize + vectorsSize, count);

for (let i = 0; i < count; i++) {
  vectors.set(sampled[i].vector, i * 14);
  frauds[i] = sampled[i].label === 'fraud' || sampled[i].is_fraud ? 1 : 0;
}

await Bun.write(dst, buf);
console.log(`Binário salvo em: ${dst}  (${(buf.byteLength / 1_048_576).toFixed(1)} MB)`);
