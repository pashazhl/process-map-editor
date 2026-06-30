const STORAGE_KEY = 'process-map-editor:data:v1';

const state = {
  data: loadData(),
  view: 'diagram',
  selectedProcessId: null,
  selectedSubprocessId: null,
  selectedNodeId: null,
  dirty: false,
};

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
  app.innerHTML = '';
  app.appendChild(renderShell());
  const main = document.querySelector('main');
  if (state.view === 'diagram') renderDiagram(main);
  if (state.view === 'table') renderTables(main);
  if (state.view === 'systems') renderSystems(main);
}

function renderShell() {
  const totalSubprocesses = state.data.processes.reduce((sum, p) => sum + (p.subprocesses || []).length, 0);
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
      <p data-dirty>${state.dirty ? 'есть несохраненные изменения' : 'сохранено в этом браузере'}</p>
    </section>
    <main></main>
    <input class="hidden" type="file" accept="application/json" data-file>
  </div>`);

  wrap.querySelectorAll('[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  wrap.querySelector('[data-save]').addEventListener('click', saveData);
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
  canvas.appendChild(el(`<h1>${esc(state.data.title)}</h1>`));
  canvas.appendChild(renderFlow());
  const grid = el('<div class="process-grid"></div>');
  state.data.processes.forEach((process, index) => {
    const card = el(`<button class="process-card" style="--accent:${color(index)}">
      <span>${process.number || index + 1}</span>
      <strong>${esc(process.title)}</strong>
      <em>${esc(process.goal)}</em>
      <small>${(process.subprocesses || []).length} подпроцесса · ${esc(process.avgTime || 'время не указано')}</small>
    </button>`);
    card.classList.toggle('active', process.id === state.selectedProcessId);
    card.addEventListener('click', () => {
      state.selectedProcessId = process.id;
      state.selectedSubprocessId = null;
      render();
    });
    grid.appendChild(card);
  });
  canvas.appendChild(grid);
  renderInspector(wrap.querySelector('.side'));
  main.appendChild(wrap);
}

function renderFlow() {
  const flow = el('<div class="flow"></div>');
  (state.data.flow || []).forEach((step, index) => {
    flow.appendChild(el(`<div class="flow-step">${esc(step)}</div>`));
    if (index < state.data.flow.length - 1) flow.appendChild(el('<div class="flow-arrow">→</div>'));
  });
  return flow;
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
  side.appendChild(field('Название', process.title, (v) => { process.title = v; }));
  side.appendChild(field('Цель', process.goal, (v) => { process.goal = v; }, 3));
  side.appendChild(field('Среднее время', process.avgTime, (v) => { process.avgTime = v; }, 2));
  side.appendChild(field('Слабые места', process.weaknesses, (v) => { process.weaknesses = v; }, 3));
  side.appendChild(field('Зоны роста', process.growth, (v) => { process.growth = v; }, 3));
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
  parent.appendChild(field('Название', sub.title, (v) => { sub.title = v; }));
  parent.appendChild(field('Шаги, каждый с новой строки', (sub.steps || []).join('\n'), (v) => {
    sub.steps = v.split('\n').map((x) => x.trim()).filter(Boolean);
  }, 8));
  parent.appendChild(field('Результат', sub.result, (v) => { sub.result = v; }, 3));
  parent.appendChild(field('Время', sub.time, (v) => { sub.time = v; }, 2));
  parent.appendChild(field('Слабое место', sub.weakness, (v) => { sub.weakness = v; }, 2));
  parent.appendChild(field('Оптимизация', sub.optimization, (v) => { sub.optimization = v; }, 2));
  parent.appendChild(field('Контроль', sub.control, (v) => { sub.control = v; }, 2));
}

function renderTables(main) {
  const wrap = el('<div class="tables"></div>');
  wrap.appendChild(tablePanel('Процессы', ['№', 'Название', 'Цель', 'Время', 'Слабые места', 'Рост'], processRows()));
  wrap.appendChild(tablePanel('Подпроцессы', ['ID', 'Процесс', 'Название', 'Шаги', 'Результат', 'Время', 'Слабое место', 'Оптимизация'], subprocessRows()));
  main.appendChild(wrap);
}

function tablePanel(title, headers, rows) {
  const panel = el(`<section class="panel table-panel"><h2>${esc(title)}</h2><div class="table-scroll"><table><thead><tr></tr></thead><tbody></tbody></table></div></section>`);
  headers.forEach((h) => panel.querySelector('tr').appendChild(el(`<th>${esc(h)}</th>`)));
  rows.forEach((row) => panel.querySelector('tbody').appendChild(row));
  return panel;
}

function processRows() {
  return state.data.processes.map((process, index) => {
    const tr = el(`<tr><td>${process.number || index + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`);
    const cells = tr.querySelectorAll('td');
    cells[1].appendChild(compactInput(process.title, (v) => { process.title = v; }));
    cells[2].appendChild(compactInput(process.goal, (v) => { process.goal = v; }, 3));
    cells[3].appendChild(compactInput(process.avgTime, (v) => { process.avgTime = v; }, 3));
    cells[4].appendChild(compactInput(process.weaknesses, (v) => { process.weaknesses = v; }, 3));
    cells[5].appendChild(compactInput(process.growth, (v) => { process.growth = v; }, 3));
    return tr;
  });
}

function subprocessRows() {
  const rows = [];
  state.data.processes.forEach((process) => {
    (process.subprocesses || []).forEach((sub) => {
      const tr = el(`<tr><td>${esc(sub.id)}</td><td>${esc(process.title)}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
      const cells = tr.querySelectorAll('td');
      cells[2].appendChild(compactInput(sub.title, (v) => { sub.title = v; }));
      cells[3].appendChild(compactInput((sub.steps || []).join('\n'), (v) => {
        sub.steps = v.split('\n').map((x) => x.trim()).filter(Boolean);
      }, 5));
      cells[4].appendChild(compactInput(sub.result, (v) => { sub.result = v; }, 2));
      cells[5].appendChild(compactInput(sub.time, (v) => { sub.time = v; }, 2));
      cells[6].appendChild(compactInput(sub.weakness, (v) => { sub.weakness = v; }, 2));
      cells[7].appendChild(compactInput(sub.optimization, (v) => { sub.optimization = v; }, 2));
      rows.push(tr);
    });
  });
  return rows;
}

function compactInput(value, onInput, rows = 1) {
  const node = rows > 1 ? el(`<textarea rows="${rows}">${esc(value)}</textarea>`) : el(`<input value="${esc(value)}">`);
  node.addEventListener('input', () => {
    onInput(node.value);
    markDirty();
  });
  return node;
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
  }
  side.appendChild(el('<h3>Связи</h3>'));
  const list = el('<div class="edge-list"></div>');
  (state.data.systems?.edges || []).forEach((edge) => {
    const row = el(`<div class="edge-row"><b>${esc(edge.f)} → ${esc(edge.t)}</b></div>`);
    row.appendChild(compactInput(edge.l || '', (v) => { edge.l = v; }));
    row.appendChild(checkbox('Новая связь', Boolean(edge.new), (v) => { edge.new = v ? 1 : 0; }));
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

render();
