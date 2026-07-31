window.TERRALOTE_FRONTEND_VERSION='2.0.5';
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
  taskFilter: 'open', lastCreatedId: null, loadingCount: 0
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
  let tasks=APP.tasks.filter(t=>!t.deletedAt);if(APP.taskFilter==='open')tasks=tasks.filter(t=>t.status!=='DONE');tasks.sort((a,b)=>new Date(a.scheduledAt)-new Date(b.scheduledAt));
  const groups=[['overdue','Atrasadas'],['today','Hoje'],['tomorrow','Amanhã'],['upcoming','Próximos dias'],['completed','Concluídas']];
  $('#taskGroups').innerHTML=groups.map(([key,title])=>{const list=tasks.filter(t=>classifyTask(t)===key);if(!list.length)return'';return `<section class="task-group ${key}"><div class="task-group-title"><h3>${title}</h3><span>${list.length}</span></div><div class="task-list">${taskCards(list)}</div></section>`}).join('')||'<div class="empty">Nenhuma pendência para exibir.</div>';
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
  e.preventDefault();const form=e.currentTarget;const button=e.submitter;setBusy(button,true,'Salvando...');
  try{
    const raw=Object.fromEntries(new FormData(form));
    const soil=APP.soils.find(s=>s.id===raw.soilId),plan=APP.plans.find(p=>p.id===raw.wateringPlanId);
    if(!soil)throw new Error('Selecione uma terra cadastrada.');if(!plan)throw new Error('Selecione um plano de molhação.');
    const lot={manufacturedAt:toISO(raw.manufacturedAt),quantity:num(raw.quantity),responsible:raw.responsible.trim(),soilId:soil.id,soilName:soil.name,soilOrigin:soil.origin,soilSandPct:num(soil.sandPct),soilClayPct:num(soil.clayPct),soilKg:num(raw.soilKg),sandKg:num(raw.sandKg),cementKg:num(raw.cementKg),cementType:raw.cementType,extraName:raw.extraName.trim(),extraQty:raw.extraQty===''?null:num(raw.extraQty),extraUnit:raw.extraUnit,moisturePct:raw.moisturePct===''?null:num(raw.moisturePct),wateringPlanId:plan.id,wateringPlanName:plan.name,wateringDays:num(plan.days),wateringTimes:plan.times,cureDays:num(raw.cureDays),notes:raw.notes.trim()};
    const created=await api('CREATE_LOT',{lot});APP.lots.unshift(created.lot);APP.tasks.push(...(created.tasks||[]));saveCache();renderAll();
    APP.lastCreatedId=created.lot.id;$('#lotDialog').close();form.reset();setDefaultDateTime();showCreated(created.lot);
  }catch(err){toast(err.message,true);}finally{setBusy(button,false);}
}
function showCreated(l){$('#createdContent').innerHTML=`<div class="created-box"><div class="success-icon">✓</div><h2>Lote ${esc(l.lotCode)} criado</h2><p>O registro foi salvo na planilha e as molhações foram programadas.</p><div class="created-actions"><button class="primary" data-created-open="${esc(l.id)}">Abrir lote</button><button class="secondary" data-print="${esc(l.id)}">Imprimir</button><button class="danger ghost" data-delete-lot="${esc(l.id)}" data-close-after>Excluir lote</button></div></div>`;$('#createdDialog').showModal();}

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

async function init(){
  bindEvents();connection();setDefaultDateTime();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  if(APP.token){showApp();if(loadCache())renderAll();try{await bootstrap()}catch(err){logout(false);$('#loginMessage').textContent='Sua sessão expirou. Entre novamente.';}}
}
init();
