const SERVICE = 'payment';

/** Common log format: `[service] [sagaId] message`. */
export function log(sagaId: string | null | undefined, message: string): void {
  console.log(`${new Date().toISOString()} [${SERVICE}] [${sagaId ?? '-'}] ${message}`);
}
