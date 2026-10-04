# Common utilities for the test scripts. Usage: source "$(dirname "$0")/lib.sh"

ORDER=${ORDER_URL:-http://localhost:3001}
PAYMENT=${PAYMENT_URL:-http://localhost:3002}
INVENTORY=${INVENTORY_URL:-http://localhost:3003}
SHIPPING=${SHIPPING_URL:-http://localhost:3004}

PASS=0
FAIL=0
BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT

# json EXPR: evaluates EXPR (e.g. ".order.status") over the JSON from stdin.
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(eval("v"+process.argv[1]))})' "$1"; }

# req METHOD URL [BODY] [IDEMPOTENCY_KEY] -> prints "STATUS BODY"
req() {
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$1" "$2" -H 'Content-Type: application/json')
  [ -n "${3:-}" ] && args+=(-d "$3")
  [ -n "${4:-}" ] && args+=(-H "Idempotency-Key: $4")
  local code; code=$(curl "${args[@]}")
  echo "$code $(cat "$BODY_FILE")"
}

# check DESCRIPTION EXPECTED ACTUAL
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  OK   $1"; else FAIL=$((FAIL+1)); echo "  FAIL $1 (esperado '$2', obtenido '$3')"; fi
}
status() { echo "${1%% *}"; }
body() { echo "${1#* }"; }

# fault URL MODE [DELAY_MS]
fault() { curl -s -o /dev/null -X POST "$1/admin/faults" -H 'Content-Type: application/json' -d "{\"mode\":\"$2\",\"delayMs\":${3:-5000}}"; }
reset_faults() { for url in "$PAYMENT" "$INVENTORY" "$SHIPPING"; do fault "$url" none; done; }
stock() { curl -s "$INVENTORY/inventory/products/$1" | json .stock; }

reset_all() {
  reset_faults
  curl -s -o /dev/null -X POST "$INVENTORY/admin/stock/reset"
  curl -s -o /dev/null -X POST "$ORDER/breakers/reset"
}

# buy PRODUCT QUANTITY AMOUNT -> response from POST /orders (with a new Idempotency-Key)
buy() { req POST "$ORDER/orders" "{\"productId\":\"$1\",\"quantity\":$2,\"amount\":$3}" "$(uuidgen)"; }
# breaker NAME EXPR -> evaluates EXPR over the breaker NAME from GET /breakers
breaker() { curl -s "$ORDER/breakers" | json ".find(b=>b.name===\"$1\")$2"; }
# wait_state NAME STATE SECONDS -> waits for the breaker to reach the state and prints the final state
wait_state() {
  local deadline=$((SECONDS + $3))
  while [ "$(breaker "$1" .state)" != "$2" ] && [ $SECONDS -lt $deadline ]; do sleep 0.5; done
  breaker "$1" .state
}
ms() { node -e 'console.log(Date.now())'; }

# --- Narration (so the output can serve as evidence) ---
title() { echo; echo "=== $* ==="; }
say() { echo "--> $*"; }
# show_purchase RESPONSE [log] -> summary of the order and, with "log", the saga steps
show_purchase() {
  body "$1" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      const r=JSON.parse(s);
      const reason=r.order.failureReason?`  motivo: ${r.order.failureReason}`:"";
      console.log(`    orden ${r.order.id.slice(0,8)}  ${r.order.status}  saga ${r.saga?.status}${reason}`);
      if (process.argv[1]==="log") for (const l of r.saga?.log ?? [])
        console.log(`      ${l.action==="execute"?"ejecutar ":"compensar"} ${l.step.padEnd(11)} ${l.result.toUpperCase().padEnd(7)} ${l.message}`);
    })' "${2:-}"
}
show_breakers() {
  curl -s "$ORDER/breakers" | node -e '
    let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
      for (const b of JSON.parse(s)) {
        const t=b.totals;
        console.log(`    ${b.name.padEnd(9)} ${b.state.padEnd(9)} ventana 10s: ${b.stats.failures}/${b.stats.fires} fallos · totales: éxitos ${t.successes}, fallos ${t.failures}, timeouts ${t.timeouts}, rechazos ${t.rejects}`);
      }
    })'
}

summary() {
  echo
  echo "Resultado: $PASS OK, $FAIL FAIL"
  [ "$FAIL" -eq 0 ]
}
