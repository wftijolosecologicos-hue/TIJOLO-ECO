// TerraLote V8.5 — patch pontual.
// Carregar DEPOIS de app.js.

(() => {
  'use strict';

  const V85 = {
    mondayStart(d = new Date()) {
      const x = new Date(d); x.setHours(12,0,0,0);
      const dow = x.getDay();
      x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1));
      return x;
    },
    today() { return isoDate(new Date()); },
    activeRecipe() {
      return APP.recipes.find(r => r.is_default) || APP.recipes.find(r => r.code === '10-1-1') || APP.recipes[0];
    },
    lightPlan() {
      return APP.plans.find(p => /leve/i.test(`${p.name||''} ${p.code||''}`)) || APP.plans[0];
    }
  };

  // ---------- NOVO LOTE ----------
  window.populateLotOptions = function() {
    $('#lotSoil').innerHTML = APP.soils.map(s =>
      `<option value="${s.id}">${esc(s.code)} · ${esc(s.name)} · ${esc(s.origin)}</option>`
    ).join('');

    $('#wateringPlan').innerHTML = APP.plans.map(p => {
      const days = num(p.days);
      const suffix = days > 0 ? ` · ${days} dia${days === 1 ? '' : 's'}` : ' · sem molhação';
      return `<option value="${p.id}">${esc(p.name)}${suffix}</option>`;
    }).join('');

    const recipes = [...APP.recipes].sort((a,b) =>
      (b.is_default?1:0)-(a.is_default?1:0) || String(a.code).localeCompare(String(b.code))
    );
    $('#recipeSelect').innerHTML = recipes.map(r =>
      `<option value="${r.id}" ${r.is_default?'selected':''}>${esc(r.code)}</option>`
    ).join('');

    const def = V85.activeRecipe();
    if (def) $('#recipeSelect').value = def.id;
    updateRecipeSummary();
  };

  window.setDefaultLot = function() {
    const d = new Date();
    const local = new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
    const f = $('#lotForm');
    f.elements.manufacturedAt.value = local;
    f.elements.shift.value = d.getHours() < 12 ? 'MANHA' : 'TARDE';
    f.elements.cementType.value = 'CP II';
    f.elements.plasticWrapped.value = 'YES';
    f.elements.cureDays.value = '28';
    $('#hasExtra').value = 'NO';
    $('#extrasWrap').classList.add('hidden');
    $('#wateringField').classList.add('hidden');
    $('#extrasList').innerHTML = '';
    const def = V85.activeRecipe();
    if (def) $('#recipeSelect').value = def.id;
    const light = V85.lightPlan();
    if (light) $('#wateringPlan').value = light.id;
    const moisture = $('#moistureField');
    if (moisture) { moisture.value=''; moisture.required=false; }
    updateRecipeSummary();
  };

  if ($('#plasticWrapped')) {
    $('#plasticWrapped').onchange = e => {
      const noPlastic = e.target.value === 'NO';
      $('#wateringField').classList.toggle('hidden', !noPlastic);
      if (noPlastic) {
        const light = V85.lightPlan();
        if (light) $('#wateringPlan').value = light.id;
      }
    };
  }

  // ---------- CALENDÁRIO SEGUNDA → DOMINGO ----------
  window.renderDashboardTeam = function() {
    const today = new Date(); today.setHours(0,0,0,0);
    const upcoming = APP.assignments
      .filter(a => new Date(a.work_date+'T12:00:00') >= today)
      .slice().sort((a,b) => a.work_date.localeCompare(b.work_date) || a.shift.localeCompare(b.shift));
    const dates = [...new Set(upcoming.map(a=>a.work_date))].slice(0,4);

    $('#dashboardSchedule').innerHTML = dates.map(d => {
      const rows = upcoming.filter(a=>a.work_date===d);
      return `<section class="dash-schedule-day">
        <header><strong>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'})}</strong></header>
        ${['MANHA','TARDE'].map(sh => {
          const groups = groupAssignments(rows.filter(a=>a.shift===sh));
          return `<div><small>${sh==='MANHA'?'MANHÃ':'TARDE'}</small><div>${
            groups.map(g=>`<span><b>${esc(g.name)}</b> ${g.items.map(a=>esc(functionAssignmentLabel(a))).join(' + ')}</span>`).join('') || '<em>Sem escala</em>'
          }</div></div>`;
        }).join('')}
      </section>`;
    }).join('') || '<div class="empty-state">Nenhuma escala para os próximos dias.</div>';

    const start = V85.mondayStart(), days=[];
    for(let i=0;i<7;i++){ const d=new Date(start); d.setDate(start.getDate()+i); days.push(isoDate(d)); }

    const collabs = APP.collaborators.filter(c=>c.status!=='INACTIVE');
    const head = days.map(d=>`<span>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}</span>`).join('');
    const rows = collabs.map(c=>{
      const cells = days.map(d=>{
        const m=attendanceState(c.id,d,'MANHA'), t=attendanceState(c.id,d,'TARDE');
        return `<div class="attendance-day">
          <span class="${attendanceClass(m.status)}"><b>MANHÃ</b> ${attendanceShort(m.status)}${m.note?`<small>${esc(m.note)}</small>`:''}</span>
          <span class="${attendanceClass(t.status)}"><b>TARDE</b> ${attendanceShort(t.status)}${t.note?`<small>${esc(t.note)}</small>`:''}</span>
        </div>`;
      }).join('');
      return `<div class="attendance-row"><strong>${esc(c.full_name)}</strong>${cells}</div>`;
    }).join('');
    const calendar = `<div class="attendance-table"><div class="attendance-head"><span>Colaborador</span>${head}</div>${rows}</div>`;
    $('#weeklyAttendance').innerHTML = calendar;
    if ($('#weeklyCalendarFull')) $('#weeklyCalendarFull').innerHTML = calendar;
  };

  // ---------- FUNÇÕES / ESCALA ----------
  window.functionAssignmentLabel = function(a) {
    const n = a.work_functions?.name || 'Função';
    if (a.work_functions?.function_type === 'PRODUCAO') return n;
    const start=timeHM(a.start_time), end=timeHM(a.end_time);
    return `${n}${start&&end?` · ${start}–${end}`:''}`;
  };

  function ensureFunctionEditField() {
    const form = $('#functionForm');
    if (!form) return;
    if (!form.elements.functionId) {
      const input=document.createElement('input');
      input.type='hidden'; input.name='functionId';
      form.prepend(input);
    }
    const title=form.querySelector('.dialog-head h2');
    if (title) title.id='functionDialogTitle';
  }

  window.openNewFunction = function() {
    ensureFunctionEditField();
    const f=$('#functionForm'); f.reset(); f.elements.functionId.value='';
    $('#functionDialogTitle').textContent='Nova função';
    $('#functionType').disabled=false;
    $('#functionType').value='PRODUCAO';
    const prods=APP.functions.filter(x=>x.function_type==='PRODUCAO');
    $('#anchorFunctionSelect').innerHTML=prods.map(x=>`<option value="${x.id}" ${x.name==='Betoneira'?'selected':''}>${esc(x.name)}</option>`).join('');
    $('#productionFunctionTimes').classList.add('hidden');
    $('#accumulativeFunctionFields').classList.add('hidden');
    $('#functionDialog').showModal();
  };

  window.openEditFunctionV85 = function(id) {
    ensureFunctionEditField();
    const x=APP.functions.find(f=>f.id===id); if(!x) return;
    const f=$('#functionForm'); f.reset();
    f.elements.functionId.value=x.id;
    f.elements.name.value=x.name||'';
    f.elements.type.value=x.function_type||'PRODUCAO';
    f.elements.notes.value=x.notes||'';
    $('#functionType').disabled=true;
    const prods=APP.functions.filter(v=>v.function_type==='PRODUCAO');
    $('#anchorFunctionSelect').innerHTML=prods.map(v=>`<option value="${v.id}">${esc(v.name)}</option>`).join('');
    if(x.function_type==='ACUMULAVEL'){
      $('#accumulativeFunctionFields').classList.remove('hidden');
      $('#productionFunctionTimes').classList.add('hidden');
      f.elements.anchorFunctionId.value=x.anchor_production_function_id||prods.find(v=>v.name==='Betoneira')?.id||'';
      f.elements.morningStart.value=timeHM(x.morning_start)||'07:00';
      f.elements.morningEnd.value=timeHM(x.morning_end)||'07:20';
      f.elements.afternoonStart.value=timeHM(x.afternoon_start)||'17:00';
      f.elements.afternoonEnd.value=timeHM(x.afternoon_end)||'17:20';
    } else {
      $('#accumulativeFunctionFields').classList.add('hidden');
      $('#productionFunctionTimes').classList.add('hidden');
    }
    $('#functionDialogTitle').textContent='Editar função';
    $('#functionDialog').showModal();
  };

  $('#functionType').onchange = () => {
    const accum=$('#functionType').value==='ACUMULAVEL';
    $('#accumulativeFunctionFields').classList.toggle('hidden',!accum);
    $('#productionFunctionTimes').classList.add('hidden');
  };
  $('#newFunctionBtn').onclick=openNewFunction;

  // Intercepta o submit antigo, permitindo editar e removendo horário de Produção.
  $('#functionForm').addEventListener('submit', async e => {
    e.preventDefault(); e.stopImmediatePropagation();
    const f=new FormData(e.currentTarget), id=String(f.get('functionId')||''), type=$('#functionType').value;
    const payload={name:String(f.get('name')).trim(),notes:String(f.get('notes')||'').trim()||null};
    if(type==='PRODUCAO'){
      payload.default_start=null; payload.default_end=null;
    } else {
      payload.anchor_production_function_id=f.get('anchorFunctionId')||null;
      payload.morning_start=f.get('morningStart')||'07:00';
      payload.morning_end=f.get('morningEnd')||'07:20';
      payload.afternoon_start=f.get('afternoonStart')||'17:00';
      payload.afternoon_end=f.get('afternoonEnd')||'17:20';
    }
    const q=id ? sb.from('work_functions').update(payload).eq('id',id)
               : sb.from('work_functions').insert({...payload,function_type:type,rotatable:true});
    const {error}=await q;
    if(error) return toast(error.message,true);
    $('#functionDialog').close(); toast(id?'Função atualizada.':'Função criada.'); bootstrap();
  }, true);

  window.renderSchedule = function() {
    const today=V85.today(), days={};
    APP.assignments.filter(a=>a.work_date>=today).forEach(a=>{
      (days[a.work_date]??={MANHA:[],TARDE:[]})[a.shift].push(a);
    });

    $('#functionsList').innerHTML = `
      <div class="v85-function-bank-head"><div><small>BANCO DE FUNÇÕES</small><strong>${APP.functions.length} cadastrada(s)</strong></div></div>
      <div class="v85-function-bank">
      ${APP.functions.map(f=>`<article class="v85-function-card ${f.function_type==='ACUMULAVEL'?'accum':''}">
        <div><strong>${esc(f.name)}</strong><small>${f.function_type==='PRODUCAO'?'Produção':'Acumulável'}</small>
        ${f.function_type==='ACUMULAVEL'?`<em>${timeHM(f.morning_start)||'07:00'}–${timeHM(f.morning_end)||'07:20'} · ${timeHM(f.afternoon_start)||'17:00'}–${timeHM(f.afternoon_end)||'17:20'}</em>`:''}</div>
        ${isAdmin()?`<div><button class="secondary v85-edit-function" data-function-id="${f.id}">Editar</button><button class="danger-action v85-delete-function" data-function-id="${f.id}">Excluir</button></div>`:''}
      </article>`).join('')}
      </div>`;

    $('#scheduleList').innerHTML=Object.entries(days).sort(([a],[b])=>a.localeCompare(b)).map(([d,sh])=>
      `<section class="schedule-day"><h3>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</h3>
      <div class="schedule-shifts">${['MANHA','TARDE'].map(shift=>`<div class="schedule-shift"><h4>${shift==='MANHA'?'Manhã':'Tarde'}</h4>${
        groupAssignments(sh[shift]).map(g=>`<div class="assignment multi"><strong>${esc(g.name)}</strong><div class="assignment-functions">${
          g.items.map(a=>`<span class="${a.work_functions?.function_type==='ACUMULAVEL'?'accum':''}">${esc(functionAssignmentLabel(a))}${isAdmin()?`<button data-delete-assignment="${a.id}">×</button>`:''}</span>`).join('')
        }</div></div>`).join('')||'—'
      }</div>`).join('')}</div></section>`
    ).join('')||'<div>Nenhuma escala futura gerada.</div>';
  };

  document.addEventListener('click', async e=>{
    const edit=e.target.closest('.v85-edit-function');
    if(edit){ e.preventDefault();e.stopImmediatePropagation();openEditFunctionV85(edit.dataset.functionId);return; }
    const del=e.target.closest('.v85-delete-function');
    if(del){
      e.preventDefault();e.stopImmediatePropagation();
      if(!confirm('Excluir esta função PERMANENTEMENTE do banco de dados? As atribuições vinculadas também serão removidas.'))return;
      const {error}=await sb.rpc('delete_work_function_permanently',{p_function_id:del.dataset.functionId});
      if(error)return toast(error.message,true);
      toast('Função excluída permanentemente.');bootstrap();return;
    }
  }, true);

  // ---------- USUÁRIOS: ADMIN PODE DEFINIR NOVA SENHA ----------
  window.openEditUser = function(id) {
    const u=APP.users.find(x=>x.id===id);if(!u)return;
    const f=$('#userForm');f.reset();f.userId.value=u.id;f.fullName.value=u.full_name;f.username.value=u.username;f.role.value=u.role;f.canDeleteLots.checked=Boolean(u.can_delete_lots);
    const wrap=$('.user-create-only');
    wrap.classList.remove('hidden');
    const label=wrap.closest('label')||wrap;
    const input=f.password;
    input.required=false; input.value=''; input.placeholder='Deixe vazio para manter a senha atual';
    if(label.childNodes[0]) label.childNodes[0].textContent='Nova senha (opcional)';
    $('#userDialogTitle').textContent='Editar usuário';$('#userDialog').showModal();
  };

  $('#userForm').addEventListener('submit', async e=>{
    const fd=new FormData(e.currentTarget),userId=String(fd.get('userId')||'');
    if(!userId)return; // criação continua no fluxo existente.
    e.preventDefault();e.stopImmediatePropagation();
    const payload={
      fullName:String(fd.get('fullName')).trim(),
      username:String(fd.get('username')).trim(),
      role:String(fd.get('role')),
      canDeleteLots:fd.get('canDeleteLots')==='on',
      password:String(fd.get('password')||'')
    };
    loading(true,'Atualizando usuário');
    try{
      await adminUserAction('edit',userId,payload);
      $('#userDialog').close();toast(payload.password?'Usuário e senha atualizados.':'Usuário atualizado.');await loadUsers();
    }catch(err){toast(err.message,true)}finally{loading(false)}
  }, true);

  // ---------- COLABORADORES: ORGANIZAÇÃO + INDICADORES ----------
  function restructureCollaborators() {
    const section=$('#collaborators'), list=$('#collaboratorsList');
    if(!section||!list||$('#v85TeamInsights'))return;

    const insights=document.createElement('div');
    insights.id='v85TeamInsights';insights.className='v85-team-insights';
    const financeToolbar=section.querySelector('.finance-toolbar');
    financeToolbar?.before(insights);

    const panel=document.createElement('article');
    panel.className='panel v85-manage-collaborators';
    panel.innerHTML='<div class="panel-head"><div><p class="eyebrow">CADASTRO</p><h2>Gerenciar colaboradores</h2><p>Colaboradores cadastrados, presença e ações administrativas.</p></div></div>';
    list.parentNode.insertBefore(panel,list);
    panel.appendChild(list);
  }

  function renderTeamInsights() {
    const box=$('#v85TeamInsights');if(!box||!isAdmin())return;
    const active=APP.collaborators.filter(c=>c.status==='ACTIVE');
    const today=V85.today();
    const off=active.filter(c=>['OFF','ABSENT'].includes(attendanceState(c.id,today,'MANHA').status)||['OFF','ABSENT'].includes(attendanceState(c.id,today,'TARDE').status)).length;
    const avgRate=active.length?active.reduce((s,c)=>s+num(c.daily_rate),0)/active.length:0;
    const payroll=APP.payrollRows||[];
    const totalPayroll=payroll.reduce((s,r)=>s+num(r.net_due),0);
    const max=Math.max(1,...payroll.map(r=>num(r.net_due)));
    box.innerHTML=`<div class="v85-insight-grid">
      <article><small>Equipe ativa</small><strong>${active.length}</strong><span>colaboradores</span></article>
      <article><small>Falta / Off hoje</small><strong>${off}</strong><span>com ocorrência</span></article>
      <article><small>Diária média</small><strong>${money(avgRate)}</strong><span>equipe ativa</span></article>
      <article><small>Folha líquida</small><strong>${money(totalPayroll)}</strong><span>período selecionado</span></article>
    </div>
    <article class="panel v85-mini-chart"><div class="panel-head"><div><h2>Custo por colaborador</h2><p>Valor líquido no período.</p></div></div>
      ${payroll.map(r=>`<button class="v85-person-bar" data-person-cost="${r.collaborator_id}"><span>${esc(r.full_name)}</span><i><b style="width:${num(r.net_due)/max*100}%"></b></i><strong>${money(r.net_due)}</strong></button>`).join('')||'<div class="empty-state">Sem dados financeiros.</div>'}
    </article>`;
  }

  const oldRenderCollaborators=renderCollaborators;
  window.renderCollaborators=function(){ oldRenderCollaborators(); restructureCollaborators(); renderTeamInsights(); };
  const oldRenderPayroll=renderPayrollDashboard;
  window.renderPayrollDashboard=function(){ oldRenderPayroll(); renderTeamInsights(); };

  // ---------- CUSTOS: INDICADORES + INTERAÇÃO ----------
  function ensureCostDetailDialog(){
    if($('#v85CostDetail'))return;
    const d=document.createElement('dialog');d.id='v85CostDetail';d.className='analytics-dialog';
    d.innerHTML='<div id="v85CostDetailContent"></div>';document.body.appendChild(d);
  }
  ensureCostDetailDialog();

  window.renderCosts=function(entries,payroll,prod){
    V85.lastCostData={entries,payroll,prod};
    const manual=entries.reduce((s,x)=>s+num(x.total_amount),0);
    const people=payroll.reduce((s,x)=>s+num(x.gross_due),0);
    const total=manual+people;
    const bricks=prod.reduce((s,x)=>s+num(x.bricks),0);
    const days=Math.max(1,(new Date(APP.costEnd+'T12:00')-new Date(APP.costStart+'T12:00'))/864e5+1);
    const categories={COLABORADORES:people};
    entries.forEach(e=>categories[e.category]=(categories[e.category]||0)+num(e.total_amount));
    const max=Math.max(1,...Object.values(categories));
    const materials=(categories.CEMENT||0)+(categories.SOIL||0)+(categories.SAND||0)+(categories.MATERIAL||0);
    const dailyCost=total/days;
    const monthProjection=dailyCost*30.44;

    $('#costKpis').innerHTML=`<div class="v85-cost-kpis">
      <button data-cost-detail="TOTAL"><small>Custo total</small><strong>${money(total)}</strong><span>Clique para detalhar</span></button>
      <button data-cost-detail="UNIT"><small>Custo / tijolo</small><strong>${bricks?money(total/bricks):money(0)}</strong><span>${qty(bricks)} produzidos</span></button>
      <button data-cost-detail="LABOR"><small>Mão de obra</small><strong>${money(people)}</strong><span>${total?Math.round(people/total*100):0}% do custo</span></button>
      <button data-cost-detail="MATERIALS"><small>Materiais</small><strong>${money(materials)}</strong><span>${total?Math.round(materials/total*100):0}% do custo</span></button>
      <button data-cost-detail="DAILY"><small>Média diária</small><strong>${money(dailyCost)}</strong><span>no período</span></button>
      <button data-cost-detail="PROJECTION"><small>Projeção mensal</small><strong>${money(monthProjection)}</strong><span>ritmo atual</span></button>
    </div>`;

    $('#costCategoryChart').innerHTML=Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([k,v])=>
      `<button class="v85-cost-bar" data-cost-category="${k}"><div><span>${costCategoryLabel(k)}</span><strong>${money(v)}</strong></div><i><b style="width:${v/max*100}%"></b></i><small>${total?Math.round(v/total*100):0}% do total · abrir detalhes</small></button>`
    ).join('');

    const prodMax=Math.max(1,...prod.map(x=>num(x.bricks)));
    $('#costProductionSummary').innerHTML=`<div class="production-cost-cards">
      <div><small>Total produzido</small><strong>${qty(bricks)}</strong></div>
      <div><small>Média diária</small><strong>${qty(bricks/days)}</strong></div>
      <div><small>Média semanal</small><strong>${qty(bricks/days*7)}</strong></div>
      <div><small>Média mensal</small><strong>${qty(bricks/days*30.44)}</strong></div>
    </div>
    <div class="v85-production-spark">${prod.slice(-20).map(x=>`<i style="height:${Math.max(5,num(x.bricks)/prodMax*100)}%" title="${dateBR(x.manufacture_date)} · ${qty(x.bricks)} tijolos"></i>`).join('')}</div>
    <small class="v85-chart-note">Passe o cursor nas barras para ver a produção diária.</small>`;

    $('#costEntriesList').innerHTML=entries.map(e=>`<div class="cost-entry"><div><strong>${costCategoryLabel(e.category)}${e.cost_catalog_items?.name?` · ${esc(e.cost_catalog_items.name)}`:''}</strong><small>${dateBR(e.cost_date)} · ${esc(e.description||'')}</small></div><strong>${money(e.total_amount)}</strong><button class="icon-danger" data-delete-cost="${e.id}">×</button></div>`).join('')||'<div class="empty-state">Nenhum custo lançado.</div>';
    populateCostItems();
  };

  function openCostDetail(key){
    const data=V85.lastCostData;if(!data)return;
    let title='Detalhamento de custos', body='';
    if(key==='LABOR'){
      title='Mão de obra';
      body=data.payroll.map(r=>`<div class="v85-detail-row"><span>${esc(r.full_name)}</span><small>Diárias ${money(r.base_due)} · comissão ${money(r.commission_due)} · adiant. ${money(r.advances)}</small><strong>${money(r.gross_due)}</strong></div>`).join('');
    }else{
      const category=key && !['TOTAL','UNIT','MATERIALS','DAILY','PROJECTION'].includes(key)?key:null;
      let rows=data.entries;
      if(category)rows=rows.filter(e=>e.category===category);
      if(key==='MATERIALS')rows=rows.filter(e=>['CEMENT','SOIL','SAND','MATERIAL'].includes(e.category));
      body=rows.map(e=>`<div class="v85-detail-row"><span>${dateBR(e.cost_date)} · ${costCategoryLabel(e.category)}</span><small>${esc(e.cost_catalog_items?.name||e.description||'')}</small><strong>${money(e.total_amount)}</strong></div>`).join('')||'<div class="empty-state">Sem lançamentos nesta seleção.</div>';
    }
    $('#v85CostDetailContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">CUSTOS</p><h2>${title}</h2><small>${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}</small></div><button class="icon" onclick="document.getElementById('v85CostDetail').close()">×</button></div><div class="v85-detail-list">${body}</div>`;
    $('#v85CostDetail').showModal();
  }

  document.addEventListener('click',e=>{
    const c=e.target.closest('[data-cost-category]');if(c){openCostDetail(c.dataset.costCategory);return}
    const k=e.target.closest('[data-cost-detail]');if(k){openCostDetail(k.dataset.costDetail);return}
  });

  // ---------- CSS DO PATCH ----------
  const style=document.createElement('style');
  style.textContent=`
    .v85-function-bank-head{display:flex;justify-content:space-between;margin:4px 0 9px}
    .v85-function-bank-head small,.v85-function-card small{display:block;color:var(--muted);font-size:8px}
    .v85-function-bank{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px;margin-bottom:14px}
    .v85-function-card{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid var(--line);background:#fff;border-radius:12px;padding:11px}
    .v85-function-card.accum{border-left:4px solid #315f84}.v85-function-card em{display:block;color:#315f84;font-style:normal;font-size:8px;margin-top:4px}
    .v85-function-card>div:last-child{display:flex;gap:5px}.v85-function-card button{font-size:8px;padding:6px 8px}
    .v85-team-insights{display:grid;gap:12px;margin:12px 0}.v85-insight-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
    .v85-insight-grid article{background:#fff;border:1px solid var(--line);border-radius:13px;padding:13px}.v85-insight-grid small,.v85-insight-grid span{display:block;color:var(--muted);font-size:8px}.v85-insight-grid strong{display:block;font-size:18px;margin:5px 0}
    .v85-person-bar{width:100%;display:grid;grid-template-columns:120px 1fr 90px;align-items:center;gap:8px;border:0;background:transparent;padding:7px;cursor:pointer;text-align:left}
    .v85-person-bar i,.v85-cost-bar>i{height:8px;background:#e8eeeb;border-radius:999px;overflow:hidden}.v85-person-bar i b,.v85-cost-bar>i b{display:block;height:100%;background:linear-gradient(90deg,#235a4c,#72a794);border-radius:999px}
    .v85-manage-collaborators{margin-top:14px}.v85-cost-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;width:100%}
    .v85-cost-kpis button{border:1px solid var(--line);background:#fff;border-radius:14px;padding:13px;text-align:left;cursor:pointer}.v85-cost-kpis button:hover,.v85-cost-bar:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(20,63,52,.08)}
    .v85-cost-kpis small,.v85-cost-kpis span{display:block;color:var(--muted);font-size:8px}.v85-cost-kpis strong{display:block;font-size:18px;margin:5px 0}
    .v85-cost-bar{width:100%;display:grid;gap:6px;border:0;background:transparent;padding:7px;border-radius:10px;cursor:pointer;text-align:left}.v85-cost-bar>div{display:flex;justify-content:space-between}.v85-cost-bar small{font-size:7px;color:var(--muted)}
    .v85-production-spark{height:110px;display:flex;align-items:flex-end;gap:4px;margin-top:14px;border-bottom:1px solid var(--line)}.v85-production-spark i{flex:1;min-width:5px;background:linear-gradient(#6ca18f,#255e50);border-radius:4px 4px 0 0}
    .v85-chart-note{display:block;color:var(--muted);font-size:8px;margin-top:5px}.v85-detail-list{display:grid;gap:6px;padding:14px}.v85-detail-row{display:grid;grid-template-columns:1fr 1.4fr auto;gap:9px;align-items:center;border-bottom:1px solid var(--line);padding:9px}.v85-detail-row small{color:var(--muted)}
    @media(max-width:760px){.v85-insight-grid,.v85-cost-kpis{grid-template-columns:1fr 1fr}.v85-person-bar{grid-template-columns:90px 1fr 75px}.v85-detail-row{grid-template-columns:1fr auto}.v85-detail-row small{grid-column:1/-1}}
  `;
  document.head.appendChild(style);

  // Reaplica os componentes já carregados.
  setTimeout(()=>{
    try{
      populateLotOptions();
      renderSchedule();
      renderDashboardTeam();
      if(isAdmin()){restructureCollaborators();renderCollaborators();if(V85.lastCostData)renderCosts(V85.lastCostData.entries,V85.lastCostData.payroll,V85.lastCostData.prod);}
    }catch(err){ console.error('V8.5 patch:',err); }
  },350);
})();
