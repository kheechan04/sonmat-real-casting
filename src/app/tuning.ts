// ⚙ panel: a slider for every placeholder in params.ts, grouped. Changes apply live and are
// remembered in this browser. "바뀐 값 복사" copies only the changed values as JSON, so a playtest
// tuning can be pasted back into the conversation and written into params.ts.

import { defaultParams, PARAM_KEYS, PARAM_META, type ParamKey, type Params } from '../core/params';
import { store } from './store';

const KEY = 'params.v1';

export function loadParams(): Params {
  const p = defaultParams();
  try {
    const saved = JSON.parse(store.get(KEY) ?? '{}') as Partial<Record<string, number>>;
    for (const k of PARAM_KEYS) {
      const v = saved[k];
      if (typeof v === 'number' && Number.isFinite(v)) p[k] = v;
    }
  } catch {
    // corrupt storage — defaults
  }
  return p;
}

function changed(p: Params): Partial<Params> {
  const d = defaultParams();
  const out: Partial<Params> = {};
  for (const k of PARAM_KEYS) if (p[k] !== d[k]) out[k] = p[k];
  return out;
}

function save(p: Params): void {
  store.set(KEY, JSON.stringify(changed(p)));
}

const fmt = (v: number, step: number) => (step >= 1 ? String(Math.round(v)) : v.toFixed(Math.min(3, Math.ceil(-Math.log10(step)))));

/** Fills `root` with the slider panel. `onChange` runs after every change. */
export function buildTuningPanel(root: HTMLElement, params: Params, onChange: () => void): void {
  root.textContent = '';
  const tools = document.createElement('div');
  tools.className = 'tuneTools';
  const reset = Object.assign(document.createElement('button'), { textContent: '기본값으로' });
  const copy = Object.assign(document.createElement('button'), { textContent: '바뀐 값 복사' });
  const msg = Object.assign(document.createElement('span'), { className: 'tuneMsg' });
  tools.append(reset, copy, msg);
  root.append(tools);

  const inputs = new Map<ParamKey, { input: HTMLInputElement; out: HTMLOutputElement; row: HTMLElement }>();
  const refresh = () => {
    const d = defaultParams();
    for (const [k, { input, out, row }] of inputs) {
      input.value = String(params[k]);
      out.textContent = `${fmt(params[k], PARAM_META[k].step)}${PARAM_META[k].unit ? ` ${PARAM_META[k].unit}` : ''}`;
      row.classList.toggle('changed', params[k] !== d[k]);
    }
  };

  let group = '';
  let box: HTMLElement = root;
  for (const k of PARAM_KEYS) {
    const meta = PARAM_META[k];
    if (meta.group !== group) {
      group = meta.group;
      const det = document.createElement('details');
      det.open = group === '캐스팅' || group === '챔질' || group === '릴링';
      det.append(Object.assign(document.createElement('summary'), { textContent: group }));
      root.append(det);
      box = det;
    }
    const row = document.createElement('label');
    row.className = 'tuneRow';
    row.title = k;
    const name = Object.assign(document.createElement('span'), { textContent: meta.label });
    const input = Object.assign(document.createElement('input'), {
      type: 'range',
      min: String(meta.min),
      max: String(meta.max),
      step: String(meta.step),
    });
    const out = document.createElement('output');
    input.addEventListener('input', () => {
      params[k] = Number(input.value);
      save(params);
      refresh();
      onChange();
    });
    row.append(name, input, out);
    box.append(row);
    inputs.set(k, { input, out, row });
  }

  reset.addEventListener('click', () => {
    Object.assign(params, defaultParams());
    save(params);
    refresh();
    onChange();
    msg.textContent = '기본값으로 돌렸어요';
  });
  copy.addEventListener('click', async () => {
    const text = JSON.stringify(changed(params), null, 1);
    try {
      await navigator.clipboard.writeText(text);
      msg.textContent = '복사했어요 — 대화에 붙여 주세요';
    } catch {
      msg.textContent = text;
    }
  });
  refresh();
}
