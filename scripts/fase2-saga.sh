#!/usr/bin/env bash
# Phase 2: saga orchestrated from Order Service.
# Happy path, no stock (P-002), Shipping failure, and compensation retries.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

# steps RESPONSE -> "action:step:result ..." in order
steps() { body "$1" | json '.saga.log.map(l=>`${l.action}:${l.step}:${l.result}`).join(" ")'; }
payment_status() { curl -s "$PAYMENT/payments/$1" | json .status; }

reset_faults
curl -s -o /dev/null -X POST "$INVENTORY/admin/stock/reset"
curl -s -o /dev/null -X POST "$ORDER/breakers/reset"

echo "== 1. Flujo feliz"
EVENTS=$(mktemp)
curl -s -N "$ORDER/events" > "$EVENTS" &
SSE_PID=$!
sleep 0.5
STOCK0=$(stock P-001)
r=$(buy P-001 2 80)
check "orden CONFIRMED, saga COMPLETED" "201 CONFIRMED COMPLETED" "$(status "$r") $(body "$r" | json .order.status) $(body "$r" | json .saga.status)"
check "pasos ejecutados en orden" "createOrder,payment,inventory,shipping" "$(body "$r" | json '.saga.completedSteps.join(",")')"
check "pago cobrado" CHARGED "$(payment_status "$(body "$r" | json .saga.context.paymentId)")"
check "stock descontado" "$((STOCK0-2))" "$(stock P-001)"
check "envío programado" SCHEDULED "$(curl -s "$SHIPPING/shipping/$(body "$r" | json .saga.context.shipmentId)" | json .status)"
SAGA_ID=$(body "$r" | json .saga.id)
check "GET /sagas/:id devuelve la saga" "200 COMPLETED" "$(status "$(req GET "$ORDER/sagas/$SAGA_ID")") $(curl -s "$ORDER/sagas/$SAGA_ID" | json .status)"
check "GET /sagas/:id inexistente -> 404" 404 "$(status "$(req GET "$ORDER/sagas/nope")")"
sleep 0.3
kill "$SSE_PID" 2>/dev/null; wait "$SSE_PID" 2>/dev/null || true
check "SSE emitió STARTED y COMPLETED" "yes yes" \
  "$(grep -q "\"sagaId\":\"$SAGA_ID\".*\"status\":\"STARTED\"" "$EVENTS" && echo yes || echo no) $(grep -q "\"sagaId\":\"$SAGA_ID\",\"status\":\"COMPLETED\"" "$EVENTS" && echo yes || echo no)"
rm -f "$EVENTS"

echo "== Idempotencia de POST /orders"
KEY=$(uuidgen)
r1=$(req POST "$ORDER/orders" '{"productId":"P-001","quantity":1,"amount":10}' "$KEY")
PAYMENTS_BEFORE=$(curl -s "$PAYMENT/payments" | json .length)
r2=$(req POST "$ORDER/orders" '{"productId":"P-001","quantity":1,"amount":10}' "$KEY")
check "reintento devuelve la misma orden y saga" "200 $(body "$r1" | json .order.id) COMPLETED" "$(status "$r2") $(body "$r2" | json .order.id) $(body "$r2" | json .saga.status)"
check "reintento no lanza otra saga (no cobra otra vez)" "$PAYMENTS_BEFORE" "$(curl -s "$PAYMENT/payments" | json .length)"

echo "== 2. Sin stock (P-002)"
r=$(buy P-002 1 30)
check "orden CANCELLED, saga COMPENSATED" "CANCELLED COMPENSATED" "$(body "$r" | json .order.status) $(body "$r" | json .saga.status)"
check "failureReason indica OUT_OF_STOCK" "inventory: OUT_OF_STOCK (409)" "$(body "$r" | json .order.failureReason)"
check "pago reembolsado" REFUNDED "$(payment_status "$(body "$r" | json .saga.context.paymentId)")"
check "compensa payment y order en orden inverso" \
  "execute:createOrder:success execute:payment:success execute:inventory:failure compensate:payment:success compensate:createOrder:success" \
  "$(steps "$r")"

echo "== 3. Shipping en error"
fault "$SHIPPING" error
STOCK0=$(stock P-001)
r=$(buy P-001 1 40)
fault "$SHIPPING" none
check "orden CANCELLED, saga COMPENSATED" "CANCELLED COMPENSATED" "$(body "$r" | json .order.status) $(body "$r" | json .saga.status)"
check "compensa inventory, payment y order en orden inverso" \
  "execute:createOrder:success execute:payment:success execute:inventory:success execute:shipping:failure compensate:inventory:success compensate:payment:success compensate:createOrder:success" \
  "$(steps "$r")"
check "stock restaurado" "$STOCK0" "$(stock P-001)"
check "pago reembolsado" REFUNDED "$(payment_status "$(body "$r" | json .saga.context.paymentId)")"

# For Payment to fail right during the compensation: Inventory slow (1.5s per call) and Shipping in error.
# Timeline: reserve finishes ~1.5s, shipping fails, release finishes ~3s, refund attempt 1 ~3s, 2 ~3.5s, 3 ~4.5s.
echo "== Compensación con fallo temporal (reintento exitoso)"
fault "$INVENTORY" slow 1500
fault "$SHIPPING" error
( sleep 0.8; fault "$PAYMENT" error; sleep 3.2; fault "$PAYMENT" none ) &
r=$(buy P-001 1 20)
wait
check "saga COMPENSATED tras reintentar el refund" COMPENSATED "$(body "$r" | json .saga.status)"
check "refund con 2 reintentos y luego éxito" "retry retry success" \
  "$(body "$r" | json '.saga.log.filter(l=>l.step==="payment"&&l.action==="compensate").map(l=>l.result).join(" ")')"
check "pago reembolsado" REFUNDED "$(payment_status "$(body "$r" | json .saga.context.paymentId)")"

echo "== Compensación con fallo persistente (COMPENSATION_FAILED)"
( sleep 0.8; fault "$PAYMENT" error ) &
r=$(buy P-001 1 20)
wait
reset_faults
check "saga COMPENSATION_FAILED" COMPENSATION_FAILED "$(body "$r" | json .saga.status)"
check "refund agota los 3 intentos" "retry retry failure" \
  "$(body "$r" | json '.saga.log.filter(l=>l.step==="payment"&&l.action==="compensate").map(l=>l.result).join(" ")')"
check "el resto de compensaciones sí se ejecutan" "success success" \
  "$(body "$r" | json '.saga.log.filter(l=>["inventory","createOrder"].includes(l.step)&&l.action==="compensate").map(l=>l.result).join(" ")')"
check "pago sigue CHARGED (revisión manual)" CHARGED "$(payment_status "$(body "$r" | json .saga.context.paymentId)")"

summary
