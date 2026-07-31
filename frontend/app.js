window.TERRALOTE_FRONTEND_VERSION='3.1.0';
'use strict';

const CONFIG = window.TERRALOTE_CONFIG;
const STORE = {
  token: 'terralote_token_v2',
  cache: 'terralote_cache_v2',
  queue: 'terralote_queue_v2',
  user: 'terralote_user_v2'
};
const APP = {
  token: localStorage.getItem(STORE.token) || '',
  user: JSON.parse(localStorage.getItem(STORE.user) || 'null'),
  lots: [], soils: [], plans: [], tasks: [],
  taskFilter: 'open', lastCreatedId: null, loadingCount: 0, dashboardPeriod: 30
};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num = v => Number(v || 0);
const toISO = v => v ? new Date(v).toISOString() : '';
const isValidDate = v => v && !Number.isNaN(new Date(v).getTime());

function dateBR(v, withTime=true){
  if(!isValidDate(v)) return '—';
  return new Intl.DateTimeFormat('pt-BR', withTime ? {dateStyle:'short',timeStyle:'short'} : {dateStyle:'short'}).format(new Date(v));
}
function dayDiff(a,b=new Date()){return Math.max(0,Math.floor((new Date(b)-new Date(a))/86400000));}
function cureProgress(l){return Math.min(100,Math.max(0,Math.round(dayDiff(l.manufacturedAt)/Math.max(1,num(l.cureDays))*100)));}
function cureEnd(l){return new Date(new Date(l.manufacturedAt).getTime()+num(l.cureDays)*86400000);}
function lotTasks(l){return APP.tasks.filter(t=>t.lotId===l.id&&!t.deletedAt);}
function pendingLotTasks(l){return lotTasks(l).filter(t=>String(t.status).toUpperCase()!=='DONE');}
function lotStatus(l){
  const cureDone=cureProgress(l)>=100;
  const pending=pendingLotTasks(l);
  if(cureDone && pending.length===0)return 'COMPLETED';
  if(pending.some(t=>new Date(t.scheduledAt)<new Date()))return 'OVERDUE';
  return 'CURING';
}
function lotStatusLabel(l){return ({COMPLETED:'Concluído',OVERDUE:'Com pendência',CURING:'Em andamento'})[lotStatus(l)]||'Em andamento';}
function lotOverallProgress(l){
  const cure=cureProgress(l), tasks=lotTasks(l), done=tasks.filter(t=>String(t.status).toUpperCase()==='DONE').length;
  const taskPct=tasks.length?Math.round(done/tasks.length*100):100;
  return Math.round(cure*.7+taskPct*.3);
}
function formatQty(v){return num(v).toLocaleString('pt-BR',{maximumFractionDigits:2});}
function formatMix(l){
  const extra=l.extraName?` + ${formatQty(l.extraQty)}${l.extraUnit||''} ${l.extraName}`:'';
  return `${formatQty(l.soilKg)}kg terra + ${formatQty(l.sandKg)}kg areia + ${formatQty(l.cementKg)}kg ${esc(l.cementType)}${extra}`;
}
function saveCache(){
  const data={lots:APP.lots,soils:APP.soils,plans:APP.plans,tasks:APP.tasks,savedAt:new Date().toISOString()};
  localStorage.setItem(STORE.cache,JSON.stringify(data));
}
function loadCache(){
  const c=JSON.parse(localStorage.getItem(STORE.cache)||'null');
  if(!c)return false;
  APP.lots=c.lots||[];APP.soils=c.soils||[];APP.plans=c.plans||[];APP.tasks=c.tasks||[];
  return true;
}
function toast(message,error=false){const el=$('#toast');el.textContent=message;el.className=`toast show${error?' error':''}`;clearTimeout(el._t);el._t=setTimeout(()=>el.className='toast',3200);}
function setBusy(button,busy,label='Aguarde...'){if(!button)return; if(busy){button.dataset.old=button.textContent;button.textContent=label;button.disabled=true;button.classList.add('is-loading')}else{button.textContent=button.dataset.old||button.textContent;button.disabled=false;button.classList.remove('is-loading')}}
function showLoading(title='Aguarde, estamos atualizando os dados',subtitle='Isso pode levar alguns segundos.'){APP.loadingCount++;$('#loadingTitle').textContent=title;$('#loadingSubtitle').textContent=subtitle;$('#loadingOverlay').classList.remove('hidden')}
function hideLoading(){APP.loadingCount=Math.max(0,APP.loadingCount-1);if(APP.loadingCount===0)$('#loadingOverlay').classList.add('hidden')}
function closeDialog(id){const d=$(id);if(d&&d.open)d.close()}
function successAndClose(dialogId,message){closeDialog(dialogId);toast(message)}

async function api(type,payload={}){
  if(!navigator.onLine) throw new Error('Sem conexão com a internet.');
  const response=await fetch(CONFIG.API_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({type,token:APP.token,...payload})});
  if(!response.ok)throw new Error(`Falha de comunicação (${response.status}).`);
  const data=await response.json();
  if(!data.ok){
    if(data.code==='UNAUTHORIZED') logout(false);
    throw new Error(data.error||'Não foi possível concluir a operação.');
  }
  return data.result;
}
async function bootstrap(){
  const hadCache=loadCache();
  if(hadCache)renderAll();
  showLoading('Aguarde, estamos atualizando os dados','Buscando terras, planos, lotes e pendências mais recentes.');
  try{
    const result=await api('GET_BOOTSTRAP');
    APP.lots=result.lots||[];APP.soils=result.soils||[];APP.plans=result.plans||[];APP.tasks=result.tasks||[];
    if(result.user){APP.user=result.user;localStorage.setItem(STORE.user,JSON.stringify(APP.user));}
    saveCache();renderAll();
  }catch(err){
    if(hadCache){toast('Não foi possível atualizar agora. Exibindo os últimos dados salvos.',true);}
    else throw err;
  }finally{hideLoading();}
}

async function login(e){
  e.preventDefault();
  const button=e.submitter, form=new FormData(e.currentTarget);
  setBusy(button,true,'Entrando...');$('#loginMessage').textContent='';
  showLoading('Entrando no TerraLote','Validando o acesso e preparando os dados.');
  try{
    const result=await api('LOGIN',{username:String(form.get('username')).trim(),password:String(form.get('password'))});
    APP.token=result.token;APP.user=result.user;
    localStorage.setItem(STORE.token,APP.token);localStorage.setItem(STORE.user,JSON.stringify(APP.user));
    showApp();await bootstrap();
  }catch(err){$('#loginMessage').textContent=err.message;}
  finally{hideLoading();setBusy(button,false);}
}
function showApp(){
  $('#loginScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');
  const name=APP.user?.name||'Operador';$('#accountName').textContent=name;$('#accountInitial').textContent=name.charAt(0).toUpperCase();
  $('#accountDialogName').textContent=name;$('#accountDialogEmail').textContent=APP.user?.email||'';
}
function logout(showMessage=true){
  APP.token='';APP.user=null;localStorage.removeItem(STORE.token);localStorage.removeItem(STORE.user);
  $$('dialog[open]').forEach(d=>d.close());
  $('#appShell').classList.add('hidden');$('#loginScreen').classList.remove('hidden');
  const form=$('#loginForm');if(form)form.reset();
  setTimeout(()=>form?.querySelector('[name=username]')?.focus(),50);
  if(showMessage)toast('Você saiu do sistema com sucesso.');
}

function renderAll(){renderDashboard();renderLots();renderTasks();renderCatalogs();fillSelects();updateAccount();}
function updateAccount(){
  const n=APP.user?.name||'Operador';$('#accountName').textContent=n;$('#accountInitial').textContent=n[0]?.toUpperCase()||'O';
  $('#accountDialogName').textContent=n;$('#accountDialogEmail').textContent=APP.user?.email||'';const u=$('#passwordForm [name=newUsername]');if(u&&!u.value)u.value=APP.user?.username||'';
}
function pendingTasks(){return APP.tasks.filter(t=>t.status!=='DONE'&&!t.deletedAt).sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));}
function priorityTasks(){const limit=new Date();limit.setHours(23,59,59,999);return pendingTasks().filter(t=>new Date(t.scheduledAt)<=limit);}
function renderDashboard(){
  const active=APP.lots.filter(l=>!l.deletedAt&&lotStatus(l)==='CURING').length;
  const lots=APP.lots.filter(l=>!l.deletedAt);
  $('#kpiActive').textContent=active;$('#kpiPending').textContent=priorityTasks().length;$('#kpiBricks').textContent=lots.reduce((s,l)=>s+num(l.quantity),0).toLocaleString('pt-BR');$('#navPendingBadge').textContent=pendingTasks().length;
  $('#lotProgress').innerHTML=lots.length?lots.slice().sort((a,b)=>new Date(b.manufacturedAt)-new Date(a.manufacturedAt)).slice(0,8).map(l=>lotProgressCard(l)).join(''):'<div class="empty">Nenhum lote cadastrado.</div>';
  $('#nextTasks').innerHTML=taskCards(priorityTasks().slice(0,7),true);
  const byCement={};lots.forEach(l=>byCement[l.cementType]=(byCement[l.cementType]||0)+num(l.quantity));const max=Math.max(1,...Object.values(byCement));
  $('#mixChart').innerHTML=Object.keys(byCement).length?Object.entries(byCement).map(([k,v])=>`<div class="bar-group"><strong>${formatQty(v)}</strong><div class="bar" style="height:${Math.max(18,v/max*155)}px"></div><small>${esc(k)}</small></div>`).join(''):'<div class="empty">Os gráficos aparecerão após o cadastro dos lotes.</div>';
  const ready=lots.filter(l=>lotStatus(l)==='READY').length, curing=lots.length-ready;
  const late=pendingTasks().filter(t=>new Date(t.scheduledAt)<new Date()).length;
  $('#statusSummary').innerHTML=[['#c9841c','Em cura',curing],['#26765e','Cura concluída',ready],['#bf493b','Molhações atrasadas',late],['#1d5b4c','Terras cadastradas',APP.soils.filter(s=>!s.deletedAt).length]].map(x=>`<div class="summary-row"><i class="summary-dot" style="background:${x[0]}"></i><div><strong>${x[1]}</strong><span>Atualizado agora</span></div><b>${x[2]}</b></div>`).join('');
}
function lotProgressCard(l){const p=cureProgress(l),ready=p>=100;return `<article class="lot-card" data-lot="${esc(l.id)}"><div class="lot-card-top"><div><span class="lot-code">${esc(l.lotCode)}</span><span class="lot-responsible">${esc(l.responsible)}</span></div><span class="progress-number">${p}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${p}%"></div></div><div class="lot-meta"><span>${Math.min(dayDiff(l.manufacturedAt),num(l.cureDays))} de ${l.cureDays} dias</span><span>${ready?'Cura concluída':`${Math.max(0,num(l.cureDays)-dayDiff(l.manufacturedAt))} dias restantes`}</span></div></article>`;}

function renderLots(filter=$('#lotSearch')?.value||''){
  const q=filter.trim().toLowerCase();const lots=APP.lots.filter(l=>!l.deletedAt&&JSON.stringify(l).toLowerCase().includes(q)).sort((a,b)=>new Date(b.manufacturedAt)-new Date(a.manufacturedAt));
  $('#lotsTable').innerHTML=lots.map(l=>`<tr data-lot="${esc(l.id)}"><td><strong>${esc(l.lotCode)}</strong></td><td>${dateBR(l.manufacturedAt)}</td><td>${formatQty(l.quantity)}</td><td>${formatMix(l)}</td><td>${esc(l.responsible)}</td><td>${cureProgress(l)}%</td><td><div class="row-actions"><button class="mini-btn" data-print="${esc(l.id)}">Imprimir</button><button class="mini-btn delete" data-delete-lot="${esc(l.id)}">Excluir</button></div></td></tr>`).join('');
  $('#lotsCards').innerHTML=lots.length?lots.map(l=>`<article class="lot-list-card" data-lot="${esc(l.id)}"><div class="lot-list-card-head"><div><strong>${esc(l.lotCode)}</strong><small class="lot-responsible">${esc(l.responsible)}</small></div><span class="badge ${lotStatus(l)==='READY'?'ready':'active'}">${lotStatus(l)==='READY'?'Cura concluída':'Em cura'}</span></div><div class="lot-list-card-grid"><div><small>Fabricação</small><strong>${dateBR(l.manufacturedAt)}</strong></div><div><small>Quantidade</small><strong>${formatQty(l.quantity)}</strong></div><div><small>Cura</small><strong>${cureProgress(l)}% · ${l.cureDays} dias</strong></div><div><small>Terra</small><strong>${esc(l.soilName||l.soilId)}</strong></div></div><div class="lot-list-actions"><button class="mini-btn" data-print="${esc(l.id)}">Imprimir</button><button class="mini-btn delete" data-delete-lot="${esc(l.id)}">Excluir</button></div></article>`).join(''):'<div class="empty">Nenhum lote encontrado.</div>';
}

function classifyTask(t){const d=new Date(t.scheduledAt),now=new Date(),today=new Date(now);today.setHours(0,0,0,0);const tomorrow=new Date(today);tomorrow.setDate(today.getDate()+1);const after=new Date(tomorrow);after.setDate(tomorrow.getDate()+1);if(t.status==='DONE')return'completed';if(d<now)return'overdue';if(d<tomorrow)return'today';if(d<after)return'tomorrow';return'upcoming';}
function taskCards(tasks,compact=false){
  if(!tasks.length)return'<div class="empty">Nenhuma ação pendente.</div>';
  return tasks.map(t=>{const group=classifyTask(t),d=new Date(t.scheduledAt),day=d.toLocaleDateString('pt-BR',{day:'2-digit'}),mon=d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');return `<article class="task-card ${group}"><div class="task-date"><strong>${day}</strong><small>${mon}</small></div><div class="task-info"><strong>Molhação — ${esc(t.lotCode)}</strong><small>${dateBR(t.scheduledAt)} · ${esc(t.responsible||'Sem responsável')}</small></div>${t.status==='DONE'?'<span class="badge ready">Concluída</span>':`<button class="confirm-btn" data-confirm-task="${esc(t.id)}">Confirmar</button>`}</article>`}).join('');
}
function renderTasks(){
  const all=APP.tasks.filter(t=>!t.deletedAt).sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));
  const now=new Date();
  const open=all.filter(t=>String(t.status).toUpperCase()!=='DONE');
  const overdue=open.filter(t=>new Date(t.scheduledAt)<now&&new Date(t.scheduledAt).toDateString()!==now.toDateString());
  const today=open.filter(t=>new Date(t.scheduledAt).toDateString()===now.toDateString());
  const upcoming=open.filter(t=>new Date(t.scheduledAt)>now&&new Date(t.scheduledAt).toDateString()!==now.toDateString());
  const done=all.filter(t=>String(t.status).toUpperCase()==='DONE');

  $('#tasksHeroCount').textContent=open.length;
  $('#taskOverdueCount').textContent=overdue.length;
  $('#taskTodayCount').textContent=today.length;
  $('#taskUpcomingCount').textContent=upcoming.length;
  $('#taskDoneCount').textContent=done.length;

  const filtered=APP.taskFilter==='all'?all:APP.taskFilter==='done'?done:open;
  const groups={};
  filtered.forEach(t=>{
    const d=new Date(t.scheduledAt);
    let key;
    if(d.toDateString()===now.toDateString())key='Hoje';
    else{
      const tomorrow=new Date(now);tomorrow.setDate(now.getDate()+1);
      if(d.toDateString()===tomorrow.toDateString())key='Amanhã';
      else key=d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
    }
    (groups[key]??=[]).push(t);
  });

  $('#taskGroups').innerHTML=Object.entries(groups).map(([day,items])=>{
    const pending=items.filter(t=>String(t.status).toUpperCase()!=='DONE').length;
    return `<section class="task-day-institutional">
      <div class="task-day-heading"><div><span></span><h3>${day}</h3></div><small>${pending?pending+' pendente(s)':items.length+' concluída(s)'}</small></div>
      <div class="task-day-list">${taskItemsHtml(items)}</div>
    </section>`;
  }).join('')||'<div class="task-empty-institutional"><div>✓</div><strong>Nenhuma ação encontrada</strong><span>Altere o filtro ou aguarde novas tarefas.</span></div>';
}

function renderCatalogs(){
  const soils=APP.soils.filter(s=>!s.deletedAt);$('#soilsList').innerHTML=soils.length?soils.map(s=>`<article class="catalog-card"><h3>${esc(s.name)}</h3><p>${esc(s.origin)}</p><div class="catalog-facts"><div class="catalog-fact"><small>AREIA</small><strong>${formatQty(s.sandPct)}%</strong></div><div class="catalog-fact"><small>ARGILA</small><strong>${formatQty(s.clayPct)}%</strong></div></div>${s.notes?`<p style="margin-top:12px">${esc(s.notes)}</p>`:''}<div class="catalog-actions"><button class="mini-btn delete" data-delete-soil="${esc(s.id)}">Excluir</button></div></article>`).join(''):'<div class="empty">Cadastre a primeira terra para poder criar lotes.</div>';
  const plans=APP.plans.filter(p=>!p.deletedAt);$('#plansList').innerHTML=plans.length?plans.map(p=>`<article class="catalog-card"><h3>${esc(p.name)}</h3><p>${esc(p.description||'Sem descrição')}</p><div class="catalog-facts"><div class="catalog-fact"><small>DIAS</small><strong>${p.days}</strong></div><div class="catalog-fact"><small>HORÁRIOS</small><strong>${(p.times||[]).join(', ')||'Sem molhação'}</strong></div></div><div class="catalog-actions">${p.system?'<span class="badge ready">Predefinido</span>':`<button class="mini-btn delete" data-delete-plan="${esc(p.id)}">Excluir</button>`}</div></article>`).join(''):'<div class="empty">Nenhum plano de molhação cadastrado.</div>';
}
function fillSelects(){
  const soils=APP.soils.filter(s=>!s.deletedAt);$('#soilSelect').innerHTML='<option value="">Selecione uma terra</option>'+soils.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} — ${esc(s.origin)}</option>`).join('');
  const plans=APP.plans.filter(p=>!p.deletedAt);$('#wateringPlanSelect').innerHTML=plans.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');updateSoilInfo();
}
function updateSoilInfo(){const s=APP.soils.find(x=>x.id===$('#soilSelect').value);$('#soilInfo').textContent=s?`${s.sandPct}% areia · ${s.clayPct}% argila · ${s.origin}`:'As porcentagens vêm do catálogo.';}

async function submitLot(e){
  e.preventDefault();const form=e.currentTarget;const button=e.submitter;setBusy(button,true,'Salvando...');showLoading('Criando lote','Gerando o código, salvando o traço e programando a molhação.');
  try{
    const raw=Object.fromEntries(new FormData(form));
    const soil=APP.soils.find(s=>s.id===raw.soilId),plan=APP.plans.find(p=>p.id===raw.wateringPlanId);
    if(!soil)throw new Error('Selecione uma terra cadastrada.');if(!plan)throw new Error('Selecione um plano de molhação.');
    const lot={manufacturedAt:toISO(raw.manufacturedAt),quantity:num(raw.quantity),responsible:raw.responsible.trim(),soilId:soil.id,soilName:soil.name,soilOrigin:soil.origin,soilSandPct:num(soil.sandPct),soilClayPct:num(soil.clayPct),soilKg:num(raw.soilKg),sandKg:num(raw.sandKg),cementKg:num(raw.cementKg),cementType:raw.cementType,extraName:raw.extraName.trim(),extraQty:raw.extraQty===''?null:num(raw.extraQty),extraUnit:raw.extraUnit,moisturePct:raw.moisturePct===''?null:num(raw.moisturePct),wateringPlanId:plan.id,wateringPlanName:plan.name,wateringDays:num(plan.days),wateringTimes:plan.times,cureDays:num(raw.cureDays),notes:raw.notes.trim()};
    const created=await api('CREATE_LOT',{lot});APP.lots.unshift(created.lot);APP.tasks.push(...(created.tasks||[]));saveCache();renderAll();
    APP.lastCreatedId=created.lot.id;$('#lotDialog').close();form.reset();setDefaultDateTime();showCreated(created.lot);
  }catch(err){toast(err.message,true);}finally{hideLoading();setBusy(button,false);}
}
function showCreated(l){$('#createdContent').innerHTML=`<div class="created-box"><button type="button" class="icon created-close" data-close="createdDialog">×</button><div class="success-icon">✓</div><h2>Lote ${esc(l.lotCode)} criado</h2><p>O registro foi salvo na planilha e as molhações foram programadas.</p><div class="created-actions"><button class="primary" data-created-open="${esc(l.id)}">Abrir lote</button><button class="secondary" data-print="${esc(l.id)}">Imprimir</button><button class="danger ghost" data-delete-lot="${esc(l.id)}" data-close-after>Excluir lote</button></div></div>`;$('#createdDialog').showModal();}

async function submitSoil(e){e.preventDefault();const form=e.currentTarget;const b=e.submitter;setBusy(b,true,'Cadastrando...');showLoading('Criando terra','Salvando a origem e sua composição no catálogo.');try{const f=Object.fromEntries(new FormData(form));if(num(f.sandPct)+num(f.clayPct)>105)throw new Error('A soma de areia e argila parece inconsistente.');const soil=await api('CREATE_SOIL',{soil:{name:f.name.trim(),origin:f.origin.trim(),sandPct:num(f.sandPct),clayPct:num(f.clayPct),notes:f.notes.trim()}});APP.soils.push(soil);saveCache();renderAll();if(form&&typeof form.reset==='function')form.reset();const dlg=$('#soilDialog');if(dlg&&dlg.open)dlg.close();successAndClose('#soilDialog','Terra criada com sucesso.');}catch(err){toast(err.message,true)}finally{hideLoading();setBusy(b,false)}}
async function submitPlan(e){e.preventDefault();const form=e.currentTarget;const b=e.submitter;setBusy(b,true,'Criando...');showLoading('Criando plano de molhação','Gerando a programação personalizada.');try{const f=Object.fromEntries(new FormData(form));const times=f.times.split(',').map(x=>x.trim()).filter(Boolean);if(times.some(x=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))throw new Error('Use horários no formato 07:00, 12:00.');const plan=await api('CREATE_PLAN',{plan:{name:f.name.trim(),days:num(f.days),times,description:f.description.trim()}});APP.plans.push(plan);saveCache();renderAll();if(form&&typeof form.reset==='function')form.reset();const dlg=$('#planDialog');if(dlg&&dlg.open)dlg.close();successAndClose('#planDialog','Plano de molhação criado com sucesso.');}catch(err){toast(err.message,true)}finally{hideLoading();setBusy(b,false)}}
async function confirmTask(id){const t=APP.tasks.find(x=>x.id===id);if(!t)return;try{await api('CONFIRM_TASK',{taskId:id});t.status='DONE';t.completedAt=new Date().toISOString();t.completedBy=APP.user?.name||'';saveCache();renderAll();toast(`Molhação de ${t.lotCode} confirmada.`);}catch(err){toast(err.message,true)}}
async function deleteEntity(kind,id){
  const labels={LOT:'este lote e suas pendências',SOIL:'esta terra do catálogo',PLAN:'este plano personalizado'};if(!confirm(`Tem certeza que deseja excluir ${labels[kind]}? Essa ação ficará registrada na auditoria.`))return;
  try{await api('DELETE_ENTITY',{entity:kind,id});if(kind==='LOT'){const l=APP.lots.find(x=>x.id===id);if(l)l.deletedAt=new Date().toISOString();APP.tasks.filter(t=>t.lotId===id).forEach(t=>t.deletedAt=new Date().toISOString());$('#detailDialog').close();$('#createdDialog').close();}if(kind==='SOIL'){const x=APP.soils.find(s=>s.id===id);if(x)x.deletedAt=new Date().toISOString();}if(kind==='PLAN'){const x=APP.plans.find(p=>p.id===id);if(x)x.deletedAt=new Date().toISOString();}saveCache();renderAll();toast('Registro excluído.');}catch(err){toast(err.message,true)}
}

function showDetail(id){
  const l=APP.lots.find(x=>x.id===id&&!x.deletedAt);if(!l)return;
  const moisture=l.moisturePct===null||l.moisturePct===''?'Não informado':`${formatQty(l.moisturePct)}%`;
  $('#detailContent').innerHTML=`<div class="dialog-head"><div><p>RASTREABILIDADE DO LOTE</p><h2>${esc(l.lotCode)}</h2><small>Criado em ${dateBR(l.createdAt||l.manufacturedAt)}</small></div><button class="icon" data-close="detailDialog">×</button></div><div class="detail-top"><span class="badge ${lotStatus(l)==='READY'?'ready':'active'}">${lotStatus(l)==='READY'?'Cura concluída':'Em cura · '+cureProgress(l)+'%'}</span><div class="detail-actions"><button class="secondary" data-print="${esc(l.id)}">Imprimir</button><button class="danger ghost" data-delete-lot="${esc(l.id)}">Excluir</button></div></div><div class="detail-grid"><div class="detail-cell"><small>Fabricação</small><strong>${dateBR(l.manufacturedAt)}</strong></div><div class="detail-cell"><small>Quantidade</small><strong>${formatQty(l.quantity)} tijolos</strong></div><div class="detail-cell"><small>Responsável</small><strong>${esc(l.responsible)}</strong></div><div class="detail-cell"><small>Terra / origem</small><strong>${esc(l.soilName)} · ${esc(l.soilOrigin)}</strong></div><div class="detail-cell"><small>Umidade</small><strong>${moisture}</strong></div><div class="detail-cell"><small>Cura programada</small><strong>${l.cureDays} dias · até ${dateBR(cureEnd(l).toISOString(),false)}</strong></div><div class="detail-cell"><small>Molhação</small><strong>${esc(l.wateringPlanName)}</strong></div><div class="detail-cell"><small>Composição da terra</small><strong>${formatQty(l.soilSandPct)}% areia · ${formatQty(l.soilClayPct)}% argila</strong></div><div class="detail-cell"><small>Observações</small><strong>${esc(l.notes||'Sem observações')}</strong></div></div><div class="mix-box"><h3>Traço utilizado</h3><div class="mix-list"><div class="mix-item"><span>Terra</span><strong>${formatQty(l.soilKg)} kg</strong></div><div class="mix-item"><span>Areia adicionada</span><strong>${formatQty(l.sandKg)} kg</strong></div><div class="mix-item"><span>Cimento ${esc(l.cementType)}</span><strong>${formatQty(l.cementKg)} kg</strong></div>${l.extraName?`<div class="mix-item"><span>${esc(l.extraName)}</span><strong>${formatQty(l.extraQty)} ${esc(l.extraUnit)}</strong></div>`:''}</div></div>`;
  $('#detailDialog').showModal();
}
function printLot(id){
  const l=APP.lots.find(x=>x.id===id);if(!l)return;const extra=l.extraName?`<tr><td>${esc(l.extraName)}</td><td>${formatQty(l.extraQty)} ${esc(l.extraUnit)}</td></tr>`:'';
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(l.lotCode)}</title><style>body{font-family:Arial,sans-serif;color:#17231f;margin:35px}header{border-bottom:3px solid #123f35;padding-bottom:15px;margin-bottom:25px}h1{margin:0;font-size:28px;color:#123f35}small{color:#66756f}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:22px}.cell{border:1px solid #dbe3df;border-radius:8px;padding:11px}.cell span,.cell strong{display:block}.cell span{font-size:10px;text-transform:uppercase;color:#687771;margin-bottom:5px}table{border-collapse:collapse;width:100%;margin-top:10px}th,td{border:1px solid #ccd8d3;padding:10px;text-align:left}th{background:#edf4f1}h2{font-size:17px;margin-top:24px}.note{border:1px solid #dbe3df;padding:12px;min-height:50px}@media print{button{display:none}}</style></head><body><header><h1>Ficha do lote ${esc(l.lotCode)}</h1><small>TerraLote — Controle de produção</small></header><div class="grid"><div class="cell"><span>Data e hora de fabricação</span><strong>${dateBR(l.manufacturedAt)}</strong></div><div class="cell"><span>Quantidade</span><strong>${formatQty(l.quantity)} tijolos</strong></div><div class="cell"><span>Responsável</span><strong>${esc(l.responsible)}</strong></div><div class="cell"><span>Terra / origem</span><strong>${esc(l.soilName)} — ${esc(l.soilOrigin)}</strong></div><div class="cell"><span>Composição da terra</span><strong>${formatQty(l.soilSandPct)}% areia · ${formatQty(l.soilClayPct)}% argila</strong></div><div class="cell"><span>Umidade</span><strong>${l.moisturePct===null?'Não informado':formatQty(l.moisturePct)+'%'}</strong></div><div class="cell"><span>Plano de molhação</span><strong>${esc(l.wateringPlanName)}</strong></div><div class="cell"><span>Cura programada</span><strong>${l.cureDays} dias</strong></div></div><h2>Traço utilizado</h2><table><thead><tr><th>Material</th><th>Quantidade</th></tr></thead><tbody><tr><td>Terra</td><td>${formatQty(l.soilKg)} kg</td></tr><tr><td>Areia adicionada</td><td>${formatQty(l.sandKg)} kg</td></tr><tr><td>Cimento ${esc(l.cementType)}</td><td>${formatQty(l.cementKg)} kg</td></tr>${extra}</tbody></table><h2>Observações</h2><div class="note">${esc(l.notes||'')}</div><script>window.onload=()=>window.print()<\/script></body></html>`;
  const w=window.open('','_blank');if(!w){toast('O navegador bloqueou a impressão. Permita pop-ups para este site.',true);return;}w.document.write(html);w.document.close();
}
async function requestCredentialCode(){const b=$('#sendCodeBtn');$('#passwordMessage').textContent='';setBusy(b,true,'Enviando...');try{await api('REQUEST_CREDENTIAL_CODE');$('#passwordMessage').style.color='var(--success)';$('#passwordMessage').textContent='Código enviado para o e-mail administrativo. Ele vale por 10 minutos.';}catch(err){$('#passwordMessage').style.color='var(--danger)';$('#passwordMessage').textContent=err.message}finally{setBusy(b,false)}}
async function changePassword(e){
  e.preventDefault();const form=e.currentTarget;const b=e.submitter,f=Object.fromEntries(new FormData(form));$('#passwordMessage').textContent='';
  if(f.newPassword!==f.confirmPassword){$('#passwordMessage').textContent='As novas senhas não coincidem.';return}
  setBusy(b,true,'Alterando...');showLoading('Alterando seu acesso','Validando o código e protegendo as novas credenciais.');
  try{
    await api('CHANGE_CREDENTIALS',{newUsername:f.newUsername.trim(),newPassword:f.newPassword,verificationCode:f.verificationCode.trim()});
    form.reset();closeDialog('#accountDialog');toast('Login e senha alterados com sucesso. Entre novamente com os novos dados.');
    setTimeout(()=>logout(false),700);
  }catch(err){$('#passwordMessage').style.color='var(--danger)';$('#passwordMessage').textContent=err.message}
  finally{hideLoading();setBusy(b,false)}
}



function dashboardVisibleLots(){
  const days=Number(APP.dashboardPeriod||30);
  const cutoff=new Date(Date.now()-days*86400000);
  const filtered=APP.lots.filter(l=>!l.deletedAt&&new Date(l.manufacturedAt)>=cutoff);
  return filtered.length?filtered:APP.lots.filter(l=>!l.deletedAt);
}
function productionSeries(lots=dashboardVisibleLots()){
  const groups={};
  lots.forEach(l=>{
    const d=new Date(l.manufacturedAt);if(Number.isNaN(d.getTime()))return;
    const key=d.toISOString().slice(0,10);
    groups[key]=(groups[key]||0)+num(l.quantity);
  });
  return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b));
}
function monthSeries(lots=APP.lots.filter(l=>!l.deletedAt)){
  const groups={};
  lots.forEach(l=>{
    const d=new Date(l.manufacturedAt);if(Number.isNaN(d.getTime()))return;
    const key=d.toISOString().slice(0,7);
    groups[key]=(groups[key]||0)+num(l.quantity);
  });
  return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).slice(-12);
}
function shortDateLabel(iso){
  const d=new Date(iso+'T12:00:00');return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(d).replace('.','');
}
function svgAreaChart(series,width=760,height=250){
  if(!series.length)return '<div class="chart-empty">Ainda não há produção registrada neste período.</div>';
  const values=series.map(x=>x[1]),max=Math.max(...values,1),min=0;
  const pad={l:54,r:20,t:18,b:40},iw=width-pad.l-pad.r,ih=height-pad.t-pad.b;
  const points=series.map((x,i)=>{
    const px=pad.l+(series.length===1?iw/2:i*iw/(series.length-1));
    const py=pad.t+ih-(x[1]-min)/(max-min||1)*ih;
    return [px,py];
  });
  const line=points.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=`M ${points[0][0]} ${pad.t+ih} `+points.map(p=>`L ${p[0]} ${p[1]}`).join(' ')+` L ${points[points.length-1][0]} ${pad.t+ih} Z`;
  const grid=[0,.25,.5,.75,1].map(f=>{
    const y=pad.t+ih-f*ih,v=Math.round(max*f);
    return `<line x1="${pad.l}" y1="${y}" x2="${width-pad.r}" y2="${y}" class="chart-grid-line"/><text x="${pad.l-10}" y="${y+4}" text-anchor="end" class="chart-axis-text">${formatQty(v)}</text>`;
  }).join('');
  const step=Math.max(1,Math.ceil(series.length/6));
  const labels=series.map((x,i)=>i%step===0||i===series.length-1?`<text x="${points[i][0]}" y="${height-12}" text-anchor="middle" class="chart-axis-text">${shortDateLabel(x[0])}</text>`:'').join('');
  const dots=points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" class="chart-dot"><title>${shortDateLabel(series[i][0])}: ${formatQty(series[i][1])} tijolos</title></circle>`).join('');
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de produção">
    <defs><linearGradient id="productionAreaGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2f7d69" stop-opacity=".32"/><stop offset="100%" stop-color="#2f7d69" stop-opacity=".02"/></linearGradient></defs>
    ${grid}<path d="${area}" fill="url(#productionAreaGradient)"/><path d="${line}" class="chart-main-line"/>${dots}${labels}
  </svg>`;
}
function svgDonut(items,total,size=210){
  const radius=72,circ=2*Math.PI*radius,center=size/2;
  let offset=0;
  const arcs=items.map(item=>{
    const value=Math.max(0,item.value),len=total?value/total*circ:0;
    const circle=`<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${item.color}" stroke-width="18" stroke-dasharray="${len} ${circ-len}" stroke-dashoffset="${-offset}" stroke-linecap="round"/>`;
    offset+=len;return circle;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" class="donut-svg">${arcs}<text x="${center}" y="${center-2}" text-anchor="middle" class="donut-total">${total}</text><text x="${center}" y="${center+22}" text-anchor="middle" class="donut-label">lotes</text></svg>`;
}
function svgGauge(value){
  const pct=Math.max(0,Math.min(100,Math.round(value))),r=74,circ=Math.PI*r;
  const filled=circ*pct/100;
  return `<svg viewBox="0 0 210 125" class="gauge-svg">
    <path d="M 31 103 A 74 74 0 0 1 179 103" pathLength="${circ}" class="gauge-track"/>
    <path d="M 31 103 A 74 74 0 0 1 179 103" pathLength="${circ}" class="gauge-value" stroke-dasharray="${filled} ${circ-filled}"/>
    <text x="105" y="82" text-anchor="middle" class="gauge-number">${pct}%</text>
    <text x="105" y="105" text-anchor="middle" class="gauge-caption">progresso médio</text>
  </svg>`;
}
function taskItemsHtml(tasks){
  return tasks.map(t=>{
    const done=String(t.status).toUpperCase()==='DONE';
    const due=new Date(t.scheduledAt), now=new Date();
    const overdue=!done&&due<now;
    const today=!done&&due.toDateString()===now.toDateString();
    const state=done?'done':overdue?'overdue':today?'today':'upcoming';
    const stateLabel=done?'Concluída':overdue?'Atrasada':today?'Hoje':'Programada';
    return `<article class="task-card-institutional ${state}">
      <div class="task-state-rail"></div>
      <div class="task-date-block"><strong>${String(due.getDate()).padStart(2,'0')}</strong><span>${due.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</span><small>${due.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small></div>
      <div class="task-main-info">
        <div class="task-title-row"><span class="task-status-label ${state}">${stateLabel}</span><strong>Molhação — ${esc(t.lotCode)}</strong></div>
        <p>${esc(t.responsible||'Responsável não informado')}</p>
        <small>Confirmação operacional vinculada ao lote</small>
      </div>
      <div class="task-action-area">
        ${done?'<span class="task-completed-check">✓ Confirmada</span>':`<button class="task-confirm-button" data-confirm-task="${esc(t.id)}">Confirmar execução</button>`}
      </div>
    </article>`;
  }).join('')||'<div class="task-empty-institutional"><div>✓</div><strong>Nenhuma ação nesta categoria</strong><span>Quando houver novas tarefas, elas aparecerão aqui.</span></div>';
}
function renderDashboard(){
  const visible=APP.lots.filter(l=>!l.deletedAt), periodLots=dashboardVisibleLots();
  const active=visible.filter(l=>lotStatus(l)!=='COMPLETED').length;
  const priority=APP.tasks.filter(t=>!t.deletedAt&&String(t.status).toUpperCase()!=='DONE'&&new Date(t.scheduledAt)<=new Date(Date.now()+86400000)).length;
  const completed=visible.filter(l=>lotStatus(l)==='COMPLETED').length;
  const completionRate=visible.length?Math.round(completed/visible.length*100):0;
  const totalQty=visible.reduce((s,l)=>s+num(l.quantity),0);
  $('#kpiActive').textContent=active;$('#kpiPending').textContent=priority;$('#kpiBricks').textContent=formatQty(totalQty);$('#kpiCompletion').textContent=completionRate+'%';
  $('#navPendingBadge').textContent=APP.tasks.filter(t=>!t.deletedAt&&String(t.status).toUpperCase()!=='DONE').length;

  const series=productionSeries(periodLots), periodTotal=periodLots.reduce((s,l)=>s+num(l.quantity),0);
  const averageLot=periodLots.length?periodTotal/periodLots.length:0, peak=Math.max(0,...periodLots.map(l=>num(l.quantity)));
  $('#productionPeriodTotal').textContent=formatQty(periodTotal);$('#productionLotAverage').textContent=formatQty(averageLot);$('#productionPeak').textContent=formatQty(peak);
  $('#productionChart').innerHTML=svgAreaChart(series);

  const overdue=visible.filter(l=>lotStatus(l)==='OVERDUE').length,curing=visible.length-completed-overdue;
  const statusItems=[
    {label:'Concluídos',value:completed,color:'#2f7d69'},
    {label:'Em andamento',value:curing,color:'#d3a448'},
    {label:'Com pendência',value:overdue,color:'#bd5546'}
  ];
  $('#statusChart').innerHTML=`<div class="status-donut-layout">${svgDonut(statusItems,visible.length)}<div class="status-legend">${statusItems.map(x=>`<div><i style="background:${x.color}"></i><span>${x.label}</span><strong>${x.value}</strong></div>`).join('')}</div></div>`;

  const progressAvg=visible.length?visible.reduce((s,l)=>s+lotOverallProgress(l),0)/visible.length:0;
  $('#completionGauge').innerHTML=`${svgGauge(progressAvg)}<div class="gauge-footer"><span><i class="dot-success"></i>${completed} concluído(s)</span><span><i class="dot-warning"></i>${active} em curso</span></div>`;

  const cements={};visible.forEach(l=>cements[l.cementType||'Não informado']=(cements[l.cementType||'Não informado']||0)+num(l.quantity));
  const cementRows=Object.entries(cements).sort((a,b)=>b[1]-a[1]),maxCement=Math.max(1,...cementRows.map(x=>x[1]));
  $('#mixChart').innerHTML=cementRows.slice(0,5).map(([name,value])=>`<div class="hbar-row"><div class="hbar-label"><span>${esc(name)}</span><strong>${formatQty(value)}</strong></div><div class="hbar-track"><i style="width:${value/maxCement*100}%"></i></div><small>${totalQty?Math.round(value/totalQty*100):0}% do total</small></div>`).join('')||'<div class="chart-empty">Sem dados de cimento.</div>';

  const dates=visible.map(l=>new Date(l.manufacturedAt).getTime()).filter(Number.isFinite),days=dates.length?Math.max(1,(Math.max(...dates)-Math.min(...dates))/86400000+1):1;
  const daily=totalQty/days,weekly=daily*7;
  const pendingTotal=APP.tasks.filter(t=>!t.deletedAt&&String(t.status).toUpperCase()!=='DONE').length;
  $('#averageProduction').innerHTML=`
    <div class="productivity-main"><small>Média diária</small><strong>${formatQty(daily)}</strong><span>tijolos por dia</span></div>
    <div class="productivity-row"><div><small>Média semanal</small><strong>${formatQty(weekly)}</strong></div><div><small>Lotes no período</small><strong>${periodLots.length}</strong></div></div>
    <div class="productivity-note"><span>${pendingTotal}</span> ação(ões) ainda aguardam confirmação</div>`;

  $('#lotProgress').innerHTML=visible.slice(0,6).map(l=>`<article class="traceability-card status-${lotStatus(l).toLowerCase()}" data-lot="${esc(l.id)}">
    <div class="traceability-top"><div><span class="traceability-code">${esc(l.lotCode)}</span><strong>${esc(l.responsible)}</strong></div><span class="badge ${lotStatus(l).toLowerCase()}">${lotStatusLabel(l)}</span></div>
    <div class="traceability-progress-head"><span>Progresso consolidado</span><b>${lotOverallProgress(l)}%</b></div>
    <div class="traceability-progress"><i style="width:${lotOverallProgress(l)}%"></i></div>
    <div class="traceability-metrics"><div><small>Cura</small><strong>${dayDiff(l.manufacturedAt)}/${l.cureDays} dias</strong></div><div><small>Pendências</small><strong>${pendingLotTasks(l).length}</strong></div><div><small>Produção</small><strong>${formatQty(l.quantity)}</strong></div></div>
  </article>`).join('')||'<div class="empty">Nenhum lote cadastrado.</div>';

  const urgent=APP.tasks.filter(t=>!t.deletedAt&&String(t.status).toUpperCase()!=='DONE').sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt)).slice(0,5);
  $('#nextTasks').innerHTML=urgent.map(t=>{
    const due=new Date(t.scheduledAt),late=due<new Date();
    return `<article class="priority-card ${late?'overdue':'scheduled'}">
      <div class="priority-marker"></div>
      <div class="priority-time"><strong>${due.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</strong><span>${due.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','')}</span></div>
      <div class="priority-content"><span>${late?'Atrasada':'Programada'}</span><strong>${esc(t.lotCode)}</strong><small>${esc(t.responsible||'')}</small></div>
      <button data-confirm-task="${esc(t.id)}" aria-label="Confirmar">✓</button>
    </article>`;
  }).join('')||'<div class="priority-empty"><span>✓</span><strong>Nenhuma prioridade aberta</strong><small>As próximas ações aparecerão aqui.</small></div>';
}
function renderTasks(){
  const all=APP.tasks.filter(t=>!t.deletedAt).sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));
  const filtered=APP.taskFilter==='all'?all:APP.taskFilter==='done'?all.filter(t=>String(t.status).toUpperCase()==='DONE'):all.filter(t=>String(t.status).toUpperCase()!=='DONE');
  const groups={};filtered.forEach(t=>{const key=new Date(t.scheduledAt).toLocaleDateString('pt-BR');(groups[key]??=[]).push(t)});
  $('#taskGroups').innerHTML=Object.entries(groups).map(([day,items])=>`<section class="task-day"><div class="task-day-head"><h3>${day}</h3><span>${items.length} ação(ões)</span></div>${taskItemsHtml(items)}</section>`).join('')||'<div class="empty">Nenhuma tarefa encontrada.</div>';
}
function renderLots(filter=$('#lotSearch')?.value||''){
  const q=String(filter).toLowerCase(),rows=APP.lots.filter(l=>!l.deletedAt&&JSON.stringify(l).toLowerCase().includes(q));
  $('#lotsCards').innerHTML=rows.map(l=>`<article class="lot-mobile-card status-${lotStatus(l).toLowerCase()}" data-lot="${esc(l.id)}"><div><strong>${esc(l.lotCode)}</strong><small>${dateBR(l.manufacturedAt)}</small></div><span class="badge ${lotStatus(l).toLowerCase()}">${lotStatusLabel(l)}</span><div class="mobile-progress"><i style="width:${lotOverallProgress(l)}%"></i></div><p>${formatQty(l.quantity)} tijolos · ${lotOverallProgress(l)}%</p></article>`).join('')||'<div class="empty">Nenhum lote encontrado.</div>';
  $('#lotsTable').innerHTML=rows.map(l=>`<tr data-lot="${esc(l.id)}"><td><strong>${esc(l.lotCode)}</strong></td><td>${dateBR(l.manufacturedAt)}</td><td>${formatQty(l.quantity)}</td><td>${formatMix(l)}</td><td>${esc(l.responsible)}</td><td><span class="badge ${lotStatus(l).toLowerCase()}">${lotStatusLabel(l)}</span></td><td><div class="table-progress"><i style="width:${lotOverallProgress(l)}%"></i><b>${lotOverallProgress(l)}%</b></div></td><td><button class="secondary" data-print="${esc(l.id)}">Imprimir</button></td></tr>`).join('');
}
function analyticsDialogShell(kicker,title,subtitle,body){
  return `<div class="analytics-dialog-head"><div><p>${kicker}</p><h2>${title}</h2><span>${subtitle}</span></div><button class="icon" data-close="chartDialog">×</button></div><div class="analytics-dialog-body">${body}</div>`;
}
function openChartDetail(type){
  const visible=APP.lots.filter(l=>!l.deletedAt),periodLots=dashboardVisibleLots();
  let content='';
  if(type==='production'){
    const monthly=monthSeries(),total=monthly.reduce((s,x)=>s+x[1],0),best=monthly.reduce((a,b)=>!a||b[1]>a[1]?b:a,null);
    content=analyticsDialogShell('ANÁLISE DE PRODUÇÃO','Histórico de produção','Volumes agrupados por mês de fabricação.',`
      <div class="dialog-kpis"><div><small>Total exibido</small><strong>${formatQty(total)}</strong><span>tijolos</span></div><div><small>Melhor mês</small><strong>${best?best[0]:'—'}</strong><span>${best?formatQty(best[1])+' tijolos':'sem dados'}</span></div><div><small>Lotes analisados</small><strong>${visible.length}</strong><span>registros</span></div></div>
      <div class="dialog-chart">${svgAreaChart(monthly.map(([m,v])=>[m+'-01',v]),900,310)}</div>
      <div class="analytics-table"><div class="analytics-table-head"><span>Período</span><span>Produção</span><span>Participação</span></div>${monthly.slice().reverse().map(([m,v])=>`<div><span>${m}</span><strong>${formatQty(v)} tijolos</strong><span>${total?Math.round(v/total*100):0}%</span></div>`).join('')}</div>`);
  }else if(type==='status'){
    const groups={COMPLETED:[],CURING:[],OVERDUE:[]};visible.forEach(l=>groups[lotStatus(l)].push(l));
    const items=[{label:'Concluídos',value:groups.COMPLETED.length,color:'#2f7d69'},{label:'Em andamento',value:groups.CURING.length,color:'#d3a448'},{label:'Com pendência',value:groups.OVERDUE.length,color:'#bd5546'}];
    content=analyticsDialogShell('SITUAÇÃO DOS LOTES','Controle operacional','Status calculado pela cura e pelas molhações.',`
      <div class="dialog-status-overview">${svgDonut(items,visible.length,240)}<div class="dialog-status-cards">${items.map(i=>`<div><i style="background:${i.color}"></i><span>${i.label}</span><strong>${i.value}</strong></div>`).join('')}</div></div>
      <div class="analytics-list">${visible.map(l=>`<button type="button" data-lot="${esc(l.id)}"><div><strong>${esc(l.lotCode)}</strong><span>${esc(l.responsible)} · ${formatQty(l.quantity)} tijolos</span></div><div><span class="badge ${lotStatus(l).toLowerCase()}">${lotStatusLabel(l)}</span><b>${lotOverallProgress(l)}%</b></div></button>`).join('')||'<div class="chart-empty">Nenhum lote cadastrado.</div>'}</div>`);
  }else if(type==='cement'){
    const groups={};visible.forEach(l=>groups[l.cementType||'Não informado']=(groups[l.cementType||'Não informado']||0)+num(l.quantity));
    const rows=Object.entries(groups).sort((a,b)=>b[1]-a[1]),total=rows.reduce((s,x)=>s+x[1],0),max=Math.max(1,...rows.map(x=>x[1]));
    content=analyticsDialogShell('COMPOSIÇÃO DE PRODUÇÃO','Tipos de cimento utilizados','Participação de cada cimento no volume produzido.',`
      <div class="dialog-horizontal-bars">${rows.map(([name,value])=>`<div class="dialog-hbar"><div><span>${esc(name)}</span><strong>${formatQty(value)} tijolos</strong></div><div class="hbar-track"><i style="width:${value/max*100}%"></i></div><small>${total?Math.round(value/total*100):0}% da produção acumulada</small></div>`).join('')||'<div class="chart-empty">Sem dados de cimento.</div>'}</div>`);
  }else if(type==='completion'){
    const avg=visible.length?visible.reduce((s,l)=>s+lotOverallProgress(l),0)/visible.length:0;
    content=analyticsDialogShell('DESEMPENHO OPERACIONAL','Progresso dos lotes','Indicador combinado de cura e molhações confirmadas.',`
      <div class="dialog-gauge">${svgGauge(avg)}</div><div class="analytics-list">${visible.sort((a,b)=>lotOverallProgress(b)-lotOverallProgress(a)).map(l=>`<button type="button" data-lot="${esc(l.id)}"><div><strong>${esc(l.lotCode)}</strong><span>${dayDiff(l.manufacturedAt)} de ${l.cureDays} dias · ${pendingLotTasks(l).length} pendência(s)</span></div><div class="dialog-mini-progress"><i style="width:${lotOverallProgress(l)}%"></i></div><b>${lotOverallProgress(l)}%</b></button>`).join('')}</div>`);
  }else{
    const total=visible.reduce((s,l)=>s+num(l.quantity),0),dates=visible.map(l=>new Date(l.manufacturedAt).getTime()).filter(Number.isFinite),days=dates.length?Math.max(1,(Math.max(...dates)-Math.min(...dates))/86400000+1):1;
    content=analyticsDialogShell('PRODUTIVIDADE','Indicadores de produção','Médias calculadas a partir do histórico cadastrado.',`
      <div class="dialog-kpis"><div><small>Média diária</small><strong>${formatQty(total/days)}</strong><span>tijolos</span></div><div><small>Média semanal</small><strong>${formatQty(total/days*7)}</strong><span>tijolos</span></div><div><small>Média por lote</small><strong>${formatQty(visible.length?total/visible.length:0)}</strong><span>tijolos</span></div></div>
      <div class="analytics-note"><strong>Como interpretar</strong><p>Esses indicadores consideram as datas de fabricação dos lotes já registrados. A precisão aumenta à medida que o histórico de produção se torna mais completo.</p></div>`);
  }
  $('#chartDetailContent').innerHTML=content;$('#chartDialog').showModal();
}

async function requestForgotCode(){
  const b=$('#forgotSendCodeBtn');
  $('#forgotMessage').textContent='';
  setBusy(b,true,'Enviando...');
  showLoading('Enviando código','Aguarde a confirmação do servidor.');
  try{
    await api('REQUEST_PASSWORD_RESET_CODE');
    $('#forgotMessage').style.color='var(--success)';
    $('#forgotMessage').textContent='Código enviado. Verifique o e-mail administrativo.';
  }catch(err){
    $('#forgotMessage').style.color='var(--danger)';
    $('#forgotMessage').textContent=err.message;
  }finally{
    hideLoading();setBusy(b,false);
  }
}

async function resetForgotPassword(e){
  e.preventDefault();
  const form=e.currentTarget,b=e.submitter,f=Object.fromEntries(new FormData(form));
  $('#forgotMessage').textContent='';
  if(f.newPassword!==f.confirmPassword){
    $('#forgotMessage').textContent='As senhas informadas não coincidem.';
    return;
  }
  setBusy(b,true,'Redefinindo...');
  showLoading('Redefinindo o acesso','Validando o código de segurança.');
  try{
    await api('RESET_PASSWORD_WITH_CODE',{
      newUsername:f.newUsername.trim(),
      newPassword:f.newPassword,
      verificationCode:f.verificationCode.trim()
    });
    form.reset();
    closeDialog('#forgotDialog');
    toast('Acesso redefinido. Entre com o novo usuário e a nova senha.');
  }catch(err){
    $('#forgotMessage').style.color='var(--danger)';
    $('#forgotMessage').textContent=err.message;
  }finally{
    hideLoading();setBusy(b,false);
  }
}

function setDefaultDateTime(){
  const d=new Date();
  const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  const field=$('#lotForm [name=manufacturedAt]');
  if(field)field.value=local;
}

function navigate(view){
  $$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  $$('.view').forEach(x=>x.classList.toggle('active',x.id===view));
  const btn=$(`.nav[data-view="${view}"]`);
  $('#pageTitle').textContent=btn?btn.textContent.replace(/\d+/g,'').trim():'TerraLote';
  $('#sidebar').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}

function connection(){
  const on=navigator.onLine;
  $('#connectionDot').style.background=on?'#63d39c':'#e4a93f';
  $('#connectionText').textContent=on?'Online · dados sincronizados':'Offline · usando dados salvos';
  if(on&&APP.token)bootstrap().catch(()=>{});
}

function bindEvents(){
  $('#loginForm')?.addEventListener('submit',login);
  $('#forgotForm')?.addEventListener('submit',resetForgotPassword);
  $('#sendCodeBtn')?.addEventListener('click',requestCredentialCode);
  $('#forgotSendCodeBtn')?.addEventListener('click',requestForgotCode);
  $('#forgotPasswordBtn').onclick=()=>$('#forgotDialog').showModal();
  $('#lotForm')?.addEventListener('submit',submitLot);
  $('#soilForm')?.addEventListener('submit',submitSoil);
  $('#planForm')?.addEventListener('submit',submitPlan);
  $('#passwordForm')?.addEventListener('submit',changePassword);

  $('#newLotBtn').onclick=()=>{setDefaultDateTime();$('#lotDialog').showModal()};
  $('#newSoilBtn').onclick=()=>$('#soilDialog').showModal();
  $('#newPlanBtn').onclick=()=>$('#planDialog').showModal();
  $('#accountBtn').onclick=()=>$('#accountDialog').showModal();
  $('#logoutBtn').onclick=()=>logout();
  $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
  $('#soilSelect').onchange=updateSoilInfo;
  $('#lotSearch').oninput=e=>renderLots(e.target.value);

  $$('.nav').forEach(b=>b.onclick=()=>navigate(b.dataset.view));
  $$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$('.tab').forEach(b=>b.onclick=()=>{
    $$('.tab').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    $$('.tab-panel').forEach(x=>x.classList.remove('active'));
    $('#'+b.dataset.tab+'Tab').classList.add('active');
  });

  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close]');
    if(close){document.getElementById(close.dataset.close)?.close();return;}

    const tf=e.target.closest('[data-task-filter]');
    if(tf){
      APP.taskFilter=tf.dataset.taskFilter;
      $$('[data-task-filter]').forEach(x=>x.classList.toggle('active',x===tf));
      renderTasks();return;
    }

    const chart=e.target.closest('[data-chart]');
    if(chart){openChartDetail(chart.dataset.chart);return;}
    const period=e.target.closest('[data-period]');
    if(period){APP.dashboardPeriod=Number(period.dataset.period);$$('[data-period]').forEach(x=>x.classList.toggle('active',x===period));renderDashboard();return;}
    const curePreset=e.target.closest('[data-cure-days]');
    if(curePreset){const field=$('#cureDaysInput');if(field){field.value=curePreset.dataset.cureDays;field.focus();}return;}

    const print=e.target.closest('[data-print]');
    if(print){e.stopPropagation();printLot(print.dataset.print);return;}

    const delLot=e.target.closest('[data-delete-lot]');
    if(delLot){e.stopPropagation();deleteEntity('LOT',delLot.dataset.deleteLot);return;}

    const delSoil=e.target.closest('[data-delete-soil]');
    if(delSoil){deleteEntity('SOIL',delSoil.dataset.deleteSoil);return;}

    const delPlan=e.target.closest('[data-delete-plan]');
    if(delPlan){deleteEntity('PLAN',delPlan.dataset.deletePlan);return;}

    const conf=e.target.closest('[data-confirm-task]');
    if(conf){confirmTask(conf.dataset.confirmTask);return;}

    const created=e.target.closest('[data-created-open]');
    if(created){$('#createdDialog').close();showDetail(created.dataset.createdOpen);return;}

    const lot=e.target.closest('[data-lot]');
    if(lot)showDetail(lot.dataset.lot);
  });

  window.addEventListener('online',connection);
  window.addEventListener('offline',connection);
}

async function init(){
  bindEvents();connection();setDefaultDateTime();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  if(APP.token){showApp();if(loadCache())renderAll();try{await bootstrap()}catch(err){logout(false);$('#loginMessage').textContent='Sua sessão expirou. Entre novamente.';}}
}
init();
