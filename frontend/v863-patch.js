// TerraLote V8.6.3 — redesign institucional da aba Custos
// Carregar DEPOIS dos patches atuais.
// Este arquivo altera apenas apresentação/interação de Custos.

(() => {
  'use strict';

  const V863 = {
    moneyNumber(v){ return Number(v || 0); },
    categoryLabel(k){
      return ({
        COLABORADORES:'Colaboradores',
        CEMENT:'Cimento',
        SOIL:'Terra',
        SAND:'Areia',
        MATERIAL:'Outros materiais',
        ELECTRICITY:'Eletricidade',
        WATER:'Água',
        RENT:'Aluguel',
        OTHER:'Outros custos'
      })[k] || k;
    },
    categoryOrder:['COLABORADORES','CEMENT','SOIL','SAND','MATERIAL','ELECTRICITY','WATER','RENT','OTHER'],
    lastData:null
  };

  function ensureCostDetailDialog(){
    let d=document.getElementById('v863CostDetail');
    if(d) return d;
    d=document.createElement('dialog');
    d.id='v863CostDetail';
    d.className='analytics-dialog v863-cost-dialog';
    d.innerHTML='<div id="v863CostDetailContent"></div>';
    document.body.appendChild(d);
    return d;
  }
  ensureCostDetailDialog();

  function computeCostData(entries,payroll,prod){
    const labor = payroll.reduce((s,x)=>s+V863.moneyNumber(x.gross_due),0);
    const manual = entries.reduce((s,x)=>s+V863.moneyNumber(x.total_amount),0);
    const total = labor + manual;
    const bricks = prod.reduce((s,x)=>s+V863.moneyNumber(x.bricks),0);

    const start = APP.costStart ? new Date(APP.costStart+'T12:00:00') : new Date();
    const end = APP.costEnd ? new Date(APP.costEnd+'T12:00:00') : new Date();
    const days = Math.max(1, Math.round((end-start)/86400000)+1);

    const categories = { COLABORADORES: labor };
    entries.forEach(e=>{
      categories[e.category]=(categories[e.category]||0)+V863.moneyNumber(e.total_amount);
    });

    const per1000 = {};
    entries.forEach(e=>{
      per1000[e.category]=(per1000[e.category]||0)+V863.moneyNumber(e.cost_per_1000);
    });

    const totalMaterials1000 = ['CEMENT','SOIL','SAND','MATERIAL']
      .reduce((s,k)=>s+(per1000[k]||0),0);

    const costPer1000 = bricks > 0 ? total/bricks*1000 : 0;
    const avgDailyCost = total/days;
    const avgDailyProd = bricks/days;

    return {
      labor, manual, total, bricks, days, categories, per1000,
      totalMaterials1000, costPer1000, avgDailyCost, avgDailyProd
    };
  }

  function openCostDetail(type, payload){
    const dialog=ensureCostDetailDialog();
    const data=V863.lastData;
    if(!data) return;

    let title='Detalhamento';
    let subtitle=`${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}`;
    let content='';

    if(type==='category'){
      const category=payload;
      title=V863.categoryLabel(category);

      if(category==='COLABORADORES'){
        content=(data.payroll||[]).map(r=>`
          <div class="v863-detail-row">
            <div>
              <strong>${esc(r.full_name)}</strong>
              <small>Diárias ${money(r.base_due)} · Comissão ${money(r.commission_due)} · Adiantamentos ${money(r.advances||0)}</small>
            </div>
            <strong>${money(r.gross_due)}</strong>
          </div>`).join('') || '<div class="empty-state">Sem dados no período.</div>';
      } else {
        content=(data.entries||[])
          .filter(e=>e.category===category)
          .map(e=>`
            <div class="v863-detail-row">
              <div>
                <strong>${dateBR(e.cost_date)} · ${esc(e.cost_catalog_items?.name || e.description || V863.categoryLabel(category))}</strong>
                <small>
                  ${e.quantity!=null?`${qty(e.quantity)} ${esc(e.unit||'un.')} · `:''}
                  ${e.unit_price!=null?`${money(e.unit_price)}/un. · `:''}
                  ${e.cost_per_1000!=null?`${money(e.cost_per_1000)} / 1.000 tijolos`:''}
                </small>
              </div>
              <strong>${money(e.total_amount)}</strong>
            </div>`).join('') || '<div class="empty-state">Sem lançamentos nesta categoria.</div>';
      }
    }

    if(type==='kpi'){
      const k=payload;
      if(k==='total'){
        title='Custo total';
        content=V863.categoryOrder
          .filter(c=>(data.calc.categories[c]||0)>0)
          .map(c=>`
            <div class="v863-detail-row">
              <div><strong>${V863.categoryLabel(c)}</strong><small>Participação no custo total</small></div>
              <strong>${money(data.calc.categories[c]||0)}</strong>
            </div>`).join('');
      } else if(k==='per1000'){
        title='Custo por 1.000 tijolos';
        content=`
          <div class="v863-detail-hero">
            <small>Custo total equivalente</small>
            <strong>${money(data.calc.costPer1000)}</strong>
            <span>considerando todos os custos registrados no período</span>
          </div>
          <div class="v863-detail-row"><div><strong>Materiais informados / 1.000</strong><small>cimento, terra, areia e outros materiais</small></div><strong>${money(data.calc.totalMaterials1000)}</strong></div>
          <div class="v863-detail-row"><div><strong>Produção do período</strong><small>base do cálculo proporcional</small></div><strong>${qty(data.calc.bricks)} tijolos</strong></div>`;
      } else if(k==='production'){
        title='Produção no período';
        content=`
          <div class="v863-detail-hero">
            <small>Total produzido</small>
            <strong>${qty(data.calc.bricks)}</strong>
            <span>tijolos no período selecionado</span>
          </div>
          <div class="v863-detail-row"><div><strong>Média diária</strong></div><strong>${qty(data.calc.avgDailyProd)}</strong></div>
          <div class="v863-detail-row"><div><strong>Projeção semanal</strong></div><strong>${qty(data.calc.avgDailyProd*7)}</strong></div>
          <div class="v863-detail-row"><div><strong>Projeção 30 dias</strong></div><strong>${qty(data.calc.avgDailyProd*30)}</strong></div>`;
      }
    }

    document.getElementById('v863CostDetailContent').innerHTML=`
      <div class="dialog-head">
        <div>
          <p class="eyebrow">CUSTOS · ADMIN</p>
          <h2>${title}</h2>
          <small>${subtitle}</small>
        </div>
        <button class="icon" id="v863CostClose">×</button>
      </div>
      <div class="v863-detail-list">${content}</div>`;

    document.getElementById('v863CostClose').onclick=()=>dialog.close();
    dialog.showModal();
  }

  window.renderCosts=function(entries,payroll,prod){
    const calc=computeCostData(entries,payroll,prod);
    V863.lastData={entries,payroll,prod,calc};

    const categoryPairs=V863.categoryOrder
      .map(k=>[k,calc.categories[k]||0])
      .filter(([,v])=>v>0);

    const maxCategory=Math.max(1,...categoryPairs.map(([,v])=>v));

    // KPIs
    const kpis=document.getElementById('costKpis');
    if(kpis){
      kpis.innerHTML=`
        <button class="v863-kpi v863-kpi-primary" data-v863-kpi="total">
          <div class="v863-kpi-top"><small>CUSTO TOTAL</small><span>PERÍODO</span></div>
          <strong>${money(calc.total)}</strong>
          <p>${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}</p>
        </button>

        <button class="v863-kpi" data-v863-kpi="per1000">
          <div class="v863-kpi-top"><small>CUSTO / 1.000 TIJOLOS</small><span>EFICIÊNCIA</span></div>
          <strong>${money(calc.costPer1000)}</strong>
          <p>Todos os custos proporcionais à produção</p>
        </button>

        <button class="v863-kpi">
          <div class="v863-kpi-top"><small>MATERIAIS / 1.000</small><span>CONSUMO</span></div>
          <strong>${money(calc.totalMaterials1000)}</strong>
          <p>Consumo informado nos materiais</p>
        </button>

        <button class="v863-kpi" data-v863-kpi="production">
          <div class="v863-kpi-top"><small>PRODUÇÃO</small><span>PERÍODO</span></div>
          <strong>${qty(calc.bricks)}</strong>
          <p>${qty(calc.avgDailyProd)} tijolos/dia em média</p>
        </button>`;
    }

    // Composição dos custos
    const categoryChart=document.getElementById('costCategoryChart');
    if(categoryChart){
      categoryChart.innerHTML=`
        <div class="v863-panel-header">
          <div>
            <p>COMPOSIÇÃO</p>
            <h3>Distribuição dos custos</h3>
            <small>Participação por categoria no período selecionado</small>
          </div>
          <span>${money(calc.total)}</span>
        </div>

        <div class="v863-category-list">
          ${categoryPairs.map(([k,v])=>`
            <button class="v863-category-row" data-v863-category="${k}">
              <div class="v863-category-meta">
                <div>
                  <strong>${V863.categoryLabel(k)}</strong>
                  <small>${calc.total?Math.round(v/calc.total*100):0}% do total</small>
                </div>
                <strong>${money(v)}</strong>
              </div>
              <div class="v863-track"><i style="width:${(v/maxCategory)*100}%"></i></div>
              ${calc.per1000[k]!=null && k!=='COLABORADORES'
                ?`<small class="v863-per1000">${money(calc.per1000[k])} / 1.000 tijolos</small>`
                :''
              }
            </button>`).join('') || '<div class="empty-state">Sem custos registrados.</div>'}
        </div>`;
    }

    // Produção
    const prodPanel=document.getElementById('costProductionSummary');
    if(prodPanel){
      const sorted=[...prod].sort((a,b)=>String(a.manufacture_date).localeCompare(String(b.manufacture_date)));
      const maxProd=Math.max(1,...sorted.map(x=>V863.moneyNumber(x.bricks)));

      prodPanel.innerHTML=`
        <div class="v863-panel-header">
          <div>
            <p>PRODUÇÃO</p>
            <h3>Ritmo produtivo</h3>
            <small>Produção registrada no período</small>
          </div>
          <span>${qty(calc.bricks)} tijolos</span>
        </div>

        <div class="v863-prod-kpis">
          <div><small>MÉDIA / DIA</small><strong>${qty(calc.avgDailyProd)}</strong></div>
          <div><small>PROJEÇÃO 7 DIAS</small><strong>${qty(calc.avgDailyProd*7)}</strong></div>
          <div><small>PROJEÇÃO 30 DIAS</small><strong>${qty(calc.avgDailyProd*30)}</strong></div>
        </div>

        <div class="v863-production-chart">
          ${sorted.slice(-20).map(x=>`
            <div class="v863-prod-bar">
              <span>${qty(x.bricks)}</span>
              <i style="height:${Math.max(6,V863.moneyNumber(x.bricks)/maxProd*100)}%"></i>
              <small>${String(x.manufacture_date).slice(8,10)}</small>
            </div>`).join('') || '<div class="empty-state">Sem produção registrada.</div>'}
        </div>`;
    }

    // Lançamentos
    const list=document.getElementById('costEntriesList');
    if(list){
      list.innerHTML=`
        <div class="v863-table-head">
          <span>Data / Categoria</span>
          <span>Item</span>
          <span>Quantidade</span>
          <span>Custo / 1.000</span>
          <span>Valor</span>
          <span></span>
        </div>
        ${(entries||[]).map(e=>`
          <div class="v863-table-row">
            <div>
              <strong>${dateBR(e.cost_date)}</strong>
              <small>${V863.categoryLabel(e.category)}</small>
            </div>
            <div>
              <strong>${esc(e.cost_catalog_items?.name || e.description || '—')}</strong>
              <small>${esc(e.note||'')}</small>
            </div>
            <div>
              <strong>${e.quantity!=null?qty(e.quantity):'—'}</strong>
              <small>${esc(e.unit||'')}</small>
            </div>
            <div>
              <strong>${e.cost_per_1000!=null?money(e.cost_per_1000):'—'}</strong>
              <small>${e.quantity_per_1000!=null?`${qty(e.quantity_per_1000)} ${esc(e.unit||'')}`:''}</small>
            </div>
            <div class="v863-value">${money(e.total_amount)}</div>
            <div><button class="icon-danger" data-delete-cost="${e.id}">×</button></div>
          </div>`).join('') || '<div class="empty-state">Nenhum lançamento no período.</div>'}`;
    }

    if(typeof populateCostItems==='function')populateCostItems();
  };

  document.addEventListener('click',e=>{
    const cat=e.target.closest('[data-v863-category]');
    if(cat){
      e.preventDefault();
      openCostDetail('category',cat.dataset.v863Category);
      return;
    }
    const kpi=e.target.closest('[data-v863-kpi]');
    if(kpi){
      e.preventDefault();
      openCostDetail('kpi',kpi.dataset.v863Kpi);
    }
  });

  const style=document.createElement('style');
  style.textContent=`
    /* ===========================
       TerraLote V8.6.3 — Custos
       =========================== */

    #costs .section-head{margin-bottom:18px}
    #costs .section-head h2{font-size:23px;letter-spacing:-.025em}
    #costs .section-head p{max-width:620px}

    #costs .finance-toolbar{
      background:#f2f5f2;
      border:1px solid #dce4df;
      border-radius:14px;
      padding:9px 10px;
      margin-bottom:16px;
      box-shadow:none;
    }

    #costs .segmented{
      background:#e7ede9;
      padding:3px;
      border-radius:10px;
    }
    #costs .segmented button{
      min-width:66px;
      border:0;
      border-radius:8px;
      font-size:9px;
      font-weight:800;
      color:#65736d;
    }
    #costs .segmented button.active{
      background:#fff;
      color:#143f35;
      box-shadow:0 1px 4px rgba(26,67,55,.08);
    }

    #costs .date-range{
      gap:7px;
      color:#6e7b76;
      font-size:9px;
    }
    #costs .date-range input{
      border-color:#d5dfda;
      background:#fff;
      min-height:36px;
    }
    #costs .date-range .secondary{
      min-height:36px;
      padding-inline:14px;
    }

    #costKpis{
      display:grid!important;
      grid-template-columns:repeat(4,minmax(0,1fr))!important;
      gap:12px!important;
      margin-bottom:14px;
    }

    .v863-kpi{
      position:relative;
      min-width:0;
      border:1px solid #dce4df;
      border-radius:15px;
      background:#fff;
      padding:15px;
      text-align:left;
      cursor:default;
      transition:.18s ease;
      box-shadow:0 2px 9px rgba(26,62,52,.035);
    }
    .v863-kpi[data-v863-kpi]{cursor:pointer}
    .v863-kpi[data-v863-kpi]:hover{
      transform:translateY(-1px);
      border-color:#c6d7d0;
      box-shadow:0 8px 22px rgba(26,62,52,.07);
    }
    .v863-kpi-primary{
      border-top:3px solid #194f42;
      padding-top:13px;
    }
    .v863-kpi-top{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:8px;
      margin-bottom:10px;
    }
    .v863-kpi-top small{
      color:#687771;
      font-size:7px;
      font-weight:900;
      letter-spacing:.09em;
    }
    .v863-kpi-top span{
      padding:3px 6px;
      border-radius:99px;
      background:#eef3f0;
      color:#65746e;
      font-size:6px;
      font-weight:900;
      letter-spacing:.08em;
    }
    .v863-kpi>strong{
      display:block;
      color:#102f28;
      font-size:22px;
      line-height:1;
      letter-spacing:-.035em;
      margin-bottom:8px;
      white-space:nowrap;
    }
    .v863-kpi>p{
      margin:0;
      color:#798680;
      font-size:8px;
      line-height:1.35;
    }

    #costs .analytics-grid{
      display:grid!important;
      grid-template-columns:minmax(0,1.3fr) minmax(340px,.8fr)!important;
      gap:14px!important;
      align-items:stretch;
      margin-bottom:14px;
    }
    #costs .analytics-grid>.panel{
      margin:0!important;
      border:1px solid #dce4df;
      border-radius:16px;
      padding:17px!important;
      box-shadow:0 2px 10px rgba(28,65,55,.035);
      overflow:hidden;
    }

    .v863-panel-header{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:14px;
      padding-bottom:13px;
      border-bottom:1px solid #e4e9e6;
      margin-bottom:14px;
    }
    .v863-panel-header>div{
      display:grid;
      gap:2px;
    }
    .v863-panel-header p{
      margin:0;
      color:#6d7975;
      font-size:7px;
      font-weight:900;
      letter-spacing:.11em;
    }
    .v863-panel-header h3{
      margin:0;
      color:#16372f;
      font-size:15px;
      letter-spacing:-.015em;
    }
    .v863-panel-header small{
      color:#87918d;
      font-size:8px;
    }
    .v863-panel-header>span{
      flex-shrink:0;
      padding:5px 8px;
      border-radius:8px;
      background:#eef3f0;
      color:#294e44;
      font-size:8px;
      font-weight:800;
    }

    .v863-category-list{display:grid;gap:10px}
    .v863-category-row{
      display:grid;
      gap:5px;
      width:100%;
      padding:8px;
      margin:0;
      border:0;
      border-radius:9px;
      background:transparent;
      text-align:left;
      cursor:pointer;
      transition:.15s ease;
    }
    .v863-category-row:hover{background:#f5f8f6}
    .v863-category-meta{
      display:flex;
      align-items:flex-end;
      justify-content:space-between;
      gap:10px;
    }
    .v863-category-meta>div{display:grid;gap:1px}
    .v863-category-meta strong{
      color:#223f37;
      font-size:10px;
    }
    .v863-category-meta small{
      color:#8a9490;
      font-size:7px;
    }
    .v863-category-meta>strong{
      font-size:10px;
      white-space:nowrap;
    }
    .v863-track{
      height:7px;
      overflow:hidden;
      border-radius:99px;
      background:#e8eeeb;
    }
    .v863-track i{
      display:block;
      height:100%;
      border-radius:99px;
      background:linear-gradient(90deg,#225d4e,#6a9c89);
    }
    .v863-per1000{
      color:#51746a;
      font-size:7px;
    }

    .v863-prod-kpis{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:7px;
      margin-bottom:14px;
    }
    .v863-prod-kpis>div{
      border:1px solid #e1e7e4;
      border-radius:10px;
      padding:9px;
      background:#fafcfa;
    }
    .v863-prod-kpis small{
      display:block;
      color:#7d8984;
      font-size:6px;
      font-weight:900;
      letter-spacing:.07em;
      margin-bottom:4px;
    }
    .v863-prod-kpis strong{
      color:#173d33;
      font-size:13px;
    }

    .v863-production-chart{
      height:150px;
      display:flex;
      align-items:flex-end;
      gap:5px;
      padding:18px 3px 0;
      border-bottom:1px solid #dfe6e2;
    }
    .v863-prod-bar{
      position:relative;
      height:100%;
      flex:1;
      min-width:7px;
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      align-items:center;
      gap:4px;
    }
    .v863-prod-bar i{
      width:68%;
      min-height:5px;
      border-radius:4px 4px 0 0;
      background:linear-gradient(#76a696,#275f51);
    }
    .v863-prod-bar small{
      color:#8a9490;
      font-size:6px;
    }
    .v863-prod-bar>span{
      display:none;
      position:absolute;
      top:0;
      padding:3px 5px;
      border-radius:5px;
      background:#183d34;
      color:#fff;
      font-size:6px;
      white-space:nowrap;
    }
    .v863-prod-bar:hover>span{display:block}

    #costs>article.panel:last-of-type{
      border:1px solid #dce4df;
      border-radius:16px;
      padding:0!important;
      overflow:hidden;
      box-shadow:0 2px 10px rgba(28,65,55,.035);
    }
    #costs>article.panel:last-of-type>.panel-head{
      padding:16px 17px 12px;
      margin:0;
      border-bottom:1px solid #e3e9e6;
    }
    #costs>article.panel:last-of-type>.panel-head h2{
      font-size:14px;
    }

    #costEntriesList{
      overflow-x:auto;
      padding:0!important;
    }
    .v863-table-head,
    .v863-table-row{
      display:grid;
      grid-template-columns:120px minmax(180px,1.4fr) 100px 130px 105px 34px;
      gap:10px;
      align-items:center;
      min-width:780px;
      padding:10px 16px;
    }
    .v863-table-head{
      background:#f6f8f7;
      border-bottom:1px solid #e1e6e3;
      color:#77847f;
      font-size:7px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .v863-table-row{
      border-bottom:1px solid #edf0ee;
      background:#fff;
    }
    .v863-table-row:last-child{border-bottom:0}
    .v863-table-row:hover{background:#fafcfa}
    .v863-table-row>div{
      display:grid;
      gap:2px;
      min-width:0;
    }
    .v863-table-row strong{
      overflow:hidden;
      text-overflow:ellipsis;
      color:#243d36;
      font-size:9px;
      white-space:nowrap;
    }
    .v863-table-row small{
      overflow:hidden;
      text-overflow:ellipsis;
      color:#89948f;
      font-size:7px;
      white-space:nowrap;
    }
    .v863-table-row .v863-value{
      color:#163e34;
      font-size:10px;
      font-weight:900;
      white-space:nowrap;
    }

    .v863-cost-dialog{
      width:min(720px,94vw)!important;
      border-radius:16px;
    }
    .v863-detail-list{
      max-height:68vh;
      overflow:auto;
      padding:14px 18px 18px;
    }
    .v863-detail-row{
      display:grid;
      grid-template-columns:1fr auto;
      gap:14px;
      align-items:center;
      padding:10px 0;
      border-bottom:1px solid #e6ebe8;
    }
    .v863-detail-row>div{display:grid;gap:2px}
    .v863-detail-row strong{font-size:10px}
    .v863-detail-row small{color:#7f8a86;font-size:8px}
    .v863-detail-row>strong{font-size:11px;color:#173d33}
    .v863-detail-hero{
      padding:14px;
      margin-bottom:10px;
      border-radius:12px;
      background:#edf4f1;
      border:1px solid #d8e5df;
    }
    .v863-detail-hero small,
    .v863-detail-hero span{
      display:block;
      color:#728079;
      font-size:8px;
    }
    .v863-detail-hero strong{
      display:block;
      margin:5px 0;
      color:#123c31;
      font-size:24px;
    }

    @media(max-width:980px){
      #costKpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      #costs .analytics-grid{grid-template-columns:1fr!important}
    }
    @media(max-width:620px){
      #costKpis{grid-template-columns:1fr!important}
      #costs .finance-toolbar{align-items:stretch}
      .v863-prod-kpis{grid-template-columns:1fr}
      .v863-kpi>strong{font-size:20px}
    }
  `;
  document.head.appendChild(style);

  setTimeout(()=>{
    try{
      if(isAdmin() && typeof loadCostsDashboard==='function'){
        loadCostsDashboard();
      }
    }catch(err){
      console.error('TerraLote V8.6.3 Costs:',err);
    }
  },500);
})();
