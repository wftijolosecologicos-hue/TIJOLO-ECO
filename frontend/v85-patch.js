// TerraLote V8.6 — patch pontual
// Carregar DEPOIS de app.js e v85-patch.js.

(() => {
  'use strict';

  const V86 = {
    monday(d=new Date()){
      const x=new Date(d);x.setHours(12,0,0,0);
      const dow=x.getDay();
      x.setDate(x.getDate()-(dow===0?6:dow-1));
      return x;
    },
    addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x},
    key(d){return isoDate(d)},
    weekDates(){
      const m=this.monday();
      return [0,1,2,3,4].map(i=>this.key(this.addDays(m,i)));
    },
    weekendExtraDates(){
      const m=this.monday(), sat=this.key(this.addDays(m,5)), sun=this.key(this.addDays(m,6));
      return [sat,sun].filter(d =>
        APP.attendance.some(a=>a.work_date===d&&a.status==='EXTRA') ||
        APP.assignments.some(a=>a.work_date===d)
      );
    },
    defaultRecipe(){
      return APP.recipes.find(r=>r.code==='9-1-1'&&r.active!==false) ||
             APP.recipes.find(r=>r.is_default&&r.active!==false) ||
             APP.recipes.find(r=>r.active!==false);
    }
  };

  // ============================================================
  // 1) NOVO LOTE — APENAS 9-1-1, 8-2-1 E 10-1
  // ============================================================

  window.populateLotOptions = function(){
    $('#lotSoil').innerHTML=APP.soils.map(s=>
      `<option value="${s.id}">${esc(s.code)} · ${esc(s.name)} · ${esc(s.origin)}</option>`
    ).join('');

    $('#wateringPlan').innerHTML=APP.plans.map(p=>{
      const days=num(p.days);
      return `<option value="${p.id}">${esc(p.name)}${days>0?` · ${days} dia${days===1?'':'s'}`:' · sem molhação'}</option>`;
    }).join('');

    const allowed=['9-1-1','8-2-1','10-1'];
    const recipes=APP.recipes
      .filter(r=>allowed.includes(r.code)&&r.active!==false)
      .sort((a,b)=>allowed.indexOf(a.code)-allowed.indexOf(b.code));

    $('#recipeSelect').innerHTML=recipes.map(r=>
      `<option value="${r.id}" ${r.code==='9-1-1'?'selected':''}>${esc(r.code)}</option>`
    ).join('');

    const def=V86.defaultRecipe();
    if(def)$('#recipeSelect').value=def.id;
    updateRecipeSummary();
  };

  const oldSetDefaultLot=window.setDefaultLot;
  window.setDefaultLot=function(){
    if(oldSetDefaultLot)oldSetDefaultLot();
    const def=V86.defaultRecipe();
    if(def)$('#recipeSelect').value=def.id;
    updateRecipeSummary();
  };

  // ============================================================
  // 2) IMPRESSÃO DE LOTE — SOMENTE A FICHA DO LOTE
  // ============================================================

  function printLotRecord(l,extras=[],recipe=null){
    const recipeText=recipe
      ? `${esc(recipe.code)} · ${recipeLabel(recipe)}`
      : `${num(l.soil_buckets)} terra · ${num(l.sand_buckets)} areia · ${num(l.cement_buckets)} cimento`;

    const extraHtml=extras.length
      ? `<section><h2>Materiais extras</h2>${extras.map(x=>`<p><b>${esc(x.material_name)}</b> — ${qty(x.quantity)} ${esc(x.unit)}</p>`).join('')}${l.moisture_coefficient!=null?`<p>Coeficiente de umidade: <b>${esc(l.moisture_coefficient)}</b></p>`:''}</section>`
      : '';

    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Lote ${esc(l.lot_code)}</title>
    <style>
      @page{size:A4;margin:16mm}
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#14231f;margin:0;background:#fff}
      .sheet{max-width:760px;margin:auto}.brand{border-bottom:3px solid #164c40;padding-bottom:12px;margin-bottom:20px}
      .brand small{font-size:10px;letter-spacing:.14em;color:#65756f}.brand h1{margin:5px 0 0;font-size:25px}
      .code{font-size:33px;font-weight:800;letter-spacing:.03em;color:#123f35;margin:18px 0}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.cell{border:1px solid #d9e1de;border-radius:9px;padding:11px;min-height:62px}
      .cell small{display:block;text-transform:uppercase;font-size:8px;letter-spacing:.08em;color:#6c7975;margin-bottom:6px}
      .cell strong{font-size:13px}section{margin-top:18px;border-top:1px solid #d9e1de;padding-top:13px}section h2{font-size:13px;margin:0 0 9px}
      section p{font-size:11px;margin:5px 0}.foot{margin-top:28px;border-top:1px solid #d9e1de;padding-top:8px;font-size:8px;color:#74807c;display:flex;justify-content:space-between}
      @media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
    </style></head><body><div class="sheet">
      <div class="brand"><small>TERRALOTE · RASTREABILIDADE</small><h1>Ficha do lote</h1></div>
      <div class="code">${esc(l.lot_code)}</div>
      <div class="grid">
        <div class="cell"><small>Fabricação</small><strong>${dateBR(l.manufactured_at,true)}</strong></div>
        <div class="cell"><small>Turno</small><strong>${shiftLabel(l.shift)}</strong></div>
        <div class="cell"><small>Quantidade</small><strong>${qty(l.quantity)} tijolos</strong></div>
        <div class="cell"><small>Responsável</small><strong>${esc(l.responsible_snapshot)}</strong></div>
        <div class="cell"><small>Terra / origem</small><strong>${esc(l.soil_code||l.soil_name||'—')}</strong></div>
        <div class="cell"><small>Cura programada</small><strong>${num(l.cure_days)} dias</strong></div>
      </div>
      <section><h2>Traço</h2><p><b>${recipeText}</b></p><p>Tipo de cimento: <b>${esc(l.cement_type||'—')}</b></p></section>
      <section><h2>Proteção e molhação</h2><p>Plástico-filme: <b>${l.plastic_wrapped?'SIM':'NÃO'}</b></p>${!l.plastic_wrapped&&l.watering_plan_name?`<p>Plano: <b>${esc(l.watering_plan_name)}</b></p>`:''}</section>
      ${extraHtml}
      ${l.notes?`<section><h2>Observações</h2><p>${esc(l.notes)}</p></section>`:''}
      <div class="foot"><span>TerraLote · Controle institucional</span><span>Impresso em ${new Date().toLocaleString('pt-BR')}</span></div>
    </div><script>window.onload=()=>setTimeout(()=>window.print(),120);<\/script></body></html>`;

    const w=window.open('','_blank','width=900,height=760');
    if(!w)return toast('O navegador bloqueou a janela de impressão.',true);
    w.document.open();w.document.write(html);w.document.close();
  }

  window.showLotDetail=async function(id){
    const l=APP.lots.find(x=>x.id===id)||(await sb.from('v_lot_operational').select('*').eq('id',id).single()).data;
    if(!l)return;
    const [{data:extras},{data:rawLot}]=await Promise.all([
      sb.from('lot_extra_materials').select('*').eq('lot_id',id),
      sb.from('lots').select('*').eq('id',id).single()
    ]);
    const merged={...rawLot,...l};
    const r=APP.recipes.find(x=>x.id===merged.recipe_id);
    const recipeText=r?`${esc(r.code)} · ${recipeLabel(r)}`:`${merged.soil_buckets} terra · ${merged.sand_buckets} areia · ${merged.cement_buckets} cimento`;

    $('#detailContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">RASTREABILIDADE</p><h2>${esc(merged.lot_code)}</h2></div><button class="icon" data-close="detailDialog">×</button></div>
      <div class="detail-grid">
        <div class="detail-cell"><small>Fabricação</small><strong>${dateBR(merged.manufactured_at,true)}</strong></div>
        <div class="detail-cell"><small>Turno</small><strong>${shiftLabel(merged.shift)}</strong></div>
        <div class="detail-cell"><small>Produção</small><strong>${qty(merged.quantity)}</strong></div>
        <div class="detail-cell"><small>Responsável</small><strong>${esc(merged.responsible_snapshot)}</strong></div>
        <div class="detail-cell"><small>Terra</small><strong>${esc(merged.soil_code||'')}</strong></div>
        <div class="detail-cell"><small>Cura</small><strong>${merged.cure_days} dias</strong></div>
      </div>
      <h3>Traço</h3><p><strong>${recipeText}</strong> · Cimento ${esc(merged.cement_type)}</p>
      ${extras?.length?`<h3>Materiais extras</h3><p>${extras.map(x=>`${esc(x.material_name)}: ${x.quantity} ${esc(x.unit)}`).join(' · ')}</p>${merged.moisture_coefficient!=null?`<p>Coeficiente de umidade: <strong>${merged.moisture_coefficient}</strong></p>`:''}`:''}
      <p>Plástico-filme: <strong>${merged.plastic_wrapped?'SIM':'NÃO'}</strong></p>
      <div class="dialog-actions">
        <button class="secondary" id="v86PrintLot">Imprimir ficha</button>
        ${(isAdmin()||APP.profile?.can_delete_lots)?`<button class="secondary danger-action" data-delete-lot="${merged.id}">Excluir lote</button>`:''}
      </div>`;

    $('#v86PrintLot').onclick=()=>printLotRecord(merged,extras||[],r);
    $('#detailDialog').showModal();
  };

  // ============================================================
  // 3) CALENDÁRIO — ADMIN CLICA DIRETO NO TURNO
  // ============================================================

  function addAttendanceClearButton(){
    const f=$('#attendanceForm');
    if(!f||$('#v86ClearAttendance'))return;
    const btn=document.createElement('button');
    btn.type='button';btn.id='v86ClearAttendance';btn.className='secondary danger-action';
    btn.textContent='Remover marcação';
    btn.onclick=async()=>{
      const id=f.elements.collaboratorId.value,date=f.elements.workDate.value,shift=f.elements.shift.value;
      if(!id||!date||!shift)return;
      const {error}=await sb.from('attendance_exceptions')
        .delete().eq('collaborator_id',id).eq('work_date',date).eq('shift',shift);
      if(error)return toast(error.message,true);
      if([0,6].includes(new Date(date+'T12:00').getDay())){
        await sb.rpc('refresh_extra_schedule_for_day',{p_work_date:date});
      }
      $('#attendanceDialog').close();toast('Marcação removida.');bootstrap();
    };
    const submit=f.querySelector('button[type=submit]');
    submit?.parentNode?.insertBefore(btn,submit);
  }
  addAttendanceClearButton();

  function openCalendarAttendance(collabId,date,shift){
    if(!isAdmin())return;
    const f=$('#attendanceForm'),existing=APP.attendance.find(a=>a.collaborator_id===collabId&&a.work_date===date&&a.shift===shift);
    f.elements.collaboratorId.value=collabId;
    f.elements.workDate.value=date;
    f.elements.shift.value=shift;
    f.elements.status.value=existing?.status||([0,6].includes(new Date(date+'T12:00').getDay())?'EXTRA':'ABSENT');
    f.elements.note.value=existing?.note||'';
    $('#v86ClearAttendance').classList.toggle('hidden',!existing);
    $('#attendanceDialog').showModal();
  }

  // Substitui o save de presença para recalcular sábado/domingo automaticamente.
  $('#attendanceForm').addEventListener('submit',async e=>{
    e.preventDefault();e.stopImmediatePropagation();
    const f=new FormData(e.currentTarget);
    const payload={
      collaborator_id:f.get('collaboratorId'),
      work_date:f.get('workDate'),
      shift:f.get('shift'),
      status:f.get('status'),
      note:f.get('note')||null,
      created_by:APP.profile.id
    };
    const {error}=await sb.from('attendance_exceptions').upsert(payload,{onConflict:'collaborator_id,work_date,shift'});
    if(error)return toast(error.message,true);
    if([0,6].includes(new Date(payload.work_date+'T12:00').getDay())){
      const {error:extraError}=await sb.rpc('refresh_extra_schedule_for_day',{p_work_date:payload.work_date});
      if(extraError)console.error(extraError);
    }
    $('#attendanceDialog').close();toast('Calendário atualizado.');bootstrap();
  },true);

  // ============================================================
  // 4) CALENDÁRIO SEMANAL: SEGUNDA → DOMINGO
  // ============================================================

  window.renderDashboardTeam=function(){
    const weekDays=[...V86.weekDates(),...[
      V86.key(V86.addDays(V86.monday(),5)),
      V86.key(V86.addDays(V86.monday(),6))
    ]];

    // Escala da visão geral: semana operacional completa + extras.
    const scheduleDates=[...V86.weekDates(),...V86.weekendExtraDates()];
    $('#dashboardSchedule').innerHTML=scheduleDates.map(d=>{
      const rows=APP.assignments.filter(a=>a.work_date===d);
      return `<section class="dash-schedule-day ${rows.length?'':'v86-empty-day'}">
        <header><strong>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit'})}</strong></header>
        ${['MANHA','TARDE'].map(sh=>{
          const groups=groupAssignments(rows.filter(a=>a.shift===sh));
          return `<div><small>${sh==='MANHA'?'MANHÃ':'TARDE'}</small><div>${groups.map(g=>`<span><b>${esc(g.name)}</b> ${g.items.map(a=>esc(functionAssignmentLabel(a))).join(' + ')}</span>`).join('')||'<em>Sem atribuição</em>'}</div></div>`;
        }).join('')}
      </section>`;
    }).join('');

    const collabs=APP.collaborators.filter(c=>c.status!=='INACTIVE');
    const head=weekDays.map(d=>`<span>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit'})}</span>`).join('');
    const rows=collabs.map(c=>{
      const cells=weekDays.map(d=>{
        const m=attendanceState(c.id,d,'MANHA'),t=attendanceState(c.id,d,'TARDE');
        return `<div class="attendance-day">
          <button type="button" class="${attendanceClass(m.status)} v86-calendar-shift" data-calendar-collab="${c.id}" data-calendar-date="${d}" data-calendar-shift="MANHA"><b>MANHÃ</b> ${attendanceShort(m.status)}${m.note?`<small>${esc(m.note)}</small>`:''}</button>
          <button type="button" class="${attendanceClass(t.status)} v86-calendar-shift" data-calendar-collab="${c.id}" data-calendar-date="${d}" data-calendar-shift="TARDE"><b>TARDE</b> ${attendanceShort(t.status)}${t.note?`<small>${esc(t.note)}</small>`:''}</button>
        </div>`;
      }).join('');
      return `<div class="attendance-row"><strong>${esc(c.full_name)}</strong>${cells}</div>`;
    }).join('');
    const calendar=`<div class="attendance-table"><div class="attendance-head"><span>Colaborador</span>${head}</div>${rows}</div>`;
    $('#weeklyAttendance').innerHTML=calendar;
    if($('#weeklyCalendarFull'))$('#weeklyCalendarFull').innerHTML=calendar;
  };

  document.addEventListener('click',e=>{
    const c=e.target.closest('.v86-calendar-shift');
    if(c&&isAdmin()){
      e.preventDefault();e.stopPropagation();
      openCalendarAttendance(c.dataset.calendarCollab,c.dataset.calendarDate,c.dataset.calendarShift);
    }
  },true);

  // ============================================================
  // 5) ESCALA — SEMANA COMPLETA + FUNÇÕES MELHOR ORGANIZADAS
  // ============================================================

  window.openRotationDialog=function(){
    const monday=V86.key(V86.monday());
    $('#rotationForm [name=startDate]').value=monday;
    const daysField=$('#rotationForm [name=days]');
    if(daysField){daysField.value='5';daysField.readOnly=true;}

    const prod=APP.functions.filter(f=>f.function_type==='PRODUCAO');
    const accum=APP.functions.filter(f=>f.function_type==='ACUMULAVEL');

    $('#rotationAccumFunctions').innerHTML=`
      <div class="v86-rotation-block">
        <div class="v86-rotation-title"><span>1</span><div><strong>Funções de produção</strong><small>Rodízio obrigatório · uma função por colaborador/turno</small></div></div>
        <div class="v86-production-pills">${prod.map((f,i)=>`<span><b>${i+1}</b>${esc(f.name)}</span>`).join('')}</div>
      </div>
      <div class="v86-rotation-block">
        <div class="v86-rotation-title"><span>2</span><div><strong>Funções acumuláveis</strong><small>Selecione apenas as que devem entrar nesta semana</small></div></div>
        <div class="v86-accum-list">${accum.map(f=>`<label>
          <input type="checkbox" value="${f.id}">
          <div><strong>${esc(f.name)}</strong><small>${timeHM(f.morning_start)||'07:00'}–${timeHM(f.morning_end)||'07:20'} · ${timeHM(f.afternoon_start)||'17:00'}–${timeHM(f.afternoon_end)||'17:20'}</small></div>
        </label>`).join('')||'<small>Nenhuma função acumulável cadastrada.</small>'}</div>
      </div>
      <div class="v86-week-note"><strong>Semana:</strong> segunda a sexta. Sábado/domingo entram automaticamente quando você marcar trabalho EXTRA no Calendário.</div>`;
    $('#rotationDialog').showModal();
  };
  $('#generateRotationBtn').onclick=openRotationDialog;

  window.renderSchedule=function(){
    const dates=[...V86.weekDates(),...V86.weekendExtraDates()];
    const prod=APP.functions.filter(f=>f.function_type==='PRODUCAO');
    const accum=APP.functions.filter(f=>f.function_type==='ACUMULAVEL');

    $('#functionsList').innerHTML=`
      <div class="v86-functions-wrap">
        <section class="v86-functions-section">
          <div class="v86-functions-head"><div><small>PRODUÇÃO</small><h3>Funções do rodízio</h3><p>Sem horário individual. Uma função de produção por colaborador em cada turno.</p></div><span>${prod.length}</span></div>
          <div class="v86-functions-grid">${prod.map(f=>`<article><div><strong>${esc(f.name)}</strong><small>Produção</small></div>${isAdmin()?`<div class="v86-function-actions"><button class="secondary v85-edit-function" data-function-id="${f.id}">Editar</button><button class="danger-action v85-delete-function" data-function-id="${f.id}">Excluir</button></div>`:''}</article>`).join('')}</div>
        </section>
        <section class="v86-functions-section v86-accum-section">
          <div class="v86-functions-head"><div><small>ACUMULÁVEIS</small><h3>Responsabilidades adicionais</h3><p>Podem acompanhar uma função de produção.</p></div><span>${accum.length}</span></div>
          <div class="v86-functions-grid">${accum.map(f=>`<article><div><strong>${esc(f.name)}</strong><small>${timeHM(f.morning_start)||'07:00'}–${timeHM(f.morning_end)||'07:20'} · ${timeHM(f.afternoon_start)||'17:00'}–${timeHM(f.afternoon_end)||'17:20'}</small></div>${isAdmin()?`<div class="v86-function-actions"><button class="secondary v85-edit-function" data-function-id="${f.id}">Editar</button><button class="danger-action v85-delete-function" data-function-id="${f.id}">Excluir</button></div>`:''}</article>`).join('')}</div>
        </section>
      </div>`;

    $('#scheduleList').innerHTML=dates.map(d=>{
      const sh={MANHA:APP.assignments.filter(a=>a.work_date===d&&a.shift==='MANHA'),TARDE:APP.assignments.filter(a=>a.work_date===d&&a.shift==='TARDE')};
      const dow=new Date(d+'T12:00').getDay();
      const extra=dow===0||dow===6;
      return `<section class="schedule-day ${extra?'v86-extra-day':''}">
        <div class="v86-day-head"><h3>${new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'})}</h3>${extra?'<span>EXTRA</span>':''}</div>
        <div class="schedule-shifts">${['MANHA','TARDE'].map(shift=>`<div class="schedule-shift"><h4>${shift==='MANHA'?'Manhã':'Tarde'}</h4>${
          groupAssignments(sh[shift]).map(g=>`<div class="assignment multi"><strong>${esc(g.name)}</strong><div class="assignment-functions">${g.items.map(a=>`<span class="${a.work_functions?.function_type==='ACUMULAVEL'?'accum':''}">${esc(functionAssignmentLabel(a))}${isAdmin()?`<button data-delete-assignment="${a.id}" title="Remover">×</button>`:''}</span>`).join('')}</div></div>`).join('')||'<div class="v86-no-assignment">Sem atribuição</div>'
        }</div>`).join('')}</div>
      </section>`;
    }).join('');
  };

  // ============================================================
  // 6) CUSTOS — VOLTA À BASE INSTITUCIONAL, MAIS PROFISSIONAL
  // ============================================================

  let costDetailData=null;

  window.renderCosts=function(entries,payroll,prod){
    costDetailData={entries,payroll,prod};

    const manual=entries.reduce((s,x)=>s+num(x.total_amount),0);
    const people=payroll.reduce((s,x)=>s+num(x.gross_due),0);
    const total=manual+people;
    const bricks=prod.reduce((s,x)=>s+num(x.bricks),0);
    const days=Math.max(1,(new Date(APP.costEnd+'T12:00')-new Date(APP.costStart+'T12:00'))/864e5+1);
    const categories={COLABORADORES:people};
    entries.forEach(e=>categories[e.category]=(categories[e.category]||0)+num(e.total_amount));
    const max=Math.max(1,...Object.values(categories));
    const costPerBrick=bricks?total/bricks:0;
    const laborShare=total?people/total*100:0;

    $('#costKpis').innerHTML=`
      <article class="kpi v86-cost-kpi"><small>Custo total</small><strong>${money(total)}</strong><span>${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}</span></article>
      <article class="kpi v86-cost-kpi"><small>Custo por tijolo</small><strong>${money(costPerBrick)}</strong><span>${qty(bricks)} tijolos</span></article>
      <article class="kpi v86-cost-kpi"><small>Mão de obra</small><strong>${money(people)}</strong><span>${Math.round(laborShare)}% do custo total</span></article>
      <article class="kpi v86-cost-kpi"><small>Média diária de custo</small><strong>${money(total/days)}</strong><span>${days} dia(s) analisados</span></article>`;

    $('#costCategoryChart').innerHTML=`
      <div class="v86-chart-title"><div><small>COMPOSIÇÃO</small><strong>Distribuição dos custos</strong></div><span>Clique em uma categoria</span></div>
      <div class="v86-cost-bars">${Object.entries(categories).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
        <button type="button" class="v86-cost-row" data-v86-cost-category="${k}">
          <div class="v86-cost-row-top"><span>${costCategoryLabel(k)}</span><strong>${money(v)}</strong></div>
          <div class="v86-cost-track"><i style="width:${v/max*100}%"></i></div>
          <small>${total?Math.round(v/total*100):0}% do custo total</small>
        </button>`).join('')}</div>`;

    const sortedProd=[...prod].sort((a,b)=>String(a.manufacture_date).localeCompare(String(b.manufacture_date)));
    const pmax=Math.max(1,...sortedProd.map(x=>num(x.bricks)));
    $('#costProductionSummary').innerHTML=`
      <div class="v86-chart-title"><div><small>PRODUÇÃO</small><strong>Ritmo no período</strong></div><span>${qty(bricks)} tijolos</span></div>
      <div class="v86-prod-stats">
        <div><small>Média/dia</small><strong>${qty(bricks/days)}</strong></div>
        <div><small>Média/semana</small><strong>${qty(bricks/days*7)}</strong></div>
        <div><small>Projeção 30 dias</small><strong>${qty(bricks/days*30)}</strong></div>
      </div>
      <div class="v86-production-chart">${sortedProd.slice(-18).map(x=>`<div><i style="height:${Math.max(5,num(x.bricks)/pmax*100)}%"></i><small>${String(x.manufacture_date).slice(8)}</small><span>${qty(x.bricks)}</span></div>`).join('')}</div>`;

    $('#costEntriesList').innerHTML=entries.map(e=>`<div class="cost-entry"><div><strong>${costCategoryLabel(e.category)}${e.cost_catalog_items?.name?` · ${esc(e.cost_catalog_items.name)}`:''}</strong><small>${dateBR(e.cost_date)} · ${esc(e.description||'')}</small></div><strong>${money(e.total_amount)}</strong><button class="icon-danger" data-delete-cost="${e.id}">×</button></div>`).join('')||'<div class="empty-state">Nenhum custo lançado.</div>';
    populateCostItems();
  };

  function showCostCategory(category){
    if(!costDetailData)return;
    const {entries,payroll}=costDetailData;
    let title=costCategoryLabel(category),rows='';
    if(category==='COLABORADORES'){
      rows=payroll.map(r=>`<div class="v86-cost-detail-row"><div><strong>${esc(r.full_name)}</strong><small>Diárias ${money(r.base_due)} · comissão ${money(r.commission_due)}</small></div><strong>${money(r.gross_due)}</strong></div>`).join('');
    }else{
      rows=entries.filter(e=>e.category===category).map(e=>`<div class="v86-cost-detail-row"><div><strong>${dateBR(e.cost_date)} · ${esc(e.cost_catalog_items?.name||e.description||title)}</strong><small>${esc(e.note||e.description||'')}</small></div><strong>${money(e.total_amount)}</strong></div>`).join('');
    }
    const d=$('#v85CostDetail');
    if(!d)return;
    $('#v85CostDetailContent').innerHTML=`<div class="dialog-head"><div><p class="eyebrow">CUSTOS</p><h2>${title}</h2><small>${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}</small></div><button class="icon" onclick="document.getElementById('v85CostDetail').close()">×</button></div><div class="v86-cost-detail-list">${rows||'<div class="empty-state">Sem registros.</div>'}</div>`;
    d.showModal();
  }

  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-v86-cost-category]');
    if(b){e.preventDefault();showCostCategory(b.dataset.v86CostCategory);}
  });

  // ============================================================
  // 7) BOTÃO DE SENHA ADMIN MAIS DISCRETO
  // ============================================================

  if($('#adminPasswordBtn')){
    $('#adminPasswordBtn').classList.add('v86-admin-password');
    $('#adminPasswordBtn').textContent='Alterar senha';
  }

  // ============================================================
  // ESTILO PONTUAL
  // ============================================================

  const style=document.createElement('style');
  style.textContent=`
    #adminPasswordBtn.v86-admin-password{background:transparent!important;border:0!important;color:rgba(235,245,241,.68)!important;text-align:left!important;font-size:8px!important;padding:5px 8px!important;box-shadow:none!important;text-decoration:underline;text-underline-offset:3px}
    #adminPasswordBtn.v86-admin-password:hover{color:#fff!important}

    .v86-calendar-shift{display:block;width:100%;border:1px solid var(--line);border-radius:7px;padding:5px;background:inherit;color:inherit;text-align:left;cursor:default;font:inherit}
    .admin-only:not(.hidden) .v86-calendar-shift,.v86-calendar-shift:hover{cursor:pointer}
    .v86-calendar-shift small{display:block}
    .v86-calendar-shift.bad{border-color:#d46b61;background:#fff0ee}
    .v86-calendar-shift.extra{border-color:#3f7b69;background:#edf7f3}

    .v86-functions-wrap{display:grid;gap:12px;margin-bottom:15px}
    .v86-functions-section{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px}
    .v86-functions-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:11px}
    .v86-functions-head small{font-size:8px;letter-spacing:.12em;color:var(--muted);font-weight:800}
    .v86-functions-head h3{font-size:14px;margin:3px 0}.v86-functions-head p{font-size:9px;color:var(--muted);margin:0}
    .v86-functions-head>span{min-width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#edf4f1;color:var(--forest);font-weight:800}
    .v86-functions-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
    .v86-functions-grid article{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid #e0e7e4;border-radius:10px;padding:10px;background:#fbfcfb}
    .v86-functions-grid article>div:first-child{display:grid;gap:3px}.v86-functions-grid small{font-size:8px;color:var(--muted)}
    .v86-function-actions{display:flex;gap:4px}.v86-function-actions button{font-size:8px;padding:5px 7px}
    .v86-accum-section{border-left:4px solid #315f84}

    .v86-rotation-block{border:1px solid var(--line);border-radius:12px;padding:12px;margin:9px 0;background:#fbfcfb}
    .v86-rotation-title{display:flex;gap:9px;align-items:center;margin-bottom:9px}.v86-rotation-title>span{width:25px;height:25px;border-radius:8px;background:var(--forest);color:#fff;display:grid;place-items:center;font-size:9px;font-weight:800}
    .v86-rotation-title div{display:grid}.v86-rotation-title small{font-size:8px;color:var(--muted)}
    .v86-production-pills{display:flex;flex-wrap:wrap;gap:6px}.v86-production-pills span{display:flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:6px 9px;background:#fff;font-size:9px}.v86-production-pills b{width:18px;height:18px;display:grid;place-items:center;background:#e8f1ee;border-radius:50%}
    .v86-accum-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px}.v86-accum-list label{display:flex;align-items:flex-start;gap:7px;border:1px solid var(--line);padding:9px;border-radius:9px;background:#fff}.v86-accum-list label div{display:grid}.v86-accum-list small{font-size:8px;color:var(--muted)}
    .v86-week-note{font-size:8px;color:var(--muted);background:#f1f5f3;border-radius:9px;padding:9px}
    .v86-day-head{display:flex;justify-content:space-between;align-items:center}.v86-day-head span{font-size:7px;font-weight:900;letter-spacing:.1em;background:#e7f0ec;color:#245a4d;border-radius:99px;padding:4px 7px}
    .v86-no-assignment{font-size:9px;color:var(--muted);padding:7px 0}.v86-extra-day{border-left:4px solid #3d7866}

    #costKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
    .v86-cost-kpi{border-top:3px solid #2e6a5a}
    .v86-chart-title{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:13px}.v86-chart-title div{display:grid}.v86-chart-title small{font-size:8px;letter-spacing:.1em;color:var(--muted);font-weight:800}.v86-chart-title strong{font-size:13px;margin-top:2px}.v86-chart-title>span{font-size:8px;color:var(--muted)}
    .v86-cost-bars{display:grid;gap:10px}.v86-cost-row{border:0;background:transparent;padding:5px 0;text-align:left;cursor:pointer}.v86-cost-row:hover{background:#f7faf8;border-radius:8px;padding-left:6px;padding-right:6px}
    .v86-cost-row-top{display:flex;justify-content:space-between;gap:8px;font-size:10px}.v86-cost-track{height:8px;background:#e9efec;border-radius:999px;overflow:hidden;margin:5px 0}.v86-cost-track i{display:block;height:100%;background:linear-gradient(90deg,#255f50,#75a995);border-radius:999px}.v86-cost-row small{font-size:7px;color:var(--muted)}
    .v86-prod-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.v86-prod-stats div{border:1px solid var(--line);border-radius:9px;padding:9px}.v86-prod-stats small{display:block;font-size:7px;color:var(--muted)}.v86-prod-stats strong{font-size:13px}
    .v86-production-chart{height:135px;display:flex;gap:5px;align-items:flex-end;padding-top:18px;margin-top:10px;border-bottom:1px solid var(--line)}.v86-production-chart>div{height:100%;flex:1;min-width:8px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;position:relative}.v86-production-chart i{width:70%;background:linear-gradient(#72a692,#245e50);border-radius:5px 5px 0 0;min-height:5px}.v86-production-chart small{font-size:6px;color:var(--muted);margin-top:3px}.v86-production-chart span{display:none;position:absolute;top:0;font-size:7px;font-weight:800}.v86-production-chart>div:hover span{display:block}
    .v86-cost-detail-list{padding:14px;display:grid;gap:5px}.v86-cost-detail-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid var(--line);padding:9px}.v86-cost-detail-row>div{display:grid}.v86-cost-detail-row small{font-size:8px;color:var(--muted)}

    @media(max-width:760px){
      #costKpis{grid-template-columns:1fr 1fr}.v86-functions-grid{grid-template-columns:1fr}.v86-accum-list{grid-template-columns:1fr}
      .v86-prod-stats{grid-template-columns:1fr 1fr 1fr}.v86-function-actions{flex-direction:column}
    }
  `;
  document.head.appendChild(style);

  // Reaplica as visualizações depois que o patch V8.5 terminou.
  setTimeout(()=>{
    try{
      populateLotOptions();
      renderDashboardTeam();
      renderSchedule();
      if(isAdmin() && typeof loadCostsDashboard==='function') loadCostsDashboard();
    }catch(err){console.error('TerraLote V8.6:',err);}
  },550);
})();
