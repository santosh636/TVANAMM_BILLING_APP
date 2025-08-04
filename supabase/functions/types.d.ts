// supabase/functions/types.d.ts

// Tell TS “these modules exist” even though they’re remote/Deno-only
declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Response | Promise<Response>
  ): void;
}

declare module "https://esm.sh/@supabase/supabase-js" {
  import type { SupabaseClient } from "@supabase/supabase-js";
  export function createClient(...args: any[]): SupabaseClient;
}
