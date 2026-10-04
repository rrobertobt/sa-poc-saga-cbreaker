# PoC: Saga + Circuit Breaker

Prueba de concepto de dos patrones de resiliencia en microservicios, sobre un flujo de compra de e-commerce:

- **Saga orquestada** con compensaciones, para mantener la consistencia entre 4 servicios.
- **Circuit Breaker** (Closed / Open / Half-Open) para evitar fallos en cascada.

```
Order ──▶ Payment ──▶ Inventory ──▶ Shipping
  ▲ orquestador + 3 circuit breakers
```

**Stack:** NestJS (TypeScript) + SQLite/TypeORM por servicio, `opossum` como circuit breaker, Vue 3 + Vite (panel), Docker Compose.

## Levantar

```bash
docker compose up --build -d
```

Panel de control: **http://localhost:5173**

Para empezar de cero: `docker compose down -v && docker compose up --build -d`.

| Servicio  | Puerto | Acción | Compensación |
|-----------|--------|--------|--------------|
| order     | 3001 | `POST /orders` | `DELETE /orders/:id` |
| payment   | 3002 | `POST /payments` | `POST /payments/:id/refund` |
| inventory | 3003 | `POST /inventory/reserve` | `POST /inventory/release` |
| shipping  | 3004 | `POST /shipping/schedule` | `DELETE /shipping/:id` |

Otros endpoints útiles: `GET /health` (todos), `GET /sagas`, `GET /breakers`, `POST /breakers/reset`, `GET /events` (SSE) en order; `POST /admin/faults` para inyectar fallos en payment/inventory/shipping.

## Comprar

```bash
curl -X POST localhost:3001/orders -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" -d '{"productId":"P-001","quantity":1,"amount":50}'
```

El `Idempotency-Key` es obligatorio: repetir la misma clave devuelve la misma orden sin lanzar otra saga.

## Inyectar fallos

```bash
curl -X POST localhost:3002/admin/faults -H 'Content-Type: application/json' -d '{"mode":"error"}'
```

Modos: `none`, `error` (500), `slow` (`delayMs`), `down` (503).

## Panel de control

En [frontend/](frontend/). Permite comprar, inyectar fallos, ver el estado de los circuit breakers en tiempo real (SSE) y la línea de tiempo de cada saga, sin usar la terminal.

## Pruebas

```bash
./scripts/run-escenarios.sh          # 8 escenarios de fallos
```

Cubren flujo feliz, falta de stock, fallo en shipping, apertura/recuperación del breaker y fallo de compensación. Scripts por fase también disponibles: `fase1-smoke.sh`, `fase2-saga.sh`, `fase3-breakers.sh`.

## Estructura

```
services/   order (saga + breakers), payment, inventory, shipping
frontend/   panel Vue 3 + Vite
scripts/    pruebas y escenarios de fallos
```

## Desarrollo sin Docker

```bash
cd services/<servicio> && npm install && npm run dev
cd frontend && npm install && npm run dev
```
