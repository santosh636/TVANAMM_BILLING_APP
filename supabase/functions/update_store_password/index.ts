// supabase/functions/update_store_password/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// eslint-disable-next-line import/no-unresolved
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  const { storeEmail, newPassword } = await req.json();

  if (!storeEmail || !newPassword) {
    return new Response(JSON.stringify({ error: "Missing storeEmail or newPassword" }), { status: 400 });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error: findErr } = await supabaseAdmin.auth.admin.listUsers({ email: storeEmail });

  if (findErr || !data.users.length) {
    return new Response(JSON.stringify({ error: "Store user not found" }), { status: 404 });
  }

  const userId = data.users[0].id;

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
