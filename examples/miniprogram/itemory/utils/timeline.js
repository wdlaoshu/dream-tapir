/* Itemory 小程序 · 时间轴
   对应 Itemory/domain/timeline.ts（MIT，Copyright (c) 2026 StarYunLee）。
   购入和结束持有是派生节点（不能单独删除），资金流水是独立记录。 */

const { MONEY_KIND_META } = require('./model.js');

function buildTimeline(item, moneyEntries, exit) {
  const items = [];

  items.push({
    id: `acq-${item.id}`,
    itemId: item.id,
    type: 'purchase',
    date: item.acquiredOn,
    title: '购入物品',
    subtitle: null,
    amountMinor: item.acquisitionAmountMinor,
    direction: 'expense',
    canEdit: false,
    canDelete: false,
    createdAt: item.createdAt,
  });

  for (const entry of moneyEntries || []) {
    items.push({
      id: entry.id,
      itemId: item.id,
      type: entry.direction === 'expense' ? 'money_expense' : 'money_income',
      date: entry.occurredOn,
      title: entry.title,
      subtitle: entry.note,
      amountMinor: entry.amountMinor,
      direction: entry.direction,
      kind: entry.kind,
      kindLabel: (MONEY_KIND_META[entry.kind] || MONEY_KIND_META.other).label,
      isPostExitSettlement: exit ? entry.occurredOn > exit.exitedOn : false,
      canEdit: true,
      canDelete: true,
      createdAt: entry.createdAt,
    });
  }

  if (exit) {
    const reasonTextMap = { sold: '出售物品', gifted: '赠送物品', discarded: '丢弃物品', lost: '物品遗失' };
    items.push({
      id: `exit-${item.id}`,
      itemId: item.id,
      type: 'exit',
      date: exit.exitedOn,
      title: reasonTextMap[exit.reason] || '结束持有',
      subtitle: exit.note,
      amountMinor: exit.recoveryAmountMinor,
      direction: 'income',
      reason: exit.reason,
      canEdit: true,
      canDelete: false,
      createdAt: exit.createdAt,
    });
  }

  return items.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt - a.createdAt;
  });
}

module.exports = { buildTimeline };
