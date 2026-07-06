// admin.js
// Controla el acceso al panel (solo emails en admins_autorizados) y
// carga/muestra las respuestas guardadas por los usuarios en la tabla
// respuestas_usuarios.
// Requiere supabase-client.js cargado antes (usa `supabaseClient` y
// `checkIsAuthorizedAdmin`, ambos definidos ahí).

let TODAS_LAS_RESPUESTAS = [];

function mostrarSoloPantalla(id){
  ['admin-gate','admin-loading','admin-denied','admin-dashboard'].forEach(s=>{
    document.getElementById(s).style.display = (s===id) ? '' : 'none';
  });
}

async function loginAdmin(){
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] }
  });
  if(error){ console.error(error); alert('No se pudo iniciar sesión con Google.'); }
}

async function logoutAdmin(){
  await supabaseClient.auth.signOut();
  window.location.reload();
}

/* ===================== CARGA DE RESPUESTAS ===================== */
async function cargarRespuestas(){
  const tbody = document.getElementById('tbodyRespuestas');
  tbody.innerHTML = `<tr><td colspan="14" class="admin-empty"><span class="spinner-mini"></span> Cargando respuestas…</td></tr>`;

  const { data, error } = await supabaseClient
    .from('respuestas_usuarios')
    .select('*')
    .order('created_at', { ascending:false });

  if(error){
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="14" class="admin-empty">No se pudieron cargar las respuestas. Revisa la consola / las políticas RLS de la tabla.</td></tr>`;
    return;
  }

  TODAS_LAS_RESPUESTAS = data || [];
  renderStats(TODAS_LAS_RESPUESTAS);
  renderTabla(TODAS_LAS_RESPUESTAS);
}

function renderStats(rows){
  const total = rows.length;
  const registrados = rows.filter(r=>!r.es_invitado).length;
  const invitados = total - registrados;
  const carreras = new Set(rows.map(r=>r.carrera_elegida).filter(Boolean));
  const destinos = new Set(rows.map(r=>r.destino_depto).filter(Boolean));

  const stats = [
    { n: total, l: 'Respuestas totales' },
    { n: registrados, l: 'Con cuenta de Google' },
    { n: invitados, l: 'Como invitado' },
    { n: carreras.size, l: 'Carreras distintas elegidas' },
    { n: destinos.size, l: 'Departamentos de destino' },
  ];
  document.getElementById('statsRow').innerHTML = stats.map(s=>
    `<div class="stat-card"><div class="n">${s.n}</div><div class="l">${s.l}</div></div>`
  ).join('');
}

function escapeHtmlAdmin(str){
  if(str===null || str===undefined) return '';
  return String(str)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function renderTabla(rows){
  const tbody = document.getElementById('tbodyRespuestas');
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="14" class="admin-empty">Todavía no hay respuestas guardadas.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r=>{
    const fecha = r.created_at ? new Date(r.created_at).toLocaleString('es-PE') : '—';
    const residencia = [r.dist_residencia, r.prov_residencia, r.depto_residencia].filter(Boolean).join(', ');
    const destino = [r.destino_prov, r.destino_depto].filter(Boolean).join(', ');
    const presupuesto = r.presupuesto_cat==='otro' && r.presupuesto_monto
      ? `S/. ${r.presupuesto_monto}`
      : (r.presupuesto_cat || '—');
    return `<tr>
      <td>${fecha}</td>
      <td><span class="pill ${r.es_invitado?'invitado':'registrado'}">${r.es_invitado?'Invitado':'Registrado'}</span></td>
      <td>${escapeHtmlAdmin(r.nombre)} ${escapeHtmlAdmin(r.apellido||'')}</td>
      <td>${escapeHtmlAdmin(r.email||'—')}</td>
      <td>${escapeHtmlAdmin(r.edad ?? '—')}</td>
      <td>${escapeHtmlAdmin(r.sexo||'—')}</td>
      <td>${escapeHtmlAdmin(residencia||'—')}</td>
      <td>${escapeHtmlAdmin(r.situacion||'—')}</td>
      <td>${escapeHtmlAdmin(r.colegio||'—')}</td>
      <td>${escapeHtmlAdmin(destino||'—')}</td>
      <td>${escapeHtmlAdmin(presupuesto)}</td>
      <td>${escapeHtmlAdmin(r.carrera_deseada||'—')}</td>
      <td>${escapeHtmlAdmin(r.carrera_elegida||'—')}</td>
      <td>${escapeHtmlAdmin(r.institucion_elegida||'—')}</td>
    </tr>`;
  }).join('');
}

/* ===================== FILTROS ===================== */
function aplicarFiltros(){
  const texto = document.getElementById('filtroTexto').value.trim().toLowerCase();
  const tipo = document.getElementById('filtroTipo').value;
  let filtradas = TODAS_LAS_RESPUESTAS;

  if(tipo==='registrado') filtradas = filtradas.filter(r=>!r.es_invitado);
  if(tipo==='invitado') filtradas = filtradas.filter(r=>r.es_invitado);

  if(texto){
    filtradas = filtradas.filter(r=>{
      const campos = [r.nombre, r.apellido, r.email, r.carrera_deseada, r.carrera_elegida, r.institucion_elegida, r.colegio, r.destino_depto, r.depto_residencia];
      return campos.some(c => (c||'').toString().toLowerCase().includes(texto));
    });
  }
  renderTabla(filtradas);
}
document.getElementById('filtroTexto').addEventListener('input', aplicarFiltros);
document.getElementById('filtroTipo').addEventListener('change', aplicarFiltros);

/* ===================== INIT: verificar sesión y autorización ===================== */
(async function initAdmin(){
  mostrarSoloPantalla('admin-loading');

  const { data: { session } } = await supabaseClient.auth.getSession();
  if(!session || !session.user){
    mostrarSoloPantalla('admin-gate');
    return;
  }

  const autorizado = await checkIsAuthorizedAdmin();
  if(!autorizado){
    document.getElementById('deniedEmail').textContent = session.user.email;
    mostrarSoloPantalla('admin-denied');
    return;
  }

  document.getElementById('adminEmail').textContent = session.user.email;
  mostrarSoloPantalla('admin-dashboard');
  await cargarRespuestas();
})();