// Type stub for Stripe ESM import
declare namespace Stripe {
  interface Event {
    type: string;
    data: {
      object: any;
    };
  }
  namespace Checkout {
    interface Session {
      id?: string;
      amount_total?: number;
      status?: string;
      payment_status?: string;
      customer_email?: string;
      metadata?: Record<string, string>;
      [key: string]: any;
    }
  }
}

declare module "https://esm.sh/stripe@16.0.0?target=deno" {
  export default class Stripe {
    constructor(apiKey: string, config?: any);
    paymentIntents: {
      retrieve(id: string, options?: any): Promise<any>;
    };
    webhooks: {
      constructEvent(body: string, sig: string, secret: string): Stripe.Event;
    };
  }
}
