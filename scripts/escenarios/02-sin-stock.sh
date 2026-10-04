#!/usr/bin/env bash
# Scenario 2: product without stock (P-002).
# Expected: payment refund + order CANCELLED, saga COMPENSATED
set -euo pipefail
source "$(dirname "$0")/../lib.sh"
reset_all

title "Escenario 2: sin stock (P-002)"
say "Compra de P-002 (stock 0): Inventory responde 409 OUT_OF_STOCK"
r=$(buy P-002 1 30)
show_purchase "$r" log

check "saga COMPENSATED, orden CANCELLED" "COMPENSATED CANCELLED" "$(body "$r" | json .saga.status) $(body "$r" | json .order.status)"
check "motivo OUT_OF_STOCK" "inventory: OUT_OF_STOCK (409)" "$(body "$r" | json .order.failureReason)"
check "pago reembolsado" REFUNDED "$(curl -s "$PAYMENT/payments/$(body "$r" | json .saga.context.paymentId)" | json .status)"
check "se compensa payment y luego order" "payment createOrder" \
  "$(body "$r" | json '.saga.log.filter(l=>l.action==="compensate").map(l=>l.step).join(" ")')"
summary
