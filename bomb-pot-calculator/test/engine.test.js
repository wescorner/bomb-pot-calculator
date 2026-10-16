// Run with: node test/engine.test.js
const assert = require('assert');
global.window = global;
require('../engine.js');
const { simulate, omahaBest, splitAmount } = window.BombEngine;

const act = (kind, to) => ({ t: 'act', kind, to });
const board = (b1, b2) => ({ t: 'board', b1: b1.split(' '), b2: b2.split(' ') });
const setupOf = (players, extra = {}) => ({
  players: players.map(([name, stack, cards]) => ({ name, stack, cards: cards ? cards.split(' ') : [] })),
  button: 0, ante: 500, minBet: 500, chip: 100, holeCount: 4, currency: '$', ...extra,
});

// Omaha must use exactly two hole cards.
{
  const oneHeart = omahaBest(['Ah', 'Ks', 'Qd', 'Jc'], ['2h', '5h', '8h', '9h', 'Th']);
  assert.notStrictEqual(oneHeart.desc.startsWith('Flush'), true, 'one-heart hand cannot make a flush');
  const twoHearts = omahaBest(['Ah', 'Kh', 'Qd', 'Jc'], ['2h', '5h', '8h', '9c', 'Td']);
  assert.strictEqual(twoHearts.desc, 'Flush, Ace high');
  const boardQuads = omahaBest(['2c', '3d', '4h', '9s'], ['As', 'Ad', 'Ah', 'Ac', 'Ks']);
  assert.strictEqual(boardQuads.desc, 'Three of a Kind, Aces');
}

// Odd-chip splitting in chip units.
assert.deepStrictEqual(splitAmount(1500, 2, 100), [800, 700]);
assert.deepStrictEqual(splitAmount(1000, 3, 100), [400, 300, 300]);

// Pot-limit maximums: pot after bombs is $20 (4 x $5).
{
  const s = setupOf([['A', 20000], ['B', 20000], ['C', 20000], ['D', 20000]]);
  let st = simulate(s, [board('Ks 9h 4d', '2c 7s Jd')]);
  assert.strictEqual(st.need.type, 'act');
  assert.strictEqual(st.need.i, 1, 'action starts left of the button');
  assert.strictEqual(st.need.maxTo, 2000, 'pot bet = $20');
  st = simulate(s, [board('Ks 9h 4d', '2c 7s Jd'), act('raise', 2000)]);
  assert.strictEqual(st.need.maxTo, 8000, 'pot raise over a $20 bet into $20 = raise to $80');
}

// Scoop vs split with a short all-in creating a side pot.
{
  const s = setupOf([
    ['Ann', 3000, 'As Ad Kh Qh'],   // short stack
    ['Bob', 20000, '9c 9d 8s 7s'],
    ['Cat', 20000, 'Jh Th 2c 3c'],
  ]);
  const st = simulate(s, [
    board('Ah 9s 4h', 'Kc 8c 2d'),
    act('raise', 1500), // Bob bets pot ($15)
    act('call'),        // Cat
    act('raise', 2500), // Ann all-in for her last $25
    act('raise', 6000), // Bob re-raises
    act('call'),        // Cat
    board('2s', '5c'),
    act('check'), act('check'),
    board('7d', 'Qc'),
    act('check'), act('check'),
  ]);
  assert.strictEqual(st.need.type, 'done');
  const total = st.P.reduce((a, p) => a + p.total, 0);
  assert.strictEqual(st.winnings.reduce((a, b) => a + b, 0), total, 'all chips paid out');
  assert.strictEqual(st.pots.length, 2);
  // Main pot: 3 x $30 = $90. Side pot: 2 x ($65 - $30) = $70.
  assert.strictEqual(st.pots[0].amt, 9000);
  assert.strictEqual(st.pots[1].amt, 7000);
  // Board 1 (Ah 9s 4h 2s 7d): Ann has trip aces; Board 2 (Kc 8c 2d 5c Qc): Cat has a flush.
  assert.deepStrictEqual(st.pots[0].boards[0].winners.map((w) => w.i), [0]);
  assert.deepStrictEqual(st.pots[0].boards[1].winners.map((w) => w.i), [2]);
  // Side pot board 1: Bob's set of nines beats Cat; board 2: Cat's flush.
  assert.deepStrictEqual(st.pots[1].boards[0].winners.map((w) => w.i), [1]);
  assert.deepStrictEqual(st.pots[1].boards[1].winners.map((w) => w.i), [2]);
  assert.deepStrictEqual(st.winnings, [4500, 3500, 8000]);
  console.log(st.log.map((l) => l.text).join('\n'));
  console.log(st.results);
}

// Everyone folds to a bet: uncontested, uncalled bet returned.
{
  const s = setupOf([['A', 10000], ['B', 10000], ['C', 10000]]);
  const st = simulate(s, [board('Ks 9h 4d', '2c 7s Jd'), act('raise', 1500), act('fold'), act('fold')]);
  assert.strictEqual(st.need.type, 'done');
  assert.strictEqual(st.winnings[1], 1500);
  assert.strictEqual(st.results[1].final, 11000);
}

// Missing hole cards are requested at showdown.
{
  const s = setupOf([['A', 10000], ['B', 10000, 'As Ks Qs Js']]);
  const st = simulate(s, [
    board('Ts 2h 3d', '4c 5c 6c'), act('check'), act('check'),
    board('8h', '9d'), act('check'), act('check'),
    board('7s', 'Kd'), act('check'), act('check'),
  ]);
  assert.strictEqual(st.need.type, 'show');
  assert.strictEqual(st.need.i, 0);
}

console.log('\nAll bomb pot engine tests passed.');
