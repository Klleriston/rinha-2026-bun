import type { VectorIndex } from './types';

const DIMS = 14;

export function knnSearch(query: Float32Array, index: VectorIndex, k = 5): number {
  const { flatVectors, isFraud, count } = index;
  const heapDist  = new Float64Array(k).fill(Infinity);
  const heapFraud = new Uint8Array(k);
  let   heapSize  = 0;

  for (let i = 0; i < count; i++) {
    const base = i * DIMS;
    let dist = 0;
    for (let j = 0; j < DIMS; j++) {
      const d = query[j] - flatVectors[base + j];
      dist += d * d;
    }

    if (heapSize < k) {
      heapDist[heapSize]  = dist;
      heapFraud[heapSize] = isFraud[i];
      heapSize++;
    } else {
      let maxIdx = 0;
      for (let j = 1; j < k; j++) {
        if (heapDist[j] > heapDist[maxIdx]) maxIdx = j;
      }
      if (dist < heapDist[maxIdx]) {
        heapDist[maxIdx]  = dist;
        heapFraud[maxIdx] = isFraud[i];
      }
    }
  }

  let fraudCount = 0;
  for (let i = 0; i < heapSize; i++) {
    if (heapFraud[i]) fraudCount++;
  }
  return fraudCount / k;
}
