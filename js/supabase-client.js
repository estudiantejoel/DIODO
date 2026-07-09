// supabase-client.js
// Cliente único de Supabase, usado por admin.html (index.html ya trae su
// propio cliente inline, ver <script> al final de index.html).

const SUPABASE_URL = "https://fybsukirjnbmdjqogdue.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnN1a2lyam5ibWRqcW9nZHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjMzMjIsImV4cCI6MjA5NzgzOTMyMn0.vUQhlPrlILiz5EcY7x5tF6x7olqe7Dao7CUDZ1T2S84";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -----------------------------
// Helper: verificar si el usuario logueado es admin autorizado
// -----------------------------
async function checkIsAuthorizedAdmin() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabaseClient
    .from("admins_autorizados")
    .select("email")
    .eq("email", user.email)
    .single();

  if (error || !data) return false;
  return true;
}