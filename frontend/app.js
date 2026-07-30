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
  taskFilter: 'open', lastCreatedId: null
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
function lotStatus(l){return cureProgress(l)>=100?'READY':'CURING';}
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
function setBusy(button,busy,label='Aguarde...'){if(!button)return; if(busy){button.dataset.old=button.textContent;button.textContent=label;button.disabled=true}else{button.textContent=button.dataset.old||button.textContent;button.disabled=false}}

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
  try{
    const result=await api('GET_BOOTSTRAP');
    APP.lots=result.lots||[];APP.soils=result.soils||[];APP.plans=result.plans||[];APP.tasks=result.tasks||[];
    if(result.user){APP.user=result.user;localStorage.setItem(STORE.user,JSON.stringify(APP.user));}
    saveCache();renderAll();
  }catch(err){
    if(loadCache()){renderAll();toast('Modo offline: exibindo os últimos dados sincronizados.');}
    else throw err;
  }
}

async function login(e){
  e.preventDefault();
  const button=e.submitter, form=new FormData(e.currentTarget);
  setBusy(button,true,'Entrando...');$('#loginMessage').textContent='';
  try{
    const result=await api('LOGIN',{username:String(form.get('username')).trim(),password:String(form.get('password'))});
    APP.token=result.token;APP.user=result.user;
    localStorage.setItem(STORE.token,APP.token);localStorage.setItem(STORE.user,JSON.stringify(APP.user));
    showApp();await bootstrap();
  }catch(err){$('#loginMessage').textContent=err.message;}
  finally{setBusy(button,false);}
}
function showApp(){
  $('#loginScreen').classList.add('hidden');$('#appShell').classList.remove('hidden');
  const name=APP.user?.name||'Operador';$('#accountName').textContent=name;$('#accountInitial').textContent=name.charAt(0).toUpperCase();
  $('#accountDialogName').textContent=name;$('#accountDialogEmail').textContent=APP.user?.email||'';
}
function logout(showMessage=true){
  APP.token='';APP.user=null;localStorage.removeItem(STORE.token);localStorage.removeItem(STORE.user);
  $('#appShell').classList.add('hidden');$('#loginScreen').classList.remove('hidden');$('#loginForm').reset();
  if(showMessage)toast('Sessão encerrada.');
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
  e.preventDefault();const button=e.submitter;setBusy(button,true,'Salvando...');
  try{
    const raw=Object.fromEntries(new FormData(e.currentTarget));
    const soil=APP.soils.find(s=>s.id===raw.soilId),plan=APP.plans.find(p=>p.id===raw.wateringPlanId);
    if(!soil)throw new Error('Selecione uma terra cadastrada.');if(!plan)throw new Error('Selecione um plano de molhação.');
    const lot={manufacturedAt:toISO(raw.manufacturedAt),quantity:num(raw.quantity),responsible:raw.responsible.trim(),soilId:soil.id,soilName:soil.name,soilOrigin:soil.origin,soilSandPct:num(soil.sandPct),soilClayPct:num(soil.clayPct),soilKg:num(raw.soilKg),sandKg:num(raw.sandKg),cementKg:num(raw.cementKg),cementType:raw.cementType,extraName:raw.extraName.trim(),extraQty:raw.extraQty===''?null:num(raw.extraQty),extraUnit:raw.extraUnit,moisturePct:raw.moisturePct===''?null:num(raw.moisturePct),wateringPlanId:plan.id,wateringPlanName:plan.name,wateringDays:num(plan.days),wateringTimes:plan.times,cureDays:num(raw.cureDays),notes:raw.notes.trim()};
    const created=await api('CREATE_LOT',{lot});APP.lots.unshift(created.lot);APP.tasks.push(...(created.tasks||[]));saveCache();renderAll();
    APP.lastCreatedId=created.lot.id;$('#lotDialog').close();e.currentTarget.reset();setDefaultDateTime();showCreated(created.lot);
  }catch(err){toast(err.message,true);}finally{setBusy(button,false);}
}
function showCreated(l){$('#createdContent').innerHTML=`<div class="created-box"><div class="success-icon">✓</div><h2>Lote ${esc(l.lotCode)} criado</h2><p>O registro foi salvo na planilha e as molhações foram programadas.</p><div class="created-actions"><button class="primary" data-created-open="${esc(l.id)}">Abrir lote</button><button class="secondary" data-print="${esc(l.id)}">Imprimir</button><button class="danger ghost" data-delete-lot="${esc(l.id)}" data-close-after>Excluir lote</button></div></div>`;$('#createdDialog').showModal();}

async function submitSoil(e){e.preventDefault();const b=e.submitter;setBusy(b,true,'Cadastrando...');try{const f=Object.fromEntries(new FormData(e.currentTarget));if(num(f.sandPct)+num(f.clayPct)>105)throw new Error('A soma de areia e argila parece inconsistente.');const soil=await api('CREATE_SOIL',{soil:{name:f.name.trim(),origin:f.origin.trim(),sandPct:num(f.sandPct),clayPct:num(f.clayPct),notes:f.notes.trim()}});APP.soils.push(soil);saveCache();renderAll();e.currentTarget.reset();$('#soilDialog').close();toast('Terra cadastrada.');}catch(err){toast(err.message,true)}finally{setBusy(b,false)}}
async function submitPlan(e){e.preventDefault();const b=e.submitter;setBusy(b,true,'Criando...');try{const f=Object.fromEntries(new FormData(e.currentTarget));const times=f.times.split(',').map(x=>x.trim()).filter(Boolean);if(times.some(x=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(x)))throw new Error('Use horários no formato 07:00, 12:00.');const plan=await api('CREATE_PLAN',{plan:{name:f.name.trim(),days:num(f.days),times,description:f.description.trim()}});APP.plans.push(plan);saveCache();renderAll();e.currentTarget.reset();$('#planDialog').close();toast('Plano personalizado criado.');}catch(err){toast(err.message,true)}finally{setBusy(b,false)}}
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
async function changePassword(e){e.preventDefault();const b=e.submitter,f=Object.fromEntries(new FormData(e.currentTarget));$('#passwordMessage').textContent='';if(f.newPassword!==f.confirmPassword){$('#passwordMessage').textContent='As novas senhas não coincidem.';return}setBusy(b,true,'Alterando...');try{const result=await api('CHANGE_CREDENTIALS',{newUsername:f.newUsername.trim(),newPassword:f.newPassword,verificationCode:f.verificationCode.trim()});APP.user.username=result.username;localStorage.setItem(STORE.user,JSON.stringify(APP.user));e.currentTarget.reset();$('#passwordMessage').style.color='var(--success)';$('#passwordMessage').textContent='Login e senha alterados com sucesso. Use o novo usuário no próximo acesso.';}catch(err){$('#passwordMessage').style.color='var(--danger)';$('#passwordMessage').textContent=err.message}finally{setBusy(b,false)}}

function setDefaultDateTime(){const d=new Date(),local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);$('#lotForm [name=manufacturedAt]').value=local;}
function navigate(view){$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===view));$$('.view').forEach(x=>x.classList.toggle('active',x.id===view));const btn=$(`.nav[data-view="${view}"]`);$('#pageTitle').textContent=btn?btn.textContent.replace(/\d+/g,'').trim():'TerraLote';$('#sidebar').classList.remove('open');window.scrollTo({top:0,behavior:'smooth'});}
function connection(){const on=navigator.onLine;$('#connectionDot').style.background=on?'#63d39c':'#e4a93f';$('#connectionText').textContent=on?'Online · dados sincronizados':'Offline · usando dados salvos';if(on&&APP.token)bootstrap().catch(()=>{});}

function bindEvents(){
  $('#loginForm').addEventListener('submit',login);$('#sendCodeBtn').addEventListener('click',requestCredentialCode);$('#lotForm').addEventListener('submit',submitLot);$('#soilForm').addEventListener('submit',submitSoil);$('#planForm').addEventListener('submit',submitPlan);$('#passwordForm').addEventListener('submit',changePassword);
  $('#newLotBtn').onclick=()=>{setDefaultDateTime();$('#lotDialog').showModal()};$('#newSoilBtn').onclick=()=>$('#soilDialog').showModal();$('#newPlanBtn').onclick=()=>$('#planDialog').showModal();$('#accountBtn').onclick=()=>$('#accountDialog').showModal();$('#logoutBtn').onclick=()=>logout();$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$('#soilSelect').onchange=updateSoilInfo;$('#lotSearch').oninput=e=>renderLots(e.target.value);$('#taskFilter').onchange=e=>{APP.taskFilter=e.target.value;renderTasks()};
  $$('.nav').forEach(b=>b.onclick=()=>navigate(b.dataset.view));$$('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.tab-panel').forEach(x=>x.classList.remove('active'));$('#'+b.dataset.tab+'Tab').classList.add('active')});
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close]');if(close){document.getElementById(close.dataset.close)?.close();return}
    const print=e.target.closest('[data-print]');if(print){e.stopPropagation();printLot(print.dataset.print);return}
    const delLot=e.target.closest('[data-delete-lot]');if(delLot){e.stopPropagation();deleteEntity('LOT',delLot.dataset.deleteLot);return}
    const delSoil=e.target.closest('[data-delete-soil]');if(delSoil){deleteEntity('SOIL',delSoil.dataset.deleteSoil);return}
    const delPlan=e.target.closest('[data-delete-plan]');if(delPlan){deleteEntity('PLAN',delPlan.dataset.deletePlan);return}
    const conf=e.target.closest('[data-confirm-task]');if(conf){confirmTask(conf.dataset.confirmTask);return}
    const created=e.target.closest('[data-created-open]');if(created){$('#createdDialog').close();showDetail(created.dataset.createdOpen);return}
    const lot=e.target.closest('[data-lot]');if(lot)showDetail(lot.dataset.lot);
  });
  window.addEventListener('online',connection);window.addEventListener('offline',connection);
}

async function init(){
  bindEvents();connection();setDefaultDateTime();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
  if(APP.token){showApp();try{await bootstrap()}catch(err){logout(false);$('#loginMessage').textContent='Sua sessão expirou. Entre novamente.';}}
}
init();
