// supabase/functions/stripe-debug/index.ts
// Diagnostic-only function. Returns 200 with no imports, no auth, no DB.
// If THIS returns 502, the issue is the Supabase gateway/deployment layer, not our code.
// If this returns 200 and create-stripe-checkout still 502s, the bug is in our function.

Deno.serve(() => {
  return new Response(
    JSON.stringify({ ok: true, ts: Date.now(), runtime: "deno", note: "stripe-debug alive" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
