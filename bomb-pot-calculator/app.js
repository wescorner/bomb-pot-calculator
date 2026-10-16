(function () {
  const STORE_KEY = 'bomb-pot-calc-v1';
  const RANK_ORDER = 'AKQJT98765432';
  const SUITS = ['s', 'h', 'd', 'c'];
  const SUIT_SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const STEP_NAMES = ['Game', 'Players', 'Hand', 'Payouts'];
  const STREET_NAMES = BombEngine.STREETS;

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toCents = (v) => Math.round(parseFloat(v) * 100) || 0;
  const fromCents = (c) => String(c / 100);
  const byRank = (a, b) => RANK_ORDER.indexOf(a[0]) - RANK_ORDER.indexOf(b[0]);

  function defaultState() {
    return {
      step: 1,
      cfg: { n: 6, holeCount: 4, ante: '5', minBet: '5', chip: '1', currency: '$' },
      players: [],
      button: 0,
      events: [],
    };
  }

  let S;
  try { S = JSON.parse(localStorage.getItem(STORE_KEY)) || defaultState(); } catch { S = defaultState(); }
  const save = () => localStorage.setItem(STORE_KEY, JSON.stringify(S));

  function syncPlayers() {
    while (S.players.length < S.cfg.n) S.players.push({ name: '', stack: '200', cards: [] });
    S.players.length = S.cfg.n;
    S.players.forEach((p) => { if (p.cards.length > S.cfg.holeCount) p.cards = []; });
    if (S.button >= S.cfg.n) S.button = 0;
  }

  const playerName = (p, i) => p.name.trim() || `Player ${i + 1}`;

  function buildSetup() {
    return {
      players: S.players.map((p, i) => ({ name: playerName(p, i), stack: toCents(p.stack), cards: p.cards })),
      button: S.button,
      ante: toCents(S.cfg.ante),
      minBet: toCents(S.cfg.minBet) || toCents(S.cfg.ante),
      chip: toCents(S.cfg.chip) || 1,
      holeCount: S.cfg.holeCount,
      currency: S.cfg.currency,
    };
  }

  function resetHand() {
    S.events = [];
    S.players.forEach((p) => (p.cards = []));
  }

  // ---------- Cards ----------
  function cardHtml(c, cls = '') {
    if (!c) return `<span class="mini-card empty ${cls}"></span>`;
    const r = c[0] === 'T' ? '10' : c[0];
    return `<span class="mini-card suit-${c[1]} ${cls}"><span>${r}</span><span class="s">${SUIT_SYM[c[1]]}</span></span>`;
  }
  const cardsHtml = (cards, count, cls = '') => Array.from({ length: count }, (_, k) => cardHtml(cards[k], cls)).join('');

  let pickerState = null;
  function openPicker(count, title, used, cb) {
    pickerState = { count, used: new Set(used), sel: [], cb };
    $('#pickerTitle').textContent = title;
    $('#picker').classList.remove('hidden');
    drawPicker();
  }
  function closePicker() {
    pickerState = null;
    $('#picker').classList.add('hidden');
  }
  function drawPicker() {
    const ps = pickerState;
    $('#pickerSelected').innerHTML = cardsHtml(ps.sel, ps.count) + `<span class="muted">${ps.sel.length}/${ps.count} selected</span>`;
    let html = '';
    SUITS.forEach((s) => {
      RANK_ORDER.split('').forEach((r) => {
        const c = r + s;
        const dis = ps.used.has(c) ? 'disabled' : '';
        const on = ps.sel.includes(c) ? 'sel' : '';
        html += `<button class="pc suit-${s} ${on}" data-card="${c}" ${dis}>${r === 'T' ? '10' : r}<br>${SUIT_SYM[s]}</button>`;
      });
    });
    $('#pickerGrid').innerHTML = html;
  }
  $('#pickerGrid').addEventListener('click', (e) => {
    const b = e.target.closest('.pc');
    if (!b || b.disabled || !pickerState) return;
    const ps = pickerState;
    const c = b.dataset.card;
    const k = ps.sel.indexOf(c);
    if (k >= 0) ps.sel.splice(k, 1);
    else if (ps.sel.length < ps.count) ps.sel.push(c);
    drawPicker();
    if (ps.sel.length === ps.count) {
      const { cb, sel } = ps;
      setTimeout(() => { closePicker(); cb(sel.slice()); }, 150);
    }
  });
  $('#pickerClose').onclick = closePicker;
  $('#picker').addEventListener('click', (e) => { if (e.target.id === 'picker') closePicker(); });

  // ---------- Views ----------
  function renderSteps() {
    $('#steps').innerHTML = STEP_NAMES.map((n, k) => {
      const cls = k + 1 === S.step ? 'on' : k + 1 < S.step ? 'done' : '';
      return `<li class="${cls}" data-step="${k + 1}">${k + 1}. ${n}</li>`;
    }).join('');
  }
  $('#steps').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-step]');
    if (!li || +li.dataset.step >= S.step) return;
    S.step = +li.dataset.step;
    render();
  });

  function render() {
    save();
    renderSteps();
    ({ 1: viewGame, 2: viewPlayers, 3: viewHand, 4: viewPayouts })[S.step]();
  }

  function viewGame() {
    const c = S.cfg;
    const opt = (vals, cur) => vals.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('');
    $('#app').innerHTML = `
      <div class="card">
        <h2>Bomb pot setup</h2>
        <p class="muted">Double-board Pot-Limit Omaha. Everyone antes the bomb amount, two boards are dealt, and every pot is split in half between Board 1 and Board 2.</p>
        <div class="form-grid">
          <label class="field">Number of players<select id="g-n">${opt(Array.from({ length: 9 }, (_, k) => [k + 2, `${k + 2} players`]), c.n)}</select></label>
          <label class="field">Game<select id="g-hole">${opt([[4, 'PLO (4 cards)'], [5, 'PLO5 (5 cards)'], [6, 'PLO6 (6 cards)']], c.holeCount)}</select></label>
          <label class="field">Currency<select id="g-cur">${opt([['$', '$ Dollars'], ['€', '€ Euros'], ['£', '£ Pounds'], ['', 'Chips (no symbol)']], c.currency)}</select></label>
          <label class="field">Bomb ante (per player)<input id="g-ante" type="number" min="0" step="any" value="${esc(c.ante)}"></label>
          <label class="field">Minimum bet<input id="g-min" type="number" min="0" step="any" value="${esc(c.minBet)}"></label>
          <label class="field">Smallest chip (for odd-chip splits)<input id="g-chip" type="number" min="0" step="any" value="${esc(c.chip)}"></label>
        </div>
        <div class="error" id="err"></div>
        <div class="row end"><button class="primary" id="next">Next: players →</button></div>
      </div>`;
    $('#next').onclick = () => {
      const cfg = {
        n: +$('#g-n').value, holeCount: +$('#g-hole').value, currency: $('#g-cur').value,
        ante: $('#g-ante').value, minBet: $('#g-min').value, chip: $('#g-chip').value,
      };
      let err = '';
      if (toCents(cfg.ante) <= 0) err = 'The bomb ante must be greater than zero.';
      else if (toCents(cfg.chip) <= 0) err = 'Smallest chip must be greater than zero.';
      else if (cfg.n * cfg.holeCount + 10 > 52) err = `Not enough cards: ${cfg.n} players × ${cfg.holeCount} cards plus two boards needs ${cfg.n * cfg.holeCount + 10} cards.`;
      if (err) { $('#err').textContent = err; return; }
      if (cfg.holeCount !== S.cfg.holeCount) S.players.forEach((p) => (p.cards = []));
      S.cfg = cfg;
      syncPlayers();
      S.step = 2;
      render();
    };
  }

  function setupCardsUsed(exceptIndex) {
    const used = [];
    S.players.forEach((p, i) => { if (i !== exceptIndex) used.push(...p.cards); });
    return used;
  }

  function viewPlayers() {
    syncPlayers();
    const hc = S.cfg.holeCount;
    const rows = S.players.map((p, i) => `<tr>
        <td>${i + 1}</td>
        <td><input type="text" data-name="${i}" placeholder="Player ${i + 1}" value="${esc(p.name)}"></td>
        <td><input type="number" min="0" step="any" data-stack="${i}" value="${esc(p.stack)}"></td>
        <td><input type="radio" name="btn" data-btn="${i}" ${i === S.button ? 'checked' : ''}></td>
        <td class="hole">${cardsHtml(p.cards, hc, 'sm')}
          <button class="sm" data-pick="${i}">${p.cards.length ? 'Change' : 'Pick'}</button>
          ${p.cards.length ? `<button class="sm ghost" data-clear="${i}">✕</button>` : ''}</td>
      </tr>`).join('');
    $('#app').innerHTML = `
      <div class="card">
        <h2>Players, stacks &amp; hole cards</h2>
        <p class="muted">Seats go clockwise from seat 1. Action on each street starts left of the button. Hole cards are optional here; you'll be asked for any missing cards at showdown.</p>
        <table class="players">
          <thead><tr><th>Seat</th><th>Name</th><th>Stack (${esc(S.cfg.currency || 'chips')})</th><th>Button</th><th>Hole cards</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="row" style="margin-top:12px">
          <button class="sm" id="allStacks">Set all stacks to…</button>
        </div>
        <div class="error" id="err"></div>
        <div class="row end">
          <button id="back">← Back</button>
          ${S.events.length ? `
          <span class="muted">A hand is in progress (${S.events.length} steps recorded).</span>
          <button class="danger" id="reset">Reset hand</button>
          <button class="primary" id="next">Resume hand →</button>` : `
          <button class="primary" id="next">Start bomb pot →</button>`}
        </div>
      </div>`;
    document.querySelectorAll('[data-name]').forEach((el) => (el.oninput = () => { S.players[+el.dataset.name].name = el.value; save(); }));
    document.querySelectorAll('[data-stack]').forEach((el) => (el.oninput = () => { S.players[+el.dataset.stack].stack = el.value; save(); }));
    document.querySelectorAll('[data-btn]').forEach((el) => (el.onchange = () => { S.button = +el.dataset.btn; render(); }));
    document.querySelectorAll('[data-pick]').forEach((el) => (el.onclick = () => {
      const i = +el.dataset.pick;
      openPicker(hc, `${playerName(S.players[i], i)}'s hole cards`, setupCardsUsed(i), (cards) => {
        S.players[i].cards = cards.sort(byRank);
        render();
      });
    }));
    document.querySelectorAll('[data-clear]').forEach((el) => (el.onclick = () => { S.players[+el.dataset.clear].cards = []; render(); }));
    $('#allStacks').onclick = () => {
      const v = prompt('Starting stack for every player:', S.players[0].stack);
      if (v != null && toCents(v) > 0) { S.players.forEach((p) => (p.stack = v)); render(); }
    };
    $('#back').onclick = () => { S.step = 1; render(); };
    if ($('#reset')) $('#reset').onclick = () => {
      if (!confirm('Discard the recorded hand and all hole cards?')) return;
      resetHand();
      render();
    };
    $('#next').onclick = () => {
      let err = '';
      const names = new Set();
      S.players.forEach((p, i) => {
        if (toCents(p.stack) <= 0) err = err || `Seat ${i + 1} needs a stack greater than zero.`;
        const nm = playerName(p, i).toLowerCase();
        if (names.has(nm)) err = err || `Two players are named "${playerName(p, i)}".`;
        names.add(nm);
      });
      if (err) { $('#err').textContent = err; return; }
      S.step = 3;
      render();
    };
  }

  function usedCards(st) {
    const used = new Set();
    st.boards.forEach((b) => b.forEach((c) => used.add(c)));
    st.P.forEach((p) => (p.cards || []).forEach((c) => used.add(c)));
    S.players.forEach((p) => p.cards.forEach((c) => used.add(c)));
    return [...used];
  }

  function boardRow(label, cards) {
    return `<div class="board-row"><span class="board-label">${label}</span>${cardsHtml(cards, 5)}</div>`;
  }

  function viewHand() {
    const setup = buildSetup();
    const st = BombEngine.simulate(setup, S.events);
    if (st.consumed < S.events.length) S.events.length = st.consumed;
    const fmt = (c) => BombEngine.money(c, setup.currency);
    const need = st.need;
    const pot = st.pot();
    const actor = need.type === 'act' || need.type === 'show' ? need.i : -1;
    const hasBoards = st.boards[0].length >= 3;

    const seats = st.P.map((p) => {
      const cls = [p.folded ? 'folded' : '', p.i === actor ? 'turn' : ''].join(' ');
      let hands = '';
      if (hasBoards && p.cards && !p.folded) {
        const h1 = BombEngine.omahaBest(p.cards, st.boards[0]).desc;
        const h2 = BombEngine.omahaBest(p.cards, st.boards[1]).desc;
        hands = `<div class="hands"><span>B1</span> ${h1}<br><span>B2</span> ${h2}</div>`;
      }
      return `<div class="seat ${cls}">
        <div class="nm"><span>${esc(p.name)}</span>${p.i === st.btn ? '<span class="dealer">D</span>' : ''}</div>
        <div class="stk">${fmt(p.stack)}</div>
        <div class="front">${p.street ? 'In front: ' + fmt(p.street) : '&nbsp;'}</div>
        <div>${p.allIn && !p.folded ? '<span class="tag">ALL-IN</span>' : ''}${p.folded ? '<span class="muted">folded</span>' : ''}</div>
        ${p.cards ? `<div class="hole">${p.cards.map((c) => cardHtml(c, 'xs')).join('')}</div>` : ''}
        ${hands}
      </div>`;
    }).join('');

    let prompt = '';
    if (need.type === 'act') {
      const p = st.P[need.i];
      const callLabel = need.canCheck ? 'Check' : `Call ${fmt(need.toCall)}${need.toCall >= p.stack ? ' (all-in)' : ''}`;
      const allInLimited = need.maxTo < p.street + p.stack;
      prompt = `
        <h3>${STREET_NAMES[st.street]} · ${esc(p.name)}</h3>
        <div class="muted">Stack ${fmt(p.stack)} · In front ${fmt(p.street)} · Pot ${fmt(pot)}${need.toCall ? ` · To call ${fmt(need.toCall)}` : ''}</div>
        <div class="actions">
          ${need.canCheck ? '' : '<button class="btn-fold" data-act="fold">Fold</button>'}
          <button class="btn-call" data-act="${need.canCheck ? 'check' : 'call'}">${callLabel}</button>
        </div>
        ${need.canRaise ? `
        <div class="raise-box">
          <div class="row">
            <span>${need.isBet ? 'Bet' : 'Raise to'}</span>
            <input id="raiseTo" type="number" step="any" value="${fromCents(need.minTo)}">
            <button class="primary" id="doRaise">${need.isBet ? 'Bet' : 'Raise'}</button>
            <span class="muted">min ${fmt(need.minTo)} · max ${fmt(need.maxTo)}${allInLimited ? ' (pot)' : ' (all-in)'}</span>
          </div>
          <div class="row quick">
            <button class="sm" data-q="min">Min</button>
            <button class="sm" data-q="0.33">⅓ pot</button>
            <button class="sm" data-q="0.5">½ pot</button>
            <button class="sm" data-q="0.75">¾ pot</button>
            <button class="sm danger" data-q="max">${allInLimited ? 'Pot' : 'All-in'} ${fmt(need.maxTo)}</button>
          </div>
          <div class="error" id="err"></div>
        </div>` : ''}`;
    } else if (need.type === 'board') {
      const name = STREET_NAMES[need.street];
      prompt = `<h3>Deal the ${name}</h3>
        <p class="muted">${st.runout ? 'Players are all-in. Run out both boards.' : need.street === 1 ? 'Bombs are in. Deal both flops.' : 'Betting round complete.'}</p>
        <div class="actions"><button class="primary" id="dealBtn">Pick the ${name} for Board 1, then Board 2</button></div>`;
    } else if (need.type === 'show') {
      const p = st.P[need.i];
      prompt = `<h3>Showdown · ${esc(p.name)}</h3>
        <p class="muted">Enter ${esc(p.name)}'s ${setup.holeCount} hole cards.</p>
        <div class="actions"><button class="primary" id="showBtn">Pick ${esc(p.name)}'s cards</button></div>`;
    } else {
      prompt = `<h3>Hand complete</h3>
        <div class="actions"><button class="primary" id="finish">See payouts →</button></div>`;
    }

    const logHtml = st.log.map((l) => `<div class="log-line"><span class="log-street">${STREET_NAMES[l.street]}</span>${esc(l.text)}</div>`).join('');

    $('#app').innerHTML = `
      <div class="layout">
        <div>
          <div class="card">
            <div class="status">
              <span>Street: <b>${need.type === 'done' ? 'Finished' : STREET_NAMES[st.street]}</b></span>
              <span>Pot: <b>${fmt(pot)}</b></span>
            </div>
            ${boardRow('Board 1', st.boards[0])}
            ${boardRow('Board 2', st.boards[1])}
          </div>
          <div class="card"><div class="seat-list">${seats}</div></div>
        </div>
        <div>
          <div class="card prompt">${prompt}</div>
          <div class="card">
            <div class="row" style="margin-bottom:8px">
              <h3 style="margin:0">Action log</h3><span class="spacer"></span>
              <button class="sm" id="undo" ${S.events.length ? '' : 'disabled'}>↶ Undo</button>
              <button class="sm danger" id="newHand">New hand</button>
            </div>
            <div class="log" id="log">${logHtml}</div>
          </div>
        </div>
      </div>`;
    const log = $('#log');
    log.scrollTop = log.scrollHeight;

    const push = (ev) => { S.events.push(ev); render(); };
    document.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => push({ t: 'act', kind: b.dataset.act })));
    if (need.type === 'act' && need.canRaise) {
      const input = $('#raiseTo');
      document.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => {
        const q = b.dataset.q;
        if (q === 'max') { push({ t: 'act', kind: 'raise', to: need.maxTo }); return; }
        let to = need.minTo;
        if (q !== 'min') {
          const potAfterCall = pot + (need.currentBet - st.P[need.i].street);
          to = need.currentBet + Math.round(potAfterCall * +q);
        }
        input.value = fromCents(Math.max(need.minTo, Math.min(need.maxTo, to)));
        input.focus();
      }));
      const doRaise = () => {
        const to = toCents(input.value);
        if (to > need.maxTo) { $('#err').textContent = `Maximum is ${fmt(need.maxTo)}.`; return; }
        if (to < need.minTo) { $('#err').textContent = `Minimum ${need.isBet ? 'bet' : 'raise'} is ${fmt(need.minTo)}.`; return; }
        push({ t: 'act', kind: 'raise', to });
      };
      $('#doRaise').onclick = doRaise;
      input.onkeydown = (e) => { if (e.key === 'Enter') doRaise(); };
    }
    if (need.type === 'board') {
      const name = STREET_NAMES[need.street];
      const sortFlop = (cards) => (need.count === 3 ? cards.sort(byRank) : cards);
      $('#dealBtn').onclick = () => openPicker(need.count, `Board 1 · ${name}`, usedCards(st), (b1) => {
        openPicker(need.count, `Board 2 · ${name}`, [...usedCards(st), ...b1], (b2) => push({ t: 'board', b1: sortFlop(b1), b2: sortFlop(b2) }));
      });
    }
    if (need.type === 'show') {
      const p = st.P[need.i];
      $('#showBtn').onclick = () => openPicker(setup.holeCount, `${p.name}'s hole cards`, usedCards(st), (cards) => {
        S.players[need.i].cards = cards.sort(byRank);
        render();
      });
    }
    if (need.type === 'done') $('#finish').onclick = () => { S.step = 4; render(); };
    $('#undo').onclick = () => { S.events.pop(); render(); };
    $('#newHand').onclick = () => {
      if (S.events.length && !confirm('Discard this hand and start over? Players and stacks are kept.')) return;
      resetHand();
      S.step = 2;
      render();
    };
  }

  function viewPayouts() {
    const setup = buildSetup();
    const st = BombEngine.simulate(setup, S.events);
    if (st.need.type !== 'done') { S.step = 3; render(); return; }
    const fmt = (c) => BombEngine.money(c, setup.currency);
    const name = (i) => esc(st.P[i].name);
    const signed = (c) => (c > 0 ? `+${fmt(c)}` : c < 0 ? `−${fmt(-c)}` : fmt(0));

    const rows = st.P.map((p, i) => {
      const r = st.results[i];
      const h = p.hands;
      return `<tr class="${p.folded ? 'folded' : ''}">
        <td><b>${esc(p.name)}</b>${i === st.btn ? ' <span class="dealer">D</span>' : ''}</td>
        <td class="hole">${p.cards ? p.cards.map((c) => cardHtml(c, 'xs')).join('') : '<span class="muted">—</span>'}</td>
        <td>${p.folded ? '<span class="muted">Folded</span>' : h ? esc(h[0].desc) : '—'}</td>
        <td>${p.folded ? '' : h ? esc(h[1].desc) : '—'}</td>
        <td class="num">${fmt(r.invested)}</td>
        <td class="num">${fmt(r.won)}</td>
        <td class="num ${r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}">${signed(r.net)}</td>
        <td class="num"><b>${fmt(r.final)}</b></td>
      </tr>`;
    }).join('');

    const potCards = st.pots.map((pot) => {
      const elig = pot.elig.map(name).join(', ');
      if (pot.uncontested) {
        return `<div class="pot">
          <div class="pot-head"><b>${pot.name}</b><span class="pot-amt">${fmt(pot.amt)}</span></div>
          <div class="muted">${st.showdown ? 'Only one player eligible, returned to' : 'Everyone else folded. Awarded to'} <b>${elig}</b>.</div>
        </div>`;
      }
      const boards = pot.boards.map((b, k) => `
        <div class="pot-board">
          <div class="pot-board-head"><span class="board-label">Board ${k + 1}</span>${st.boards[k].map((c) => cardHtml(c, 'xs')).join('')}<span class="spacer"></span><b>${fmt(b.amt)}</b></div>
          <div>${b.winners.map((w) => `<b>${name(w.i)}</b> wins ${fmt(w.amt)}`).join(' · ')}${b.winners.length > 1 ? ' <span class="chop">CHOP</span>' : ''}</div>
          <div class="muted">${esc(b.desc)}</div>
        </div>`).join('');
      return `<div class="pot">
        <div class="pot-head"><b>${pot.name}</b><span class="pot-amt">${fmt(pot.amt)}</span></div>
        <div class="muted" style="margin-bottom:8px">Eligible: ${elig}</div>
        <div class="pot-boards">${boards}</div>
      </div>`;
    }).join('');

    const total = st.pot();
    const summary = buildSummary(st, setup);

    $('#app').innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px">
          <h2 style="margin:0">Payouts</h2>
          <span class="spacer"></span>
          <span>Total pot <b class="accent">${fmt(total)}</b></span>
        </div>
        ${boardRow('Board 1', st.boards[0])}
        ${boardRow('Board 2', st.boards[1])}
      </div>
      <div class="card">
        <table class="players results">
          <thead><tr><th>Player</th><th>Hole cards</th><th>Board 1 hand</th><th>Board 2 hand</th><th class="num">Put in</th><th class="num">Won</th><th class="num">Net</th><th class="num">Final stack</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="card">
        <h3>Pots</h3>
        <div class="pots">${potCards}</div>
      </div>
      <div class="row">
        <button id="edit">← Edit hand</button>
        <button id="copy">Copy summary</button>
        <span class="spacer"></span>
        <button class="primary" id="nextHand">Next bomb pot (move button, keep stacks)</button>
      </div>`;
    $('#edit').onclick = () => { S.step = 3; render(); };
    $('#copy').onclick = async () => {
      await navigator.clipboard.writeText(summary);
      $('#copy').textContent = 'Copied!';
      setTimeout(() => ($('#copy').textContent = 'Copy summary'), 1200);
    };
    $('#nextHand').onclick = () => {
      st.results.forEach((r, i) => (S.players[i].stack = fromCents(r.final)));
      S.button = (S.button + 1) % S.cfg.n;
      resetHand();
      S.step = 2;
      render();
    };
  }

  function buildSummary(st, setup) {
    const fmt = (c) => BombEngine.money(c, setup.currency);
    const lines = [`Double-board PLO bomb pot · total pot ${fmt(st.pot())}`];
    lines.push(`Board 1: ${st.boards[0].join(' ')}`, `Board 2: ${st.boards[1].join(' ')}`, '');
    st.pots.forEach((pot) => {
      lines.push(`${pot.name} ${fmt(pot.amt)} (${pot.elig.map((i) => st.P[i].name).join(', ')})`);
      if (pot.uncontested) lines.push(`  -> ${st.P[pot.elig[0]].name} ${fmt(pot.amt)}`);
      else pot.boards.forEach((b, k) => lines.push(`  Board ${k + 1} ${fmt(b.amt)}: ${b.winners.map((w) => `${st.P[w.i].name} ${fmt(w.amt)}`).join(', ')} (${b.desc})`));
    });
    lines.push('');
    st.P.forEach((p, i) => {
      const r = st.results[i];
      const net = r.net > 0 ? `+${fmt(r.net)}` : r.net < 0 ? `-${fmt(-r.net)}` : fmt(0);
      lines.push(`${p.name}: ${net} -> ${fmt(r.final)}`);
    });
    return lines.join('\n');
  }

  render();
})();
