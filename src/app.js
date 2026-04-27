const $ = (sel) => document.querySelector(sel);
const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let libsReadyPromise;
let dataTable;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function ensureVendorLibs() {
  if (window.Plotly && window.jQuery && window.jQuery.fn?.DataTable) return Promise.resolve();
  if (libsReadyPromise) return libsReadyPromise;

  libsReadyPromise = (async () => {
    const scripts = [
      'vendor/plotly.min.js',
      'vendor/jquery-3.7.1.min.js',
      'vendor/jquery.dataTables.min.js',
      'vendor/dataTables.buttons.min.js',
      'vendor/jszip.min.js',
      'vendor/pdfmake.min.js',
      'vendor/vfs_fonts.js',
      'vendor/buttons.html5.min.js',
      'vendor/buttons.print.min.js'
    ];
    for (const src of scripts) await loadScript(src);
  })();

  return libsReadyPromise;
}

function firstInputIdInLabel(label) {
  const contained = label.querySelector('input,select,textarea');
  if (contained?.id) return null;
  const probe = label.nextElementSibling;
  if (!probe) return null;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(probe.tagName) && probe.id) return probe.id;
  return null;
}

function enhanceAccessibility() {
  document.querySelectorAll('label').forEach((label) => {
    if (!label.htmlFor) {
      const targetId = firstInputIdInLabel(label);
      if (targetId) label.htmlFor = targetId;
    }
  });
}

function saveState() {
  const ids = [
    'afterTax', 'fedMarg', 'caMarg', 'saltCap', 'stdDed', 'autoItemize', 'maxMonthly', 'down', 'term', 'baseRate', 'rMin', 'rMax',
    'taxRate', 'extraTaxRate', 'fixedAssess', 'insYear', 'hoa', 'pmiPct', 'pointsPct', 'buydownBps',
    'priceOrLoan', 'price', 'loanAmt', 'down2', 'rate', 'term2', 'cadence', 'taxRate2', 'extraTaxRate2', 'fixedAssess2', 'insYear2',
    'hoa2', 'pmiPct2', 'taxStep', 'hoaStep', 'xtraMonthly', 'xtraAnnual', 'xtraAnnualMonth', 'xtraOnce', 'xtraOnceMonth', 'absDollars'
  ];
  const obj = {};
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    obj[id] = (el.type === 'checkbox') ? el.checked : Number(el.value);
    if (el.type === 'select-one') obj[id] = el.value;
  });
  localStorage.setItem('mortgageToolkit', JSON.stringify(obj));
}

function loadState() {
  const raw = localStorage.getItem('mortgageToolkit');
  if (!raw) return false;
  try {
    const obj = JSON.parse(raw);
    Object.entries(obj).forEach(([k, v]) => {
      const el = document.getElementById(k);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
    });
    return true;
  } catch (_) {
    return false;
  }
}

function shareLink() {
  const raw = localStorage.getItem('mortgageToolkit') || '{}';
  const encoded = btoa(unescape(encodeURIComponent(raw)));
  const url = location.origin + location.pathname + '#s=' + encoded;
  navigator.clipboard.writeText(url);
  alert('Share link copied to clipboard.');
}

function tryLoadFromHash() {
  if (!location.hash.startsWith('#s=')) return false;
  try {
    const decoded = decodeURIComponent(escape(atob(location.hash.slice(3))));
    localStorage.setItem('mortgageToolkit', decoded);
    return true;
  } catch (_) {
    return false;
  }
}

function showTaxBlock() {
  $('#taxBlock').style.display = $('#afterTax').checked ? 'block' : 'none';
}

function togglePriceLoan() {
  const mode = $('#priceOrLoan').value;
  if (mode === 'price') {
    $('#priceLoanBlock').innerHTML = `
      <label for="price">Purchase price ($)</label>
      <input type="number" id="price" value="${$('#price') ? $('#price').value : 220000}" step="1000">
      <label for="down2">Down payment ($)</label>
      <input type="number" id="down2" value="${$('#down2') ? $('#down2').value : 20000}" step="1000">
    `;
  } else {
    $('#priceLoanBlock').innerHTML = `
      <label for="loanAmt">Loan amount ($)</label>
      <input type="number" id="loanAmt" value="${$('#loanAmt') ? $('#loanAmt').value : 200000}" step="1000">
    `;
  }
  enhanceAccessibility();
}


function collectValidationInput() {
  const mode = $('#priceOrLoan').value;
  return {
    maxMonthly: +$('#maxMonthly').value,
    down: +$('#down').value,
    term: +$('#term').value,
    baseRate: +$('#baseRate').value,
    rMin: +$('#rMin').value,
    rMax: +$('#rMax').value,
    taxRate: +$('#taxRate').value,
    rate: +$('#rate').value,
    term2: +$('#term2').value,
    price: mode === 'price' ? +($('#price')?.value || 0) : undefined,
    down2: mode === 'price' ? +($('#down2')?.value || 0) : undefined,
    loan: mode === 'loan' ? +($('#loanAmt')?.value || 0) : undefined
  };
}

function renderValidationErrors(errors) {
  const box = $('#validationErrors');
  if (!box) return;
  if (!errors.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = `<strong>Please fix the following input issues:</strong><ul>${errors.map((e) => `<li>${e}</li>`).join('')}</ul>`;
}

function validateInputs() {
  const errors = MortgageMath.validateScenarioInputs(collectValidationInput());
  renderValidationErrors(errors);
  return errors.length === 0;
}

function affordabilityRun() {
  const budget = +$('#maxMonthly').value || 0;
  const down = +$('#down').value || 0;
  const term = +$('#term').value || 30;
  const rMin = +$('#rMin').value || 2;
  const rMax = +$('#rMax').value || 15;
  const baseRate = +$('#baseRate').value || 6.5;
  const rateAdj = (+$('#buydownBps').value || 0) / 100;
  const taxRate = (+$('#taxRate').value || 0) + (+$('#extraTaxRate').value || 0);
  const fixedAssess = +$('#fixedAssess').value || 0;
  const insMo = (+$('#insYear').value || 0) / 12;
  const hoa = +$('#hoa').value || 0;
  const pmiPct = +$('#pmiPct').value || 0;
  const pointsPct = +$('#pointsPct').value || 0;

  const rates = [];
  for (let r = rMin; r <= rMax + 1e-9; r = Number((r + 0.1).toFixed(10))) rates.push(r);

  const seriesPrice = [];
  const comp = { pi: [], tax: [], ins: [], hoa: [], assess: [], pmi: [] };

  rates.forEach((r0) => {
    const rate = Math.max(0, r0 - rateAdj);
    const price = MortgageMath.solveAffordablePrice({ budget, down, term, rate, taxRate, fixedAssess, insMo, hoa, pmiPct });
    const m = MortgageMath.affordabilityAtRate({ price, down, term, rate, taxRate, fixedAssess, insMo, hoa, pmiPct });
    seriesPrice.push(price);
    comp.pi.push(m.pi); comp.tax.push(m.tax); comp.ins.push(m.ins); comp.hoa.push(m.hoa); comp.assess.push(m.assess); comp.pmi.push(m.pmi);
  });

  Plotly.newPlot('affPrice', [{ x: rates, y: seriesPrice, mode: 'lines+markers', name: 'Affordable Price', line: { shape: 'spline' } }], {
    title: 'Affordability Curve', paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: { title: 'Mortgage Interest Rate (%)', gridcolor: '#283044', zeroline: false },
    yaxis: { title: 'Affordable Home Price ($)', gridcolor: '#283044' },
    hovermode: 'x unified', legend: { orientation: 'h', x: 0, y: 1.2 }
  }, { displaylogo: false, responsive: true });

  Plotly.newPlot('affPayments', [
    { name: 'Mortgage P&I', x: rates, y: comp.pi, mode: 'lines+markers' },
    { name: 'Property Tax', x: rates, y: comp.tax, mode: 'lines+markers' },
    { name: 'Insurance', x: rates, y: comp.ins, mode: 'lines+markers' },
    { name: 'HOA', x: rates, y: comp.hoa, mode: 'lines+markers' },
    { name: 'Assessments', x: rates, y: comp.assess, mode: 'lines+markers' },
    { name: 'PMI', x: rates, y: comp.pmi, mode: 'lines+markers' }
  ], {
    title: 'Total Monthly Payment vs. Mortgage Rate',
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: { title: 'Mortgage Interest Rate (%)', gridcolor: '#283044' },
    yaxis: { title: 'Monthly Payment ($)', gridcolor: '#283044' },
    hovermode: 'x unified', legend: { orientation: 'h', x: 0, y: 1.2 }
  }, { displaylogo: false, responsive: true });

  const idx = rates.findIndex((v) => Math.abs(v - baseRate) < 1e-9);
  const nearestIdx = idx >= 0 ? idx : rates.reduce((best, rate, i) => (Math.abs(rate - baseRate) < Math.abs(rates[best] - baseRate) ? i : best), 0);

  const priceAtBase = seriesPrice[nearestIdx] || 0;
  const loanAtBase = Math.max(0, priceAtBase - down);
  const totalAtBase = (comp.pi[nearestIdx] || 0) + (comp.tax[nearestIdx] || 0) + (comp.ins[nearestIdx] || 0) + (comp.hoa[nearestIdx] || 0) + (comp.assess[nearestIdx] || 0) + (comp.pmi[nearestIdx] || 0);
  const cashToClose = down + (pointsPct / 100) * loanAtBase;

  if ($('#afterTax').checked) {
    const fy = MortgageMath.firstYearTaxSavings({
      ratePct: Math.max(0, baseRate - (+$('#buydownBps').value || 0) / 100),
      loan: loanAtBase,
      termYears: term,
      propTaxAnnual: priceAtBase * (taxRate / 100) + (+$('#fixedAssess').value || 0),
      fedPct: +$('#fedMarg').value || 24,
      caPct: +$('#caMarg').value || 9.3,
      saltCap: +$('#saltCap').value || 10000,
      stdDed: +$('#stdDed').value || 29200
    });
    const monthlyBenefit = fy / 12;
    const afterTaxMonthly = Math.max(0, totalAtBase - monthlyBenefit);
    $('#kpi-monthly').textContent = `Initial Monthly — ${money(totalAtBase)} (after-tax est. ${money(afterTaxMonthly)})`;
  } else {
    $('#kpi-monthly').textContent = `Initial Monthly — ${money(totalAtBase)}`;
  }

  $('#kpi-price').textContent = `Max Price — ${money(priceAtBase)}`;
  $('#kpi-loan').textContent = `Loan — ${money(loanAtBase)}`;
  $('#kpi-cash').textContent = `Cash to Close — ${money(cashToClose)}`;
}

function amortizationRun() {
  const mode = $('#priceOrLoan').value;
  let price = 0;
  let loan = 0;
  if (mode === 'price') {
    price = +$('#price').value || 0;
    const down = +$('#down2').value || 0;
    loan = Math.max(0, price - down);
  } else {
    loan = +$('#loanAmt').value || 0;
    price = loan;
  }

  const rows = MortgageMath.buildAmortizationSchedule({
    price,
    loan,
    ratePct: +$('#rate').value || 0,
    termY: +$('#term2').value || 30,
    cadence: $('#cadence').value,
    pmiPct: +$('#pmiPct2').value || 0,
    taxRate: (+$('#taxRate2').value || 0) + (+$('#extraTaxRate2').value || 0),
    fixedAssess: +$('#fixedAssess2').value || 0,
    insYear: +$('#insYear2').value || 0,
    hoaMo0: +$('#hoa2').value || 0,
    taxStep: (+$('#taxStep').value || 0) / 100,
    hoaStep: (+$('#hoaStep').value || 0) / 100,
    xtraM: +$('#xtraMonthly').value || 0,
    xtraA: +$('#xtraAnnual').value || 0,
    xtraAM: Math.min(12, Math.max(1, +$('#xtraAnnualMonth').value || 1)),
    xtraOnce: +$('#xtraOnce').value || 0,
    xtraOnceM: Math.max(1, +$('#xtraOnceMonth').value || 1)
  });

  const byYear = new Map();
  rows.forEach((r) => {
    const y = Math.floor((r.m - 1) / 12) + 1;
    if (!byYear.has(y)) byYear.set(y, { y, P: 0, I: 0 });
    const v = byYear.get(y);
    v.P += r.prin;
    v.I += r.int;
  });

  const isAbs = $('#absDollars').checked;
  const ys = [...byYear.values()].map((o) => o.y);
  const P = [...byYear.values()].map((o) => o.P);
  const I = [...byYear.values()].map((o) => o.I);

  Plotly.newPlot('amortStack', [
    { name: isAbs ? 'Principal' : 'Principal %', x: ys, y: P, type: 'bar' },
    { name: isAbs ? 'Interest' : 'Interest %', x: ys, y: I, type: 'bar' }
  ], {
    barmode: isAbs ? 'stack' : 'relative',
    title: isAbs ? 'Annual Principal & Interest ($)' : 'Annual Principal vs Interest',
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: { title: 'Year', gridcolor: '#283044' }, yaxis: { title: isAbs ? '$' : 'Relative', gridcolor: '#283044' }
  }, { displaylogo: false, responsive: true });

  const monthlyRows = rows.filter((r) => Number.isInteger(r.m));
  Plotly.newPlot('balanceLine', [{ x: monthlyRows.map((r) => r.m), y: monthlyRows.map((r) => r.bal), mode: 'lines', name: 'Balance' }], {
    title: 'Ending Balance Over Time',
    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: { title: 'Month', gridcolor: '#283044' }, yaxis: { title: '$ Balance', gridcolor: '#283044' }
  }, { displaylogo: false, responsive: true });

  const tbody = $('#amortTable tbody');
  tbody.innerHTML = '';
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.m}</td><td>${r.y}</td><td>${r.pay.toFixed(2)}</td><td>${r.prin.toFixed(2)}</td><td>${r.int.toFixed(2)}</td><td>${r.pmi.toFixed(2)}</td><td>${r.tax.toFixed(2)}</td><td>${r.ins.toFixed(2)}</td><td>${r.hoa.toFixed(2)}</td><td>${r.assess.toFixed(2)}</td><td>${r.extra.toFixed(2)}</td><td>${r.bal.toFixed(2)}</td>`;
    tbody.appendChild(tr);
  });

  if (dataTable) dataTable.destroy(true);
  dataTable = window.jQuery('#amortTable').DataTable({
    paging: true,
    pageLength: 25,
    searching: true,
    ordering: true,
    responsive: true,
    dom: 'Bfrtip',
    buttons: ['copy', 'csv', 'excel', 'pdf', 'print']
  });
}

async function recalc() {
  saveState();
  const isValid = validateInputs();
  if (!isValid) return;
  await ensureVendorLibs();
  affordabilityRun();
  amortizationRun();
}

function wire() {
  $('#afterTax').addEventListener('change', () => {
    showTaxBlock();
    recalc();
  });

  document.querySelectorAll('input,select').forEach((el) => {
    el.addEventListener('input', () => recalc());
    el.addEventListener('change', () => recalc());
  });

  $('#priceOrLoan').addEventListener('change', () => {
    togglePriceLoan();
    recalc();
  });

  $('#btnSave').addEventListener('click', () => {
    saveState();
    alert('Saved.');
  });
  $('#btnLoad').addEventListener('click', () => {
    if (loadState()) {
      togglePriceLoan();
      recalc();
    } else {
      alert('Nothing saved.');
    }
  });
  $('#btnReset').addEventListener('click', () => {
    localStorage.removeItem('mortgageToolkit');
    location.reload();
  });
  $('#btnShare').addEventListener('click', shareLink);
}

(function init() {
  if (tryLoadFromHash()) loadState(); else loadState();
  enhanceAccessibility();
  showTaxBlock();
  togglePriceLoan();
  wire();
  recalc();
})();
