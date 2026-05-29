// Type stub for Supabase ESM import
declare module "https://esm.sh/@supabase/supabase-js@2.48.0?target=deno" {
  export interface SupabaseResponse<T> {
    data: T | null;
    error: any | null;
  }

  export function createClient(url: string, anonKey: string, options?: any): SupabaseClient;
  
  export interface SupabaseClient {
    from(table: string): SupabaseQueryBuilder;
    auth: {
      admin: {
        deleteUser(id: string): Promise<any>;
      };
    };
  }
  
  export interface SupabaseQueryBuilder {
    select(columns?: string): SupabaseQuery;
    insert(data: any): SupabaseQuery;
    update(data: any): SupabaseQuery;
    delete(): SupabaseQuery;
    eq(column: string, value: any): SupabaseQuery;
    single(): SupabaseQuery;
    limit(count: number): SupabaseQuery;
    maybeSingle(): SupabaseQuery;
  }
  
  export interface SupabaseQuery extends Promise<SupabaseResponse<any>> {
    single(): SupabaseQuery;
    maybeSingle(): SupabaseQuery;
    limit(count: number): SupabaseQuery;
    select(columns?: string): SupabaseQuery;
    eq(column: string, value: any): SupabaseQuery;
    single(): SupabaseQuery;
  }

}
