#!/usr/bin/env bash
# Scenario 1: happy path.
# Expected: saga COMPLETED, order CONFIRMED (payment charged, stock decremented, shipment scheduled)
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all

title "Escenario 1: flujo feliz"
STOCK0=$(stock P-001)
say "Stock inicial de P-001: $STOCK0. Compra de 2 unidades de P-001 por 80, sin fallos inyectados"
r=$(buy P-001 2 80)
show_purchase "$r" log

check "saga COMPLETED, orden CONFIRMED" "COMPLETED CONFIRMED" "$(body "$r" | json .saga.status) $(body "$r" | json .order.status)"
check "pago cobrado" CHARGED "$(curl -s "$PAYMENT/payments/$(body "$r" | json .saga.context.paymentId)" | json .status)"
check "stock descontado ($STOCK0 -> $((STOCK0 - 2)))" "$((STOCK0 - 2))" "$(stock P-001)"
check "envío programado" SCHEDULED "$(curl -s "$SHIPPING/shipping/$(body "$r" | json .saga.context.shipmentId)" | json .status)"
summary
