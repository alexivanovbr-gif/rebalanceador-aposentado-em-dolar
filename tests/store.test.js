'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../js/store.js');
const Calc = require('../js/calc.js');

test('parseNumber entende formato brasileiro e com ponto', () => {
  assert.equal(Store.parseNumber('1.234,56'), 1234.56);
  assert.equal(Store.parseNumber('1234.56'), 1234.56);
  assert.equal(Store.parseNumber('12,5'), 12.5);
  assert.equal(Store.parseNumber('R$ 1.000,00'), 1000);
  assert.equal(Store.parseNumber('1.000.000'), 1000000);
  assert.equal(Store.parseNumber('15%'), 15);
  assert.equal(Store.parseNumber(''), 0);
  assert.equal(Store.parseNumber('abc'), 0);
});

test('carteira de exemplo tem as nove classes e % ideais somando 100', () => {
  const p = Store.examplePortfolio();
  assert.deepEqual(p.classes.map((c) => c.name),
    ['Stocks USA', 'REIT', 'ETF USA', 'Ação BR', 'FII', 'Renda Fixa', 'Tesouro', 'ETF BR', 'Cripto']);
  assert.equal(Calc.idealSum(p.classes).ok, true);
  p.classes.forEach((c) => assert.equal(Calc.idealSum(c.assets).ok, true, c.name));
});

test('exportar e importar preserva as carteiras', () => {
  const state = Store.defaultState();
  const text = JSON.stringify(Store.exportPayload(state));
  const imported = Store.parseImport(text);
  assert.equal(imported.length, 1);
  assert.deepEqual(imported[0], state.portfolios[0]);
});

test('importar carteira avulsa e mesclar sem sobrescrever', () => {
  const state = Store.defaultState();
  const original = state.portfolios[0];
  const imported = Store.parseImport(JSON.stringify(original));
  Store.mergeImported(state, imported);
  assert.equal(state.portfolios.length, 2);
  assert.notEqual(state.portfolios[1].id, original.id);
  assert.equal(state.portfolios[1].name, original.name + ' (importada)');
});

test('importação rejeita arquivos inválidos e corrige campos', () => {
  assert.throws(() => Store.parseImport('não é json'), /JSON/);
  assert.throws(() => Store.parseImport('{"x":1}'), /Formato/);
  const [p] = Store.parseImport(JSON.stringify({
    name: '', fx: -1, classes: [{ name: 'X', ideal: '50', color: 'red', assets: [{ type: 'Outro', currency: 'EUR', shares: -3, price: '10,5' }] }]
  }));
  assert.equal(p.fx, 5);
  assert.equal(p.classes[0].ideal, 50);
  assert.match(p.classes[0].color, /^#[0-9A-Fa-f]{6}$/);
  const a = p.classes[0].assets[0];
  assert.equal(a.type, 'Ação');
  assert.equal(a.currency, 'BRL');
  assert.equal(a.shares, 0);
  assert.equal(a.price, 10.5);
});

test('load e save usam o localStorage e voltam ao exemplo se corrompido', () => {
  const mem = {};
  const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  const s = Store.load(storage);
  s.portfolios[0].name = 'Minha';
  assert.equal(Store.save(storage, s), true);
  assert.equal(Store.load(storage).portfolios[0].name, 'Minha');
  mem[Store.STORAGE_KEY] = '{quebrado';
  assert.equal(Store.load(storage).portfolios[0].classes.length, 9);
});
