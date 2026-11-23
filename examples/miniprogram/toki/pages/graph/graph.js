const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const ui = require('../../utils/ui.js');

const app = getApp();

/* 布局全部用 rpx：750rpx 就是屏宽，不用先量窗口 */
const ID_W = 250;
const GAP1 = 20;
const PLAT_W = 260;
const GAP2 = 20;
const TOK_W = 160;
const NODE_H = 96;
const TOK_H = 84;
const GAP_Y = 18;
const HEAD = 44;

Page({
  data: {
    active: 'graph',
    theme: 'theme-auto',
    empty: false,
    nodes: [],
    edges: [],
    height: 400,
    colHeads: [],
  },

  onLoad() {
    app.ready().then(() => this.refresh());
  },

  onShow() {
    app.ready().then(() => this.refresh());
  },

  refresh() {
    const prefs = app.globalData.prefs || {};
    const state = store.getState();
    const vm = V.buildGraph(state, prefs);
    this.setData(Object.assign({ theme: ui.themeClass(prefs), empty: !!vm.empty }, this.layout(vm)));
    ui.applyNav(prefs);
  },

  layout(vm) {
    if (vm.empty) return { nodes: [], edges: [], height: 400, colHeads: [] };

    const nodes = [];
    const edges = [];

    const idY = k => HEAD + k * (NODE_H + GAP_Y);
    const platY = k => HEAD + k * (NODE_H + GAP_Y);
    const tokY = k => HEAD + k * (TOK_H + GAP_Y);

    vm.ids.forEach(i => {
      nodes.push({
        key: 'id-' + i.key,
        kind: 'id',
        id: i.key,
        x: 0,
        y: idY(i.index),
        w: ID_W,
        h: NODE_H,
        title: i.title,
        sub: i.sub,
        badge: i.count ? String(i.count) : '',
        style: `left:0rpx;top:${idY(i.index)}rpx;width:${ID_W}rpx;height:${NODE_H}rpx;`,
        tileStyle: i.style,
        letter: (i.title || '?').slice(0, 1).toUpperCase(),
      });
    });

    vm.plats.forEach(p => {
      nodes.push({
        key: 'p-' + p.key,
        kind: 'plat',
        x: ID_W + GAP1,
        y: platY(p.index),
        w: PLAT_W,
        h: NODE_H,
        title: p.name,
        sub: p.count > 1 ? `${p.count} 个账号` : '',
        badge: '',
        style: `left:${ID_W + GAP1}rpx;top:${platY(p.index)}rpx;width:${PLAT_W}rpx;height:${NODE_H}rpx;`,
        tileStyle: `background:${p.bg}`,
        letter: p.letter,
        loose: p.loose,
      });
    });

    /* 同一平台的密钥按顺序排在第三列 */
    let tokCursor = 0;
    const tokensByGroup = new Map();
    vm.toks.forEach(t => {
      const y = tokY(tokCursor++);
      tokensByGroup.set(t.id, y);
      nodes.push({
        key: 't-' + t.id,
        kind: 'tok',
        id: t.id,
        x: ID_W + GAP1 + PLAT_W + GAP2,
        y,
        w: TOK_W,
        h: TOK_H,
        title: t.name,
        sub: t.state === 'expired' ? '已过期' : '',
        style: `left:${ID_W + GAP1 + PLAT_W + GAP2}rpx;top:${y}rpx;width:${TOK_W}rpx;height:${TOK_H}rpx;`,
        tileStyle: `background:${t.bg}`,
        letter: t.letter,
      });
    });

    let edgeSeq = 0;
    const line = (x1, y1, x2, y2, color) => {
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      return {
        id: 'e' + (edgeSeq++),
        style: `left:${x1}rpx;top:${y1 - 1}rpx;width:${len}rpx;transform:rotate(${deg}deg);background:${color};`,
      };
    };

    /* 身份 → 平台 */
    vm.links.forEach(l => {
      const idNode = vm.ids.find(i => i.key === l.from);
      const platNode = vm.plats.find(p => p.index === l.to);
      if (!idNode || !platNode) return;
      const y1 = idY(idNode.index) + NODE_H / 2;
      const y2 = platY(platNode.index) + NODE_H / 2;
      edges.push(line(ID_W, y1, ID_W + GAP1, y2, l.color));
    });

    /* 平台 → 密钥 */
    vm.toks.forEach(t => {
      const platNode = vm.plats.find(p => p.index === t.groupIndex);
      const y2 = tokensByGroup.get(t.id);
      if (!platNode || y2 === undefined) return;
      const y1 = platY(platNode.index) + NODE_H / 2;
      edges.push(line(ID_W + GAP1 + PLAT_W, y1, ID_W + GAP1 + PLAT_W + GAP2, y2 + TOK_H / 2, t.color));
    });

    const rows = Math.max(vm.ids.length, vm.plats.length);
    const height = HEAD + Math.max(rows * (NODE_H + GAP_Y), vm.toks.length * (TOK_H + GAP_Y)) + 30;

    return {
      nodes,
      edges,
      height: Math.max(360, height),
      colHeads: [
        { label: '身份', style: `left:0rpx;top:14rpx;width:${ID_W}rpx;` },
        { label: '平台', style: `left:${ID_W + GAP1}rpx;top:14rpx;width:${PLAT_W}rpx;` },
        { label: '密钥', style: `left:${ID_W + GAP1 + PLAT_W + GAP2}rpx;top:14rpx;width:${TOK_W}rpx;` },
      ],
    };
  },

  onNode(e) {
    const kind = e.currentTarget.dataset.kind;
    const id = e.currentTarget.dataset.id;
    if (kind === 'id' && id) ui.go(`/pages/identity-edit/identity-edit?id=${id}`);
    if (kind === 'tok' && id) ui.go(`/pages/token-edit/token-edit?id=${id}`);
  },

  onAdd() {
    ui.go('/pages/identity-edit/identity-edit?type=email');
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'graph') return;
    ui.goTab(`/pages/${tab}/${tab}`);
  },
});
