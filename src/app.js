/* Mortgage Toolkit — client-only, static
 * Tabs: Affordability & Amortization
 * Charts: Plotly; Table: DataTables (+Buttons)
 * Dark UI, localStorage persistence, share link.
 */

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => n.toLocaleString(undefined, {maximumFractionDigits: 2});
const money = (n) => '$' + (Math.round(n*100)/100).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});

function pmnt(P, rAnnualPct, years){
  const r = rAnnualPct/100/12;
  const N = years*12;
  if (r === 0) return P / N;
  return P * r / (1 - Math.pow(1+r, -N));
}

// First-year tax savings (very simplified; CA + Federal; SALT cap applies to property tax only).
function firstYearTaxSavings({price, ratePct, loan, propTaxAnnual, fedPct, caPct, saltCap, stdDed}){
  const r = ratePct/100/12;
  const months = 12;
  let bal = loan, totalInterest = 0;
  for (let m=1;m<=months;m++){
    const interest = bal * r;
    const pmt = pmnt(loan, ratePct, loan>0?30:30); // nominal—only interest needed; not exact to entered term but close for yr1
    const principal = Math.min(pmt - interest, bal);
    bal -= principal;
    totalInterest += interest;
  }
  const deductiblePT = Math.min(saltCap, propTaxAnnual);
  const itemized = deductiblePT + totalInterest;
  const effectiveDeduction = Math.max(0, itemized - stdDed);
  const taxRate = (fedPct + caPct)/100;
  return effectiveDeduction * taxRate;
}

// State persistence helpers
function saveState(){
  const ids = [
    'afterTax','fedMarg','caMarg','saltCap','stdDed','autoItemize','maxMonthly','down','term','baseRate','rMin','rMax','taxRate','extraTaxRate','fixedAssess','insYear','hoa','pmiPct','pointsPct','buydownBps','priceOrLoan','price','down2','rate','term2','cadence','taxRate2','extraTaxRate2','fixedAssess2','insYear2','hoa2','pmiPct2','taxStep','hoaStep','xtraMonthly','xtraAnnual','xtraAnnualMonth','xtraOnce','xtraOnceMonth','absDollars'
  ];
  const obj = {};
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    obj[id] = (el.type==='checkbox') ? el.checked : Number(el.value);
    if (el.type==='select-one') obj[id] = el.value;
  });
  localStorage.setItem('mortgageToolkit', JSON.stringify(obj));
}

function loadState(){
  const raw = localStorage.getItem('mortgageToolkit');
  if (!raw) return false;
  try{
    const obj = JSON.parse(raw);
    Object.entries(obj).forEach(([k,v])=>{
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type==='checkbox') el.checked = !!v;
      else if (el.type==='select-one') el.value = v;
      else el.value = v;
    });
    return true;
  }catch(e){ return false; }
}

function shareLink(){
  const raw = localStorage.getItem('mortgageToolkit') || '{}';
  const encoded = btoa(unescape(encodeURIComponent(raw)));
  const url = location.origin + location.pathname + '#s=' + encoded;
  navigator.clipboard.writeText(url);
  alert('Share link copied to clipboard.');
}
function tryLoadFromHash(){
  if (!location.hash.startsWith('#s=')) return false;
  try{
    const decoded = decodeURIComponent(escape(atob(location.hash.slice(3))));
    localStorage.setItem('mortgageToolkit', decoded);
    return true;
  }catch(e){ return false; }
}

// UI wiring
function showTaxBlock(){ $('#taxBlock').style.display = $('#afterTax').checked ? 'block' : 'none'; }
function switchTab(which){ /* single-page mode: no tab toggle */ return; }
function togglePriceLoan(){
  const mode = $('#priceOrLoan').value;
  if (mode==='price'){
    $('#priceLoanBlock').innerHTML = `
      <label>Purchase price ($)</label>
      <input type="number" id="price" value="${$('#price')?$('#price').value:220000}" step="1000">
      <label>Down payment ($)</label>
      <input type="number" id="down2" value="${$('#down2')?$('#down2').value:20000}" step="1000">
    `;
  }else{
    $('#priceLoanBlock').innerHTML = `
      <label>Loan amount ($)</label>
      <input type="number" id="loanAmt" value="${$('#loanAmt')?$('#loanAmt').value:200000}" step="1000">
    `;
  }
}

// ------- Affordability computations -------
function affordabilityRun(){
  const budget = +$('#maxMonthly').value||0;
  const down = +$('#down').value||0;
  const term = +$('#term').value||30;
  const rMin = +$('#rMin').value||2;
  const rMax = +$('#rMax').value||15;
  const baseRate = +$('#baseRate').value||6.5;
  const rateAdj = (+$('#buydownBps').value||0)/100; // bps to %
  const taxRate = (+$('#taxRate').value||0) + (+$('#extraTaxRate').value||0);
  const fixedAssess = +$('#fixedAssess').value||0;
  const insMo = (+$('#insYear').value||0)/12;
  const hoa = +$('#hoa').value||0;
  const pmiPct = +$('#pmiPct').value||0;
  const pointsPct = +$('#pointsPct').value||0;

  const rates = [];
  for (let r=rMin; r<=rMax+1e-9; r=Number((r+0.1).toFixed(10))) rates.push(r);

  const seriesPrice = [];
  const comp = {pi:[], tax:[], ins:[], hoa:[], assess:[], pmi:[]};

  // Root-solve price at each rate so that total monthly <= budget
  rates.forEach((r0)=>{
    const r = Math.max(0, r0 - rateAdj);
    // price -> components
    function monthlyFor(price){
      const loan = Math.max(0, price - down);
      const piti = pmnt(loan, r, term);
      const tax = price * (taxRate/100) / 12;
      const assess = fixedAssess/12;
      const pmi = (loan>0 && price>0 && loan/price>=0.80) ? (pmiPct/100)*loan/12 : 0;
      return {pi:piti, tax, ins:insMo, hoa, assess, pmi, total:piti+tax+insMo+hoa+assess+pmi};
    }
    // binary search price
    let lo=0, hi=2_000_000;
    for (let i=0;i<40;i++){
      const mid=(lo+hi)/2;
      const m = monthlyFor(mid).total;
      if (m>budget) hi=mid; else lo=mid;
    }
    const price = Math.max(0, lo);
    const m = monthlyFor(price);
    seriesPrice.push(price);
    comp.pi.push(m.pi); comp.tax.push(m.tax); comp.ins.push(m.ins); comp.hoa.push(m.hoa); comp.assess.push(m.assess); comp.pmi.push(m.pmi);
  });

  // Plot A: price vs rate
  Plotly.newPlot('affPrice', [{
    x:rates, y:seriesPrice, mode:'lines+markers', name:'Affordable Price', line:{shape:'spline'}
  }], {
    title:'Affordability Curve', paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    xaxis:{title:'Mortgage Interest Rate (%)', gridcolor:'#283044', zeroline:false},
    yaxis:{title:'Affordable Home Price ($)', gridcolor:'#283044'},
    hovermode:'x unified', legend:{orientation:'h', x:0, y:1.2}
  }, {displaylogo:false, responsive:true});

  // Plot B: components vs rate (lines)
  const traces = [
    {name:'Mortgage P&I', x:rates, y:comp.pi, mode:'lines+markers'},
    {name:'Property Tax', x:rates, y:comp.tax, mode:'lines+markers'},
    {name:'Insurance', x:rates, y:comp.ins, mode:'lines+markers'},
    {name:'HOA', x:rates, y:comp.hoa, mode:'lines+markers'},
    {name:'Assessments', x:rates, y:comp.assess, mode:'lines+markers'},
    {name:'PMI', x:rates, y:comp.pmi, mode:'lines+markers'}
  ];
  Plotly.newPlot('affPayments', traces, {
    title:'Total Monthly Payment vs. Mortgage Rate',
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    xaxis:{title:'Mortgage Interest Rate (%)', gridcolor:'#283044'},
    yaxis:{title:'Monthly Payment ($)', gridcolor:'#283044'},
    hovermode:'x unified', legend:{orientation:'h', x:0, y:1.2}
  }, {displaylogo:false, responsive:true});

  // KPIs at base rate
  const idx = rates.findIndex(v=>Math.abs(v-baseRate)<1e-9) >= 0 ? rates.findIndex(v=>Math.abs(v-baseRate)<1e-9) : rates.reduce((best,i,ii)=>Math.abs(i-baseRate)<Math.abs(rates[best]-baseRate)?ii:best,0);
  const priceAtBase = seriesPrice[idx]||0;
  const loanAtBase = Math.max(0, priceAtBase - down);
  const piAtBase = comp.pi[idx]||0, taxAtBase = comp.tax[idx]||0, insAtBase = comp.ins[idx]||0, hoaAtBase = comp.hoa[idx]||0, aAtBase = comp.assess[idx]||0, pmiAtBase = comp.pmi[idx]||0;
  const totalAtBase = piAtBase+taxAtBase+insAtBase+hoaAtBase+aAtBase+pmiAtBase;
  const cashToClose = down + (pointsPct/100)*loanAtBase;

  // after-tax view (first-year)
  if ($('#afterTax').checked){
    const fy = firstYearTaxSavings({
      price: priceAtBase,
      ratePct: Math.max(0, baseRate - (+$('#buydownBps').value||0)/100),
      loan: loanAtBase,
      propTaxAnnual: priceAtBase*((taxRate)/100) + (+$('#fixedAssess').value||0),
      fedPct: +$('#fedMarg').value||24,
      caPct: +$('#caMarg').value||9.3,
      saltCap: +$('#saltCap').value||10000,
      stdDed: +$('#stdDed').value||29200
    });
    const auto = $('#autoItemize').checked;
    const monthlyBenefit = (fy/12);
    const afterTaxMonthly = Math.max(0, totalAtBase - monthlyBenefit);
    $('#kpi-monthly').textContent = `Initial Monthly — ${money(totalAtBase)} (after-tax est. ${money(afterTaxMonthly)})`;
  }else{
    $('#kpi-monthly').textContent = `Initial Monthly — ${money(totalAtBase)}`;
  }

  $('#kpi-price').textContent = `Max Price — ${money(priceAtBase)}`;
  $('#kpi-loan').textContent = `Loan — ${money(loanAtBase)}`;
  $('#kpi-cash').textContent = `Cash to Close — ${money(cashToClose)}`;
}

// ------- Amortization schedule -------
function amortizationRun(){
  // Inputs
  const mode = $('#priceOrLoan').value;
  let price=0, loan=0, down=0;
  if (mode==='price'){
    price = +$('#price').value||0;
    down = +$('#down2').value||0;
    loan = Math.max(0, price - down);
  }else{
    loan = +$('#loanAmt').value||0;
    price = loan; // for LTV checks when price unknown; PMI logic will trigger only by loan/price when price provided
  }
  const ratePct = +$('#rate').value||0;
  const termY = +$('#term2').value||30;
  const cadence = $('#cadence').value; // monthly / biweekly

  const pmiPct = +$('#pmiPct2').value||0;
  const taxRate = (+$('#taxRate2').value||0) + (+$('#extraTaxRate2').value||0);
  const fixedAssess = +($('#fixedAssess2').value||0);
  const insYear = +($('#insYear2').value||0);
  const hoaMo0 = +($('#hoa2').value||0);
  const taxStep = (+$('#taxStep').value||0)/100;
  const hoaStep = (+$('#hoaStep').value||0)/100;

  const xtraM = +($('#xtraMonthly').value||0);
  const xtraA = +($('#xtraAnnual').value||0);
  const xtraAM = Math.min(12, Math.max(1, +($('#xtraAnnualMonth').value||1)));
  const xtraOnce = +($('#xtraOnce').value||0);
  const xtraOnceM = Math.max(1, +($('#xtraOnceMonth').value||1));

  const Nmonths = termY*12;
  const rM = ratePct/100/12;

  // Base monthly payment (no extras)
  const baseMonthly = pmnt(loan, ratePct, termY);

  // Schedule arrays
  const rows = [];
  let bal = loan;
  let hoaMo = hoaMo0;
  let taxAnnual = price * (taxRate/100) + fixedAssess;
  let pmiOn = (price>0 && loan/price >= 0.80);
  let month = 0;

  // Helper: taxes & insurance monthly for a given year
  function taxesForYear(y){
    // y starts at 0
    return (taxAnnual * Math.pow(1+taxStep, y))/12;
  }
  function hoaForYear(y){
    return hoaMo0 * Math.pow(1+hoaStep, y);
  }

  const isAbs = $('#absDollars').checked;

  // Iterate monthly; if bi-weekly, approximate via 26 half payments/year with interest rate halved per half-month
  while (bal > 1e-6 && month < Nmonths+240){ // guard
    month++;
    const yearIdx = Math.floor((month-1)/12);

    let payment = baseMonthly;
    let interest = bal * rM;
    let principal = Math.min(payment - interest, bal);

    // extras
    let extra = 0;
    extra += xtraM;
    if ((month % 12) === (xtraAM % 12)) extra += xtraA;
    if (month === xtraOnceM) extra += xtraOnce;

    // PMI monthly
    const pmiMo = pmiOn ? (pmiPct/100)*loan/12 : 0;

    // taxes/ins/hoa
    const taxesMo = taxesForYear(yearIdx);
    const insMo = insYear/12;
    const hoaNow = hoaForYear(yearIdx);

    // apply principal reductions
    let totalPayment = payment + extra + pmiMo + taxesMo + insMo + hoaNow;
    bal = Math.max(0, bal - principal - extra);

    // PMI cancel test (80% LTV threshold)
    if (pmiOn && price>0 && bal <= 0.80*price) pmiOn = false;

    rows.push({
      m:month, y:yearIdx+1,
      pay: payment.toFixed(2),
      prin: principal.toFixed(2),
      int: interest.toFixed(2),
      pmi: pmiMo.toFixed(2),
      tax: taxesMo.toFixed(2),
      ins: insMo.toFixed(2),
      hoa: hoaNow.toFixed(2),
      assess: (fixedAssess/12).toFixed(2),
      extra: extra.toFixed(2),
      bal: bal.toFixed(2)
    });
    if (bal<=0) break;

    // Bi-weekly approximation: every 6 months, simulate an extra half payment (makes 13 payments/yr)
    if (cadence==='biweekly' && (month%6===0)){
      const half = payment/2;
      const i2 = bal * rM/2;
      const p2 = Math.min(half - i2, bal);
      bal = Math.max(0, bal - p2);
      rows.push({
        m:month+'.5', y:yearIdx+1,
        pay: (half).toFixed(2),
        prin: p2.toFixed(2),
        int: i2.toFixed(2),
        pmi: (pmiOn ? (pmiPct/100)*loan/24 : 0).toFixed(2),
        tax: (taxesMo/2).toFixed(2),
        ins: (insMo/2).toFixed(2),
        hoa: (hoaNow/2).toFixed(2),
        assess: (fixedAssess/24).toFixed(2),
        extra: '0.00',
        bal: bal.toFixed(2)
      });
      if (pmiOn && price>0 && bal <= 0.80*price) pmiOn = false;
      if (bal<=0) break;
    }
  }

  // Charts
  // Yearly aggregates
  const byYear = new Map();
  rows.forEach(r=>{
    const y = Math.floor((typeof r.m==='number' ? r.m-1 : Math.floor(Number(r.m)-1))/12)+1;
    const k = y;
    if (!byYear.has(k)) byYear.set(k, {y:k, P:0, I:0});
    const o = byYear.get(k);
    o.P += Number(r.prin);
    o.I += Number(r.int);
  });
  const ys = [...byYear.values()].map(o=>o.y);
  const P = [...byYear.values()].map(o=>o.P);
  const I = [...byYear.values()].map(o=>o.I);

  const stackTraces = isAbs
    ? [
        {name:'Principal', x:ys, y:P, type:'bar'},
        {name:'Interest', x:ys, y:I, type:'bar'}
      ]
    : [
        {name:'Principal %', x:ys, y:P, type:'bar', transforms:[{type:'aggregate', groups:ys, aggregations:[{target:'y', func:'sum', enabled:true}]}]},
        {name:'Interest %', x:ys, y:I, type:'bar', transforms:[{type:'aggregate', groups:ys, aggregations:[{target:'y', func:'sum', enabled:true}]}]}
      ];

  Plotly.newPlot('amortStack', stackTraces, {
    barmode: isAbs ? 'stack' : 'relative',
    title: isAbs ? 'Annual Principal & Interest ($)' : 'Annual Principal vs Interest (100% stacked)',
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    xaxis:{title:'Year', gridcolor:'#283044'}, yaxis:{title:isAbs?'$':'% of Payment', gridcolor:'#283044'},
    legend:{orientation:'h', x:0, y:1.2}
  }, {displaylogo:false, responsive:true});

  // Balance line (monthly points only)
  const mIdx = rows.filter(r=>String(r.m).indexOf('.5')===-1);
  Plotly.newPlot('balanceLine', [{
    x: mIdx.map(r=>r.m), y: mIdx.map(r=>Number(r.bal)), mode:'lines', name:'Balance'
  }], {
    title:'Ending Balance Over Time',
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    xaxis:{title:'Month', gridcolor:'#283044'}, yaxis:{title:'$ Balance', gridcolor:'#283044'}
  }, {displaylogo:false, responsive:true});

  // Table
  const tbody = $('#amortTable tbody');
  tbody.innerHTML = '';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.m}</td><td>${r.y}</td><td>${r.pay}</td><td>${r.prin}</td><td>${r.int}</td><td>${r.pmi}</td>
      <td>${r.tax}</td><td>${r.ins}</td><td>${r.hoa}</td><td>${r.assess}</td><td>${r.extra}</td><td>${r.bal}</td>`;
    tbody.appendChild(tr);
  });

  // init/re-init DataTable
  if (window._dt) {
    try { window._dt.destroy(true); } catch(e){}
  }
  window._dt = window.jQuery('#amortTable').DataTable({
    paging:true,
    pageLength:25,
    searching:true,
    ordering:true,
    responsive:true,
    dom:'Bfrtip',
    buttons:['copy','csv','excel','pdf','print']
  });
}

// ----------------- Event wiring -----------------
function recalc(){ saveState(); affordabilityRun(); amortizationRun(); }
function wire(){
  // Tab buttons

  // Global toggles
  $('#afterTax').onchange = ()=>{ showTaxBlock(); recalc(); };

  // All inputs trigger recalc
  document.querySelectorAll('input,select').forEach(el=>{
    el.addEventListener('input', ()=>recalc());
    el.addEventListener('change', ()=>recalc());
  });

  // Price vs Loan toggle
  $('#priceOrLoan').addEventListener('change', ()=>{ togglePriceLoan(); recalc(); });

  // Buttons
  $('#btnSave').onclick = ()=>{ saveState(); alert('Saved.'); };
  $('#btnLoad').onclick = ()=>{ if(loadState()){ togglePriceLoan(); recalc(); } else alert('Nothing saved.'); };
  $('#btnReset').onclick = ()=>{ localStorage.removeItem('mortgageToolkit'); location.reload(); };
  $('#btnShare').onclick = ()=>shareLink();
}

(function init(){
  if (tryLoadFromHash()) loadState();
  else loadState();

  showTaxBlock();
  togglePriceLoan();
  wire();
  recalc();
})();
