// Type stub for Supabase ESM import
declare module "https://esm.sh/@supabase/supabase-js@2.48.0?target=deno" {
  export interface SupabaseResponse<T> {
    data: T | null;
    error: { message: string; code?: string } | null;
  }

  export function createClient(url: string, anonKey: string, options?: Record<string, unknown>): SupabaseClient;

  export interface SupabaseClient {
    from(table: string): SupabaseQueryBuilder;
    auth: {
      admin: {
        deleteUser(id: string): Promise<SupabaseResponse<null>>;
      };
    };
  }

  export interface SupabaseQueryBuilder {
    select(columns?: string): SupabaseQuery;
    insert(data: Record<string, unknown> | Record<string, unknown>[]): SupabaseQuery;
    update(data: Record<string, unknown>): SupabaseQuery;
    delete(): SupabaseQuery;
    eq(column: string, value: unknown): SupabaseQuery;
    single(): SupabaseQuery;
    limit(count: number): SupabaseQuery;
    maybeSingle(): SupabaseQuery;
  }

  export interface SupabaseQuery extends Promise<SupabaseResponse<unknown>> {
    single(): SupabaseQuery;
    maybeSingle(): SupabaseQuery;
    limit(count: number): SupabaseQuery;
    select(columns?: string): SupabaseQuery;
    eq(column: string, value: unknown): SupabaseQuery;
    single(): SupabaseQuery;
  }

}
