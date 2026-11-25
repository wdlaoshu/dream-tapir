/* Itemory 小程序 · 持有成本
   对应 Itemory/domain/cost.ts（MIT，Copyright (c) 2026 StarYunLee）。
   口径：累计投入 = 购入价 + 所有支出；累计回收 = 所有收入 + 转手金额；
   净支出 = 投入 - 回收；日均 = 净支出 / 陪伴天数（四舍五入到分）。 */

const {
  assertItemRecord, assertMoneyRecord, assertExitRecord,
  assertSafeMinor, safeAddMinor, safeSubtractMinor,
} = require('./validate.js');
const { calendarHoldingDays, isValidYmd, todayYmd } = require('./format.js');

function unavailableCostSummary(item, exit, reason) {
  let days = null;
  try {
    const today = todayYmd();
    if (isValidYmd(item.acquiredOn) && item.acquiredOn <= today &&
      (!exit || (isValidYmd(exit.exitedOn) && exit.exitedOn >= item.acquiredOn && exit.exitedOn <= today))) {
      days = calendarHoldingDays(item.acquiredOn, exit && exit.exitedOn);
    }
  } catch (e) { /* 保留原始记录，不把未知装成 0 天 */ }
  return {
    available: false,
    unavailableReason: reason instanceof Error ? reason.message : String(reason),
    totalExpenseMinor: 0,
    totalIncomeMinor: 0,
    netCostMinor: 0,
    holdingDays: days,
    dailyCostMinor: 0,
    isAcquisitionPriceKnown: item.acquisitionAmountMinor !== null,
    isExitPriceKnown: exit && exit.reason === 'sold' ? exit.recoveryAmountMinor !== null : true,
  };
}

function calculateCostSummary(item, moneyEntries, exit) {
  const isAcquisitionPriceKnown = item.acquisitionAmountMinor !== null;
  assertItemRecord(item);
  const initialCost = assertSafeMinor(item.acquisitionAmountMinor, '购入金额');

  let totalExpenseMinor = initialCost === null ? 0 : initialCost;
  let totalIncomeMinor = 0;

  for (const entry of moneyEntries || []) {
    assertMoneyRecord(entry);
    if (entry.direction === 'expense') {
      totalExpenseMinor = safeAddMinor(totalExpenseMinor, entry.amountMinor, '累计投入');
    } else if (entry.direction === 'income') {
      totalIncomeMinor = safeAddMinor(totalIncomeMinor, entry.amountMinor, '累计收入');
    }
  }

  const isExitPriceKnown = exit && exit.reason === 'sold' ? exit.recoveryAmountMinor !== null : true;
  if (exit) {
    assertExitRecord(exit, item.acquiredOn);
    if (exit.recoveryAmountMinor !== null) {
      totalIncomeMinor = safeAddMinor(totalIncomeMinor, exit.recoveryAmountMinor, '累计收入');
    }
  }

  const netCostMinor = safeSubtractMinor(totalExpenseMinor, totalIncomeMinor, '净支出');
  const days = calendarHoldingDays(item.acquiredOn, exit && exit.exitedOn);
  const dailyCostMinor = Math.round(netCostMinor / days);
  if (!Number.isSafeInteger(dailyCostMinor)) throw new Error('日均成本超出安全范围');

  return {
    available: true,
    unavailableReason: null,
    totalExpenseMinor,
    totalIncomeMinor,
    netCostMinor,
    holdingDays: days,
    dailyCostMinor,
    isAcquisitionPriceKnown,
    isExitPriceKnown,
  };
}

/* 单个物品的容错包装：坏数据不让整页崩掉 */
function safeCostSummary(item, moneyEntries, exit) {
  try {
    return calculateCostSummary(item, moneyEntries, exit);
  } catch (e) {
    return unavailableCostSummary(item, exit, e);
  }
}

module.exports = { calculateCostSummary, unavailableCostSummary, safeCostSummary };
