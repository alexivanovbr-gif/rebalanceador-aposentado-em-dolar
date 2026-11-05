/*
 * Estado do app: carteira de exemplo, validação de dados importados,
 * leitura de números em pt-BR e persistência no localStorage.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Store = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'investidor-aposentado:rebalanceador:v1';
  var TYPES = ['ETF B3', 'ETF EUA', 'Ação', 'FII', 'Cripto', 'Renda Fixa'];
  var CURRENCIES = ['BRL', 'USD'];
  var PALETTE = ['#0000E7', '#30E7ED', '#1E6BFF', '#0A0A3C', '#7C3AED', '#00A8B5', '#C026D3', '#8A93B2', '#E11D74', '#3B3BB3', '#5FD4F0', '#9D7BF2'];

  var counter = 0;
  function uid(prefix) {
    counter++;
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + counter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** Lê número digitado em pt-BR ("1.234,56") ou com ponto ("1234.56"). */
  function parseNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    var s = String(value == null ? '' : value).replace(/R\$|US\$|\$|%|\s/g, '');
    if (s === '') return 0;
    if (s.indexOf(',') >= 0) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if ((s.match(/\./g) || []).length > 1) {
      s = s.replace(/\./g, '');
    }
    var n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }

  function asset(ticker, type, currency, shares, price, ideal, fraction) {
    return { id: uid('a'), ticker: ticker, type: type, currency: currency, shares: shares, price: price, ideal: ideal, fraction: fraction, ignored: false };
  }

  function klass(name, color, ideal, assets) {
    return { id: uid('c'), name: name, color: color, ideal: ideal, ignored: false, expanded: false, assets: assets || [] };
  }

  var DEFAULT_CLASSES = [
    ['Stocks USA', 15], ['REIT', 10], ['ETF USA', 15], ['Ação BR', 15], ['FII', 10],
    ['Renda Fixa', 10], ['Tesouro', 10], ['ETF BR', 10], ['Cripto', 5]
  ];

  /** Carteira de exemplo com valores fictícios, apenas para ilustrar o uso. */
  function examplePortfolio(name) {
    var c = DEFAULT_CLASSES;
    var classes = [
      klass(c[0][0], PALETTE[0], c[0][1], [
        asset('AAPL', 'Ação', 'USD', 10, 225, 50, false),
        asset('MSFT', 'Ação', 'USD', 5, 420, 50, false)
      ]),
      klass(c[1][0], PALETTE[1], c[1][1], [
        asset('O', 'Ação', 'USD', 30, 57, 60, false),
        asset('PLD', 'Ação', 'USD', 8, 115, 40, false)
      ]),
      klass(c[2][0], PALETTE[2], c[2][1], [
        asset('VOO', 'ETF EUA', 'USD', 6, 520, 60, false),
        asset('VT', 'ETF EUA', 'USD', 10, 120, 40, false)
      ]),
      klass(c[3][0], PALETTE[3], c[3][1], [
        asset('ITSA4', 'Ação', 'BRL', 300, 10.5, 40, false),
        asset('BBAS3', 'Ação', 'BRL', 100, 27, 30, false),
        asset('WEGE3', 'Ação', 'BRL', 40, 52, 30, false)
      ]),
      klass(c[4][0], PALETTE[4], c[4][1], [
        asset('HGLG11', 'FII', 'BRL', 20, 160, 40, false),
        asset('KNRI11', 'FII', 'BRL', 15, 150, 30, false),
        asset('MXRF11', 'FII', 'BRL', 200, 9.8, 30, false)
      ]),
      klass(c[5][0], PALETTE[5], c[5][1], [
        asset('CDB Liquidez', 'Renda Fixa', 'BRL', 8000, 1, 100, true)
      ]),
      klass(c[6][0], PALETTE[6], c[6][1], [
        asset('Tesouro IPCA+ 2035', 'Renda Fixa', 'BRL', 2.5, 2900, 60, true),
        asset('Tesouro Selic 2029', 'Renda Fixa', 'BRL', 0.4, 15500, 40, true)
      ]),
      klass(c[7][0], PALETTE[7], c[7][1], [
        asset('BOVA11', 'ETF B3', 'BRL', 40, 125, 50, false),
        asset('IVVB11', 'ETF B3', 'BRL', 20, 350, 50, false)
      ]),
      klass(c[8][0], PALETTE[8], c[8][1], [
        asset('BTC', 'Cripto', 'USD', 0.02, 68000, 70, true),
        asset('ETH', 'Cripto', 'USD', 0.3, 2500, 30, true)
      ])
    ];
    classes[0].expanded = true;
    return { id: uid('p'), name: name || 'Carteira exemplo', fx: 5.4, aporte: 0, classes: classes };
  }

  /** Nova carteira com as classes padrão do método e sem ativos. */
  function blankPortfolio(name) {
    return {
      id: uid('p'),
      name: name || 'Nova carteira',
      fx: 5.4,
      aporte: 0,
      classes: DEFAULT_CLASSES.map(function (d, i) { return klass(d[0], PALETTE[i % PALETTE.length], d[1], []); })
    };
  }

  function newClass(index) {
    var c = klass('Nova classe', PALETTE[index % PALETTE.length], 0, []);
    c.expanded = true;
    return c;
  }

  function newAsset(isFirst) {
    return asset('NOVO', 'Ação', 'BRL', 0, 0, isFirst ? 100 : 0, false);
  }

  /** Ajusta moeda e fração ao trocar o tipo do ativo. */
  function applyTypeDefaults(a) {
    if (a.type === 'ETF EUA') a.currency = 'USD';
    if (a.type === 'ETF B3' || a.type === 'FII') a.currency = 'BRL';
    if (a.type === 'Cripto' || a.type === 'Renda Fixa') a.fraction = true;
    if (a.type === 'ETF B3' || a.type === 'FII') a.fraction = false;
    return a;
  }

  function nonNeg(v) {
    var n = parseNumber(v);
    return n > 0 ? n : 0;
  }

  function str(v, fallback, max) {
    var s = typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim());
    if (!s) s = fallback;
    return s.slice(0, max || 80);
  }

  function sanitizeAsset(a) {
    a = a || {};
    return {
      id: typeof a.id === 'string' && a.id ? a.id : uid('a'),
      ticker: str(a.ticker, 'ATIVO', 40),
      type: TYPES.indexOf(a.type) >= 0 ? a.type : 'Ação',
      currency: CURRENCIES.indexOf(a.currency) >= 0 ? a.currency : 'BRL',
      shares: nonNeg(a.shares),
      price: nonNeg(a.price),
      ideal: nonNeg(a.ideal),
      fraction: !!a.fraction,
      ignored: !!a.ignored
    };
  }

  function sanitizeClass(c, i) {
    c = c || {};
    return {
      id: typeof c.id === 'string' && c.id ? c.id : uid('c'),
      name: str(c.name, 'Classe', 60),
      color: /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : PALETTE[i % PALETTE.length],
      ideal: nonNeg(c.ideal),
      ignored: !!c.ignored,
      expanded: !!c.expanded,
      assets: Array.isArray(c.assets) ? c.assets.map(sanitizeAsset) : []
    };
  }

  function sanitizePortfolio(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.classes)) {
      throw new Error('Carteira inválida: falta a lista de classes.');
    }
    return {
      id: typeof p.id === 'string' && p.id ? p.id : uid('p'),
      name: str(p.name, 'Carteira', 60),
      fx: nonNeg(p.fx) || 5,
      aporte: nonNeg(p.aporte),
      classes: p.classes.map(sanitizeClass)
    };
  }

  function defaultState() {
    var p = examplePortfolio();
    return { version: 1, activeId: p.id, chartMode: 'classes', portfolios: [p] };
  }

  function sanitizeState(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.portfolios) || s.portfolios.length === 0) {
      throw new Error('Arquivo sem carteiras.');
    }
    var portfolios = s.portfolios.map(sanitizePortfolio);
    var activeId = portfolios.some(function (p) { return p.id === s.activeId; }) ? s.activeId : portfolios[0].id;
    return {
      version: 1,
      activeId: activeId,
      chartMode: s.chartMode === 'assets' ? 'assets' : 'classes',
      portfolios: portfolios
    };
  }

  /**
   * Lê o texto de um arquivo JSON exportado. Aceita o arquivo completo
   * (várias carteiras) ou uma carteira avulsa. Retorna a lista de carteiras.
   */
  function parseImport(text) {
    var data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('O arquivo não é um JSON válido.');
    }
    if (data && Array.isArray(data.portfolios)) return sanitizeState(data).portfolios;
    if (data && Array.isArray(data.classes)) return [sanitizePortfolio(data)];
    throw new Error('Formato não reconhecido. Use um arquivo exportado por esta ferramenta.');
  }

  /** Inclui carteiras importadas sem sobrescrever as existentes. */
  function mergeImported(state, imported) {
    var ids = {};
    var names = {};
    state.portfolios.forEach(function (p) { ids[p.id] = true; names[p.name] = true; });
    imported.forEach(function (p) {
      if (ids[p.id]) p.id = uid('p');
      if (names[p.name]) p.name = p.name + ' (importada)';
      ids[p.id] = true;
      names[p.name] = true;
      state.portfolios.push(p);
    });
    return state;
  }

  function exportPayload(state) {
    return {
      app: 'rebalanceador-investidor-aposentado',
      version: 1,
      exportedAt: new Date().toISOString(),
      activeId: state.activeId,
      chartMode: state.chartMode,
      portfolios: state.portfolios
    };
  }

  function load(storage) {
    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      if (raw) return sanitizeState(JSON.parse(raw));
    } catch (e) {
      /* dados ausentes ou corrompidos: volta ao exemplo */
    }
    return defaultState();
  }

  function save(storage, state) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    TYPES: TYPES,
    CURRENCIES: CURRENCIES,
    PALETTE: PALETTE,
    uid: uid,
    parseNumber: parseNumber,
    examplePortfolio: examplePortfolio,
    blankPortfolio: blankPortfolio,
    newClass: newClass,
    newAsset: newAsset,
    applyTypeDefaults: applyTypeDefaults,
    sanitizePortfolio: sanitizePortfolio,
    sanitizeState: sanitizeState,
    defaultState: defaultState,
    parseImport: parseImport,
    mergeImported: mergeImported,
    exportPayload: exportPayload,
    load: load,
    save: save
  };
});
