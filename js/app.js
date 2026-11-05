/* Interface do rebalanceador. Depende de Calc (calc.js) e Store (store.js). */
(function () {
  'use strict';

  var storage = null;
  try { storage = window.localStorage; } catch (e) { storage = null; }

  var state = Store.load(storage);

  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var USD = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });

  var $ = function (sel) { return document.querySelector(sel); };

  /* Ícones */
  var ICON = {
    grip: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
    chev: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 1 12s4 7 11 7a10 10 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 17h.01"/></svg>'
  };

  /* Utilidades */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function money(v) { return BRL.format(v || 0); }
  function moneyUSD(v) { return USD.format(v || 0); }
  function pct(frac) {
    return ((frac || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }
  function numIn(v, maxDec) {
    return (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: maxDec == null ? 2 : maxDec, useGrouping: false });
  }
  function qty(v, fraction) {
    if (!v) return '0';
    return v.toLocaleString('pt-BR', { maximumFractionDigits: fraction ? 8 : 0 });
  }
  function pctTag(currentFrac, idealFrac) {
    var st = Calc.pctStatus(currentFrac, idealFrac);
    var title = st === 'below' ? 'Abaixo do ideal: precisa de aporte' : 'No ideal ou acima';
    return '<span class="pct-tag pct-' + st + '" title="' + title + '">' + pct(currentFrac) + '</span>';
  }

  function portfolio() {
    var p = state.portfolios.find(function (x) { return x.id === state.activeId; });
    if (!p) { p = state.portfolios[0]; state.activeId = p.id; }
    return p;
  }
  function findClass(id) { return portfolio().classes.find(function (c) { return c.id === id; }); }
  function findAsset(cid, aid) {
    var c = findClass(cid);
    return c ? c.assets.find(function (a) { return a.id === aid; }) : null;
  }

  function persist() {
    if (!storage || !Store.save(storage, state)) {
      if (!persist.warned) { toast('Não foi possível salvar neste navegador. Exporte suas carteiras.'); persist.warned = true; }
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* Campos ligados ao estado: data-bind + data-cid/data-aid; data-k identifica o foco */
  function key(bind, cid, aid) { return bind + '|' + (cid || '') + '|' + (aid || ''); }
  function numField(bind, value, opts) {
    opts = opts || {};
    return '<input class="in num' + (opts.cls ? ' ' + opts.cls : '') + '" type="text" inputmode="decimal" autocomplete="off"' +
      ' data-bind="' + bind + '"' + (opts.cid ? ' data-cid="' + esc(opts.cid) + '"' : '') + (opts.aid ? ' data-aid="' + esc(opts.aid) + '"' : '') +
      ' data-k="' + esc(key(bind, opts.cid, opts.aid)) + '"' +
      ' value="' + esc(numIn(value, opts.dec)) + '" aria-label="' + esc(opts.label || '') + '">';
  }
  function attrs(bind, cid, aid) {
    return ' data-bind="' + bind + '"' + (cid ? ' data-cid="' + esc(cid) + '"' : '') + (aid ? ' data-aid="' + esc(aid) + '"' : '') +
      ' data-k="' + esc(key(bind, cid, aid)) + '"';
  }
  function actionAttrs(action, cid, aid) {
    return ' data-action="' + action + '"' + (cid ? ' data-cid="' + esc(cid) + '"' : '') + (aid ? ' data-aid="' + esc(aid) + '"' : '') +
      ' data-k="' + esc(key('act:' + action, cid, aid)) + '"';
  }

  /* Renderização */
  function render() {
    var focus = captureFocus();
    var p = portfolio();
    var r = Calc.compute(p);
    var resById = {};
    r.classes.forEach(function (c) { resById[c.id] = c; });

    renderPortfolioSelect();
    $('#summary').innerHTML = summaryHTML(p, r, resById);
    $('#chart').innerHTML = chartHTML(p, r, resById);
    $('#strip').innerHTML = stripHTML(p, r);
    $('#classCards').innerHTML = cardsHTML(p, r, resById);
    $('#aporteSummary').innerHTML = aporteSummaryHTML(p, r, resById);
    restoreFocus(focus);
  }

  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.k) return null;
    var f = { k: el.dataset.k, value: null, start: null, end: null };
    if (el.tagName === 'INPUT' && el.type === 'text') {
      f.value = el.value;
      try { f.start = el.selectionStart; f.end = el.selectionEnd; } catch (e) { /* sem seleção */ }
    }
    return f;
  }

  function restoreFocus(f) {
    if (!f) return;
    var el = document.querySelector('[data-k="' + cssEscape(f.k) + '"]');
    if (!el) return;
    if (f.value !== null && el.tagName === 'INPUT') el.value = f.value;
    el.focus({ preventScroll: true });
    if (f.start !== null) {
      try { el.setSelectionRange(f.start, f.end); } catch (e) { /* ignora */ }
    }
  }

  function cssEscape(s) {
    return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
  }

  function renderPortfolioSelect() {
    var sel = $('#pfSelect');
    sel.innerHTML = state.portfolios.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === state.activeId ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
  }

  function idealWarning(status, scope) {
    if (status.ok) return '';
    return '<div class="warn" role="alert">' + ICON.warn + '<div>A soma dos % ideais ' + scope + ' é <strong>' +
      numIn(status.sum, 2) + '%</strong> e não fecha 100%. O cálculo normaliza os percentuais proporcionalmente, mas ajuste para ficar exato.</div></div>';
  }

  function summaryHTML(p, r, resById) {
    var rows = p.classes.map(function (c) {
      var cr = resById[c.id];
      return '<tr data-sort-item="' + esc(c.id) + '">' +
        '<td class="td-handle"><button class="drag-handle" data-drag-handle' + actionAttrs('drag-class', c.id) +
        ' title="Arraste para reordenar (ou use as setas)" aria-label="Reordenar ' + esc(c.name) + '">' + ICON.grip + '</button></td>' +
        '<td class="td-color"><input class="in-color" type="color" value="' + esc(c.color) + '"' + attrs('class.color', c.id) + ' aria-label="Cor de ' + esc(c.name) + '"></td>' +
        '<td class="td-name"><input class="in in-name" type="text" maxlength="60" value="' + esc(c.name) + '"' + attrs('class.name', c.id) + ' aria-label="Nome da classe"></td>' +
        '<td class="td-ideal" data-label="% ideal"><div class="affix pct">' + numField('class.ideal', c.ideal, { cid: c.id, label: '% ideal de ' + c.name }) + '<span class="post">%</span></div></td>' +
        '<td class="td-cur" data-label="% atual">' + pctTag(cr.currentPct, cr.idealPct) + '</td>' +
        '<td class="td-pos r money" data-label="Posição">' + money(cr.position) + '</td>' +
        '<td class="td-del c"><button class="icon-btn danger"' + actionAttrs('del-class', c.id) + ' title="Excluir classe" aria-label="Excluir ' + esc(c.name) + '">' + ICON.trash + '</button></td>' +
        '</tr>';
    }).join('');

    var body = p.classes.length
      ? '<table class="tbl tbl-classes stack"><thead><tr><th class="col-handle"><span class="sr-only">Ordem</span></th><th class="col-color">Cor</th><th>Classe</th>' +
        '<th class="col-ideal r">% ideal</th><th>% atual</th><th class="r">Posição</th><th class="col-act"><span class="sr-only">Excluir</span></th></tr></thead>' +
        '<tbody data-sort-list="classes">' + rows + '</tbody>' +
        '<tfoot><tr><td></td><td></td><td>Total</td><td class="r">' + numIn(r.classIdeal.sum, 2) + '%</td><td>' + (r.total > 0 ? pct(1) : pct(0)) + '</td><td class="r money">' + money(r.total) + '</td><td></td></tr></tfoot></table>'
      : '<p class="empty">Nenhuma classe ainda. Adicione a primeira classe da carteira.</p>';

    return '<div class="card-head"><div><h2 id="summaryTitle">Resumo da carteira</h2><p class="sub">Edite cor, nome e % ideal direto na tabela.</p></div>' +
      '<div class="big-total"><div class="big-label">Patrimônio total</div><div class="big-number">' + money(r.total) + '</div></div></div>' +
      '<div class="fx-row"><label for="fxInput">Cotação USD/BRL</label><div class="affix" style="width:130px"><span class="pre">R$</span>' +
      '<input id="fxInput" class="in num" type="text" inputmode="decimal" autocomplete="off"' + attrs('pf.fx') + ' value="' + esc(numIn(p.fx, 4)) + '"></div>' +
      '<span class="hint">Digitada por você. Posições em USD são convertidas para BRL.</span></div>' +
      idealWarning(r.classIdeal, 'das classes') +
      body +
      '<div class="card-foot"><span class="ideal-sum">Soma dos % ideais: <strong>' + numIn(r.classIdeal.sum, 2) + '%</strong></span>' +
      '<button class="btn btn-primary"' + actionAttrs('add-class') + '>' + ICON.plus + 'Adicionar classe</button></div>';
  }

  /* Gráfico de rosca em SVG */
  function shade(hex, t) {
    var n = parseInt(hex.slice(1), 16);
    var rr = (n >> 16) & 255, gg = (n >> 8) & 255, bb = n & 255;
    var mix = function (c) { return Math.round(c + (255 - c) * t); };
    return 'rgb(' + mix(rr) + ',' + mix(gg) + ',' + mix(bb) + ')';
  }

  /* Fatias do gráfico atual, usadas pela dica ao passar o mouse */
  var chartSlices = [];
  var chartHasAporte = false;

  function chartHTML(p, r, resById) {
    var mode = state.chartMode === 'assets' ? 'assets' : 'classes';
    var slices = [];
    if (mode === 'classes') {
      p.classes.forEach(function (c) {
        var cr = resById[c.id];
        if (cr.position > 0) {
          slices.push({ name: c.name, value: cr.position, color: c.color, ideal: cr.idealPct, current: cr.currentPct, after: cr.afterPct, scope: 'na carteira' });
        }
      });
    } else {
      p.classes.forEach(function (c) {
        var cr = resById[c.id];
        var n = c.assets.length;
        c.assets.forEach(function (a, i) {
          var ar = cr.assets[i];
          if (ar.position > 0) {
            slices.push({ name: a.ticker, value: ar.position, color: shade(c.color, n > 1 ? (i / n) * 0.6 : 0), group: c.name, ideal: ar.idealPct, current: ar.currentPct, after: ar.afterPct, scope: 'na classe' });
          }
        });
      });
    }
    var total = slices.reduce(function (s, x) { return s + x.value; }, 0);
    chartSlices = slices;
    chartHasAporte = r.used > 0;

    var head = '<div class="card-head"><div><h2 id="chartTitle">Alocação atual</h2><p class="sub">Passe o mouse ou toque no gráfico para ver os detalhes.</p></div>' +
      '<div class="seg" role="group" aria-label="Ver por">' +
      '<button' + actionAttrs('chart-classes') + ' aria-pressed="' + (mode === 'classes') + '">Classes</button>' +
      '<button' + actionAttrs('chart-assets') + ' aria-pressed="' + (mode === 'assets') + '">Ativos</button></div></div>';

    if (total <= 0) return head + '<p class="empty">Sem posições para exibir. Informe cotas e preços dos ativos.</p>';

    var R = 70, C = 2 * Math.PI * R, offset = 0;
    var gap = slices.length > 1 ? 1.2 : 0;
    var arcs = slices.map(function (s, i) {
      var len = (s.value / total) * C;
      var draw = Math.max(len - gap, 0.01);
      s.share = s.value / total;
      s.mid = ((offset + len / 2) / C) * 2 * Math.PI - Math.PI / 2;
      var arc = '<circle class="seg-arc" data-slice="' + i + '" tabindex="0" cx="100" cy="100" r="' + R + '" fill="none" stroke="' + esc(s.color) + '" stroke-width="30"' +
        ' stroke-dasharray="' + draw.toFixed(3) + ' ' + (C - draw).toFixed(3) + '" stroke-dashoffset="' + (-offset).toFixed(3) + '"' +
        ' transform="rotate(-90 100 100)" aria-label="' + esc((s.group ? s.group + ': ' : '') + s.name + ', ' + pct(s.share) + ' do patrimônio') + '"></circle>';
      offset += len;
      return arc;
    }).join('');

    var svg = '<svg class="donut" viewBox="0 0 200 200" role="group" aria-label="Gráfico de rosca da alocação atual por ' + (mode === 'classes' ? 'classes' : 'ativos') + '">' +
      '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="#EEF0FD" stroke-width="30"/>' + arcs +
      '<text x="100" y="94" text-anchor="middle" class="donut-center-label">Patrimônio</text>' +
      '<text x="100" y="114" text-anchor="middle" class="donut-center-value">' + esc(compactMoney(total)) + '</text></svg>';

    var legend = '<ul class="legend">' + slices.map(function (s, i) {
      return '<li data-slice="' + i + '"><span class="dot" style="background:' + esc(s.color) + '"></span><span class="name">' + esc(s.name) +
        '</span><span class="val">' + pct(s.share) + '</span></li>';
    }).join('') + '</ul>';

    return head + '<div class="donut-wrap">' + svg + legend + '<div class="chart-tip" id="chartTip" role="tooltip" hidden></div></div>';
  }

  function pct2(frac) {
    return ((frac || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  function tipHTML(s) {
    return '<div class="tt-title"><span class="tt-dot" style="background:' + esc(s.color) + '"></span><span>' + esc(s.name) + '</span></div>' +
      (s.group ? '<div class="tt-group">' + esc(s.group) + '</div>' : '') +
      '<div class="tt-line">Ideal: ' + pct2(s.ideal) + ' | Atual: ' + pct2(s.current) + ' <span class="tt-scope">' + s.scope + '</span></div>' +
      '<div class="tt-line">Posição: ' + money(s.value) + '</div>' +
      (chartHasAporte ? '<div class="tt-after">Com o aporte: ' + pct2(s.after) + '</div>' : '');
  }

  /* Mostra a dica da fatia i. Com coordenadas do ponteiro, posiciona junto ao cursor; sem elas, no meio da fatia. */
  function showChartTip(i, clientX, clientY) {
    var s = chartSlices[i];
    var tip = document.getElementById('chartTip');
    var svg = document.querySelector('#chart .donut');
    if (!s || !tip || !svg) return;
    var wrap = tip.parentElement;
    svg.classList.add('has-hover');
    Array.prototype.forEach.call(svg.querySelectorAll('.seg-arc'), function (el) {
      el.classList.toggle('is-hover', el.getAttribute('data-slice') === String(i));
    });
    if (tip.dataset.slice !== String(i)) {
      tip.innerHTML = tipHTML(s);
      tip.dataset.slice = String(i);
    }
    tip.hidden = false;

    var wr = wrap.getBoundingClientRect();
    var x, y;
    if (clientX == null) {
      var sr = svg.getBoundingClientRect();
      var scale = sr.width / 200;
      x = sr.left - wr.left + (100 + 85 * Math.cos(s.mid)) * scale;
      y = sr.top - wr.top + (100 + 85 * Math.sin(s.mid)) * scale;
    } else {
      x = clientX - wr.left;
      y = clientY - wr.top;
    }
    var tw = tip.offsetWidth, th = tip.offsetHeight, pad = 14;
    var left = x + pad;
    if (left + tw > wr.width) left = x - tw - pad;
    if (left < 0) left = Math.max(0, Math.min(wr.width - tw, x - tw / 2));
    var top = y + pad;
    if (top + th > wr.height) top = Math.max(0, y - th - pad);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function hideChartTip() {
    var tip = document.getElementById('chartTip');
    var svg = document.querySelector('#chart .donut');
    if (tip) { tip.hidden = true; tip.dataset.slice = ''; }
    if (svg) {
      svg.classList.remove('has-hover');
      Array.prototype.forEach.call(svg.querySelectorAll('.is-hover'), function (el) { el.classList.remove('is-hover'); });
    }
  }

  function onChartPointer(e) {
    if (drag) return;
    var arc = e.target.closest && e.target.closest('#chart .seg-arc');
    if (arc) { showChartTip(Number(arc.getAttribute('data-slice')), e.clientX, e.clientY); return; }
    var item = e.target.closest && e.target.closest('#chart .legend li');
    if (item) { showChartTip(Number(item.getAttribute('data-slice'))); return; }
    var tip = document.getElementById('chartTip');
    if (tip && !tip.hidden) hideChartTip();
  }

  function compactMoney(v) {
    if (v >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
    if (v >= 1e4) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return money(v);
  }

  function stripHTML(p, r) {
    var hasBuys = r.used > 0;
    return '<div class="aporte-box"><label for="aporteInput">Valor do aporte</label><div class="aporte-field"><span class="pre">R$</span>' +
      '<input id="aporteInput" class="aporte-input" type="text" inputmode="decimal" autocomplete="off" placeholder="0,00"' + attrs('pf.aporte') +
      ' data-live="1" value="' + (p.aporte ? esc(numIn(p.aporte, 2)) : '') + '"></div></div>' +
      '<div class="stat"><div class="big-label">Usado</div><div class="mid-number">' + money(r.used) + '</div></div>' +
      '<div class="stat"><div class="big-label">Saldo</div><div class="mid-number">' + money(r.balance) + '</div></div>' +
      '<div class="actions"><button class="btn btn-accent"' + actionAttrs('accept') + (hasBuys ? '' : ' disabled') + '>' + ICON.check + 'Aceitar sugestões</button>' +
      '<button class="btn btn-outline-light"' + actionAttrs('clear-aporte') + (p.aporte ? '' : ' disabled') + '>Limpar aporte</button></div>';
  }

  function cardsHTML(p, r, resById) {
    var cards = p.classes.map(function (c) { return classCardHTML(c, resById[c.id]); }).join('');
    return cards + '<div class="add-class-row"><button class="btn btn-ghost"' + actionAttrs('add-class', 'cards') + '>' + ICON.plus + 'Adicionar classe</button></div>';
  }

  function classCardHTML(c, cr) {
    var open = !!c.expanded;
    var head = '<div class="cc-head">' +
      '<div class="cc-main"><h3>' + esc(c.name) + '</h3><div class="cc-meta"><span class="sub">Ideal</span> <strong>' + numIn(c.ideal, 2) + '%</strong>' +
      '<span class="sub">Atual</span> ' + pctTag(cr.currentPct, cr.idealPct) +
      (c.ignored ? '<span class="ignored-badge">Ignorada neste aporte</span>' : '') + '</div></div>' +
      '<div class="cc-pos"><div class="big-label">Posição</div><div class="mid-number">' + money(cr.position) + '</div></div>' +
      '<div class="cc-actions">' +
      '<button class="icon-btn"' + actionAttrs('toggle-expand', c.id) + ' aria-expanded="' + open + '" title="' + (open ? 'Recolher' : 'Expandir') + ' ativos" aria-label="' + (open ? 'Recolher' : 'Expandir') + ' ativos de ' + esc(c.name) + '">' + ICON.chev + '</button>' +
      '<button class="icon-btn"' + actionAttrs('toggle-ignore-class', c.id) + ' aria-pressed="' + !!c.ignored + '" title="' + (c.ignored ? 'Incluir neste aporte' : 'Ignorar neste aporte') + '" aria-label="Ignorar ' + esc(c.name) + ' neste aporte">' + (c.ignored ? ICON.eyeOff : ICON.eye) + '</button>' +
      '<button class="icon-btn danger"' + actionAttrs('del-class', c.id) + ' title="Excluir classe" aria-label="Excluir ' + esc(c.name) + '">' + ICON.trash + '</button>' +
      '</div></div>';

    var boxes = '<div class="cc-boxes">' +
      '<div class="box"><div class="big-label">Disponível</div><div class="mid-number">' + money(cr.available) + '</div></div>' +
      '<div class="box box-hl"><div class="big-label">Usado</div><div class="mid-number">' + money(cr.used) + '</div></div>' +
      '<div class="box"><div class="big-label">Saldo</div><div class="mid-number">' + money(cr.balance) + '</div></div></div>';

    var body = '';
    if (open) {
      body = '<div class="cc-body">' + idealWarning(cr.assetIdeal, 'dos ativos desta classe') + assetsTableHTML(c, cr) +
        '<div class="cc-foot"><button class="btn btn-primary"' + actionAttrs('add-asset', c.id) + '>' + ICON.plus + 'Adicionar ativo</button>' +
        '<button class="btn btn-ghost"' + actionAttrs('add-class', 'card-' + c.id) + '>' + ICON.plus + 'Adicionar classe</button></div></div>';
    }

    return '<article class="class-card' + (open ? ' is-open' : '') + (c.ignored ? ' is-ignored' : '') + '" style="--c:' + esc(c.color) + '" aria-label="Classe ' + esc(c.name) + '">' +
      head + boxes + body + '</article>';
  }

  function assetsTableHTML(c, cr) {
    if (!c.assets.length) return '<p class="empty">Nenhum ativo nesta classe. Adicione o primeiro ativo.</p>';
    var rows = c.assets.map(function (a, i) {
      var ar = cr.assets[i];
      var usd = a.currency === 'USD';
      var typeOpts = Store.TYPES.map(function (t) { return '<option' + (t === a.type ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('');
      var curOpts = Store.CURRENCIES.map(function (t) { return '<option' + (t === a.currency ? ' selected' : '') + '>' + t + '</option>'; }).join('');
      var handle = '<button class="drag-handle" data-drag-handle' + actionAttrs('drag-asset', c.id, a.id) + ' title="Arraste para reordenar (ou use as setas)" aria-label="Reordenar ' + esc(a.ticker) + '">' + ICON.grip + '</button>';
      var ignoreBtn = '<button class="icon-btn"' + actionAttrs('toggle-ignore-asset', c.id, a.id) + ' aria-pressed="' + !!a.ignored + '" title="' + (a.ignored ? 'Incluir neste aporte' : 'Ignorar neste aporte') + '" aria-label="Ignorar ' + esc(a.ticker) + ' neste aporte">' + (a.ignored ? ICON.eyeOff : ICON.eye) + '</button>';
      var delBtn = '<button class="icon-btn danger"' + actionAttrs('del-asset', c.id, a.id) + ' title="Excluir ativo" aria-label="Excluir ' + esc(a.ticker) + '">' + ICON.trash + '</button>';
      var mobileKey = function (s) { return s.replace(/data-k="([^"]*)"/, 'data-k="$1|m"'); };
      return '<tr data-sort-item="' + esc(a.id) + '"' + (a.ignored ? ' class="is-ignored"' : '') + '>' +
        '<td class="td-handle keep">' + handle + '</td>' +
        '<td class="ticker-cell keep"><span class="m-only">' + mobileKey(handle) + '</span><div>' +
        '<input class="in in-ticker" type="text" maxlength="40" value="' + esc(a.ticker) + '"' + attrs('asset.ticker', c.id, a.id) + ' aria-label="Ticker">' +
        '<div class="asset-meta"><select class="mini-select"' + attrs('asset.type', c.id, a.id) + ' aria-label="Tipo">' + typeOpts + '</select>' +
        '<select class="mini-select cur"' + attrs('asset.currency', c.id, a.id) + ' aria-label="Moeda">' + curOpts + '</select>' +
        '<label class="switch" title="Permite comprar frações de cota"><input type="checkbox"' + (a.fraction ? ' checked' : '') + attrs('asset.fraction', c.id, a.id) + '><span class="track"></span>Fração</label></div></div>' +
        '<span class="m-only m-actions">' + mobileKey(ignoreBtn) + mobileKey(delBtn) + '</span></td>' +
        '<td data-label="Cotas">' + numField('asset.shares', a.shares, { cid: c.id, aid: a.id, dec: 8, label: 'Cotas de ' + a.ticker }) + '</td>' +
        '<td class="col-price" data-label="Preço"><div class="affix"><span class="pre">' + (usd ? 'US$' : 'R$') + '</span>' +
        numField('asset.price', a.price, { cid: c.id, aid: a.id, dec: 8, label: 'Preço de ' + a.ticker }) + '</div></td>' +
        '<td class="r money td-pos" data-label="Posição">' + money(ar.position) + (usd ? '<span class="sub-money">' + moneyUSD(a.shares * a.price) + '</span>' : '') + '</td>' +
        '<td data-label="% ideal na classe"><div class="affix pct">' + numField('asset.ideal', a.ideal, { cid: c.id, aid: a.id, label: '% ideal de ' + a.ticker }) + '<span class="post">%</span></div></td>' +
        '<td data-label="% atual na classe">' + pctTag(ar.currentPct, ar.idealPct) + '</td>' +
        '<td class="r td-buy" data-label="Cotas a comprar"><span class="buy' + (ar.sharesToBuy > 0 ? '' : ' zero') + '">' + qty(ar.sharesToBuy, a.fraction) + '</span></td>' +
        '<td class="r money td-value" data-label="Valor do aporte"><span class="buy' + (ar.value > 0 ? '' : ' zero') + '">' + money(ar.value) + '</span>' +
        (usd && ar.value > 0 && cr && ar.priceBRL > 0 ? '<span class="sub-money">' + moneyUSD(ar.sharesToBuy * a.price) + '</span>' : '') + '</td>' +
        '<td class="c td-ignore keep">' + ignoreBtn + '</td>' +
        '<td class="c td-del keep">' + delBtn + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="assets-scroll"><table class="tbl tbl-assets stack"><thead><tr>' +
      '<th class="col-handle"><span class="sr-only">Ordem</span></th><th>Ativo</th><th class="r">Cotas</th><th>Preço</th><th class="r">Posição</th>' +
      '<th>% ideal</th><th>% atual</th><th class="r">Comprar</th><th class="r">Valor aporte</th><th class="col-act">Ignorar</th><th class="col-act"><span class="sr-only">Excluir</span></th>' +
      '</tr></thead><tbody data-sort-list="assets" data-cid="' + esc(c.id) + '">' + rows + '</tbody></table></div>';
  }

  function aporteSummaryHTML(p, r, resById) {
    var head = '<div class="card-head"><div><h2 id="aporteSummaryTitle">Resumo do aporte</h2><p class="sub">O que comprar para aproximar a carteira do ideal.</p></div></div>' +
      '<div class="sum-stats">' +
      '<div class="box"><div class="big-label">Aporte</div><div class="mid-number">' + money(r.aporte) + '</div></div>' +
      '<div class="box box-hl"><div class="big-label">Usado</div><div class="mid-number">' + money(r.used) + '</div></div>' +
      '<div class="box"><div class="big-label">Saldo</div><div class="mid-number">' + money(r.balance) + '</div></div></div>';

    if (r.aporte <= 0) return head + '<p class="empty">Informe o valor do aporte na faixa azul para ver as sugestões de compra.</p>';

    var rows = '';
    p.classes.forEach(function (c) {
      var cr = resById[c.id];
      var buys = c.assets.map(function (a, i) { return { a: a, ar: cr.assets[i] }; }).filter(function (x) { return x.ar.value > 0; });
      if (!buys.length && cr.balance <= 0) return;
      rows += '<tr class="sum-class"><td colspan="3"><span class="dot" style="background:' + esc(c.color) + '"></span>' + esc(c.name) +
        '</td><td class="r money">' + money(cr.used) + '</td></tr>';
      buys.forEach(function (x) {
        rows += '<tr><td data-label="Ativo"><strong>' + esc(x.a.ticker) + '</strong> <span class="type-tag">' + esc(x.a.type) + '</span></td>' +
          '<td class="r" data-label="Cotas a comprar">' + qty(x.ar.sharesToBuy, x.a.fraction) + '</td>' +
          '<td class="r" data-label="Preço">' + (x.a.currency === 'USD' ? moneyUSD(x.a.price) : money(x.a.price)) + '</td>' +
          '<td class="r money" data-label="Valor">' + money(x.ar.value) + '</td></tr>';
      });
      if (cr.balance > 0.004) {
        rows += '<tr><td colspan="3" class="muted">Saldo não utilizado na classe</td><td class="r money muted">' + money(cr.balance) + '</td></tr>';
      }
    });
    if (!rows) return head + '<p class="empty">Nenhuma compra sugerida com os dados atuais.</p>';

    return head + '<table class="tbl tbl-sum"><thead><tr><th>Ativo</th><th class="r">Cotas</th><th class="r">Preço</th><th class="r">Valor</th></tr></thead>' +
      '<tbody>' + rows + '</tbody><tfoot><tr><td colspan="3">Total usado</td><td class="r money">' + money(r.used) + '</td></tr></tfoot></table>';
  }

  /* Atualização do estado a partir dos campos */
  function applyBind(el) {
    var bind = el.dataset.bind;
    var p = portfolio();
    var val = el.type === 'checkbox' ? el.checked : el.value;
    var parts = bind.split('.');
    if (parts[0] === 'pf') {
      p[parts[1]] = Math.max(0, Store.parseNumber(val));
      return;
    }
    if (parts[0] === 'class') {
      var c = findClass(el.dataset.cid);
      if (!c) return;
      if (parts[1] === 'name') c.name = String(val).trim().slice(0, 60) || 'Classe';
      else if (parts[1] === 'color') c.color = /^#[0-9a-fA-F]{6}$/.test(val) ? val : c.color;
      else if (parts[1] === 'ideal') c.ideal = Math.max(0, Store.parseNumber(val));
      return;
    }
    if (parts[0] === 'asset') {
      var a = findAsset(el.dataset.cid, el.dataset.aid);
      if (!a) return;
      var f = parts[1];
      if (f === 'ticker') a.ticker = String(val).trim().toUpperCase().slice(0, 40) || 'ATIVO';
      else if (f === 'type') { a.type = val; Store.applyTypeDefaults(a); }
      else if (f === 'currency') a.currency = val === 'USD' ? 'USD' : 'BRL';
      else if (f === 'fraction') a.fraction = !!val;
      else a[f] = Math.max(0, Store.parseNumber(val));
    }
  }

  var renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(function () { renderQueued = false; render(); }, 0);
  }

  function onChange(e) {
    var el = e.target;
    if (el.id === 'pfSelect') {
      state.activeId = el.value;
      persist();
      render();
      return;
    }
    if (el.id === 'importFile') { importFile(el); return; }
    if (!el.dataset || !el.dataset.bind) return;
    applyBind(el);
    persist();
    scheduleRender();
  }

  function onInput(e) {
    var el = e.target;
    if (!el.dataset || !el.dataset.live) return;
    applyBind(el);
    persist();
    render();
  }

  function onClick(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    var action = btn.dataset.action;
    var p = portfolio();
    var cid = btn.dataset.cid;
    var aid = btn.dataset.aid;
    var c;

    switch (action) {
      case 'add-class':
        c = Store.newClass(p.classes.length);
        p.classes.push(c);
        commit();
        focusLater('[data-k="' + cssEscape(key('class.name', c.id)) + '"]', true);
        return;
      case 'del-class':
        c = findClass(cid);
        if (c && confirm('Excluir a classe "' + c.name + '" e seus ' + c.assets.length + ' ativo(s)?')) {
          p.classes = p.classes.filter(function (x) { return x.id !== cid; });
          commit();
        }
        return;
      case 'toggle-expand':
        c = findClass(cid);
        if (c) { c.expanded = !c.expanded; commit(); }
        return;
      case 'toggle-ignore-class':
        c = findClass(cid);
        if (c) { c.ignored = !c.ignored; commit(); }
        return;
      case 'add-asset':
        c = findClass(cid);
        if (c) {
          var a = Store.newAsset(c.assets.length === 0);
          c.assets.push(a);
          c.expanded = true;
          commit();
          focusLater('[data-k="' + cssEscape(key('asset.ticker', c.id, a.id)) + '"]', true);
        }
        return;
      case 'del-asset':
        c = findClass(cid);
        var asset = findAsset(cid, aid);
        if (c && asset && confirm('Excluir o ativo "' + asset.ticker + '"?')) {
          c.assets = c.assets.filter(function (x) { return x.id !== aid; });
          commit();
        }
        return;
      case 'toggle-ignore-asset':
        var as = findAsset(cid, aid);
        if (as) { as.ignored = !as.ignored; commit(); }
        return;
      case 'accept':
        var next = Calc.acceptSuggestions(p);
        p.classes = next.classes;
        p.aporte = 0;
        commit();
        toast('Sugestões aceitas: cotas atualizadas e aporte zerado.');
        return;
      case 'clear-aporte':
        p.aporte = 0;
        commit();
        return;
      case 'chart-classes':
      case 'chart-assets':
        state.chartMode = action === 'chart-assets' ? 'assets' : 'classes';
        commit();
        return;
      case 'pf-new':
        var name = prompt('Nome da nova carteira:', 'Nova carteira');
        if (name === null) return;
        var np = Store.blankPortfolio(name.trim() || 'Nova carteira');
        state.portfolios.push(np);
        state.activeId = np.id;
        commit();
        toast('Carteira criada com as classes padrão do método.');
        return;
      case 'pf-rename':
        var nn = prompt('Novo nome da carteira:', p.name);
        if (nn === null) return;
        p.name = nn.trim().slice(0, 60) || p.name;
        commit();
        return;
      case 'pf-delete':
        if (state.portfolios.length <= 1) { toast('É preciso manter pelo menos uma carteira.'); return; }
        if (!confirm('Excluir a carteira "' + p.name + '"? Esta ação não pode ser desfeita.')) return;
        state.portfolios = state.portfolios.filter(function (x) { return x.id !== p.id; });
        state.activeId = state.portfolios[0].id;
        commit();
        return;
      case 'export':
        exportFile();
        return;
      case 'import':
        $('#importFile').click();
        return;
    }
  }

  function commit() { persist(); render(); }

  function focusLater(selector, select) {
    setTimeout(function () {
      var el = document.querySelector(selector);
      if (el) { el.focus(); if (select && el.select) el.select(); }
    }, 0);
  }

  /* Importar e exportar */
  function exportFile() {
    var data = JSON.stringify(Store.exportPayload(state), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'carteiras-investidor-aposentado-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Arquivo exportado.');
  }

  function importFile(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = Store.parseImport(String(reader.result));
        Store.mergeImported(state, imported);
        state.activeId = imported[0].id;
        commit();
        toast(imported.length + ' carteira(s) importada(s).');
      } catch (err) {
        alert('Não foi possível importar: ' + err.message);
      }
      input.value = '';
    };
    reader.onerror = function () { alert('Não foi possível ler o arquivo.'); input.value = ''; };
    reader.readAsText(file);
  }

  /* Reordenar arrastando pela alça (mouse e toque) ou com as setas do teclado */
  function reorder(list, ids) {
    var map = {};
    list.forEach(function (x) { map[x.id] = x; });
    var out = ids.map(function (id) { return map[id]; }).filter(Boolean);
    list.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); });
    return out;
  }

  function applyOrder(tbody) {
    var ids = Array.prototype.map.call(tbody.querySelectorAll(':scope > [data-sort-item]'), function (tr) { return tr.dataset.sortItem; });
    var p = portfolio();
    if (tbody.dataset.sortList === 'classes') {
      p.classes = reorder(p.classes, ids);
    } else {
      var c = findClass(tbody.dataset.cid);
      if (c) c.assets = reorder(c.assets, ids);
    }
    persist();
  }

  var drag = null;
  function onPointerDown(e) {
    var handle = e.target.closest('[data-drag-handle]');
    if (!handle || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var row = handle.closest('[data-sort-item]');
    var tbody = row && row.parentElement;
    if (!tbody || !tbody.dataset.sortList) return;
    e.preventDefault();
    drag = { row: row, tbody: tbody, moved: false, id: e.pointerId };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    row.classList.add('dragging');
    document.body.classList.add('is-dragging');
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    var y = e.clientY;
    var siblings = Array.prototype.filter.call(drag.tbody.children, function (el) { return el !== drag.row && el.dataset.sortItem; });
    var before = null;
    for (var i = 0; i < siblings.length; i++) {
      var rect = siblings[i].getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { before = siblings[i]; break; }
    }
    if (before) {
      if (drag.row.nextElementSibling !== before) { drag.tbody.insertBefore(drag.row, before); drag.moved = true; }
    } else if (drag.tbody.lastElementChild !== drag.row) {
      drag.tbody.appendChild(drag.row);
      drag.moved = true;
    }
    if (y < 60) window.scrollBy(0, -12);
    else if (y > window.innerHeight - 60) window.scrollBy(0, 12);
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag;
    drag = null;
    d.row.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    if (d.moved) { applyOrder(d.tbody); render(); }
  }

  function onKeyDown(e) {
    var handle = e.target.closest && e.target.closest('[data-drag-handle]');
    if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    var row = handle.closest('[data-sort-item]');
    var tbody = row.parentElement;
    e.preventDefault();
    if (e.key === 'ArrowUp' && row.previousElementSibling) tbody.insertBefore(row, row.previousElementSibling);
    else if (e.key === 'ArrowDown' && row.nextElementSibling) tbody.insertBefore(row.nextElementSibling, row);
    else return;
    applyOrder(tbody);
    render();
  }

  /* Logotipo: usa logo.png da raiz se existir */
  function loadLogo() {
    var img = $('#logoImg');
    var probe = new Image();
    probe.onload = function () {
      img.src = probe.src;
      img.hidden = false;
      $('#logoText').hidden = true;
    };
    probe.src = 'logo.png';
  }

  /* Quando incorporado em iframe, informa a altura para a página mãe */
  function setupEmbedHeight() {
    if (window.parent === window || !('ResizeObserver' in window)) return;
    var last = 0;
    var ro = new ResizeObserver(function () {
      var h = Math.ceil(document.documentElement.scrollHeight);
      if (Math.abs(h - last) > 2) {
        last = h;
        window.parent.postMessage({ type: 'investidor-aposentado:altura', height: h }, '*');
      }
    });
    ro.observe(document.body);
  }

  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);
  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointermove', onPointerMove, { passive: false });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointermove', onChartPointer);
  document.addEventListener('pointerdown', onChartPointer);
  document.addEventListener('focusin', function (e) {
    var arc = e.target.closest && e.target.closest('#chart .seg-arc');
    if (arc) showChartTip(Number(arc.getAttribute('data-slice')));
  });
  document.addEventListener('focusout', function (e) {
    if (e.target.closest && e.target.closest('#chart .seg-arc')) hideChartTip();
  });
  window.addEventListener('storage', function (e) {
    if (e.key === Store.STORAGE_KEY) { state = Store.load(storage); render(); }
  });

  // Enter em campos de texto confirma o valor sem sair do campo.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('input.in')) {
      e.target.blur();
      e.target.focus();
    }
  });

  loadLogo();
  setupEmbedHeight();
  render();
})();
