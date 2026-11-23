/* Itemory 小程序 · 领域校验
   对应 Itemory/domain/validation.ts（MIT，Copyright (c) 2026 StarYunLee）。
   规则一字不改：金额用整数分、日期是 YYYY-MM-DD 且不能晚于今天、
   转手退出才允许填写回收金额。 */

const { isValidYmd, todayYmd } = require('./format.js');

const CONDITIONS = ['in_use', 'idle', 'damaged'];
const EXIT_REASONS = ['sold', 'gifted', 'discarded', 'lost'];
const DIRECTIONS = ['expense', 'income'];
const MONEY_KINDS = ['accessory', 'maintenance', 'repair', 'upgrade', 'other'];

const NAME_MAX_LENGTH = 120;

function nfc(text) {
  /* 个别 JS 引擎没有 String.prototype.normalize，退化时保留原文即可 */
  try { return text.normalize('NFC'); } catch (e) { return text; }
}

function normalizeEntityName(value) {
  const displayName = nfc(String(value || '').trim());
  if (!displayName) throw new Error('名称不能为空');
  return { displayName, normalizedName: displayName.toLowerCase() };
}

function uniqueSortedIds(values) {
  return Array.from(new Set((values || []).filter(v => v && v.length > 0))).sort();
}

function assertSafeMinor(value, field, options) {
  const opts = options || {};
  if (value === null || value === undefined) {
    if (opts.nullable !== false) return null;
    throw new Error(`${field}不能为空`);
  }
  if (!Number.isSafeInteger(value)) throw new Error(`${field}必须为安全整数分`);
  if (opts.positive ? value <= 0 : value < 0) {
    throw new Error(`${field}${opts.positive ? '必须大于 0' : '不能为负数'}`);
  }
  return value;
}

function safeAddMinor(left, right, field) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${field || '金额汇总'}超出安全范围`);
  return result;
}

function safeSubtractMinor(left, right, field) {
  const result = left - right;
  if (!Number.isSafeInteger(result)) throw new Error(`${field || '净支出'}超出安全范围`);
  return result;
}

function assertBusinessDate(value, field, options) {
  const opts = options || {};
  if (!isValidYmd(value)) throw new Error(`${field}格式无效`);
  if (!opts.allowFuture && value > todayYmd()) throw new Error(`${field}不能晚于今天`);
  if (opts.min && value < opts.min) throw new Error(`${field}不能早于购入日期`);
  return value;
}

function assertItemRecord(item) {
  if (!item.id || !String(item.name || '').trim()) throw new Error('数据异常：物品主档缺少 ID 或名称');
  assertBusinessDate(item.acquiredOn, '数据异常：购入日期');
  assertSafeMinor(item.acquisitionAmountMinor, '数据异常：购入金额');
  assertSafeMinor(item.valuationMinor, '数据异常：估值');
  if (CONDITIONS.indexOf(item.holdingCondition) < 0) throw new Error('数据异常：未知持有状态');
  if (!Number.isSafeInteger(item.revision) || item.revision < 1) throw new Error('数据异常：修订号无效');
  if (item.warrantyUntil !== null && !isValidYmd(item.warrantyUntil)) throw new Error('数据异常：保修日期无效');
}

function assertMoneyRecord(entry) {
  if (!entry.id || !String(entry.title || '').trim()) throw new Error('数据异常：资金记录缺少 ID 或标题');
  if (DIRECTIONS.indexOf(entry.direction) < 0) throw new Error('数据异常：未知资金方向');
  if (MONEY_KINDS.indexOf(entry.kind) < 0) throw new Error('数据异常：未知资金类型');
  assertSafeMinor(entry.amountMinor, '数据异常：资金金额', { nullable: false, positive: true });
  assertBusinessDate(entry.occurredOn, '数据异常：资金日期');
}

function assertExitRecord(exit, acquiredOn) {
  if (EXIT_REASONS.indexOf(exit.reason) < 0) throw new Error('数据异常：未知退出原因');
  assertBusinessDate(exit.exitedOn, '数据异常：结束日期', { min: acquiredOn });
  assertSafeMinor(exit.recoveryAmountMinor, '数据异常：回收金额');
  if (exit.reason !== 'sold' && exit.recoveryAmountMinor !== null) {
    throw new Error('数据异常：非转手退出不应包含回收金额');
  }
}

function isMoneyDirection(v) { return DIRECTIONS.indexOf(v) >= 0; }
function isMoneyEntryKind(v) { return MONEY_KINDS.indexOf(v) >= 0; }
function isItemCondition(v) { return CONDITIONS.indexOf(v) >= 0; }
function isExitReason(v) { return EXIT_REASONS.indexOf(v) >= 0; }

module.exports = {
  NAME_MAX_LENGTH,
  CONDITIONS,
  EXIT_REASONS,
  DIRECTIONS,
  MONEY_KINDS,
  normalizeEntityName,
  uniqueSortedIds,
  assertSafeMinor,
  safeAddMinor,
  safeSubtractMinor,
  assertBusinessDate,
  assertItemRecord,
  assertMoneyRecord,
  assertExitRecord,
  isMoneyDirection,
  isMoneyEntryKind,
  isItemCondition,
  isExitReason,
};
