/* Itemory 小程序 · 数据模型常量
   对应 Itemory/models/types.ts（MIT，Copyright (c) 2026 StarYunLee）。
   SF Symbols 在小程序里不存在，所以每个 SF Symbol 都换成等价的 Emoji，
   其余结构（字段名、枚举值、状态色）保持与桌面版一致。 */

const DEFAULT_CATEGORIES = [
  { id: 'digital', name: '数码电子', icon: 'laptopcomputer', sortOrder: 1 },
  { id: 'appliance', name: '家用电器', icon: 'refrigerator.fill', sortOrder: 2 },
  { id: 'home', name: '家具家居', icon: 'sofa.fill', sortOrder: 3 },
  { id: 'wearable', name: '服饰配件', icon: 'tshirt.fill', sortOrder: 4 },
  { id: 'transport', name: '交通工具', icon: 'car.fill', sortOrder: 5 },
  { id: 'outdoor', name: '运动户外', icon: 'tent.fill', sortOrder: 6 },
  { id: 'tool', name: '工具设备', icon: 'hammer.fill', sortOrder: 7 },
  { id: 'collection', name: '文娱收藏', icon: 'books.vertical.fill', sortOrder: 8 },
  { id: 'other', name: '其他', icon: 'shippingbox.fill', sortOrder: 9 },
];

/* 分类图标：SF Symbol → Emoji（覆盖默认分类与预设分类符号） */
const SYMBOL_EMOJI = {
  'laptopcomputer': '💻',
  'iphone': '📱',
  'ipad': '📱',
  'applewatch': '⌚',
  'headphones': '🎧',
  'camera.fill': '📷',
  'gamecontroller.fill': '🎮',
  'refrigerator.fill': '🧊',
  'washer.fill': '🌀',
  'lamp.table.fill': '💡',
  'sofa.fill': '🛋️',
  'chair.lounge.fill': '🪑',
  'fork.knife': '🍴',
  'cup.and.saucer.fill': '☕',
  'tshirt.fill': '👕',
  'eyeglasses': '👓',
  'bag.fill': '👜',
  'figure.run': '🏃',
  'bicycle': '🚲',
  'car.fill': '🚗',
  'tent.fill': '⛺',
  'hammer.fill': '🔨',
  'wrench.and.screwdriver.fill': '🔧',
  'book.fill': '📖',
  'books.vertical.fill': '📚',
  'guitars.fill': '🎸',
  'leaf.fill': '🌿',
  'heart.fill': '❤️',
  'shippingbox.fill': '📦',
  'questionmark.folder': '❔',
  'puzzlepiece.fill': '🧩',
  'sparkles': '✨',
  'wrench.adjustable.fill': '🔧',
  'cpu.fill': '⚙️',
  'creditcard.fill': '💳',
  'bag.fill.purchase': '🛍️',
  'banknote.fill': '💵',
  'gift.fill': '🎁',
  'trash.fill': '🗑️',
  'stop.circle.fill': '⏹️',
};

/* 分类可选 Emoji：取自上面的符号映射，去重后固定顺序 */
const CATEGORY_EMOJI_CHOICES = Array.from(new Set([
  '📦', '💻', '📱', '⌚', '🎧', '📷', '🎮', '🧊', '🌀', '💡', '🛋️', '🪑',
  '🍴', '☕', '👕', '👓', '👜', '🏃', '🚲', '🚗', '⛺', '🔨', '🔧', '📖',
  '📚', '🎸', '🌿', '❤️',
]));

const FALLBACK_CATEGORY_EMOJI = '📦';

const ITEM_STATUS_META = {
  in_use: { label: '在用', color: '#34C759', emoji: '✅', icon: 'checkmark.circle.fill' },
  idle: { label: '闲置', color: '#8E8E93', emoji: '⏸️', icon: 'pause.circle.fill' },
  damaged: { label: '损坏', color: '#FF9500', emoji: '⚠️', icon: 'exclamationmark.triangle.fill' },
  sold: { label: '已出售', color: '#007AFF', emoji: '💵', icon: 'banknote.fill' },
  gifted: { label: '已赠送', color: '#AF52DE', emoji: '🎁', icon: 'gift.fill' },
  discarded: { label: '已丢弃', color: '#A2845E', emoji: '🗑️', icon: 'trash.fill' },
  lost: { label: '已遗失', color: '#FF3B30', emoji: '❓', icon: 'questionmark.circle.fill' },
};

const EFFECTIVE_ITEM_STATUSES = ['in_use', 'idle', 'damaged', 'sold', 'gifted', 'discarded', 'lost'];

const ITEM_CONDITION_OPTIONS = [
  { id: 'in_use', label: ITEM_STATUS_META.in_use.label },
  { id: 'idle', label: ITEM_STATUS_META.idle.label },
  { id: 'damaged', label: ITEM_STATUS_META.damaged.label },
];

const EXIT_REASON_LABELS = { sold: '出售', gifted: '赠送', discarded: '丢弃', lost: '遗失' };

const EXIT_REASON_OPTIONS = [
  { id: 'sold', label: '出售', emoji: '💵' },
  { id: 'gifted', label: '赠送', emoji: '🎁' },
  { id: 'discarded', label: '丢弃', emoji: '🗑️' },
  { id: 'lost', label: '遗失', emoji: '❓' },
];

const MONEY_KIND_META = {
  accessory: { label: '配件', color: '#007AFF', emoji: '🧩', icon: 'puzzlepiece.fill' },
  maintenance: { label: '保养', color: '#34C759', emoji: '✨', icon: 'sparkles' },
  repair: { label: '维修', color: '#FF9500', emoji: '🔧', icon: 'wrench.adjustable.fill' },
  upgrade: { label: '升级', color: '#AF52DE', emoji: '⚙️', icon: 'cpu.fill' },
  other: { label: '其他', color: '#8E8E93', emoji: '💳', icon: 'creditcard.fill' },
};

const MONEY_KIND_OPTIONS = Object.keys(MONEY_KIND_META).map(id => ({ id, label: MONEY_KIND_META[id].label, emoji: MONEY_KIND_META[id].emoji }));

const TIMELINE_TYPE_META = {
  purchase: { label: '购入物品', color: '#007AFF', emoji: '🛍️' },
  money_expense: { label: '支出', color: '#007AFF', emoji: '💳' },
  money_income: { label: '收入', color: '#34C759', emoji: '💵' },
  exit: { label: '结束持有', color: '#8E8E93', emoji: '⏹️' },
};

const TAG_COLORS = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6', '#FF2D55', '#8E8E93'];

const HOLDING_BUCKET_LABELS = ['30 天以内', '31–180 天', '181–365 天', '1–3 年', '3 年以上'];

/* SF Symbol 名称全是英文、数字、点号和短横线；含其他字符即视为 Emoji */
function isEmojiSymbol(symbol) {
  if (!symbol) return false;
  return /[^\u0020-\u007E]/.test(String(symbol));
}

function symbolEmoji(symbol) {
  if (!symbol) return '';
  if (isEmojiSymbol(symbol)) return symbol;
  return SYMBOL_EMOJI[symbol] || '';
}

/* 物品显示的图标：优先物品自己的图标，其次分类图标，最后兜底盒子 */
function itemEmoji(item, category) {
  const own = symbolEmoji(item && item.iconSymbol);
  if (own) return own;
  const cat = symbolEmoji(category && category.icon);
  return cat || FALLBACK_CATEGORY_EMOJI;
}

function categoryEmoji(category) {
  return symbolEmoji(category && category.icon) || FALLBACK_CATEGORY_EMOJI;
}

function effectiveItemStatus(item, exit) {
  return (exit && exit.reason) || item.holdingCondition;
}

function itemStatusMeta(item, exit) {
  return ITEM_STATUS_META[effectiveItemStatus(item, exit)];
}

module.exports = {
  DEFAULT_CATEGORIES,
  SYMBOL_EMOJI,
  FALLBACK_CATEGORY_EMOJI,
  CATEGORY_EMOJI_CHOICES,
  ITEM_STATUS_META,
  EFFECTIVE_ITEM_STATUSES,
  ITEM_CONDITION_OPTIONS,
  EXIT_REASON_LABELS,
  EXIT_REASON_OPTIONS,
  MONEY_KIND_META,
  MONEY_KIND_OPTIONS,
  TIMELINE_TYPE_META,
  TAG_COLORS,
  HOLDING_BUCKET_LABELS,
  isEmojiSymbol,
  symbolEmoji,
  itemEmoji,
  categoryEmoji,
  effectiveItemStatus,
  itemStatusMeta,
};
