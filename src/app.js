const STORAGE_KEY = 'process-map-editor:data:v1';
const THEME_KEY = 'process-map-editor:theme:v1';
const AUTHOR_KEY = 'process-map-editor:author:v1';
const VIEW_FILTER_KEY = 'process-map-editor:view-filter:v1';
const VIEW_MODE_KEY = 'process-map-editor:view-mode:v1';

const CANVAS_WIDTH = 2600;
const CANVAS_HEIGHT = 1800;
const PROCESS_CARD_WIDTH = 280;
const PROCESS_CARD_HEIGHT = 170;

const state = {
  data: loadData(),
  view: 'diagram',
  selectedProcessId: null,
  selectedSubprocessId: null,
  selectedNodeId: null,
  theme: localStorage.getItem(THEME_KEY) || 'light',
  author: localStorage.getItem(AUTHOR_KEY) || 'Пользователь',
  canvas: { x: 40, y: 32, scale: 1 },
  processFilter: localStorage.getItem(VIEW_FILTER_KEY) || 'all',
  processFilterMode: localStorage.getItem(VIEW_MODE_KEY) || 'highlight',
  dirty: false,
};

const PROCESS_FILTERS = [
  { id: 'all', title: 'Все' },
  { id: 'weaknesses', title: 'Узкие места' },
  { id: 'no-owner', title: 'Без владельца' },
  { id: 'automation', title: 'К автоматизации' },
  { id: 'overdue', title: 'Просроченные' },
];

const app = document.getElementById('app');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (_) { /* fall through */ }
  }
  return clone(window.PROCESS_MAP_SEED);
}

function saveData() {
  normalizeData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  state.dirty = false;
  render();
}

function markDirty() {
  state.dirty = true;
  const badge = document.querySelector('[data-dirty]');
  if (badge) badge.textContent = 'есть несохраненные изменения';
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[ch]));
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function field(label, value, onInput, rows = 1) {
  const id = 'f' + Math.random().toString(36).slice(2);
  const input = rows > 1
    ? `<textarea id="${id}" rows="${rows}">${esc(value)}</textarea>`
    : `<input id="${id}" value="${esc(value)}">`;
  const node = el(`<label class="field"><span>${esc(label)}</span>${input}</label>`);
  const control = node.querySelector('input, textarea');
  control.addEventListener('input', () => {
    onInput(control.value);
    markDirty();
  });
  return node;
}

function checkbox(label, checked, onInput) {
  const node = el(`<label class="check"><input type="checkbox" ${checked ? 'checked' : ''}><span>${esc(label)}</span></label>`);
  node.querySelector('input').addEventListener('change', (ev) => {
    onInput(ev.target.checked);
    markDirty();
    render();
  });
  return node;
}

function setView(view) {
  state.view = view;
  state.selectedSubprocessId = null;
  render();
}

function render() {
  document.body.dataset.theme = state.theme;
  app.innerHTML = '';
  app.appendChild(renderShell());
  const main = document.querySelector('main');
  if (state.view === 'diagram') renderDiagram(main);
  if (state.view === 'table') renderTables(main);
  if (state.view === 'systems') renderSystems(main);
}

function renderShell() {
  const totalSubprocesses = state.data.processes.reduce((sum, p) => sum + (p.subprocesses || []).length, 0);
  const filteredCount = state.data.processes.filter(processMatchesFilter).length;
  const wrap = el(`<div>
    <header class="topbar">
      <div class="brand">
        <strong>${esc(state.data.title)}</strong>
        <span>${esc(state.data.subtitle)}</span>
      </div>
      <nav class="tabs">
        <button data-view="diagram">Диаграмма</button>
        <button data-view="table">Таблица</button>
        <button data-view="systems">Системы</button>
      </nav>
      <div class="actions">
        <button data-toggle-theme>${state.theme === 'dark' ? 'Светлая тема' : 'Темная тема'}</button>
        <button data-import>Импорт</button>
        <button data-export>Экспорт</button>
        <button data-reset>Сброс</button>
        <button class="primary" data-save>Сохранить</button>
      </div>
    </header>
    <section class="summary">
      <div><b>${state.data.processes.length}</b><span>процессов</span></div>
      <div><b>${totalSubprocesses}</b><span>подпроцесса</span></div>
      <div><b>${(state.data.systems?.nodes || []).length}</b><span>системных узла</span></div>
      <div><b>${(state.data.systems?.edges || []).length}</b><span>связей</span></div>
      <p data-dirty>${state.dirty ? 'есть несохраненные изменения' : 'сохранено в этом браузере'} · ${filteredCount}/${state.data.processes.length} в представлении</p>
    </section>
    <section class="view-filters"></section>
    <main></main>
    <input class="hidden" type="file" accept="application/json" data-file>
  </div>`);

  wrap.querySelectorAll('[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  wrap.querySelector('[data-save]').addEventListener('click', saveData);
  wrap.querySelector('[data-toggle-theme]').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, state.theme);
    render();
  });
  wrap.querySelector('[data-reset]').addEventListener('click', () => {
    if (!confirm('Сбросить карту к исходным данным из присланных HTML?')) return;
    state.data = clone(window.PROCESS_MAP_SEED);
    state.selectedProcessId = null;
    state.selectedSubprocessId = null;
    state.selectedNodeId = null;
    state.dirty = true;
    saveData();
  });
  wrap.querySelector('[data-export]').addEventListener('click', exportJson);
  wrap.querySelector('[data-import]').addEventListener('click', () => wrap.querySelector('[data-file]').click());
  wrap.querySelector('[data-file]').addEventListener('change', importJson);
  const filters = wrap.querySelector('.view-filters');
  filters.appendChild(el(`<span class="view-filters-label">Представление</span>`));
  PROCESS_FILTERS.forEach((filter) => {
    const button = el(`<button data-filter="${esc(filter.id)}">${esc(filter.title)}</button>`);
    button.classList.toggle('active', state.processFilter === filter.id);
    button.addEventListener('click', () => {
      state.processFilter = filter.id;
      localStorage.setItem(VIEW_FILTER_KEY, state.processFilter);
      render();
    });
    filters.appendChild(button);
  });
  const modes = el(`<div class="view-mode">
    <button data-view-mode="highlight">Подсветить</button>
    <button data-view-mode="focus">Только подходящие</button>
  </div>`);
  modes.querySelectorAll('[data-view-mode]').forEach((button) => {
    button.classList.toggle('active', button.dataset.viewMode === state.processFilterMode);
    button.addEventListener('click', () => {
      state.processFilterMode = button.dataset.viewMode;
      localStorage.setItem(VIEW_MODE_KEY, state.processFilterMode);
      render();
    });
  });
  filters.appendChild(modes);
  return wrap;
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'process-map.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.processes)) throw new Error('Нет массива processes');
      state.data = data;
      normalizeData();
      state.selectedProcessId = state.data.processes[0]?.id || null;
      state.selectedSubprocessId = null;
      state.selectedNodeId = state.data.systems?.nodes?.[0]?.id || null;
      state.dirty = true;
      saveData();
    } catch (err) {
      alert('Не удалось импортировать JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function renderDiagram(main) {
  const wrap = el('<div class="workbench"><section class="canvas panel"></section><aside class="side panel"></aside></div>');
  const canvas = wrap.querySelector('.canvas');
  const title = el(`<div class="section-head"><h1>${esc(state.data.title)}</h1><div class="button-row compact-actions">
    <button data-zoom-out>−</button>
    <button data-zoom-reset>Сбросить масштаб</button>
    <button data-zoom-in>+</button>
    <button data-auto-layout>Авто-выравнивание</button>
    <button data-add-process>Добавить процесс</button>
  </div></div>`);
  title.querySelector('[data-add-process]').addEventListener('click', addProcess);
  title.querySelector('[data-auto-layout]').addEventListener('click', autoLayoutProcesses);
  title.querySelector('[data-zoom-out]').addEventListener('click', () => setCanvasZoom(state.canvas.scale / 1.2));
  title.querySelector('[data-zoom-in]').addEventListener('click', () => setCanvasZoom(state.canvas.scale * 1.2));
  title.querySelector('[data-zoom-reset]').addEventListener('click', () => {
    state.canvas = { x: 40, y: 32, scale: 1 };
    render();
  });
  canvas.appendChild(title);
  canvas.appendChild(renderProcessCanvas());
  renderInspector(wrap.querySelector('.side'));
  main.appendChild(wrap);
}

function renderProcessCanvas() {
  const viewport = el('<div class="process-viewport"><div class="process-plane"><svg class="process-links"></svg><div class="process-node-layer"></div></div></div>');
  const plane = viewport.querySelector('.process-plane');
  const layer = viewport.querySelector('.process-node-layer');
  applyCanvasTransform(plane);

  state.data.processes.forEach((process, index) => {
    const commentsCount = countProcessComments(process);
    const matchesFilter = processMatchesFilter(process);
    if (state.processFilter !== 'all' && state.processFilterMode === 'focus' && !matchesFilter) return;
    const card = el(`<button class="process-card process-node" style="left:${process.x || 0}px;top:${process.y || 0}px;--accent:${color(index)}">
      <span>${process.number || index + 1}</span>
      <strong>${esc(process.title)}</strong>
      <em>${esc(process.goal)}</em>
      <small>${esc(processCardMeta(process))}</small>
      ${commentsCount ? `<mark>${commentsCount} комм.</mark>` : ''}
    </button>`);
    card.classList.toggle('active', process.id === state.selectedProcessId);
    card.classList.toggle('filter-match', state.processFilter !== 'all' && matchesFilter);
    card.classList.toggle('filtered-out', state.processFilter !== 'all' && !matchesFilter);
    card.classList.toggle('overdue', isOverdue(process));
    attachProcessDrag(card, process);
    card.addEventListener('click', (ev) => {
      if (card.dataset.dragged === '1') {
        ev.preventDefault();
        card.dataset.dragged = '0';
        return;
      }
      state.selectedProcessId = process.id;
      state.selectedSubprocessId = null;
      render();
    });
    layer.appendChild(card);
  });
  attachCanvasPan(viewport, plane);
  return viewport;
}

function applyCanvasTransform(plane) {
  plane.style.transform = `translate(${state.canvas.x}px, ${state.canvas.y}px) scale(${state.canvas.scale})`;
}

function setCanvasZoom(nextScale) {
  state.canvas.scale = Math.min(1.8, Math.max(0.45, Number(nextScale) || 1));
  render();
}

function attachCanvasPan(viewport, plane) {
  let panning = false, startX = 0, startY = 0, originX = 0, originY = 0;
  viewport.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('.process-node')) return;
    panning = true;
    startX = ev.clientX;
    startY = ev.clientY;
    originX = state.canvas.x;
    originY = state.canvas.y;
    viewport.setPointerCapture(ev.pointerId);
    viewport.classList.add('panning');
  });
  viewport.addEventListener('pointermove', (ev) => {
    if (!panning) return;
    state.canvas.x = originX + ev.clientX - startX;
    state.canvas.y = originY + ev.clientY - startY;
    applyCanvasTransform(plane);
  });
  viewport.addEventListener('pointerup', () => {
    panning = false;
    viewport.classList.remove('panning');
  });
  viewport.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? 0.92 : 1.08;
    state.canvas.scale = Math.min(1.8, Math.max(0.45, state.canvas.scale * delta));
    applyCanvasTransform(plane);
  }, { passive: false });
}

function attachProcessDrag(card, process) {
  let dragging = false, startX = 0, startY = 0, originX = 0, originY = 0, moved = false;
  card.addEventListener('pointerdown', (ev) => {
    dragging = true;
    moved = false;
    card.dataset.dragged = '0';
    startX = ev.clientX;
    startY = ev.clientY;
    originX = process.x || 0;
    originY = process.y || 0;
    card.setPointerCapture(ev.pointerId);
  });
  card.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = (ev.clientX - startX) / state.canvas.scale;
    const dy = (ev.clientY - startY) / state.canvas.scale;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    process.x = Math.max(0, Math.round(originX + dx));
    process.y = Math.max(0, Math.round(originY + dy));
    card.style.left = process.x + 'px';
    card.style.top = process.y + 'px';
  });
  card.addEventListener('pointerup', () => {
    dragging = false;
    if (moved) {
      card.dataset.dragged = '1';
      markDirty();
    }
  });
}

function renderFlow() {
  const flow = el('<div class="flow"></div>');
  (state.data.flow || []).forEach((step, index) => {
    flow.appendChild(el(`<div class="flow-step">${esc(step)}</div>`));
    if (index < state.data.flow.length - 1) flow.appendChild(el('<div class="flow-arrow">→</div>'));
  });
  return flow;
}

function countProcessComments(process) {
  return (process.comments || []).length + (process.subprocesses || []).reduce((sum, sub) => sum + (sub.comments || []).length, 0);
}

function processCardMeta(process) {
  const chunks = [
    `${(process.subprocesses || []).length} подпроцесса`,
    process.owner ? `отв. ${process.owner}` : 'без владельца',
    process.deadline ? `до ${process.deadline}` : 'без дедлайна',
  ];
  if (process.automation) chunks.push('к автоматизации');
  return chunks.join(' · ');
}

function visibleProcesses() {
  if (state.processFilter === 'all') return state.data.processes;
  if (state.processFilterMode === 'focus') return state.data.processes.filter(processMatchesFilter);
  return state.data.processes;
}

function processMatchesFilter(process) {
  if (state.processFilter === 'weaknesses') {
    return Boolean((process.weaknesses || '').trim()) || (process.subprocesses || []).some((sub) => (sub.weakness || '').trim());
  }
  if (state.processFilter === 'no-owner') return !(process.owner || '').trim();
  if (state.processFilter === 'automation') return Boolean(process.automation);
  if (state.processFilter === 'overdue') return isOverdue(process);
  return true;
}

function isOverdue(process) {
  if (!process.deadline) return false;
  const deadline = new Date(process.deadline + 'T23:59:59');
  if (Number.isNaN(deadline.getTime())) return false;
  const status = String(process.status || '').toLowerCase();
  const done = ['готово', 'заверш', 'done', 'closed'].some((word) => status.includes(word));
  return !done && deadline < new Date();
}

function renderInspector(side) {
  const process = selectedProcess();
  if (!process) {
    side.appendChild(el('<div class="empty">Выберите процесс на диаграмме, чтобы редактировать его и подпроцессы.</div>'));
    return;
  }
  const subprocess = selectedSubprocess(process);
  if (subprocess) {
    side.appendChild(el(`<div class="side-head"><button data-back>←</button><strong>${esc(subprocess.id)} ${esc(subprocess.title)}</strong></div>`));
    side.querySelector('[data-back]').addEventListener('click', () => {
      state.selectedSubprocessId = null;
      render();
    });
    renderSubprocessEditor(side, subprocess);
    return;
  }
  side.appendChild(el(`<h2>${esc(process.number)}. ${esc(process.title)}</h2>`));
  const controls = el('<div class="button-row"><button data-add-sub>Добавить подпроцесс</button><button class="danger" data-delete-process>Удалить процесс</button></div>');
  controls.querySelector('[data-add-sub]').addEventListener('click', () => addSubprocess(process.id));
  controls.querySelector('[data-delete-process]').addEventListener('click', () => deleteProcess(process.id));
  side.appendChild(controls);
  side.appendChild(field('Название', process.title, (v) => { process.title = v; }));
  side.appendChild(field('Цель', process.goal, (v) => { process.goal = v; }, 3));
  side.appendChild(field('Среднее время', process.avgTime, (v) => { process.avgTime = v; }, 2));
  side.appendChild(field('Слабые места', process.weaknesses, (v) => { process.weaknesses = v; }, 3));
  side.appendChild(field('Зоны роста', process.growth, (v) => { process.growth = v; }, 3));
  side.appendChild(field('Ответственный', process.owner, (v) => { process.owner = v; }));
  side.appendChild(field('Статус', process.status, (v) => { process.status = v; }));
  side.appendChild(field('Дедлайн', process.deadline, (v) => { process.deadline = v; }));
  side.appendChild(checkbox('К автоматизации', Boolean(process.automation), (v) => { process.automation = v; }));
  side.appendChild(renderComments(process));
  side.appendChild(el('<h3>Подпроцессы</h3>'));
  (process.subprocesses || []).forEach((sub) => {
    const item = el(`<button class="sub-link">${esc(sub.id)} ${esc(sub.title)}</button>`);
    item.addEventListener('click', () => {
      state.selectedSubprocessId = sub.id;
      render();
    });
    side.appendChild(item);
  });
}

function renderSubprocessEditor(parent, sub) {
  const owner = selectedProcess();
  const controls = el('<div class="button-row"><button class="danger" data-delete-sub>Удалить подпроцесс</button></div>');
  controls.querySelector('[data-delete-sub]').addEventListener('click', () => {
    if (owner) deleteSubprocess(owner.id, sub.id);
  });
  parent.appendChild(controls);
  parent.appendChild(field('Название', sub.title, (v) => { sub.title = v; }));
  parent.appendChild(field('Шаги, каждый с новой строки', (sub.steps || []).join('\n'), (v) => {
    sub.steps = v.split('\n').map((x) => x.trim()).filter(Boolean);
  }, 8));
  parent.appendChild(field('Результат', sub.result, (v) => { sub.result = v; }, 3));
  parent.appendChild(field('Время', sub.time, (v) => { sub.time = v; }, 2));
  parent.appendChild(field('Слабое место', sub.weakness, (v) => { sub.weakness = v; }, 2));
  parent.appendChild(field('Оптимизация', sub.optimization, (v) => { sub.optimization = v; }, 2));
  parent.appendChild(field('Контроль', sub.control, (v) => { sub.control = v; }, 2));
  parent.appendChild(renderComments(sub));
}

function renderComments(target) {
  target.comments ||= [];
  const box = el(`<section class="comments">
    <div class="comments-head">
      <h3>Комментарии</h3>
      <span>${target.comments.length}</span>
    </div>
    <label class="field compact-field"><span>Автор</span><input data-comment-author value="${esc(state.author)}"></label>
    <label class="field compact-field"><span>Тип</span><select data-comment-type>
      <option value="комментарий">Комментарий</option>
      <option value="проблема">Проблема</option>
      <option value="идея">Идея</option>
      <option value="автоматизация">Автоматизация</option>
    </select></label>
    <label class="field compact-field"><span>Текст</span><textarea data-comment-text rows="3"></textarea></label>
    <button data-add-comment>Добавить комментарий</button>
    <div class="comment-list"></div>
  </section>`);
  const author = box.querySelector('[data-comment-author]');
  author.addEventListener('input', () => {
    state.author = author.value.trim() || 'Пользователь';
    localStorage.setItem(AUTHOR_KEY, state.author);
  });
  box.querySelector('[data-add-comment]').addEventListener('click', () => {
    addComment(target, box.querySelector('[data-comment-text]').value, box.querySelector('[data-comment-type]').value);
  });
  const list = box.querySelector('.comment-list');
  target.comments.forEach((comment) => list.appendChild(renderCommentItem(target, comment)));
  return box;
}

function renderCommentItem(target, comment) {
  const item = el(`<article class="comment-item ${comment.resolved ? 'resolved' : ''}">
    <div class="comment-meta">
      <b>${commentTypeLabel(comment.type)}</b>
      <span>${esc(comment.author || 'Пользователь')} · ${formatDate(comment.createdAt)}</span>
    </div>
    <p>${esc(comment.text)}</p>
    <div class="button-row comment-actions">
      <label class="check"><input type="checkbox" ${comment.resolved ? 'checked' : ''} data-resolve-comment><span>Решено</span></label>
      <button class="danger" data-delete-comment>Удалить</button>
    </div>
  </article>`);
  item.querySelector('[data-resolve-comment]').addEventListener('change', (ev) => {
    comment.resolved = ev.target.checked;
    markDirty();
    render();
  });
  item.querySelector('[data-delete-comment]').addEventListener('click', () => {
    target.comments = (target.comments || []).filter((item) => item.id !== comment.id);
    markDirty();
    render();
  });
  return item;
}

function addComment(target, text, type) {
  const value = text.trim();
  if (!value) return;
  target.comments ||= [];
  target.comments.unshift({
    id: uniqueId('комментарий-' + Date.now().toString(36), new Set(target.comments.map((comment) => comment.id))),
    text: value,
    type: normalizeCommentType(type),
    author: state.author || 'Пользователь',
    createdAt: new Date().toISOString(),
    resolved: false,
  });
  markDirty();
  render();
}

function commentTypeLabel(type) {
  return {
    'комментарий': 'Комментарий',
    'проблема': 'Проблема',
    'идея': 'Идея',
    'автоматизация': 'Автоматизация',
    comment: 'Комментарий',
    problem: 'Проблема',
    idea: 'Идея',
    automation: 'Автоматизация',
  }[type] || 'Комментарий';
}

function normalizeCommentType(type) {
  return {
    comment: 'комментарий',
    problem: 'проблема',
    idea: 'идея',
    automation: 'автоматизация',
    'комментарий': 'комментарий',
    'проблема': 'проблема',
    'идея': 'идея',
    'автоматизация': 'автоматизация',
  }[type] || 'комментарий';
}

function formatDate(value) {
  if (!value) return 'без даты';
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function renderTables(main) {
  const wrap = el('<div class="tables"></div>');
  wrap.appendChild(tablePanel('Процессы', ['№', 'Название', 'Цель', 'Время', 'Слабые места', 'Рост', 'Ответственный', 'Статус', 'Дедлайн', 'Авто', ''], processRows(), addProcess));
  wrap.appendChild(tablePanel('Подпроцессы', ['ID', 'Процесс', 'Название', 'Шаги', 'Результат', 'Время', 'Слабое место', 'Оптимизация', ''], subprocessRows(), () => addSubprocess(state.selectedProcessId || state.data.processes[0]?.id)));
  main.appendChild(wrap);
}

function tablePanel(title, headers, rows, onAdd) {
  const panel = el(`<section class="panel table-panel"><div class="section-head"><h2>${esc(title)}</h2><button data-add>Добавить</button></div><div class="table-scroll"><table><thead><tr></tr></thead><tbody></tbody></table></div></section>`);
  panel.querySelector('[data-add]').addEventListener('click', onAdd);
  headers.forEach((h) => panel.querySelector('tr').appendChild(el(`<th>${esc(h)}</th>`)));
  rows.forEach((row) => panel.querySelector('tbody').appendChild(row));
  return panel;
}

function processRows() {
  return visibleProcesses().map((process, index) => {
    const tr = el(`<tr><td>${process.number || index + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
    tr.classList.toggle('filter-match', state.processFilter !== 'all' && processMatchesFilter(process));
    tr.classList.toggle('filtered-out', state.processFilter !== 'all' && !processMatchesFilter(process));
    tr.classList.toggle('overdue', isOverdue(process));
    const cells = tr.querySelectorAll('td');
    cells[1].appendChild(compactInput(process.title, (v) => { process.title = v; }));
    cells[2].appendChild(compactInput(process.goal, (v) => { process.goal = v; }, 3));
    cells[3].appendChild(compactInput(process.avgTime, (v) => { process.avgTime = v; }, 3));
    cells[4].appendChild(compactInput(process.weaknesses, (v) => { process.weaknesses = v; }, 3));
    cells[5].appendChild(compactInput(process.growth, (v) => { process.growth = v; }, 3));
    cells[6].appendChild(compactInput(process.owner, (v) => { process.owner = v; }));
    cells[7].appendChild(compactInput(process.status, (v) => { process.status = v; }));
    cells[8].appendChild(compactInput(process.deadline, (v) => { process.deadline = v; }));
    cells[9].appendChild(checkbox('Да', Boolean(process.automation), (v) => { process.automation = v; }));
    cells[10].appendChild(rowButton('Удалить', () => deleteProcess(process.id), 'danger'));
    return tr;
  });
}

function subprocessRows() {
  const rows = [];
  visibleProcesses().forEach((process) => {
    (process.subprocesses || []).forEach((sub) => {
      const tr = el(`<tr><td>${esc(sub.id)}</td><td>${esc(process.title)}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
      const cells = tr.querySelectorAll('td');
      cells[2].appendChild(compactInput(sub.title, (v) => { sub.title = v; }));
      cells[3].appendChild(compactInput((sub.steps || []).join('\n'), (v) => {
        sub.steps = v.split('\n').map((x) => x.trim()).filter(Boolean);
      }, 5));
      cells[4].appendChild(compactInput(sub.result, (v) => { sub.result = v; }, 2));
      cells[5].appendChild(compactInput(sub.time, (v) => { sub.time = v; }, 2));
      cells[6].appendChild(compactInput(sub.weakness, (v) => { sub.weakness = v; }, 2));
      cells[7].appendChild(compactInput(sub.optimization, (v) => { sub.optimization = v; }, 2));
      cells[8].appendChild(rowButton('Удалить', () => deleteSubprocess(process.id, sub.id), 'danger'));
      rows.push(tr);
    });
  });
  return rows;
}

function autoSizeField(node) {
  if (!node || node.tagName !== 'TEXTAREA') return;
  node.style.height = 'auto';
  node.style.height = `${Math.max(node.scrollHeight, 48)}px`;
}

function compactInput(value, onInput, rows = 1) {
  const node = el(`<textarea class="compact-textarea" rows="${rows}">${esc(value)}</textarea>`);
  autoSizeField(node);
  node.addEventListener('input', () => {
    autoSizeField(node);
    onInput(node.value);
    markDirty();
  });
  return node;
}

function rowButton(label, onClick, className = '') {
  const button = el(`<button class="row-action ${className}">${esc(label)}</button>`);
  button.addEventListener('click', onClick);
  return button;
}

function selectField(label, options, value, onInput) {
  const node = el(`<label class="field compact-field"><span>${esc(label)}</span><select></select></label>`);
  const select = node.querySelector('select');
  options.forEach((option) => {
    const item = el(`<option value="${esc(option.id)}">${esc(option.t || option.title || option.id)}</option>`);
    item.selected = option.id === value;
    select.appendChild(item);
  });
  select.addEventListener('change', () => {
    onInput(select.value);
    markDirty();
    render();
  });
  return node;
}

function edgeCreator(nodes) {
  const box = el(`<div class="edge-create">
    <strong>Новая связь</strong>
    <label class="field compact-field"><span>Откуда</span><select data-from></select></label>
    <label class="field compact-field"><span>Куда</span><select data-to></select></label>
    <label class="field compact-field"><span>Метка</span><input data-label></label>
    <button data-add-edge>Добавить связь</button>
  </div>`);
  const from = box.querySelector('[data-from]');
  const to = box.querySelector('[data-to]');
  nodes.forEach((node, index) => {
    from.appendChild(el(`<option value="${esc(node.id)}">${esc(node.t || node.id)}</option>`));
    const toOption = el(`<option value="${esc(node.id)}">${esc(node.t || node.id)}</option>`);
    toOption.selected = index === 1;
    to.appendChild(toOption);
  });
  box.querySelector('[data-add-edge]').addEventListener('click', () => addEdge(from.value, to.value, box.querySelector('[data-label]').value));
  return box;
}

function nextNumber(items, field = 'number') {
  return items.reduce((max, item) => Math.max(max, Number(item[field]) || 0), 0) + 1;
}

function uniqueId(base, used) {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function normalizeProcesses() {
  state.data.processes.forEach((process, index) => {
    process.number = index + 1;
    process.id = process.id || `p${index + 1}`;
    process.x = Number.isFinite(Number(process.x)) ? Number(process.x) : 80 + (index % 4) * 330;
    process.y = Number.isFinite(Number(process.y)) ? Number(process.y) : 80 + Math.floor(index / 4) * 230;
    process.owner ||= '';
    process.status ||= 'актуально';
    process.deadline ||= '';
    process.automation = Boolean(process.automation);
    process.comments ||= [];
    normalizeComments(process.comments);
    (process.subprocesses || []).forEach((sub, subIndex) => {
      sub.id = sub.id || `${index + 1}.${subIndex + 1}`;
      sub.comments ||= [];
      normalizeComments(sub.comments);
    });
  });
}

function normalizeComments(comments) {
  comments.forEach((comment) => {
    comment.type = normalizeCommentType(comment.type);
    comment.author ||= 'Пользователь';
    comment.createdAt ||= new Date().toISOString();
    comment.resolved = Boolean(comment.resolved);
  });
}

function normalizeData() {
  state.data.title ||= 'Карта процессов';
  state.data.subtitle ||= '';
  state.data.flow ||= [];
  state.data.processes ||= [];
  if (!PROCESS_FILTERS.some((filter) => filter.id === state.processFilter)) {
    state.processFilter = 'all';
    localStorage.setItem(VIEW_FILTER_KEY, state.processFilter);
  }
  if (!['highlight', 'focus'].includes(state.processFilterMode)) {
    state.processFilterMode = 'highlight';
    localStorage.setItem(VIEW_MODE_KEY, state.processFilterMode);
  }
  normalizeProcesses();
  const systems = ensureSystems();
  systems.nodes.forEach((node) => {
    node.id ||= uniqueId('node', new Set(systems.nodes.map((item) => item.id).filter(Boolean)));
    node.x = Number(node.x) || 0;
    node.y = Number(node.y) || 0;
    node.cat ||= 'control';
    node.t ||= node.id;
  });
  systems.edges = systems.edges.filter((edge) => edge.f && edge.t);
}

function addProcess() {
  const number = nextNumber(state.data.processes);
  const used = new Set(state.data.processes.map((p) => p.id));
  const process = {
    id: uniqueId(`p${number}`, used),
    number,
    title: `Новый процесс ${number}`,
    goal: '',
    avgTime: '',
    weaknesses: '',
    growth: '',
    owner: '',
    status: 'черновик',
    deadline: '',
    automation: false,
    x: 80 + ((number - 1) % 4) * 330,
    y: 80 + Math.floor((number - 1) / 4) * 230,
    subprocesses: [],
  };
  state.data.processes.push(process);
  state.selectedProcessId = process.id;
  state.selectedSubprocessId = null;
  markDirty();
  render();
}

function deleteProcess(processId) {
  const process = state.data.processes.find((item) => item.id === processId);
  if (!process) return;
  if (!confirm(`Удалить процесс «${process.title}» вместе с подпроцессами?`)) return;
  state.data.processes = state.data.processes.filter((item) => item.id !== processId);
  state.selectedProcessId = state.data.processes[0]?.id || null;
  state.selectedSubprocessId = null;
  normalizeProcesses();
  markDirty();
  render();
}

function addSubprocess(processId) {
  const process = state.data.processes.find((item) => item.id === processId);
  if (!process) {
    addProcess();
    return;
  }
  process.subprocesses ||= [];
  const number = process.subprocesses.length + 1;
  const prefix = process.number || state.data.processes.indexOf(process) + 1;
  const sub = {
    id: `${prefix}.${number}`,
    title: `Новый подпроцесс ${number}`,
    steps: [],
    result: '',
    time: '',
    weakness: '',
    optimization: '',
    control: '',
  };
  process.subprocesses.push(sub);
  state.selectedProcessId = process.id;
  state.selectedSubprocessId = sub.id;
  markDirty();
  render();
}

function autoLayoutProcesses() {
  const columns = state.data.processes.length > 6 ? 4 : 3;
  const gapX = PROCESS_CARD_WIDTH + 60;
  const gapY = PROCESS_CARD_HEIGHT + 70;
  state.data.processes
    .slice()
    .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0))
    .forEach((process, index) => {
      process.x = 80 + (index % columns) * gapX;
      process.y = 80 + Math.floor(index / columns) * gapY;
    });
  state.canvas = { x: 40, y: 32, scale: 1 };
  markDirty();
  render();
}

function deleteSubprocess(processId, subprocessId) {
  const process = state.data.processes.find((item) => item.id === processId);
  if (!process) return;
  const sub = (process.subprocesses || []).find((item) => item.id === subprocessId);
  if (!sub) return;
  if (!confirm(`Удалить подпроцесс «${sub.title}»?`)) return;
  process.subprocesses = process.subprocesses.filter((item) => item.id !== subprocessId);
  state.selectedProcessId = process.id;
  state.selectedSubprocessId = null;
  markDirty();
  render();
}

function renderSystems(main) {
  const wrap = el('<div class="workbench systems"><section class="system-canvas panel"><svg></svg><div class="node-layer"></div></section><aside class="side panel"></aside></div>');
  drawSystemCanvas(wrap.querySelector('.system-canvas'));
  renderSystemSide(wrap.querySelector('.side'));
  main.appendChild(wrap);
}

function drawSystemCanvas(canvas) {
  const svg = canvas.querySelector('svg');
  const layer = canvas.querySelector('.node-layer');
  const nodes = state.data.systems?.nodes || [];
  const edges = state.data.systems?.edges || [];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  svg.setAttribute('viewBox', '0 0 1500 1000');
  edges.forEach((edge) => {
    const from = byId[edge.f], to = byId[edge.t];
    if (!from || !to) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${from.x + 87} ${from.y + 34} L ${to.x + 87} ${to.y + 34}`);
    path.setAttribute('class', edge.new ? 'new' : '');
    svg.appendChild(path);
    if (edge.l) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String((from.x + to.x) / 2 + 87));
      text.setAttribute('y', String((from.y + to.y) / 2 + 28));
      text.setAttribute('class', edge.new ? 'edge-label new' : 'edge-label');
      text.textContent = edge.l;
      svg.appendChild(text);
    }
  });
  nodes.forEach((node) => {
    const btn = el(`<button class="sys-node ${node.new ? 'new' : ''}" style="left:${node.x}px;top:${node.y}px;--cat:${categoryColor(node.cat)}">
      <strong>${esc(node.t)}</strong><span>${esc(node.s || '')}</span>
    </button>`);
    btn.classList.toggle('active', node.id === state.selectedNodeId);
    let dragging = false, startX = 0, startY = 0, originX = 0, originY = 0, moved = false;
    btn.addEventListener('pointerdown', (ev) => {
      dragging = true; moved = false; startX = ev.clientX; startY = ev.clientY;
      originX = node.x || 0; originY = node.y || 0; btn.setPointerCapture(ev.pointerId);
    });
    btn.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      node.x = Math.max(0, Math.round(originX + dx));
      node.y = Math.max(0, Math.round(originY + dy));
      btn.style.left = node.x + 'px';
      btn.style.top = node.y + 'px';
      markDirty();
    });
    btn.addEventListener('pointerup', () => {
      dragging = false;
      if (moved) render();
    });
    btn.addEventListener('click', () => {
      if (moved) return;
      state.selectedNodeId = node.id;
      render();
    });
    layer.appendChild(btn);
  });
}

function renderSystemSide(side) {
  const nodes = state.data.systems?.nodes || [];
  const edges = state.data.systems?.edges || [];
  const top = el('<div class="button-row"><button data-add-node>Добавить узел</button></div>');
  top.querySelector('[data-add-node]').addEventListener('click', addSystemNode);
  side.appendChild(top);
  const node = selectedNode();
  if (!node) {
    side.appendChild(el('<div class="empty">Выберите узел системной карты. Узлы можно перетаскивать, связи редактируются в таблице ниже.</div>'));
  } else {
    side.appendChild(el(`<h2>${esc(node.t)}</h2>`));
    side.appendChild(field('Название', node.t, (v) => { node.t = v; }));
    side.appendChild(field('Подпись', node.s, (v) => { node.s = v; }, 2));
    side.appendChild(field('Описание', node.body, (v) => { node.body = v; }, 5));
    side.appendChild(field('Путь', node.path, (v) => { node.path = v; }, 2));
    side.appendChild(checkbox('Новый / рекомендованный узел', Boolean(node.new), (v) => { node.new = v ? 1 : 0; }));
    const nodeControls = el('<div class="button-row"><button class="danger" data-delete-node>Удалить узел</button></div>');
    nodeControls.querySelector('[data-delete-node]').addEventListener('click', () => deleteSystemNode(node.id));
    side.appendChild(nodeControls);
  }
  side.appendChild(el('<h3>Связи</h3>'));
  if (nodes.length >= 2) side.appendChild(edgeCreator(nodes));
  const list = el('<div class="edge-list"></div>');
  edges.forEach((edge, index) => {
    const row = el(`<div class="edge-row"><b>${esc(edge.f)} → ${esc(edge.t)}</b></div>`);
    row.appendChild(selectField('Откуда', nodes, edge.f, (v) => { edge.f = v; }));
    row.appendChild(selectField('Куда', nodes, edge.t, (v) => { edge.t = v; }));
    row.appendChild(compactInput(edge.l || '', (v) => { edge.l = v; }));
    row.appendChild(checkbox('Новая связь', Boolean(edge.new), (v) => { edge.new = v ? 1 : 0; }));
    row.appendChild(rowButton('Удалить связь', () => deleteEdge(index), 'danger'));
    list.appendChild(row);
  });
  side.appendChild(list);
}

function selectedProcess() {
  return state.data.processes.find((p) => p.id === state.selectedProcessId) || null;
}

function selectedSubprocess(process) {
  return (process.subprocesses || []).find((s) => s.id === state.selectedSubprocessId) || null;
}

function selectedNode() {
  return (state.data.systems?.nodes || []).find((n) => n.id === state.selectedNodeId) || null;
}

function ensureSystems() {
  state.data.systems ||= {};
  state.data.systems.nodes ||= [];
  state.data.systems.edges ||= [];
  state.data.systems.stages ||= [];
  return state.data.systems;
}

function addSystemNode() {
  const systems = ensureSystems();
  const used = new Set(systems.nodes.map((node) => node.id));
  const id = uniqueId('node', used);
  const node = {
    id,
    x: 90,
    y: 90,
    cat: 'control',
    new: 1,
    t: 'Новый узел',
    s: 'описание',
    stack: '',
    path: '',
    body: '',
  };
  systems.nodes.push(node);
  state.selectedNodeId = node.id;
  markDirty();
  render();
}

function deleteSystemNode(nodeId) {
  const systems = ensureSystems();
  const node = systems.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (!confirm(`Удалить узел «${node.t}» и все его связи?`)) return;
  systems.nodes = systems.nodes.filter((item) => item.id !== nodeId);
  systems.edges = systems.edges.filter((edge) => edge.f !== nodeId && edge.t !== nodeId);
  state.selectedNodeId = systems.nodes[0]?.id || null;
  markDirty();
  render();
}

function addEdge(from, to, label) {
  const systems = ensureSystems();
  if (!from || !to || from === to) {
    alert('Выберите два разных узла для связи.');
    return;
  }
  systems.edges.push({ f: from, t: to, l: label || '', new: 1 });
  markDirty();
  render();
}

function deleteEdge(index) {
  const systems = ensureSystems();
  systems.edges.splice(index, 1);
  markDirty();
  render();
}

function color(index) {
  return ['#d97706', '#2563eb', '#059669', '#7c3aed', '#be123c', '#0f766e', '#9333ea', '#475569'][index % 8];
}

function categoryColor(category) {
  return {
    control: '#f59e0b', mgmt: '#64748b', leads: '#0ea5e9', sales: '#22c55e',
    match: '#8b5cf6', projects: '#14b8a6', finance: '#ef4444',
    knowledge: '#a855f7', analytics: '#f97316',
  }[category] || '#64748b';
}

normalizeData();
render();
