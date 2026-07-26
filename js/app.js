/* =====================================================================
   CONFIGURACIÓN — datos de tu proyecto Supabase
   (Project Settings > API). El anon key es público y seguro de exponer
   en el cliente porque las tablas están protegidas con RLS de solo-lectura.
   ===================================================================== */
const SUPABASE_URL = "https://fybsukirjnbmdjqogdue.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5YnN1a2lyam5ibWRqcW9nZHVlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjMzMjIsImV4cCI6MjA5NzgzOTMyMn0.vUQhlPrlILiz5EcY7x5tF6x7olqe7Dao7CUDZ1T2S84";
const EDGE_FN_BUSCAR_INSTITUCIONES = `${SUPABASE_URL}/functions/v1/rapid-worker`; // = gemini-buscar-instituciones
const EDGE_FN_GENERAR_DETALLE = `${SUPABASE_URL}/functions/v1/gemini-realidad-carrera`;
const EDGE_FN_PLAN_VIDA = `${SUPABASE_URL}/functions/v1/clever-processor`; // = gemini-plan-vida
const EDGE_FN_CHAT_PLAN = `${SUPABASE_URL}/functions/v1/bright-service`; // = gemini-chat-plan
const EDGE_FN_PREPLAN_PREGUNTAS = `${SUPABASE_URL}/functions/v1/gemini-preplan-preguntas`; // ajusta el slug al que le pongas al desplegarla

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===================== SONIDO (Web Audio, sin archivos) ===================== */
let audioCtx;
function ensureAudio(){ if(!audioCtx){ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } }
function play(type){
  try{
    ensureAudio();
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    let freq=600, dur=.07, wave='sine';
    if(type==='tap'){ freq=720; dur=.05; }
    if(type==='confirm'){ freq=880; dur=.09; wave='triangle'; }
    if(type==='back'){ freq=320; dur=.08; wave='sine'; }
    if(type==='select'){ freq=1040; dur=.045; wave='triangle'; }
    if(type==='error'){ freq=180; dur=.16; wave='sawtooth'; }
    if(type==='type'){ freq=950; dur=.02; wave='sine'; }
    o.type = wave; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(type==='type'?.06:.14, t+.01);
    g.gain.exponentialRampToValueAtTime(.0001, t+dur);
    o.start(t); o.stop(t+dur+.02);
  }catch(e){}
}
document.addEventListener('click', ()=>{ ensureAudio(); }, {once:true});

/* ===================== ESTADO GLOBAL ===================== */
const state = {
  step:0, guest:false, sessionId:null, userId:null, userEmail:null,
  nombre:'', apellido:'', edad:'', sexo:'',
  deptoId:null, provId:null, distId:null, depto:'', prov:'', dist:'',
  situacion:'', grado:'', colegio:'',
  hobbies:{}, destino:'', destinoId:null, destinoProv:'', destinoProvId:null,
  destinoTouched:false,
  presupuestoCat:'', presupuestoMonto:null,
  carreraDeseada:'', carreraDeseadaFamiliaId:null,
  carreraElegida:null, carreraElegidaFamiliaId:null, matchChosenId:null,
  institucionElegida:null,
  planFases:null, chatHistorial:[],
  contextoAdicional:{ familia:null, dondeTrabajar:null, necesitaTrabajar:null, notas:'' },
  preplanIndex:0, preplanPreguntas:null
};
// Cada visitante recibe un id de sesión propio para poder actualizar su
// misma fila si retrocede y cambia algo, en vez de crear una fila duplicada.
state.sessionId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const STEP_NAMES = ['Inicio','Perfil','Intereses','Futuro','Match','Realidad','Estudios','Registro','Plan'];

function toast(msg, isError){
  const t = document.getElementById('toast');
  document.getElementById('toastTxt').textContent = msg;
  document.getElementById('toastDot').classList.toggle('err', !!isError);
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2800);
}

// Escapa texto que viene de la base de datos / del usuario antes de insertarlo
// con innerHTML, para evitar que nombres con caracteres especiales rompan el
// layout o inyecten HTML.
function escapeHtml(str){
  if(str===null || str===undefined) return '';
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/* ===================== BADGE / MENÚ DE CUENTA ===================== */
function toggleAccountMenu(e){
  if(e) e.stopPropagation();
  play('tap');
  document.getElementById('accountMenu').classList.toggle('show');
}
document.addEventListener('click', (e)=>{
  const menu = document.getElementById('accountMenu');
  const badge = document.getElementById('accountBadge');
  if(menu && menu.classList.contains('show') && !menu.contains(e.target) && !badge.contains(e.target)){
    menu.classList.remove('show');
  }
});
async function cerrarSesion(){
  play('tap');
  document.getElementById('accountMenu').classList.remove('show');
  await sb.auth.signOut();
  state.guest = true;
  state.userId = null;
  state.userEmail = null;
  toast('Sesión cerrada.');
  renderAccountBadge(null);
}
function renderAccountBadge(user){
  const img = document.getElementById('accountAvatarImg');
  const sil = document.getElementById('accountSilhouette');
  const nameEl = document.getElementById('amName');
  const emailEl = document.getElementById('amEmail');
  const loginBtn = document.getElementById('amLoginBtn');
  const logoutBtn = document.getElementById('amLogoutBtn');
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  if(user && avatarUrl){
    img.src = avatarUrl; img.style.display='block'; sil.style.display='none';
  } else {
    img.style.display='none'; sil.style.display='block';
  }

  if(user){
    const nombre = user.user_metadata?.full_name || user.user_metadata?.given_name || '';
    nameEl.textContent = nombre; nameEl.style.display = nombre ? 'block' : 'none';
    emailEl.textContent = user.email || ''; emailEl.style.display = user.email ? 'block' : 'none';
    loginBtn.style.display='none'; logoutBtn.style.display='block';
  } else {
    nameEl.style.display='none'; emailEl.style.display='none';
    loginBtn.style.display='block'; logoutBtn.style.display='none';
  }
}
renderAccountBadge(null);

/* ===================== LOGIN CON GOOGLE =====================
   signInWithOAuth hace un redirect COMPLETO de página (a Google y de
   vuelta), lo que borra cualquier variable en memoria. Por eso, antes de
   redirigir, guardamos `state` (y en qué pregunta del test iba, si aplica)
   en sessionStorage, y en init() lo restauramos junto con la sesión. */
function guardarStatePreLogin(nextStep){
  try{
    sessionStorage.setItem('diodo_state', JSON.stringify(state));
    sessionStorage.setItem('diodo_next_step', String(nextStep));
    sessionStorage.setItem('diodo_qIndex', String(qIndex));
  }catch(e){ console.error('No se pudo guardar el estado antes del login:', e); }
}
async function loginConGoogle(nextStep){
  play('tap');
  document.getElementById('accountMenu').classList.remove('show');
  guardarStatePreLogin(nextStep);
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href.split('#')[0] }
  });
  if(error){
    console.error(error);
    toast('No se pudo iniciar sesión con Google.', true);
  }
  // Si no hubo error, el navegador redirige a Google y luego vuelve aquí;
  // la sesión y el state guardado se restauran en init().
}

/* ===================== GUARDADO EN SUPABASE (para el panel de admin) ===================== */
async function guardarRespuestaEnBD(){
  try{
    const { data: { user } } = await sb.auth.getUser();
    const payload = {
      id: state.sessionId,
      user_id: user ? user.id : null,
      email: user ? user.email : null,
      nombre: state.nombre,
      apellido: state.apellido,
      edad: state.edad ? Number(state.edad) : null,
      sexo: state.sexo,
      depto_residencia: state.depto,
      prov_residencia: state.prov,
      dist_residencia: state.dist,
      situacion: state.situacion,
      grado: state.grado,
      colegio: state.colegio,
      destino_depto: state.destino,
      destino_prov: state.destinoProv,
      presupuesto_cat: state.presupuestoCat,
      presupuesto_monto: state.presupuestoMonto,
      carrera_deseada: state.carreraDeseada,
      carrera_elegida: state.carreraElegida,
      institucion_elegida: state.institucionElegida,
      es_invitado: !!state.guest,
      hobbies: state.hobbies,
      progreso_paso: state.step,
      progreso_state: { ...state, qIndex },
      completado: true,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('respuestas_usuarios').upsert(payload, { onConflict: 'id' });
    if(error){
      console.error('No se pudo guardar la respuesta en Supabase → code:', error.code,
        '| message:', error.message, '| details:', error.details, '| hint:', error.hint);
    }
  }catch(e){
    console.error('Error guardando respuesta:', e);
  }
}

/* ===================== GUARDADO DE PROGRESO (para retomar el test) =====================
   A diferencia de guardarRespuestaEnBD (que se llama una sola vez, al llegar
   al paso final), esto se llama en CADA cambio de paso mientras el usuario
   está logueado, para poder restaurar su avance si cierra la pestaña y
   vuelve otro día — incluso desde otro dispositivo, porque queda ligado a
   su user_id en Supabase (no a sessionStorage). No se guarda nada de esto
   para invitados. */
let _guardandoProgreso = false;
async function guardarProgreso(){
  if(state.guest || !state.userId) return; // solo usuarios logueados con Google
  if(_guardandoProgreso) return; // evita upserts superpuestos si el usuario navega rápido
  _guardandoProgreso = true;
  try{
    const payload = {
      id: state.sessionId,
      user_id: state.userId,
      email: state.userEmail || null,
      nombre: state.nombre,
      es_invitado: false,
      progreso_paso: state.step,
      progreso_state: { ...state, qIndex },
      completado: false,
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('respuestas_usuarios').upsert(payload, { onConflict: 'id' });
    if(error){
      console.error('No se pudo guardar el progreso → code:', error.code,
        '| message:', error.message, '| details:', error.details, '| hint:', error.hint);
    }
  }catch(e){
    console.error('Error guardando progreso:', e);
  }finally{
    _guardandoProgreso = false;
  }
}

/* =====================================================================
   CARGA DE DATOS DESDE SUPABASE
   ===================================================================== */
const DB = {
  departamentos: [],          // [{id, nombre}]
  provinciasPorDepto: {},     // deptoId -> [{id, nombre}]
  distritosPorProv: {},       // provId -> [{id, nombre}]
  preguntas: [],               // [{orden, clave, titulo, subtitulo}]
  familias: [],                // [{id, nombre, pesos}]
  detallePorFamilia: {},       // familiaId -> detalle
};

async function cargarUbigeoBase(){
  const { data, error } = await sb.from('ubigeo_departamentos').select('id, nombre').order('nombre');
  if(error){ toast('No se pudo conectar a Supabase. Revisa la configuración.', true); console.error(error); return; }
  DB.departamentos = data;
}
async function cargarProvincias(deptoId){
  if(DB.provinciasPorDepto[deptoId]) return DB.provinciasPorDepto[deptoId];
  const { data, error } = await sb.from('ubigeo_provincias').select('id, nombre').eq('departamento_id', deptoId).order('nombre');
  if(error){ console.error(error); return []; }
  DB.provinciasPorDepto[deptoId] = data;
  return data;
}
async function cargarDistritos(provId){
  if(DB.distritosPorProv[provId]) return DB.distritosPorProv[provId];
  const { data, error } = await sb.from('ubigeo_distritos').select('id, nombre').eq('provincia_id', provId).order('nombre');
  if(error){ console.error(error); return []; }
  DB.distritosPorProv[provId] = data;
  return data;
}

/* =====================================================================
   PREGUNTAS — modelo RIASEC puro (6 dimensiones)
   ===================================================================== */
const PREGUNTAS_EXTRA = [
  // R — Realista (4 preguntas): manos a la obra, técnico, físico
  { clave:'riasec_realista_1', titulo:'Manos a la obra', subtitulo:'Prefiero arreglar algo con mis manos antes que solo leer cómo se hace.' },
  { clave:'riasec_realista_2', titulo:'Manos a la obra', subtitulo:'Me gusta trabajar con herramientas, máquinas o equipos.' },
  { clave:'riasec_realista_3', titulo:'Manos a la obra', subtitulo:'Prefiero estar en movimiento o al aire libre antes que sentado en una oficina.' },
  { clave:'riasec_realista_4', titulo:'Manos a la obra', subtitulo:'Si algo se rompe en casa, prefiero intentar repararlo yo mismo antes de llamar a alguien.' },

  // I — Investigador (4 preguntas): análisis, curiosidad, lógica
  { clave:'riasec_investigador_1', titulo:'Curiosidad y análisis', subtitulo:'Me gusta entender por qué las cosas funcionan como funcionan.' },
  { clave:'riasec_investigador_2', titulo:'Curiosidad y análisis', subtitulo:'Disfruto resolver acertijos, problemas lógicos o rompecabezas.' },
  { clave:'riasec_investigador_3', titulo:'Curiosidad y análisis', subtitulo:'Prefiero investigar a fondo un tema antes de opinar sobre él.' },
  { clave:'riasec_investigador_4', titulo:'Curiosidad y análisis', subtitulo:'Me siento cómodo usando datos, cifras o experimentos para tomar una decisión.' },

  // A — Artístico (3 preguntas): creatividad, expresión
  { clave:'riasec_artistico_1', titulo:'Creatividad', subtitulo:'Me gusta crear cosas originales: dibujos, textos, música o diseños.' },
  { clave:'riasec_artistico_2', titulo:'Creatividad', subtitulo:'Prefiero tareas donde me pueda expresar libremente, sin reglas fijas.' },
  { clave:'riasec_artistico_3', titulo:'Creatividad', subtitulo:'Disfruto imaginar ideas nuevas más que seguir instrucciones exactas.' },

  // S — Social (4 preguntas): ayudar, enseñar, cuidar
  { clave:'riasec_social_1', titulo:'Ayudar a otros', subtitulo:'Me gusta ayudar a otras personas a resolver sus problemas.' },
  { clave:'riasec_social_2', titulo:'Ayudar a otros', subtitulo:'Disfruto explicarle algo a alguien hasta que lo entienda.' },
  { clave:'riasec_social_3', titulo:'Ayudar a otros', subtitulo:'Me preocupo genuinamente por el bienestar de las personas a mi alrededor.' },
  { clave:'riasec_social_4', titulo:'Ayudar a otros', subtitulo:'Prefiero trabajar coordinando con un equipo antes que resolver todo yo solo.' },

  // E — Emprendedor (4 preguntas): liderar, persuadir, iniciar
  { clave:'riasec_emprendedor_1', titulo:'Liderar e iniciar', subtitulo:'Me gusta convencer a otros de mis ideas.' },
  { clave:'riasec_emprendedor_2', titulo:'Liderar e iniciar', subtitulo:'Disfruto tomar la iniciativa cuando nadie más lo hace.' },
  { clave:'riasec_emprendedor_3', titulo:'Liderar e iniciar', subtitulo:'Me atrae la idea de tener mi propio negocio algún día.' },
  { clave:'riasec_emprendedor_4', titulo:'Liderar e iniciar', subtitulo:'Prefiero decidir yo mismo cómo hacer las cosas, sin que me digan paso a paso.' },

  // C — Convencional (3 preguntas): orden, estructura, datos
  { clave:'riasec_convencional_1', titulo:'Orden y estructura', subtitulo:'Me siento cómodo con reglas claras y tareas bien organizadas.' },
  { clave:'riasec_convencional_2', titulo:'Orden y estructura', subtitulo:'Disfruto ordenar información, archivos o datos de forma precisa.' },
  { clave:'riasec_convencional_3', titulo:'Orden y estructura', subtitulo:'Prefiero seguir un método probado antes que improvisar.' },
];
async function cargarPreguntas(){
  const { data, error } = await sb.from('preguntas_test').select('*').order('orden');
  if(error){ console.error('No se pudieron cargar preguntas de Supabase, se usarán solo las preguntas adicionales:', error); }
  const base = data || [];
  const clavesBase = new Set(base.map(p=>p.clave));
  const extra = PREGUNTAS_EXTRA.filter(p => !clavesBase.has(p.clave));
  DB.preguntas = [...base, ...extra];
}
async function cargarFamiliasYDetalle(){
  const { data, error } = await sb.from('carrera_familias').select('id, nombre, pesos');
  if(error){ console.error(error); return; }
  DB.familias = data;
  const { data: detalles } = await sb.from('carrera_detalle').select('*');
  (detalles||[]).forEach(d=>{ DB.detallePorFamilia[d.carrera_familia_id] = d; });
  const sinDetalle = DB.familias.filter(f => !DB.detallePorFamilia[f.id]);
  if(sinDetalle.length){
    console.warn(`⚠️ ${sinDetalle.length} de ${DB.familias.length} carreras NO tienen datos en carrera_detalle (saldrán como "sin datos" en el Paso 5):`);
    console.table(sinDetalle.map(f=>({ id:f.id, nombre:f.nombre })));
  }
}
async function buscarColegiosPorDistrito(distId){
  if(!distId) return [];
  const { data } = await sb.from('colegios').select('nombre').eq('distrito_id', distId).order('nombre').limit(20);
  return (data||[]).map(c=>c.nombre);
}
async function guardarColegioSiNoExiste(nombre, distId){
  if(!nombre || !distId) return;
  await sb.from('colegios').upsert({ nombre, distrito_id: distId }, { onConflict:'distrito_id,nombre' });
}
// Escapa los caracteres especiales de ILIKE (%, _) para que el texto que
// escribe el usuario se busque literalmente y no como patrón.
function escapeIlike(term){
  return term.replace(/[%_\\]/g, m => '\\' + m);
}
// Autocompletado real contra las carreras reales cargadas desde el xlsx de universidades
async function buscarCarrerasAutocomplete(term){
  if(!term || term.length<2) return [];
  const safeTerm = escapeIlike(term);
  const { data, error } = await sb
    .from('carrera_nombres')
    .select('id, nombre, familia_id')
    .ilike('nombre', `%${safeTerm}%`)
    .order('nombre')
    .limit(8);
  if(error){ console.error(error); return []; }
  return data;
}

/* ===================== NAVEGACIÓN ===================== */
function goTo(step){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('show'));
  document.getElementById('screen-'+step).classList.add('show');
  state.step = step;
  document.getElementById('railWrap').style.display = step===0 ? 'none' : 'flex';
  renderRail();
  window.scrollTo({top:0, behavior:'smooth'});
  if(step===2){ renderQuestion(true); }
  if(step===3) renderPasoFuturo();
  if(step===4) renderMatch();
  if(step===5) renderRealidad();
  if(step===6) renderInstituciones();
  if(step===7) document.getElementById('gateNombre').textContent = `¡Excelente elección, ${state.nombre||'amig@'}!`;
  if(step===8){ iniciarPreplanChat(); guardarRespuestaEnBD(); }
  else if(step>=1){ guardarProgreso(); } // autosave de avance para usuarios logueados (paso 8 ya lo guarda completo arriba)
}
function renderRail(){
  const rail = document.getElementById('rail');
  rail.innerHTML='';
  const total = 8;
  for(let i=1;i<=total;i++){
    const n = document.createElement('div');
    n.className='node' + (i<state.step?' active':'') + (i===state.step?' current':'');
    rail.appendChild(n);
    if(i<total){
      const seg = document.createElement('div');
      seg.className='seg' + (i<state.step?' active':'');
      rail.appendChild(seg);
    }
  }
  document.getElementById('railStepLabel').textContent = `Paso ${Math.max(state.step,1)} / 8`;
  document.getElementById('railNameLabel').textContent = STEP_NAMES[state.step] || '';
}

/* ===================== PANTALLA 1: PERFIL ===================== */
function buildEdadChips(){
  const wrap = document.getElementById('grpEdad');
  for(let e=13;e<=22;e++){
    const c = document.createElement('div');
    c.className='chip'; c.textContent=e; c.dataset.val=e;
    wrap.appendChild(c);
  }
}
buildEdadChips();
function setupChipGroup(id, key){
  document.querySelectorAll('#'+id+' .chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      play('select');
      document.querySelectorAll('#'+id+' .chip').forEach(c=>c.classList.remove('selected'));
      chip.classList.add('selected');
      state[key] = chip.dataset.val;
    });
  });
}
setupChipGroup('grpEdad','edad');
setupChipGroup('grpSexo','sexo');

function fillSelect(sel, options, placeholder, valueKey='id', labelKey='nombre'){
  sel.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + options.map(o=>`<option value="${escapeHtml(o[valueKey])}">${escapeHtml(o[labelKey])}</option>`).join('');
}
const selDepto = document.getElementById('selDepto');
const selProv = document.getElementById('selProv');
const selDist = document.getElementById('selDist');

async function initUbigeoPerfil(){
  await cargarUbigeoBase();
  fillSelect(selDepto, DB.departamentos, 'Departamento');
}
selDepto.addEventListener('change', async ()=>{
  play('select');
  state.deptoId = selDepto.value || null;
  state.depto = selDepto.selectedOptions[0]?.textContent || '';
  state.provId=null; state.prov=''; state.distId=null; state.dist='';
  document.getElementById('inDistOtro').style.display='none';
  selDist.disabled=true; selDist.innerHTML='<option value="">Distrito</option>';
  if(state.deptoId){
    selProv.innerHTML='<option value="">Cargando…</option>'; selProv.disabled=true;
    const provs = await cargarProvincias(state.deptoId);
    fillSelect(selProv, provs, 'Provincia');
    selProv.disabled=false;
  } else { selProv.disabled=true; selProv.innerHTML='<option value="">Provincia</option>'; }
});
selProv.addEventListener('change', async ()=>{
  play('select');
  state.provId = selProv.value || null;
  state.prov = selProv.selectedOptions[0]?.textContent || '';
  state.distId=null; state.dist='';
  document.getElementById('inDistOtro').style.display='none';
  if(state.provId){
    selDist.innerHTML='<option value="">Cargando…</option>'; selDist.disabled=true;
    const dists = await cargarDistritos(state.provId);
    fillSelect(selDist, dists, 'Distrito');
    const otroOpt = document.createElement('option');
    otroOpt.value = '__otro__'; otroOpt.textContent='Otro distrito (escribirlo)';
    selDist.appendChild(otroOpt);
    selDist.disabled=false;
  } else { selDist.disabled=true; selDist.innerHTML='<option value="">Distrito</option>'; }
});
selDist.addEventListener('change', async ()=>{
  play('select');
  const otroInput = document.getElementById('inDistOtro');
  if(selDist.value==='__otro__'){
    otroInput.style.display='block'; otroInput.value=''; state.distId=null; state.dist=''; otroInput.focus();
  } else {
    otroInput.style.display='none';
    state.distId = selDist.value || null;
    state.dist = selDist.selectedOptions[0]?.textContent || '';
  }
  await refreshColegiosList();
});
document.getElementById('inDistOtro').addEventListener('input', (e)=>{ state.dist = e.target.value.trim(); });
async function refreshColegiosList(){
  const lista = await buscarColegiosPorDistrito(state.distId);
  const datalist = document.getElementById('colegiosList');
  datalist.innerHTML='';
  lista.forEach(c=>{ const o=document.createElement('option'); o.value=c; datalist.appendChild(o); });
  const hint = document.getElementById('colegioHint');
  hint.textContent = lista.length ? `${lista.length} colegio(s) sugeridos para ${state.dist}.`
    : state.dist ? `No tenemos colegios registrados de ${state.dist} todavía — escribe el tuyo y quedará guardado.` : '';
}
document.getElementById('inColegio').addEventListener('blur', (e)=>{
  const nombre = e.target.value.trim();
  if(nombre) guardarColegioSiNoExiste(nombre, state.distId);
});

document.getElementById('selSituacion').addEventListener('change', (e)=>{
  play('select');
  state.situacion = e.target.value;
  document.getElementById('bloqueColegio').style.display = (state.situacion==='colegio') ? 'flex' : 'none';
});

function validateAndGo(next){
  if(state.step===1){
    state.nombre = document.getElementById('inNombre').value.trim();
    state.apellido = document.getElementById('inApellido').value.trim();
    state.grado = document.getElementById('selGrado') ? document.getElementById('selGrado').value : '';
    state.colegio = document.getElementById('inColegio') ? document.getElementById('inColegio').value.trim() : '';
    if(!state.nombre || !state.edad || !state.deptoId || (!state.distId && !state.dist) || !state.situacion){
      play('error'); toast('Completa los campos marcados antes de continuar.', true); return;
    }
    if(state.situacion==='colegio' && (!state.grado || !state.colegio)){
      play('error'); toast('Cuéntanos tu grado y colegio para continuar.', true); return;
    }
  }
  if(state.step===3){
    if(!state.destino || !state.presupuestoCat){ play('error'); toast('Elige destino y presupuesto.', true); return; }
    if(state.presupuestoCat==='otro' && (!state.presupuestoMonto || state.presupuestoMonto<=0)){
      play('error'); toast('Escribe un monto válido para tu presupuesto.', true); return;
    }
    intentarResolverCarreraEscrita();
  }
  if(state.step===6){
    if(!state.institucionElegida){ play('error'); toast('Selecciona una institución.', true); return; }
  }
  goTo(next);
}

/* ===================== PANTALLA 2: PREGUNTAS CON TRANSICIÓN ===================== */
const OPCIONES_5 = [
  {label:"Nada, no me identifica", val:1},
  {label:"Poco", val:2},
  {label:"Algo, depende", val:3},
  {label:"Bastante", val:4},
  {label:"Mucho, me encanta", val:5},
];
let qIndex = 0;

function renderQuestion(instant, dir){
  const total = DB.preguntas.length || 1;
  const p = DB.preguntas[qIndex] || {titulo:'Cargando…', subtitulo:''};
  const card = document.getElementById('qCard');
  const opts = document.getElementById('qOptions');

  const paint = ()=>{
    document.getElementById('qCounter').textContent = `Pregunta ${qIndex+1} de ${total}`;
    document.getElementById('qTitle').textContent = p.titulo;
    document.getElementById('qSubtitle').textContent = p.subtitulo;
    const mini = document.getElementById('qProgressMini');
    mini.innerHTML = DB.preguntas.map((_,i)=>`<span class="${i<qIndex?'done':''}"></span>`).join('');
    opts.innerHTML='';
    OPCIONES_5.forEach(o=>{
      const div = document.createElement('div');
      div.className='q-opt';
      const selectedNow = state.hobbies[p.clave]===o.val;
      if(selectedNow) div.classList.add('selected');
      div.innerHTML = `<span>${escapeHtml(o.label)}</span><span class="qval">${o.val}/5</span>`;
      div.onclick = ()=>{
        play('select');
        state.hobbies[p.clave] = o.val;
        if(qIndex < total-1){ qIndex++; renderQuestion(false,'next'); }
        else { goTo(3); }
      };
      opts.appendChild(div);
    });
    card.classList.remove('q-slide-out-left','q-slide-out-right','q-slide-in');
    opts.classList.remove('q-slide-out-left','q-slide-out-right','q-slide-in');
  };

  if(instant || !dir){ paint(); return; }
  const outClass = dir==='next' ? 'q-slide-out-left' : 'q-slide-out-right';
  card.classList.add(outClass); opts.classList.add(outClass);
  setTimeout(()=>{
    paint();
    card.classList.add('q-slide-in'); opts.classList.add('q-slide-in');
    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        card.classList.remove('q-slide-in'); opts.classList.remove('q-slide-in');
      });
    });
  }, 220);
}
function prevQuestion(){
  if(qIndex>0){ qIndex--; renderQuestion(false,'prev'); }
  else { goTo(1); }
}

/* ===================== PANTALLA 3: FUTURO + AUTOCOMPLETADO DE CARRERA ===================== */
async function renderPasoFuturo(){
  const sel = document.getElementById('selDestino');
  fillSelect(sel, DB.departamentos, 'Selecciona un departamento');
  if(state.destinoTouched && state.destinoId){
    sel.value = state.destinoId;
  } else if(state.deptoId){
    sel.value = state.deptoId;
  }
  state.destinoId = sel.value || null;
  state.destino = sel.selectedOptions[0]?.textContent || '';
  sel.onchange = async ()=>{
    play('select');
    state.destinoTouched = true;
    state.destinoId = sel.value || null;
    state.destino = sel.selectedOptions[0]?.textContent || '';
    state.destinoProvId=null; state.destinoProv='';
    await fillProvDestino();
  };
  await fillProvDestino();

  if(state.carreraDeseada) inCarrera.value = state.carreraDeseada;

  document.querySelectorAll('#grpPresupuesto .radio-card').forEach(card=>{
    card.classList.toggle('selected', card.dataset.val===state.presupuestoCat);
    card.onclick = ()=>{
      play('select');
      document.querySelectorAll('#grpPresupuesto .radio-card').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      state.presupuestoCat = card.dataset.val;
      const otro = document.getElementById('inPresupuestoOtro');
      otro.style.display = (state.presupuestoCat==='otro') ? 'block' : 'none';
      if(state.presupuestoCat==='otro') otro.focus();
    };
  });
  const otroInput = document.getElementById('inPresupuestoOtro');
  otroInput.style.display = (state.presupuestoCat==='otro') ? 'block' : 'none';
  otroInput.value = state.presupuestoMonto || '';
  otroInput.oninput = ()=>{ state.presupuestoMonto = +otroInput.value || null; };
}
async function fillProvDestino(){
  const selP = document.getElementById('selProvDestino');
  if(state.destinoId){
    selP.innerHTML='<option value="">Cargando…</option>'; selP.disabled=true;
    const provs = await cargarProvincias(state.destinoId);
    fillSelect(selP, provs, 'Selecciona una provincia');
    if(state.destinoProvId) selP.value = state.destinoProvId;
    state.destinoProvId = selP.value || null;
    state.destinoProv = selP.selectedOptions[0]?.textContent || '';
    selP.disabled=false;
    selP.onchange = ()=>{
      play('select');
      state.destinoProvId = selP.value || null;
      state.destinoProv = selP.selectedOptions[0]?.textContent || '';
    };
  } else {
    selP.disabled=true; selP.innerHTML='<option value="">Primero elige un departamento</option>';
  }
}

const inCarrera = document.getElementById('inCarreraDeseada');
const acBox = document.getElementById('acCarreras');
let acTimer=null, acIndex=-1, acItemsCache=[], acRequestId=0;

function highlight(nombre, term){
  const i = nombre.toLowerCase().indexOf(term.toLowerCase());
  if(i<0) return escapeHtml(nombre);
  return escapeHtml(nombre.slice(0,i)) + '<mark>' + escapeHtml(nombre.slice(i,i+term.length)) + '</mark>' + escapeHtml(nombre.slice(i+term.length));
}
function bindAcItems(items, esSugerencia){
  acBox.querySelectorAll('.ac-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      play('select');
      const r = items[+el.dataset.i];
      inCarrera.value = r.nombre;
      state.carreraDeseada = r.nombre;
      state.carreraDeseadaFamiliaId = esSugerencia ? r.id : r.familia_id;
      acBox.classList.remove('show'); acBox.innerHTML='';
    });
  });
}
inCarrera.addEventListener('focus', ()=>{});
inCarrera.addEventListener('input', ()=>{
  play('type');
  state.carreraDeseada = inCarrera.value.trim();
  state.carreraDeseadaFamiliaId = null;
  clearTimeout(acTimer);
  const term = state.carreraDeseada;
  if(term.length<2){
    acBox.classList.remove('show'); acBox.innerHTML='';
    return;
  }
  acBox.innerHTML = '<div class="loading-row"><span class="spinner-mini"></span>Buscando carreras…</div>';
  acBox.classList.add('show');
  const myRequestId = ++acRequestId;
  acTimer = setTimeout(async ()=>{
    const results = await buscarCarrerasAutocomplete(term);
    if(myRequestId !== acRequestId) return;
    acItemsCache = results; acIndex=-1;
    const exacta = results.find(r => normalizarNombre(r.nombre) === normalizarNombre(term));
    if(exacta){ state.carreraDeseadaFamiliaId = exacta.familia_id; }
    if(!results.length){ acBox.innerHTML = `<div class="ac-empty">Sin coincidencias — puedes escribir el nombre igual, lo tomamos en cuenta.</div>`; return; }
    acBox.innerHTML = results.map((r,i)=>`<div class="ac-item" data-i="${i}">${highlight(r.nombre, term)}</div>`).join('');
    bindAcItems(results, false);
  }, 220);
});
inCarrera.addEventListener('keydown', (e)=>{
  const items = acBox.querySelectorAll('.ac-item');
  if(!items.length) return;
  if(e.key==='ArrowDown'){ e.preventDefault(); acIndex=Math.min(acIndex+1, items.length-1); updateAcHover(items); play('tap'); }
  if(e.key==='ArrowUp'){ e.preventDefault(); acIndex=Math.max(acIndex-1,0); updateAcHover(items); play('tap'); }
  if(e.key==='Enter' && acIndex>=0){ e.preventDefault(); items[acIndex].click(); }
  if(e.key==='Escape'){ acBox.classList.remove('show'); }
});
function updateAcHover(items){ items.forEach((it,i)=>it.classList.toggle('hover', i===acIndex)); items[acIndex]?.scrollIntoView({block:'nearest'}); }
document.addEventListener('click', (e)=>{ if(!acBox.contains(e.target) && e.target!==inCarrera){ acBox.classList.remove('show'); } });
inCarrera.addEventListener('blur', ()=>{ setTimeout(resolverCarreraEscritaAlSalir, 150); });

async function resolverCarreraEscritaAlSalir(){
  if(!state.carreraDeseada || state.carreraDeseadaFamiliaId) return;
  try{
    const safeTerm = escapeIlike(state.carreraDeseada);
    const { data, error } = await sb
      .from('carrera_nombres')
      .select('id, nombre, familia_id')
      .ilike('nombre', `%${safeTerm}%`)
      .limit(1);
    if(!error && data && data.length && data[0].familia_id){
      state.carreraDeseadaFamiliaId = data[0].familia_id;
      return;
    }
  }catch(e){ console.error('No se pudo resolver la carrera contra el catálogo:', e); }
  intentarResolverCarreraEscrita();
}

/* ===================== LÓGICA DE MATCH — Coseno de similitud sobre el vector RIASEC ===================== */
const NOMBRES_RASGOS = {
  riasec_realista:'Realista (manos a la obra)',
  riasec_investigador:'Investigador (análisis)',
  riasec_artistico:'Artístico (creatividad)',
  riasec_social:'Social (ayudar a otros)',
  riasec_emprendedor:'Emprendedor (liderazgo)',
  riasec_convencional:'Convencional (orden y estructura)',
};
const ORDEN_RASGOS = ['riasec_realista','riasec_investigador','riasec_artistico','riasec_social','riasec_emprendedor','riasec_convencional'];
const LETRA_RASGO = { riasec_realista:'R', riasec_investigador:'I', riasec_artistico:'A', riasec_social:'S', riasec_emprendedor:'E', riasec_convencional:'C' };

const PESO_MIN_VETO = 0.8;
const RESPUESTA_MAX_VETO = 0.3;
const PENALIZACION_VETO = 40;

function construirVectorRIASEC(hobbies){
  const grupos = {};
  Object.entries(hobbies).forEach(([clave, valorLikert])=>{
    const rasgo = clave.replace(/_\d+$/, '');
    if(!ORDEN_RASGOS.includes(rasgo)) return;
    if(!grupos[rasgo]) grupos[rasgo] = [];
    grupos[rasgo].push(valorLikert);
  });
  const vector = {};
  ORDEN_RASGOS.forEach(rasgo=>{
    const valores = grupos[rasgo];
    if(!valores || !valores.length){ vector[rasgo] = null; return; }
    const promedio = valores.reduce((a,b)=>a+b,0) / valores.length;
    vector[rasgo] = (promedio - 1) / 4;
  });
  return vector;
}

function normalizarNombre(str){
  return (str||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim();
}

const PESOS_RESPALDO = {
  'ingenieria de sistemas': { riasec_investigador:0.9, riasec_realista:0.4, riasec_convencional:0.6 },
  'ingenieria informatica': { riasec_investigador:0.9, riasec_realista:0.4, riasec_convencional:0.6 },
  'ingenieria de software': { riasec_investigador:0.85, riasec_convencional:0.5, riasec_realista:0.3 },
  'ingenieria civil': { riasec_realista:0.9, riasec_investigador:0.6, riasec_convencional:0.5 },
  'ingenieria industrial': { riasec_convencional:0.8, riasec_investigador:0.6, riasec_emprendedor:0.4 },
  'ingenieria electronica': { riasec_realista:0.85, riasec_investigador:0.75, riasec_convencional:0.3 },
  'ingenieria mecatronica': { riasec_realista:0.85, riasec_investigador:0.7, riasec_convencional:0.3 },
  'ingenieria mecanica': { riasec_realista:0.9, riasec_investigador:0.6, riasec_convencional:0.3 },
  'ingenieria ambiental': { riasec_realista:0.6, riasec_investigador:0.7, riasec_social:0.4 },
  'arquitectura': { riasec_artistico:0.8, riasec_realista:0.6, riasec_investigador:0.4 },
  'medicina humana': { riasec_social:0.85, riasec_investigador:0.7, riasec_realista:0.3 },
  'enfermeria': { riasec_social:0.95, riasec_realista:0.3 },
  'odontologia': { riasec_realista:0.6, riasec_social:0.6, riasec_investigador:0.5 },
  'obstetricia': { riasec_social:0.9, riasec_realista:0.4 },
  'nutricion': { riasec_social:0.7, riasec_investigador:0.5, riasec_convencional:0.3 },
  'psicologia': { riasec_social:0.9, riasec_investigador:0.5 },
  'educacion': { riasec_social:0.9, riasec_artistico:0.3, riasec_emprendedor:0.2 },
  'pedagogia': { riasec_social:0.9, riasec_artistico:0.3, riasec_emprendedor:0.2 },
  'trabajo social': { riasec_social:0.95, riasec_emprendedor:0.3 },
  'derecho': { riasec_emprendedor:0.6, riasec_convencional:0.6, riasec_social:0.4 },
  'ciencias politicas': { riasec_emprendedor:0.6, riasec_social:0.5, riasec_investigador:0.5 },
  'relaciones internacionales': { riasec_emprendedor:0.6, riasec_social:0.5, riasec_investigador:0.5 },
  'administracion de empresas': { riasec_emprendedor:0.85, riasec_convencional:0.5, riasec_social:0.3 },
  'administracion': { riasec_emprendedor:0.8, riasec_convencional:0.5, riasec_social:0.3 },
  'marketing': { riasec_emprendedor:0.8, riasec_artistico:0.5, riasec_social:0.3 },
  'negocios internacionales': { riasec_emprendedor:0.8, riasec_convencional:0.4, riasec_social:0.3 },
  'contabilidad': { riasec_convencional:0.9, riasec_investigador:0.4 },
  'economia': { riasec_investigador:0.7, riasec_convencional:0.6, riasec_emprendedor:0.3 },
  'finanzas': { riasec_convencional:0.7, riasec_investigador:0.5, riasec_emprendedor:0.4 },
  'diseno grafico': { riasec_artistico:0.95, riasec_realista:0.3 },
  'diseno de interiores': { riasec_artistico:0.9, riasec_realista:0.4 },
  'diseno de modas': { riasec_artistico:0.9, riasec_emprendedor:0.3 },
  'artes visuales': { riasec_artistico:0.95 },
  'musica': { riasec_artistico:0.95 },
  'comunicaciones': { riasec_artistico:0.6, riasec_social:0.5, riasec_emprendedor:0.4 },
  'ciencias de la comunicacion': { riasec_artistico:0.6, riasec_social:0.5, riasec_emprendedor:0.4 },
  'periodismo': { riasec_artistico:0.5, riasec_investigador:0.5, riasec_social:0.5 },
  'publicidad': { riasec_artistico:0.7, riasec_emprendedor:0.6 },
  'turismo y hoteleria': { riasec_social:0.6, riasec_emprendedor:0.5, riasec_convencional:0.3 },
  'gastronomia': { riasec_realista:0.6, riasec_artistico:0.6, riasec_social:0.3 },
  'agronomia': { riasec_realista:0.85, riasec_investigador:0.6 },
  'veterinaria': { riasec_realista:0.7, riasec_social:0.5, riasec_investigador:0.5 },
  'biologia': { riasec_investigador:0.9, riasec_realista:0.4 },
  'ciencias ambientales': { riasec_investigador:0.7, riasec_realista:0.6, riasec_social:0.3 },
};
function buscarPesosRespaldo(nombreFamilia){
  const norm = normalizarNombre(nombreFamilia);
  if(PESOS_RESPALDO[norm]) return PESOS_RESPALDO[norm];
  const claveParecida = Object.keys(PESOS_RESPALDO).find(k => norm.includes(k) || k.includes(norm));
  return claveParecida ? PESOS_RESPALDO[claveParecida] : null;
}

function filtrarPesosRIASEC(pesos){
  const limpio = {};
  ORDEN_RASGOS.forEach(r=>{ if(pesos && pesos[r]!==undefined) limpio[r] = pesos[r]; });
  return limpio;
}

function cosineScoreConConfianza(vectorAlumno, pesosCarrera){
  const keys = Object.keys(pesosCarrera||{});
  if(!keys.length) return null;
  let dot=0, magAlumno=0, magCarrera=0, sumDistancia=0, nConRespuesta=0;
  keys.forEach(key=>{
    const componente = vectorAlumno[key];
    const valor = componente===null || componente===undefined ? 0 : componente;
    const peso = pesosCarrera[key];
    dot += valor*peso;
    magAlumno += valor*valor;
    magCarrera += peso*peso;
    if(componente!==null && componente!==undefined){ sumDistancia += Math.abs(componente-0.5)*2; nConRespuesta++; }
  });
  const confianza = nConRespuesta ? Math.round((sumDistancia/nConRespuesta)*100) : 0;
  if(magAlumno===0 || magCarrera===0) return { pct:50, confianza };
  const cos = dot/(Math.sqrt(magAlumno)*Math.sqrt(magCarrera));
  return { pct: Math.round(cos*100), confianza };
}

function aplicarFiltroDeVeto(pctBase, vectorAlumno, pesosCarrera){
  let pct = pctBase;
  let vetoAplicado = false;
  Object.entries(pesosCarrera||{}).forEach(([key, peso])=>{
    const componente = vectorAlumno[key];
    if(peso > PESO_MIN_VETO && componente!==null && componente!==undefined && componente < RESPUESTA_MAX_VETO){
      pct = Math.max(0, pct - PENALIZACION_VETO);
      vetoAplicado = true;
    }
  });
  return { pct, vetoAplicado };
}

function computeMatches(){
  const vectorAlumno = construirVectorRIASEC(state.hobbies);
  return DB.familias.map(fam=>{
    const pesosPropios = filtrarPesosRIASEC(fam.pesos);
    const tienePesosPropios = Object.keys(pesosPropios).length>0;
    const pesos = tienePesosPropios ? pesosPropios : buscarPesosRespaldo(fam.nombre);
    if(!pesos){
      return { id:fam.id, nombre:fam.nombre, pct:50, confianza:0, sinDatos:true, vetoAplicado:false, rasgos:[] };
    }
    const resultado = cosineScoreConConfianza(vectorAlumno, pesos);
    const { pct, vetoAplicado } = aplicarFiltroDeVeto(resultado.pct, vectorAlumno, pesos);
    const rasgosOrdenados = Object.entries(pesos)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,2)
      .map(([clave])=>NOMBRES_RASGOS[clave] || clave);
    return { id:fam.id, nombre:fam.nombre, pct, confianza:resultado.confianza, sinDatos:false, vetoAplicado, rasgos:rasgosOrdenados };
  }).sort((a,b)=>b.pct-a.pct);
}

function buscarFamiliaAproximada(nombreCarrera){
  if(!nombreCarrera) return null;
  const norm = normalizarNombre(nombreCarrera);
  if(!norm) return null;
  let mejor = null;
  DB.familias.forEach(fam=>{
    if(mejor) return;
    const normFam = normalizarNombre(fam.nombre);
    if(normFam===norm || normFam.includes(norm) || norm.includes(normFam)){
      mejor = fam;
    }
  });
  return mejor;
}

function intentarResolverCarreraEscrita(){
  if(!state.carreraDeseada || state.carreraDeseadaFamiliaId) return;
  const fam = buscarFamiliaAproximada(state.carreraDeseada);
  if(fam){ state.carreraDeseadaFamiliaId = fam.id; }
}

function computeDefaultPrincipal(ranked){
  if(state.carreraDeseada && !state.carreraDeseadaFamiliaId){
    intentarResolverCarreraEscrita();
  }
  if(state.carreraDeseada && state.carreraDeseadaFamiliaId){
    return ranked.find(r=>r.id===state.carreraDeseadaFamiliaId) || {nombre:state.carreraDeseada, pct:null, id:'custom', rasgos:[], confianza:null};
  } else if(state.carreraDeseada){
    return {nombre:state.carreraDeseada, pct:null, id:'custom', rasgos:[], confianza:null};
  } else if(ranked.length){
    return ranked[0];
  }
  return {nombre:'Explora tus opciones', pct:null, id:null, rasgos:[], confianza:null};
}
function textoConfianza(confianza){
  if(confianza===null || confianza===undefined) return '';
  if(confianza>=60) return 'Confianza alta — tus respuestas fueron bastante definidas.';
  if(confianza>=30) return 'Confianza media — responde con más convicción para afinar tu match.';
  return 'Confianza baja — muchas de tus respuestas fueron "depende". Anímate a ser más definido en el test.';
}
function pintarRasgosYConfianza(item){
  const wrapRasgos = document.getElementById('matchRasgos');
  const wrapConfianza = document.getElementById('matchConfianza');
  if(item.rasgos && item.rasgos.length){
    wrapRasgos.innerHTML = item.rasgos.map(r=>`<span class="tag trait">Coincide en: ${escapeHtml(r)}</span>`).join('');
  } else {
    wrapRasgos.innerHTML='';
  }
  const notaVeto = item.vetoAplicado ? ' Penalizado: te falta el rasgo clave que exige esta carrera.' : '';
  wrapConfianza.textContent = textoConfianza(item.confianza) + notaVeto;
}
function pintarVectorRIASEC(){
  const vector = construirVectorRIASEC(state.hobbies);
  const wrap = document.getElementById('matchVector');
  wrap.innerHTML = ORDEN_RASGOS.map(r=>{
    const comp = vector[r];
    const pct = comp===null ? 0 : Math.round(comp*100);
    return `<div class="rv-row" title="${escapeHtml(NOMBRES_RASGOS[r])}">
      <span class="rv-key">${LETRA_RASGO[r]}</span>
      <div class="rv-bar"><div style="width:${pct}%;"></div></div>
      <span class="rv-val">${comp===null?'—':pct+'%'}</span>
    </div>`;
  }).join('');
}
function renderMatch(){
  const ranked = computeMatches();
  pintarVectorRIASEC();

  let principal;
  if(state.matchChosenId===null || state.matchChosenId===undefined){
    principal = computeDefaultPrincipal(ranked);
  } else if(state.matchChosenId==='custom'){
    principal = {nombre: state.carreraElegida || state.carreraDeseada, pct:null, id:'custom', rasgos:[], confianza:null};
  } else {
    principal = ranked.find(r=>r.id===state.matchChosenId) || computeDefaultPrincipal(ranked);
  }
  state.matchChosenId = principal.id;
  state.carreraElegida = principal.nombre;
  state.carreraElegidaFamiliaId = (principal.id==='custom' || principal.id===null) ? null : principal.id;

  document.getElementById('matchSub').textContent = state.carreraDeseada && principal.id==='custom'
    ? "La carrera que tenías en mente es una excelente opción para ti"
    : "Es la opción con mayor afinidad según tus respuestas";
  document.getElementById('matchCarrera').textContent = principal.nombre;
  document.getElementById('matchCode').textContent = principal.id && principal.id!=='custom' ? 'Match calculado con coseno de similitud (RIASEC)' : 'Personalizado';

  const barRow = document.getElementById('matchBarPrincipal').parentElement.parentElement;
  if(principal.pct===null || principal.pct===undefined){ barRow.style.display='none'; }
  else{
    barRow.style.display='flex';
    document.getElementById('matchBarPrincipal').style.width = principal.pct+'%';
    document.getElementById('matchPctPrincipal').textContent = principal.pct+'%';
  }
  pintarRasgosYConfianza(principal);

  const alternativas = ranked.filter(r=>r.id!==principal.id).slice(0,3);
  const wrap = document.getElementById('alternativas');
  wrap.innerHTML='';
  alternativas.forEach(alt=>{
    const card = document.createElement('div');
    card.className='cardbox';
    const rasgosTxt = alt.rasgos && alt.rasgos.length ? `Coincide en: ${alt.rasgos.join(', ')}` : 'Afinidad calculada con tus respuestas';
    card.innerHTML = `<h4>${escapeHtml(alt.nombre)}</h4><p>${escapeHtml(rasgosTxt)}</p>
      <div class="match-bar-row" style="margin-top:8px;"><span class="mono">${alt.pct}%</span><div class="match-bar"><div style="width:${alt.pct}%;"></div></div></div>`;
    card.onclick = ()=>{
      play('select');
      document.querySelectorAll('#alternativas .cardbox').forEach(c2=>c2.classList.remove('selected'));
      card.classList.add('selected');
      state.matchChosenId = alt.id;
      state.carreraElegida = alt.nombre; state.carreraElegidaFamiliaId = alt.id;
      state.carreraDeseada = '';
      document.getElementById('matchCarrera').textContent = alt.nombre;
      document.getElementById('matchCode').textContent = 'Match calculado con coseno de similitud (RIASEC)';
      document.getElementById('matchSub').textContent = "Es la opción con mayor afinidad según tus respuestas";
      const br = document.getElementById('matchBarPrincipal').parentElement.parentElement;
      br.style.display='flex';
      document.getElementById('matchBarPrincipal').style.width = alt.pct+'%';
      document.getElementById('matchPctPrincipal').textContent = alt.pct+'%';
      pintarRasgosYConfianza(alt);
      document.getElementById('btnP4').disabled=false;
    };
    wrap.appendChild(card);
  });
  document.getElementById('btnP4').disabled = !state.carreraElegida;
}

/* ===================== PANTALLA 5: REALIDAD (leída de carrera_detalle, actualizada por Gemini) ===================== */

// Cuando el usuario escribió su carrera a mano y no coincidió con ninguna
// "familia" existente (state.carreraElegidaFamiliaId queda null / 'custom'),
// no hay forma de generar/cachear su detalle con IA porque todo el
// pipeline (generarDetalleCarreraConIA -> función Edge -> carrera_detalle)
// está anclado a un carrera_familia_id real.
//
// Esta función crea esa familia sobre la marcha: inserta una fila nueva en
// carrera_familias con pesos RIASEC vacíos ({}) — el resto del código ya
// sabe manejar familias sin pesos propios (cae al filtro de respaldo en
// buscarPesosRespaldo/computeMatches) — y a partir de ahí la carrera se
// comporta como cualquier otra familia: puede generar y cachear su detalle.
async function resolverOCrearFamiliaParaCarreraCustom(){
  if(state.carreraElegidaFamiliaId || !state.carreraElegida) return;

  // Por si otra sesión ya la creó antes de que recargaras DB.familias, o
  // por si el match aproximado falló mientras esto quedaba pendiente.
  const existente = buscarFamiliaAproximada(state.carreraElegida);
  if(existente){
    state.carreraElegidaFamiliaId = existente.id;
    return;
  }

  try{
    const { data, error } = await sb
      .from('carrera_familias')
      .insert({ nombre: state.carreraElegida, pesos: {} })
      .select()
      .single();
    if(error){
      console.error('No se pudo crear la familia para la carrera escrita a mano:', error.code, error.message, error.details, error.hint);
      return;
    }
    DB.familias.push(data);
    state.carreraElegidaFamiliaId = data.id;
  }catch(e){
    console.error('Excepción creando familia custom:', e);
  }
}

async function renderRealidad(){
  document.getElementById('carreraNombre5').textContent = state.carreraElegida;

  if(!state.carreraElegidaFamiliaId && state.carreraElegida){
    await resolverOCrearFamiliaParaCarreraCustom();
  }

  let detalle = state.carreraElegidaFamiliaId ? DB.detallePorFamilia[state.carreraElegidaFamiliaId] : null;
  let esAproximado = false;
  if(!detalle){
    const aprox = buscarFamiliaAproximada(state.carreraElegida);
    if(aprox && DB.detallePorFamilia[aprox.id]){ detalle = DB.detallePorFamilia[aprox.id]; esAproximado = true; }
  }

  if(!detalle && state.carreraElegidaFamiliaId){
    pintarRealidadCargando();
    detalle = await generarDetalleCarreraConIA(state.carreraElegidaFamiliaId, state.carreraElegida);
    if(detalle){ DB.detallePorFamilia[state.carreraElegidaFamiliaId] = detalle; }
  }

  if(!detalle){
    const tieneFamilia = !!state.carreraElegidaFamiliaId;
    document.getElementById('carreraDesc5').textContent = tieneFamilia
      ? "No pudimos generar el detalle de esta carrera con IA en este momento (puede ser un problema temporal). Puedes intentarlo de nuevo, o seguir al siguiente paso."
      : "Aún no tenemos el detalle actualizado de esta carrera en la base de datos. Mientras tanto, revisa las instituciones disponibles en el siguiente paso.";
    document.getElementById('sueldoJunior').textContent = 'S/. —';
    document.getElementById('sueldoSenior').textContent = 'S/. —';
    document.getElementById('demandaBar').style.width='50%';
    document.getElementById('demandaTxt').textContent = 'Nivel: No disponible';
    document.getElementById('ambitos').innerHTML = tieneFamilia
      ? `<li><button class="btn-ghost" style="width:auto; padding:8px 14px;" onclick="reintentarRealidad();">🔄 Reintentar generar esta ficha</button></li>`
      : '<li>Te recomendamos investigar mallas curriculares específicas en las instituciones del siguiente paso.</li>';
    document.getElementById('cursosClave').innerHTML='';
    document.getElementById('modalidadTags').innerHTML='';
    document.getElementById('fuenteDatos5').textContent='';
    document.getElementById('btnP5').disabled=false;
    return;
  }
  document.getElementById('carreraDesc5').textContent = detalle.descripcion || '';
  document.getElementById('sueldoJunior').textContent = 'S/. '+Number(detalle.sueldo_junior||0).toLocaleString('es-PE');
  document.getElementById('sueldoSenior').textContent = 'S/. '+Number(detalle.sueldo_senior||0).toLocaleString('es-PE');
  const demandaNorm = (detalle.demanda||'').trim().toLowerCase();
  const pct = demandaNorm==='alto' ? 90 : demandaNorm==='medio' ? 55 : demandaNorm==='bajo' ? 25 : 50;
  document.getElementById('demandaBar').style.width = pct+'%';
  document.getElementById('demandaTxt').textContent = `Nivel: ${detalle.demanda||'No disponible'}`;
  document.getElementById('ambitos').innerHTML = (detalle.ambitos||[]).map(a=>`<li>${escapeHtml(a)}</li>`).join('');
  document.getElementById('cursosClave').innerHTML = (detalle.cursos||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('');
  document.getElementById('modalidadTags').innerHTML = (detalle.modalidad||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('');
  const fechaValida = detalle.actualizado_en && !isNaN(new Date(detalle.actualizado_en).getTime());
  document.getElementById('fuenteDatos5').textContent = esAproximado
    ? 'Datos aproximados de una carrera similar en nuestra base — se actualizarán con IA cuando tengamos el detalle exacto.'
    : (fechaValida
      ? `Datos actualizados con IA · ${new Date(detalle.actualizado_en).toLocaleDateString('es-PE')}`
      : 'Datos generados con IA');
  document.getElementById('btnP5').disabled=false;
}

function pintarRealidadCargando(){
  document.getElementById('carreraDesc5').textContent = 'Generando información actualizada con IA para esta carrera, un momento…';
  document.getElementById('sueldoJunior').textContent = 'S/. …';
  document.getElementById('sueldoSenior').textContent = 'S/. …';
  document.getElementById('demandaBar').style.width='0%';
  document.getElementById('demandaTxt').textContent = 'Calculando…';
  document.getElementById('ambitos').innerHTML = '<li>Generando…</li>';
  document.getElementById('cursosClave').innerHTML='';
  document.getElementById('modalidadTags').innerHTML='';
  document.getElementById('fuenteDatos5').textContent='';
  document.getElementById('btnP5').disabled=true;
}

async function reintentarRealidad(){
  play('tap');
  await renderRealidad();
}

async function generarDetalleCarreraConIA(carreraFamiliaId, nombreCarrera, intentos = 2){
  for(let intento = 1; intento <= intentos; intento++){
    try{
      const res = await fetch(EDGE_FN_GENERAR_DETALLE, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ carrera_familia_id: carreraFamiliaId, nombre: nombreCarrera })
      });
      const bodyTxt = await res.text().catch(()=> '');

      if(!res.ok){
        console.error(`[Realidad] "${nombreCarrera}" — intento ${intento}/${intentos} falló con HTTP ${res.status}:`, bodyTxt);
        if(intento < intentos){ await new Promise(r=>setTimeout(r, 900*intento)); continue; }
        return null;
      }

      const { data, error } = await sb.from('carrera_detalle').select('*').eq('carrera_familia_id', carreraFamiliaId).maybeSingle();
      if(error){ console.error(`[Realidad] Error leyendo carrera_detalle para "${nombreCarrera}":`, error); throw error; }

      if(!data){
        console.warn(`[Realidad] "${nombreCarrera}" — la función respondió OK (intento ${intento}/${intentos}) pero no hay fila en carrera_detalle. Respuesta: ${bodyTxt}`);
        if(intento < intentos){ await new Promise(r=>setTimeout(r, 900*intento)); continue; }
        return null;
      }
      return data;
    }catch(e){
      console.error(`[Realidad] Excepción generando "${nombreCarrera}" (intento ${intento}/${intentos}):`, e);
      if(intento >= intentos) return null;
      await new Promise(r=>setTimeout(r, 900*intento));
    }
  }
  return null;
}

/* ===================== PANTALLA 6: INSTITUCIONES ===================== */
async function renderInstituciones(){
  const carrera = state.carreraElegida;
  document.getElementById('carreraNombre6').textContent = carrera;
  document.getElementById('destinoNombre6').textContent = state.destinoProv ? `${state.destinoProv}, ${state.destino}` : state.destino;

  let montoMax = 99999;
  if(state.presupuestoCat==='0') montoMax=0;
  else if(state.presupuestoCat==='300-800') montoMax=800;
  else if(state.presupuestoCat==='800-1500') montoMax=1500;
  else if(state.presupuestoCat==='1500+') montoMax=99999;
  else if(state.presupuestoCat==='otro') montoMax = state.presupuestoMonto||0;

  const wrap = document.getElementById('instituciones');
  wrap.innerHTML = '<div class="loading-row"><span class="spinner-mini"></span>Buscando instituciones reales en tu zona…</div>';
  const institucionPrevia = state.institucionElegida;
  document.getElementById('btnP6').disabled=true;

  let resultado = { institutos:[], universidades:[], alternativas:null };
  try{
    const res = await fetch(EDGE_FN_BUSCAR_INSTITUCIONES, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ carrera, departamento: state.destino, provincia: state.destinoProv, presupuestoMax: montoMax })
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    resultado = await res.json();
  } catch(e){
    console.error(e);
    toast('No se pudo consultar instituciones en este momento.', true);
  }

  const institutos = (resultado.institutos||[]).filter(i => (i.costo_min ?? 0) <= montoMax);
  const universidades = (resultado.universidades||[]).filter(u => (u.costo_min ?? 0) <= montoMax);

  const crearCard = (nombre, provincia, tipo, gestion, costoMin, costoMax, fuente, ubicacionTxt, esOtroDepartamento)=>{
    const card = document.createElement('div');
    const estaSeleccionada = nombre===institucionPrevia;
    card.className='cardbox'+(estaSeleccionada?' selected':'');
    const costoTxt = (costoMin===0 && costoMax===0) ? 'Gratuita (pública)' : `S/. ${costoMin} – S/. ${costoMax>=99999?'1500+':costoMax}`;
    card.innerHTML = `<h4>${escapeHtml(nombre)}</h4><p>${escapeHtml(provincia||'')}${provincia?', ':''}${escapeHtml(ubicacionTxt||'')} · ${costoTxt}</p>
      <div class="inst-meta">
        <span class="badge ${gestion==='Publico'?'pub':'priv'}">${escapeHtml(tipo)}</span>
        ${(!esOtroDepartamento && provincia===state.destinoProv) ? '<span class="badge pub">En tu provincia</span>' : ''}
        ${esOtroDepartamento ? '<span class="badge ia">Otro departamento</span>' : ''}
        ${fuente==='ia' ? '<span class="badge ia">Verificado por IA</span>' : ''}
      </div>`;
    card.onclick = ()=>{
      play('select');
      document.querySelectorAll('#instituciones .cardbox').forEach(c2=>c2.classList.remove('selected'));
      card.classList.add('selected');
      state.institucionElegida = nombre;
      document.getElementById('btnP6').disabled=false;
    };
    return card;
  };

  wrap.innerHTML='';

  if(institutos.length>0 || universidades.length>0){
    document.getElementById('instFiltroNota').textContent =
      `${institutos.length} instituto(s) verificados en nuestra base + ${universidades.length} universidad(es) sugeridas por IA para esta búsqueda.`;

    institutos.forEach(i=>{
      wrap.appendChild(crearCard(i.nombre, i.ubigeo_provincias?.nombre, 'Instituto', i.gestion, i.costo_min, i.costo_max, 'db', state.destino, false));
    });
    universidades.forEach(u=>{
      wrap.appendChild(crearCard(u.nombre, u.provincia, 'Universidad', u.gestion, u.costo_min, u.costo_max, 'ia', state.destino, false));
    });

    const nombresDisponibles = [...institutos.map(i=>i.nombre), ...universidades.map(u=>u.nombre)];
    if(institucionPrevia && nombresDisponibles.includes(institucionPrevia)){
      state.institucionElegida = institucionPrevia;
      document.getElementById('btnP6').disabled=false;
    } else {
      state.institucionElegida = null;
      document.getElementById('btnP6').disabled=true;
    }
    return;
  }

  document.getElementById('instFiltroNota').textContent =
    `No encontramos ${escapeHtml(carrera)} en ${escapeHtml(state.destino)} dentro de tu presupuesto.`;

  const alt = resultado.alternativas;
  const altInstitutos = (alt?.institutos||[]).filter(i => (i.costo_min ?? 0) <= montoMax);
  const altUniversidades = (alt?.universidades||[]).filter(u => (u.costo_min ?? 0) <= montoMax);

  if(altInstitutos.length===0 && altUniversidades.length===0){
    wrap.innerHTML = `<p class="sub">No encontramos instituciones que ofrezcan ${escapeHtml(carrera)} en ${escapeHtml(state.destino)} ni en otros departamentos dentro de tu presupuesto. Prueba ampliando tu rango en el paso anterior.</p>`;
    state.institucionElegida = null;
    document.getElementById('btnP6').disabled=true;
    return;
  }

  const aviso = document.createElement('p');
  aviso.className='sub';
  aviso.textContent = alt?.mensaje || `No encontramos "${carrera}" en ${state.destino}, pero sí en otros departamentos:`;
  wrap.appendChild(aviso);

  altInstitutos.forEach(i=>{
    wrap.appendChild(crearCard(
      i.nombre,
      i.ubigeo_provincias?.nombre,
      'Instituto',
      i.gestion,
      i.costo_min,
      i.costo_max,
      'db',
      i.ubigeo_provincias?.ubigeo_departamentos?.nombre || '',
      true
    ));
  });
  altUniversidades.forEach(u=>{
    wrap.appendChild(crearCard(
      u.nombre,
      u.provincia,
      'Universidad',
      u.gestion,
      u.costo_min,
      u.costo_max,
      'ia',
      u.departamento || '',
      true
    ));
  });

  const nombresDisponiblesAlt = [...altInstitutos.map(i=>i.nombre), ...altUniversidades.map(u=>u.nombre)];
  if(institucionPrevia && nombresDisponiblesAlt.includes(institucionPrevia)){
    state.institucionElegida = institucionPrevia;
    document.getElementById('btnP6').disabled=false;
  } else {
    state.institucionElegida = null;
    document.getElementById('btnP6').disabled=true;
  }
}

/* ===================== SUB-PASO 8a: PREPLAN (contexto extra para la IA) =====================
   Las preguntas ya NO son fijas: se le piden a Gemini (gemini-preplan-preguntas)
   pasándole el contexto del estudiante, para que sean relevantes a SU carrera,
   institución y situación. PREGUNTAS_PREPLAN_RESPALDO solo se usa si esa
   llamada falla por completo (ej. sin conexión). */
const PREGUNTAS_PREPLAN_RESPALDO = [
  {
    clave:'familia',
    pregunta: ()=> `¿Tienes algún familiar, amigo cercano o conocido en ${state.destinoProv||state.destino||'la zona donde estudiarás'}?`,
    tipo:'chips',
    opciones:[
      {label:'Sí, viven cerca de la institución', val:'cerca'},
      {label:'Sí, pero viven lejos de ahí', val:'lejos'},
      {label:'No, sería la primera vez que voy solo/a', val:'ninguno'},
    ]
  },
  {
    clave:'dondeTrabajar',
    pregunta: ()=> `Cuando termines de estudiar, ¿dónde te imaginas trabajando?`,
    tipo:'chips',
    opciones:[
      {label:'En una empresa privada', val:'empresa_privada'},
      {label:'En el Estado / sector público', val:'sector_publico'},
      {label:'En mi propio negocio', val:'negocio_propio'},
      {label:'Fuera del Perú', val:'extranjero'},
      {label:'Todavía no lo sé', val:'no_sabe'},
    ]
  },
  {
    clave:'necesitaTrabajar',
    pregunta: ()=> `¿Necesitarías trabajar mientras estudias para cubrir gastos?`,
    tipo:'chips',
    opciones:[
      {label:'Sí, necesito trabajar sí o sí', val:'si'},
      {label:'Tal vez, según el semestre', val:'tal_vez'},
      {label:'No, mi familia cubre todo', val:'no'},
    ]
  },
  {
    clave:'notas',
    pregunta: ()=> `¿Hay algo más que debamos saber para armar tu plan? (opcional)`,
    tipo:'texto',
  },
];

// Pide a Gemini las preguntas de seguimiento personalizadas para ESTE
// estudiante (su carrera, institución, presupuesto, situación). Devuelve
// siempre un arreglo con {clave, pregunta, tipo, opciones} — "pregunta" ya
// es un string plano (no una función), a diferencia del respaldo estático.
async function generarPreguntasPreplanConIA(){
  const detalle = state.carreraElegidaFamiliaId ? DB.detallePorFamilia[state.carreraElegidaFamiliaId] : null;
  try{
    const res = await fetch(EDGE_FN_PREPLAN_PREGUNTAS, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        nombre: state.nombre, edad: state.edad, sexo: state.sexo,
        situacion: state.situacion, colegio: state.colegio,
        depto_residencia: state.depto, prov_residencia: state.prov,
        carrera_elegida: state.carreraElegida, institucion_elegida: state.institucionElegida,
        destino_depto: state.destino, destino_prov: state.destinoProv,
        presupuesto_cat: state.presupuestoCat, presupuesto_monto: state.presupuestoMonto,
        detalle_carrera: detalle ? {
          ambitos: detalle.ambitos, cursos: detalle.cursos
        } : null
      })
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    if(!data.preguntas?.length) throw new Error('Sin preguntas');
    return data.preguntas;
  }catch(e){
    console.error('No se pudieron generar las preguntas del preplan con IA, se usa el respaldo fijo:', e);
    return PREGUNTAS_PREPLAN_RESPALDO.map(p => ({
      clave: p.clave, pregunta: p.pregunta(), tipo: p.tipo, opciones: p.opciones || []
    }));
  }
}

async function iniciarPreplanChat(){
  document.getElementById('preplanWrap').style.display='flex';
  document.getElementById('preplanWrap').style.flexDirection='column';
  document.getElementById('preplanWrap').style.gap='16px';
  document.getElementById('planContentWrap').style.display='none';
  state.preplanIndex = 0;
  document.getElementById('preplanMensajes').innerHTML='';
  document.getElementById('preplanOpciones').innerHTML = `<div class="loading-row"><span class="spinner-mini"></span>Preparando preguntas para tu caso…</div>`;
  state.preplanPreguntas = await generarPreguntasPreplanConIA();
  document.getElementById('preplanOpciones').innerHTML='';
  pintarPreguntaPreplan();
}

function pintarProgresoPreplan(){
  const wrap = document.getElementById('preplanProgress');
  wrap.innerHTML = (state.preplanPreguntas||[]).map((_,i)=>`<span class="${i<state.preplanIndex?'done':''}"></span>`).join('');
}

function pintarPreguntaPreplan(){
  pintarProgresoPreplan();
  const preguntas = state.preplanPreguntas||[];
  const total = preguntas.length;
  const opcionesWrap = document.getElementById('preplanOpciones');
  opcionesWrap.innerHTML='';

  if(!total || state.preplanIndex >= total){
    terminarPreplan();
    return;
  }

  const p = preguntas[state.preplanIndex];
  agregarBurbujaPreplan(typeof p.pregunta === 'function' ? p.pregunta() : p.pregunta, 'model');

  if(p.tipo==='chips'){
    (p.opciones||[]).forEach(op=>{
      const div = document.createElement('div');
      div.className='q-opt';
      div.innerHTML = `<span>${escapeHtml(op.label)}</span>`;
      div.onclick = ()=>{ play('select'); responderPreplan(p.clave, op.val, op.label); };
      opcionesWrap.appendChild(div);
    });
  } else if(p.tipo==='texto'){
    const row = document.createElement('div');
    row.className='chat-input-row';
    row.innerHTML = `<input type="text" id="preplanInputTexto" placeholder="Escribe aquí o deja vacío y continúa"><button class="btn-primary">Continuar</button>`;
    const input = row.querySelector('input');
    const btn = row.querySelector('button');
    const enviar = ()=>{ play('select'); responderPreplan(p.clave, input.value.trim(), input.value.trim()||'(sin comentarios)'); };
    btn.onclick = enviar;
    input.onkeydown = (e)=>{ if(e.key==='Enter'){ e.preventDefault(); enviar(); } };
    opcionesWrap.appendChild(row);
  }
}

function agregarBurbujaPreplan(texto, rol){
  const cont = document.getElementById('preplanMensajes');
  const div = document.createElement('div');
  div.className = `chat-bubble ${rol}`;
  div.textContent = texto;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
}

function responderPreplan(clave, valor, labelVisible){
  state.contextoAdicional[clave] = valor;
  agregarBurbujaPreplan(labelVisible, 'user');
  state.preplanIndex++;
  setTimeout(pintarPreguntaPreplan, 260);
}

function saltarPreplan(){
  play('back');
  terminarPreplan();
}

function terminarPreplan(){
  document.getElementById('preplanWrap').style.display='none';
  document.getElementById('planContentWrap').style.display='flex';
  document.getElementById('planContentWrap').style.flexDirection='column';
  document.getElementById('planContentWrap').style.gap='22px';
  renderPlanFinal();
}

/* ===================== PANTALLA 8: PLAN FINAL ===================== */
async function renderPlanFinal(){
  document.getElementById('planTitulo').textContent =
    `¡Felicidades, ${state.nombre||'amig@'}! Aquí tienes tu hoja de ruta para estudiar ${state.carreraElegida||'tu carrera elegida'} en ${state.institucionElegida||'tu institución elegida'}.`;

  const wrap = document.getElementById('planFasesWrap');
  const btnDescargar = document.getElementById('btnDescargarPlan');
  wrap.innerHTML = `<div class="loading-row"><span class="spinner-mini"></span>Generando tu plan personalizado con IA…</div>`;
  btnDescargar.disabled = true;

  const detalle = state.carreraElegidaFamiliaId ? DB.detallePorFamilia[state.carreraElegidaFamiliaId] : null;

  try{
    const res = await fetch(EDGE_FN_PLAN_VIDA, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        nombre: state.nombre, edad: state.edad, sexo: state.sexo,
        situacion: state.situacion, colegio: state.colegio,
        depto_residencia: state.depto, prov_residencia: state.prov,
        carrera_elegida: state.carreraElegida, institucion_elegida: state.institucionElegida,
        destino_depto: state.destino, destino_prov: state.destinoProv,
        presupuesto_cat: state.presupuestoCat, presupuesto_monto: state.presupuestoMonto,
        contexto_adicional: state.contextoAdicional,
        detalle_carrera: detalle ? {
          descripcion: detalle.descripcion, sueldo_junior: detalle.sueldo_junior,
          sueldo_senior: detalle.sueldo_senior, demanda: detalle.demanda,
          ambitos: detalle.ambitos, cursos: detalle.cursos
        } : null
      })
    });
    const bodyTxt = await res.text();
    if(!res.ok){
      console.error(`[PlanVida] HTTP ${res.status} llamando a gemini-plan-vida:`, bodyTxt);
      throw new Error('HTTP '+res.status);
    }
    let data;
    try{ data = JSON.parse(bodyTxt); }
    catch(e){ console.error('[PlanVida] La función respondió OK pero el body no es JSON válido:', bodyTxt); throw e; }
    if(!data.fases?.length){
      console.error('[PlanVida] La función respondió OK pero sin "fases". Body completo:', data);
      throw new Error('Sin fases');
    }
    state.planFases = data.fases;
    renderFasesPlan(state.planFases);
    btnDescargar.disabled = false;
  }catch(e){
    console.error('No se pudo generar el plan con IA:', e);
    state.planFases = [
      { plazo:'Próximos 30 días', titulo:'Prepárate para el examen', acciones:[
        `Repasa el temario de admisión de ${state.institucionElegida||'la institución elegida'}.`,
        `Dedica al menos 45 minutos diarios este mes a razonamiento matemático y comprensión lectora.`
      ]},
      { plazo:'En 6 meses', titulo:'Transición', acciones:[
        state.destino===state.depto
          ? `Aprovecha tu red local en ${state.depto}: visita la institución y habla con estudiantes actuales.`
          : `Organiza alojamiento y presupuesto en ${state.destino||'tu ciudad de destino'} con al menos 2 meses de anticipación.`
      ]},
    ];
    renderFasesPlan(state.planFases, true);
    btnDescargar.disabled = false;
  }

  state.chatHistorial = [];
  document.getElementById('chatMensajes').innerHTML = '';
}

function renderFasesPlan(fases, esRespaldo){
  const wrap = document.getElementById('planFasesWrap');
  wrap.innerHTML = (esRespaldo ? `<div class="plan-error">No se pudo generar tu plan completo con IA en este momento — te dejamos una versión básica. Puedes usar el chat de abajo para completar los detalles.</div>` : '')
    + fases.map(f => `
      <div class="plan-fase">
        <span class="plazo">${escapeHtml(f.plazo||'')}</span>
        <h4>${escapeHtml(f.titulo||'')}</h4>
        <ul>${(f.acciones||[]).map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul>
      </div>
    `).join('');
}

/* ===================== CHAT DE DUDAS SOBRE CARRERA / PLAN ===================== */
function agregarBurbujaChat(texto, rol){
  const cont = document.getElementById('chatMensajes');
  const div = document.createElement('div');
  div.className = `chat-bubble ${rol}`;
  div.textContent = texto;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  return div;
}

async function enviarPreguntaChat(){
  const input = document.getElementById('chatInput');
  const pregunta = input.value.trim();
  if(!pregunta) return;
  const btn = document.getElementById('btnChatEnviar');

  agregarBurbujaChat(pregunta, 'user');
  state.chatHistorial.push({ rol:'user', texto:pregunta });
  input.value = '';
  input.disabled = true;
  btn.disabled = true;
  const burbujaCargando = agregarBurbujaChat('Escribiendo…', 'loading');

  try{
    const res = await fetch(EDGE_FN_CHAT_PLAN, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        contexto: {
          nombre: state.nombre,
          carrera_elegida: state.carreraElegida,
          institucion_elegida: state.institucionElegida,
          destino_depto: state.destino,
          plan_fases: state.planFases
        },
        historial: state.chatHistorial.slice(0, -1),
        pregunta
      })
    });
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data = await res.json();
    burbujaCargando.remove();
    if(!data.respuesta) throw new Error('Sin respuesta');
    agregarBurbujaChat(data.respuesta, 'model');
    state.chatHistorial.push({ rol:'model', texto:data.respuesta });

    // Si el modelo detectó una corrección y nos devolvió el plan
    // actualizado, lo aplicamos y volvemos a pintar la hoja de ruta.
    if(Array.isArray(data.plan_fases) && data.plan_fases.length){
      state.planFases = data.plan_fases;
      renderFasesPlan(state.planFases);
      const wrap = document.getElementById('planFasesWrap');
      if(wrap){
        wrap.classList.add('plan-actualizado');
        setTimeout(()=>wrap.classList.remove('plan-actualizado'), 1200);
      }
    }
  }catch(e){
    console.error('Error en el chat:', e);
    burbujaCargando.remove();
    agregarBurbujaChat('No pude responder en este momento, intenta de nuevo en unos segundos.', 'model');
  }finally{
    input.disabled = false;
    btn.disabled = false;
    input.focus();
  }
}

// Carga logo.png como data URL una sola vez (se reutiliza en cada página del PDF).
async function obtenerLogoDataURL(){
  if(window._logoDataUrl !== undefined) return window._logoDataUrl;
  try{
    const res = await fetch('logo.png');
    if(!res.ok) throw new Error('logo.png no encontrado (HTTP '+res.status+')');
    const blob = await res.blob();
    window._logoDataUrl = await new Promise((resolve, reject)=>{
      const reader = new FileReader();
      reader.onload = ()=>resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }catch(e){
    console.warn('No se pudo cargar logo.png para el PDF, se usará un logo vectorial de respaldo:', e);
    window._logoDataUrl = null;
  }
  return window._logoDataUrl;
}

async function descargarPlanPDF(){
  if(!window.jspdf || !window.jspdf.jsPDF){
    toast('No se pudo cargar el generador de PDF. Revisa tu conexión e intenta de nuevo.', true);
    return;
  }
  if(!state.planFases?.length){
    toast('Tu plan todavía se está generando, espera un momento.', true);
    return;
  }
  try{
    const logoUrl = await obtenerLogoDataURL().catch(()=>null);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const marginX = 20;
    let y = 22;

    const dibujarEncabezadoPagina = (esPrimeraPagina)=>{
      doc.setFillColor(255,122,48);
      doc.rect(0, 0, 210, 12, 'F');
      // El logo (imagen o "D" de respaldo) solo se dibuja en la primera página.
      if(!esPrimeraPagina) return;
      if(logoUrl){
        try{ doc.addImage(logoUrl, 'PNG', 178, 18, 14, 14); return; }
        catch(e){ console.error('No se pudo insertar logo.png en el PDF, se usa el respaldo vectorial:', e); }
      }
      doc.setFillColor(255,122,48);
      doc.circle(185, 25, 7, 'F');
      doc.setFontSize(11);
      doc.setTextColor(255,255,255);
      doc.setFont(undefined, 'bold');
      doc.text('D', 185, 27.5, { align:'center' });
      doc.setFont(undefined, 'normal');
    };
    const nuevaPagina = ()=>{
      doc.addPage();
      dibujarEncabezadoPagina(false);
      y = 22;
    };

    dibujarEncabezadoPagina(true);

    doc.setFontSize(20);
    doc.setTextColor(20,20,20);
    doc.text('Diodo — Tu Plan de Vida', marginX, y);
    y += 10;

    doc.setFontSize(11);
    doc.setTextColor(90,90,90);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-PE')}`, marginX, y);
    y += 12;

    doc.setFontSize(13);
    doc.setTextColor(20,20,20);
    doc.text(`${state.nombre||''} ${state.apellido||''}`.trim() || 'Estudiante', marginX, y);
    y += 7;
    doc.setFontSize(11);
    doc.setTextColor(90,90,90);
    doc.text(`Carrera elegida: ${state.carreraElegida||'—'}`, marginX, y); y += 6;
    doc.text(`Institución: ${state.institucionElegida||'—'}`, marginX, y); y += 6;
    doc.text(`Destino: ${state.destinoProv?state.destinoProv+', ':''}${state.destino||'—'}`, marginX, y); y += 10;

    doc.setDrawColor(220,220,220);
    doc.line(marginX, y, 190, y);
    y += 10;

    state.planFases.forEach(fase=>{
      if(y > 250){ nuevaPagina(); }
      doc.setFontSize(10);
      doc.setTextColor(255,122,48);
      doc.text((fase.plazo||'').toUpperCase(), marginX, y);
      y += 6;
      doc.setFontSize(13);
      doc.setTextColor(20,20,20);
      const tituloLineas = doc.splitTextToSize(fase.titulo||'', 170);
      doc.text(tituloLineas, marginX, y);
      y += tituloLineas.length * 6 + 3;

      (fase.acciones||[]).forEach(accion=>{
        if(y > 265){ nuevaPagina(); }
        doc.setFontSize(11);
        doc.setTextColor(50,50,50);
        const anchoTexto = 163;
        // La viñeta va aparte para no romper la justificación del párrafo.
        doc.text('•', marginX+2, y);
        const lineas = doc.splitTextToSize(accion, anchoTexto);
        doc.text(lineas, marginX+7, y, { align:'justify', maxWidth: anchoTexto });
        y += lineas.length * 5.5 + 3;
      });
      y += 8;
    });

    doc.setFontSize(9);
    doc.setTextColor(150,150,150);
    doc.text('Generado con Diodo — diodo-five.vercel.app', marginX, 287);

    const nombreArchivo = `Plan-Diodo-${(state.nombre||'estudiante').replace(/\s+/g,'-')}.pdf`;
    doc.save(nombreArchivo);
    toast('PDF descargado.');
  }catch(e){
    console.error('Error generando PDF:', e);
    toast('No se pudo generar el PDF.', true);
  }
}

/* ===================== INIT ===================== */
(async function init(){
  await Promise.all([initUbigeoPerfil(), cargarPreguntas(), cargarFamiliasYDetalle()]);

  try{
    const { data: { session } } = await sb.auth.getSession();
    if(session && session.user){
      state.userId = session.user.id;
      state.userEmail = session.user.email;

      const savedState = sessionStorage.getItem('diodo_state');
      const savedNextStep = sessionStorage.getItem('diodo_next_step');
      const savedQIndex = sessionStorage.getItem('diodo_qIndex');

      if(savedState){
        // Venimos de un redirect de login a mitad del test: restauramos lo
        // que había en memoria justo antes de ir a Google.
        try{
          const parsed = JSON.parse(savedState);
          Object.assign(state, parsed);
        }catch(e){ console.error('No se pudo restaurar el estado guardado:', e); }
        if(savedQIndex) qIndex = Number(savedQIndex) || 0;
        sessionStorage.removeItem('diodo_state');
        sessionStorage.removeItem('diodo_next_step');
        sessionStorage.removeItem('diodo_qIndex');

        state.guest = false;
        state.userId = session.user.id;
        state.userEmail = session.user.email;
        state.nombre = state.nombre || session.user.user_metadata?.given_name || session.user.user_metadata?.full_name || '';
        renderAccountBadge(session.user);
        goTo(savedNextStep ? Number(savedNextStep) : 1);
        return;
      }

      // No hay nada en sessionStorage: puede ser un usuario que vuelve otro
      // día con la sesión aún activa. Buscamos si dejó un test a medias
      // guardado en Supabase (progreso_state) para retomarlo.
      state.guest = false;
      state.nombre = state.nombre || session.user.user_metadata?.given_name || session.user.user_metadata?.full_name || '';
      renderAccountBadge(session.user);

      try{
        const { data: prog, error: progError } = await sb
          .from('respuestas_usuarios')
          .select('progreso_state, progreso_paso, completado')
          .eq('user_id', session.user.id)
          .eq('completado', false)
          .not('progreso_state', 'is', null)
          .order('updated_at', { ascending:false })
          .limit(1)
          .maybeSingle();

        if(progError){ console.error('No se pudo consultar progreso guardado:', progError); }
        else if(prog && prog.progreso_state && prog.progreso_paso>0){
          Object.assign(state, prog.progreso_state);
          qIndex = prog.progreso_state.qIndex || 0;
          state.guest = false;
          state.userId = session.user.id;
          state.userEmail = session.user.email;
          toast(`¡Hola de nuevo, ${state.nombre||''}! Retomamos donde lo dejaste.`);
          goTo(prog.progreso_paso);
          return;
        }
      }catch(e){ console.error('Error restaurando progreso desde Supabase:', e); }

      goTo(1);
      return;
    } else {
      renderAccountBadge(null);
    }
  }catch(e){ console.error(e); }

  goTo(0);
})();