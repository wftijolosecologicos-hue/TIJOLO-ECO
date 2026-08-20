const CFG=window.TERRALOTE_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
if(!window.supabase) throw new Error('Biblioteca Supabase não carregada.');
const sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
const CACHE_KEY='terralote_v8_cache';
const QUEUE_KEY='terralote_v8_queue';
const APP={profile:null,lots:[],tasks:[],soils:[],plans:[],recipes:[],collaborators:[],attendance:[],functions:[],assignments:[],weeklyCommission:[],dailyProduction:[],taskFilter:'pending'};

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function num(v){return Number(v||0)}
function money(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v))}
function qty(v){return new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(num(v))}
function dateBR(v,withTime=false){if(!v)return '—';const d=new Date(v);return new Intl.DateTimeFormat('pt-BR',withTime?{dateStyle:'short',timeStyle:'short'}:{dateStyle:'short'}).format(d)}
function toast(msg,error=false){const t=$('#toast');t.textContent=msg;t.className='toast show'+(error?' error':'');setTimeout(()=>t.className='toast',3200)}
function loading(show,text='Atualizando dados'){const el=$('#loading');$('#loadingText').textContent=text;el.classList.toggle('hidden',!show)}
function isAdmin(){return APP.profile?.role==='ADMIN'}
function saveCache(){localStorage.setItem(CACHE_KEY,JSON.stringify({at:new Date().toISOString(),lots:APP.lots,tasks:APP.tasks,soils:APP.soils,plans:APP.plans,recipes:APP.recipes,collaborators:APP.collaborators,attendance:APP.attendance,functions:APP.functions,assignments:APP.assignments,weeklyCommission:APP.weeklyCommission,dailyProduction:APP.dailyProduction}))}
function loadCache(){try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!c)return false;Object.assign(APP,c);return true}catch{return false}}
function weekStartSunday(d=new Date()){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x}
function lotProgress(l){const start=new Date(l.manufactured_at).getTime(),end=new Date(l.cure_due_at).getTime();if(!start||!end||end<=start)return 0;return Math.max(0,Math.min(100,Math.round((Date.now()-start)/(end-start)*100)))}
function operationalStatus(l){if(l.operational_status)return l.operational_status;if(l.status==='COMPLETED')return 'COMPLETED';const overdue=APP.tasks.some(t=>t.lot_id===l.id&&t.status==='PENDING'&&new Date(t.scheduled_at)<new Date());return overdue?'OVERDUE':'CURING'}
function statusLabel(s){return ({COMPLETED:'Concluído',OVERDUE:'Com pendência',CURING:'Em cura',DELETED:'Excluído'})[s]||s}
function shiftLabel(s){return s==='MANHA'?'Manhã':'Tarde'}

async function getProfile(){const {data:{user}}=await sb.auth.getUser();if(!user)return null;const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();if(error)throw error;if(data.status!=='ACTIVE'){await sb.auth.signOut();throw new Error('Seu acesso está suspenso. Fale com o administrador.')}APP.profile=data;return data}
async function login(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget),login=String(f.get('login')).trim(),password=String(f.get('password'));
  $('#loginMessage').textContent='';loading(true,'Validando seu acesso');
  try{
    const {data:email,error}=await sb.rpc('resolve_login_email',{p_login:login});
    if(error)throw error;if(!email)throw new Error('Usuário não encontrado ou suspenso.');
    const {error:authError}=await sb.auth.signInWithPassword({email,password});
    if(authError)throw new Error('Usuário ou senha incorretos.');
    await getProfile();showApp();await bootstrap()
  }catch(err){$('#loginMessage').textContent=err.message;await sb.auth.signOut()}
  finally{loading(false)}
}
async function logout(){await sb.auth.signOut();APP.profile=null;$('#appShell').classList.add('hidden');$('#loginScreen').classList.remove('hidden');$('#loginForm').reset();toast('Você saiu do sistema.')}
function showApp(){$('#loginScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');$('#userName').textContent=APP.profile.full_name;$('#userRole').textContent=APP.profile.role;$('#userInitial').textContent=APP.profile.full_name.charAt(0).toUpperCase();$$('.admin-only').forEach(x=>x.classList.toggle('hidden',!isAdmin()));$('#lotResponsible').textContent=APP.profile.full_name}

async function bootstrap(){if(loadCache())renderAll();loading(true,'Sincronizando dados com o Supabase');try{const [lots,tasks,soils,plans,recipes,collabs,attendance,funcs,assignments,comm,daily]=await Promise.all([
 sb.from('v_lot_operational').select('*').is('deleted_at',null).order('manufactured_at',{ascending:false}),
 sb.from('watering_tasks').select('*,lots!inner(lot_code,responsible_snapshot)').order('scheduled_at'),
 sb.from('soils').select('*').eq('active',true).order('code'),
 sb.from('watering_plans').select('*').eq('active',true).order('system_plan',{ascending:false}),
 sb.from('mix_recipes').select('*').eq('active',true).order('is_default',{ascending:false}),
 sb.from('collaborators').select('*').order('full_name'),
 sb.from('attendance_exceptions').select('*').gte('work_date',new Date(Date.now()-21*864e5).toISOString().slice(0,10)).order('work_date'),
 sb.from('work_functions').select('*').eq('active',true).order('name'),
 sb.from('function_assignments').select('*,collaborators(full_name),work_functions(name,function_type)').gte('work_date',new Date(Date.now()-7*864e5).toISOString().slice(0,10)).lte('work_date',new Date(Date.now()+14*864e5).toISOString().slice(0,10)).order('work_date'),
 sb.from('v_weekly_commission').select('*').gte('cycle_start_sunday',weekStartSunday().toISOString().slice(0,10)),
 sb.from('v_daily_production').select('*').gte('manufacture_date',new Date(Date.now()-30*864e5).toISOString().slice(0,10)).order('manufacture_date')
]);
 for(const r of [lots,tasks,soils,plans,recipes,collabs,attendance,funcs,assignments,comm,daily])if(r.error)throw r.error;
 APP.lots=lots.data||[];APP.tasks=(tasks.data||[]).map(t=>({...t,lot_code:t.lots?.lot_code,responsible:t.lots?.responsible_snapshot}));APP.soils=soils.data||[];APP.plans=plans.data||[];APP.recipes=recipes.data||[];APP.collaborators=collabs.data||[];APP.attendance=attendance.data||[];APP.functions=funcs.data||[];APP.assignments=assignments.data||[];APP.weeklyCommission=comm.data||[];APP.dailyProduction=daily.data||[];saveCache();renderAll();await flushQueue()}catch(err){toast('Não foi possível atualizar tudo. Exibindo dados salvos quando disponíveis.',true);console.error(err)}finally{loading(false)}}

function renderAll(){renderDashboard();renderLots();renderTasks();renderCollaborators();renderSchedule();renderCatalog();populateLotOptions();if(isAdmin())loadUsers()}
function attendanceState(collabId,date,shift){
  const ex=APP.attendance.find(x=>x.collaborator_id===collabId&&x.work_date===date&&x.shift===shift);
  if(ex)return {status:ex.status,note:ex.note||''};
  const dow=new Date(date+'T12:00:00').getDay();
  return dow>=1&&dow<=5?{status:'PRESENT',note:''}:{status:'OFF_DEFAULT',note:''}
}
function renderDashboardTeam(){
  const today=new Date();today.setHours(0,0,0,0);
  const upcoming=APP.assignments
    .filter(a=>new Date(a.work_date+'T12:00:00')>=today)
    .slice()
    .sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.shift.localeCompare(b.shift));
  const dates=[...new Set(upcoming.map(a=>a.work_date))].slice(0,4);

  $('#dashboardSchedule').innerHTML=dates.map(d=>{
    const rows=upcoming.filter(a=>a.work_date===d);
    const groups={
      MANHA:groupAssignments(rows.filter(a=>a.shift==='MANHA')),
      TARDE:groupAssignments(rows.filter(a=>a.shift==='TARDE'))
    };
    const shifts=['MANHA','TARDE'].map(sh=>{
      const people=groups[sh].map(g=>{
        const names=g.items.map(a=>esc(a.work_functions?.name||'')).join(' + ');
        return `<span><b>${esc(g.name)}</b> ${names}</span>`;
      }).join('')||'<em>Sem escala</em>';
      return `<div><small>${sh==='MANHA'?'MANHÃ':'TARDE'}</small><div>${people}</div></div>`;
    }).join('');
    return `<section class="dash-schedule-day"><header><strong>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})}</strong></header>${shifts}</section>`;
  }).join('')||'<div class="empty-state">Nenhuma escala para os próximos dias.</div>';

  const start=weekStartSunday(),days=[];
  for(let i=0;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);days.push(d.toISOString().slice(0,10))}
  const collabs=APP.collaborators.filter(c=>c.status!=='INACTIVE');

  const head=days.map(d=>`<span>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}</span>`).join('');
  const rows=collabs.map(c=>{
    const cells=days.map(d=>{
      const m=attendanceState(c.id,d,'MANHA'),t=attendanceState(c.id,d,'TARDE');
      const ms=`<span class="${attendanceClass(m.status)}" title="${esc(m.note)}">M ${attendanceShort(m.status)}${m.note?`<small>${esc(m.note)}</small>`:''}</span>`;
      const ts=`<span class="${attendanceClass(t.status)}" title="${esc(t.note)}">T ${attendanceShort(t.status)}${t.note?`<small>${esc(t.note)}</small>`:''}</span>`;
      return `<div class="attendance-day">${ms}${ts}</div>`;
    }).join('');
    return `<div class="attendance-row"><strong>${esc(c.full_name)}</strong>${cells}</div>`;
  }).join('');

  $('#weeklyAttendance').innerHTML=`<div class="attendance-table"><div class="attendance-head"><span>Colaborador</span>${head}</div>${rows}</div>`;
}
function attendanceClass(status){return ['ABSENT','OFF'].includes(status)?'bad':status==='EXTRA'?'extra':status==='PRESENT'?'ok':'off'}
function attendanceShort(status){return status==='ABSENT'?'Falta':status==='OFF'?'Off':status==='EXTRA'?'Extra':status==='PRESENT'?'✓':'—'}
function renderDashboard(){const week=weekStartSunday(),weekStr=week.toISOString().slice(0,10);const weekProd=APP.dailyProduction.filter(x=>x.manufacture_date>=weekStr).reduce((s,x)=>s+num(x.bricks),0);const open=APP.tasks.filter(t=>t.status==='PENDING');$('#kpiWeek').textContent=qty(weekProd);$('#kpiLots').textContent=APP.lots.filter(l=>operationalStatus(l)!=='COMPLETED').length;$('#kpiTasks').textContent=open.length;$('#pendingBadge').textContent=open.length;$('#kpiCommission').textContent=money(APP.weeklyCommission.reduce((s,x)=>s+num(x.commission_value),0));
 $('#dashboardLots').innerHTML=APP.lots.filter(l=>operationalStatus(l)!=='COMPLETED').slice(0,6).map(l=>`<article class="trace-card ${operationalStatus(l).toLowerCase()}" data-lot="${l.id}"><header><div><strong>${esc(l.lot_code)}</strong><small>${esc(l.responsible_snapshot)}</small></div><span class="badge ${operationalStatus(l).toLowerCase()}">${statusLabel(operationalStatus(l))}</span></header><div class="progress"><i style="width:${lotProgress(l)}%"></i></div><small>${lotProgress(l)}% da cura · ${l.pending_tasks||0} pendência(s)</small></article>`).join('')||'<div>Nenhum lote em andamento.</div>';
 const urgent=open.slice().sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at)).slice(0,6);$('#dashboardTasks').innerHTML=urgent.map(t=>`<article class="priority-card"><time>${dateBR(t.scheduled_at,true)}</time><div><strong>${esc(t.lot_code)}</strong><small>${esc(t.responsible)}</small></div><button data-confirm-task="${t.id}">✓</button></article>`).join('')||'<div>Nenhuma prioridade aberta.</div>';
 const last14=[];for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10),val=APP.dailyProduction.filter(x=>x.manufacture_date===key).reduce((s,x)=>s+num(x.bricks),0);last14.push([key,val])}const max=Math.max(1,...last14.map(x=>x[1]));$('#productionChart').innerHTML=last14.map(([d,v])=>`<div class="bar-col"><i style="height:${Math.max(4,v/max*170)}px"><title>${d}: ${v}</title></i><small>${d.slice(8)}</small></div>`).join('');const cmax=Math.max(1,...APP.weeklyCommission.map(x=>num(x.commission_value)));$('#commissionChart').innerHTML=APP.weeklyCommission.map(x=>`<div class="commission-row"><header><span>${esc(x.full_name)}</span><strong>${money(x.commission_value)}</strong></header><div class="progress"><i style="width:${num(x.commission_value)/cmax*100}%"></i></div><small>${qty(x.eligible_bricks)} tijolos elegíveis</small></div>`).join('')||'<div>Sem produção elegível no ciclo atual.</div>'
 renderDashboardTeam();
}
function renderLots(filter=$('#lotSearch')?.value||''){const q=filter.toLowerCase();$('#lotsList').innerHTML=APP.lots.filter(l=>JSON.stringify(l).toLowerCase().includes(q)).map(l=>`<article class="lot-card" data-lot="${l.id}"><header><div><strong>${esc(l.lot_code)}</strong><small>${dateBR(l.manufactured_at,true)} · ${shiftLabel(l.shift)}</small></div><span class="badge ${operationalStatus(l).toLowerCase()}">${statusLabel(operationalStatus(l))}</span></header><p>${qty(l.quantity)} tijolos · ${esc(l.soil_name)} · ${esc(l.cement_type)}</p><div class="progress"><i style="width:${lotProgress(l)}%"></i></div><small>${lotProgress(l)}% da cura · Responsável: ${esc(l.responsible_snapshot)}</small></article>`).join('')||'<div>Nenhum lote encontrado.</div>'}
function renderTasks(){const now=new Date();let rows=APP.tasks;if(APP.taskFilter==='pending')rows=rows.filter(x=>x.status==='PENDING');if(APP.taskFilter==='done')rows=rows.filter(x=>x.status==='DONE');const groups={};rows.forEach(t=>{const k=new Date(t.scheduled_at).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});(groups[k]??=[]).push(t)});$('#tasksList').innerHTML=Object.entries(groups).map(([day,items])=>`<section class="task-day"><h3>${day}</h3>${items.map(t=>{const overdue=t.status==='PENDING'&&new Date(t.scheduled_at)<now;return`<article class="task-item ${overdue?'overdue':''} ${t.status==='DONE'?'done':''}"><time>${new Date(t.scheduled_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time><div><strong>${esc(t.lot_code)}</strong><small>${esc(t.responsible)}</small></div>${t.status==='DONE'?'<span>✓ Confirmada</span>':`<button data-confirm-task="${t.id}">Confirmar</button>`}</article>`}).join('')}</section>`).join('')||'<div>Nenhuma tarefa nesta categoria.</div>'}
function renderCollaborators(){
  const cycle=weekStartSunday().toISOString().slice(0,10),visible=APP.collaborators.filter(x=>x.status!=='INACTIVE');
  const total=APP.weeklyCommission.reduce((s,x)=>s+num(x.commission_value),0);
  $('#collaboratorSummary').innerHTML=`<article class="kpi"><small>Ciclo iniciado</small><strong>${dateBR(cycle)}</strong><span>domingo</span></article><article class="kpi"><small>Colaboradores ativos</small><strong>${visible.filter(x=>x.status==='ACTIVE').length}</strong><span>equipe</span></article><article class="kpi"><small>Comissão acumulada</small><strong>${money(total)}</strong><span>ciclo atual</span></article><article class="kpi"><small>Regra</small><strong>R$ 10</strong><span>por 1.000 tijolos / pessoa</span></article>`;
  $('#collaboratorsList').innerHTML=visible.map(c=>{const wc=APP.weeklyCommission.find(x=>x.collaborator_id===c.id),ex=APP.attendance.filter(x=>x.collaborator_id===c.id).slice(-4);return`<article class="employee-card"><header><div><strong>${esc(c.full_name)}</strong><small>${esc(c.employment_type)} · ${c.daily_hours}h/dia</small></div><span class="badge ${c.status==='ACTIVE'?'active':'suspended'}">${c.status}</span></header><div class="metric-row"><div class="metric"><small>Tijolos elegíveis</small><strong>${qty(wc?.eligible_bricks||0)}</strong></div><div class="metric"><small>Comissão</small><strong>${money(wc?.commission_value||0)}</strong></div></div><small>Exceções recentes: ${ex.length}</small>${isAdmin()?`<div class="employee-actions"><button data-attendance="${c.id}">Presença/ausência</button><button data-off="${c.id}">Off por período</button><button data-toggle-collab="${c.id}">${c.status==='ACTIVE'?'Suspender':'Reativar'}</button><button class="danger-action" data-delete-collab="${c.id}">Excluir</button></div>`:''}</article>`}).join('')
}
function renderSchedule(){
  const days={};APP.assignments.forEach(a=>{(days[a.work_date]??={MANHA:[],TARDE:[]})[a.shift].push(a)});
  $('#functionsList').innerHTML=APP.functions.map(f=>`<span class="function-chip ${f.function_type==='ACUMULAVEL'?'accum':''}">${esc(f.name)} <small>${f.function_type==='PRODUCAO'?'Produção':'Acumulável'}</small>${isAdmin()?`<button data-delete-function="${f.id}" title="Excluir função">×</button>`:''}</span>`).join('');
  $('#scheduleList').innerHTML=Object.entries(days).map(([d,sh])=>`<section class="schedule-day"><h3>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</h3><div class="schedule-shifts">${['MANHA','TARDE'].map(shift=>`<div class="schedule-shift"><h4>${shift==='MANHA'?'Manhã':'Tarde'}</h4>${groupAssignments(sh[shift]).map(g=>`<div class="assignment multi"><strong>${esc(g.name)}</strong><div class="assignment-functions">${g.items.map(a=>`<span class="${a.work_functions?.function_type==='ACUMULAVEL'?'accum':''}">${esc(a.work_functions?.name)}${isAdmin()?`<button data-delete-assignment="${a.id}" title="Remover da escala">×</button>`:''}</span>`).join('')}</div></div>`).join('')||'—'}</div>`).join('')}</div></section>`).join('')||'<div>Nenhuma escala gerada.</div>'
}
function groupAssignments(items){
  const m={};(items||[]).forEach(a=>{const id=a.collaborator_id;(m[id]??={name:a.collaborators?.full_name||'',items:[]}).items.push(a)});return Object.values(m)
}
function renderCatalog(){
  if(!isAdmin())return;
  $('#soilsList').innerHTML=APP.soils.map(s=>`<div class="catalog-card"><div><strong>${esc(s.code)} · ${esc(s.name)}</strong><small>${esc(s.origin)} · ${s.sand_pct}% areia / ${s.clay_pct}% argila</small></div><button class="icon-danger" data-delete-soil="${s.id}" title="Excluir terra">×</button></div>`).join('');
  $('#plansList').innerHTML=APP.plans.map(p=>`<div class="catalog-card"><div><strong>${esc(p.name)}</strong><small>${p.days} dia(s) · ${(p.times||[]).join(', ')||'sem horários'}</small></div><button class="icon-danger" data-delete-plan="${p.id}" title="Excluir plano">×</button></div>`).join('')
}
function populateLotOptions(){
  $('#lotSoil').innerHTML=APP.soils.map(s=>`<option value="${s.id}">${esc(s.code)} · ${esc(s.name)} · ${esc(s.origin)}</option>`).join('');
  $('#wateringPlan').innerHTML=APP.plans.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const recipes=[...APP.recipes].sort((a,b)=>(b.is_default?1:0)-(a.is_default?1:0)||String(a.code).localeCompare(String(b.code)));
  $('#recipeSelect').innerHTML=recipes.map(r=>`<option value="${r.id}" ${r.is_default?'selected':''}>${esc(r.code)}</option>`).join('');
  updateRecipeSummary();
}
function setDefaultLot(){
  const d=new Date(),local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  $('#lotForm [name=manufacturedAt]').value=local;
  $('#lotForm [name=shift]').value=d.getHours()<12?'MANHA':'TARDE';
  const def=APP.recipes.find(x=>x.is_default)||APP.recipes.find(x=>x.code==='10-1-1')||APP.recipes[0];
  if(def)$('#recipeSelect').value=def.id;
  $('#lotForm [name=cementType]').value='CP II';
  $('#lotForm [name=plasticWrapped]').value='YES';
  $('#lotForm [name=cureDays]').value='28';
  $('#hasExtra').value='NO';
  $('#extrasWrap').classList.add('hidden');
  $('#wateringField').classList.add('hidden');
  $('#extrasList').innerHTML='';
  const moisture=$('#moistureField');if(moisture){moisture.value='';moisture.required=false}
  updateRecipeSummary();
}
function recipeLabel(r){
  if(!r)return '';
  const parts=[`${num(r.soil_buckets_full)} terra`];
  if(num(r.sand_buckets_full)>0)parts.push(`${num(r.sand_buckets_full)} areia`);
  parts.push(`${num(r.cement_buckets_full)} cimento`);
  return parts.join(' · ');
}
function updateRecipeSummary(){
  const r=APP.recipes.find(x=>x.id===$('#recipeSelect')?.value);
  if(!r){$('#recipeSummary').innerHTML='';return}
  const soil=num(r.soil_buckets_full),sand=num(r.sand_buckets_full),cement=num(r.cement_buckets_full);
  $('#recipeSummary').innerHTML=`<div class="recipe-code">${esc(r.code)}</div><div class="recipe-parts"><span><b>${soil}</b> Terra</span>${sand>0?`<span><b>${sand}</b> Areia</span>`:''}<span><b>${cement}</b> Cimento</span></div><small>Proporção de referência em baldes de 18 L</small>`;
}
function addExtraRow(){const row=document.createElement('div');row.className='extra-row';row.innerHTML='<input class="extra-name" placeholder="Material (ex.: pó de brita)" required><input class="extra-qty" type="number" step="0.01" min="0.01" placeholder="Qtd." required><select class="extra-unit"><option value="BALDE_18L">Balde 18 L</option><option value="KG">kg</option><option value="L">L</option><option value="G">g</option><option value="ML">mL</option><option value="OUTRO">Outro</option></select><button type="button">×</button>';row.querySelector('button').onclick=()=>row.remove();$('#extrasList').appendChild(row)}
async function submitLot(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const recipe=APP.recipes.find(x=>x.id===f.get('recipeId'));
  if(!recipe)return toast('Selecione um traço válido.',true);
  const hasExtra=f.get('hasExtra')==='YES';
  const extras=hasExtra?$$('.extra-row').map(r=>({material_name:r.querySelector('.extra-name').value.trim(),quantity:num(r.querySelector('.extra-qty').value),unit:r.querySelector('.extra-unit').value})):[];
  const moisture=hasExtra?num(f.get('moisture')):null;
  if(hasExtra&&String(f.get('moisture')||'').trim()==='')return toast('Informe o coeficiente de umidade quando houver material extra.',true);
  const payload={manufactured_at:new Date(f.get('manufacturedAt')).toISOString(),shift:f.get('shift'),quantity:num(f.get('quantity')),soil_id:f.get('soilId'),recipe_id:recipe.id,soil_buckets:num(recipe.soil_buckets_full),sand_buckets:num(recipe.sand_buckets_full),cement_buckets:num(recipe.cement_buckets_full),cement_type:String(f.get('cementType')).trim(),moisture_coefficient:moisture,plastic_wrapped:f.get('plasticWrapped')==='YES',watering_plan_id:f.get('plasticWrapped')==='NO'?f.get('wateringPlanId'):null,cure_days:num(f.get('cureDays')),responsible_snapshot:APP.profile.full_name,created_by:APP.profile.id,notes:String(f.get('notes')||'').trim()||null};
  loading(true,'Salvando lote');
  try{const {data,error}=await sb.from('lots').insert(payload).select().single();if(error)throw error;if(extras.length){const {error:e2}=await sb.from('lot_extra_materials').insert(extras.map(x=>({...x,lot_id:data.id})));if(e2)throw e2}$('#lotDialog').close();toast(`Lote ${data.lot_code} criado com sucesso.`);await bootstrap();showLotDetail(data.id)}
  catch(err){if(!navigator.onLine){queueOperation({type:'CREATE_LOT',payload,extras});$('#lotDialog').close();toast('Sem internet: lote salvo na fila para sincronização.')}else toast(err.message,true)}
  finally{loading(false)}
}
function queueOperation(op){const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');q.push({...op,queued_at:new Date().toISOString()});localStorage.setItem(QUEUE_KEY,JSON.stringify(q))}
async function flushQueue(){if(!navigator.onLine)return;const q=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'),remaining=[];for(const op of q){try{if(op.type==='CREATE_LOT'){const {data,error}=await sb.from('lots').insert(op.payload).select().single();if(error)throw error;if(op.extras?.length)await sb.from('lot_extra_materials').insert(op.extras.map(x=>({...x,lot_id:data.id})))}if(op.type==='CONFIRM_TASK'){const {error}=await sb.from('watering_tasks').update(op.payload).eq('id',op.id);if(error)throw error}}catch{remaining.push(op)}}localStorage.setItem(QUEUE_KEY,JSON.stringify(remaining))}
async function confirmTask(id){const payload={status:'DONE',executed_at:new Date().toISOString(),executed_by:APP.profile.id,executed_by_name:APP.profile.full_name};try{const {error}=await sb.from('watering_tasks').update(payload).eq('id',id);if(error)throw error;toast('Ação confirmada.');await bootstrap()}catch(err){if(!navigator.onLine){queueOperation({type:'CONFIRM_TASK',id,payload});toast('Confirmação salva offline e será sincronizada.')}else toast(err.message,true)}}
async function showLotDetail(id){
  const l=APP.lots.find(x=>x.id===id)||(await sb.from('v_lot_operational').select('*').eq('id',id).single()).data;if(!l)return;
  const {data:extras}=await sb.from('lot_extra_materials').select('*').eq('lot_id',id);
  const r=APP.recipes.find(x=>x.id===l.recipe_id);
  const recipeText=r?`${esc(r.code)} · ${recipeLabel(r)}`:`${l.soil_buckets} terra · ${l.sand_buckets} areia · ${l.cement_buckets} cimento`;
  $('#detailContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">RASTREABILIDADE</p><h2>${esc(l.lot_code)}</h2></div><button class="icon" data-close="detailDialog">×</button></div><div class="detail-grid"><div class="detail-cell"><small>Fabricação</small><strong>${dateBR(l.manufactured_at,true)}</strong></div><div class="detail-cell"><small>Turno</small><strong>${shiftLabel(l.shift)}</strong></div><div class="detail-cell"><small>Produção</small><strong>${qty(l.quantity)}</strong></div><div class="detail-cell"><small>Responsável</small><strong>${esc(l.responsible_snapshot)}</strong></div><div class="detail-cell"><small>Terra</small><strong>${esc(l.soil_code||'')}</strong></div><div class="detail-cell"><small>Cura</small><strong>${l.cure_days} dias</strong></div></div><h3>Traço</h3><p><strong>${recipeText}</strong> · Cimento ${esc(l.cement_type)}</p>${extras?.length?`<h3>Materiais extras</h3><p>${extras.map(x=>`${esc(x.material_name)}: ${x.quantity} ${esc(x.unit)}`).join(' · ')}</p>${l.moisture_coefficient!=null?`<p>Coeficiente de umidade: <strong>${l.moisture_coefficient}</strong></p>`:''}`:''}<p>Plástico-filme: <strong>${l.plastic_wrapped?'SIM':'NÃO'}</strong></p><div class="dialog-actions"><button class="secondary" onclick="window.print()">Imprimir</button>${(isAdmin()||APP.profile?.can_delete_lots)?`<button class="secondary danger-action" data-delete-lot="${l.id}">Excluir lote</button>`:''}</div>`;$('#detailDialog').showModal()
}
async function deleteLot(id){
  if(!confirm('Excluir este lote? Ele ficará marcado como excluído e não aparecerá na operação atual.'))return;
  const {error}=await sb.rpc('soft_delete_lot',{p_lot_id:id});
  if(error)return toast(error.message,true);
  $('#detailDialog').close();toast('Lote excluído.');bootstrap()
}
async function loadUsers(){try{const {data:{session}}=await sb.auth.getSession();const r=await fetch(`${CFG.SUPABASE_URL}/functions/v1/admin-users`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':CFG.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({action:'list'})});const j=await r.json();if(!j.ok)throw new Error(j.error);APP.users=j.users;renderUsers()}catch(err){console.error(err)}}
function renderUsers(){
  if(!isAdmin())return;
  $('#usersList').innerHTML=(APP.users||[]).map(u=>`<article class="user-card">
    <header><div><strong>${esc(u.full_name)}</strong><small>@${esc(u.username)}</small></div><span class="badge ${u.status==='ACTIVE'?'active':'suspended'}">${u.status==='ACTIVE'?'ATIVO':'SUSPENSO'}</span></header>
    <p>${esc(u.role)}</p>
    <div class="user-permission"><span>Excluir lotes</span><button class="permission-toggle ${u.can_delete_lots?'on':''}" data-user-action="lotDeletePermission" data-user="${u.id}" data-allowed="${u.can_delete_lots?'false':'true'}">${u.can_delete_lots?'Permitido':'Não permitido'}</button></div>
    <div class="user-actions">${u.id!==APP.profile.id?`<button data-user-action="${u.status==='ACTIVE'?'suspend':'reactivate'}" data-user="${u.id}">${u.status==='ACTIVE'?'Suspender':'Reativar'}</button><button data-user-action="resetPassword" data-user="${u.id}">Nova senha</button><button class="danger-action" data-user-action="delete" data-user="${u.id}">Excluir</button>`:'<small>Conta atual</small>'}</div>
  </article>`).join('')
}
async function adminUserAction(action,userId,data={}){const {data:{session}}=await sb.auth.getSession();const r=await fetch(`${CFG.SUPABASE_URL}/functions/v1/admin-users`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':CFG.SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({action,userId,...data})});const j=await r.json();if(!j.ok)throw new Error(j.error);return j}
async function submitUser(e){
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const payload={fullName:String(fd.get('fullName')).trim(),username:String(fd.get('username')).trim(),password:String(fd.get('password')),role:String(fd.get('role')),canDeleteLots:fd.get('canDeleteLots')==='on'};
  loading(true,'Criando usuário');
  try{await adminUserAction('create',null,payload);$('#userDialog').close();e.currentTarget.reset();toast('Usuário criado.');await loadUsers()}
  catch(err){toast(err.message,true)}finally{loading(false)}
}
async function submitCollaborator(e){e.preventDefault();const f=new FormData(e.currentTarget),payload={full_name:f.get('fullName'),employment_type:f.get('employmentType'),daily_hours:num(f.get('dailyHours')),commission_per_1000:num(f.get('commission')),start_date:f.get('startDate')};const {error}=await sb.from('collaborators').insert(payload);if(error)return toast(error.message,true);$('#collaboratorDialog').close();toast('Colaborador cadastrado.');bootstrap()}
async function submitAttendance(e){e.preventDefault();const f=new FormData(e.currentTarget),payload={collaborator_id:f.get('collaboratorId'),work_date:f.get('workDate'),shift:f.get('shift'),status:f.get('status'),note:f.get('note')||null,created_by:APP.profile.id};const {error}=await sb.from('attendance_exceptions').upsert(payload,{onConflict:'collaborator_id,work_date,shift'});if(error)return toast(error.message,true);$('#attendanceDialog').close();toast('Presença atualizada.');bootstrap()}
async function setOffPeriod(id){const days=Number(prompt('Quantos dias ficará off?',4));if(!days||days<1)return;const start=prompt('Data inicial (AAAA-MM-DD)',new Date().toISOString().slice(0,10));if(!start)return;const rows=[];for(let i=0;i<days;i++){const d=new Date(start+'T12:00');d.setDate(d.getDate()+i);const date=d.toISOString().slice(0,10);rows.push({collaborator_id:id,work_date:date,shift:'MANHA',status:'OFF',note:`Off por ${days} dia(s)`,created_by:APP.profile.id},{collaborator_id:id,work_date:date,shift:'TARDE',status:'OFF',note:`Off por ${days} dia(s)`,created_by:APP.profile.id})}const {error}=await sb.from('attendance_exceptions').upsert(rows,{onConflict:'collaborator_id,work_date,shift'});if(error)return toast(error.message,true);toast('Período off registrado.');bootstrap()}
async function toggleCollaborator(id){const c=APP.collaborators.find(x=>x.id===id),status=c.status==='ACTIVE'?'SUSPENDED':'ACTIVE';const {error}=await sb.from('collaborators').update({status}).eq('id',id);if(error)return toast(error.message,true);toast('Situação atualizada.');bootstrap()}
async function submitFunction(e){e.preventDefault();const f=new FormData(e.currentTarget),payload={name:f.get('name'),function_type:f.get('type'),default_start:f.get('start')||null,default_end:f.get('end')||null,notes:f.get('notes')||null};const {error}=await sb.from('work_functions').insert(payload);if(error)return toast(error.message,true);$('#functionDialog').close();toast('Função criada.');bootstrap()}
async function generateRotation(e){
  if(e?.preventDefault)e.preventDefault();
  const f=new FormData($('#rotationForm')),start=String(f.get('startDate')),days=num(f.get('days'));
  const accum=$$('#rotationAccumFunctions input:checked').map(x=>x.value);
  loading(true,'Gerando rotação');
  try{const {data,error}=await sb.rpc('generate_rotating_schedule',{p_start_date:start,p_days:days,p_accumulative_function_ids:accum});if(error)throw error;$('#rotationDialog').close();toast(`${data} atribuições geradas.`);await bootstrap()}
  catch(err){toast(err.message,true)}finally{loading(false)}
}
function openRotationDialog(){
  $('#rotationForm [name=startDate]').value=new Date().toISOString().slice(0,10);
  const accum=APP.functions.filter(f=>f.function_type==='ACUMULAVEL');
  $('#rotationAccumFunctions').innerHTML=accum.length?accum.map(f=>`<label><input type="checkbox" value="${f.id}"> ${esc(f.name)}</label>`).join(''):'<small>Nenhuma função acumulável cadastrada.</small>';
  $('#rotationDialog').showModal()
}
async function submitSoil(e){e.preventDefault();const f=new FormData(e.currentTarget),payload={code:f.get('code'),name:f.get('name'),origin:f.get('origin'),sand_pct:num(f.get('sand')),clay_pct:num(f.get('clay'))};const {error}=await sb.from('soils').insert(payload);if(error)return toast(error.message,true);$('#soilDialog').close();toast('Terra cadastrada.');bootstrap()}
async function submitPlan(e){e.preventDefault();const f=new FormData(e.currentTarget),payload={code:f.get('code'),name:f.get('name'),days:num(f.get('days')),times:String(f.get('times')||'').split(',').map(x=>x.trim()).filter(Boolean),description:f.get('description')||null};const {error}=await sb.from('watering_plans').insert(payload);if(error)return toast(error.message,true);$('#planDialog').close();toast('Plano criado.');bootstrap()}

async function deleteCatalogEntity(type,id){
  if(!isAdmin())return toast('Apenas ADMIN pode excluir este item.',true);
  const labels={soil:'esta terra',plan:'este plano',collaborator:'este colaborador',function:'esta função'};
  if(!confirm(`Excluir ${labels[type]||'este item'}? O histórico já utilizado será preservado.`))return;
  let q;
  if(type==='soil')q=sb.from('soils').update({active:false}).eq('id',id);
  if(type==='plan')q=sb.from('watering_plans').update({active:false}).eq('id',id);
  if(type==='collaborator')q=sb.from('collaborators').update({status:'INACTIVE',end_date:new Date().toISOString().slice(0,10)}).eq('id',id);
  if(type==='function')q=sb.from('work_functions').update({active:false}).eq('id',id);
  const {error}=await q;if(error)return toast(error.message,true);toast('Item excluído do uso atual.');bootstrap()
}
async function deleteAssignment(id){
  if(!isAdmin()||!confirm('Remover esta atribuição da escala?'))return;
  const {error}=await sb.from('function_assignments').delete().eq('id',id);if(error)return toast(error.message,true);toast('Atribuição removida.');bootstrap()
}async function deleteScheduleRange(){
  if(!isAdmin())return;
  const start=prompt('Excluir escala a partir de (AAAA-MM-DD)',new Date().toISOString().slice(0,10));if(!start)return;
  const end=prompt('Até qual data? (AAAA-MM-DD)',start);if(!end)return;
  if(!confirm(`Excluir as atribuições da escala entre ${start} e ${end}?`))return;
  const {error}=await sb.from('function_assignments').delete().gte('work_date',start).lte('work_date',end);
  if(error)return toast(error.message,true);toast('Escala excluída no período informado.');bootstrap()
}

function navigate(view){$$('.view').forEach(v=>v.classList.toggle('active',v.id===view));$$('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===view));const n=$(`.nav[data-view="${view}"]`);$('#pageTitle').textContent=n?.querySelector('span')?.textContent||'TerraLote';$('#sidebar').classList.remove('open')}
function bind(){$('#loginForm').addEventListener('submit',login);$('#logoutBtn').onclick=logout;$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$$('.nav').forEach(b=>b.onclick=()=>navigate(b.dataset.view));$$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));$('#newLotBtn').onclick=()=>{setDefaultLot();$('#lotDialog').showModal()};$('#lotSearch').oninput=e=>renderLots(e.target.value);$('#recipeSelect').addEventListener('change',updateRecipeSummary);$('#hasExtra').onchange=e=>{const show=e.target.value==='YES';$('#extrasWrap').classList.toggle('hidden',!show);const moisture=$('#moistureField');if(moisture){moisture.required=show;if(!show)moisture.value=''}if(show&&!$('#extrasList').children.length)addExtraRow()};$('#plasticWrapped').onchange=e=>$('#wateringField').classList.toggle('hidden',e.target.value==='YES');$('#addExtraBtn').onclick=addExtraRow;$('#lotForm').addEventListener('submit',submitLot);$('#userForm').addEventListener('submit',submitUser);$('#collaboratorForm').addEventListener('submit',submitCollaborator);$('#attendanceForm').addEventListener('submit',submitAttendance);$('#functionForm').addEventListener('submit',submitFunction);$('#soilForm').addEventListener('submit',submitSoil);$('#planForm').addEventListener('submit',submitPlan);$('#newUserBtn').onclick=()=>$('#userDialog').showModal();$('#newCollaboratorBtn').onclick=()=>{$('#collaboratorForm [name=startDate]').value=new Date().toISOString().slice(0,10);$('#collaboratorDialog').showModal()};$('#newFunctionBtn').onclick=()=>$('#functionDialog').showModal();$('#generateRotationBtn').onclick=openRotationDialog;$('#deleteScheduleBtn').onclick=deleteScheduleRange;$('#rotationForm').addEventListener('submit',generateRotation);$('#newSoilBtn').onclick=()=>$('#soilDialog').showModal();$('#newPlanBtn').onclick=()=>$('#planDialog').showModal();$$('[data-task-filter]').forEach(b=>b.onclick=()=>{APP.taskFilter=b.dataset.taskFilter;$$('[data-task-filter]').forEach(x=>x.classList.toggle('active',x===b));renderTasks()});document.addEventListener('click',async e=>{const close=e.target.closest('[data-close]');if(close){document.getElementById(close.dataset.close)?.close();return}const lot=e.target.closest('[data-lot]');if(lot){showLotDetail(lot.dataset.lot);return}const conf=e.target.closest('[data-confirm-task]');if(conf){confirmTask(conf.dataset.confirmTask);return}const del=e.target.closest('[data-delete-lot]');if(del){deleteLot(del.dataset.deleteLot);return}const att=e.target.closest('[data-attendance]');if(att){const f=$('#attendanceForm');f.collaboratorId.value=att.dataset.attendance;f.workDate.value=new Date().toISOString().slice(0,10);$('#attendanceDialog').showModal();return}const off=e.target.closest('[data-off]');if(off){setOffPeriod(off.dataset.off);return}const tc=e.target.closest('[data-toggle-collab]');if(tc){toggleCollaborator(tc.dataset.toggleCollab);return}const ua=e.target.closest('[data-user-action]');if(ua){try{const action=ua.dataset.userAction,id=ua.dataset.user;if(action==='delete'&&!confirm('Excluir este usuário definitivamente?'))return;if(action==='resetPassword'){const password=prompt('Nova senha (mínimo 8 caracteres)');if(!password)return;await adminUserAction(action,id,{password})}else if(action==='lotDeletePermission'){await adminUserAction('setLotDeletePermission',id,{allowed:ua.dataset.allowed==='true'})}else await adminUserAction(action,id);toast('Usuário atualizado.');loadUsers()}catch(err){toast(err.message,true)}return}
const ds=e.target.closest('[data-delete-soil]');if(ds){deleteCatalogEntity('soil',ds.dataset.deleteSoil);return}
const dp=e.target.closest('[data-delete-plan]');if(dp){deleteCatalogEntity('plan',dp.dataset.deletePlan);return}
const dc=e.target.closest('[data-delete-collab]');if(dc){deleteCatalogEntity('collaborator',dc.dataset.deleteCollab);return}
const df=e.target.closest('[data-delete-function]');if(df){deleteCatalogEntity('function',df.dataset.deleteFunction);return}
const da=e.target.closest('[data-delete-assignment]');if(da){deleteAssignment(da.dataset.deleteAssignment);return}})}

async function init(){bind();if(!CFG.SUPABASE_URL||CFG.SUPABASE_URL.includes('COLE_AQUI')){$('#loginMessage').textContent='Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em config.js.';return}const {data:{session}}=await sb.auth.getSession();if(session){try{await getProfile();showApp();await bootstrap()}catch(err){toast(err.message,true)}}if('serviceWorker'in navigator)navigator.serviceWorker.register('service-worker.js?v=430')}
init();
