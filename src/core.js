(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MortgageMath = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  function pmnt(principal, rAnnualPct, years) {
    const r = rAnnualPct / 100 / 12;
    const n = years * 12;
    if (!Number.isFinite(principal) || !Number.isFinite(n) || n <= 0) return 0;
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  }

  function firstYearTaxSavings({ ratePct, loan, termYears = 30, propTaxAnnual, fedPct, caPct, saltCap, stdDed }) {
    const r = ratePct / 100 / 12;
    let bal = Math.max(0, loan || 0);
    let totalInterest = 0;
    const monthlyPayment = pmnt(bal, ratePct, termYears);

    for (let m = 1; m <= 12; m++) {
      const interest = bal * r;
      const principal = Math.min(Math.max(0, monthlyPayment - interest), bal);
      totalInterest += interest;
      bal -= principal;
      if (bal <= 0) break;
    }

    const deductiblePT = Math.min(Math.max(0, saltCap || 0), Math.max(0, propTaxAnnual || 0));
    const itemized = deductiblePT + totalInterest;
    const effectiveDeduction = Math.max(0, itemized - Math.max(0, stdDed || 0));
    const taxRate = (Math.max(0, fedPct || 0) + Math.max(0, caPct || 0)) / 100;
    return effectiveDeduction * taxRate;
  }

  function affordabilityAtRate({ price, down, term, rate, taxRate, fixedAssess, insMo, hoa, pmiPct }) {
    const loan = Math.max(0, price - down);
    const pi = pmnt(loan, rate, term);
    const tax = price * (taxRate / 100) / 12;
    const assess = fixedAssess / 12;
    const pmi = (loan > 0 && price > 0 && loan / price >= 0.8) ? (pmiPct / 100) * loan / 12 : 0;
    return { pi, tax, ins: insMo, hoa, assess, pmi, total: pi + tax + insMo + hoa + assess + pmi };
  }

  function solveAffordablePrice({ budget, down, term, rate, taxRate, fixedAssess, insMo, hoa, pmiPct, maxPrice = 2000000 }) {
    let lo = 0;
    let hi = maxPrice;
    for (let i = 0; i < 42; i++) {
      const mid = (lo + hi) / 2;
      const monthly = affordabilityAtRate({ price: mid, down, term, rate, taxRate, fixedAssess, insMo, hoa, pmiPct }).total;
      if (monthly > budget) hi = mid; else lo = mid;
    }
    return Math.max(0, lo);
  }

  function buildAmortizationSchedule({
    price, loan, ratePct, termY, cadence, pmiPct, taxRate, fixedAssess, insYear, hoaMo0, taxStep, hoaStep,
    xtraM, xtraA, xtraAM, xtraOnce, xtraOnceM
  }) {
    const rows = [];
    const nMonths = termY * 12;
    const rM = ratePct / 100 / 12;
    const baseMonthly = pmnt(loan, ratePct, termY);

    let bal = loan;
    let pmiOn = (price > 0 && loan / price >= 0.8);

    const taxesForYear = (y) => ((price * (taxRate / 100) + fixedAssess) * Math.pow(1 + taxStep, y)) / 12;
    const hoaForYear = (y) => hoaMo0 * Math.pow(1 + hoaStep, y);

    let month = 0;
    while (bal > 1e-6 && month < nMonths + 240) {
      month += 1;
      const yearIdx = Math.floor((month - 1) / 12);
      const interest = bal * rM;
      const principal = Math.min(baseMonthly - interest, bal);

      let extra = xtraM;
      if ((month % 12) === (xtraAM % 12)) extra += xtraA;
      if (month === xtraOnceM) extra += xtraOnce;

      const pmiMo = pmiOn ? (pmiPct / 100) * loan / 12 : 0;
      const taxesMo = taxesForYear(yearIdx);
      const insMo = insYear / 12;
      const hoaNow = hoaForYear(yearIdx);

      bal = Math.max(0, bal - principal - extra);
      if (pmiOn && price > 0 && bal <= 0.8 * price) pmiOn = false;

      rows.push({
        m: month,
        y: yearIdx + 1,
        pay: Number(baseMonthly.toFixed(2)),
        prin: Number(principal.toFixed(2)),
        int: Number(interest.toFixed(2)),
        pmi: Number(pmiMo.toFixed(2)),
        tax: Number(taxesMo.toFixed(2)),
        ins: Number(insMo.toFixed(2)),
        hoa: Number(hoaNow.toFixed(2)),
        assess: Number((fixedAssess / 12).toFixed(2)),
        extra: Number(extra.toFixed(2)),
        bal: Number(bal.toFixed(2))
      });
      if (bal <= 0) break;

      if (cadence === 'biweekly' && (month % 6 === 0)) {
        const half = baseMonthly / 2;
        const i2 = bal * rM / 2;
        const p2 = Math.min(half - i2, bal);
        bal = Math.max(0, bal - p2);
        rows.push({
          m: Number(`${month}.5`),
          y: yearIdx + 1,
          pay: Number(half.toFixed(2)),
          prin: Number(p2.toFixed(2)),
          int: Number(i2.toFixed(2)),
          pmi: Number((pmiOn ? (pmiPct / 100) * loan / 24 : 0).toFixed(2)),
          tax: Number((taxesMo / 2).toFixed(2)),
          ins: Number((insMo / 2).toFixed(2)),
          hoa: Number((hoaNow / 2).toFixed(2)),
          assess: Number((fixedAssess / 24).toFixed(2)),
          extra: 0,
          bal: Number(bal.toFixed(2))
        });
        if (pmiOn && price > 0 && bal <= 0.8 * price) pmiOn = false;
        if (bal <= 0) break;
      }
    }

    return rows;
  }



  function validateScenarioInputs(input) {
    const errors = [];
    const num = (v) => Number(v);
    const nonNegative = [
      ['maxMonthly', 'Max monthly budget'],
      ['monthlyIncome', 'Monthly income'],
      ['liquidCash', 'Liquid cash reserves'],
      ['down', 'Down payment'],
      ['term', 'Term'],
      ['baseRate', 'Base rate'],
      ['rMin', 'Rate min'],
      ['rMax', 'Rate max'],
      ['taxRate', 'Property tax rate'],
      ['price', 'Purchase price'],
      ['loan', 'Loan amount'],
      ['term2', 'Amortization term'],
      ['rate', 'Mortgage rate']
    ];

    nonNegative.forEach(([k, label]) => {
      if (k in input) {
        if (input[k] === undefined || input[k] === null || input[k] === '') return;
        const v = num(input[k]);
        if (!Number.isFinite(v)) errors.push(`${label} must be a valid number.`);
        if (Number.isFinite(v) && v < 0) errors.push(`${label} cannot be negative.`);
      }
    });

    if ('term' in input && num(input.term) <= 0) errors.push('Affordability term must be greater than 0.');
    if ('term2' in input && num(input.term2) <= 0) errors.push('Amortization term must be greater than 0.');
    if ('rMin' in input && 'rMax' in input && num(input.rMin) > num(input.rMax)) errors.push('Rate min cannot be greater than rate max.');
    if ('price' in input && input.price !== undefined && 'down2' in input && input.down2 !== undefined && num(input.down2) > num(input.price)) errors.push('Down payment cannot exceed purchase price.');
    if ('price' in input && input.price !== undefined && num(input.price) === 0 && 'down2' in input && input.down2 !== undefined && num(input.down2) > 0) errors.push('Down payment requires purchase price greater than 0.');

    return errors;
  }

  return {
    pmnt,
    firstYearTaxSavings,
    affordabilityAtRate,
    solveAffordablePrice,
    buildAmortizationSchedule,
    validateScenarioInputs
  };
}));
