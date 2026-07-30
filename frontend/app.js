const APP = {
  apiUrl: localStorage.getItem('terralote_api_url') || '',
  lots: JSON.parse(localStorage.getItem('terralote_lots') || 'null') || [
    {id:'L1',lotCode:'P-0001',manufacturedAt:new Date(Date.now()-9*864e5).toISOString(),quantity:1200,responsible:'Carlos',soilId:'T-01',soilKg:600,soilSandPct:62,soilClayPct:38,sandKg:80,cementKg:70,cementType:'CP V-ARI',moisturePct:11.5,wateringPlanId:'M2',cureDays:28,status:'CURING',notes:'Lote piloto'},
    {id:'L2',lotCode:'P-0002',manufacturedAt:new Date(Date.now()-30*864e5).toISOString(),quantity:980,responsible:'Ana',soilId:'T-02',soilKg:550,soilSandPct:58,soilClayPct:42,sandKg:100,cementKg:68,cementType:'CP II-F',moisturePct:12.2,wateringPlanId:'M3',cureDays:28,status:'READY',notes:''},
    {id:'L3',lotCode:'P-0003',manufacturedAt:new Date(Date.now()-2*864e5).toISOString(),quantity:1350,responsible:'João',soilId:'T-01',soilKg:640,soilSandPct:62,soilClayPct:38,sandKg:70,cementKg:75,cementType:'CP V-ARI',moisturePct:10.8,wateringPlanId:'M1',cureDays:15,status:'CURING',notes:''}
  ],
  plans: JSON.parse(localStorage.getItem('terralote_plans') || 'null') || [
    {id:'M0',name:'Cura seca',days:0,times:[''],description:'Sem molhação programada'},
    {id:'M1',name:'Molhação leve',days:2,times:['08:00'],description:'1 vez ao dia por 2 dias'},
    {id:'M2',name:'Molhação média',days:4,times:['08:00','16:00'],description:'2 vezes ao dia por 4 dias'},
    {id:'M3',name:'Molhação pesada',days:7,times:['07:00','12:00','17:00'],description:'3 vezes ao dia por 7 dias'}
  ],
  confirmations: JSON.parse(localStorage.getItem('terralote_confirmations') || '{}')
};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function save(){localStorage.setItem('terralote_lots',JSON.stringify(APP.lots));localStorage.setItem('terralote_plans',JSON.stringify(APP.plans));localStorage.setItem('terralote_confirmations',JSON.stringify(APP.confirmations))}
function dateBR(d){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:d.includes('T')?'short':undefined}).format(new Date(d))}
function daysBetween(a,b=new Date()){return Math.max(0,Math.floor((new Date(b)-new Date(a))/864e5))}
function progress(l){return Math.min(100,Math.round(daysBetween(l.manufacturedAt)/Number(l.cureDays)*100))}
function status(l){if(progress(l)>=100)return 'READY';return l.status||'CURING'}
function tasksForLot(l){
 const p=APP.plans.find(x=>x.id===l.wateringPlanId); if(!p||p.days===0)return [];
 const start=new Date(l.manufacturedAt); const out=[];
 for(let day=1;day<=p.days;day++)for(const time of p.times){
   const [h,m]=time.split(':').map(Number), due=new Date(start); due.setDate(start.getDate()+day);due.setHours(h,m,0,0);
   const key=`${l.id}_${day}_${time}`;
   if(!APP.confirmations[key])out.push({key,lot:l,due,day,time,type:'Molhação'});
 }
 return out;
}
function allTasks(){return APP.lots.flatMap(tasksForLot).sort((a,b)=>a.due-b.due)}
function render(){
 const active=APP.lots.filter(l=>status(l)!=='READY').length, ready=APP.lots.filter(l=>status(l)==='READY').length;
 $('#kpiActive').textContent=active;$('#kpiReady').textContent=ready;$('#kpiPending').textContent=allTasks().filter(t=>t.due<=new Date(Date.now()+864e5)).length;$('#kpiBricks').textContent=APP.lots.reduce((s,l)=>s+Number(l.quantity),0).toLocaleString('pt-BR');
 $('#lotProgress').innerHTML=APP.lots.slice(0,5).map(l=>`<div class="progress-card"><div class="progress-top"><div><strong>${l.lotCode}</strong><small> ${l.responsible}</small></div><strong>${progress(l)}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress(l)}%"></div></div><small>${daysBetween(l.manufacturedAt)} de ${l.cureDays} dias de cura</small></div>`).join('');
 const tasks=allTasks().slice(0,6); $('#nextTasks').innerHTML=taskHtml(tasks);$('#allTasks').innerHTML=taskHtml(allTasks());
 renderLots();renderCharts();renderCatalog();
}
function taskHtml(tasks){if(!tasks.length)return '<div class="empty">Nenhuma ação pendente.</div>';return tasks.map(t=>{const overdue=t.due<new Date();return `<div class="task ${overdue?'overdue':'due'}"><div class="task-info"><strong>${t.type} — ${t.lot.lotCode}</strong><small>${dateBR(t.due.toISOString())} · dia ${t.day}</small></div><button onclick="confirmTask('${t.key}')">Confirmar</button></div>`}).join('')}
function confirmTask(key){APP.confirmations[key]={at:new Date().toISOString(),by:'Operador local'};save();render();syncQueue({type:'CONFIRM_TASK',key,payload:APP.confirmations[key]})}
function renderLots(filter=''){const q=filter.toLowerCase();$('#lotsTable').innerHTML=APP.lots.filter(l=>JSON.stringify(l).toLowerCase().includes(q)).map(l=>`<tr><td><strong>${l.lotCode}</strong></td><td>${dateBR(l.manufacturedAt)}</td><td>${Number(l.quantity).toLocaleString('pt-BR')}</td><td>${l.soilKg}kg terra + ${l.sandKg}kg areia + ${l.cementKg}kg ${l.cementType}</td><td>${l.responsible}</td><td>${progress(l)}%</td><td><span class="badge ${status(l)==='READY'?'ready':'active'}">${status(l)==='READY'?'Pronto':'Em cura'}</span></td><td><button class="secondary" onclick="showDetail('${l.id}')">Abrir</button></td></tr>`).join('')}
function renderCharts(){
 const groups={};APP.lots.forEach(l=>{const k=l.cementType;groups[k]=(groups[k]||0)+Number(l.quantity)});const max=Math.max(...Object.values(groups),1);
 $('#mixChart').innerHTML=Object.entries(groups).map(([k,v])=>`<div class="bar-group"><strong>${v.toLocaleString('pt-BR')}</strong><div class="bar" style="height:${Math.max(18,v/max*150)}px"></div><small>${k}</small></div>`).join('');
 const ready=APP.lots.filter(l=>status(l)==='READY').length, curing=APP.lots.length-ready, a=APP.lots.length?ready/APP.lots.length*360:0;
 $('#statusDonut').innerHTML=`<div><div class="donut" style="background:conic-gradient(#28765f 0 ${a}deg,#d7a44e ${a}deg 360deg)"><div class="donut-center"><strong>${APP.lots.length}</strong><small>lotes</small></div></div><div class="legend"><span><i style="background:#28765f"></i>${ready} prontos</span><span><i style="background:#d7a44e"></i>${curing} em cura</span></div></div>`;
}
function renderCatalog(){
 $('#wateringCatalog').innerHTML=APP.plans.map(p=>`<div class="progress-card"><strong>${p.name}</strong><p style="color:var(--muted);font-size:13px;margin-top:4px">${p.description}</p></div>`).join('');
 $('#wateringPlanSelect').innerHTML=APP.plans.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}
function showDetail(id){const l=APP.lots.find(x=>x.id===id), plan=APP.plans.find(p=>p.id===l.wateringPlanId), tasks=tasksForLot(l);
 $('#detailContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">RASTREABILIDADE DO LOTE</p><h2>${l.lotCode}</h2></div><button class="icon" onclick="detailDialog.close()">×</button></div>
 <div class="detail-grid"><div class="detail-cell"><small>Fabricação</small><strong>${dateBR(l.manufacturedAt)}</strong></div><div class="detail-cell"><small>Quantidade</small><strong>${l.quantity}</strong></div><div class="detail-cell"><small>Responsável</small><strong>${l.responsible}</strong></div><div class="detail-cell"><small>Terra</small><strong>${l.soilId}</strong></div><div class="detail-cell"><small>Granulometria</small><strong>${l.soilSandPct}% areia / ${l.soilClayPct}% argila</strong></div><div class="detail-cell"><small>Umidade</small><strong>${l.moisturePct}%</strong></div><div class="detail-cell"><small>Cimento</small><strong>${l.cementKg} kg · ${l.cementType}</strong></div><div class="detail-cell"><small>Molhação</small><strong>${plan?.name||'-'}</strong></div><div class="detail-cell"><small>Cura</small><strong>${progress(l)}% · ${l.cureDays} dias</strong></div></div>
 <h2>Linha do tempo</h2><div class="timeline"><div class="timeline-item"><strong>Lote fabricado</strong><small>${dateBR(l.manufacturedAt)}</small></div>${tasks.slice(0,5).map(t=>`<div class="timeline-item"><strong>Molhação pendente</strong><small>${dateBR(t.due.toISOString())}</small></div>`).join('')}<div class="timeline-item"><strong>Conclusão prevista da cura</strong><small>${dateBR(new Date(new Date(l.manufacturedAt).getTime()+l.cureDays*864e5).toISOString())}</small></div></div>`;
 detailDialog.showModal();
}
async function syncQueue(item){const q=JSON.parse(localStorage.getItem('terralote_queue')||'[]');q.push({...item,queuedAt:new Date().toISOString()});localStorage.setItem('terralote_queue',JSON.stringify(q));if(navigator.onLine)flushQueue()}
async function flushQueue(){if(!APP.apiUrl)return;let q=JSON.parse(localStorage.getItem('terralote_queue')||'[]');const remaining=[];for(const item of q){try{const r=await fetch(APP.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(item)});if(!r.ok)throw Error('sync')}catch(e){remaining.push(item)}}localStorage.setItem('terralote_queue',JSON.stringify(remaining))}
$('#lotForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));['quantity','soilKg','soilSandPct','soilClayPct','sandKg','cementKg','moisturePct','cureDays'].forEach(k=>data[k]=Number(data[k]));data.id=crypto.randomUUID();data.manufacturedAt=new Date(data.manufacturedAt).toISOString();data.status='CURING';APP.lots.unshift(data);save();syncQueue({type:'UPSERT_LOT',payload:data});e.target.reset();lotDialog.close();render()});
$('#newLotBtn').onclick=()=>lotDialog.showModal();$('#closeDialog').onclick=$('#cancelDialog').onclick=()=>lotDialog.close();$('#lotSearch').oninput=e=>renderLots(e.target.value);
$$('.nav').forEach(b=>b.onclick=()=>{$$('.nav').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.view').forEach(v=>v.classList.remove('active'));$('#'+b.dataset.view).classList.add('active');$('#pageTitle').textContent=b.textContent});
function conn(){const on=navigator.onLine;$('#connectionDot').style.background=on?'#65d59f':'#f1b24c';$('#connectionText').textContent=on?'Online · sincronização disponível':'Offline · dados salvos no aparelho';if(on)flushQueue()}window.addEventListener('online',conn);window.addEventListener('offline',conn);
if('serviceWorker'in navigator)navigator.serviceWorker.register('service-worker.js');conn();render();
