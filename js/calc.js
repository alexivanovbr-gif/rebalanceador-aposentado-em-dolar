/*
 * Motor de cálculo do rebalanceamento por aporte.
 * Funções puras, sem acesso ao DOM, usadas pelo app e pelos testes (Node).
 *
 * Regra:
 * 1. Patrimônio após aporte = posição das classes não ignoradas + aporte.
 * 2. Alvo da classe = % ideal normalizado (entre as não ignoradas) x patrimônio após aporte.
 *    Disponível = alvo menos posição atual.
 * 3. Disponíveis negativos viram zero e os demais são reduzidos proporcionalmente
 *    até a soma fechar o aporte. Nunca há sugestão de venda.
 * 4. Dentro da classe a mesma regra é aplicada aos ativos, usando o Disponível da classe.
 * 5. Ativo sem "aceita fração" compra só cotas inteiras. A sobra vai para o Saldo da
 *    classe e é reaproveitada em outros ativos da classe que caibam nela.
 * 6. Posição do ativo = cotas x preço (em BRL). % atual na classe = posição do ativo / posição da classe.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Calc = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;
  var MONEY_EPS = 1e-7;
  var MAX_REUSE_STEPS = 100000;

  function num(v) {
    var n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function pos(v) {
    var n = num(v);
    return n > 0 ? n : 0;
  }

  function sum(list) {
    var s = 0;
    for (var i = 0; i < list.length; i++) s += list[i];
    return s;
  }

  function share(part, whole) {
    return whole > EPS ? part / whole : 0;
  }

  function roundTo(v, decimals) {
    var f = Math.pow(10, decimals);
    return Math.round(v * f) / f;
  }

  /** Preço do ativo convertido para BRL. */
  function priceBRL(asset, fx) {
    var p = pos(asset.price);
    return asset.currency === 'USD' ? p * pos(fx) : p;
  }

  /** Item 6: posição do ativo = cotas x preço (em BRL). */
  function assetPosition(asset, fx) {
    return pos(asset.shares) * priceBRL(asset, fx);
  }

  /** Posição da classe = soma das posições dos ativos (em BRL). */
  function classPosition(cls, fx) {
    var assets = cls.assets || [];
    var s = 0;
    for (var i = 0; i < assets.length; i++) s += assetPosition(assets[i], fx);
    return s;
  }

  /** Soma dos % ideais e se ela fecha 100%. */
  function idealSum(items) {
    var s = sum((items || []).map(function (it) { return pos(it.ideal); }));
    return { sum: s, ok: Math.abs(s - 100) < 0.005 };
  }

  /**
   * Situação do % atual frente ao % ideal (ambos em fração, 0 a 1).
   * 'below' = abaixo do ideal (precisa de aporte), 'ok' = no ideal ou acima.
   * Tolerância de 0,05 ponto percentual para evitar ruído de arredondamento.
   */
  function pctStatus(currentFrac, idealFrac) {
    return num(currentFrac) + 0.0005 < num(idealFrac) ? 'below' : 'ok';
  }

  /**
   * Itens 1 a 3: distribui `amount` entre itens {weight, position}.
   * Retorna o Disponível de cada item, nunca negativo, somando exatamente `amount`.
   * Se todos os pesos forem zero, usa pesos iguais.
   */
  function distribute(items, amount) {
    var n = items.length;
    var out = [];
    for (var k = 0; k < n; k++) out.push(0);
    var a = num(amount);
    if (n === 0 || a <= EPS) return out;

    var weights = items.map(function (it) { return pos(it.weight); });
    var wsum = sum(weights);
    if (wsum <= EPS) {
      weights = weights.map(function () { return 1; });
      wsum = n;
    }
    var positions = items.map(function (it) { return pos(it.position); });
    var after = sum(positions) + a;

    var raw = weights.map(function (w, i) { return (w / wsum) * after - positions[i]; });
    var positive = raw.map(function (v) { return v > 0 ? v : 0; });
    var psum = sum(positive);
    if (psum <= EPS) return out;
    var factor = a / psum;
    return positive.map(function (v) { return v * factor; });
  }

  /**
   * Itens 4 e 5: distribui o Disponível da classe entre seus ativos.
   */
  function allocateAssets(cls, amount, fx) {
    var assets = cls.assets || [];
    var positions = assets.map(function (a) { return assetPosition(a, fx); });
    var prices = assets.map(function (a) { return priceBRL(a, fx); });
    var clsPos = sum(positions);

    var results = assets.map(function (a, i) {
      return {
        id: a.id,
        priceBRL: prices[i],
        position: positions[i],
        currentPct: share(positions[i], clsPos),
        idealPct: pos(a.ideal) / 100,
        ignored: !!a.ignored,
        fraction: !!a.fraction,
        target: 0,
        sharesToBuy: 0,
        value: 0
      };
    });

    var available = pos(amount);
    // Ativos sem preço não podem receber aporte.
    var eligible = [];
    assets.forEach(function (a, i) {
      if (!a.ignored && prices[i] > EPS) eligible.push(i);
    });

    if (available <= EPS || eligible.length === 0) {
      return { assets: results, used: 0, balance: available };
    }

    var alloc = distribute(eligible.map(function (i) {
      return { weight: assets[i].ideal, position: positions[i] };
    }), available);

    // Primeira passada: cotas inteiras ou fracionárias.
    eligible.forEach(function (i, k) {
      var r = results[i];
      var target = alloc[k];
      r.target = target;
      if (assets[i].fraction) {
        r.value = target;
        r.sharesToBuy = target / prices[i];
      } else {
        var q = Math.floor(target / prices[i] + EPS);
        r.sharesToBuy = q;
        r.value = q * prices[i];
      }
    });

    var leftover = available - sum(results.map(function (r) { return r.value; }));

    // Reaproveitamento da sobra (item 5), pelo ativo mais distante da meta que caiba na sobra.
    var weights = eligible.map(function (i) { return pos(assets[i].ideal); });
    var wsum = sum(weights);
    if (wsum <= EPS) {
      weights = weights.map(function () { return 1; });
      wsum = weights.length;
    }
    var eligiblePos = sum(eligible.map(function (i) { return positions[i]; }));
    var afterClass = eligiblePos + available;

    var steps = 0;
    while (leftover > MONEY_EPS && steps < MAX_REUSE_STEPS) {
      steps++;
      var best = -1;
      var bestGap = -Infinity;
      for (var k2 = 0; k2 < eligible.length; k2++) {
        if (weights[k2] <= EPS) continue;
        var i2 = eligible[k2];
        var fits = assets[i2].fraction || prices[i2] <= leftover + MONEY_EPS;
        if (!fits) continue;
        var gap = (weights[k2] / wsum) * afterClass - (positions[i2] + results[i2].value);
        if (gap > bestGap + EPS) {
          bestGap = gap;
          best = i2;
        }
      }
      if (best < 0) break;
      var rb = results[best];
      if (assets[best].fraction) {
        rb.value += leftover;
        rb.sharesToBuy = rb.value / prices[best];
        leftover = 0;
      } else {
        rb.sharesToBuy += 1;
        rb.value = rb.sharesToBuy * prices[best];
        leftover -= prices[best];
      }
    }

    if (Math.abs(leftover) < MONEY_EPS) leftover = 0;
    var used = sum(results.map(function (r) { return r.value; }));
    return { assets: results, used: used, balance: leftover };
  }

  /**
   * Calcula a carteira inteira: posições, percentuais e sugestões do aporte.
   */
  function compute(portfolio) {
    var fx = pos(portfolio.fx);
    var aporte = pos(portfolio.aporte);
    var classes = portfolio.classes || [];

    var classPos = classes.map(function (c) { return classPosition(c, fx); });
    var total = sum(classPos);

    var active = [];
    classes.forEach(function (c, i) { if (!c.ignored) active.push(i); });

    var avail = distribute(active.map(function (i) {
      return { weight: classes[i].ideal, position: classPos[i] };
    }), aporte);

    var availByIndex = classes.map(function () { return 0; });
    active.forEach(function (i, k) { availByIndex[i] = avail[k]; });

    var activePos = sum(active.map(function (i) { return classPos[i]; }));

    var classResults = classes.map(function (c, i) {
      var alloc = allocateAssets(c, availByIndex[i], fx);
      return {
        id: c.id,
        position: classPos[i],
        currentPct: share(classPos[i], total),
        idealPct: pos(c.ideal) / 100,
        ignored: !!c.ignored,
        available: availByIndex[i],
        used: alloc.used,
        balance: alloc.balance,
        assets: alloc.assets,
        assetIdeal: idealSum(c.assets)
      };
    });

    var used = sum(classResults.map(function (c) { return c.used; }));
    var balance = aporte - used;
    if (Math.abs(balance) < MONEY_EPS) balance = 0;

    return {
      fx: fx,
      aporte: aporte,
      total: total,
      totalAfter: activePos + aporte,
      used: used,
      balance: balance,
      classIdeal: idealSum(classes),
      classes: classResults
    };
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Item 7: soma as cotas sugeridas às cotas de cada ativo e zera o aporte.
   * Retorna uma nova carteira, sem alterar a original.
   */
  function acceptSuggestions(portfolio) {
    var result = compute(portfolio);
    var next = clone(portfolio);
    (next.classes || []).forEach(function (c, ci) {
      (c.assets || []).forEach(function (a, ai) {
        var add = result.classes[ci].assets[ai].sharesToBuy;
        if (add > 0) a.shares = roundTo(pos(a.shares) + add, 8);
      });
    });
    next.aporte = 0;
    return next;
  }

  return {
    num: num,
    priceBRL: priceBRL,
    assetPosition: assetPosition,
    classPosition: classPosition,
    idealSum: idealSum,
    pctStatus: pctStatus,
    distribute: distribute,
    allocateAssets: allocateAssets,
    compute: compute,
    acceptSuggestions: acceptSuggestions
  };
});
