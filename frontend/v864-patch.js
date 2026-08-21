// TerraLote V8.6.4 — Custos institucional
// Substitui o v863-costs-design.js.
// Carregar APÓS app.js.
// Altera somente a aba Custos.

(() => {
  'use strict';

  const C864 = {
    last: null,
    label(k) {
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
    order:['COLABORADORES','CEMENT','SOIL','SAND','MATERIAL','ELECTRICITY','WATER','RENT','OTHER'],
    n(v){ return Number(v || 0); }
  };

  function calc(entries,payroll,prod) {
    const labor = payroll.reduce((s,x)=>s+C864.n(x.gross_due),0);
    const direct = entries.reduce((s,x)=>s+C864.n(x.total_amount),0);
    const total = labor + direct;
    const bricks = prod.reduce((s,x)=>s+C864.n(x.bricks),0);

    const start = APP.costStart ? new Date(APP.costStart+'T12:00:00') : new Date();
    const end = APP.costEnd ? new Date(APP.costEnd+'T12:00:00') : new Date();
    const days = Math.max(1,Math.round((end-start)/86400000)+1);

    const categories={COLABORADORES:labor};
    const per1000={};

    entries.forEach(e=>{
      categories[e.category]=(categories[e.category]||0)+C864.n(e.total_amount);
      per1000[e.category]=(per1000[e.category]||0)+C864.n(e.cost_per_1000);
    });

    const material1000=['CEMENT','SOIL','SAND','MATERIAL']
      .reduce((s,k)=>s+(per1000[k]||0),0);

    return {
      labor,direct,total,bricks,days,categories,per1000,material1000,
      cost1000:bricks ? total/bricks*1000 : 0,
      avgProd:bricks/days,
      avgCost:total/days
    };
  }

  function ensureDialog(){
    let d=document.getElementById('costInstitutionalDialog');
    if(d) return d;
    d=document.createElement('dialog');
    d.id='costInstitutionalDialog';
    d.className='analytics-dialog cost864-dialog';
    d.innerHTML='<div id="costInstitutionalDialogContent"></div>';
    document.body.appendChild(d);
    return d;
  }

  function openCategory(category){
    const d=ensureDialog();
    const data=C864.last;
    if(!data) return;

    let rows='';
    if(category==='COLABORADORES'){
      rows=data.payroll.map(r=>`
        <div class="cost864-detail-row">
          <div>
            <strong>${esc(r.full_name)}</strong>
            <small>Diárias ${money(r.base_due)} · Comissão ${money(r.commission_due)}</small>
          </div>
          <strong>${money(r.gross_due)}</strong>
        </div>`).join('');
    } else {
      rows=data.entries.filter(e=>e.category===category).map(e=>`
        <div class="cost864-detail-row">
          <div>
            <strong>${dateBR(e.cost_date)} · ${esc(e.cost_catalog_items?.name || e.description || C864.label(category))}</strong>
            <small>${e.quantity!=null?`${qty(e.quantity)} ${esc(e.unit||'')} · `:''}${e.cost_per_1000!=null?`${money(e.cost_per_1000)} / 1.000 tijolos`:''}</small>
          </div>
          <strong>${money(e.total_amount)}</strong>
        </div>`).join('');
    }

    document.getElementById('costInstitutionalDialogContent').innerHTML=`
      <div class="dialog-head">
        <div>
          <p class="eyebrow">CUSTOS · DETALHAMENTO</p>
          <h2>${C864.label(category)}</h2>
          <small>${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}</small>
        </div>
        <button class="icon" id="cost864Close">×</button>
      </div>
      <div class="cost864-detail-list">${rows || '<div class="empty-state">Sem registros nesta categoria.</div>'}</div>`;

    document.getElementById('cost864Close').onclick=()=>d.close();
    d.showModal();
  }

  window.renderCosts=function(entries,payroll,prod){
    const c=calc(entries,payroll,prod);
    C864.last={entries,payroll,prod,c};

    // 1. KPIs
    const kpis=document.getElementById('costKpis');
    if(kpis){
      kpis.className='cost864-kpis';
      kpis.innerHTML=`
        <article class="cost864-kpi cost864-kpi-main">
          <div class="cost864-kpi-label">CUSTO TOTAL</div>
          <strong>${money(c.total)}</strong>
          <span>${dateBR(APP.costStart)} — ${dateBR(APP.costEnd)}</span>
        </article>

        <article class="cost864-kpi">
          <div class="cost864-kpi-label">CUSTO / 1.000 TIJOLOS</div>
          <strong>${money(c.cost1000)}</strong>
          <span>custo global proporcional</span>
        </article>

        <article class="cost864-kpi">
          <div class="cost864-kpi-label">MATERIAIS / 1.000</div>
          <strong>${money(c.material1000)}</strong>
          <span>consumo cadastrado</span>
        </article>

        <article class="cost864-kpi">
          <div class="cost864-kpi-label">PRODUÇÃO</div>
          <strong>${qty(c.bricks)}</strong>
          <span>${qty(c.avgProd)} tijolos / dia</span>
        </article>`;
    }

    // 2. Composição de custos
    const cats=C864.order
      .map(k=>[k,c.categories[k]||0])
      .filter(([,v])=>v>0);

    const max=Math.max(1,...cats.map(([,v])=>v));
    const category=document.getElementById('costCategoryChart');
    if(category){
      category.innerHTML=`
        <div class="cost864-card-head">
          <div>
            <small>COMPOSIÇÃO DOS CUSTOS</small>
            <h3>Onde o dinheiro está sendo aplicado</h3>
          </div>
          <strong>${money(c.total)}</strong>
        </div>

        <div class="cost864-bars">
          ${cats.map(([k,v])=>`
            <button type="button" class="cost864-bar-row" data-cost864-category="${k}">
              <div class="cost864-bar-head">
                <div>
                  <strong>${C864.label(k)}</strong>
                  <span>${c.total?Math.round(v/c.total*100):0}% do total</span>
                </div>
                <strong>${money(v)}</strong>
              </div>
              <div class="cost864-bar-track">
                <i style="width:${(v/max)*100}%"></i>
              </div>
              ${k!=='COLABORADORES' && c.per1000[k]!=null
                ? `<small>${money(c.per1000[k])} / 1.000 tijolos</small>`
                : ''}
            </button>`).join('') || '<div class="empty-state">Sem custos registrados.</div>'}
        </div>`;
    }

    // 3. Produção
    const production=document.getElementById('costProductionSummary');
    if(production){
      const sorted=[...prod].sort((a,b)=>String(a.manufacture_date).localeCompare(String(b.manufacture_date)));
      const pmax=Math.max(1,...sorted.map(x=>C864.n(x.bricks)));

      production.innerHTML=`
        <div class="cost864-card-head">
          <div>
            <small>PRODUÇÃO</small>
            <h3>Ritmo produtivo</h3>
          </div>
          <strong>${qty(c.bricks)}</strong>
        </div>

        <div class="cost864-production-stats">
          <div>
            <small>MÉDIA / DIA</small>
            <strong>${qty(c.avgProd)}</strong>
          </div>
          <div>
            <small>PROJEÇÃO 7 DIAS</small>
            <strong>${qty(c.avgProd*7)}</strong>
          </div>
          <div>
            <small>PROJEÇÃO 30 DIAS</small>
            <strong>${qty(c.avgProd*30)}</strong>
          </div>
        </div>

        <div class="cost864-chart">
          ${sorted.slice(-16).map(x=>`
            <div class="cost864-chart-col">
              <span>${qty(x.bricks)}</span>
              <i style="height:${Math.max(6,C864.n(x.bricks)/pmax*100)}%"></i>
              <small>${String(x.manufacture_date).slice(8,10)}</small>
            </div>`).join('') || '<div class="empty-state">Sem produção no período.</div>'}
        </div>

        <div class="cost864-production-foot">
          <div><small>CUSTO MÉDIO / DIA</small><strong>${money(c.avgCost)}</strong></div>
          <div><small>CUSTO / TIJOLO</small><strong>${c.bricks?money(c.total/c.bricks):money(0)}</strong></div>
        </div>`;
    }

    // 4. Tabela de lançamentos
    const list=document.getElementById('costEntriesList');
    if(list){
      list.innerHTML=`
        <div class="cost864-table-head">
          <span>Data</span>
          <span>Categoria / Item</span>
          <span>Quantidade</span>
          <span>Custo / 1.000</span>
          <span>Valor</span>
          <span></span>
        </div>
        ${(entries||[]).map(e=>`
          <div class="cost864-table-row">
            <div>
              <strong>${dateBR(e.cost_date)}</strong>
            </div>
            <div>
              <strong>${C864.label(e.category)}${e.cost_catalog_items?.name?` · ${esc(e.cost_catalog_items.name)}`:''}</strong>
              <small>${esc(e.description||e.note||'')}</small>
            </div>
            <div>
              <strong>${e.quantity!=null?qty(e.quantity):'—'}</strong>
              <small>${esc(e.unit||'')}</small>
            </div>
            <div>
              <strong>${e.cost_per_1000!=null?money(e.cost_per_1000):'—'}</strong>
              <small>${e.quantity_per_1000!=null?`${qty(e.quantity_per_1000)} ${esc(e.unit||'')}`:''}</small>
            </div>
            <div class="cost864-total">${money(e.total_amount)}</div>
            <div><button class="icon-danger" data-delete-cost="${e.id}">×</button></div>
          </div>`).join('') || '<div class="empty-state">Nenhum lançamento no período.</div>'}`;
    }

    if(typeof populateCostItems==='function')populateCostItems();
  };

  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-cost864-category]');
    if(b)openCategory(b.dataset.cost864Category);
  });

  const style=document.createElement('style');
  style.textContent=`
    /* RESET visual apenas dentro da aba Custos */
    #costs *{box-sizing:border-box}
    #costs{max-width:none}
    #costs .section-head{
      align-items:flex-start;
      margin-bottom:18px;
    }
    #costs .section-head h2{
      font-size:24px;
      letter-spacing:-.03em;
      color:#15382f;
    }
    #costs .section-head p{
      color:#79847f;
      font-size:9px;
    }
    #costs .action-row{
      gap:8px;
    }
    #costs #newCostBtn{
      min-height:40px;
      border-radius:10px;
      padding:0 16px;
      font-size:10px;
    }

    /* filtro */
    #costs .finance-toolbar{
      display:flex!important;
      align-items:center!important;
      justify-content:space-between!important;
      gap:14px!important;
      padding:10px!important;
      margin:0 0 16px!important;
      border:1px solid #dde5e1!important;
      border-radius:13px!important;
      background:#f3f6f4!important;
      box-shadow:none!important;
    }
    #costs .segmented{
      display:flex;
      gap:3px;
      padding:3px;
      background:#e8eeeb;
      border-radius:9px;
    }
    #costs .segmented button{
      height:31px;
      padding:0 11px;
      border:0;
      border-radius:7px;
      background:transparent;
      color:#68746f;
      font-size:8px;
      font-weight:800;
    }
    #costs .segmented button.active{
      background:#fff;
      color:#153f34;
      box-shadow:0 1px 4px rgba(25,61,52,.08);
    }
    #costs .date-range{
      display:flex;
      align-items:center;
      gap:7px;
      font-size:8px;
      color:#74807b;
    }
    #costs .date-range input{
      height:34px;
      min-width:132px;
      border:1px solid #d6dfda;
      border-radius:8px;
      background:#fff;
      padding:0 9px;
      font-size:9px;
    }
    #costs .date-range button{
      height:34px;
      border-radius:8px;
      padding:0 12px;
    }

    /* KPIs */
    .cost864-kpis{
      display:grid!important;
      grid-template-columns:repeat(4,minmax(0,1fr))!important;
      gap:12px!important;
      margin:0 0 14px!important;
    }
    .cost864-kpi{
      min-height:112px;
      padding:15px;
      border:1px solid #dce4df;
      border-radius:14px;
      background:#fff;
      box-shadow:0 2px 8px rgba(21,56,47,.035);
    }
    .cost864-kpi-main{
      border-top:3px solid #1c5547;
      padding-top:13px;
    }
    .cost864-kpi-label{
      margin-bottom:14px;
      color:#72807a;
      font-size:7px;
      font-weight:900;
      letter-spacing:.1em;
    }
    .cost864-kpi>strong{
      display:block;
      margin-bottom:8px;
      color:#163a31;
      font-size:22px;
      line-height:1;
      letter-spacing:-.035em;
      white-space:nowrap;
    }
    .cost864-kpi>span{
      display:block;
      color:#87918d;
      font-size:8px;
      line-height:1.3;
    }

    /* layout central */
    #costs .analytics-grid{
      display:grid!important;
      grid-template-columns:minmax(0,1.65fr) minmax(360px,.9fr)!important;
      gap:14px!important;
      align-items:stretch!important;
      margin:0 0 14px!important;
    }
    #costs .analytics-grid>.panel{
      min-width:0;
      margin:0!important;
      padding:17px!important;
      border:1px solid #dce4df!important;
      border-radius:15px!important;
      background:#fff!important;
      box-shadow:0 2px 8px rgba(21,56,47,.035)!important;
      overflow:hidden!important;
    }
    #costs .analytics-grid>.panel>.panel-head{
      display:none!important;
    }

    .cost864-card-head{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:12px;
      margin-bottom:15px;
      padding-bottom:13px;
      border-bottom:1px solid #e5eae7;
    }
    .cost864-card-head>div{
      display:grid;
      gap:3px;
    }
    .cost864-card-head small{
      color:#74817b;
      font-size:7px;
      font-weight:900;
      letter-spacing:.1em;
    }
    .cost864-card-head h3{
      margin:0;
      color:#173b32;
      font-size:15px;
      font-weight:800;
      letter-spacing:-.015em;
    }
    .cost864-card-head>strong{
      padding:5px 8px;
      border-radius:8px;
      background:#eef3f0;
      color:#295348;
      font-size:9px;
      white-space:nowrap;
    }

    /* barras */
    .cost864-bars{
      display:grid;
      gap:8px;
    }
    .cost864-bar-row{
      width:100%;
      display:grid;
      gap:5px;
      padding:8px 7px;
      border:0;
      border-radius:9px;
      background:transparent;
      text-align:left;
      cursor:pointer;
      transition:.15s ease;
    }
    .cost864-bar-row:hover{
      background:#f6f9f7;
    }
    .cost864-bar-head{
      display:flex;
      justify-content:space-between;
      align-items:flex-end;
      gap:10px;
    }
    .cost864-bar-head>div{
      display:grid;
      gap:2px;
    }
    .cost864-bar-head strong{
      color:#26423a;
      font-size:10px;
    }
    .cost864-bar-head span{
      color:#8a9490;
      font-size:7px;
    }
    .cost864-bar-head>strong{
      color:#203f36;
      white-space:nowrap;
    }
    .cost864-bar-track{
      height:7px;
      overflow:hidden;
      border-radius:99px;
      background:#e9efec;
    }
    .cost864-bar-track i{
      display:block;
      height:100%;
      border-radius:99px;
      background:#2e6758;
    }
    .cost864-bar-row>small{
      color:#55766d;
      font-size:7px;
    }

    /* produção */
    .cost864-production-stats{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:7px;
      margin-bottom:14px;
    }
    .cost864-production-stats>div{
      min-width:0;
      padding:9px;
      border:1px solid #e2e8e5;
      border-radius:9px;
      background:#fafcfa;
    }
    .cost864-production-stats small{
      display:block;
      margin-bottom:5px;
      color:#7c8883;
      font-size:6px;
      font-weight:900;
      letter-spacing:.07em;
    }
    .cost864-production-stats strong{
      color:#173d33;
      font-size:13px;
    }
    .cost864-chart{
      height:145px;
      display:flex;
      align-items:flex-end;
      gap:5px;
      padding:17px 4px 0;
      margin-bottom:13px;
      border-bottom:1px solid #dfe6e2;
    }
    .cost864-chart-col{
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
    .cost864-chart-col i{
      width:68%;
      min-height:5px;
      border-radius:4px 4px 0 0;
      background:#356d5f;
    }
    .cost864-chart-col small{
      color:#8a9490;
      font-size:6px;
    }
    .cost864-chart-col>span{
      display:none;
      position:absolute;
      top:0;
      padding:3px 5px;
      border-radius:5px;
      background:#173c33;
      color:#fff;
      font-size:6px;
      white-space:nowrap;
    }
    .cost864-chart-col:hover>span{
      display:block;
    }
    .cost864-production-foot{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:7px;
    }
    .cost864-production-foot>div{
      padding:9px;
      border-radius:9px;
      background:#eef4f1;
    }
    .cost864-production-foot small{
      display:block;
      margin-bottom:3px;
      color:#718079;
      font-size:6px;
      font-weight:900;
      letter-spacing:.07em;
    }
    .cost864-production-foot strong{
      color:#173d33;
      font-size:12px;
    }

    /* lançamentos */
    #costs>article.panel:last-of-type{
      margin:0!important;
      padding:0!important;
      border:1px solid #dce4df!important;
      border-radius:15px!important;
      background:#fff!important;
      overflow:hidden!important;
      box-shadow:0 2px 8px rgba(21,56,47,.035)!important;
    }
    #costs>article.panel:last-of-type>.panel-head{
      margin:0!important;
      padding:15px 17px 12px!important;
      border-bottom:1px solid #e3e9e6!important;
    }
    #costs>article.panel:last-of-type>.panel-head h2{
      margin:0!important;
      color:#173b32!important;
      font-size:14px!important;
    }
    #costEntriesList{
      overflow-x:auto;
    }
    .cost864-table-head,
    .cost864-table-row{
      display:grid;
      grid-template-columns:95px minmax(220px,1.5fr) 100px 125px 100px 32px;
      gap:10px;
      align-items:center;
      min-width:790px;
      padding:10px 16px;
    }
    .cost864-table-head{
      background:#f6f8f7;
      border-bottom:1px solid #e2e7e4;
      color:#79857f;
      font-size:7px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
    }
    .cost864-table-row{
      border-bottom:1px solid #edf0ee;
      background:#fff;
    }
    .cost864-table-row:last-child{
      border-bottom:0;
    }
    .cost864-table-row:hover{
      background:#fafcfa;
    }
    .cost864-table-row>div{
      min-width:0;
      display:grid;
      gap:2px;
    }
    .cost864-table-row strong{
      overflow:hidden;
      text-overflow:ellipsis;
      color:#263f38;
      font-size:9px;
      white-space:nowrap;
    }
    .cost864-table-row small{
      overflow:hidden;
      text-overflow:ellipsis;
      color:#8b9591;
      font-size:7px;
      white-space:nowrap;
    }
    .cost864-total{
      color:#173d33!important;
      font-weight:900!important;
      white-space:nowrap;
    }

    /* modal */
    .cost864-dialog{
      width:min(680px,94vw)!important;
      border-radius:15px!important;
    }
    .cost864-detail-list{
      max-height:68vh;
      overflow:auto;
      padding:14px 18px 18px;
    }
    .cost864-detail-row{
      display:grid;
      grid-template-columns:1fr auto;
      gap:14px;
      align-items:center;
      padding:10px 0;
      border-bottom:1px solid #e6ebe8;
    }
    .cost864-detail-row>div{
      display:grid;
      gap:2px;
    }
    .cost864-detail-row strong{
      font-size:10px;
    }
    .cost864-detail-row small{
      color:#7f8a86;
      font-size:8px;
    }
    .cost864-detail-row>strong{
      color:#173d33;
      font-size:11px;
    }

    @media(max-width:1050px){
      .cost864-kpis{
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
      }
      #costs .analytics-grid{
        grid-template-columns:1fr!important;
      }
    }

    @media(max-width:700px){
      #costs .finance-toolbar{
        flex-direction:column!important;
        align-items:stretch!important;
      }
      #costs .date-range{
        display:grid!important;
        grid-template-columns:1fr auto 1fr!important;
      }
      #costs .date-range button{
        grid-column:1/-1;
      }
      .cost864-kpis{
        grid-template-columns:1fr!important;
      }
      .cost864-production-stats,
      .cost864-production-foot{
        grid-template-columns:1fr!important;
      }
    }
  `;
  document.head.appendChild(style);

  setTimeout(()=>{
    try{
      if(isAdmin() && typeof loadCostsDashboard==='function'){
        loadCostsDashboard();
      }
    }catch(err){
      console.error('TerraLote V8.6.4 Custos:',err);
    }
  },450);
})();
