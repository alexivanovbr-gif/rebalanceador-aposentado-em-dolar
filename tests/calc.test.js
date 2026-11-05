'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');

const close = (actual, expected, msg, tol = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg || ''} esperado ${expected}, obtido ${actual}`);
};

const sum = (list) => list.reduce((s, v) => s + v, 0);

// Ativo BRL fracionário, cujo preço 1 faz a posição ser igual às cotas.
const cash = (id, value, ideal = 100, extra = {}) => ({
  id, ticker: id, type: 'Renda Fixa', currency: 'BRL', shares: value, price: 1, ideal, fraction: true, ...extra
});

const cls = (id, ideal, position, extra = {}) => ({
  id, name: id, color: '#000000', ideal, assets: [cash(id + '-a', position)], ...extra
});

const byId = (result, id) => result.classes.find((c) => c.id === id);

test('soma dos Disponíveis é igual ao aporte', () => {
  const pf = {
    fx: 5, aporte: 1000,
    classes: [cls('A', 50, 900), cls('B', 30, 100), cls('C', 20, 0)]
  };
  const r = Calc.compute(pf);
  close(sum(r.classes.map((c) => c.available)), 1000, 'soma');
  // Patrimônio após aporte = 2000. Alvos 1000, 600, 400.
  close(byId(r, 'A').available, 100);
  close(byId(r, 'B').available, 500);
  close(byId(r, 'C').available, 400);
  close(r.totalAfter, 2000);
  close(r.used, 1000);
  close(r.balance, 0);
});

test('classe acima da meta fica com zero e as demais são reduzidas proporcionalmente', () => {
  const pf = {
    fx: 5, aporte: 400,
    classes: [cls('A', 50, 1500), cls('B', 30, 100), cls('C', 20, 0)]
  };
  const r = Calc.compute(pf);
  // Após aporte 2000: alvos 1000, 600, 400. Brutos: -500, 500, 400.
  // Positivos somam 900, fator 400/900.
  close(byId(r, 'A').available, 0);
  close(byId(r, 'B').available, 500 * 400 / 900);
  close(byId(r, 'C').available, 400 * 400 / 900);
  close(sum(r.classes.map((c) => c.available)), 400, 'soma');
  r.classes.forEach((c) => {
    assert.ok(c.available >= 0, 'nunca sugere venda');
    c.assets.forEach((a) => assert.ok(a.value >= 0 && a.sharesToBuy >= 0, 'nunca sugere venda no ativo'));
  });
});

test('classe ignorada fica fora do cálculo e o % ideal é normalizado entre as demais', () => {
  const pf = {
    fx: 5, aporte: 1000,
    classes: [cls('A', 50, 1000, { ignored: true }), cls('B', 25, 0), cls('C', 25, 0)]
  };
  const r = Calc.compute(pf);
  close(byId(r, 'A').available, 0);
  close(byId(r, 'A').used, 0);
  close(byId(r, 'B').available, 500);
  close(byId(r, 'C').available, 500);
  close(r.totalAfter, 1000, 'patrimônio após aporte exclui a classe ignorada');
  // Ignorar não muda o % atual, que considera o patrimônio total.
  close(byId(r, 'A').currentPct, 1);
});

test('ativo ignorado não recebe aporte', () => {
  const pf = {
    fx: 5, aporte: 100,
    classes: [{
      id: 'X', ideal: 100, assets: [
        cash('x1', 0, 50, { ignored: true }),
        cash('x2', 0, 50)
      ]
    }]
  };
  const r = Calc.compute(pf);
  close(r.classes[0].assets[0].value, 0);
  close(r.classes[0].assets[1].value, 100);
});

test('ativo de cota inteira gera saldo na classe', () => {
  const pf = {
    fx: 5, aporte: 100,
    classes: [{
      id: 'X', ideal: 100,
      assets: [{ id: 'a', currency: 'BRL', shares: 0, price: 30, ideal: 100, fraction: false }]
    }]
  };
  const r = Calc.compute(pf);
  const c = r.classes[0];
  close(c.available, 100);
  assert.equal(c.assets[0].sharesToBuy, 3);
  close(c.assets[0].value, 90);
  close(c.used, 90);
  close(c.balance, 10, 'saldo da classe');
  close(r.balance, 10, 'saldo global');
  close(r.used + r.balance, r.aporte);
});

test('sobra de cota inteira é reaproveitada em outro ativo da classe que caiba nela', () => {
  const pf = {
    fx: 5, aporte: 100,
    classes: [{
      id: 'X', ideal: 100, assets: [
        { id: 'a', currency: 'BRL', shares: 0, price: 30, ideal: 50, fraction: false },
        { id: 'b', currency: 'BRL', shares: 0, price: 7, ideal: 50, fraction: false }
      ]
    }]
  };
  const r = Calc.compute(pf);
  const [a, b] = r.classes[0].assets;
  // Primeira passada: A 1 cota (30), B 7 cotas (49), sobra 21 reaproveitada em B (3 cotas).
  assert.equal(a.sharesToBuy, 1);
  assert.equal(b.sharesToBuy, 10);
  close(r.classes[0].used, 100);
  close(r.classes[0].balance, 0);
});

test('sobra de cota inteira vai para ativo fracionário da mesma classe', () => {
  const pf = {
    fx: 5, aporte: 100,
    classes: [{
      id: 'X', ideal: 100, assets: [
        { id: 'a', currency: 'BRL', shares: 0, price: 30, ideal: 50, fraction: false },
        { id: 'b', currency: 'BRL', shares: 0, price: 3, ideal: 50, fraction: true }
      ]
    }]
  };
  const r = Calc.compute(pf);
  const [a, b] = r.classes[0].assets;
  assert.equal(a.sharesToBuy, 1);
  close(b.value, 70);
  close(b.sharesToBuy, 70 / 3);
  close(r.classes[0].balance, 0);
});

test('sobra que não cabe em nenhum ativo permanece como saldo', () => {
  const pf = {
    fx: 5, aporte: 50,
    classes: [{
      id: 'X', ideal: 100, assets: [
        { id: 'a', currency: 'BRL', shares: 0, price: 80, ideal: 50, fraction: false },
        { id: 'b', currency: 'BRL', shares: 0, price: 60, ideal: 50, fraction: false }
      ]
    }]
  };
  const r = Calc.compute(pf);
  assert.equal(r.classes[0].assets[0].sharesToBuy, 0);
  assert.equal(r.classes[0].assets[1].sharesToBuy, 0);
  close(r.classes[0].balance, 50);
  close(r.balance, 50);
});

test('percentuais que não fecham 100% são normalizados e sinalizados', () => {
  const classes = [cls('A', 40, 0), cls('B', 40, 0)];
  const status = Calc.idealSum(classes);
  close(status.sum, 80);
  assert.equal(status.ok, false);
  assert.equal(Calc.idealSum([{ ideal: 60 }, { ideal: 40 }]).ok, true);
  assert.equal(Calc.idealSum([{ ideal: 60 }, { ideal: 45 }]).ok, false);

  const r = Calc.compute({ fx: 5, aporte: 1000, classes });
  assert.equal(r.classIdeal.ok, false);
  close(byId(r, 'A').available, 500);
  close(byId(r, 'B').available, 500);
  close(sum(r.classes.map((c) => c.available)), 1000);

  // Ativos dentro da classe com soma de 150%.
  const r2 = Calc.compute({
    fx: 5, aporte: 300, classes: [{
      id: 'X', ideal: 100, assets: [cash('a', 0, 100), cash('b', 0, 50)]
    }]
  });
  assert.equal(r2.classes[0].assetIdeal.ok, false);
  close(r2.classes[0].assets[0].value, 200);
  close(r2.classes[0].assets[1].value, 100);
});

test('moedas misturadas: posições em USD são convertidas para BRL', () => {
  const pf = {
    fx: 5, aporte: 1000,
    classes: [
      {
        id: 'EUA', ideal: 50, assets: [
          { id: 'voo', currency: 'USD', shares: 2, price: 10, ideal: 100, fraction: false }
        ]
      },
      {
        id: 'BR', ideal: 50, assets: [
          { id: 'bova', currency: 'BRL', shares: 10, price: 10, ideal: 100, fraction: false }
        ]
      }
    ]
  };
  const r = Calc.compute(pf);
  const eua = byId(r, 'EUA');
  const br = byId(r, 'BR');
  close(eua.assets[0].priceBRL, 50);
  close(eua.position, 100, 'USD 20 x 5');
  close(br.position, 100);
  close(r.total, 200);
  close(eua.currentPct, 0.5);
  // Após aporte 1200: alvo 600 cada, disponível 500 cada.
  close(eua.available, 500);
  close(br.available, 500);
  assert.equal(eua.assets[0].sharesToBuy, 10, 'cotas calculadas pelo preço em BRL');
  close(eua.assets[0].value, 500);
  assert.equal(br.assets[0].sharesToBuy, 50);
});

test('cálculos do item 6: posição do ativo e % atual na classe', () => {
  const c = {
    id: 'X', ideal: 100, assets: [
      { id: 'a', currency: 'BRL', shares: 3, price: 25, ideal: 50 },
      { id: 'b', currency: 'USD', shares: 1.5, price: 10, ideal: 50 },
      { id: 'c', currency: 'BRL', shares: 0, price: 99, ideal: 0 }
    ]
  };
  close(Calc.assetPosition(c.assets[0], 5), 75);
  close(Calc.assetPosition(c.assets[1], 5), 75);
  close(Calc.assetPosition(c.assets[2], 5), 0);
  close(Calc.classPosition(c, 5), 150);

  const r = Calc.compute({ fx: 5, aporte: 0, classes: [c] });
  const [a, b, z] = r.classes[0].assets;
  close(a.position, 75);
  close(a.currentPct, 0.5);
  close(b.currentPct, 0.5);
  close(z.currentPct, 0);
  close(sum(r.classes[0].assets.map((x) => x.currentPct)), 1);
});

test('classe vazia tem % atual zero sem divisão por zero', () => {
  const r = Calc.compute({ fx: 5, aporte: 0, classes: [{ id: 'X', ideal: 100, assets: [] }] });
  close(r.classes[0].currentPct, 0);
  close(r.total, 0);
});

test('com aporte zero todas as sugestões ficam em zero', () => {
  const pf = {
    fx: 5, aporte: 0,
    classes: [cls('A', 50, 1500), cls('B', 30, 100), cls('C', 20, 0)]
  };
  const r = Calc.compute(pf);
  r.classes.forEach((c) => {
    assert.equal(c.available, 0);
    assert.equal(c.used, 0);
    c.assets.forEach((a) => {
      assert.equal(a.sharesToBuy, 0);
      assert.equal(a.value, 0);
    });
  });
  assert.equal(r.used, 0);
  assert.equal(r.balance, 0);
});

test('aporte negativo ou inválido é tratado como zero', () => {
  const r = Calc.compute({ fx: 5, aporte: -50, classes: [cls('A', 100, 10)] });
  assert.equal(r.aporte, 0);
  assert.equal(r.classes[0].available, 0);
  const r2 = Calc.compute({ fx: 5, aporte: 'abc', classes: [cls('A', 100, 10)] });
  assert.equal(r2.aporte, 0);
});

test('aceitar sugestões soma as cotas e zera o aporte', () => {
  const pf = {
    fx: 5, aporte: 100,
    classes: [{
      id: 'X', ideal: 100, assets: [
        { id: 'a', currency: 'BRL', shares: 2, price: 30, ideal: 50, fraction: false },
        { id: 'b', currency: 'BRL', shares: 0, price: 3, ideal: 50, fraction: true }
      ]
    }]
  };
  const before = JSON.stringify(pf);
  const next = Calc.acceptSuggestions(pf);
  assert.equal(JSON.stringify(pf), before, 'não altera a carteira original');
  assert.equal(next.aporte, 0);
  // Após aporte 160: alvo 80 cada. A tem 60, falta 20 (não cabe 1 cota). B recebe tudo.
  assert.equal(next.classes[0].assets[0].shares, 2);
  close(next.classes[0].assets[1].shares, 100 / 3, '', 1e-7);
  const after = Calc.compute(next);
  assert.equal(after.used, 0);
});

test('propriedade: em carteiras aleatórias, Usado + Saldo = aporte e nada é negativo', () => {
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let t = 0; t < 300; t++) {
    const classes = [];
    const nc = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < nc; i++) {
      const assets = [];
      const na = Math.floor(rnd() * 5);
      for (let j = 0; j < na; j++) {
        assets.push({
          id: `a${i}${j}`,
          currency: rnd() < 0.4 ? 'USD' : 'BRL',
          shares: Math.floor(rnd() * 100),
          price: rnd() < 0.1 ? 0 : 1 + rnd() * 500,
          ideal: Math.floor(rnd() * 60),
          fraction: rnd() < 0.5,
          ignored: rnd() < 0.1
        });
      }
      classes.push({ id: `c${i}`, ideal: Math.floor(rnd() * 50), ignored: rnd() < 0.15, assets });
    }
    const aporte = Math.floor(rnd() * 20000);
    const r = Calc.compute({ fx: 4 + rnd() * 2, aporte, classes });

    const activeCount = classes.filter((c) => !c.ignored).length;
    if (activeCount > 0 && aporte > 0) {
      close(sum(r.classes.map((c) => c.available)), aporte, `disponíveis caso ${t}`, 1e-5);
    }
    close(r.used + r.balance, aporte, `fechamento caso ${t}`, 1e-5);
    r.classes.forEach((c) => {
      assert.ok(c.available >= 0);
      assert.ok(c.balance >= -1e-6);
      close(c.used + c.balance, c.available, `classe caso ${t}`, 1e-5);
      c.assets.forEach((a) => {
        assert.ok(a.value >= 0 && a.sharesToBuy >= 0);
        if (!a.fraction) assert.ok(Number.isInteger(a.sharesToBuy), 'cota inteira');
      });
    });
  }
});

test('% com o aporte considera as compras sugeridas', () => {
  const pf = {
    fx: 5, aporte: 1000,
    classes: [
      { id: 'A', ideal: 50, assets: [cash('a1', 900, 50), cash('a2', 100, 50)] },
      { id: 'B', ideal: 50, assets: [{ id: 'b1', currency: 'BRL', shares: 0, price: 300, ideal: 100, fraction: false }] }
    ]
  };
  const r = Calc.compute(pf);
  const A = byId(r, 'A');
  const B = byId(r, 'B');
  // Após aporte 2000: A disponível 0, B disponível 1000. B compra 3 cotas (900), saldo 100.
  close(A.used, 0);
  close(B.used, 900);
  close(A.afterPct, 1000 / 1900);
  close(B.afterPct, 900 / 1900);
  close(A.afterPct + B.afterPct, 1);
  // Dentro da classe: % com o aporte usa a posição da classe após as compras.
  close(A.assets[0].afterPct, 0.9);
  close(B.assets[0].afterPct, 1);
  // Sem aporte, % com o aporte é igual ao % atual.
  const r0 = Calc.compute({ ...pf, aporte: 0 });
  r0.classes.forEach((c) => close(c.afterPct, c.currentPct));
});

test('distribute: pesos todos zero usam divisão igual', () => {
  const out = Calc.distribute([{ weight: 0, position: 0 }, { weight: 0, position: 0 }], 100);
  close(out[0], 50);
  close(out[1], 50);
});

test('pctStatus: laranja abaixo do ideal, verde no ideal ou acima', () => {
  assert.equal(Calc.pctStatus(0.10, 0.20), 'below');
  assert.equal(Calc.pctStatus(0.20, 0.20), 'ok');
  assert.equal(Calc.pctStatus(0.30, 0.20), 'ok');
  assert.equal(Calc.pctStatus(0.19999, 0.20), 'ok', 'tolerância de arredondamento');
});
