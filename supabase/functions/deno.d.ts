// deno.d.ts - Type definitions for Deno runtime
declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
  }
  
  const env: Env;
  
  interface ServeInit {
    hostname?: string;
    port?: number;
  }
  
  type ServeHandler = (req: Request) => Response | Promise<Response>;
  
  function serve(handler: ServeHandler, options?: ServeInit): Promise<void>;
  function serve(options: ServeInit & { handler: ServeHandler }): Promise<void>;
}

declare const Deno: typeof Deno;
