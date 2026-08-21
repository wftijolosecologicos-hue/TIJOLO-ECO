// TerraLote V8.6.1 — ajustes visuais e custo por 1.000 tijolos
// Carregar DEPOIS de v86-patch.js.

(() => {
  'use strict';

  const V861 = {
    monday(d=new Date()){
      const x=new Date(d);x.setHours(12,0,0,0);
      const dow=x.getDay();x.setDate(x.getDate()-(dow===0?6:dow-1));return x;
    },
    dateKey(d){return isoDate(d)},
    weekDates(){
      const m=this.monday();
      return Array.from({length:7},(_,i)=>{const d=new Date(m);d.setDate(m.getDate()+i);return this.dateKey(d)});
    }
  };

  // ============================================================
  // 1) CALENDÁRIO — VOLTA AO VISUAL ANTERIOR
  //    ADMIN continua podendo clicar, mas sem "cara de botão".
  // ============================================================

  window.renderDashboardTeam=function(){
    const allWeek=V861.weekDates();
    const weekdays=allWeek.slice(0,5);
    const extras=allWeek.slice(5).filter(d =>
      APP.attendance.some(a=>a.work_date===d&&a.status==='EXTRA') ||
      APP.assignments.some(a=>a.work_date===d)
    );
    const scheduleDates=[...weekdays,...extras];

    $('#dashboardSchedule').innerHTML=scheduleDates.map(d=>{
      const rows=APP.assignments.filter(a=>a.work_date===d);
      return `<section class="dash-schedule-day ${rows.length?'':'v861-empty-day'}">
        <header><strong>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'})}</strong></header>
        ${['MANHA','TARDE'].map(sh=>{
          const groups=groupAssignments(rows.filter(a=>a.shift===sh));
          return `<div><small>${sh==='MANHA'?'MANHÃ':'TARDE'}</small><div>${groups.map(g=>`<span><b>${esc(g.name)}</b> ${g.items.map(a=>esc(functionAssignmentLabel(a))).join(' + ')}</span>`).join('')||'<em>Sem atribuição</em>'}</div></div>`;
        }).join('')}
      </section>`;
    }).join('');

    const collabs=APP.collaborators.filter(c=>c.status!=='INACTIVE');
    const head=allWeek.map(d=>`<span>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}</span>`).join('');

    const rows=collabs.map(c=>{
      const cells=allWeek.map(d=>{
        const m=attendanceState(c.id,d,'MANHA'),t=attendanceState(c.id,d,'TARDE');
        const clickClass=isAdmin()?' v861-admin-calendar':'';
        return `<div class="attendance-day">
          <span class="${attendanceClass(m.status)}${clickClass}" data-v861-collab="${c.id}" data-v861-date="${d}" data-v861-shift="MANHA"><b>MANHÃ</b> ${attendanceShort(m.status)}${m.note?`<small>${esc(m.note)}</small>`:''}</span>
          <span class="${attendanceClass(t.status)}${clickClass}" data-v861-collab="${c.id}" data-v861-date="${d}" data-v861-shift="TARDE"><b>TARDE</b> ${attendanceShort(t.status)}${t.note?`<small>${esc(t.note)}</small>`:''}</span>
        </div>`;
      }).join('');
      return `<div class="attendance-row"><strong>${esc(c.full_name)}</strong>${cells}</div>`;
    }).join('');

    const calendar=`<div class="attendance-table"><div class="attendance-head"><span>Colaborador</span>${head}</div>${rows}</div>`;
    $('#weeklyAttendance').innerHTML=calendar;
    if($('#weeklyCalendarFull'))$('#weeklyCalendarFull').innerHTML=calendar;
  };

  document.addEventListener('click',e=>{
    const x=e.target.closest('.v861-admin-calendar');
    if(!x||!isAdmin())return;
    e.preventDefault();e.stopPropagation();
    const f=$('#attendanceForm');
    const existing=APP.attendance.find(a=>a.collaborator_id===x.dataset.v861Collab&&a.work_date===x.dataset.v861Date&&a.shift===x.dataset.v861Shift);
    f.elements.collaboratorId.value=x.dataset.v861Collab;
    f.elements.workDate.value=x.dataset.v861Date;
    f.elements.shift.value=x.dataset.v861Shift;
    f.elements.status.value=existing?.status||([0,6].includes(new Date(x.dataset.v861Date+'T12:00').getDay())?'EXTRA':'ABSENT');
    f.elements.note.value=existing?.note||'';
    const clear=$('#v86ClearAttendance');if(clear)clear.classList.toggle('hidden',!existing);
    $('#attendanceDialog').showModal();
  },true);

  // ============================================================
  // 2) FUNÇÕES — DUAS COLUNAS SIMÉTRICAS
  // ============================================================

  window.renderSchedule=function(){
    const week=V861.weekDates();
    const weekdays=week.slice(0,5);
    const extras=week.slice(5).filter(d=>APP.attendance.some(a=>a.work_date===d&&a.status==='EXTRA')||APP.assignments.some(a=>a.work_date===d));
    const dates=[...weekdays,...extras];
    const prod=APP.functions.filter(f=>f.function_type==='PRODUCAO');
    const accum=APP.functions.filter(f=>f.function_type==='ACUMULAVEL');

    const renderFunctionCards=(items,type)=>items.map(f=>`<article class="v861-fcard">
      <div class="v861-fmeta">
        <strong>${esc(f.name)}</strong>
        <small>${type==='PRODUCAO'?'Função de produção':`${timeHM(f.morning_start)||'07:00'}–${timeHM(f.morning_end)||'07:20'} · ${timeHM(f.afternoon_start)||'17:00'}–${timeHM(f.afternoon_end)||'17:20'}`}</small>
      </div>
      ${isAdmin()?`<div class="v861-factions"><button class="secondary v85-edit-function" data-function-id="${f.id}">Editar</button><button class="danger-action v85-delete-function" data-function-id="${f.id}">Excluir</button></div>`:''}
    </article>`).join('')||'<div class="empty-state">Nenhuma função cadastrada.</div>';

    $('#functionsList').innerHTML=`<div class="v861-function-columns">
      <section class="v861-function-panel">
        <header><div><p>RODÍZIO</p><h3>Funções de produção</h3><small>Uma por colaborador em cada turno.</small></div><b>${prod.length}</b></header>
        <div class="v861-function-list">${renderFunctionCards(prod,'PRODUCAO')}</div>
      </section>
      <section class="v861-function-panel v861-function-panel-accum">
        <header><div><p>ADICIONAIS</p><h3>Responsabilidades adicionais</h3><small>Acumuladas junto à função principal.</small></div><b>${accum.length}</b></header>
        <div class="v861-function-list">${renderFunctionCards(accum,'ACUMULAVEL')}</div>
      </section>
    </div>`;

    $('#scheduleList').innerHTML=dates.map(d=>{
      const sh={MANHA:APP.assignments.filter(a=>a.work_date===d&&a.shift==='MANHA'),TARDE:APP.assignments.filter(a=>a.work_date===d&&a.shift==='TARDE')};
      const weekend=[0,6].includes(new Date(d+'T12:00').getDay());
      return `<section class="schedule-day ${weekend?'v86-extra-day':''}">
        <div class="v86-day-head"><h3>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</h3>${weekend?'<span>EXTRA</span>':''}</div>
        <div class="schedule-shifts">${['MANHA','TARDE'].map(shift=>`<div class="schedule-shift"><h4>${shift==='MANHA'?'Manhã':'Tarde'}</h4>${groupAssignments(sh[shift]).map(g=>`<div class="assignment multi"><strong>${esc(g.name)}</strong><div class="assignment-functions">${g.items.map(a=>`<span class="${a.work_functions?.function_type==='ACUMULAVEL'?'accum':''}">${esc(functionAssignmentLabel(a))}${isAdmin()?`<button data-delete-assignment="${a.id}">×</button>`:''}</span>`).join('')}</div></div>`).join('')||'<div class="v86-no-assignment">Sem atribuição</div>'}</div>`).join('')}</div>
      </section>`;
    }).join('');
  };

  // ============================================================
  // 3) CUSTOS — REMOVE "+ INSUMO" E EVOLUI FORMULÁRIO
  // ============================================================

  const insumoBtn=$('#newCostItemBtn');
  if(insumoBtn)insumoBtn.remove();

  function enhanceCostForm(){
    const f=$('#costForm');if(!f||f.dataset.v861Ready)return;
    f.dataset.v861Ready='1';

    // Torna o catálogo existente opcional e menos central.
    const itemField=$('#costItemField');
    if(itemField){
      const txt=itemField.firstChild;
      if(txt&&txt.nodeType===3)txt.textContent='Insumo cadastrado (opcional)';
    }

    const quantity=f.elements.quantity;
    const unit=f.elements.unit;
    const total=f.elements.totalAmount;

    if(quantity){
      const label=quantity.closest('label');
      if(label&&label.firstChild)label.firstChild.textContent='Quantidade comprada';
    }
    if(total){
      const label=total.closest('label');
      if(label&&label.firstChild)label.firstChild.textContent='Valor total da compra (R$)';
      total.readOnly=true;
    }

    if(!f.elements.unitPrice){
      const label=document.createElement('label');
      label.innerHTML='Preço por unidade (R$)<input name="unitPrice" type="number" min="0" step="0.0001" value="0" required>';
      total.closest('label').before(label);
    }

    if(!f.elements.quantityPer1000){
      const label=document.createElement('label');
      label.innerHTML='Quantidade usada para 1.000 tijolos<input name="quantityPer1000" type="number" min="0" step="0.0001" value="0"><small class="field-hint">Use a mesma unidade informada acima. Ex.: sacos, kg, m³, litros.</small>';
      total.closest('label').before(label);
    }

    if(!$('#v861CostCalc')){
      const box=document.createElement('div');
      box.id='v861CostCalc';box.className='v861-cost-calc';
      box.innerHTML=`<div><small>Valor da compra</small><strong id="v861PurchaseCost">R$ 0,00</strong></div><div><small>Custo do material / 1.000 tijolos</small><strong id="v861Cost1000">R$ 0,00</strong></div>`;
      total.closest('label').after(box);
    }

    const calc=()=>{
      const q=num(f.elements.quantity?.value),price=num(f.elements.unitPrice?.value),q1000=num(f.elements.quantityPer1000?.value);
      const purchase=q*price,cost1000=q1000*price;
      if(f.elements.totalAmount)f.elements.totalAmount.value=purchase.toFixed(2);
      $('#v861PurchaseCost').textContent=money(purchase);
      $('#v861Cost1000').textContent=money(cost1000);
    };
    ['quantity','unitPrice','quantityPer1000'].forEach(n=>f.elements[n]?.addEventListener('input',calc));
    unit?.addEventListener('input',calc);
    calc();
  }
  enhanceCostForm();

  // Abre o formulário já preparado.
  if($('#newCostBtn')){
    $('#newCostBtn').onclick=()=>{
      const f=$('#costForm');f.reset();f.costDate.value=isoDate(new Date());$('#costCategory').value='CEMENT';populateCostItems();enhanceCostForm();
      f.elements.unitPrice.value='0';f.elements.quantityPer1000.value='0';f.elements.totalAmount.value='0';
      $('#v861PurchaseCost').textContent=money(0);$('#v861Cost1000').textContent=money(0);
      $('#costDialog').showModal();
    };
  }

  // Intercepta o submit para salvar os novos campos.
  $('#costForm').addEventListener('submit',async e=>{
    e.preventDefault();e.stopImmediatePropagation();
    const f=new FormData(e.currentTarget),cat=f.get('category'),needs=['CEMENT','SOIL','SAND','MATERIAL'].includes(cat);
    const q=num(f.get('quantity')),unitPrice=num(f.get('unitPrice')),q1000=num(f.get('quantityPer1000'));
    const payload={
      cost_date:f.get('costDate'),
      category:cat,
      catalog_item_id:needs?(f.get('catalogItemId')||null):null,
      description:f.get('description')||null,
      quantity:q||null,
      unit:f.get('unit')||null,
      unit_price:unitPrice,
      quantity_per_1000:q1000||null,
      cost_per_1000:q1000*unitPrice,
      total_amount:q*unitPrice,
      note:f.get('note')||null,
      created_by:APP.profile.id
    };
    const {error}=await sb.from('cost_entries').insert(payload);
    if(error)return toast(error.message,true);
    $('#costDialog').close();toast('Custo registrado.');loadCostsDashboard();
  },true);

  // ============================================================
  // 4) DASHBOARD DE CUSTOS — MOSTRA CUSTO REAL POR 1.000
  // ============================================================

  window.renderCosts=function(entries,payroll,prod){
    const manual=entries.reduce((s,x)=>s+num(x.total_amount),0);
    const people=payroll.reduce((s,x)=>s+num(x.gross_due),0);
    const total=manual+people;
    const bricks=prod.reduce((s,x)=>s+num(x.bricks),0);
    const days=Math.max(1,(new Date(APP.costEnd+'T12:00')-new Date(APP.costStart+'T12:00'))/864e5+1);
    const categories={COLABORADORES:people};
    entries.forEach(e=>categories[e.category]=(categories[e.category]||0)+num(e.total_amount));
    const max=Math.max(1,...Object.values(categories));
    const per1000ByCategory={};
    entries.forEach(e=>per1000ByCategory[e.category]=(per1000ByCategory[e.category]||0)+num(e.cost_per_1000));

    $('#costKpis').innerHTML=`
      <article class="kpi v86-cost-kpi"><small>Custo total</small><strong>${money(total)}</strong><span>${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}</span></article>
      <article class="kpi v86-cost-kpi"><small>Custo médio / 1.000 tijolos</small><strong>${bricks?money(total/bricks*1000):money(0)}</strong><span>todos os custos do período</span></article>
      <article class="kpi v86-cost-kpi"><small>Materiais / 1.000</small><strong>${money(Object.values(per1000ByCategory).reduce((a,b)=>a+b,0))}</strong><span>segundo consumos informados</span></article>
      <article class="kpi v86-cost-kpi"><small>Média diária de custo</small><strong>${money(total/days)}</strong><span>${days} dia(s) analisados</span></article>`;

    $('#costCategoryChart').innerHTML=`
      <div class="v86-chart-title"><div><small>COMPOSIÇÃO</small><strong>Distribuição dos custos</strong></div><span>Clique em uma categoria</span></div>
      <div class="v86-cost-bars">${Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
        <button type="button" class="v86-cost-row" data-v861-cost-category="${k}">
          <div class="v86-cost-row-top"><span>${costCategoryLabel(k)}</span><strong>${money(v)}</strong></div>
          <div class="v86-cost-track"><i style="width:${v/max*100}%"></i></div>
          <small>${k!=='COLABORADORES'&&per1000ByCategory[k]!=null?`${money(per1000ByCategory[k])} / 1.000 tijolos · `:''}${total?Math.round(v/total*100):0}% do total</small>
        </button>`).join('')}</div>`;

    const sortedProd=[...prod].sort((a,b)=>String(a.manufacture_date).localeCompare(String(b.manufacture_date)));
    const pmax=Math.max(1,...sortedProd.map(x=>num(x.bricks)));
    $('#costProductionSummary').innerHTML=`
      <div class="v86-chart-title"><div><small>PRODUÇÃO</small><strong>Ritmo no período</strong></div><span>${qty(bricks)} tijolos</span></div>
      <div class="v86-prod-stats"><div><small>Média/dia</small><strong>${qty(bricks/days)}</strong></div><div><small>Média/semana</small><strong>${qty(bricks/days*7)}</strong></div><div><small>Projeção 30 dias</small><strong>${qty(bricks/days*30)}</strong></div></div>
      <div class="v86-production-chart">${sortedProd.slice(-18).map(x=>`<div><i style="height:${Math.max(5,num(x.bricks)/pmax*100)}%"></i><small>${String(x.manufacture_date).slice(8)}</small><span>${qty(x.bricks)}</span></div>`).join('')}</div>`;

    $('#costEntriesList').innerHTML=entries.map(e=>`<div class="cost-entry v861-cost-entry"><div><strong>${costCategoryLabel(e.category)}${e.cost_catalog_items?.name?` · ${esc(e.cost_catalog_items.name)}`:''}</strong><small>${dateBR(e.cost_date)} · ${esc(e.description||'')}</small>${e.quantity_per_1000!=null?`<small>${qty(e.quantity_per_1000)} ${esc(e.unit||'un.')} / 1.000 tijolos · custo ${money(e.cost_per_1000||0)}</small>`:''}</div><strong>${money(e.total_amount)}</strong><button class="icon-danger" data-delete-cost="${e.id}">×</button></div>`).join('')||'<div class="empty-state">Nenhum custo lançado.</div>';
    populateCostItems();
  };

  // Detalhamento de categoria continua disponível.
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-v861-cost-category]');
    if(!b)return;
    const legacy=document.querySelector(`[data-v86-cost-category="${b.dataset.v861CostCategory}"]`);
    if(legacy)legacy.click();
  });

  // ============================================================
  // CSS
  // ============================================================

  const style=document.createElement('style');
  style.textContent=`
    /* Calendário: aparência anterior */
    .attendance-day .v861-admin-calendar{border:0!important;box-shadow:none!important;cursor:pointer}
    .attendance-day .v861-admin-calendar:hover{outline:1px solid rgba(28,85,69,.28);outline-offset:-1px}
    .attendance-day span b{display:block;font-size:7px;letter-spacing:.04em;margin-bottom:2px}

    /* Funções: duas colunas proporcionais */
    .v861-function-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-bottom:16px}
    .v861-function-panel{background:#fff;border:1px solid var(--line);border-radius:15px;padding:14px;min-width:0}
    .v861-function-panel-accum{border-top:3px solid #54788f}
    .v861-function-panel>header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:10px}
    .v861-function-panel>header p{font-size:7px;letter-spacing:.12em;font-weight:900;color:var(--muted);margin:0}.v861-function-panel>header h3{font-size:14px;margin:3px 0}.v861-function-panel>header small{font-size:8px;color:var(--muted)}
    .v861-function-panel>header b{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#edf3f0;color:var(--forest)}
    .v861-function-list{display:grid;gap:7px}.v861-fcard{display:flex;justify-content:space-between;align-items:center;gap:9px;border:1px solid #e1e7e4;border-radius:10px;padding:9px;background:#fbfcfb}
    .v861-fmeta{display:grid;gap:3px;min-width:0}.v861-fmeta strong{font-size:10px}.v861-fmeta small{font-size:7px;color:var(--muted)}
    .v861-factions{display:flex;gap:4px;flex-shrink:0}.v861-factions button{font-size:7px;padding:5px 7px}

    /* Custo por 1000 */
    .v861-cost-calc{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#edf4f1;border:1px solid #d5e3dd;border-radius:11px;padding:10px}
    .v861-cost-calc>div{display:grid;gap:3px}.v861-cost-calc small{font-size:8px;color:var(--muted)}.v861-cost-calc strong{font-size:15px;color:var(--forest)}
    #costForm input[readonly]{background:#f3f5f4;color:#43504c}
    .v861-cost-entry small+small{margin-top:3px;color:#315f52;font-weight:700}

    @media(max-width:760px){
      .v861-function-columns{grid-template-columns:1fr}
      .v861-cost-calc{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(style);

  setTimeout(()=>{
    try{
      enhanceCostForm();
      renderDashboardTeam();
      renderSchedule();
      if(isAdmin()&&typeof loadCostsDashboard==='function')loadCostsDashboard();
    }catch(err){console.error('TerraLote V8.6.1:',err);}
  },650);
})();
