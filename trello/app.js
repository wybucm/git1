/*
 * 看板 —— 一个零依赖的 Trello 风格看板
 * 功能：列表/卡片增删改、拖拽排序（鼠标 + 触屏长按）、标签、截止日期、
 *      检查清单、封面、搜索筛选、背景切换、深浅主题、撤销、导入导出、本地持久化
 */
(() => {
  'use strict';

  /* ---------- 常量 ---------- */
  const STORAGE_KEY = 'kanban-board-v1';
  const THEME_KEY = 'kanban-theme';

  const COLORS = {
    green:  { name: '绿色', bg: '#4bce97', fg: '#164b35' },
    yellow: { name: '黄色', bg: '#f5cd47', fg: '#533f04' },
    orange: { name: '橙色', bg: '#fea362', fg: '#702e00' },
    red:    { name: '红色', bg: '#f87168', fg: '#5d1f1a' },
    purple: { name: '紫色', bg: '#9f8fef', fg: '#352c63' },
    blue:   { name: '蓝色', bg: '#579dff', fg: '#09326c' },
    sky:    { name: '天蓝', bg: '#6cc3e0', fg: '#164555' },
    lime:   { name: '青柠', bg: '#94c748', fg: '#37471f' },
    pink:   { name: '粉色', bg: '#e774bb', fg: '#50253f' },
    gray:   { name: '灰色', bg: '#8590a2', fg: '#091e42' },
  };

  const BACKGROUNDS = [
    'linear-gradient(135deg, #0c66e4 0%, #8f7ee7 100%)',
    'linear-gradient(135deg, #ff9a8b 0%, #ff6a88 55%, #ff99ac 100%)',
    'linear-gradient(135deg, #1f845a 0%, #3fb8af 100%)',
    'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
    'linear-gradient(135deg, #654ea3 0%, #eaafc8 100%)',
    'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    'linear-gradient(135deg, #cc2b5e 0%, #753a88 100%)',
    '#0079bf', '#d29034', '#519839', '#b04632',
    '#89609e', '#cd5a91', '#4bbf6b', '#838c91',
  ];

  const DUE_FILTERS = [
    ['overdue', '已逾期'],
    ['soon', '即将到期（1 天内）'],
    ['done', '已完成'],
    ['none', '没有截止日期'],
  ];

  const svg = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    back: svg('<path d="m15 18-6-6 6-6"/>'),
    dots: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    desc: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    checklist: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>'),
    tag: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>'),
    image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>'),
    move: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
    card: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    filter: svg('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
    palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-7.8-9-7.8z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="10.5" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>'),
    star: svg('<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>'),
    pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    download: svg('<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>'),
    upload: svg('<path d="M12 20V8M6 14l6-6 6 6M4 4h16"/>'),
    reset: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
    sort: svg('<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>'),
    activity: svg('<path d="M3 12h4l3 8 4-16 3 8h4"/>'),
  };

  /* ---------- 工具函数 ---------- */
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const toDateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => toDateStr(new Date());
  const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return toDateStr(d); };
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const isDateStr = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const labelStyle = l => `--lb:${COLORS[l.color].bg};--lf:${COLORS[l.color].fg}`;
  const oneLine = s => s.replace(/\s+/g, ' ').trim();

  function formatDate(s, withWeekday) {
    const d = parseDate(s);
    let t = `${d.getMonth() + 1}月${d.getDate()}日`;
    if (d.getFullYear() !== new Date().getFullYear()) t = `${d.getFullYear()}年${t}`;
    if (withWeekday) t += ` 周${'日一二三四五六'[d.getDay()]}`;
    return t;
  }

  function dueStatus(card) {
    if (!card.due) return '';
    if (card.dueDone) return 'done';
    const days = Math.round((parseDate(card.due) - parseDate(todayStr())) / 864e5);
    if (days < 0) return 'overdue';
    if (days <= 1) return 'soon';
    return '';
  }
  const DUE_TEXT = { done: '已完成', overdue: '已逾期', soon: '即将到期' };

  function autosize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  /* ---------- 数据 ---------- */
  function makeCard(title, o = {}) {
    return {
      id: uid(),
      title,
      desc: o.desc || '',
      labels: o.labels || [],
      due: o.due || null,
      dueDone: !!o.dueDone,
      cover: o.cover || null,
      checklist: (o.checklist || []).map(([text, done]) => ({ id: uid(), text, done: !!done })),
      createdAt: Date.now(),
    };
  }

  function seed() {
    const labels = [
      ['功能', 'green'], ['设计', 'purple'], ['缺陷', 'red'],
      ['紧急', 'orange'], ['文档', 'blue'], ['调研', 'yellow'],
    ].map(([name, color]) => ({ id: uid(), name, color }));
    const [feat, design, bug, urgent, doc, research] = labels.map(l => l.id);
    const C = makeCard;
    return {
      title: '产品发布路线图',
      background: BACKGROUNDS[0],
      starred: false,
      labelsExpanded: false,
      labels,
      lists: [
        { id: uid(), title: '📥 待办', cards: [
          C('调研竞品的看板交互', { labels: [research], desc: '重点关注拖拽手感、卡片详情布局与键盘快捷键。', checklist: [['Trello', 1], ['Notion', 0], ['Linear', 0]] }),
          C('设计新版登录页', { labels: [design], cover: 'purple', due: addDays(6) }),
          C('补充 API 接口文档', { labels: [doc] }),
          C('支持深色模式', { labels: [feat, design] }),
        ] },
        { id: uid(), title: '🚧 进行中', cards: [
          C('实现卡片拖拽排序', {
            labels: [feat], due: addDays(1),
            desc: '使用原生 Pointer Events 实现：\n· 鼠标直接拖拽\n· 触屏长按后拖拽\n· 靠近边缘时自动滚动',
            checklist: [['卡片拖拽', 1], ['列表拖拽', 1], ['触屏长按拖拽', 1], ['边缘自动滚动', 0]],
          }),
          C('修复移动端滚动卡顿', { labels: [bug, urgent], due: addDays(-1) }),
          C('本地存储持久化', { labels: [feat], checklist: [['保存', 1], ['读取', 1], ['导入导出', 0]] }),
        ] },
        { id: uid(), title: '👀 审核中', cards: [
          C('首页性能优化方案', { labels: [research, doc], cover: 'sky', due: addDays(3), desc: '目标：首屏渲染时间降低 30%。' }),
          C('用户反馈收集表单', { labels: [feat] }),
        ] },
        { id: uid(), title: '✅ 已完成', cards: [
          C('搭建项目脚手架', { labels: [feat], due: addDays(-4), dueDone: true, checklist: [['目录结构', 1], ['代码规范', 1]] }),
          C('确定视觉规范', { labels: [design], cover: 'green' }),
        ] },
      ],
    };
  }

  function normalize(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.lists)) throw new Error('数据格式不正确');
    const labels = (Array.isArray(s.labels) ? s.labels : [])
      .filter(l => l && l.id != null)
      .map(l => ({ id: String(l.id), name: String(l.name ?? ''), color: COLORS[l.color] ? l.color : 'gray' }));
    const labelIds = new Set(labels.map(l => l.id));
    const arr = v => (Array.isArray(v) ? v : []);
    return {
      title: String(s.title || '我的看板'),
      background: BACKGROUNDS.includes(s.background) ? s.background : BACKGROUNDS[0],
      starred: !!s.starred,
      labelsExpanded: !!s.labelsExpanded,
      labels,
      lists: s.lists.filter(Boolean).map(l => ({
        id: String(l.id ?? uid()),
        title: String(l.title ?? ''),
        cards: arr(l.cards).filter(Boolean).map(c => ({
          id: String(c.id ?? uid()),
          title: String(c.title ?? ''),
          desc: String(c.desc ?? ''),
          labels: arr(c.labels).map(String).filter(id => labelIds.has(id)),
          due: isDateStr(c.due) ? c.due : null,
          dueDone: !!c.dueDone,
          cover: COLORS[c.cover] ? c.cover : null,
          checklist: arr(c.checklist).filter(Boolean).map(i => ({ id: String(i.id ?? uid()), text: String(i.text ?? ''), done: !!i.done })),
          createdAt: Number(c.createdAt) || Date.now(),
        })),
      })),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch { return null; }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* 存储不可用时静默降级 */ }
  }

  let state = load() || seed();

  const ui = {
    composerListId: null,
    focusComposer: false,
    addingList: false,
    focusAddList: false,
    openCardId: null,
    editingDesc: false,
    showChecklist: false,
    focusChecklist: false,
    newCardId: null,
    search: '',
    filterLabels: new Set(),
    filterDue: null,
  };

  /* ---------- 查询与变更 ---------- */
  const getList = id => state.lists.find(l => l.id === id);
  const getLabel = id => state.labels.find(l => l.id === id);

  function findCard(id) {
    for (const list of state.lists) {
      const index = list.cards.findIndex(c => c.id === id);
      if (index !== -1) return { card: list.cards[index], list, index };
    }
    return null;
  }

  function addCard(listId, title) {
    const list = getList(listId);
    if (!list) return;
    const card = makeCard(oneLine(title).slice(0, 500));
    list.cards.push(card);
    ui.newCardId = card.id;
    save();
  }

  function moveCard(cardId, toListId, index) {
    const f = findCard(cardId);
    const to = getList(toListId);
    if (!f || !to) return;
    f.list.cards.splice(f.index, 1);
    to.cards.splice(Math.max(0, Math.min(index, to.cards.length)), 0, f.card);
  }

  function moveList(listId, index) {
    const from = state.lists.findIndex(l => l.id === listId);
    if (from === -1) return;
    const [list] = state.lists.splice(from, 1);
    state.lists.splice(Math.max(0, Math.min(index, state.lists.length)), 0, list);
  }

  const cloneCard = c => ({
    ...c,
    id: uid(),
    labels: [...c.labels],
    checklist: c.checklist.map(i => ({ ...i, id: uid() })),
    createdAt: Date.now(),
  });

  const snapshot = () => JSON.stringify(state);

  function commit() {
    save();
    renderBoard();
    if (ui.openCardId) renderModal();
  }

  /* ---------- 筛选 ---------- */
  const isFiltering = () => !!(ui.search.trim() || ui.filterLabels.size || ui.filterDue);

  function matches(card) {
    const q = ui.search.trim().toLowerCase();
    if (q) {
      const hay = [card.title, card.desc, ...card.labels.map(id => getLabel(id)?.name || ''), ...card.checklist.map(i => i.text)]
        .join('\n').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (ui.filterLabels.size && !card.labels.some(id => ui.filterLabels.has(id))) return false;
    if (ui.filterDue) {
      const s = dueStatus(card);
      if (ui.filterDue === 'none' ? card.due : s !== ui.filterDue) return false;
    }
    return true;
  }

  function clearFilters() {
    ui.search = '';
    searchInput.value = '';
    ui.filterLabels.clear();
    ui.filterDue = null;
    renderBoard();
    renderHeader();
  }

  /* ---------- DOM 引用 ---------- */
  const board = $('#board');
  const canvas = $('#canvas');
  const pop = $('#popover');
  const overlay = $('#overlay');
  const modal = $('#modal');
  const toastEl = $('#toast');
  const searchInput = $('#search');
  const filterBar = $('#filter-bar');

  $$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', ICON[el.dataset.icon]));

  /* ---------- 渲染：顶栏 ---------- */
  function renderHeader() {
    $('#board-title').textContent = state.title;
    document.title = `${state.title} · 看板`;
    $('#star-btn').classList.toggle('on', state.starred);
    $('#star-btn').setAttribute('aria-pressed', state.starred);
    const n = ui.filterLabels.size + (ui.filterDue ? 1 : 0) + (ui.search.trim() ? 1 : 0);
    const badge = $('#filter-btn .count-badge');
    badge.hidden = !n;
    badge.textContent = n;
    $('#filter-btn').classList.toggle('active', n > 0);
  }

  function renderFilterBar() {
    filterBar.hidden = !isFiltering();
    if (filterBar.hidden) return;
    let total = 0, shown = 0;
    state.lists.forEach(l => l.cards.forEach(c => { total++; if (matches(c)) shown++; }));
    filterBar.innerHTML = `${ICON.filter}<span>正在筛选：显示 <b>${shown}</b> / ${total} 张卡片</span><button data-action="clear-filters">清除筛选</button>`;
  }

  function applyBackground() {
    document.body.style.setProperty('--board-bg', state.background);
  }

  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; }
  }
  function applyTheme(theme = getTheme()) {
    if (theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
  }

  /* ---------- 渲染：看板 ---------- */
  function cardHTML(card) {
    const labels = card.labels.map(getLabel).filter(Boolean);
    const done = card.checklist.filter(i => i.done).length;
    const total = card.checklist.length;
    const ds = dueStatus(card);
    const badges = [];
    if (card.due) {
      badges.push(`<span class="badge due ${ds}" data-action="toggle-due-done" title="${card.dueDone ? '标记为未完成' : '标记为已完成'}">${ICON.clock}${formatDate(card.due)}</span>`);
    }
    if (card.desc) badges.push(`<span class="badge" title="此卡片有描述">${ICON.desc}</span>`);
    if (total) badges.push(`<span class="badge${done === total ? ' complete' : ''}" title="检查清单">${ICON.checklist}${done}/${total}</span>`);

    const cls = ['card'];
    if (!matches(card)) cls.push('is-hidden');
    if (ui.newCardId === card.id) cls.push('card-new');

    return `<article class="${cls.join(' ')}" data-card-id="${card.id}" tabindex="0">
      ${card.cover ? `<div class="card-cover" style="background:${COLORS[card.cover].bg}"></div>` : ''}
      <div class="card-body">
        ${labels.length ? `<div class="card-labels">${labels.map(l =>
          `<span class="card-label" data-action="toggle-labels" style="${labelStyle(l)}" title="${esc(l.name || COLORS[l.color].name)}">${esc(l.name)}</span>`).join('')}</div>` : ''}
        <div class="card-title">${esc(card.title)}</div>
        ${badges.length ? `<div class="card-badges">${badges.join('')}</div>` : ''}
      </div>
    </article>`;
  }

  function listHTML(list) {
    const composing = ui.composerListId === list.id;
    const visible = list.cards.filter(matches).length;
    const count = isFiltering() ? `${visible}/${list.cards.length}` : list.cards.length;
    return `<section class="list" data-list-id="${list.id}">
      <div class="list-header">
        <h2 class="list-title" data-action="edit-list-title" title="点击编辑，拖动以移动列表">${esc(list.title)}</h2>
        <span class="list-count">${count}</span>
        <button class="icon-btn" data-action="list-menu" aria-label="列表操作">${ICON.dots}</button>
      </div>
      <div class="list-cards" data-list-id="${list.id}">
        ${list.cards.map(cardHTML).join('')}
        ${composing ? `<form class="composer">
          <textarea class="composer-input" placeholder="为这张卡片输入标题…" maxlength="500" aria-label="卡片标题"></textarea>
          <div class="composer-actions">
            <button type="submit" class="btn primary">添加卡片</button>
            <button type="button" class="icon-btn" data-action="close-composer" aria-label="取消">${ICON.x}</button>
          </div>
        </form>` : ''}
      </div>
      ${composing ? '' : `<div class="list-footer"><button class="add-card-btn" data-action="open-composer">${ICON.plus}添加卡片</button></div>`}
    </section>`;
  }

  function addListHTML() {
    return `<div class="add-list">${ui.addingList
      ? `<form class="add-list-form">
          <input class="text-input" name="title" placeholder="输入列表名称…" maxlength="200" autocomplete="off" aria-label="列表名称">
          <div class="composer-actions">
            <button type="submit" class="btn primary">添加列表</button>
            <button type="button" class="icon-btn" data-action="close-add-list" aria-label="取消">${ICON.x}</button>
          </div>
        </form>`
      : `<button class="add-list-btn" data-action="open-add-list">${ICON.plus}${state.lists.length ? '添加另一个列表' : '添加列表'}</button>`}</div>`;
  }

  function renderBoard() {
    const scrolls = {};
    $$('.list-cards', board).forEach(el => { scrolls[el.dataset.listId] = el.scrollTop; });

    board.classList.toggle('labels-expanded', state.labelsExpanded);
    board.innerHTML = state.lists.map(listHTML).join('') + addListHTML();

    $$('.list-cards', board).forEach(el => { if (scrolls[el.dataset.listId]) el.scrollTop = scrolls[el.dataset.listId]; });
    ui.newCardId = null;

    if (ui.focusComposer) {
      ui.focusComposer = false;
      const ta = $('.composer-input', board);
      if (ta) {
        ta.focus({ preventScroll: true });
        const lc = ta.closest('.list-cards');
        lc.scrollTop = lc.scrollHeight;
        ta.closest('.list').scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    if (ui.focusAddList) {
      ui.focusAddList = false;
      const input = $('.add-list-form input', board);
      if (input) {
        input.focus({ preventScroll: true });
        canvas.scrollTo({ left: canvas.scrollWidth, behavior: 'smooth' });
      }
    }
    renderFilterBar();
  }

  /* ---------- 渲染：卡片详情 ---------- */
  function renderModal() {
    const f = findCard(ui.openCardId);
    if (!f) { closeModal(); return; }
    const { card, list } = f;
    const scrollTop = overlay.scrollTop;
    const labels = card.labels.map(getLabel).filter(Boolean);
    const ds = dueStatus(card);
    const total = card.checklist.length;
    const done = card.checklist.filter(i => i.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const showChecklist = total > 0 || ui.showChecklist;

    modal.innerHTML = `
      ${card.cover ? `<div class="modal-cover" style="background:${COLORS[card.cover].bg}">
        <button class="btn cover-btn" data-action="card-cover">${ICON.image}封面</button></div>` : ''}
      <button class="icon-btn modal-close" data-action="close-modal" aria-label="关闭">${ICON.x}</button>

      <div class="modal-head">
        <span class="modal-icon">${ICON.card}</span>
        <div class="modal-head-main">
          <textarea id="card-title-input" class="modal-title" rows="1" maxlength="500" aria-label="卡片标题">${esc(card.title)}</textarea>
          <p class="modal-sub">位于列表 <button class="link" data-action="card-move">${esc(list.title)}</button> 中</p>
        </div>
      </div>

      <div class="modal-grid">
        <div class="modal-main">
          ${labels.length || card.due ? `<div class="meta-row">
            ${labels.length ? `<div class="meta"><h4>标签</h4><div class="meta-labels">
              ${labels.map(l => `<button class="chip" data-action="card-labels" style="${labelStyle(l)}" title="${esc(l.name)}">${esc(l.name)}</button>`).join('')}
              <button class="chip-add" data-action="card-labels" aria-label="添加标签">${ICON.plus}</button>
            </div></div>` : ''}
            ${card.due ? `<div class="meta"><h4>截止日期</h4><div class="due-meta">
              <button class="cbox ${card.dueDone ? 'on' : ''}" data-action="toggle-due-done" aria-label="标记完成" aria-pressed="${card.dueDone}"></button>
              <button class="due-btn" data-action="card-due">${formatDate(card.due, true)}
                ${ds ? `<span class="status-tag ${ds}">${DUE_TEXT[ds]}</span>` : ''}</button>
            </div></div>` : ''}
          </div>` : ''}

          <section class="section">
            <div class="section-head">
              <span class="section-icon">${ICON.desc}</span><h3>描述</h3>
              ${card.desc && !ui.editingDesc ? '<button class="btn" data-action="edit-desc">编辑</button>' : ''}
            </div>
            ${ui.editingDesc
              ? `<textarea id="desc-input" class="desc-input" placeholder="添加更详细的描述…（Ctrl + Enter 保存）">${esc(card.desc)}</textarea>
                 <div class="row"><button class="btn primary" data-action="save-desc">保存</button><button class="btn subtle" data-action="cancel-desc">取消</button></div>`
              : card.desc
                ? `<div class="desc-view" data-action="edit-desc">${esc(card.desc)}</div>`
                : '<button class="desc-empty" data-action="edit-desc">添加更详细的描述…</button>'}
          </section>

          ${showChecklist ? `<section class="section">
            <div class="section-head">
              <span class="section-icon">${ICON.checklist}</span><h3>检查清单</h3>
              <button class="btn" data-action="delete-checklist">删除</button>
            </div>
            <div class="progress">
              <span class="progress-pct">${pct}%</span>
              <div class="progress-track"><div class="progress-bar${pct === 100 ? ' done' : ''}" style="width:${pct}%"></div></div>
            </div>
            <ul class="checklist">
              ${card.checklist.map(i => `<li class="check-item${i.done ? ' done' : ''}" data-item-id="${i.id}">
                <button class="check-toggle" data-action="toggle-item" aria-label="切换完成状态" aria-pressed="${i.done}"><span class="cbox${i.done ? ' on' : ''}"></span></button>
                <span class="check-text">${esc(i.text)}</span>
                <button class="icon-btn" data-action="delete-item" aria-label="删除条目">${ICON.trash}</button>
              </li>`).join('')}
            </ul>
            <form class="check-add">
              <input id="check-add-input" class="text-input" placeholder="添加条目…" maxlength="300" autocomplete="off" aria-label="新条目">
              <button class="btn primary" type="submit">添加</button>
            </form>
          </section>` : ''}

          <section class="section">
            <div class="section-head"><span class="section-icon">${ICON.activity}</span><h3>活动</h3></div>
            <p class="activity">创建于 ${new Date(card.createdAt).toLocaleString('zh-CN', { dateStyle: 'long', timeStyle: 'short' })}</p>
          </section>
        </div>

        <aside class="modal-side">
          <h4>添加到卡片</h4>
          <button class="side-btn" data-action="card-labels">${ICON.tag}标签</button>
          <button class="side-btn" data-action="card-checklist">${ICON.checklist}检查清单</button>
          <button class="side-btn" data-action="card-due">${ICON.clock}日期</button>
          <button class="side-btn" data-action="card-cover">${ICON.image}封面</button>
          <h4>操作</h4>
          <button class="side-btn" data-action="card-move">${ICON.move}移动</button>
          <button class="side-btn" data-action="card-copy">${ICON.copy}复制</button>
          <button class="side-btn danger" data-action="card-delete">${ICON.trash}删除</button>
        </aside>
      </div>`;

    const titleInput = $('#card-title-input');
    autosize(titleInput);
    titleInput.addEventListener('input', () => autosize(titleInput));
    titleInput.addEventListener('blur', saveTitleFromInput);

    overlay.scrollTop = scrollTop;

    if (ui.editingDesc) {
      const ta = $('#desc-input');
      if (document.activeElement !== ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
    if (ui.focusChecklist) {
      ui.focusChecklist = false;
      $('#check-add-input')?.focus();
    }
  }

  function saveTitleFromInput() {
    const input = $('#card-title-input');
    const card = findCard(ui.openCardId)?.card;
    if (!input || !card) return;
    const v = oneLine(input.value);
    if (v && v !== card.title) {
      card.title = v;
      save();
      renderBoard();
    } else if (!v) {
      input.value = card.title;
      autosize(input);
    }
  }

  function saveDesc() {
    const ta = $('#desc-input');
    const card = findCard(ui.openCardId)?.card;
    if (ta && card) card.desc = ta.value.trim();
    ui.editingDesc = false;
    commit();
  }

  function openCard(id) {
    if (!findCard(id)) return;
    closePopover();
    ui.openCardId = id;
    ui.editingDesc = false;
    ui.showChecklist = false;
    overlay.hidden = false;
    renderModal();
    overlay.scrollTop = 0;
    $('.modal-close', modal).focus({ preventScroll: true });
  }

  function closeModal() {
    if (!ui.openCardId) { overlay.hidden = true; return; }
    const id = ui.openCardId;
    saveTitleFromInput();
    if (ui.editingDesc) {
      const ta = $('#desc-input');
      const card = findCard(id)?.card;
      if (ta && card) card.desc = ta.value.trim();
      ui.editingDesc = false;
      save();
    }
    closePopover();
    ui.openCardId = null;
    overlay.hidden = true;
    modal.innerHTML = '';
    renderBoard();
    $(`.card[data-card-id="${id}"]`, board)?.focus({ preventScroll: true });
  }

  /* ---------- 浮层（Popover） ---------- */
  let popCtx = null;

  function openPopover(anchor, spec) {
    if (popCtx && popCtx.anchor === anchor) { closePopover(); return; }
    closePopover();
    popCtx = { ...spec, anchor, rerender: drawPopover };
    pop.hidden = false;
    drawPopover();
    positionPopover();
  }

  function drawPopover() {
    const c = popCtx;
    if (!c) return;
    const title = typeof c.title === 'function' ? c.title(c) : c.title;
    const back = c.back?.(c);
    pop.innerHTML = `<div class="pop-head">
        ${back ? `<button class="icon-btn pop-back" data-pop="back" aria-label="返回">${ICON.back}</button>` : ''}
        <span class="pop-title">${esc(title)}</span>
        <button class="icon-btn pop-close" data-pop="close" aria-label="关闭">${ICON.x}</button>
      </div>
      <div class="pop-body">${c.render(c)}</div>`;
    c.mount?.(c);
  }

  function positionPopover() {
    const r = popCtx.anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = Math.min(r.left, innerWidth - pw - 8);
    let top = r.bottom + 6;
    if (top + ph > innerHeight - 8) top = Math.max(8, Math.min(r.top - ph - 6, innerHeight - ph - 8));
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = top + 'px';
  }

  function closePopover() {
    if (!popCtx) return;
    popCtx = null;
    pop.hidden = true;
    pop.innerHTML = '';
  }

  pop.addEventListener('click', e => {
    e.stopPropagation();
    const t = e.target.closest('[data-pop]');
    if (!t || !popCtx) return;
    if (t.dataset.pop === 'close') closePopover();
    else popCtx.action?.(t.dataset.pop, t, popCtx);
  });
  pop.addEventListener('input', e => {
    const t = e.target.closest('[data-pop-input]');
    if (t && popCtx?.input) popCtx.input(t.dataset.popInput, t, popCtx);
  });
  pop.addEventListener('change', e => {
    const t = e.target.closest('[data-pop-change]');
    if (t && popCtx?.change) popCtx.change(t.dataset.popChange, t, popCtx);
  });

  document.addEventListener('pointerdown', e => {
    if (popCtx && !pop.contains(e.target) && !popCtx.anchor.contains(e.target)) closePopover();
  }, true);
  addEventListener('resize', () => { if (popCtx) positionPopover(); });

  /* 标签 */
  function labelsPopover(anchor, cardId) {
    openPopover(anchor, {
      mode: 'list', editId: null, color: 'green', name: '', q: '',
      title: c => (c.mode === 'list' ? '标签' : c.editId ? '编辑标签' : '创建标签'),
      back: c => c.mode !== 'list',
      render(c) {
        if (c.mode === 'list') {
          const card = findCard(cardId)?.card;
          return `<input class="pop-input" placeholder="搜索标签…" data-pop-input="q" value="${esc(c.q)}" aria-label="搜索标签">
            <p class="pop-label">标签</p>
            <div>${state.labels.map(l => {
              const on = card?.labels.includes(l.id);
              return `<div class="label-row" data-name="${esc(l.name.toLowerCase())}">
                <button class="label-toggle" data-pop="toggle" data-id="${l.id}" aria-pressed="${!!on}">
                  <span class="cbox${on ? ' on' : ''}"></span>
                  <span class="label-pill" style="${labelStyle(l)}">${esc(l.name)}</span>
                </button>
                <button class="icon-btn" data-pop="edit" data-id="${l.id}" aria-label="编辑标签">${ICON.pencil}</button>
              </div>`;
            }).join('') || '<p class="muted small">还没有标签。</p>'}</div>
            <button class="btn full mt" data-pop="create">创建新标签</button>`;
        }
        return `<div class="label-preview-wrap"><div class="label-preview" style="${labelStyle(c)}">${esc(c.name)}</div></div>
          <p class="pop-label">标题</p>
          <input class="pop-input" data-pop-input="name" data-pop-enter="save" value="${esc(c.name)}" maxlength="40" aria-label="标签标题">
          <p class="pop-label">选择颜色</p>
          <div class="swatches">${Object.entries(COLORS).map(([k, v]) =>
            `<button class="swatch${k === c.color ? ' selected' : ''}" data-pop="color" data-color="${k}" style="background:${v.bg}" title="${v.name}" aria-label="${v.name}"></button>`).join('')}</div>
          <div class="pop-sep"></div>
          <div class="row between">
            <button class="btn primary" data-pop="save">${c.editId ? '保存' : '创建'}</button>
            ${c.editId ? '<button class="btn danger" data-pop="delete">删除</button>' : ''}
          </div>`;
      },
      mount(c) {
        if (c.mode === 'list') filterLabelRows(c.q);
        else $('[data-pop-input="name"]', pop).focus();
      },
      input(key, el, c) {
        if (key === 'q') { c.q = el.value; filterLabelRows(c.q); }
        if (key === 'name') { c.name = el.value; $('.label-preview', pop).textContent = c.name; }
      },
      action(a, el, c) {
        const card = findCard(cardId)?.card;
        if (a === 'toggle' && card) {
          const id = el.dataset.id;
          card.labels = card.labels.includes(id) ? card.labels.filter(x => x !== id) : [...card.labels, id];
          const order = state.labels.map(l => l.id);
          card.labels.sort((x, y) => order.indexOf(x) - order.indexOf(y));
          commit();
          c.rerender();
        } else if (a === 'edit') {
          const l = getLabel(el.dataset.id);
          Object.assign(c, { mode: 'edit', editId: l.id, color: l.color, name: l.name });
          c.rerender();
        } else if (a === 'create') {
          Object.assign(c, { mode: 'edit', editId: null, color: 'green', name: c.q });
          c.rerender();
        } else if (a === 'back') {
          c.mode = 'list';
          c.rerender();
        } else if (a === 'color') {
          c.color = el.dataset.color;
          $$('.swatch', pop).forEach(s => s.classList.toggle('selected', s === el));
          $('.label-preview', pop).setAttribute('style', labelStyle(c));
        } else if (a === 'save') {
          const name = c.name.trim();
          if (c.editId) {
            Object.assign(getLabel(c.editId), { name, color: c.color });
          } else {
            const l = { id: uid(), name, color: c.color };
            state.labels.push(l);
            card?.labels.push(l.id);
          }
          c.mode = 'list';
          commit();
          c.rerender();
        } else if (a === 'delete') {
          const id = c.editId;
          state.labels = state.labels.filter(l => l.id !== id);
          state.lists.forEach(l => l.cards.forEach(k => { k.labels = k.labels.filter(x => x !== id); }));
          ui.filterLabels.delete(id);
          c.mode = 'list';
          commit();
          renderHeader();
          c.rerender();
        }
      },
    });
  }

  function filterLabelRows(q) {
    const s = q.trim().toLowerCase();
    $$('.label-row', pop).forEach(r => { r.hidden = !!s && !r.dataset.name.includes(s); });
  }

  /* 日期 */
  function duePopover(anchor, cardId) {
    const setDue = v => {
      const card = findCard(cardId)?.card;
      if (!card) return;
      card.due = v;
      if (!v) card.dueDone = false;
      commit();
      closePopover();
    };
    openPopover(anchor, {
      title: '截止日期',
      render() {
        const card = findCard(cardId).card;
        return `<p class="pop-label">选择日期</p>
          <input type="date" class="pop-input" id="due-input" value="${card.due || addDays(1)}" data-pop-enter="save" aria-label="截止日期">
          <div class="quick-dates">
            ${[['今天', 0], ['明天', 1], ['3 天后', 3], ['一周后', 7], ['两周后', 14]].map(([t, n]) =>
              `<button class="chip-btn" data-pop="quick" data-days="${n}">${t}</button>`).join('')}
          </div>
          <button class="btn primary full mt" data-pop="save">保存</button>
          ${card.due ? '<button class="btn full mt-s" data-pop="remove">移除日期</button>' : ''}`;
      },
      action(a, el) {
        if (a === 'quick') setDue(addDays(Number(el.dataset.days)));
        else if (a === 'save') {
          const v = $('#due-input').value;
          if (isDateStr(v)) setDue(v);
        } else if (a === 'remove') setDue(null);
      },
    });
  }

  /* 封面 */
  function coverPopover(anchor, cardId) {
    openPopover(anchor, {
      title: '封面',
      render() {
        const card = findCard(cardId).card;
        return `<p class="pop-label">颜色</p>
          <div class="swatches">${Object.entries(COLORS).map(([k, v]) =>
            `<button class="swatch${card.cover === k ? ' selected' : ''}" data-pop="color" data-color="${k}" style="background:${v.bg}" title="${v.name}" aria-label="${v.name}"></button>`).join('')}</div>
          ${card.cover ? '<button class="btn full mt" data-pop="remove">移除封面</button>' : ''}`;
      },
      action(a, el, c) {
        const card = findCard(cardId)?.card;
        if (!card) return;
        card.cover = a === 'color' ? el.dataset.color : null;
        commit();
        c.rerender();
      },
    });
  }

  /* 移动卡片 */
  function movePopover(anchor, cardId) {
    const f = findCard(cardId);
    let listId = f.list.id;
    let pos = f.index;
    openPopover(anchor, {
      title: '移动卡片',
      render() {
        const count = getList(listId).cards.length + (listId === f.list.id ? 0 : 1);
        return `<p class="pop-label">列表</p>
          <select class="pop-select" data-pop-change="list" aria-label="目标列表">
            ${state.lists.map(l => `<option value="${l.id}"${l.id === listId ? ' selected' : ''}>${esc(l.title)}${l.id === f.list.id ? '（当前）' : ''}</option>`).join('')}
          </select>
          <p class="pop-label">位置</p>
          <select class="pop-select" data-pop-change="pos" aria-label="目标位置">
            ${Array.from({ length: count }, (_, i) => `<option value="${i}"${i === pos ? ' selected' : ''}>${i + 1}${listId === f.list.id && i === f.index ? '（当前）' : ''}</option>`).join('')}
          </select>
          <button class="btn primary full mt" data-pop="move">移动</button>`;
      },
      change(key, el, c) {
        if (key === 'list') {
          listId = el.value;
          pos = listId === f.list.id ? f.index : getList(listId).cards.length;
          c.rerender();
        } else pos = Number(el.value);
      },
      action(a) {
        if (a !== 'move') return;
        moveCard(cardId, listId, pos);
        closePopover();
        commit();
        toast(`已移动到「${getList(listId).title}」`);
      },
    });
  }

  /* 列表菜单 */
  function listMenuPopover(anchor, listId) {
    openPopover(anchor, {
      title: '列表操作',
      render: () => `<div class="pop-menu">
          <button class="pop-item" data-pop="add">${ICON.plus}添加卡片</button>
          <button class="pop-item" data-pop="copy">${ICON.copy}复制列表</button>
          <div class="pop-sep"></div>
          <button class="pop-item" data-pop="sort-name">${ICON.sort}按名称排序</button>
          <button class="pop-item" data-pop="sort-due">${ICON.clock}按截止日期排序</button>
          <button class="pop-item" data-pop="sort-new">${ICON.sort}按创建时间排序（最新在前）</button>
          <div class="pop-sep"></div>
          <button class="pop-item danger" data-pop="clear">${ICON.trash}清空列表中的卡片</button>
          <button class="pop-item danger" data-pop="delete">${ICON.trash}删除此列表</button>
        </div>`,
      action(a) {
        const list = getList(listId);
        if (!list) return;
        closePopover();
        if (a === 'add') {
          ui.composerListId = listId;
          ui.focusComposer = true;
          renderBoard();
        } else if (a === 'copy') {
          const idx = state.lists.indexOf(list);
          state.lists.splice(idx + 1, 0, { id: uid(), title: `${list.title}（副本）`, cards: list.cards.map(cloneCard) });
          commit();
          toast('已复制列表');
        } else if (a.startsWith('sort-')) {
          const cmp = {
            'sort-name': (x, y) => x.title.localeCompare(y.title, 'zh-CN'),
            'sort-due': (x, y) => (x.due || '9999').localeCompare(y.due || '9999'),
            'sort-new': (x, y) => y.createdAt - x.createdAt,
          }[a];
          list.cards.sort(cmp);
          commit();
        } else if (a === 'clear') {
          if (!list.cards.length) return;
          const snap = snapshot();
          const n = list.cards.length;
          list.cards = [];
          commit();
          toast(`已清空 ${n} 张卡片`, snap);
        } else if (a === 'delete') {
          const snap = snapshot();
          state.lists = state.lists.filter(l => l !== list);
          if (ui.composerListId === listId) ui.composerListId = null;
          commit();
          toast(`已删除列表「${list.title}」`, snap);
        }
      },
    });
  }

  /* 筛选 */
  function filterPopover(anchor) {
    openPopover(anchor, {
      title: '筛选卡片',
      render: () => `<p class="pop-label">标签</p>
        ${state.labels.map(l => {
          const on = ui.filterLabels.has(l.id);
          return `<div class="label-row"><button class="label-toggle" data-pop="label" data-id="${l.id}" aria-pressed="${on}">
            <span class="cbox${on ? ' on' : ''}"></span><span class="label-pill" style="${labelStyle(l)}">${esc(l.name)}</span>
          </button></div>`;
        }).join('') || '<p class="muted small">还没有标签。</p>'}
        <p class="pop-label">截止日期</p>
        ${DUE_FILTERS.map(([k, t]) => `<button class="filter-opt" data-pop="due" data-k="${k}" aria-pressed="${ui.filterDue === k}">
          <span class="cbox round${ui.filterDue === k ? ' on' : ''}"></span><span class="due-dot ${k}"></span>${t}</button>`).join('')}
        <button class="btn full mt" data-pop="clear"${isFiltering() ? '' : ' disabled'}>清除筛选</button>`,
      action(a, el, c) {
        if (a === 'label') {
          const id = el.dataset.id;
          if (ui.filterLabels.has(id)) ui.filterLabels.delete(id); else ui.filterLabels.add(id);
        } else if (a === 'due') {
          ui.filterDue = ui.filterDue === el.dataset.k ? null : el.dataset.k;
        } else if (a === 'clear') {
          clearFilters();
        }
        renderBoard();
        renderHeader();
        c.rerender();
      },
    });
  }

  /* 背景 */
  function bgPopover(anchor) {
    openPopover(anchor, {
      title: '更换背景',
      render: () => `<p class="pop-label">渐变与纯色</p><div class="bg-grid">${BACKGROUNDS.map((bg, i) =>
        `<button class="bg-swatch${state.background === bg ? ' selected' : ''}" data-pop="bg" data-i="${i}" style="background:${bg}" aria-label="背景 ${i + 1}"></button>`).join('')}</div>`,
      action(a, el, c) {
        state.background = BACKGROUNDS[Number(el.dataset.i)];
        applyBackground();
        save();
        c.rerender();
      },
    });
  }

  /* 更多菜单 */
  function menuPopover(anchor) {
    openPopover(anchor, {
      title: '菜单',
      render: () => {
        const theme = getTheme();
        return `<p class="pop-label">外观</p>
          <div class="segmented">${[['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']].map(([k, t]) =>
            `<button class="${theme === k ? 'active' : ''}" data-pop="theme" data-v="${k}">${t}</button>`).join('')}</div>
          <div class="pop-sep"></div>
          <div class="pop-menu">
            <button class="pop-item" data-pop="export">${ICON.download}导出为 JSON</button>
            <button class="pop-item" data-pop="import">${ICON.upload}从 JSON 导入</button>
            <button class="pop-item" data-pop="reset">${ICON.reset}重置为示例看板</button>
            <button class="pop-item danger" data-pop="clear">${ICON.trash}清空看板</button>
          </div>
          <div class="pop-sep"></div>
          <p class="pop-label">快捷键与操作</p>
          <ul class="shortcuts">
            <li><kbd>/</kbd>搜索卡片</li>
            <li><kbd>Enter</kbd>打开聚焦的卡片 / 提交</li>
            <li><kbd>Esc</kbd>关闭弹窗或取消编辑</li>
            <li><kbd>拖拽</kbd>移动卡片和列表（触屏请长按）</li>
          </ul>`;
      },
      action(a, el, c) {
        if (a === 'theme') {
          try { localStorage.setItem(THEME_KEY, el.dataset.v); } catch { /* 忽略 */ }
          applyTheme(el.dataset.v);
          c.rerender();
          return;
        }
        closePopover();
        if (a === 'export') exportJSON();
        else if (a === 'import') $('#import-file').click();
        else if (a === 'reset') replaceState(seed(), '已重置为示例看板');
        else if (a === 'clear') replaceState({ ...state, lists: [] }, '已清空看板');
      },
    });
  }

  function replaceState(next, msg) {
    const snap = snapshot();
    state = normalize(next);
    ui.composerListId = null;
    ui.filterLabels.clear();
    ui.filterDue = null;
    if (ui.openCardId && !findCard(ui.openCardId)) closeModal();
    applyBackground();
    commit();
    renderHeader();
    toast(msg, snap);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.title.replace(/[\\/:*?"<>|]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出 JSON 文件');
  }

  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      replaceState(JSON.parse(await file.text()), `已导入「${file.name}」`);
    } catch (err) {
      toast(`导入失败：${err.message}`);
    }
  });

  /* ---------- 提示与撤销 ---------- */
  let toastTimer = 0;
  let undoSnap = null;

  function toast(msg, snap = null) {
    undoSnap = snap;
    toastEl.innerHTML = `<span>${esc(msg)}</span>${snap ? '<button data-action="undo">撤销</button>' : ''}`;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), snap ? 6000 : 2500);
  }

  function undo() {
    if (!undoSnap) return;
    state = normalize(JSON.parse(undoSnap));
    undoSnap = null;
    toastEl.classList.remove('show');
    if (ui.openCardId && !findCard(ui.openCardId)) closeModal();
    applyBackground();
    commit();
    renderHeader();
  }

  /* ---------- 行内编辑 ---------- */
  function startListTitleEdit(h2) {
    const list = getList(h2.closest('.list').dataset.listId);
    if (!list) return;
    const ta = document.createElement('textarea');
    ta.className = 'list-title-input';
    ta.rows = 1;
    ta.maxLength = 200;
    ta.value = list.title;
    ta.setAttribute('aria-label', '列表名称');
    h2.replaceWith(ta);
    autosize(ta);
    ta.focus();
    ta.select();
    let finished = false;
    const finish = keep => {
      if (finished) return;
      finished = true;
      const v = oneLine(ta.value);
      if (keep && v && v !== list.title) { list.title = v; commit(); } else renderBoard();
    };
    ta.addEventListener('input', () => autosize(ta));
    ta.addEventListener('blur', () => finish(true));
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    });
  }

  function startBoardTitleEdit(h1) {
    const input = document.createElement('input');
    input.className = 'board-title-input';
    input.value = state.title;
    input.maxLength = 100;
    input.setAttribute('aria-label', '看板名称');
    h1.hidden = true;
    h1.after(input);
    input.focus();
    input.select();
    let finished = false;
    const finish = keep => {
      if (finished) return;
      finished = true;
      const v = oneLine(input.value);
      if (keep && v) { state.title = v; save(); }
      input.remove();
      h1.hidden = false;
      renderHeader();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
    });
  }

  function flushComposer() {
    const ta = $('.composer-input', board);
    const v = ta && oneLine(ta.value);
    if (v && ui.composerListId) addCard(ui.composerListId, v);
  }

  /* ---------- 事件：点击 ---------- */
  let suppressClick = false;

  function handleAction(action, el) {
    const listId = el.closest('.list')?.dataset.listId;
    const cardId = el.closest('.card')?.dataset.cardId || ui.openCardId;
    const card = cardId && findCard(cardId)?.card;

    switch (action) {
      case 'toggle-labels':
        state.labelsExpanded = !state.labelsExpanded;
        board.classList.toggle('labels-expanded', state.labelsExpanded);
        save();
        break;
      case 'toggle-due-done':
        if (card) { card.dueDone = !card.dueDone; commit(); }
        break;

      case 'open-composer':
        flushComposer();
        ui.composerListId = listId;
        ui.addingList = false;
        ui.focusComposer = true;
        renderBoard();
        break;
      case 'close-composer':
        ui.composerListId = null;
        renderBoard();
        break;
      case 'edit-list-title':
        startListTitleEdit(el);
        break;
      case 'list-menu':
        listMenuPopover(el, listId);
        break;
      case 'open-add-list':
        flushComposer();
        ui.composerListId = null;
        ui.addingList = true;
        ui.focusAddList = true;
        renderBoard();
        break;
      case 'close-add-list':
        ui.addingList = false;
        renderBoard();
        break;

      case 'edit-board-title': startBoardTitleEdit(el); break;
      case 'star':
        state.starred = !state.starred;
        save();
        renderHeader();
        break;
      case 'open-filter': filterPopover(el); break;
      case 'open-bg': bgPopover(el); break;
      case 'open-menu': menuPopover(el); break;
      case 'clear-filters': clearFilters(); break;
      case 'undo': undo(); break;

      case 'close-modal': closeModal(); break;
      case 'edit-desc':
        if (window.getSelection()?.toString()) break; // 允许选中描述文字
        ui.editingDesc = true;
        renderModal();
        break;
      case 'save-desc': saveDesc(); break;
      case 'cancel-desc':
        ui.editingDesc = false;
        renderModal();
        break;
      case 'toggle-item': {
        const item = card?.checklist.find(i => i.id === el.closest('.check-item').dataset.itemId);
        if (item) { item.done = !item.done; commit(); }
        break;
      }
      case 'delete-item':
        if (card) {
          card.checklist = card.checklist.filter(i => i.id !== el.closest('.check-item').dataset.itemId);
          ui.showChecklist = true;
          commit();
        }
        break;
      case 'delete-checklist':
        if (card) {
          const snap = card.checklist.length ? snapshot() : null;
          card.checklist = [];
          ui.showChecklist = false;
          commit();
          if (snap) toast('已删除检查清单', snap);
        }
        break;
      case 'card-checklist':
        ui.showChecklist = true;
        ui.focusChecklist = true;
        renderModal();
        break;
      case 'card-labels': labelsPopover(el, cardId); break;
      case 'card-due': duePopover(el, cardId); break;
      case 'card-cover': coverPopover(el, cardId); break;
      case 'card-move': movePopover(el, cardId); break;
      case 'card-copy': {
        const f = findCard(cardId);
        if (!f) break;
        const copy = cloneCard(f.card);
        f.list.cards.splice(f.index + 1, 0, copy);
        ui.newCardId = copy.id;
        commit();
        toast('已复制卡片');
        break;
      }
      case 'card-delete': {
        const f = findCard(cardId);
        if (!f) break;
        const snap = snapshot();
        f.list.cards.splice(f.index, 1);
        ui.openCardId = null;
        overlay.hidden = true;
        closePopover();
        commit();
        toast(`已删除卡片「${f.card.title}」`, snap);
        break;
      }
    }
  }

  document.addEventListener('click', e => {
    if (suppressClick) { suppressClick = false; return; }
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) { handleAction(actionEl.dataset.action, actionEl); return; }

    const cardEl = e.target.closest('.card');
    if (cardEl && board.contains(cardEl)) { openCard(cardEl.dataset.cardId); return; }

    // 点击空白处：收起新建卡片 / 新建列表表单
    if (!e.target.closest('.composer, .add-list-form, .overlay, .popover, .topbar')) {
      let changed = false;
      if (ui.composerListId) { flushComposer(); ui.composerListId = null; changed = true; }
      if (ui.addingList) { ui.addingList = false; changed = true; }
      if (changed) renderBoard();
    }
  });

  let overlayDown = false;
  overlay.addEventListener('pointerdown', e => { overlayDown = e.target === overlay; });
  overlay.addEventListener('click', e => { if (e.target === overlay && overlayDown) closeModal(); });

  /* ---------- 事件：表单 ---------- */
  document.addEventListener('submit', e => {
    const form = e.target;
    e.preventDefault();
    if (form.classList.contains('composer')) {
      const ta = $('.composer-input', form);
      const v = oneLine(ta.value);
      if (!v) { ta.focus(); return; }
      addCard(ui.composerListId, v);
      ui.focusComposer = true;
      renderBoard();
    } else if (form.classList.contains('add-list-form')) {
      const input = form.elements.title;
      const v = oneLine(input.value);
      if (!v) { input.focus(); return; }
      state.lists.push({ id: uid(), title: v, cards: [] });
      save();
      ui.focusAddList = true;
      renderBoard();
    } else if (form.classList.contains('check-add')) {
      const input = $('#check-add-input');
      const v = oneLine(input.value);
      const card = findCard(ui.openCardId)?.card;
      if (!v || !card) { input.focus(); return; }
      card.checklist.push({ id: uid(), text: v, done: false });
      ui.focusChecklist = true;
      commit();
    }
  });

  /* ---------- 事件：键盘 ---------- */
  document.addEventListener('keydown', e => {
    const t = e.target;
    const enter = e.key === 'Enter' && !e.isComposing;

    if (t.dataset?.popEnter && enter) {
      e.preventDefault();
      popCtx?.action?.(t.dataset.popEnter, t, popCtx);
      return;
    }
    if (t.classList?.contains('composer-input')) {
      if (enter) { e.preventDefault(); t.form.requestSubmit(); }
      else if (e.key === 'Escape') { ui.composerListId = null; renderBoard(); }
      return;
    }
    if (t.closest?.('.add-list-form') && e.key === 'Escape') {
      ui.addingList = false;
      renderBoard();
      return;
    }
    if (t.id === 'card-title-input') {
      if (enter) { e.preventDefault(); t.blur(); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        t.value = findCard(ui.openCardId)?.card.title || t.value;
        t.blur();
      }
      return;
    }
    if (t.id === 'desc-input') {
      if (enter && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDesc(); }
      else if (e.key === 'Escape') { ui.editingDesc = false; renderModal(); }
      return;
    }
    if (t === searchInput && e.key === 'Escape') {
      if (searchInput.value) { searchInput.value = ''; ui.search = ''; renderBoard(); renderHeader(); }
      else searchInput.blur();
      return;
    }

    if (e.key === 'Escape') {
      if (popCtx) closePopover();
      else if (ui.openCardId) closeModal();
      else if (ui.composerListId || ui.addingList) {
        ui.composerListId = null;
        ui.addingList = false;
        renderBoard();
      }
      return;
    }

    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    if (typing) return;

    if (e.key === '/' && !ui.openCardId) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    } else if (enter && t.classList?.contains('card')) {
      e.preventDefault();
      openCard(t.dataset.cardId);
    } else if (enter && t.id === 'board-title') {
      e.preventDefault();
      startBoardTitleEdit(t);
    }
  });

  searchInput.addEventListener('input', () => {
    ui.search = searchInput.value;
    renderBoard();
    renderHeader();
  });

  /* ---------- 拖拽（Pointer Events，兼容鼠标与触屏） ---------- */
  let drag = null;

  board.addEventListener('pointerdown', e => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('button, input, textarea, select, a, .composer')) return;
    const cardEl = e.target.closest('.card');
    const headerEl = !cardEl && e.target.closest('.list-header');
    if (!cardEl && !headerEl) return;
    const el = cardEl || headerEl.closest('.list');

    drag = {
      type: cardEl ? 'card' : 'list',
      el,
      id: cardEl ? cardEl.dataset.cardId : el.dataset.listId,
      pointerId: e.pointerId,
      sx: e.clientX, sy: e.clientY,
      x: e.clientX, y: e.clientY,
      started: false,
      ready: e.pointerType !== 'touch', // 触屏需要长按
    };
    if (!drag.ready) {
      drag.timer = setTimeout(() => {
        if (drag && !drag.started) {
          drag.ready = true;
          startDrag();
          navigator.vibrate?.(12);
        }
      }, 300);
    }
    addEventListener('pointermove', onPointerMove);
    addEventListener('pointerup', onPointerUp);
    addEventListener('pointercancel', onPointerUp);
  });

  // 触屏拖拽中阻止页面滚动
  document.addEventListener('touchmove', e => { if (drag?.started) e.preventDefault(); }, { passive: false });
  // 触屏长按时阻止系统菜单
  board.addEventListener('contextmenu', e => { if (drag) e.preventDefault(); });

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (!drag.started) {
      const dist = Math.hypot(drag.x - drag.sx, drag.y - drag.sy);
      if (!drag.ready) { if (dist > 8) endPointerTracking(); return; }
      if (dist < 5) return;
      startDrag();
    }
    e.preventDefault();
    moveGhost();
    updatePlaceholder();
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (drag.started) drop(); else endPointerTracking();
  }

  function endPointerTracking() {
    if (!drag) return;
    clearTimeout(drag.timer);
    cancelAnimationFrame(drag.raf);
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('pointerup', onPointerUp);
    removeEventListener('pointercancel', onPointerUp);
    drag = null;
  }

  function startDrag() {
    const d = drag;
    d.started = true;
    closePopover();
    if (document.activeElement && board.contains(document.activeElement)) document.activeElement.blur();

    const r = d.el.getBoundingClientRect();
    d.ox = d.sx - r.left;
    d.oy = d.sy - r.top;

    const ghost = d.el.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-card-id');
    ghost.removeAttribute('data-list-id');
    ghost.style.width = r.width + 'px';
    ghost.style.height = r.height + 'px';
    document.body.appendChild(ghost);

    const ph = document.createElement('div');
    ph.className = d.type === 'card' ? 'card-placeholder' : 'list-placeholder';
    ph.style.height = r.height + 'px';
    d.el.before(ph);
    d.el.classList.add('is-dragging-source');

    d.ghost = ghost;
    d.ph = ph;
    document.body.classList.add('is-dragging');
    moveGhost();
    requestAnimationFrame(() => ghost.classList.add('lifted'));
    d.raf = requestAnimationFrame(autoScroll);
  }

  function moveGhost() {
    const d = drag;
    d.ghost.style.transform = `translate3d(${d.x - d.ox}px, ${d.y - d.oy}px, 0)`;
  }

  // FLIP 动画：让其它元素平滑让位
  function flip(els, mutate) {
    const first = new Map(els.map(el => [el, el.getBoundingClientRect()]));
    mutate();
    for (const el of els) {
      const a = first.get(el);
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // 强制回流
      el.style.transition = 'transform .18s cubic-bezier(.2, .8, .2, 1)';
      el.style.transform = '';
    }
  }

  function nextVisible(node, skip) {
    let n = node.nextElementSibling;
    while (n && (n === skip || n.classList.contains('is-hidden'))) n = n.nextElementSibling;
    return n;
  }

  function updatePlaceholder() {
    const d = drag;
    if (d.type === 'card') {
      // 找到水平方向上离指针最近的列表
      let target = null, best = Infinity;
      for (const l of $$('.list', board)) {
        const r = l.getBoundingClientRect();
        const dist = d.x < r.left ? r.left - d.x : d.x > r.right ? d.x - r.right : 0;
        if (dist < best) { best = dist; target = l; }
      }
      if (!target) return;
      const container = $('.list-cards', target);
      const cards = $$('.card', container).filter(c => c !== d.el && !c.classList.contains('is-hidden'));
      let before = null;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        if (d.y < r.top + r.height / 2) { before = c; break; }
      }
      if (!before) before = $('.composer', container);
      if (d.ph.parentElement === container && nextVisible(d.ph, d.el) === before) return;
      const oldParent = d.ph.parentElement;
      const affected = [...new Set([...oldParent.children, ...container.children])]
        .filter(n => n.classList.contains('card') && n !== d.el);
      flip(affected, () => container.insertBefore(d.ph, before));
    } else {
      const lists = $$(':scope > .list', board).filter(l => l !== d.el);
      let before = null;
      for (const l of lists) {
        const r = l.getBoundingClientRect();
        if (d.x < r.left + r.width / 2) { before = l; break; }
      }
      if (!before) before = $('.add-list', board);
      if (nextVisible(d.ph, d.el) === before) return;
      flip(lists, () => board.insertBefore(d.ph, before));
    }
  }

  function autoScroll() {
    const d = drag;
    if (!d || !d.started) return;
    const speed = v => Math.min(22, Math.ceil(v / 4));
    let scrolled = false;

    const cr = canvas.getBoundingClientRect();
    const edge = 80;
    const before = canvas.scrollLeft;
    if (d.x < cr.left + edge) canvas.scrollLeft -= speed(cr.left + edge - d.x);
    else if (d.x > cr.right - edge) canvas.scrollLeft += speed(d.x - (cr.right - edge));
    scrolled = canvas.scrollLeft !== before;

    if (d.type === 'card' && d.ph.parentElement) {
      const lc = d.ph.parentElement;
      const r = lc.getBoundingClientRect();
      const top = lc.scrollTop;
      if (d.x >= r.left - 16 && d.x <= r.right + 16) {
        if (d.y < r.top + 48) lc.scrollTop -= speed(r.top + 48 - d.y);
        else if (d.y > r.bottom - 48) lc.scrollTop += speed(d.y - (r.bottom - 48));
      }
      scrolled = scrolled || lc.scrollTop !== top;
    }

    if (scrolled) updatePlaceholder();
    d.raf = requestAnimationFrame(autoScroll);
  }

  function drop() {
    const d = drag;
    endPointerTracking();
    document.body.classList.remove('is-dragging');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 80);

    const countBefore = cls => {
      let i = 0;
      for (let n = d.ph.previousElementSibling; n; n = n.previousElementSibling) {
        if (n.classList.contains(cls) && n !== d.el) i++;
      }
      return i;
    };
    if (d.type === 'card') moveCard(d.id, d.ph.parentElement.dataset.listId, countBefore('card'));
    else moveList(d.id, countBefore('list'));
    save();
    renderBoard();

    const g = d.ghost;
    const target = $(d.type === 'card' ? `.card[data-card-id="${d.id}"]` : `.list[data-list-id="${d.id}"]`, board);
    if (!target) { g.remove(); return; }
    const r = target.getBoundingClientRect();
    target.style.opacity = '0';
    g.classList.remove('lifted');
    g.classList.add('dropping');
    g.style.transform = `translate3d(${r.left}px, ${r.top}px, 0)`;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      g.remove();
      target.style.opacity = '';
    };
    g.addEventListener('transitionend', ev => { if (ev.propertyName === 'transform') finish(); });
    setTimeout(finish, 260);
  }

  /* ---------- 启动 ---------- */
  applyTheme();
  applyBackground();
  renderHeader();
  renderBoard();
})();
