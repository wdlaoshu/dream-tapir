/* Itemory 小程序 · 日期与金额格式化
   逐条对应 Itemory/services/format.ts（MIT，Copyright (c) 2026 StarYunLee）。 */

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isValidYmd(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m - 1];
}

function addYearsYmd(ymd, years) {
  if (!isValidYmd(ymd) || !Number.isInteger(years)) throw new Error('日期格式无效');
  const [year, month, day] = ymd.split('-').map(Number);
  const targetYear = year + years;
  const leap = targetYear % 4 === 0 && (targetYear % 100 !== 0 || targetYear % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return `${targetYear}-${pad2(month)}-${pad2(Math.min(day, days[month - 1]))}`;
}

function tsToYmd(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function ymdToTs(ymd) {
  if (!isValidYmd(ymd)) throw new Error('日期格式无效');
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/* 严格日历差，首日算 1 天 */
function calendarHoldingDays(startOn, endOn) {
  const end = endOn || todayYmd();
  const ordinal = value => {
    if (!isValidYmd(value)) throw new Error('日期格式无效');
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime() / 86400000;
  };
  const delta = ordinal(end) - ordinal(startOn);
  if (delta < 0) throw new Error('结束日期不得早于购入日期');
  return delta + 1;
}

/* 人民币文本 → 整数分；空返回 null，非法抛错 */
function parseYuanToMinor(text) {
  if (text === null || text === undefined) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  const value = trimmed.replace(/^[¥￥]\s*/, '');
  if (!/^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('请输入非负金额，最多两位小数；千分位格式须正确');
  }
  const [whole, fraction = ''] = value.replace(/,/g, '').split('.');
  const digits = (whole + fraction.padEnd(2, '0')).replace(/^0+(?=\d)/, '');
  const limit = String(Number.MAX_SAFE_INTEGER);
  if (digits.length > limit.length || (digits.length === limit.length && digits > limit)) {
    throw new Error('金额超出安全范围');
  }
  const minor = Number(digits);
  if (!Number.isSafeInteger(minor)) throw new Error('金额超出安全范围');
  return minor;
}

function minorToDecimalText(minor) {
  if (!Number.isSafeInteger(minor)) throw new Error('金额必须为安全整数分');
  const sign = minor < 0 ? '-' : '';
  const digits = String(Math.abs(minor)).padStart(3, '0');
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function formatMinorMoney(minor, compact) {
  if (minor === null || minor === undefined) return '金额未知';
  if (!Number.isSafeInteger(minor)) throw new Error('金额必须为安全整数分');
  const decimal = minorToDecimalText(minor);
  if (!compact) return `¥${decimal}`;
  const compactDecimal = decimal.endsWith('.00') ? decimal.slice(0, -3) : decimal.replace(/0$/, '');
  return `¥${compactDecimal}`;
}

function formatYmdZh(ymd) {
  if (!isValidYmd(ymd)) return ymd;
  const parts = ymd.split('-').map(Number);
  return `${parts[0]}年${parts[1]}月${parts[2]}日`;
}

function formatHoldingDuration(days) {
  if (days < 365) return `${days} 天`;
  return `${days} 天 (${(days / 365).toFixed(1)} 年)`;
}

module.exports = {
  pad2,
  todayYmd,
  isValidYmd,
  addYearsYmd,
  tsToYmd,
  ymdToTs,
  calendarHoldingDays,
  parseYuanToMinor,
  minorToDecimalText,
  formatMinorMoney,
  formatYmdZh,
  formatHoldingDuration,
};
