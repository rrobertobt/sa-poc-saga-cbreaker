/** Data shared by the saga steps; persisted after each step. */
export interface SagaContext {
  sagaId: string;
  orderId: string;
  productId: string;
  quantity: number;
  amount: number;
  paymentId?: string;
  reservationId?: string;
  shipmentId?: string;
  failureReason?: string;
}

export interface SagaStep {
  name: string;
  /** May return text with the result detail for the log. */
  execute(ctx: SagaContext): Promise<string | void>;
  compensate(ctx: SagaContext): Promise<string | void>;
}

export interface SagaDefinition {
  steps: SagaStep[];
  /** Runs after the last step, before marking the saga COMPLETED. */
  onCompleted?(ctx: SagaContext): Promise<void>;
}
