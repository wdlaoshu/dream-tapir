const store = require('../../utils/store.js');
const V = require('../../utils/view.js');
const ui = require('../../utils/ui.js');

const app = getApp();

/* 布局全部用 rpx：750rpx 就是屏宽，不用先量窗口。
   连线用一张整幅的 SVG 背景：贝塞尔曲线跟网页版一致，
   又能避开四端 canvas 的差异。 */
const VIEW_W = 710;
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
    edgesUrl: '',
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
    if (vm.empty) return { nodes: [], edgesUrl: '', height: 400, colHeads: [] };

    const nodes = [];
    const paths = [];

    const idY = k => HEAD + k * (NODE_H + GAP_Y);
    const platY = k => HEAD + k * (NODE_H + GAP_Y);
    const tokY = k => HEAD + k * (TOK_H + GAP_Y);

    vm.ids.forEach(i => {
      nodes.push({
        key: 'id-' + i.key,
        kind: 'id',
        id: i.key,
        style: `left:0rpx;top:${idY(i.index)}rpx;width:${ID_W}rpx;height:${NODE_H}rpx;`,
        title: i.title,
        sub: i.sub,
        badge: i.count ? String(i.count) : '',
        tile: i.tile,
      });
    });

    vm.plats.forEach(p => {
      nodes.push({
        key: 'p-' + p.key,
        kind: 'plat',
        id: '',
        style: `left:${ID_W + GAP1}rpx;top:${platY(p.index)}rpx;width:${PLAT_W}rpx;height:${NODE_H}rpx;`,
        title: p.name,
        sub: p.count > 1 ? `${p.count} 个账号` : '',
        badge: '',
        tile: p.tile,
        loose: p.loose,
      });
    });

    /* 同一平台的密钥按顺序排在第三列 */
    let cursor = 0;
    const tokenY = new Map();
    vm.toks.forEach(t => {
      const y = tokY(cursor++);
      tokenY.set(t.id, y);
      nodes.push({
        key: 't-' + t.id,
        kind: 'tok',
        id: t.id,
        style: `left:${ID_W + GAP1 + PLAT_W + GAP2}rpx;top:${y}rpx;width:${TOK_W}rpx;height:${TOK_H}rpx;`,
        title: t.name,
        sub: t.state === 'expired' ? '已过期' : '',
        badge: '',
        tile: t.tile,
      });
    });

    /* 曲线从右边缘连到左边缘，控制点取中点，和网页版一样 */
    const curve = (x1, y1, x2, y2, color) => {
      const mx = (x1 + x2) / 2;
      paths.push(
        `<path d="M${x1} ${y1.toFixed(1)}C${mx} ${y1.toFixed(1)} ${mx} ${y2.toFixed(1)} ${x2} ${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2" opacity="0.55"/>`
      );
    };

    vm.links.forEach(l => {
      const idNode = vm.ids.find(i => i.key === l.from);
      const platNode = vm.plats.find(p => p.index === l.to);
      if (!idNode || !platNode) return;
      curve(ID_W, idY(idNode.index) + NODE_H / 2, ID_W + GAP1, platY(platNode.index) + NODE_H / 2, l.color);
    });

    vm.toks.forEach(t => {
      const platNode = vm.plats.find(p => p.index === t.groupIndex);
      const y2 = tokenY.get(t.id);
      if (!platNode || y2 === undefined) return;
      curve(
        ID_W + GAP1 + PLAT_W,
        platY(platNode.index) + NODE_H / 2,
        ID_W + GAP1 + PLAT_W + GAP2,
        y2 + TOK_H / 2,
        t.color
      );
    });

    const rows = Math.max(vm.ids.length, vm.plats.length);
    const height = HEAD + Math.max(rows * (NODE_H + GAP_Y), vm.toks.length * (TOK_H + GAP_Y)) + 30;
    const H = Math.max(360, height);

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${H}" preserveAspectRatio="none">${paths.join('')}</svg>`;

    return {
      nodes,
      edgesUrl: `background-image:url('data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}');background-size:100% 100%;background-repeat:no-repeat;background-position:top left;`,
      height: H,
      colHeads: [
        { label: '身份', style: `left:0rpx;width:${ID_W}rpx;` },
        { label: '平台', style: `left:${ID_W + GAP1}rpx;width:${PLAT_W}rpx;` },
        { label: '密钥', style: `left:${ID_W + GAP1 + PLAT_W + GAP2}rpx;width:${TOK_W}rpx;` },
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
