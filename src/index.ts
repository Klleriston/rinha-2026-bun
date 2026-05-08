import { Elysia, t } from 'elysia';
import { loadIndex } from './loadIndex';
import { vectorize } from './vectorize';
import { knnSearch } from './knn';
import type { VectorIndex, TransactionPayload } from './types';

const PORT            = parseInt(process.env.PORT             ?? '3000', 10);
const INDEX_PATH      = process.env.INDEX_PATH                ?? './resources/references.bin';
const MCC_RISK_PATH   = process.env.MCC_RISK_PATH             ?? './resources/mcc_risk.json';
const KNN_K           = parseInt(process.env.KNN_K            ?? '5',    10);
const FRAUD_THRESHOLD = parseFloat(process.env.FRAUD_THRESHOLD ?? '0.4');

let isReady    = false;
let vectorIndex: VectorIndex | null = null;
let mccRisk:    Record<string, number> = {};

async function startup(): Promise<void> {
  console.log(`[startup] Carregando MCC risk: ${MCC_RISK_PATH}`);
  mccRisk = await Bun.file(MCC_RISK_PATH).json<Record<string, number>>();

  console.log(`[startup] Carregando índice: ${INDEX_PATH}`);
  vectorIndex = await loadIndex(INDEX_PATH);

  console.log(`[startup] Índice pronto — ${vectorIndex.count} referências`);
  isReady = true;
}

startup().catch((err) => {
  console.error('[startup] FALHA:', err);
  process.exit(1);
});

const LastTransactionSchema = t.Object({
  timestamp:       t.String(),
  km_from_current: t.Number(),
});

const FraudScoreBodySchema = t.Object({
  id: t.String(),
  transaction: t.Object({
    amount:       t.Number(),
    installments: t.Number(),
    requested_at: t.String(),
  }),
  customer: t.Object({
    avg_amount:      t.Number(),
    tx_count_24h:    t.Number(),
    known_merchants: t.Array(t.String()),
  }),
  merchant: t.Object({
    id:         t.String(),
    mcc:        t.String(),
    avg_amount: t.Number(),
  }),
  terminal: t.Object({
    is_online:    t.Boolean(),
    card_present: t.Boolean(),
    km_from_home: t.Number(),
  }),
  last_transaction: t.Union([LastTransactionSchema, t.Null()]),
});

const app = new Elysia()

  .get('/ready', ({ set }) => {
    if (!isReady) {
      set.status = 503;
      return { status: 'loading' };
    }
    return { status: 'ok' };
  })

  .post(
    '/fraud-score',
    ({ body, set }) => {
      if (!isReady) {
        set.status = 503;
        return { error: 'Service not ready' };
      }

      const payload  = body as TransactionPayload;
      const vector   = vectorize(payload, mccRisk);
      const score    = knnSearch(vector, vectorIndex!, KNN_K);
      const approved = score < FRAUD_THRESHOLD;

      return { approved, fraud_score: score };
    },
    { body: FraudScoreBodySchema },
  )

  .listen(PORT);

console.log(`[server] Escutando na porta ${PORT}`);

export type App = typeof app;
