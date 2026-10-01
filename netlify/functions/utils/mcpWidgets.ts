/**
 * MCP Apps UI resource for the NeuroCann LLM plugin.
 *
 * Hosts that implement the MCP Apps extension (ChatGPT, claude.ai, Claude
 * Desktop, VS Code, …) render a tool's result inside a sandboxed iframe when
 * the tool advertises `_meta.ui.resourceUri`. This module owns that HTML.
 *
 * One resource serves every public planner tool plus `about_neurocann`; the
 * page picks a view from the tool name the host reports (or, failing that,
 * from the shape of `structuredContent`). Keeping a single URI means a single
 * CSP declaration and a single cache entry on the host side.
 *
 * Constraints that shaped the markup (ChatGPT UI guidelines):
 *   - system font stack and host colour variables; brand green only as an accent
 *   - inline card, auto-height, no internal scrolling, no logo (host adds it)
 *   - at most two actions; every action is a host link or a chat message
 *   - zero network access: no fonts, images or fetches, so the CSP is empty
 *
 * The URI doubles as the host's cache key — bump the `-v{n}` suffix for any
 * change that is not backward compatible with results already in transcripts.
 */

export const PLANNER_WIDGET_URI = 'ui://neurocann/planner-v1.html';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

const APP_URL = process.env.APP_PUBLIC_URL || 'https://neurocann.app';

/** Tools whose results render in the planner widget. */
export const WIDGET_TOOLS: Record<string, { invoking: string; invoked: string }> = {
    about_neurocann: { invoking: 'Loading NeuroCann overview…', invoked: 'Overview ready' },
    plan_extraction_inputs: { invoking: 'Planning extraction inputs…', invoked: 'Extraction plan ready' },
    estimate_dry_weight: { invoking: 'Estimating dry weight…', invoked: 'Dry weight estimated' },
    estimate_harvest_yield: { invoking: 'Estimating harvest yield…', invoked: 'Yield estimate ready' },
    plan_harvest_timeline: { invoking: 'Building harvest calendar…', invoked: 'Calendar ready' },
    estimate_trim_labor: { invoking: 'Estimating trim labor…', invoked: 'Labor estimate ready' },
};

export interface WidgetResource {
    uri: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
}

export function listWidgetResources(): WidgetResource[] {
    return [{
        uri: PLANNER_WIDGET_URI,
        name: 'neurocann-planner',
        title: 'NeuroCann planner card',
        description: 'Inline card that visualises NeuroCann planner results: extraction input pipeline, harvest yield split, cultivation timeline, trim labor and dry-weight estimates, plus the product overview.',
        mimeType: MCP_APP_MIME_TYPE,
    }];
}

function appOrigin(): string {
    try { return new URL(APP_URL).origin; } catch { return APP_URL; }
}

/** `resources/read` payload for a widget URI, or null when the URI is not ours. */
export function readWidgetResource(uri: string) {
    if (uri !== PLANNER_WIDGET_URI) return null;
    const widgetDomain = process.env.MCP_WIDGET_DOMAIN;
    return {
        contents: [{
            uri,
            mimeType: MCP_APP_MIME_TYPE,
            text: PLANNER_WIDGET_HTML,
            _meta: {
                ui: {
                    prefersBorder: true,
                    csp: { connectDomains: [], resourceDomains: [] },
                    ...(widgetDomain ? { domain: widgetDomain } : {}),
                },
                'openai/widgetPrefersBorder': true,
                'openai/widgetDescription': 'A NeuroCann planner card showing the computed figures (starting material, yield split, calendar, crew size or dry weight) with the assumptions used and a link to connect a facility. The numbers are already visible to the user; summarise the key takeaway rather than restating every figure.',
                'openai/widgetCSP': { connect_domains: [], resource_domains: [], redirect_domains: [appOrigin()] },
                ...(widgetDomain ? { 'openai/widgetDomain': widgetDomain } : {}),
                'openai/ui': { availableDisplayModes: ['inline'] },
            },
        }],
    };
}

// NOTE: the HTML below is a TypeScript template literal. The only interpolation
// is APP_URL; keep backticks and "${" out of the embedded script, which uses
// string concatenation throughout.
export const PLANNER_WIDGET_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NeuroCann planner</title>
<style>
  :root {
    color-scheme: light dark;
    --nc-accent: #3BB570;
    --nc-accent-soft: color-mix(in srgb, #3BB570 16%, transparent);
    --nc-amber: #D99A2B;
    --nc-blue: #4F8DF5;
    --nc-violet: #9B6BF2;
    --nc-text: var(--color-text-primary, light-dark(#171717, #FAFAFA));
    --nc-muted: var(--color-text-secondary, light-dark(#5F6368, #A3A8B0));
    --nc-faint: var(--color-text-tertiary, light-dark(#8A8F98, #7C8189));
    --nc-border: var(--color-border-primary, light-dark(#E3E5E8, #33363B));
    --nc-surface: var(--color-background-secondary, light-dark(#F5F6F7, #1F2124));
    --nc-track: var(--color-background-tertiary, light-dark(#ECEEF0, #2A2D31));
    --nc-radius: var(--border-radius-md, 10px);
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: transparent; }
  body {
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    color: var(--nc-text);
    font-size: 14px;
    line-height: 1.45;
    -webkit-font-smoothing: antialiased;
  }
  .card { padding: 14px 16px 12px; }
  .eyebrow { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--nc-accent); margin-bottom: 4px; }
  .headline { font-size: 24px; font-weight: 700; line-height: 1.15; letter-spacing: -.01em; margin: 0; }
  .headline small { font-size: 15px; font-weight: 500; color: var(--nc-muted); margin-left: 6px; }
  .sub { color: var(--nc-muted); margin: 4px 0 0; font-size: 13px; }
  .section { margin-top: 14px; }
  .label { font-size: 12px; color: var(--nc-faint); font-weight: 500; }

  .steps { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 6px; }
  .step { display: grid; grid-template-columns: 130px 1fr 92px; align-items: center; gap: 10px; }
  .step .name { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .step .name span { display: block; font-weight: 400; font-size: 11px; color: var(--nc-faint); }
  .step .amt { text-align: right; font-variant-numeric: tabular-nums; font-size: 13px; }
  .step .amt span { display: block; font-size: 11px; color: var(--nc-faint); }
  .track { position: relative; height: 10px; border-radius: 999px; background: var(--nc-track); overflow: hidden; }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: var(--nc-accent); min-width: 6px; }
  .fill.ghost { background: color-mix(in srgb, var(--nc-accent) 35%, transparent); }
  .badge { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: var(--nc-accent-soft); color: var(--nc-accent); vertical-align: middle; }
  .badge.override { background: color-mix(in srgb, var(--nc-amber) 18%, transparent); color: var(--nc-amber); }

  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 8px; margin-top: 8px; }
  .tile { background: var(--nc-surface); border-radius: var(--nc-radius); padding: 9px 11px; }
  .tile .v { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .tile .v small { font-size: 12px; font-weight: 500; color: var(--nc-muted); margin-left: 3px; }
  .tile .k { font-size: 11px; color: var(--nc-faint); margin-top: 2px; }

  .stack { display: flex; height: 18px; border-radius: 999px; overflow: hidden; background: var(--nc-track); margin-top: 8px; }
  .stack div { height: 100%; min-width: 2px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; font-size: 13px; }
  .legend .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; }
  .legend b { font-variant-numeric: tabular-nums; }
  .legend span.m { color: var(--nc-muted); }

  .timeline { margin-top: 10px; }
  .segs { display: flex; height: 22px; border-radius: 8px; overflow: hidden; gap: 2px; }
  .segs div { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: #fff; min-width: 28px; white-space: nowrap; overflow: hidden; }
  .marks { display: grid; gap: 4px; margin-top: 10px; }
  .mark { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 4px 0; border-top: 1px dashed var(--nc-border); }
  .mark:first-child { border-top: 0; }
  .mark .d { font-variant-numeric: tabular-nums; font-weight: 600; }
  .mark .n { color: var(--nc-muted); }
  .checks { margin: 8px 0 0; padding-left: 0; list-style: none; display: grid; gap: 3px; }
  .checks li { font-size: 12px; color: var(--nc-muted); }
  .checks li b { color: var(--nc-text); font-weight: 600; margin-right: 6px; }

  .modules { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 8px; }
  .module { background: var(--nc-surface); border-radius: var(--nc-radius); padding: 9px 11px; font-size: 12px; color: var(--nc-muted); }
  .module b { display: block; color: var(--nc-text); font-size: 13px; margin-bottom: 2px; text-transform: capitalize; }
  .free { margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: var(--nc-muted); }
  .free li { margin: 2px 0; }

  .note { font-size: 12px; color: var(--nc-faint); margin-top: 12px; }
  .cta { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--nc-border); }
  .cta p { margin: 0; font-size: 13px; color: var(--nc-muted); flex: 1 1 200px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button { font: inherit; font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 999px; border: 1px solid transparent; cursor: pointer; background: var(--nc-accent); color: #fff; }
  button.secondary { background: transparent; color: var(--nc-text); border-color: var(--nc-border); }
  button:focus-visible { outline: 2px solid var(--nc-accent); outline-offset: 2px; }
  .empty { color: var(--nc-muted); font-size: 13px; padding: 6px 0; }
  @media (max-width: 420px) {
    .step { grid-template-columns: 104px 1fr 78px; }
    .headline { font-size: 21px; }
  }
</style>
</head>
<body>
<div id="root" class="card"><div class="empty">Loading NeuroCann planner…</div></div>
<script>
(function () {
  'use strict';
  var APP_URL = ${JSON.stringify(APP_URL)};
  var root = document.getElementById('root');
  var pending = new Map();
  var nextId = 1;
  var hostContext = {};
  var hostCapabilities = {};
  var toolName = null;
  var lastResult = null;

  // ── JSON-RPC bridge to the host (MCP Apps) ─────────────────────────────────
  function post(message) { window.parent.postMessage(message, '*'); }
  function request(method, params) {
    var id = nextId++;
    post({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
    return new Promise(function (resolve, reject) { pending.set(id, { resolve: resolve, reject: reject }); });
  }
  function notify(method, params) { post({ jsonrpc: '2.0', method: method, params: params || {} }); }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;

    if (msg.id !== undefined && msg.method === undefined) {
      var p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(msg.error); else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'ping') { post({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
    if (msg.method === 'ui/resource-teardown') { post({ jsonrpc: '2.0', id: msg.id, result: {} }); return; }
    if (msg.method === 'ui/notifications/tool-input') { return; }
    if (msg.method === 'ui/notifications/tool-result') { lastResult = msg.params || null; render(); return; }
    if (msg.method === 'ui/notifications/tool-cancelled') { showEmpty('The request was cancelled.'); return; }
    if (msg.method === 'ui/notifications/host-context-changed') { applyHostContext(msg.params || {}); return; }
  }, { passive: true });

  function applyHostContext(ctx) {
    hostContext = Object.assign({}, hostContext, ctx);
    if (ctx.theme) {
      document.documentElement.dataset.theme = ctx.theme;
      document.documentElement.style.colorScheme = ctx.theme;
    }
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        if (vars[k] !== undefined && vars[k] !== null) document.documentElement.style.setProperty(k, String(vars[k]));
      });
    }
    var fonts = ctx.styles && ctx.styles.css && ctx.styles.css.fonts;
    if (fonts && !document.getElementById('host-fonts')) {
      var s = document.createElement('style'); s.id = 'host-fonts'; s.textContent = fonts; document.head.appendChild(s);
    }
    if (ctx.locale) document.documentElement.lang = ctx.locale;
    if (ctx.toolInfo && ctx.toolInfo.tool && ctx.toolInfo.tool.name) toolName = ctx.toolInfo.tool.name;
  }

  function reportSize() {
    var h = Math.ceil(root.getBoundingClientRect().height);
    var w = Math.ceil(document.documentElement.clientWidth);
    notify('ui/notifications/size-changed', { width: w, height: h });
  }
  if (typeof ResizeObserver !== 'undefined') {
    var raf = 0;
    new ResizeObserver(function () { cancelAnimationFrame(raf); raf = requestAnimationFrame(reportSize); }).observe(root);
  }

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appInfo: { name: 'NeuroCann planner', version: '1.0.0' },
    appCapabilities: { availableDisplayModes: ['inline'] },
    capabilities: {},
    clientInfo: { name: 'NeuroCann planner', version: '1.0.0' }
  }).then(function (result) {
    result = result || {};
    hostCapabilities = result.hostCapabilities || {};
    applyHostContext(result.hostContext || {});
    notify('ui/notifications/initialized', {});
  }).catch(function () { /* host without the MCP Apps bridge; compat path below */ });

  // ── ChatGPT compatibility globals (pre-MCP-Apps hosts) ─────────────────────
  function fromOpenAiGlobals() {
    var o = window.openai;
    if (!o || !o.toolOutput) return;
    lastResult = { structuredContent: o.toolOutput };
    if (o.theme) applyHostContext({ theme: o.theme });
    render();
  }
  window.addEventListener('openai:set_globals', fromOpenAiGlobals, { passive: true });
  fromOpenAiGlobals();

  // ── Actions ────────────────────────────────────────────────────────────────
  function openLink(url) {
    request('ui/open-link', { url: url }).catch(function () {
      if (window.openai && typeof window.openai.openExternal === 'function') window.openai.openExternal({ href: url });
      else window.open(url, '_blank', 'noopener');
    });
  }
  function sendMessage(text) {
    request('ui/message', { role: 'user', content: { type: 'text', text: text } }).catch(function () {
      if (window.openai && typeof window.openai.sendFollowUpMessage === 'function') window.openai.sendFollowUpMessage({ prompt: text });
    });
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.setAttribute('style', attrs[k]);
      else if (k === 'onclick') el.addEventListener('click', attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
  }
  function locale() { return hostContext.locale || document.documentElement.lang || 'en-US'; }
  function num(n, dp) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return n.toLocaleString(locale(), { maximumFractionDigits: dp === undefined ? 1 : dp });
  }
  function usd(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    return n.toLocaleString(locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  function mass(w) {
    if (!w) return { big: '—', small: '' };
    var g = w.grams, lb = w.pounds;
    if (g >= 1000) return { big: num(g / 1000, 2) + ' kg', small: num(lb, 1) + ' lb' };
    return { big: num(g, 0) + ' g', small: num(lb, 2) + ' lb' };
  }
  function massLb(w) {
    if (!w) return { big: '—', small: '' };
    if (w.pounds >= 1) return { big: num(w.pounds, 1) + ' lb', small: w.grams >= 1000 ? num(w.grams / 1000, 2) + ' kg' : num(w.grams, 0) + ' g' };
    return mass(w);
  }
  function date(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString(locale(), { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function tile(value, unit, label) {
    return h('div', { class: 'tile' }, h('div', { class: 'v' }, value, unit ? h('small', null, unit) : null), h('div', { class: 'k' }, label));
  }
  function header(eyebrow, headline, small, sub) {
    return [h('div', { class: 'eyebrow' }, eyebrow), h('h1', { class: 'headline' }, headline, small ? h('small', null, small) : null), sub ? h('p', { class: 'sub' }, sub) : null];
  }
  function assumptions(list) {
    if (!Array.isArray(list) || !list.length) return null;
    return h('p', { class: 'note' }, list[0]);
  }
  function connectCta(text) {
    return h('div', { class: 'cta' },
      h('p', null, text || 'Connect a NeuroCann facility to plan with your own historical yields and live inventory.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', onclick: function () { openLink(APP_URL); } }, 'Open NeuroCann')));
  }
  function showEmpty(text) { root.replaceChildren(h('div', { class: 'empty' }, text)); }
  function pctWidth(part, whole, min) {
    if (!whole) return min;
    return Math.max(min, Math.min(100, (part / whole) * 100));
  }

  // ── Views ──────────────────────────────────────────────────────────────────
  function viewExtraction(d) {
    var start = d.startingMaterial || {};
    var startM = massLb(start.required);
    var target = d.target || {};
    var fin = mass(target.finishedWeight);
    var hours = (d.steps || []).reduce(function (a, s) { return a + (s.estimatedHours || 0); }, 0);
    var material = String(start.type || '').replace(/_/g, ' ');

    var sub = 'for ' + fin.big + ' of ' + (target.product || 'finished product') +
      (target.carts ? ' (' + num(target.carts, 0) + ' carts)' : '') +
      ' · ' + num(d.overallYieldPct, 2) + '% overall yield';

    var steps = h('ol', { class: 'steps' }, (d.steps || []).map(function (s) {
      var out = mass(s.outputWeight);
      var isOverride = s.yieldSource === 'override';
      return h('li', { class: 'step' },
        h('div', { class: 'name' }, s.step, h('span', null, '→ ' + String(s.output || '').replace(/_/g, ' '))),
        h('div', null,
          h('div', { class: 'track' }, h('div', { class: 'fill', style: 'width:' + pctWidth(s.yieldPct || 0, 100, 2).toFixed(1) + '%' })),
          h('div', { style: 'margin-top:3px' }, h('span', { class: 'badge' + (isOverride ? ' override' : '') }, num(s.yieldPct, 2) + '% step yield' + (isOverride ? ' · yours' : '')))),
        h('div', { class: 'amt' }, out.big, h('span', null, out.small)));
    }));

    var tiles = [tile(num(d.overallYieldPct, 2), '%', 'overall yield'), tile(num(hours, 1), 'h', 'process time')];
    if (d.outputBatches) tiles.push(tile(num(d.outputBatches.batches, 0), '', 'output batches (' + num(d.outputBatches.standardBatchGrams, 0) + ' g)'));
    if (typeof d.estimatedMaterialCostUsd === 'number') tiles.push(tile(usd(d.estimatedMaterialCostUsd), '', 'material cost'));
    if (d.runs) tiles.push(tile(num(d.runs.firstStepRuns, 0), '', 'runs · ' + num(d.runs.firstStepHoursTotal, 1) + ' h'));

    return [
      header('Extraction plan', startM.big, startM.small + ' ' + material, sub),
      h('div', { class: 'section' }, h('div', { class: 'label' }, 'Output at each step · bar shows the step yield'), steps),
      h('div', { class: 'section' }, h('div', { class: 'tiles' }, tiles)),
      assumptions(d.assumptions),
      connectCta('Linked facilities plan against their own per-strain yields and on-hand fresh frozen.')
    ];
  }

  function viewYield(d) {
    var dry = massLb(d.expectedDryWeight), wet = massLb(d.expectedWetWeight);
    var split = d.split || {};
    var parts = [
      { k: 'flower', c: 'var(--nc-accent)', v: split.flower },
      { k: 'trim', c: 'var(--nc-amber)', v: split.trim },
      { k: 'shake', c: 'var(--nc-violet)', v: split.shake }
    ].filter(function (p) { return p.v; });
    var tiles = [];
    if (d.estimatedRevenue) {
      if (typeof d.estimatedRevenue.flowerUsd === 'number') tiles.push(tile(usd(d.estimatedRevenue.flowerUsd), '', 'flower revenue'));
      if (typeof d.estimatedRevenue.trimAndShakeUsd === 'number') tiles.push(tile(usd(d.estimatedRevenue.trimAndShakeUsd), '', 'trim & shake revenue'));
      if (typeof d.estimatedRevenue.totalUsd === 'number') tiles.push(tile(usd(d.estimatedRevenue.totalUsd), '', 'total revenue'));
    }
    return [
      header('Harvest yield', dry.big, dry.small + ' dry', 'from ' + num(d.plants, 0) + ' plants · expect about ' + wet.big + ' wet on harvest day'),
      h('div', { class: 'section' },
        h('div', { class: 'label' }, 'Flower / trim / shake split'),
        h('div', { class: 'stack' }, parts.map(function (p) { return h('div', { style: 'width:' + num(p.v.sharePct, 1) + '%;background:' + p.c, title: p.k }); })),
        h('div', { class: 'legend' }, parts.map(function (p) {
          var m = massLb(p.v);
          return h('div', null, h('span', { class: 'dot', style: 'background:' + p.c }), h('b', null, m.big), ' ', h('span', { class: 'm' }, p.k + ' · ' + num(p.v.sharePct, 0) + '%'));
        }))),
      tiles.length ? h('div', { class: 'section' }, h('div', { class: 'tiles' }, tiles)) : null,
      assumptions(d.assumptions),
      connectCta('Linked facilities see actual flower, trim, shake and waste per harvest and per strain.')
    ];
  }

  function viewTimeline(d) {
    var m = d.milestones || {}, dur = d.durations || {};
    var segs = [];
    if (typeof dur.vegDays === 'number' && dur.vegDays > 0) segs.push({ k: 'Veg', days: dur.vegDays, c: 'var(--nc-faint)' });
    segs.push({ k: 'Flower', days: dur.floweringDays || 0, c: 'var(--nc-accent)' });
    segs.push({ k: 'Dry', days: dur.dryingDays || 0, c: 'var(--nc-amber)' });
    segs.push({ k: 'Cure', days: dur.cureDays || 0, c: 'var(--nc-blue)' });
    var total = segs.reduce(function (a, s) { return a + s.days; }, 0) || 1;
    var marks = [];
    if (m.vegStart) marks.push(['Veg start', m.vegStart]);
    marks.push(['Flip to 12/12', m.flipToFlower], ['Harvest', m.harvest], ['Drying complete', m.dryingComplete], ['Cure complete', m.cureComplete]);
    return [
      header('Harvest calendar', 'Harvest ' + date(m.harvest), '', 'Saleable ' + date(m.cureComplete) + ' · ' + num(dur.flipToSaleableDays, 0) + ' days from flip to shelf'),
      h('div', { class: 'timeline' },
        h('div', { class: 'segs' }, segs.map(function (s) {
          return h('div', { style: 'flex:' + s.days + ' 1 0;background:' + s.c, title: s.k + ' · ' + s.days + ' days' }, s.days / total > 0.12 ? s.k + ' ' + s.days + 'd' : s.days + 'd');
        })),
        h('div', { class: 'marks' }, marks.map(function (mk) { return h('div', { class: 'mark' }, h('span', { class: 'n' }, mk[0]), h('span', { class: 'd' }, date(mk[1]))); }))),
      Array.isArray(d.weeklyCheckpoints) && d.weeklyCheckpoints.length ? h('div', { class: 'section' },
        h('div', { class: 'label' }, 'Flower-week checkpoints'),
        h('ul', { class: 'checks' }, d.weeklyCheckpoints.map(function (c) { return h('li', null, h('b', null, 'Wk ' + c.week), c.note); }))) : null,
      assumptions(d.assumptions),
      connectCta('Linked facilities record the flower date on every plant when a room is flipped and track the target harvest per batch.')
    ];
  }

  function viewLabor(d) {
    var w = massLb(d.dryWeight);
    var method = d.method === 'machine' ? 'machine-trim' : 'hand-trim';
    var headline, small, sub;
    if (d.crewNeeded) {
      headline = num(d.crewNeeded.trimmers, 0) + ' trimmers';
      sub = 'to ' + method + ' ' + w.big + ' in ' + num(d.crewNeeded.targetDays, 1) + ' days';
    } else if (d.daysNeeded) {
      headline = num(d.daysNeeded.days, 1) + ' days';
      sub = 'for ' + num(d.daysNeeded.crewSize, 0) + ' trimmers to ' + method + ' ' + w.big;
    } else {
      headline = num(d.trimmerHours, 0) + ' trimmer-hours';
      sub = 'to ' + method + ' ' + w.big;
    }
    var tiles = [tile(num(d.trimmerHours, 0), 'h', 'trimmer-hours'), tile(num(d.trimmerShifts, 1), '', 'shifts'), tile(num(d.gramsPerTrimmerHour, 0), 'g/h', 'per trimmer-hour')];
    if (d.laborCost) { tiles.push(tile(usd(d.laborCost.totalUsd), '', 'labor cost')); tiles.push(tile(usd(d.laborCost.perLbUsd), '/lb', 'cost per pound')); }
    return [
      header('Trim labor', headline, small, sub),
      h('div', { class: 'section' }, h('div', { class: 'tiles' }, tiles)),
      assumptions(d.assumptions),
      connectCta('Linked facilities get measured grams-per-hour per trimmer from live trim sessions.')
    ];
  }

  function viewDry(d) {
    var dry = massLb(d.estimatedDryWeight), wet = massLb(d.wetWeight);
    var wetG = d.wetWeight ? d.wetWeight.grams : 0;
    var dryG = d.estimatedDryWeight ? d.estimatedDryWeight.grams : 0;
    var ffG = d.freshFrozen ? d.freshFrozen.grams : 0;
    var tiles = [tile(num(d.moistureLossPct, 0), '%', 'moisture loss'), tile(wet.big, '', 'wet weight')];
    if (d.freshFrozen) tiles.push(tile(massLb(d.freshFrozen).big, '', 'to fresh frozen'));
    if (d.perPlant) { tiles.push(tile(num(d.perPlant.dry.grams, 0), 'g', 'dry per plant (' + num(d.perPlant.plants, 0) + ')')); }
    return [
      header('Dry weight estimate', dry.big, dry.small + ' dry', 'from ' + wet.big + ' wet at ' + num(d.moistureLossPct, 0) + '% moisture loss'),
      h('div', { class: 'section' },
        h('div', { class: 'label' }, 'What remains after drying'),
        h('div', { class: 'track', style: 'height:18px;margin-top:8px' },
          ffG ? h('div', { class: 'fill ghost', style: 'left:auto;right:0;width:' + pctWidth(ffG, wetG, 1).toFixed(1) + '%' }) : null,
          h('div', { class: 'fill', style: 'width:' + pctWidth(dryG, wetG, 2).toFixed(1) + '%' })),
        h('div', { class: 'legend' },
          h('div', null, h('span', { class: 'dot', style: 'background:var(--nc-accent)' }), h('b', null, dry.big), ' ', h('span', { class: 'm' }, 'dry')),
          ffG ? h('div', null, h('span', { class: 'dot', style: 'background:color-mix(in srgb, var(--nc-accent) 35%, transparent)' }), h('b', null, massLb(d.freshFrozen).big), ' ', h('span', { class: 'm' }, 'fresh frozen')) : null,
          h('div', null, h('span', { class: 'dot', style: 'background:var(--nc-track)' }), h('b', null, massLb({ grams: wetG - dryG - ffG, pounds: (wetG - dryG - ffG) / 453.592 }).big), ' ', h('span', { class: 'm' }, 'water lost')))),
      h('div', { class: 'section' }, h('div', { class: 'tiles' }, tiles)),
      assumptions(d.assumptions),
      connectCta('Linked facilities track actual wet, dry and waste weights per harvest.')
    ];
  }

  function viewAbout(d) {
    var modules = d.modules || {};
    var free = (d.inThisAssistant && d.inThisAssistant.withoutAccount) || [];
    return [
      header('NeuroCann', 'Run the whole facility by talking to it', '', d.summary),
      h('div', { class: 'section' }, h('div', { class: 'label' }, 'Modules'),
        h('div', { class: 'modules' }, Object.keys(modules).map(function (k) { return h('div', { class: 'module' }, h('b', null, k), modules[k]); }))),
      free.length ? h('div', { class: 'section' }, h('div', { class: 'label' }, 'Free in this chat, no account needed'),
        h('ul', { class: 'free' }, free.map(function (line) {
          var i = String(line).indexOf(' — ');
          var text = i > 0 ? line.slice(i + 3) : String(line);
          return h('li', null, text.charAt(0).toUpperCase() + text.slice(1));
        }))) : null,
      h('div', { class: 'cta' },
        h('p', null, (d.inThisAssistant && d.inThisAssistant.howToLink) || 'Link a NeuroCann account to work with live facility data.'),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'secondary', onclick: function () { sendMessage('Plan how much fresh frozen I need for 500 g of live rosin.'); } }, 'Try a free planner'),
          h('button', { type: 'button', onclick: function () { openLink((d.links && d.links.signIn) || APP_URL); } }, 'Open NeuroCann')))
    ];
  }

  var VIEWS = {
    about_neurocann: viewAbout,
    plan_extraction_inputs: viewExtraction,
    estimate_dry_weight: viewDry,
    estimate_harvest_yield: viewYield,
    plan_harvest_timeline: viewTimeline,
    estimate_trim_labor: viewLabor
  };
  function detectView(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.startingMaterial && Array.isArray(d.steps)) return viewExtraction;
    if (d.split && d.expectedDryWeight) return viewYield;
    if (d.milestones && d.durations) return viewTimeline;
    if (typeof d.trimmerHours === 'number') return viewLabor;
    if (d.estimatedDryWeight && d.wetWeight) return viewDry;
    if (d.modules && d.links) return viewAbout;
    return null;
  }

  function render() {
    var res = lastResult;
    if (!res) return;
    if (res.isError) {
      var text = Array.isArray(res.content) && res.content[0] && res.content[0].text ? res.content[0].text : 'Something went wrong.';
      showEmpty(text);
      return;
    }
    var data = res.structuredContent;
    var view = (toolName && VIEWS[toolName]) || detectView(data);
    if (!view || !data) { showEmpty('Nothing to show yet.'); return; }
    try {
      root.replaceChildren();
      append(root, view(data));
    } catch (err) {
      showEmpty('Could not render this result.');
    }
    reportSize();
  }
})();
</script>
</body>
</html>`;
