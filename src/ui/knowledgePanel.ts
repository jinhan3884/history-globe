/**
 * Knowledge Panel (Work Order Phase D).
 *
 * Desktop: right-side panel. Mobile (≤768px): bottom sheet. The globe and
 * every other UI element are untouched; the panel only reads the knowledge
 * layer via knowledgeService and renders states:
 *
 *   loading   — "Loading historical information…"
 *   matched   — name, period, description, capital, predecessors/successors
 *   unmatched — "No linked historical reference yet."
 *   error     — "Historical information is temporarily unavailable."
 *
 * Null fields are hidden rather than shown blank (Work Order §D-4).
 * Attribution (Wikidata/Wikipedia) is always visible on matched entities.
 */

import { lookupFeatureName } from '../knowledge/knowledgeService';
import type {
  EntityKnowledge,
  HistoryEntity,
  KnowledgeReference,
} from '../knowledge/types';

export interface KnowledgePanelController {
  openForName(name: string | null): void;
  close(): void;
}

const PANEL_VISIBLE_CLASS = 'knowledge-panel--open';

function el(tag: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function joinNames(refs: KnowledgeReference[]): string | null {
  const labels = refs
    .map((ref) => ref.label)
    .filter((label): label is string => typeof label === 'string');
  return labels.length > 0 ? labels.join(', ') : null;
}

export function createKnowledgePanel(
  root: HTMLElement,
): KnowledgePanelController {
  const panel = el('div', 'knowledge-panel');
  const closeBtn = el('button', 'kp-close');
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', 'Close panel');
  closeBtn.textContent = '×';
  const body = el('div', 'kp-body');
  panel.append(closeBtn, body);
  root.append(panel);

  const style = el('style');
  style.textContent = `
    .knowledge-panel {
      /* right offsets by the 56px year-selector bar + 12px gap so the
         panel never covers the timescale. */
      position: fixed; top: 12px; right: 68px; bottom: 12px; width: 340px;
      max-width: calc(100vw - 80px); box-sizing: border-box;
      background: rgba(20, 24, 32, 0.94); color: #e8eaed;
      border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
      padding: 18px; overflow-y: auto; z-index: 30;
      font-family: system-ui, sans-serif; font-size: 14px; line-height: 1.5;
      transform: translateX(calc(100% + 24px));
      transition: transform 0.25s ease;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .knowledge-panel.knowledge-panel--open { transform: translateX(0); }
    .kp-close {
      position: absolute; top: 8px; right: 10px; background: none; border: none;
      color: #9aa0a6; font-size: 22px; cursor: pointer; line-height: 1;
    }
    .kp-close:hover { color: #e8eaed; }
    .kp-title { margin: 0 0 2px; font-size: 20px; font-weight: 600; }
    .kp-period { color: #9aa0a6; margin: 0 0 12px; font-size: 13px; }
    .kp-desc { margin: 0 0 14px; }
    .kp-section { margin: 0 0 12px; }
    .kp-label { display: block; font-size: 11px; letter-spacing: 0.08em;
      text-transform: uppercase; color: #9aa0a6; margin-bottom: 2px; }
    .kp-value { margin: 0; }
    .kp-thumb { width: 100%; border-radius: 8px; margin: 0 0 12px; }
    .kp-footer { margin-top: 16px; padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.12); font-size: 12px;
      color: #9aa0a6; display: flex; gap: 12px; flex-wrap: wrap; }
    .kp-footer a, .kp-readmore a { color: #8ab4f8; text-decoration: none; }
    .kp-footer a:hover, .kp-readmore a:hover { text-decoration: underline; }
    .kp-readmore { margin: 12px 0 0; }
    .kp-status { color: #9aa0a6; font-style: italic; }
    @media (max-width: 768px) {
      .knowledge-panel {
        top: auto; left: 12px; right: 68px; bottom: 12px; width: auto;
        max-height: 55vh; transform: translateY(calc(100% + 24px));
      }
      .knowledge-panel.knowledge-panel--open { transform: translateY(0); }
    }
  `;
  document.head.append(style);

  let openName: string | null = null;
  let lookupSeq = 0;

  function renderLoading(): void {
    body.replaceChildren();
    const status = el('p', 'kp-status');
    status.textContent = 'Loading historical information…';
    body.append(status);
  }

  function renderUnmatched(): void {
    body.replaceChildren();
    const status = el('p', 'kp-status');
    status.textContent = 'No linked historical reference yet.';
    body.append(status);
  }

  function renderError(): void {
    body.replaceChildren();
    const status = el('p', 'kp-status');
    status.textContent = 'Historical information is temporarily unavailable.';
    body.append(status);
  }

  function section(labelText: string, valueText: string): HTMLElement {
    const sectionEl = el('div', 'kp-section');
    const label = el('span', 'kp-label');
    label.textContent = labelText;
    const value = el('p', 'kp-value');
    value.textContent = valueText;
    sectionEl.append(label, value);
    return sectionEl;
  }

  function periodText(
    entity: HistoryEntity,
    knowledge: EntityKnowledge | null,
  ): string {
    const start = knowledge?.inception ?? null;
    const end = knowledge?.dissolution ?? null;
    if (start || end) {
      return `${start ?? '?'} – ${end ?? 'present'}`;
    }
    return `${entity.firstYear < 0 ? `${-entity.firstYear} BC` : `${entity.firstYear} CE`} – ${
      entity.lastYear < 0 ? `${-entity.lastYear} BC` : `${entity.lastYear} CE`
    }`;
  }

  function renderMatched(
    entity: HistoryEntity,
    knowledge: EntityKnowledge | null,
  ): void {
    body.replaceChildren();

    if (knowledge?.wikipedia?.thumbnailUrl) {
      const img = document.createElement('img');
      img.className = 'kp-thumb';
      img.src = knowledge.wikipedia.thumbnailUrl;
      img.alt = '';
      img.loading = 'lazy';
      body.append(img);
    }

    const title = el('h2', 'kp-title');
    title.textContent = knowledge?.label ?? entity.name;
    const period = el('p', 'kp-period');
    period.textContent = periodText(entity, knowledge);
    body.append(title, period);

    const description =
      knowledge?.wikipedia?.summary ?? knowledge?.description ?? null;
    if (description) {
      const desc = el('p', 'kp-desc');
      desc.textContent = description;
      body.append(desc);
    }

    const capital = knowledge ? joinNames(knowledge.capitals) : null;
    if (capital) body.append(section('Capital', capital));
    const predecessors = knowledge ? joinNames(knowledge.predecessors) : null;
    if (predecessors) body.append(section('Predecessor', predecessors));
    const successors = knowledge ? joinNames(knowledge.successors) : null;
    if (successors) body.append(section('Successor', successors));

    if (entity.aliases.length > 0) {
      body.append(section('Also known as', entity.aliases.join(', ')));
    }

    if (knowledge?.wikipedia) {
      const readMore = el('p', 'kp-readmore');
      const link = document.createElement('a');
      link.href = knowledge.wikipedia.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Read more';
      readMore.append(link);
      body.append(readMore);
    }

    const footer = el('div', 'kp-footer');
    const wikidata = el('span');
    wikidata.textContent = 'Data: Wikidata';
    const wikipedia = el('span');
    wikipedia.textContent = 'Text: Wikipedia';
    footer.append(wikidata, wikipedia);
    if (knowledge?.wikidataId) {
      const qidLink = document.createElement('a');
      qidLink.href = `https://www.wikidata.org/wiki/${knowledge.wikidataId}`;
      qidLink.target = '_blank';
      qidLink.rel = 'noopener';
      qidLink.textContent = knowledge.wikidataId;
      footer.append(qidLink);
    }
    body.append(footer);

    if (!description) {
      const fallback = el('p', 'kp-status');
      fallback.textContent = 'Description not available.';
      body.append(fallback);
    }
  }

  async function openForName(name: string | null): Promise<void> {
    openName = name;
    const seq = ++lookupSeq;
    panel.classList.add(PANEL_VISIBLE_CLASS);

    if (name === null) {
      renderUnmatched();
      return;
    }
    renderLoading();
    try {
      const result = await lookupFeatureName(name);
      if (seq !== lookupSeq || openName !== name) return; // superseded click
      if (result.entity === null) {
        renderUnmatched();
      } else {
        renderMatched(result.entity, result.knowledge);
      }
    } catch {
      if (seq !== lookupSeq) return;
      renderError();
    }
  }

  function close(): void {
    openName = null;
    lookupSeq += 1;
    panel.classList.remove(PANEL_VISIBLE_CLASS);
  }

  closeBtn.addEventListener('click', close);

  return { openForName, close };
}
