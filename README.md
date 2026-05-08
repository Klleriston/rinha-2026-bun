# Rinha de Backend 2026 — Bun + Elysia + KNN

Detecção de fraude em tempo real usando busca vetorial KNN in-memory, implementada em TypeScript com [Bun](https://bun.sh) e [Elysia](https://elysiajs.com).

## Como funciona

Cada transação recebida é transformada em um vetor de 14 números que resume suas características (valor, horário, distância de casa, histórico do cliente, risco do MCC, etc.). Esse vetor é comparado contra 15 mil transações de referência já rotuladas como fraude ou legítima. Os 5 vizinhos mais próximos (menor distância euclidiana) decidem o score: se a maioria for fraude, a transação é negada.

```
transação chega
      ↓
vetoriza em 14 dimensões (Float32Array)
      ↓
scan linear no índice em memória (15.000 referências)
      ↓
fraud_score = nº de fraudes nos 5 vizinhos ÷ 5
      ↓
approved = fraud_score < 0.4
```

## Arquitetura

```
cliente → nginx :9999 (round-robin) → api1 :3000
                                    → api2 :3000
```

- **nginx**: distribui carga em round-robin puro, sem lógica de negócio
- **api1 / api2**: duas instâncias idênticas — carregam o índice vetorial em memória no startup
- Nenhum banco de dados, nenhuma dependência externa em runtime

### Limites de recursos (total: 1 CPU / 350 MB)

| Serviço | CPU | RAM |
|---------|-----|-----|
| nginx   | 0.10 | 20 MB |
| api1    | 0.45 | 165 MB |
| api2    | 0.45 | 165 MB |

## As 14 dimensões do vetor

| # | Feature | Como é calculado |
|---|---------|-----------------|
| 0 | Valor da transação | `clamp(amount / 10.000)` |
| 1 | Parcelas | `clamp(installments / 12)` |
| 2 | Valor vs. média do cliente | `clamp((amount / avg_amount) / 10)` |
| 3 | Hora do dia | `hora_utc / 23` |
| 4 | Dia da semana | `(dia + 6) % 7 / 6` (seg=0, dom=1) |
| 5 | Minutos desde a última transação | `-1` se não há transação anterior, senão `clamp(minutos / 1.440)` |
| 6 | Km desde a última transação | `-1` se não há transação anterior, senão `clamp(km / 1.000)` |
| 7 | Km de casa | `clamp(km_from_home / 1.000)` |
| 8 | Transações nas últimas 24h | `clamp(tx_count_24h / 20)` |
| 9 | Transação online | `1` se online, `0` se presencial |
| 10 | Cartão presente | `1` se presente, `0` se não |
| 11 | Comerciante desconhecido | `1` se o merchant não está no histórico do cliente |
| 12 | Risco do MCC | Valor de `mcc_risk.json` (padrão `0.5`) |
| 13 | Ticket médio do comerciante | `clamp(merchant.avg_amount / 10.000)` |

## Índice vetorial

O arquivo `references.json.gz` (3 milhões de transações, 48 MB comprimido) é convertido para um binário compacto durante o `docker build` via `convert.ts`. São mantidos 1 em cada 200 registros — 15 mil referências, ~800 KB.

**Por que 15 mil e não 3 milhões?**
Um scan linear sobre 3 milhões de vetores leva ~11 ms por requisição na máquina da competição. Com 0,45 CPU disponível por instância e pico de 450 req/s, o sistema ficaria sobrecarregado (ρ > 1). Com 15 mil referências o scan leva ~0,18 ms, mantendo ρ ≈ 0,35 e o p99 bem abaixo dos 2.000 ms do corte.

**Formato do binário (`references.bin`)**:
```
bytes 0–3           : uint32 total de registros (little-endian)
bytes 4..4+N×56–1   : Float32[N × 14]  — vetores flat
bytes 4+N×56..fim   : Uint8[N]         — flags de fraude (0 ou 1)
```

Os `Float32Array` e `Uint8Array` são views diretas no mesmo `ArrayBuffer` — sem cópia extra, sem alocação adicional.

## Busca KNN

O scan usa um **max-heap de tamanho k=5**. Para cada vetor de referência, calcula a distância euclidiana ao quadrado (sem `sqrt`, desnecessário para comparação) e mantém os k menores. Custo: O(N) com overhead O(k) por elemento — eficiente e sem dependências.

## Endpoints

### `GET /ready`
Retorna `200` quando o índice está carregado. O nginx só começa a rotear requisições após as duas instâncias estarem prontas (`condition: service_healthy`).

### `POST /fraud-score`

**Request:**
```json
{
  "id": "tx-123",
  "transaction": { "amount": 500.0, "installments": 1, "requested_at": "2026-03-11T14:00:00Z" },
  "customer": { "avg_amount": 300.0, "tx_count_24h": 2, "known_merchants": ["MERC-001"] },
  "merchant": { "id": "MERC-050", "mcc": "5411", "avg_amount": 150.0 },
  "terminal": { "is_online": true, "card_present": false, "km_from_home": 5.0 },
  "last_transaction": { "timestamp": "2026-03-11T12:00:00Z", "km_from_current": 18.86 }
}
```

**Response:**
```json
{ "approved": true, "fraud_score": 0.2 }
```

## Rodando localmente

```bash
# Mac M-series: o platform: linux/amd64 usa emulação Rosetta (10x mais lento)
# Para testes locais comente a linha platform: no docker-compose.yml

docker-compose up --build

# em outro terminal (a partir do repo da rinha)
./run.sh
```

## Stack

- **Runtime**: [Bun](https://bun.sh) v1
- **Framework**: [Elysia](https://elysiajs.com) v1.2
- **Load balancer**: nginx Alpine
- **Linguagem**: TypeScript
