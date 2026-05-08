FROM oven/bun:1-slim AS builder
WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src/          ./src/
COPY resources/    ./resources/
COPY convert.ts    ./

RUN bun run convert.ts

FROM oven/bun:1-slim AS runner
WORKDIR /app

COPY --from=builder /app/node_modules              ./node_modules
COPY --from=builder /app/package.json              ./
COPY --from=builder /app/tsconfig.json             ./
COPY --from=builder /app/src/                      ./src/
COPY --from=builder /app/resources/mcc_risk.json   ./resources/mcc_risk.json
COPY --from=builder /app/resources/references.bin  ./resources/references.bin

EXPOSE 3000

HEALTHCHECK --interval=2s --timeout=3s --start-period=30s --retries=15 \
  CMD bun --eval "const r=await fetch('http://localhost:3000/ready').catch(()=>null);process.exit(r?.ok?0:1)"

CMD ["bun", "run", "src/index.ts"]
