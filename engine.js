// Double-board PLO bomb pot engine: antes, pot-limit betting, two boards,
// Omaha hand evaluation and side pots split between the boards.
// All money values are integer cents.
(function (global) {
  const RANKS = '23456789TJQKA';
  const PLURAL = { 2: 'Deuces', 3: 'Treys', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
  const SINGULAR = { 2: 'Deuce', 3: 'Trey', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  const STREETS = ['Bomb', 'Flop', 'Turn', 'River'];

  function money(cents, cur) {
    const v = cents / 100;
    const s = Number.isInteger(v) ? String(v) : v.toFixed(2);
    return (cur || '') + s;
  }

  // ---------- Hand evaluation ----------
  const rankVal = (c) => RANKS.indexOf(c[0]) + 2;

  function eval5(cs) {
    const v = cs.map(rankVal).sort((a, b) => b - a);
    const flush = cs.every((c) => c[1] === cs[0][1]);
    const counts = {};
    v.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
    const groups = Object.entries(counts)
      .map(([r, c]) => [c, +r])
      .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    let straightHigh = 0;
    if (groups.length === 5) {
      if (v[0] - v[4] === 4) straightHigh = v[0];
      else if (v[0] === 14 && v[1] === 5) straightHigh = 5;
    }
    const ranks = groups.map((g) => g[1]);
    if (straightHigh && flush) return [8, straightHigh];
    if (groups[0][0] === 4) return [7, ...ranks];
    if (groups[0][0] === 3 && groups[1][0] === 2) return [6, ...ranks];
    if (flush) return [5, ...ranks];
    if (straightHigh) return [4, straightHigh];
    if (groups[0][0] === 3) return [3, ...ranks];
    if (groups[0][0] === 2 && groups[1][0] === 2) return [2, ...ranks];
    if (groups[0][0] === 2) return [1, ...ranks];
    return [0, ...ranks];
  }

  function cmpScore(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function describe(s) {
    switch (s[0]) {
      case 8: return s[1] === 14 ? 'Royal Flush' : `Straight Flush, ${SINGULAR[s[1]]} high`;
      case 7: return `Four of a Kind, ${PLURAL[s[1]]}`;
      case 6: return `Full House, ${PLURAL[s[1]]} full of ${PLURAL[s[2]]}`;
      case 5: return `Flush, ${SINGULAR[s[1]]} high`;
      case 4: return `Straight, ${SINGULAR[s[1]]} high`;
      case 3: return `Three of a Kind, ${PLURAL[s[1]]}`;
      case 2: return `Two Pair, ${PLURAL[s[1]]} and ${PLURAL[s[2]]}`;
      case 1: return `Pair of ${PLURAL[s[1]]}`;
      default: return `High Card, ${SINGULAR[s[1]]}`;
    }
  }

  function combos(arr, k) {
    const out = [];
    const rec = (start, pick) => {
      if (pick.length === k) { out.push(pick.slice()); return; }
      for (let i = start; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop(); }
    };
    rec(0, []);
    return out;
  }

  // Omaha: exactly two hole cards and three board cards.
  function omahaBest(hole, board) {
    let best = null;
    let bestCards = null;
    const boardCombos = combos(board, 3);
    combos(hole, 2).forEach((h) => {
      boardCombos.forEach((b) => {
        const five = [...h, ...b];
        const s = eval5(five);
        if (!best || cmpScore(s, best) > 0) { best = s; bestCards = five; }
      });
    });
    return { score: best, desc: describe(best), cards: bestCards };
  }

  // Splits amt between k winners in multiples of `unit`; earlier winners get odd chips.
  function splitAmount(amt, k, unit) {
    const each = Math.floor(amt / k / unit) * unit;
    const out = new Array(k).fill(each);
    let rem = amt - each * k;
    for (let i = 0; rem > 0; i = (i + 1) % k) {
      const chip = Math.min(unit, rem);
      out[i] += chip;
      rem -= chip;
    }
    return out;
  }

  // ---------- Simulation ----------
  // setup: { players:[{name, stack, cards}], button, ante, minBet, chip, holeCount, currency }
  // events: {t:'board', b1:[...], b2:[...]} | {t:'act', kind:'fold'|'check'|'call'|'raise', to} | {t:'show', cards}
  function simulate(setup, events) {
    const n = setup.players.length;
    const btn = setup.button;
    const fmt = (c) => money(c, setup.currency);
    const P = setup.players.map((p, i) => ({
      i, name: p.name, start: p.stack, stack: p.stack, street: 0, total: 0,
      folded: false, allIn: false, acted: false,
      cards: p.cards && p.cards.length === setup.holeCount ? p.cards.slice() : null,
      hands: null,
    }));
    const st = {
      P, n, btn, boards: [[], []], street: 0, currentBet: 0, lastRaise: setup.minBet,
      ptr: 0, phase: 'board', runout: false, done: false, showdown: false,
      log: [], streetPot: [], pots: [], winnings: new Array(n).fill(0), need: null,
    };
    const L = (street, text) => st.log.push({ street, text });
    const sumTotals = () => P.reduce((a, p) => a + p.total, 0);
    st.pot = sumTotals;
    const put = (p, a) => {
      a = Math.max(0, Math.min(a, p.stack));
      p.stack -= a; p.street += a; p.total += a;
      if (p.stack === 0) p.allIn = true;
      return a;
    };
    const allInTag = (p) => (p.allIn ? ' (all-in)' : '');

    P.forEach((p) => {
      const a = put(p, setup.ante);
      L(0, `${p.name} posts bomb ${fmt(a)}${allInTag(p)}`);
    });
    P.forEach((p) => (p.street = 0));
    st.streetPot[0] = sumTotals();
    st.runout = P.filter((p) => !p.allIn).length <= 1;

    function findActor() {
      const able = P.filter((p) => !p.folded && !p.allIn);
      for (let k = 0; k < n; k++) {
        const p = P[(st.ptr + k) % n];
        if (p.folded || p.allIn) continue;
        if (p.acted && p.street >= st.currentBet) continue;
        if (able.length === 1 && p.street >= st.currentBet) continue;
        return p.i;
      }
      return -1;
    }

    function closeRound() {
      const sorted = [...P].sort((a, b) => b.street - a.street);
      if (sorted[0].street > sorted[1].street) {
        const p = sorted[0];
        const d = p.street - sorted[1].street;
        p.street -= d; p.total -= d; p.stack += d;
        if (p.stack > 0) p.allIn = false;
        L(st.street, `Uncalled ${fmt(d)} returned to ${p.name}`);
      }
      const live = P.filter((p) => !p.folded);
      if (live.length === 1) return finishUncontested(live[0]);
      if (st.street === 3) { st.phase = 'show'; return; }
      if (live.filter((p) => !p.allIn).length <= 1) st.runout = true;
      st.phase = 'board';
    }

    function finishUncontested(w) {
      const total = sumTotals();
      st.winnings[w.i] = total;
      st.pots = [{ name: 'Pot', amt: total, elig: [w.i], uncontested: true, boards: null }];
      L(st.street, `${w.name} wins ${fmt(total)} uncontested`);
      st.done = true;
    }

    function deal(b1, b2) {
      st.street++;
      P.forEach((p) => { p.street = 0; p.acted = false; });
      st.currentBet = 0;
      st.lastRaise = setup.minBet;
      st.boards[0].push(...b1);
      st.boards[1].push(...b2);
      st.streetPot[st.street] = sumTotals();
      L(st.street, `Board 1 [${st.boards[0].join(' ')}] · Board 2 [${st.boards[1].join(' ')}]`);
      if (st.runout) st.phase = st.street < 3 ? 'board' : 'show';
      else { st.phase = 'bet'; st.ptr = (btn + 1) % n; }
    }

    function act(i, ev) {
      const p = P[i];
      p.acted = true;
      let kind = ev.kind;
      if (kind === 'raise' && Math.min(ev.to, p.street + p.stack) <= st.currentBet) kind = 'call';
      if (kind === 'fold') {
        p.folded = true;
        L(st.street, `${p.name} folds`);
      } else if (kind === 'check') {
        L(st.street, `${p.name} checks`);
      } else if (kind === 'call') {
        const a = put(p, st.currentBet - p.street);
        L(st.street, `${p.name} calls ${fmt(a)}${allInTag(p)}`);
      } else {
        const to = Math.min(ev.to, p.street + p.stack);
        const prev = st.currentBet;
        put(p, to - p.street);
        L(st.street, prev === 0 ? `${p.name} bets ${fmt(to)}${allInTag(p)}` : `${p.name} raises to ${fmt(to)}${allInTag(p)}`);
        if (to - prev >= st.lastRaise) st.lastRaise = to - prev;
        P.forEach((q) => { if (q !== p) q.acted = false; });
        st.currentBet = to;
      }
      st.ptr = (i + 1) % n;
    }

    function resolveShowdown() {
      st.showdown = true;
      const live = P.filter((p) => !p.folded);
      live.forEach((p) => (p.hands = [omahaBest(p.cards, st.boards[0]), omahaBest(p.cards, st.boards[1])]));
      const rem = P.map((p) => p.total);
      const pots = [];
      for (;;) {
        const lv = live.filter((p) => rem[p.i] > 0);
        if (!lv.length) break;
        const m = Math.min(...lv.map((p) => rem[p.i]));
        let amt = 0;
        P.forEach((q) => { const t = Math.min(rem[q.i], m); amt += t; rem[q.i] -= t; });
        pots.push({ amt, elig: lv.map((p) => p.i) });
      }
      const left = rem.reduce((a, b) => a + b, 0);
      if (left && pots.length) pots[pots.length - 1].amt += left;

      const order = (i) => (i - btn - 1 + n) % n;
      pots.forEach((pot, k) => {
        pot.name = k === 0 ? 'Main pot' : `Side pot ${k}`;
        if (pot.elig.length === 1) {
          pot.uncontested = true;
          pot.boards = null;
          st.winnings[pot.elig[0]] += pot.amt;
          return;
        }
        const half2 = Math.floor(pot.amt / 2 / setup.chip) * setup.chip;
        const halves = [pot.amt - half2, half2];
        pot.boards = halves.map((amt, b) => {
          let best = null;
          let ws = [];
          pot.elig.forEach((i) => {
            const s = P[i].hands[b].score;
            const c = best ? cmpScore(s, best) : 1;
            if (c > 0) { best = s; ws = [i]; } else if (c === 0) ws.push(i);
          });
          ws.sort((a, z) => order(a) - order(z));
          const shares = splitAmount(amt, ws.length, setup.chip);
          const winners = ws.map((i, j) => ({ i, amt: shares[j] }));
          winners.forEach((w) => (st.winnings[w.i] += w.amt));
          return { amt, winners, desc: P[ws[0]].hands[b].desc };
        });
      });
      st.pots = pots;
      st.done = true;
    }

    function step() {
      if (st.done) return { type: 'done' };
      if (st.phase === 'bet') {
        if (P.filter((p) => !p.folded).length === 1) { closeRound(); return null; }
        const a = findActor();
        if (a < 0) { closeRound(); return null; }
        const p = P[a];
        const pot = sumTotals();
        const toCall = Math.min(st.currentBet - p.street, p.stack);
        const allInTo = p.street + p.stack;
        const potTo = st.currentBet + pot + (st.currentBet - p.street);
        const maxTo = Math.min(allInTo, potTo);
        const minRaiseTo = st.currentBet === 0 ? setup.minBet : st.currentBet + st.lastRaise;
        return {
          type: 'act', i: a, toCall, canCheck: toCall === 0, pot,
          minTo: Math.min(minRaiseTo, maxTo), maxTo, currentBet: st.currentBet,
          isBet: st.currentBet === 0,
          canRaise: maxTo > st.currentBet && P.some((q) => q !== p && !q.folded && !q.allIn),
        };
      }
      if (st.phase === 'board') return { type: 'board', street: st.street + 1, count: st.street === 0 ? 3 : 1 };
      if (st.phase === 'show') {
        const p = P.find((q) => !q.folded && !q.cards);
        if (p) return { type: 'show', i: p.i };
        st.phase = 'showdown';
        return null;
      }
      if (st.phase === 'showdown') { resolveShowdown(); return null; }
      return { type: 'done' };
    }

    function nextNeed() {
      for (let g = 0; g < 1000; g++) {
        const need = step();
        if (need) return need;
      }
      throw new Error('Engine did not settle');
    }

    let ei = 0;
    for (;;) {
      const need = nextNeed();
      st.need = need;
      if (need.type === 'done' || ei >= events.length) break;
      const ev = events[ei++];
      if (need.type === 'act' && ev.t === 'act') act(need.i, ev);
      else if (need.type === 'board' && ev.t === 'board') deal(ev.b1.slice(0, need.count), ev.b2.slice(0, need.count));
      else if (need.type === 'show' && ev.t === 'show') P[need.i].cards = ev.cards.slice();
    }
    st.consumed = ei;
    st.results = P.map((p) => ({
      invested: p.total, won: st.winnings[p.i], net: st.winnings[p.i] - p.total, final: p.stack + st.winnings[p.i],
    }));
    return st;
  }

  global.BombEngine = { simulate, money, omahaBest, splitAmount, STREETS };
})(window);
