/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ORDER_URL?: string;
  readonly VITE_PAYMENT_URL?: string;
  readonly VITE_INVENTORY_URL?: string;
  readonly VITE_SHIPPING_URL?: string;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
