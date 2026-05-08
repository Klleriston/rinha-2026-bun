import type { TransactionPayload } from './types';

const DIMS = 14;

function clamp(x: number): number {
  return x < 0.0 ? 0.0 : x > 1.0 ? 1.0 : x;
}

export function vectorize(
  payload: TransactionPayload,
  mccRisk: Record<string, number>,
): Float32Array {
  const { transaction, customer, merchant, terminal, last_transaction } = payload;
  const ts = new Date(transaction.requested_at);

  const vec = new Float32Array(DIMS);

  vec[0]  = clamp(transaction.amount / 10_000);
  vec[1]  = clamp(transaction.installments / 12);
  vec[2]  = clamp((transaction.amount / customer.avg_amount) / 10);
  vec[3]  = ts.getUTCHours() / 23;
  vec[4]  = ((ts.getUTCDay() + 6) % 7) / 6;
  const minutesAgo = last_transaction === null
    ? null
    : (ts.getTime() - new Date(last_transaction.timestamp).getTime()) / 60_000;
  vec[5]  = minutesAgo === null ? -1 : clamp(minutesAgo / 1_440);
  vec[6]  = last_transaction === null ? -1 : clamp(last_transaction.km_from_current / 1_000);
  vec[7]  = clamp(terminal.km_from_home / 1_000);
  vec[8]  = clamp(customer.tx_count_24h / 20);
  vec[9]  = terminal.is_online ? 1 : 0;
  vec[10] = terminal.card_present ? 1 : 0;
  vec[11] = customer.known_merchants.includes(merchant.id) ? 0 : 1;
  vec[12] = mccRisk[merchant.mcc] ?? 0.5;
  vec[13] = clamp(merchant.avg_amount / 10_000);

  return vec;
}
