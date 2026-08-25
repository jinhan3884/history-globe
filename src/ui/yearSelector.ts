/**
 * Right-side vertical year selector bar.
 *
 * Displays a scrollable list of year entries with timeline dots.
 * Click a year to select it. Arrow buttons step prev/next.
 * Current year is highlighted.
 */

export interface YearEntry {
  year: number;
  file: string;
  label: string;
}

export interface YearSelectorCallbacks {
  onYearChange(year: number, file: string): void;
}

export interface YearSelectorController {
  setYears(entries: YearEntry[]): void;
  setCurrentYear(year: number): void;
}

export function createYearSelector(
  root: HTMLElement,
  callbacks: YearSelectorCallbacks,
): YearSelectorController {
  const bar = document.createElement('div');
  bar.className = 'year-selector';
  root.append(bar);

  const style = document.createElement('style');
  style.textContent = `
    .year-selector {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 40px;
      width: 56px;
      background: rgba(11, 16, 32, 0.88);
      border-left: 1px solid rgba(255,255,255,0.15);
      z-index: 20;
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow: hidden;
      user-select: none;
    }
    .ys-arrow {
      width: 100%;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #8899aa;
      cursor: pointer;
      font-size: 14px;
      flex-shrink: 0;
      background: none;
      border: none;
    }
    .ys-arrow:hover { color: #fff; background: rgba(255,255,255,0.05); }
    .ys-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: none;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 4px 0;
      gap: 2px;
    }
    .ys-list::-webkit-scrollbar { display: none; }
    .ys-entry {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      padding: 2px 0;
      width: 100%;
    }
    .ys-entry:hover .ys-label { color: #fff; }
    .ys-entry:hover .ys-dot { border-color: #fff; }
    .ys-label {
      font-size: 9px;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: #8899aa;
      margin-bottom: 1px;
      text-align: center;
      white-space: nowrap;
    }
    .ys-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: 1.5px solid #556677;
      background: transparent;
    }
    .ys-entry.active .ys-label {
      color: #fff;
      font-weight: bold;
    }
    .ys-entry.active .ys-dot {
      background: #4fc3f7;
      border-color: #4fc3f7;
      box-shadow: 0 0 6px #4fc3f7;
    }
    .ys-loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #4fc3f7;
      font-size: 10px;
      display: none;
    }
    .ys-loading.visible { display: block; }
  `;
  document.head.append(style);

  let entries: YearEntry[] = [];
  let currentYear = 0;
  const list = document.createElement('div');
  list.className = 'ys-list';
  bar.append(list);

  function step(dir: 1 | -1) {
    const idx = entries.findIndex((e) => e.year === currentYear);
    if (idx < 0) return;
    const next = idx + dir;
    if (next >= 0 && next < entries.length) {
      selectYear(entries[next]!);
    }
  }

  const upBtn = document.createElement('button');
  upBtn.className = 'ys-arrow';
  upBtn.textContent = '▲';
  upBtn.addEventListener('click', () => step(-1));
  bar.append(upBtn);
  bar.append(list);
  const downBtn = document.createElement('button');
  downBtn.className = 'ys-arrow';
  downBtn.textContent = '▼';
  downBtn.addEventListener('click', () => step(1));
  bar.append(downBtn);

  const loadingEl = document.createElement('div');
  loadingEl.className = 'ys-loading';
  loadingEl.textContent = '...';
  bar.append(loadingEl);

  function selectYear(entry: YearEntry) {
    if (entry.year === currentYear) return;
    currentYear = entry.year;
    updateActiveState();
    callbacks.onYearChange(entry.year, entry.file);
  }

  function updateActiveState() {
    const items = list.querySelectorAll('.ys-entry');
    items.forEach((item, idx) => {
      item.classList.toggle('active', entries[idx]?.year === currentYear);
    });
    // Scroll active into view
    const active = list.querySelector('.ys-entry.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return {
    setYears(yearEntries: YearEntry[]) {
      entries = yearEntries;
      list.innerHTML = '';
      for (const entry of entries) {
        const item = document.createElement('div');
        item.className = 'ys-entry';
        const label = document.createElement('div');
        label.className = 'ys-label';
        label.textContent = entry.label;
        const dot = document.createElement('div');
        dot.className = 'ys-dot';
        item.append(label, dot);
        item.addEventListener('click', () => selectYear(entry));
        list.append(item);
      }
    },
    setCurrentYear(year: number) {
      currentYear = year;
      updateActiveState();
    },
  };
}
