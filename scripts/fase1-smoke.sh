#!/usr/bin/env bash
# Phase 1: tests each service separately with curl.
# Verifies actions, compensations, idempotency, and fault injection.
set -euo pipefail

source "$(dirname "$0")/lib.sh"
KEY="smoke-$(date +%s)"

echo "== Health"
for url in "$ORDER" "$PAYMENT" "$INVENTORY" "$SHIPPING"; do
  check "GET $url/health" 200 "$(status "$(req GET "$url/health")")"
done

echo "== Order"
# Since phase 2, POST /orders runs the saga. With P-002 (no stock) the saga compensates and the order ends up CANCELLED.
r=$(req POST "$ORDER/orders" '{"productId":"P-002","quantity":1,"amount":50}' "$KEY")
check "POST /orders crea la orden" "201" "$(status "$r")"
ORDER_ID=$(body "$r" | json .order.id)
r=$(req POST "$ORDER/orders" '{"productId":"P-002","quantity":1,"amount":50}' "$KEY")
check "POST /orders repetido devuelve la misma orden" "200 $ORDER_ID" "$(status "$r") $(body "$r" | json .order.id)"
r=$(req POST "$ORDER/orders" '{"productId":"P-002","quantity":1,"amount":50}')
check "POST /orders sin Idempotency-Key -> 400" 400 "$(status "$r")"
r=$(req DELETE "$ORDER/orders/$ORDER_ID?reason=smoke")
check "DELETE /orders/:id deja la orden CANCELLED" "200 CANCELLED" "$(status "$r") $(body "$r" | json .status)"
r=$(req DELETE "$ORDER/orders/$ORDER_ID?reason=smoke")
check "DELETE /orders/:id repetido es idempotente" "200 CANCELLED" "$(status "$r") $(body "$r" | json .status)"

echo "== Payment"
r=$(req POST "$PAYMENT/payments" "{\"orderId\":\"$ORDER_ID\",\"amount\":50}" "$KEY")
check "POST /payments cobra" "201 CHARGED" "$(status "$r") $(body "$r" | json .status)"
PAY_ID=$(body "$r" | json .id)
r=$(req POST "$PAYMENT/payments" "{\"orderId\":\"$ORDER_ID\",\"amount\":50}" "$KEY")
check "POST /payments repetido no duplica" "200 $PAY_ID" "$(status "$r") $(body "$r" | json .id)"
check "solo hay un pago para la clave" 1 "$(curl -s "$PAYMENT/payments" | json ".filter(p=>p.idempotencyKey==='$KEY').length")"
r=$(req POST "$PAYMENT/payments" "{\"orderId\":\"$ORDER_ID\",\"amount\":50}")
check "POST /payments sin Idempotency-Key -> 400" 400 "$(status "$r")"
r=$(req POST "$PAYMENT/payments/$PAY_ID/refund" "" "$KEY")
check "refund revierte el cobro" "200 REFUNDED" "$(status "$r") $(body "$r" | json .status)"
r=$(req POST "$PAYMENT/payments/$PAY_ID/refund" "" "$KEY")
check "refund repetido es idempotente" "200 REFUNDED" "$(status "$r") $(body "$r" | json .status)"

echo "== Inventory"
STOCK0=$(curl -s "$INVENTORY/inventory/products/P-001" | json .stock)
r=$(req POST "$INVENTORY/inventory/reserve" "{\"orderId\":\"$ORDER_ID\",\"productId\":\"P-001\",\"quantity\":2}" "$KEY")
check "reserve descuenta stock" "201 $((STOCK0-2))" "$(status "$r") $(curl -s "$INVENTORY/inventory/products/P-001" | json .stock)"
r=$(req POST "$INVENTORY/inventory/reserve" "{\"orderId\":\"$ORDER_ID\",\"productId\":\"P-001\",\"quantity\":2}" "$KEY")
check "reserve repetido no descuenta otra vez" "200 $((STOCK0-2))" "$(status "$r") $(curl -s "$INVENTORY/inventory/products/P-001" | json .stock)"
r=$(req POST "$INVENTORY/inventory/release" "{\"orderId\":\"$ORDER_ID\"}" "$KEY")
check "release devuelve el stock" "200 $STOCK0" "$(status "$r") $(curl -s "$INVENTORY/inventory/products/P-001" | json .stock)"
r=$(req POST "$INVENTORY/inventory/release" "{\"orderId\":\"$ORDER_ID\"}" "$KEY")
check "release repetido no suma otra vez" "200 $STOCK0" "$(status "$r") $(curl -s "$INVENTORY/inventory/products/P-001" | json .stock)"
r=$(req POST "$INVENTORY/inventory/reserve" "{\"orderId\":\"$ORDER_ID\",\"productId\":\"P-002\",\"quantity\":1}" "$KEY-p2")
check "P-002 sin stock -> 409 OUT_OF_STOCK" "409 OUT_OF_STOCK" "$(status "$r") $(body "$r" | json .error)"

echo "== Shipping"
r=$(req POST "$SHIPPING/shipping/schedule" "{\"orderId\":\"$ORDER_ID\"}" "$KEY")
check "schedule programa el envío" "201 SCHEDULED" "$(status "$r") $(body "$r" | json .status)"
SHIP_ID=$(body "$r" | json .id)
r=$(req POST "$SHIPPING/shipping/schedule" "{\"orderId\":\"$ORDER_ID\"}" "$KEY")
check "schedule repetido no duplica" "200 $SHIP_ID" "$(status "$r") $(body "$r" | json .id)"
r=$(req DELETE "$SHIPPING/shipping/$SHIP_ID" "" "$KEY")
check "DELETE /shipping/:id cancela" "200 CANCELLED" "$(status "$r") $(body "$r" | json .status)"
r=$(req DELETE "$SHIPPING/shipping/$SHIP_ID" "" "$KEY")
check "DELETE /shipping/:id repetido es idempotente" "200 CANCELLED" "$(status "$r") $(body "$r" | json .status)"

echo "== Fault injection"
for svc in "$PAYMENT|/payments|{\"orderId\":\"f\",\"amount\":1}" \
           "$INVENTORY|/inventory/reserve|{\"orderId\":\"f\",\"productId\":\"P-002\",\"quantity\":1}" \
           "$SHIPPING|/shipping/schedule|{\"orderId\":\"f\"}"; do
  IFS='|' read -r base path payload <<<"$svc"
  req POST "$base/admin/faults" '{"mode":"error"}' >/dev/null
  check "$base error -> 500" 500 "$(status "$(req POST "$base$path" "$payload" "$KEY-fault")")"
  check "$base error no afecta /health" 200 "$(status "$(req GET "$base/health")")"
  req POST "$base/admin/faults" '{"mode":"down"}' >/dev/null
  check "$base down -> 503" 503 "$(status "$(req POST "$base$path" "$payload" "$KEY-fault")")"
  req POST "$base/admin/faults" '{"mode":"slow","delayMs":1200}' >/dev/null
  start=$(node -e 'console.log(Date.now())')
  req POST "$base$path" "$payload" "$KEY-slow-$RANDOM" >/dev/null
  elapsed=$(( $(node -e 'console.log(Date.now())') - start ))
  check "$base slow 1200ms tarda >= 1200ms" yes "$([ "$elapsed" -ge 1200 ] && echo yes || echo "no (${elapsed}ms)")"
  req POST "$base/admin/faults" '{"mode":"none"}' >/dev/null
  check "$base none -> GET /admin/faults" none "$(curl -s "$base/admin/faults" | json .mode)"
done

summary
