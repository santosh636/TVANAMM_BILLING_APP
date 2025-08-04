/* eslint-disable import/no-unresolved */
// @ts-ignore: Deno runtime import
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore: Supabase Deno import
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0?target=deno&dts";

// Tell TypeScript about the Deno global
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

serve(async (req: Request): Promise<Response> => {
  try {
    const { email } = await req.json() as { email?: string };

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ email });

    if (listErr || !data?.users.length) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404 }
      );
    }

    const userId = data.users[0].id;

    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteErr) {
      return new Response(
        JSON.stringify({ error: deleteErr.message }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );

  } catch (err: any) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500 }
    );
  }
});
