const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pmnt,
  firstYearTaxSavings,
  solveAffordablePrice,
  affordabilityAtRate,
  buildAmortizationSchedule,
  validateScenarioInputs
} = require('../src/core.js');

test('pmnt returns known monthly payment sample', () => {
  const payment = pmnt(300000, 6.5, 30);
  assert.ok(payment > 1800 && payment < 1900);
});

test('firstYearTaxSavings responds to term length', () => {
  const common = {
    ratePct: 6.5,
    loan: 300000,
    propTaxAnnual: 6000,
    fedPct: 24,
    caPct: 9,
    saltCap: 10000,
    stdDed: 0
  };
  const term15 = firstYearTaxSavings({ ...common, termYears: 15 });
  const term30 = firstYearTaxSavings({ ...common, termYears: 30 });
  assert.notEqual(term15, term30);
});

test('solveAffordablePrice finds a price within budget', () => {
  const price = solveAffordablePrice({
    budget: 2500,
    down: 50000,
    term: 30,
    rate: 6.5,
    taxRate: 1.2,
    fixedAssess: 0,
    insMo: 100,
    hoa: 150,
    pmiPct: 0.5
  });
  const monthly = affordabilityAtRate({
    price,
    down: 50000,
    term: 30,
    rate: 6.5,
    taxRate: 1.2,
    fixedAssess: 0,
    insMo: 100,
    hoa: 150,
    pmiPct: 0.5
  }).total;
  assert.ok(monthly <= 2500.05);
});

test('amortization schedule pays off and cancels PMI', () => {
  const rows = buildAmortizationSchedule({
    price: 300000,
    loan: 270000,
    ratePct: 6,
    termY: 30,
    cadence: 'monthly',
    pmiPct: 0.5,
    taxRate: 1.2,
    fixedAssess: 0,
    insYear: 1200,
    hoaMo0: 100,
    taxStep: 0,
    hoaStep: 0,
    xtraM: 0,
    xtraA: 0,
    xtraAM: 1,
    xtraOnce: 0,
    xtraOnceM: 1
  });

  assert.ok(rows.length > 0);
  assert.equal(rows.at(-1).bal, 0);
  assert.ok(rows.some((r) => r.pmi > 0));
  assert.ok(rows.some((r) => r.pmi === 0));
});


test('validateScenarioInputs returns useful field errors', () => {
  const errors = validateScenarioInputs({
    maxMonthly: -1,
    down: 1000,
    term: 0,
    baseRate: 6,
    rMin: 8,
    rMax: 6,
    price: 300000,
    down2: 350000,
    term2: 0,
    rate: 6.5
  });

  assert.ok(errors.some((e) => e.includes('cannot be negative')));
  assert.ok(errors.some((e) => e.includes('term must be greater than 0')));
  assert.ok(errors.some((e) => e.includes('Rate min')));
  assert.ok(errors.some((e) => e.includes('Down payment')));
});
