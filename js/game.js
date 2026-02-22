// =====================================================================
//  LUMENPOLY · GAME LOGIC
//  Loaded first; lobby.js is loaded second and extends mp globals.
// =====================================================================

'use strict';

// ─── GLOBAL STATE ────────────────────────────────────────────────────
let currentPlayer = 0;
let isProcessing  = false;
let doubleCount   = 0;

const players = [
    { id: 1, pos: 0, cash: 1500, hex: '#ff0000', color: 'p1', bankrupt: false, inJail: false, jailTurns: 0, banLiftPass: false },
    { id: 2, pos: 0, cash: 1500, hex: '#00ff00', color: 'p2', bankrupt: false, inJail: false, jailTurns: 0, banLiftPass: false },
    { id: 3, pos: 0, cash: 1500, hex: '#0000ff', color: 'p3', bankrupt: false, inJail: false, jailTurns: 0, banLiftPass: false },
    { id: 4, pos: 0, cash: 1500, hex: '#ffff00', color: 'p4', bankrupt: false, inJail: false, jailTurns: 0, banLiftPass: false },
];

const propertyData = {};

// ─── ROMAN NUMERALS / TOWER DIRECTIONS ───────────────────────────────
const romanNum  = ['I', 'II', 'III', 'IV'];
const towerDirs = ['NORTH', 'EAST', 'SOUTH', 'WEST'];

// =====================================================================
//  COLOR DOMAIN GROUPS
// =====================================================================
const colorGroups = {
    brown:  [1, 3],
    lblue:  [6, 8, 9],
    pink:   [11, 12],
    orange: [13, 14],
    red:    [16, 18, 19],
    yellow: [21, 23, 24],
    green:  [26, 27],
    dblue:  [28, 29],
    purple: [31, 32, 34],
    silver: [37, 39],
};

function getColorGroup(pos) {
    for (const positions of Object.values(colorGroups)) {
        if (positions.includes(pos)) return positions;
    }
    return null;
}

function ownsColorGroup(playerId, pos) {
    const group = getColorGroup(pos);
    if (!group) return false;
    return group.every(p => propertyData[p] && propertyData[p].owner === playerId);
}

function canBuildOnProp(prop) {
    if (!prop.owner || prop.type === 'transport' || prop.fortress) return false;
    if (!ownsColorGroup(prop.owner, prop.pos)) return false;
    const group = getColorGroup(prop.pos);
    const myLevel = prop.towers;
    const minOtherLevel = Math.min(...group
        .filter(pos => pos !== prop.pos)
        .map(pos => { const p = propertyData[pos]; return p.fortress ? 5 : p.towers; })
    );
    return myLevel <= minOtherLevel;
}

// =====================================================================
//  CARD DECKS
// =====================================================================
const chanceCards = [
    // ── GOOD ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    { title: 'ASCENSION DECREE',       desc: 'Gaeto grants you direct access to Ascension. March to the starting point and collect $200 gold.',                                         effect: 'go'                          },
    { title: 'LOTTO 1ST PRIZE',        desc: 'You won 1st Prize in the Lumen Lotto! You sold the prize for $200 gold.',                                                                 effect: 'collect',        amount: 200 },
    { title: "GAETO'S BIRTHDAY GIFT",  desc: "Happy Birthday! Gaeto personally sends you $50 as a gift.",                                                                               effect: 'collect',        amount: 50  },
    { title: 'PVP EVENT WIN',          desc: 'You dominated the PvP Event! Collect $20 gold from each Marshal as prize money.',                                                          effect: 'collect_all',    amount: 20  },
    { title: 'INSTANCE HELPER',        desc: 'You helped a new joiner with instances. Grateful, they offer you $50 as a token of gratitude.',                                           effect: 'collect',        amount: 50  },
    { title: 'BAN LIFT PASS',          desc: 'Gaeto grants you a one-time Ban Lift Pass for reporting a major bug. Keep it — it will immediately free you from the Ban List when used.', effect: 'ban_lift'                    },
    { title: 'FORT CLOUDSTORM PVP',    desc: 'You participated in the weekly Fort Cloudstorm PvP Event and took home $100 gold.',                                                        effect: 'collect',        amount: 100 },
    { title: 'JD LUMEN PROMO',         desc: 'You made a promotional video for JD Lumen! Receive $150 gold as compensation.',                                                           effect: 'collect',        amount: 150 },
    // ── BAD ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    { title: 'BAN HAMMER',             desc: 'Caught exploiting bugs! Gaeto shows no mercy — taste the Ban Hammer! Banished to the Ban List.',                                          effect: 'jail'                        },
    { title: 'EARTHQUAKE!',            desc: 'Earthquake strikes your territories! Pay $5 per territory, $15 per tower, and $50 per fortress as repair cost.',                          effect: 'pay_earthquake'              },
    { title: 'SUNSTREAM SCAM',         desc: 'You got scammed while shopping in Realm 15 Sunstream. You lost $100 gold.',                                                               effect: 'pay',            amount: 100 },
    { title: 'ESPER MISHAP',           desc: 'You accidentally sold your esper to an NPC! You lost $200 gold.',                                                                         effect: 'pay',            amount: 200 },
    { title: 'VOUCHER LAPSE',          desc: 'You forgot to turn in your voucher at the end of instances. You lost $50 gold.',                                                          effect: 'pay',            amount: 50  },
    { title: 'ALLIANCE RANSOM',        desc: 'Your alliance members are held captive by an opposing alliance. Pay $150 gold for their release.',                                         effect: 'pay',            amount: 150 },
    { title: 'TW BID FORGOTTEN',       desc: 'You forgot to bid on the weekly Territorial War! You lost $100 gold.',                                                                    effect: 'pay',            amount: 100 },
    { title: 'DISCORD FINE',           desc: "You spammed the Lumen Discord channel in a heated argument. Gaeto let you off with a warning — and a $50 fine.",                          effect: 'pay',            amount: 50  },
];

const chestCards = [
    // ── GOOD ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    { title: 'ASCENSION GRANTED',            desc: 'Bilins grants you direct access to Ascension. Advance to Go and collect $200 gold.',                                                 effect: 'go'                          },
    { title: 'BAN LIFT PASS',                desc: 'Reported a major bug! Bilins rewards you with a one-time Ban Lift Pass. It will immediately free you from the Ban List when needed.',effect: 'ban_lift'                    },
    { title: 'HEAD OF CONCORD',              desc: 'Elected as the Head of the Concord of Alliances. Receive $100 gold.',                                                               effect: 'collect',        amount: 100 },
    { title: 'EXPANSION TESTER',             desc: 'Volunteered as a tester for the coming expansion. Bilins rewards you with $150 gold.',                                              effect: 'collect',        amount: 150 },
    { title: 'POSTER DESIGN WIN',            desc: 'Won the Lumen Poster Design Contest. Bilins rewards you with $50 gold.',                                                            effect: 'collect',        amount: 50  },
    { title: 'CORONATION VICTORY',           desc: 'Won Coronation! Every Marshal pays you $50 as tribute.',                                                                           effect: 'collect_all',    amount: 50  },
    // ── NEUTRAL ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    { title: 'ADVANCE TO LAGUNA FERRY',      desc: 'Advance to Laguna Ferry. If you pass Ascension, collect $200 gold.',                                                               effect: 'move_transport', target: 15  },
    { title: 'ADVANCE TO WILDLANDS EXPRESS', desc: 'Advance to Wildlands Express. If you pass Ascension, collect $200 gold.',                                                          effect: 'move_transport', target: 25  },
    { title: 'ADVANCE TO KUNLUN SNOW SLEDS', desc: 'Advance to Kunlun Snow Sleds. If you pass Ascension, collect $200 gold.',                                                          effect: 'move_transport', target: 35  },
    { title: 'ADVANCE TO SUNSTREAM EXPRESS', desc: 'Advance to Sunstream Express. If you pass Ascension, collect $200 gold.',                                                          effect: 'move_transport', target: 5   },
    // ── BAD ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
    { title: 'BAN HAMMER',                   desc: 'Caught using a 3rd party cheating mechanism! Bilins shows no mercy — taste the Ban Hammer! Go directly to the Ban List.',          effect: 'jail'                        },
    { title: 'PUPPET PROTECTOR MISHAP',      desc: 'Entered PvP without Puppet Protector and broke your gears. Pay $100 gold for repairs.',                                            effect: 'pay',            amount: 100 },
    { title: 'DISCORD FINE',                 desc: "Spammed the Lumen Discord channel in a heated argument. Bilins let you off with a warning — and a $50 fine.",                      effect: 'pay',            amount: 50  },
    { title: 'SERENITY JADE MISHAP',         desc: 'Forgot to use Serenity Jade when refining your weapon. It broke! Pay $200 for a replacement.',                                    effect: 'pay',            amount: 200 },
    { title: 'TORNADO STRIKE!',              desc: 'A tornado tears through Lumen! Pay $5 per territory, $15 per tower, and $50 per fortress you own as damage cost.',                effect: 'pay_earthquake'              },
    { title: 'ESPER INVIGORATE FORGOTTEN',   desc: 'Forgot to turn on Esper Invigorate before grinding overnight. All that time wasted — pay $50 to restock supplies.',                effect: 'pay',            amount: 50  },
];

// =====================================================================
//  INIT
// =====================================================================
function initGame() {
    for (let i = 0; i < 40; i++) {
        const el = document.getElementById(`s${i}`);
        if (!el || !el.classList.contains('space') ||
            el.classList.contains('tax') ||
            el.classList.contains('chance') ||
            el.classList.contains('chest')) continue;
        const type  = el.classList.contains('transport') ? 'transport' : 'property';
        const price = type === 'transport' ? 200 : (60 + Math.floor(i / 5) * 40);
        propertyData[i] = { type, price, owner: null, name: el.querySelector('.name').innerText, towers: 0, fortress: false, pos: i };
        el.insertAdjacentHTML('beforeend', `<div class="price-tag">$${price}</div>`);
    }
    ['s0','s10','s20','s30'].forEach(id => {
        const tray = document.createElement('div');
        tray.className = 'token-tray';
        document.getElementById(id).appendChild(tray);
    });
    const s0tray = document.getElementById('s0').querySelector('.token-tray');
    players.forEach(p => {
        const t = document.createElement('div');
        t.className = `p-token ${p.color}`;
        t.id = `token-${p.id}`;
        s0tray.appendChild(t);
    });
    setupPlayerUI();
    updateActiveTokenPulse();
    boardEntrance();
    updateUI();
    startGameTimer();
}

// =====================================================================
//  HELPERS
// =====================================================================
function addLog(pIdx, msg) {
    const logBox = document.getElementById(`p${pIdx + 1}-logs`);
    logBox.innerHTML += `<br>&gt; ${msg}`;
    logBox.scrollTop = logBox.scrollHeight;
}

// =====================================================================
//  GAME MODE & TIMER SYSTEM
// =====================================================================
let gameStartTime     = null;
let gameTimerInterval = null;
let turnTimer         = null;
let turnTimerSec      = 0;

const MODES = [
    { name: 'NORMAL',    minsSince: 0,  color: '#aaa' },
    { name: 'HARD',      minsSince: 5,  color: '#f88' },
    { name: 'ELITE',     minsSince: 10, color: '#f55' },
    { name: 'INSANE',    minsSince: 15, color: '#f00' },
    { name: 'NIGHTMARE', minsSince: 20, color: '#c00' },
    { name: 'HELL',      minsSince: 25, color: '#900' },
];

function getMode() {
    if (!gameStartTime) return MODES[0];
    const mins = (Date.now() - gameStartTime) / 60000;
    let mode = MODES[0];
    for (const m of MODES) { if (mins >= m.minsSince) mode = m; }
    return mode;
}

function isHardOrBeyond()      { const n = getMode().name; return ['HARD','ELITE','INSANE','NIGHTMARE','HELL'].includes(n); }
function isEliteOrBeyond()     { const n = getMode().name; return ['ELITE','INSANE','NIGHTMARE','HELL'].includes(n); }
function isInsaneOrBeyond()    { const n = getMode().name; return ['INSANE','NIGHTMARE','HELL'].includes(n); }
function isNightmareOrBeyond() { const n = getMode().name; return ['NIGHTMARE','HELL'].includes(n); }
function isHell()              { return getMode().name === 'HELL'; }

function drawCard(deck) {
    if (isHardOrBeyond()) {
        const neg = deck.filter(c => ['pay','pay_all','pay_per_tower','pay_per_property','jail','pay_earthquake','move_transport'].includes(c.effect));
        if (neg.length > 0) return neg[Math.floor(Math.random() * neg.length)];
    }
    return deck[Math.floor(Math.random() * deck.length)];
}

function calcNetWorth(p) {
    return p.cash + Object.values(propertyData)
        .filter(pr => pr.owner === p.id)
        .reduce((sum, pr) => {
            const units = pr.fortress ? 5 : pr.towers;
            return sum + Math.floor(pr.price * 0.5) + units * Math.floor(pr.price * 0.25);
        }, 0);
}

function endGameByTimer() {
    clearInterval(gameTimerInterval); gameTimerInterval = null;
    clearTurnTimer();
    document.getElementById('decision-modal').style.display = 'none';
    const alive  = players.filter(p => !p.bankrupt).sort((a, b) => calcNetWorth(b) - calcNetWorth(a));
    const winner = alive[0];
    const modal  = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = 'TIME EXPIRES — WAR ENDS';
    document.getElementById('modal-text').innerHTML  =
        `<div style="color:#aaa;font-size:12px;margin-bottom:8px;">Final standings (gold + assets):</div>` +
        alive.map(p =>
            `<div style="color:${p.hex};margin-bottom:4px;">Marshal ${romanNum[p.id-1]}: <b>$${calcNetWorth(p)}</b>
             <span style="color:#555;font-size:11px;">($${p.cash} gold)</span></div>`
        ).join('');
    document.getElementById('modal-actions').innerHTML =
        `<div style="color:var(--gold);font-size:18px;font-weight:900;letter-spacing:3px;margin-top:10px;">VICTOR: MARSHAL ${romanNum[winner.id-1]}</div>`;
    _showModal(modal);
    players.forEach((_, i) => addLog(i, `GAME OVER — VICTOR BY WEALTH: MARSHAL ${romanNum[winner.id-1]} ($${calcNetWorth(winner)})`));
}

function updateModeBar() {
    if (!gameStartTime) return;
    const mode      = getMode();
    const elapsed   = (Date.now() - gameStartTime) / 1000;
    const remaining = Math.max(0, 1800 - elapsed);
    if (remaining <= 0 && gameTimerInterval) { endGameByTimer(); return; }
    const mm  = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss  = String(Math.floor(remaining % 60)).padStart(2, '0');
    const bar = document.getElementById('mode-bar');
    if (bar) {
        bar.innerHTML = `<span style="color:${mode.color}">${mode.name}</span> <span style="color:#444">|</span> <span style="color:#666">${mm}:${ss}</span>`;
        const last = bar.dataset.lastMode || 'NORMAL';
        if (last !== mode.name) {
            bar.dataset.lastMode = mode.name;
            const msgs = {
                'HARD':      '⚠ HARD MODE — All taxes & bribe doubled!',
                'ELITE':     '⚠ ELITE MODE — Only punishing decrees remain!',
                'INSANE':    '⚠ INSANE MODE — No passage bonus! No mercy! No trade!',
                'NIGHTMARE': '⚠ NIGHTMARE MODE — Decree penalties doubled!',
                'HELL':      '⚠ HELL MODE — All war reparations doubled!'
            };
            if (msgs[mode.name]) players.forEach((_, i) => addLog(i, msgs[mode.name]));
        }
    }
    const tb = document.getElementById('trade-trigger');
    if (tb) tb.style.display = isInsaneOrBeyond() ? 'none' : '';
}

function startGameTimer() {
    gameStartTime     = Date.now();
    gameTimerInterval = setInterval(updateModeBar, 1000);
    updateModeBar();
}

function clearTurnTimer() {
    if (turnTimer) { clearInterval(turnTimer); turnTimer = null; }
    const bar = document.getElementById('turn-timer-bar');
    if (bar) bar.textContent = '';
}

function startTurnTimer(seconds, onExpire) {
    clearTurnTimer();
    turnTimerSec = seconds;
    const bar  = document.getElementById('turn-timer-bar');
    const tick = () => { if (bar) bar.textContent = `\u23f1 ${turnTimerSec}s`; };
    tick();
    turnTimer = setInterval(() => {
        turnTimerSec--;
        tick();
        if (turnTimerSec <= 0) { clearTurnTimer(); onExpire(); }
    }, 1000);
}

function extendTurnTimer(seconds) {
    if (turnTimer) {
        turnTimerSec += seconds;
        const bar = document.getElementById('turn-timer-bar');
        if (bar) bar.textContent = `\u23f1 ${turnTimerSec}s`;
    }
}

// =====================================================================
//  DEBT RESOLUTION
// =====================================================================
let debtCallback = null;

function handleDebt(p, callback) {
    if (p.cash >= 0) { callback(); return; }
    showDebtModal(p, callback);
}

function showDebtModal(p, callback) {
    debtCallback = callback;
    const owed  = Math.abs(p.cash);
    const owned = Object.values(propertyData).filter(pr => pr.owner === p.id);

    const maxRaisable = owned.reduce((sum, pr) => {
        const units = pr.fortress ? 5 : pr.towers;
        return sum + (units * Math.floor(pr.price * 0.25)) + Math.floor(pr.price * 0.5);
    }, 0);

    const canSurvive = owned.length > 0 && (p.cash + maxRaisable) >= 0;
    const modal      = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = 'GUILD TREASURY IN CRISIS';
    document.getElementById('modal-text').innerHTML  =
        `<b style="color:#f55">Marshal ${romanNum[p.id - 1]} is $${owed} gold in debt!</b><br>
         <span style="color:#aaa;font-size:13px;">The alliance cannot sustain this deficit.</span>`;

    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';

    if (canSurvive) {
        const sellBtn = document.createElement('button');
        sellBtn.className   = 'modal-btn';
        sellBtn.textContent = 'LIQUIDATE ASSETS';
        sellBtn.onclick     = () => { modal.style.display = 'none'; showAssetLiquidation(p); };
        acts.appendChild(sellBtn);
    }

    const surrenderBtn = document.createElement('button');
    surrenderBtn.className   = 'modal-btn';
    surrenderBtn.style.cssText = 'background:#7a0000;color:#fff;';
    surrenderBtn.textContent = 'SURRENDER BANNER';
    surrenderBtn.onclick     = () => { modal.style.display = 'none'; declareBankruptcy(p); };
    acts.appendChild(surrenderBtn);
    _showModal(modal);
}

function showAssetLiquidation(p) {
    const modal = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = 'ASSET LIQUIDATION';

    const render = () => {
        const owned    = Object.values(propertyData).filter(pr => pr.owner === p.id);
        const isInDebt = p.cash < 0;

        const textEl = document.getElementById('modal-text');
        textEl.innerHTML = '';

        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = `color:${isInDebt ? '#f55' : '#8f8'};margin-bottom:8px;font-size:13px;`;
        statusDiv.textContent = isInDebt
            ? `\u26a0 Still $${Math.abs(p.cash)} gold in debt \u2014 sell more assets`
            : `\u2713 Debt cleared! ($${p.cash} gold remaining)`;
        textEl.appendChild(statusDiv);

        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'text-align:left;max-height:220px;overflow-y:auto;';

        owned.forEach(pr => {
            const towerSale     = Math.floor(pr.price * 0.25);
            const territorySale = Math.floor(pr.price * 0.5);
            const row = document.createElement('div');
            row.style.cssText = 'border-bottom:1px solid #333;padding:6px 2px;font-size:12px;display:flex;align-items:center;flex-wrap:wrap;gap:4px;';

            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'color:var(--gold);flex:1;min-width:100px;';
            nameSpan.textContent = pr.name + (pr.fortress ? ' [FORTRESS]' : (pr.towers > 0 ? ` [${towerDirs.slice(0, pr.towers).join('/')}]` : ''));
            row.appendChild(nameSpan);

            if (pr.fortress || pr.towers > 0) {
                const demoBtn = document.createElement('button');
                demoBtn.className   = 'modal-btn';
                demoBtn.style.cssText = 'padding:3px 8px;font-size:10px;margin:0;';
                demoBtn.textContent = pr.fortress
                    ? `DEMOLISH FORTRESS +$${towerSale}`
                    : `DEMOLISH ${towerDirs[pr.towers - 1]} TOWER +$${towerSale}`;
                demoBtn.onclick = () => {
                    if (pr.fortress) {
                        pr.fortress = false; pr.towers = 4;
                        addLog(p.id - 1, `FORTRESS AT ${pr.name} DEMOLISHED — RECEIVED $${towerSale}`);
                    } else {
                        const demoDir = towerDirs[pr.towers - 1];
                        pr.towers--;
                        addLog(p.id - 1, `${demoDir} TOWER DEMOLISHED AT ${pr.name} — RECEIVED $${towerSale}`);
                    }
                    p.cash += towerSale;
                    updateBuildingDisplay(pr.pos, pr);
                    updateUI(); render();
                };
                row.appendChild(demoBtn);
            }

            const cedeBtn = document.createElement('button');
            cedeBtn.className   = 'modal-btn';
            cedeBtn.style.cssText = 'padding:3px 8px;font-size:10px;margin:0;background:#7a0000;color:#fff;';
            cedeBtn.textContent = `CEDE TERRITORY +$${territorySale}`;
            cedeBtn.onclick = () => {
                pr.fortress = false; pr.towers = 0; pr.owner = null;
                const el  = document.getElementById(`s${pr.pos}`);
                const ind = el ? el.querySelector('.owner-indicator') : null;
                if (ind) ind.style.borderColor = 'transparent';
                updateBuildingDisplay(pr.pos, pr);
                p.cash += territorySale;
                addLog(p.id - 1, `${pr.name} CEDED TO NEUTRAL — RECEIVED $${territorySale}`);
                updateUI(); render();
            };
            row.appendChild(cedeBtn);
            listDiv.appendChild(row);
        });

        textEl.appendChild(listDiv);

        const acts = document.getElementById('modal-actions');
        acts.innerHTML = '';

        if (!isInDebt) {
            const continueBtn = document.createElement('button');
            continueBtn.className   = 'modal-btn';
            continueBtn.textContent = 'CONTINUE CAMPAIGN';
            continueBtn.onclick     = () => {
                modal.style.display = 'none';
                const cb = debtCallback; debtCallback = null; cb();
            };
            acts.appendChild(continueBtn);
        } else if (owned.length === 0) {
            const exileBtn = document.createElement('button');
            exileBtn.className   = 'modal-btn';
            exileBtn.style.cssText = 'background:#7a0000;color:#fff;';
            exileBtn.textContent = 'NO ASSETS — EXILE';
            exileBtn.onclick     = () => { modal.style.display = 'none'; declareBankruptcy(p); };
            acts.appendChild(exileBtn);
        } else {
            const surrenderBtn = document.createElement('button');
            surrenderBtn.className   = 'modal-btn';
            surrenderBtn.style.cssText = 'background:#333;color:#888;font-size:10px;';
            surrenderBtn.textContent = 'SURRENDER INSTEAD';
            surrenderBtn.onclick     = () => { modal.style.display = 'none'; declareBankruptcy(p); };
            acts.appendChild(surrenderBtn);
        }

        _showModal(modal);
    };

    render();
}

function declareBankruptcy(p) {
    Object.values(propertyData).forEach(prop => {
        if (prop.owner !== p.id) return;
        prop.owner = null; prop.towers = 0; prop.fortress = false;
        const el  = document.getElementById(`s${prop.pos}`);
        const ind = el ? el.querySelector('.owner-indicator') : null;
        if (ind) ind.style.borderColor = 'transparent';
        updateBuildingDisplay(prop.pos, prop);
    });
    p.bankrupt = true; p.cash = 0;
    addLog(p.id - 1, `BANNER SURRENDERED — MARSHAL ${romanNum[p.id - 1]} EXILED. ALL TERRITORIES RETURNED TO NEUTRAL.`);
    boardShake();
    updateUI();
    if (debtCallback) { const cb = debtCallback; debtCallback = null; cb(); }
}

// =====================================================================
//  RENT / TRIBUTE CALCULATION
// =====================================================================
function calcRent(prop) {
    if (prop.type === 'transport') {
        if (!prop.owner) return 0;
        const ownedHubs = Object.values(propertyData)
            .filter(pr => pr.type === 'transport' && pr.owner === prop.owner).length;
        return [0, 25, 50, 100, 200][ownedHubs];
    }
    const base = Math.floor(prop.price * 0.15);
    if (prop.fortress) return base * 8;
    if (prop.towers > 0) return base * (1 + prop.towers);
    const hasControl = prop.owner && ownsColorGroup(prop.owner, prop.pos);
    return hasControl ? base * 2 : base;
}

function updateBuildingDisplay(pos, prop) {
    const spaceEl = document.getElementById(`s${pos}`);
    let badge = spaceEl.querySelector('.tower-display');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'tower-display';
        spaceEl.appendChild(badge);
    }
    if (prop.fortress) {
        badge.textContent = 'FORTRESS';
        badge.style.color = 'var(--gold)';
    } else if (prop.towers > 0) {
        badge.textContent = towerDirs.slice(0, prop.towers).map(d => d[0]).join('\u00b7');
        badge.style.color = '#8f8';
    } else {
        badge.textContent = '';
    }
    towerPopIn(pos);
}

// =====================================================================
//  UI UPDATE
// =====================================================================
function updateUI() {
    players.forEach((p, i) => {
        const box = document.getElementById(`box-${p.id}`);
        // Cash delta floating text
        if (_prevCashReady && _prevCash[p.id] !== undefined && p.cash !== _prevCash[p.id]) {
            showCashDelta(p.id, p.cash - _prevCash[p.id]);
        }
        _prevCash[p.id] = p.cash;
        document.getElementById(`p${p.id}-cash`).innerText = `$${p.cash}`;
        box.classList.toggle('active',   i === currentPlayer);
        box.classList.toggle('bankrupt', p.bankrupt);

        const assetsDiv = document.getElementById(`p${p.id}-assets`);
        const owned     = Object.values(propertyData).filter(prop => prop.owner === p.id);
        let assetsHtml  = '';
        if (p.banLiftPass) {
            assetsHtml += `<div class="asset-item" style="color:var(--gold);border-bottom:1px solid #333;margin-bottom:3px;padding-bottom:3px;">&#x1F511; BAN LIFT PASS <span style="color:#888;font-size:10px;">(auto-activates on ban)</span></div>`;
        }
        if (owned.length > 0) {
            assetsHtml += owned.map(o => {
                const controlStar = (!o.fortress && o.towers === 0 && ownsColorGroup(p.id, o.pos))
                    ? ` <span style="color:var(--gold)" title="Domain Controlled">&#9733;</span>` : '';
                const towerBadge = o.fortress
                    ? ` <span style="color:var(--gold)">[FORTRESS]</span>`
                    : (o.towers > 0 ? ` <span style="color:#8f8">[${towerDirs.slice(0, o.towers).join('/')}]</span>` : '');
                return `<div class="asset-item">${o.name}${controlStar}${towerBadge} <span style="color:#888;font-size:11px;">$${calcRent(o)} tribute</span></div>`;
            }).join('');
        }
        assetsDiv.innerHTML = assetsHtml || 'NO TERRITORIES';
    });
    const statusLabel = (typeof mp !== 'undefined' && mp.enabled && mp.nameMap[currentPlayer])
        ? mp.nameMap[currentPlayer].toUpperCase()
        : `MARSHAL ${romanNum[currentPlayer]}`;
    document.getElementById('game-status').innerText =
        players[currentPlayer].bankrupt ? 'SKIPPING...' : `${statusLabel}'S TURN`;
    if (players[currentPlayer].bankrupt &&
        (typeof mp === 'undefined' || !mp.enabled || mp.isHost)) {
        setTimeout(finalizeTurn, 500);
    }
}

// =====================================================================
//  VISUAL ENHANCEMENTS
// =====================================================================

// ── Helpers ───────────────────────────────────────────────────────────
function _reflow(el) { void el.offsetWidth; }

function _showModal(modal, type) {
    modal.style.display = 'block';
    modal.classList.remove('modal-anim', 'modal-card-anim');
    _reflow(modal);
    modal.classList.add(type === 'card' ? 'modal-card-anim' : 'modal-anim');
}

// ── Board zoom during movement ────────────────────────────────────────
function boardZoomIn()  { const b = document.querySelector('.board-frame'); if (b) b.classList.add('board-zoomed'); }
function boardZoomOut() { const b = document.querySelector('.board-frame'); if (b) b.classList.remove('board-zoomed'); }

// ── Board shake on bankruptcy ─────────────────────────────────────────
function boardShake() {
    const b = document.querySelector('.board-frame');
    if (!b) return;
    b.classList.remove('board-shaking');
    _reflow(b);
    b.classList.add('board-shaking');
    setTimeout(() => b.classList.remove('board-shaking'), 600);
}

// ── Board entrance on game start ──────────────────────────────────────
function boardEntrance() {
    const b = document.querySelector('.board-frame');
    if (!b) return;
    b.classList.remove('board-entering');
    _reflow(b);
    b.classList.add('board-entering');
    setTimeout(() => b.classList.remove('board-entering'), 950);
}

// ── FLIP token animation (smooth glide between spaces) ────────────────
function moveTokenFLIP(tokenEl, targetTray) {
    if (!tokenEl || !targetTray) return;
    const from = tokenEl.getBoundingClientRect();
    targetTray.appendChild(tokenEl);
    const to   = tokenEl.getBoundingClientRect();
    const dx   = from.left - to.left;
    const dy   = from.top  - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    tokenEl.style.transition = 'none';
    tokenEl.style.transform  = `translate(${dx}px,${dy}px) scale(1.3)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        tokenEl.style.transition = 'transform 0.16s cubic-bezier(0.25,0.46,0.45,0.94)';
        tokenEl.style.transform  = 'translate(0,0) scale(1.3)';
    }));
}

// ── Step trail glow ───────────────────────────────────────────────────
function trailGlow(spaceId) {
    const el = document.getElementById(spaceId);
    if (!el) return;
    el.classList.remove('trail-glow');
    _reflow(el);
    el.classList.add('trail-glow');
    setTimeout(() => el.classList.remove('trail-glow'), 700);
}

// ── Landing flash + token bounce ──────────────────────────────────────
function landingEffects(spaceId, tokenEl) {
    const el = document.getElementById(spaceId);
    if (el) {
        el.classList.remove('land-flash');
        _reflow(el);
        el.classList.add('land-flash');
        setTimeout(() => el.classList.remove('land-flash'), 850);
    }
    if (tokenEl) {
        tokenEl.style.transition = '';
        tokenEl.style.transform  = '';
        tokenEl.classList.remove('is-landing', 'is-moving');
        _reflow(tokenEl);
        tokenEl.classList.add('is-landing');
        setTimeout(() => { tokenEl.classList.remove('is-landing'); tokenEl.style.transform = ''; }, 550);
    }
}

// ── GO corner flash ───────────────────────────────────────────────────
function flashGO() {
    const el = document.getElementById('s0');
    if (!el) return;
    el.classList.remove('go-flash');
    _reflow(el);
    el.classList.add('go-flash');
    setTimeout(() => el.classList.remove('go-flash'), 900);
}

// ── Property claim sweep ──────────────────────────────────────────────
function animateOwnerClaim(pos) {
    const el  = document.getElementById(`s${pos}`);
    const ind = el && el.querySelector('.owner-indicator');
    if (!ind) return;
    ind.classList.remove('claim-sweep');
    _reflow(ind);
    ind.classList.add('claim-sweep');
    setTimeout(() => ind.classList.remove('claim-sweep'), 700);
}

// ── Building pop-in ───────────────────────────────────────────────────
function towerPopIn(pos) {
    const el    = document.getElementById(`s${pos}`);
    const badge = el && el.querySelector('.tower-display');
    if (!badge) return;
    badge.classList.remove('popping');
    _reflow(badge);
    badge.classList.add('popping');
    setTimeout(() => badge.classList.remove('popping'), 500);
}

// ── Floating cash delta ───────────────────────────────────────────────
const _prevCash = {};
let   _prevCashReady = false;

function showCashDelta(playerId, amount) {
    const box = document.getElementById(`box-${playerId}`);
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const el   = document.createElement('div');
    el.className   = 'cash-delta';
    el.textContent = (amount >= 0 ? '+$' : '-$') + Math.abs(amount);
    el.style.color = amount >= 0 ? '#55ff55' : '#ff5555';
    el.style.left  = (rect.left + rect.width * 0.55) + 'px';
    el.style.top   = (rect.top  + rect.height * 0.35) + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
}

// ── Active token pulse ────────────────────────────────────────────────
function updateActiveTokenPulse() {
    players.forEach(p => {
        const t = document.getElementById(`token-${p.id}`);
        if (t) t.classList.remove('is-active');
    });
    const active = document.getElementById(`token-${players[currentPlayer].id}`);
    if (active && !active.classList.contains('is-moving')) active.classList.add('is-active');
}

// ── Player box flash on turn start ────────────────────────────────────
function flashPlayerBox(idx) {
    const box = document.getElementById(`box-${idx + 1}`);
    if (!box) return;
    box.classList.remove('turn-flash');
    _reflow(box);
    box.classList.add('turn-flash');
    setTimeout(() => box.classList.remove('turn-flash'), 700);
}

// ── Doubles particle burst ────────────────────────────────────────────
function spawnDoublesParticles() {
    const dome = document.querySelector('.dome-container');
    if (!dome) return;
    const rect = dome.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    for (let i = 0; i < 14; i++) {
        const el    = document.createElement('div');
        el.className = 'p-particle';
        const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const dist  = 55 + Math.random() * 90;
        el.style.setProperty('--px', Math.cos(angle) * dist + 'px');
        el.style.setProperty('--py', Math.sin(angle) * dist + 'px');
        el.style.left       = cx + 'px';
        el.style.top        = cy + 'px';
        el.style.background = i % 3 === 0 ? '#fff' : 'var(--gold)';
        el.style.animationDelay = (i * 0.03) + 's';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 750);
    }
}

// ── Setup player name + avatar on info boxes ──────────────────────────
function setupPlayerUI() {
    const defaults = ['MARSHAL I', 'MARSHAL II', 'MARSHAL III', 'MARSHAL IV'];
    players.forEach((p, i) => {
        const name = (typeof mp !== 'undefined' && mp.enabled && mp.nameMap && mp.nameMap[i])
            ? mp.nameMap[i].toUpperCase() : defaults[i];
        const avatar = (typeof mp !== 'undefined' && mp.enabled && mp.avatarMap && mp.avatarMap[i])
            ? mp.avatarMap[i]
            : `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`;
        const nameEl   = document.getElementById(`p${p.id}-name`);
        const avatarEl = document.getElementById(`p${p.id}-avatar`);
        if (nameEl)   nameEl.textContent = name;
        if (avatarEl) { avatarEl.src = avatar; avatarEl.style.display = 'block'; }
        _prevCash[p.id] = p.cash;
    });
    _prevCashReady = true;
}

// =====================================================================
//  PHYSICS / DICE
// =====================================================================
function runPhysics() {
    if (isProcessing) return;
    if (typeof mp !== 'undefined' && mp.enabled && currentPlayer !== mp.myIndex) return;
    clearTurnTimer();
    const p   = players[currentPlayer];
    const btn = document.getElementById('roll-trigger');
    btn.disabled = true;

    const roll1    = Math.floor(Math.random() * 6) + 1;
    const roll2    = Math.floor(Math.random() * 6) + 1;
    const isDouble = (roll1 === roll2);

    if (isDouble) {
        document.getElementById('dome').classList.add('double-resonance');
        addLog(currentPlayer, 'ARCANE RESONANCE DETECTED — DOUBLES!');
        setTimeout(spawnDoublesParticles, 850); // burst after dice settle
    } else {
        document.getElementById('dome').classList.remove('double-resonance');
    }

    const rotMap = [null,{x:0,y:0},{x:0,y:-90},{x:-90,y:0},{x:90,y:0},{x:0,y:90},{x:0,y:180}];
    [document.getElementById('dice1'), document.getElementById('dice2')].forEach((die, i) => {
        const val = i === 0 ? roll1 : roll2;
        die.style.transition = 'none';
        die.style.transform  = 'translate3d(0,0,150px)';
        setTimeout(() => {
            die.style.transition = 'transform 1s cubic-bezier(0.15, 0.9, 0.3, 1.3)';
            die.style.transform  = `translate3d(${i === 0 ? -60 : 60}px, 0, 0) rotateX(${1440 + rotMap[val].x}deg) rotateY(${1440 + rotMap[val].y}deg)`;
        }, 50);
    });

    setTimeout(() => {
        if (p.inJail) {
            if (isDouble) {
                p.inJail = false; p.jailTurns = 0;
                document.getElementById('dome').classList.remove('double-resonance');
                addLog(currentPlayer, 'ARCANE RESONANCE BREAKS THE BAN LIST SEAL — ESCAPED!');
                movePlayer(roll1 + roll2, false);
            } else {
                p.jailTurns++;
                if (p.jailTurns >= 3) {
                    const bribe = isHardOrBeyond() ? 100 : 50;
                    p.cash -= bribe; p.inJail = false; p.jailTurns = 0;
                    addLog(currentPlayer, `PAID $${bribe} BRIBE — RELEASED FROM THE BAN LIST`);
                    handleDebt(p, () => movePlayer(roll1 + roll2, false));
                } else {
                    addLog(currentPlayer, `IMPRISONED IN THE BAN LIST (TURN ${p.jailTurns}/3)`);
                    finalizeTurn(false);
                }
            }
            return;
        }
        if (isDouble) {
            doubleCount++;
            if (doubleCount >= 3) {
                addLog(currentPlayer, 'RECKLESS VALOR DETECTED — SENTENCED TO THE BAN LIST!');
                moveDirectlyTo(10, true);
                return;
            }
            document.getElementById('game-status').innerText = 'ARCANE RESONANCE — ROLL AGAIN!';
        } else {
            doubleCount = 0;
        }
        movePlayer(roll1 + roll2, isDouble);
    }, 1100);
}

function movePlayer(steps, isDouble) {
    isProcessing = true;
    const p       = players[currentPlayer];
    const tokenEl = document.getElementById(`token-${p.id}`);
    let   stepCount = 0;
    boardZoomIn();
    if (tokenEl) { tokenEl.classList.remove('is-active'); tokenEl.classList.add('is-moving'); }

    const moveInterval = setInterval(() => {
        p.pos = (p.pos + 1) % 40;
        if (p.pos === 0 && !isInsaneOrBeyond()) {
            p.cash += 200; addLog(currentPlayer, 'PASSED ASCENSION ACHIEVE — RECEIVED $200 GOLD');
            flashGO();
        } else if (p.pos === 0 && isInsaneOrBeyond()) {
            addLog(currentPlayer, 'PASSED ASCENSION ACHIEVE — NO BONUS (INSANE MODE)');
            flashGO();
        }
        trailGlow(`s${p.pos}`);
        const tray = document.getElementById(`s${p.pos}`).querySelector('.token-tray') || document.getElementById(`s${p.pos}`);
        moveTokenFLIP(tokenEl, tray);

        if (++stepCount >= steps) {
            clearInterval(moveInterval);
            setTimeout(() => {
                boardZoomOut();
                landingEffects(`s${p.pos}`, tokenEl);
                setTimeout(() => {
                    updateActiveTokenPulse();
                    processLanding(p, isDouble);
                }, 220);
            }, 180);
        }
    }, 210);
}

function moveDirectlyTo(pos, jail) {
    const p       = players[currentPlayer];
    const tokenEl = document.getElementById(`token-${p.id}`);
    if (jail && p.banLiftPass) {
        p.banLiftPass = false;
        addLog(currentPlayer, 'BAN LIFT PASS ACTIVATED — Gaeto intervenes! Immediate release from the Ban List!');
        updateUI();
        finalizeTurn(false);
        return;
    }
    p.pos = pos;
    if (jail) { p.inJail = true; p.jailTurns = 0; }
    const dest = document.getElementById(`s${pos}`);
    const tray = dest.querySelector('.token-tray') || dest;
    moveTokenFLIP(tokenEl, tray);
    setTimeout(() => landingEffects(`s${pos}`, tokenEl), 200);
    finalizeTurn(false);
}

// =====================================================================
//  LANDING
// =====================================================================
function processLanding(p, isDouble) {
    if (p.pos === 30) { addLog(currentPlayer, 'EXPLOITS DETECTED — BANISHED TO THE BAN LIST!'); moveDirectlyTo(10, true); return; }
    if (p.pos === 4)  { const tithe = isHardOrBeyond() ? 400 : 200; p.cash -= tithe; addLog(currentPlayer, `PAID TERRITORY TITHE — $${tithe} GOLD COLLECTED BY THE CROWN`); }
    if (p.pos === 38) { const levy  = isHardOrBeyond() ? 200 : 100; p.cash -= levy;  addLog(currentPlayer, `PAID GUILD LEVY — $${levy} GOLD TO THE ALLIANCE`); }

    const afterTaxes = () => {
        if (p.bankrupt) { finalizeTurn(false); return; }

        if (p.pos === 7 || p.pos === 22 || p.pos === 36) {
            const card = drawCard(chanceCards);
            showCardModal('oracle', card, p, isDouble);
            return;
        }
        if (p.pos === 2 || p.pos === 17 || p.pos === 33) {
            const card = drawCard(chestCards);
            showCardModal('vault', card, p, isDouble);
            return;
        }

        const prop = propertyData[p.pos];
        if (prop) {
            if (!prop.owner) {
                showConquestModal(p, prop, isDouble); return;
            } else if (prop.owner !== p.id) {
                showDiplomacyModal(p, prop, isDouble);
                return;
            } else {
                showBuildModal(p, prop, isDouble); return;
            }
        }
        finalizeTurn(isDouble);
    };

    handleDebt(p, afterTaxes);
}

// =====================================================================
//  MODALS
// =====================================================================
function showConquestModal(p, prop, isDouble) {
    const modal     = document.getElementById('decision-modal');
    const canAfford = p.cash >= prop.price;
    const group     = getColorGroup(prop.pos);
    const groupSize = group ? group.length : 0;
    const owned     = group ? group.filter(pos => propertyData[pos] && propertyData[pos].owner === p.id).length : 0;

    document.getElementById('modal-title').innerText = 'TERRITORY CONQUEST';
    document.getElementById('modal-text').innerHTML  =
        `DECLARE CONQUEST ON <b style="color:var(--gold)">${prop.name}</b>?<br>
         Conquest Cost: <b>$${prop.price}</b><br>
         <span style="color:${canAfford ? '#8f8' : '#f55'}">Guild Coffers: $${p.cash}</span><br>
         Domain Progress: <span style="color:#aaa">${owned}/${groupSize} territories controlled</span><br>
         <span style="color:#666;font-size:11px;">Control the full domain to double tribute &amp; unlock Guild Towers</span>`;
    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';

    const buy = document.createElement('button');
    buy.className = 'modal-btn'; buy.innerText = 'CONQUER TERRITORY';
    if (!canAfford) { buy.disabled = true; buy.style.opacity = '0.3'; }
    buy.onclick = () => {
        if (p.cash >= prop.price) {
            clearTurnTimer();
            p.cash -= prop.price;
            prop.owner = p.id;
            document.getElementById(`s${p.pos}`).querySelector('.owner-indicator').style.borderColor = p.hex;
            animateOwnerClaim(p.pos);
            const nowControls = ownsColorGroup(p.id, prop.pos);
            addLog(currentPlayer, `TERRITORY CONQUERED: ${prop.name}${nowControls ? ' — DOMAIN SECURED! TRIBUTE DOUBLED!' : ''}`);
            modal.style.display = 'none';
            finalizeTurn(isDouble);
        }
    };
    const skip = document.createElement('button');
    skip.className = 'modal-btn'; skip.innerText = 'WITHDRAW';
    skip.onclick   = () => { clearTurnTimer(); modal.style.display = 'none'; finalizeTurn(isDouble); };
    acts.append(buy, skip);
    _showModal(modal);
}

function showBuildModal(p, prop, isDouble) {
    const modal      = document.getElementById('decision-modal');
    const towerCost  = Math.floor(prop.price * 0.5);
    const canAfford  = p.cash >= towerCost;
    const canBuild   = canBuildOnProp(prop);
    const hasControl = ownsColorGroup(p.id, prop.pos);
    let statusStr, buildLabel = null;

    if (prop.type === 'transport') {
        statusStr = `<span style="color:#888">Transport waypoints cannot be fortified.</span>`;
    } else if (prop.fortress) {
        statusStr = `Fortification: <span style="color:var(--gold)">FORTRESS [MAXIMUM DEFENSE]</span>`;
    } else if (!hasControl) {
        const group   = getColorGroup(prop.pos);
        const missing = group.filter(pos => !(propertyData[pos] && propertyData[pos].owner === p.id))
                             .map(pos => propertyData[pos] ? propertyData[pos].name : '?').join(', ');
        statusStr = `Towers: ${prop.towers}/4 &mdash; <span style="color:#f88">Conquer full domain first</span><br>
                     <span style="color:#666;font-size:11px;">Still needed: ${missing}</span>`;
    } else if (!canBuild) {
        statusStr = `Towers: ${prop.towers}/4 &mdash; <span style="color:#f88">Even-build rule — fortify your other territories to ${prop.towers} tower${prop.towers !== 1 ? 's' : ''} first</span>`;
    } else if (prop.towers >= 4) {
        statusStr  = `Towers: N/E/S/W &mdash; <span style="color:var(--gold)">Upgrade to FORTRESS ($${towerCost})</span>`;
        buildLabel = 'BUILD FORTRESS';
    } else {
        const nextDir = towerDirs[prop.towers];
        statusStr  = `Towers: ${towerDirs.slice(0, prop.towers).join('/')||'none'}/4 &mdash; <span style="color:#8f8">Build ${nextDir} Tower ($${towerCost})</span>`;
        buildLabel = `BUILD ${nextDir} TOWER`;
    }

    document.getElementById('modal-title').innerText = 'YOUR TERRITORY';
    document.getElementById('modal-text').innerHTML  =
        `<b style="color:var(--gold)">${prop.name}</b><br>
         ${statusStr}<br>
         Invaders currently pay: <span style="color:var(--gold)">$${calcRent(prop)} territory tribute</span>`;

    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';

    if (buildLabel) {
        const buildBtn = document.createElement('button');
        buildBtn.className = 'modal-btn'; buildBtn.innerText = buildLabel;
        if (!canAfford) { buildBtn.disabled = true; buildBtn.style.opacity = '0.3'; }
        buildBtn.onclick = () => {
            if (p.cash >= towerCost) {
                clearTurnTimer();
                p.cash -= towerCost;
                if (prop.towers >= 4) {
                    prop.fortress = true;
                    addLog(currentPlayer, `FORTRESS ERECTED AT ${prop.name}! TERRITORY IS IMPENETRABLE!`);
                } else {
                    prop.towers += 1;
                    addLog(currentPlayer, `${towerDirs[prop.towers - 1]} TOWER RAISED AT ${prop.name}`);
                }
                updateBuildingDisplay(p.pos, prop);
                modal.style.display = 'none';
                finalizeTurn(isDouble);
            }
        };
        acts.append(buildBtn);
    }

    const leave = document.createElement('button');
    leave.className = 'modal-btn'; leave.innerText = 'DISMISS';
    leave.onclick   = () => { clearTurnTimer(); modal.style.display = 'none'; finalizeTurn(isDouble); };
    acts.append(leave);
    _showModal(modal);
}

function showCardModal(deckType, card, p, isDouble) {
    const modal = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = deckType === 'oracle' ? "GAETO'S DECREE" : "BILINS' DECREE";
    document.getElementById('modal-text').innerHTML  =
        `<div style="font-size:16px;color:var(--gold);margin-bottom:10px;letter-spacing:2px;">${card.title}</div>
         <div style="color:#ccc;font-size:13px;">${card.desc}</div>`;
    const acts  = document.getElementById('modal-actions');
    acts.innerHTML = '';
    const okBtn = document.createElement('button');
    okBtn.className   = 'modal-btn'; okBtn.innerText = 'INVOKE DECREE';
    okBtn.onclick     = () => { clearTurnTimer(); modal.style.display = 'none'; resolveCard(card, p, isDouble); };
    acts.append(okBtn);
    _showModal(modal, 'card');
}

// =====================================================================
//  TRADE SYSTEM
// =====================================================================
function initiateTrade() {
    if (isProcessing) return;
    if (document.getElementById('decision-modal').style.display === 'block') return;
    if (isInsaneOrBeyond()) return;
    if (typeof mp !== 'undefined' && mp.enabled) return;
    const p = players[currentPlayer];
    if (p.bankrupt) return;
    const hasTargets = players.some(t =>
        t.id !== p.id && !t.bankrupt &&
        Object.values(propertyData).some(pr => pr.owner === t.id)
    );
    if (!hasTargets) return;
    extendTurnTimer(20);
    showTradeSetup(p);
}

function showTradeSetup(p) {
    const modal = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = 'PROPOSE TERRITORY TRADE';
    const textEl = document.getElementById('modal-text');
    textEl.innerHTML = '<div style="color:#aaa;font-size:12px;margin-bottom:10px;">Select a Marshal to negotiate with:</div>';
    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';

    players.forEach(target => {
        if (target.id === p.id || target.bankrupt) return;
        if (!Object.values(propertyData).some(pr => pr.owner === target.id)) return;
        const btn = document.createElement('button');
        btn.className   = 'modal-btn';
        btn.style.cssText = `display:block;width:90%;margin:0 auto 8px;border:2px solid ${target.hex};color:${target.hex};background:#000;`;
        btn.textContent = `MARSHAL ${romanNum[target.id - 1]}`;
        btn.onclick     = () => showTradeDesire(p, target);
        acts.appendChild(btn);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'modal-btn';
    cancelBtn.style.cssText = 'background:#222;color:#666;margin-top:4px;';
    cancelBtn.textContent = 'CANCEL';
    cancelBtn.onclick     = () => { modal.style.display = 'none'; };
    acts.appendChild(cancelBtn);
    _showModal(modal);
}

function showTradeDesire(p, target) {
    const modal = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = 'WHAT TERRITORY DO YOU SEEK?';
    const desired        = new Set();
    const ownedByTarget  = Object.values(propertyData).filter(pr => pr.owner === target.id);

    const textEl = document.getElementById('modal-text');
    textEl.innerHTML = `<div style="color:#aaa;font-size:12px;margin-bottom:8px;">Select territory(s) from <span style="color:${target.hex}">Marshal ${romanNum[target.id - 1]}</span>:</div>`;

    const listDiv = document.createElement('div');
    listDiv.style.cssText = 'max-height:210px;overflow-y:auto;';
    ownedByTarget.forEach(pr => {
        const row = document.createElement('div');
        row.style.cssText = 'padding:5px 8px;cursor:pointer;border:1px solid #333;margin-bottom:3px;font-size:12px;';
        row.innerHTML = `<span style="color:var(--gold)">${pr.name}</span>`
            + (pr.fortress ? ' <span style="color:var(--gold)">[STRONGHOLD]</span>' : pr.towers > 0 ? ` <span style="color:#8f8">[${pr.towers}T]</span>` : '')
            + ` <span style="color:#666">$${calcRent(pr)} tribute</span>`;
        row.onclick = () => {
            if (desired.has(pr.pos)) {
                desired.delete(pr.pos);
                row.style.background = ''; row.style.borderColor = '#333';
            } else {
                desired.add(pr.pos);
                row.style.background = 'rgba(212,175,55,0.12)'; row.style.borderColor = 'var(--gold)';
            }
        };
        listDiv.appendChild(row);
    });
    textEl.appendChild(listDiv);

    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'modal-btn'; nextBtn.textContent = 'NEXT: BUILD OFFER \u2192';
    nextBtn.onclick   = () => { if (desired.size > 0) showTradeOffer(p, target, [...desired]); };
    acts.appendChild(nextBtn);
    const backBtn = document.createElement('button');
    backBtn.className   = 'modal-btn'; backBtn.style.cssText = 'background:#222;color:#666;';
    backBtn.textContent = '\u2190 BACK';
    backBtn.onclick     = () => showTradeSetup(p);
    acts.appendChild(backBtn);
    _showModal(modal);
}

function showTradeOffer(p, target, desiredPositions) {
    const modal = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = 'BUILD YOUR OFFER';
    let offeredGold = 0;
    const offeredTerritories = new Set();

    const renderOffer = () => {
        const textEl = document.getElementById('modal-text');
        textEl.innerHTML = '';

        const seekDiv = document.createElement('div');
        seekDiv.style.cssText = 'font-size:12px;margin-bottom:8px;padding:6px;background:#111;';
        seekDiv.innerHTML = `<span style="color:#aaa">Seeking:</span> `
            + desiredPositions.map(pos => `<span style="color:var(--gold)">${propertyData[pos].name}</span>`).join(', ');
        textEl.appendChild(seekDiv);

        const goldRow = document.createElement('div');
        goldRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;flex-wrap:wrap;';
        const minusBtn = document.createElement('button');
        minusBtn.className = 'modal-btn'; minusBtn.style.cssText = 'padding:2px 10px;margin:0;font-size:11px;';
        minusBtn.textContent = '-50';
        minusBtn.onclick = () => { offeredGold = Math.max(0, offeredGold - 50); renderOffer(); };
        const goldVal = document.createElement('span');
        goldVal.style.cssText = 'color:var(--gold);font-weight:900;min-width:55px;text-align:center;';
        goldVal.textContent   = `$${offeredGold}`;
        const plusBtn = document.createElement('button');
        plusBtn.className = 'modal-btn'; plusBtn.style.cssText = 'padding:2px 10px;margin:0;font-size:11px;';
        plusBtn.textContent = '+50';
        plusBtn.onclick = () => { offeredGold = Math.min(p.cash, offeredGold + 50); renderOffer(); };
        const haveSpan = document.createElement('span');
        haveSpan.style.cssText = 'color:#555;font-size:10px;';
        haveSpan.textContent   = `(treasury: $${p.cash})`;
        goldRow.innerHTML = '<span style="color:#aaa;min-width:45px;">Gold:</span>';
        goldRow.append(minusBtn, goldVal, plusBtn, haveSpan);
        textEl.appendChild(goldRow);

        const ownedByP = Object.values(propertyData).filter(pr => pr.owner === p.id && !desiredPositions.includes(pr.pos));
        if (ownedByP.length > 0) {
            const territoryLabel = document.createElement('div');
            territoryLabel.style.cssText = 'color:#aaa;font-size:12px;margin-bottom:4px;';
            territoryLabel.textContent = 'Also offer territory(s):';
            textEl.appendChild(territoryLabel);
            const territoryList = document.createElement('div');
            territoryList.style.cssText = 'max-height:110px;overflow-y:auto;';
            ownedByP.forEach(pr => {
                const sel = offeredTerritories.has(pr.pos);
                const row = document.createElement('div');
                row.style.cssText = `padding:4px 7px;cursor:pointer;border:1px solid ${sel ? 'var(--gold)' : '#333'};margin-bottom:2px;font-size:11px;background:${sel ? 'rgba(212,175,55,0.12)' : ''};`;
                row.innerHTML = `${pr.name}` + (pr.fortress ? ' [STRONGHOLD]' : pr.towers > 0 ? ` [${pr.towers}T]` : '');
                row.onclick   = () => {
                    if (offeredTerritories.has(pr.pos)) offeredTerritories.delete(pr.pos);
                    else offeredTerritories.add(pr.pos);
                    renderOffer();
                };
                territoryList.appendChild(row);
            });
            textEl.appendChild(territoryList);
        }

        const parts = [];
        if (offeredGold > 0) parts.push(`$${offeredGold} gold`);
        if (offeredTerritories.size > 0) parts.push([...offeredTerritories].map(pos => propertyData[pos].name).join(', '));
        const sumDiv = document.createElement('div');
        sumDiv.style.cssText = 'margin-top:8px;padding:5px;background:#111;font-size:11px;color:#888;';
        sumDiv.textContent   = `Offering: ${parts.length ? parts.join(' + ') : '(nothing yet — must offer something)'}`;
        textEl.appendChild(sumDiv);

        const acts = document.getElementById('modal-actions');
        acts.innerHTML = '';
        const sendBtn = document.createElement('button');
        sendBtn.className = 'modal-btn'; sendBtn.textContent = 'DISPATCH ENVOY \u2192';
        if (offeredGold === 0 && offeredTerritories.size === 0) { sendBtn.disabled = true; sendBtn.style.opacity = '0.3'; }
        sendBtn.onclick = () => showTradeDecision(p, target, desiredPositions, offeredGold, [...offeredTerritories]);
        acts.appendChild(sendBtn);
        const backBtn = document.createElement('button');
        backBtn.className   = 'modal-btn'; backBtn.style.cssText = 'background:#222;color:#666;';
        backBtn.textContent = '\u2190 BACK';
        backBtn.onclick     = () => showTradeDesire(p, target);
        acts.appendChild(backBtn);
        _showModal(modal);
    };
    renderOffer();
}

function showTradeDecision(initiator, target, desiredPositions, offeredGold, offeredPositions) {
    const modal = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = `ENVOY ARRIVES \u2014 MARSHAL ${romanNum[target.id - 1]}`;

    const textEl = document.getElementById('modal-text');
    textEl.innerHTML = '';
    const fromLine = document.createElement('div');
    fromLine.style.cssText = 'font-size:13px;margin-bottom:10px;';
    fromLine.innerHTML = `<span style="color:${initiator.hex}">Marshal ${romanNum[initiator.id - 1]}</span> proposes a territory pact:`;
    textEl.appendChild(fromLine);

    const offerParts = [];
    if (offeredGold > 0) offerParts.push(`<span style="color:var(--gold)">$${offeredGold} gold</span>`);
    offeredPositions.forEach(pos => offerParts.push(`<span style="color:#8f8">${propertyData[pos].name}</span>`));
    const offerBox = document.createElement('div');
    offerBox.style.cssText = 'padding:8px;background:#0d1a0d;border:1px solid #1a3a1a;margin-bottom:6px;font-size:12px;';
    offerBox.innerHTML = `They give: ${offerParts.length ? offerParts.join(' + ') : '<span style="color:#555">nothing</span>'}`;
    textEl.appendChild(offerBox);

    const wantBox = document.createElement('div');
    wantBox.style.cssText = 'padding:8px;background:#1a0d0d;border:1px solid #3a1a1a;font-size:12px;';
    wantBox.innerHTML = `They receive: ${desiredPositions.map(pos => `<span style="color:#f88">${propertyData[pos].name}</span>`).join(', ')}`;
    textEl.appendChild(wantBox);

    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';

    const acceptBtn = document.createElement('button');
    acceptBtn.className   = 'modal-btn';
    acceptBtn.style.cssText = 'background:#004400;color:#aaffaa;';
    acceptBtn.textContent = 'SEAL THE PACT';

    const doReject = () => {
        clearTurnTimer();
        addLog(initiator.id - 1, `TRADE PROPOSAL REJECTED BY MARSHAL ${romanNum[target.id - 1]}`);
        modal.style.display = 'none';
    };

    acceptBtn.onclick = () => {
        clearTurnTimer();
        initiator.cash -= offeredGold;
        target.cash    += offeredGold;
        offeredPositions.forEach(pos => {
            propertyData[pos].owner = target.id;
            const ind = document.getElementById(`s${pos}`)?.querySelector('.owner-indicator');
            if (ind) ind.style.borderColor = target.hex;
        });
        desiredPositions.forEach(pos => {
            propertyData[pos].owner = initiator.id;
            const ind = document.getElementById(`s${pos}`)?.querySelector('.owner-indicator');
            if (ind) ind.style.borderColor = initiator.hex;
        });
        const gaveStr = [...(offeredGold > 0 ? [`$${offeredGold}`] : []),
                         ...offeredPositions.map(pos => propertyData[pos].name)].join(' + ') || 'goodwill';
        const gotStr  = desiredPositions.map(pos => propertyData[pos].name).join(', ');
        addLog(initiator.id - 1, `TRADE PACT SEALED \u2014 Gave ${gaveStr}, received ${gotStr}`);
        addLog(target.id   - 1, `TRADE PACT SEALED \u2014 Gave ${gotStr}, received ${gaveStr}`);
        modal.style.display = 'none';
        updateUI();
    };
    acts.appendChild(acceptBtn);

    const declineBtn = document.createElement('button');
    declineBtn.className   = 'modal-btn';
    declineBtn.style.cssText = 'background:#7a0000;color:#ffaaaa;';
    declineBtn.textContent = 'REJECT THE PACT';
    declineBtn.onclick     = doReject;
    acts.appendChild(declineBtn);

    _showModal(modal);
    startTurnTimer(10, doReject);
}

// =====================================================================
//  DIPLOMACY — ENEMY TERRITORY
// =====================================================================
function showDiplomacyModal(p, prop, isDouble) {
    const owner = players[prop.owner - 1];

    // ── BAN LIST RULE ──────────────────────────────────────────────────
    // If the owner is imprisoned they cannot collect war reparations.
    if (owner.inJail) {
        addLog(currentPlayer,  `PASSED THROUGH ${prop.name} — OWNER IS ON THE BAN LIST, NO TRIBUTE OWED`);
        addLog(prop.owner - 1, `${prop.name} — IMPRISONED, COULD NOT COLLECT TRIBUTE FROM MARSHAL ${romanNum[p.id - 1]}`);
        finalizeTurn(isDouble);
        return;
    }

    const base    = calcRent(prop);
    const tribute = isHell() ? base * 2 : base;
    const modal   = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = 'ENTERING ENEMY TERRITORY';
    document.getElementById('modal-text').innerHTML  =
        `Your forces enter <b style="color:var(--gold)">${prop.name}</b><br>
         Domain of <span style="color:${owner.hex}">Marshal ${romanNum[prop.owner - 1]}</span><br>
         <span style="color:#aaa;font-size:12px;">War reparations if charged: <b style="color:#f88">$${tribute} gold</b></span>` +
        (isHell() ? `<br><span style="color:#900;font-size:11px;">HELL MODE — reparations doubled</span>` : '');

    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';

    const payTribute = () => {
        clearTurnTimer();
        modal.style.display = 'none';
        p.cash -= tribute; owner.cash += tribute;
        addLog(currentPlayer,  `INVADED ${prop.name} \u2014 COMBAT ENGAGED! PAID $${tribute} WAR REPARATIONS`);
        addLog(prop.owner - 1, `${prop.name} DEFENDED! COLLECTED $${tribute} WAR REPARATIONS`);
        handleDebt(p, () => finalizeTurn(isDouble));
    };

    if (!isInsaneOrBeyond() && (typeof mp === 'undefined' || !mp.enabled)) {
        const peaceBtn = document.createElement('button');
        peaceBtn.className   = 'modal-btn';
        peaceBtn.style.cssText = 'background:#003a5c;color:#aaddff;';
        peaceBtn.textContent = 'RAISE WHITE BANNER';
        peaceBtn.onclick     = () => { clearTurnTimer(); modal.style.display = 'none'; showOwnerDecisionModal(p, prop, isDouble, tribute); };
        acts.appendChild(peaceBtn);
    }

    const warBtn = document.createElement('button');
    warBtn.className   = 'modal-btn';
    warBtn.style.cssText = 'background:#5c0000;color:#ffaaaa;';
    warBtn.textContent = `PAY WAR REPARATION (\u2212$${tribute})`;
    warBtn.onclick     = payTribute;
    acts.appendChild(warBtn);
    _showModal(modal);

    startTurnTimer(5, payTribute);
}

function showOwnerDecisionModal(p, prop, isDouble, tribute) {
    const owner = players[prop.owner - 1];
    const modal = document.getElementById('decision-modal');
    document.getElementById('modal-title').innerText = `MARSHAL ${romanNum[prop.owner - 1]} \u2014 YOUR DECREE`;
    document.getElementById('modal-text').innerHTML  =
        `<span style="color:${p.hex}">Marshal ${romanNum[p.id - 1]}</span> approaches
         <b style="color:var(--gold)">${prop.name}</b> bearing a white banner.<br><br>
         <span style="color:#aaa;font-size:12px;">Do you honor the truce, or demand war reparations?</span><br>
         <span style="color:#666;font-size:11px;">Tribute if charged: $${tribute} gold — auto-charge in 5s</span>`;

    const acts = document.getElementById('modal-actions');
    acts.innerHTML = '';

    const doCharge = () => {
        clearTurnTimer();
        p.cash -= tribute; owner.cash += tribute;
        addLog(currentPlayer,  `TRUCE REJECTED \u2014 Paid $${tribute} war reparations through ${prop.name}`);
        addLog(prop.owner - 1, `TRIBUTE DEMANDED \u2014 Collected $${tribute} from Marshal ${romanNum[p.id - 1]}`);
        modal.style.display = 'none';
        handleDebt(p, () => finalizeTurn(isDouble));
    };

    const truceBtn = document.createElement('button');
    truceBtn.className   = 'modal-btn';
    truceBtn.style.cssText = 'background:#003300;color:#aaffaa;';
    truceBtn.textContent = 'HONOR THE TRUCE';
    truceBtn.onclick     = () => {
        clearTurnTimer();
        addLog(currentPlayer,  `TRUCE GRANTED \u2014 Passed through ${prop.name} peacefully`);
        addLog(prop.owner - 1, `TRUCE HONORED \u2014 Marshal ${romanNum[p.id - 1]} allowed passage through ${prop.name}`);
        modal.style.display = 'none'; finalizeTurn(isDouble);
    };
    acts.appendChild(truceBtn);

    const demandBtn = document.createElement('button');
    demandBtn.className   = 'modal-btn';
    demandBtn.style.cssText = 'background:#5c0000;color:#ffaaaa;';
    demandBtn.textContent = `DEMAND REPARATIONS ($${tribute})`;
    demandBtn.onclick     = doCharge;
    acts.appendChild(demandBtn);
    _showModal(modal);

    startTurnTimer(5, doCharge);
}

// =====================================================================
//  CARD RESOLUTION
// =====================================================================
function resolveCard(card, p, isDouble) {
    switch (card.effect) {

        case 'collect': {
            p.cash += card.amount;
            addLog(currentPlayer, `[${card.title}] Received $${card.amount} gold`);
            finalizeTurn(isDouble);
            break;
        }

        case 'pay': {
            const amt = card.amount * (isNightmareOrBeyond() ? 2 : 1);
            p.cash -= amt;
            addLog(currentPlayer, `[${card.title}] Paid $${amt} gold`);
            handleDebt(p, () => finalizeTurn(isDouble));
            break;
        }

        case 'collect_all': {
            let total = 0;
            players.forEach((other, i) => {
                if (other.id !== p.id && !other.bankrupt) {
                    other.cash -= card.amount;
                    p.cash     += card.amount;
                    total      += card.amount;
                    addLog(i, `[${card.title}] Paid $${card.amount} tribute to Marshal ${romanNum[currentPlayer]}`);
                    if (other.cash < 0) { other.bankrupt = true; other.cash = 0; addLog(i, 'GUILD TREASURY DEPLETED — MARSHAL EXILED FROM THE TERRITORY'); }
                }
            });
            addLog(currentPlayer, `[${card.title}] Collected $${total} total tribute`);
            finalizeTurn(isDouble);
            break;
        }

        case 'pay_all': {
            const perAmt = card.amount * (isNightmareOrBeyond() ? 2 : 1);
            let total = 0;
            players.forEach((other, i) => {
                if (other.id !== p.id && !other.bankrupt) {
                    p.cash     -= perAmt;
                    other.cash += perAmt;
                    total      += perAmt;
                    addLog(i, `[${card.title}] Received $${perAmt} from Marshal ${romanNum[currentPlayer]}`);
                }
            });
            addLog(currentPlayer, `[${card.title}] Paid $${total} total gold`);
            handleDebt(p, () => finalizeTurn(isDouble));
            break;
        }

        case 'pay_per_tower': {
            const towerRate   = card.amount * (isNightmareOrBeyond() ? 2 : 1);
            const totalTowers = Object.values(propertyData)
                .filter(pr => pr.owner === p.id)
                .reduce((sum, pr) => sum + (pr.fortress ? 5 : pr.towers), 0);
            const total = towerRate * totalTowers;
            p.cash -= total;
            addLog(currentPlayer, `[${card.title}] Paid $${total} upkeep (${totalTowers} tower units garrisoned)`);
            handleDebt(p, () => finalizeTurn(isDouble));
            break;
        }

        case 'pay_per_property': {
            const propRate   = card.amount * (isNightmareOrBeyond() ? 2 : 1);
            const ownedCount = Object.values(propertyData).filter(pr => pr.owner === p.id).length;
            const total      = propRate * ownedCount;
            p.cash -= total;
            addLog(currentPlayer, `[${card.title}] Paid $${total} stewardship (${ownedCount} territories)`);
            handleDebt(p, () => finalizeTurn(isDouble));
            break;
        }

        case 'go':
            if (p.pos !== 0 && !isInsaneOrBeyond()) { p.cash += 200; addLog(currentPlayer, 'PASSED ASCENSION ACHIEVE — RECEIVED $200 GOLD'); }
            p.pos = 0;
            document.getElementById('s0').querySelector('.token-tray').appendChild(document.getElementById(`token-${p.id}`));
            addLog(currentPlayer, `[${card.title}] Marched to the Ascension Achieve`);
            finalizeTurn(false);
            break;

        case 'jail':
            addLog(currentPlayer, `[${card.title}] Banished to the Ban List!`);
            moveDirectlyTo(10, true);
            break;

        case 'ban_lift':
            p.banLiftPass = true;
            addLog(currentPlayer, `[${card.title}] BAN LIFT PASS acquired — will auto-activate the next time you are sent to the Ban List!`);
            updateUI();
            finalizeTurn(isDouble);
            break;

        case 'pay_earthquake': {
            let terr = 0, tow = 0, fort = 0;
            Object.values(propertyData).forEach(pr => {
                if (pr.owner !== p.id) return;
                terr++;
                if (pr.fortress) fort++;
                else tow += pr.towers;
            });
            const quakeTotal = terr * 5 + tow * 15 + fort * 50;
            const parts = [];
            if (terr)  parts.push(`${terr} territories ×$5`);
            if (tow)   parts.push(`${tow} towers ×$15`);
            if (fort)  parts.push(`${fort} fortresses ×$50`);
            p.cash -= quakeTotal;
            addLog(currentPlayer, `[${card.title}] Earthquake repair: paid $${quakeTotal}${parts.length ? ' (' + parts.join(', ') + ')' : ''}`);
            handleDebt(p, () => finalizeTurn(isDouble));
            break;
        }

        case 'move': {
            const tgt = card.target;
            if (tgt < p.pos && !isInsaneOrBeyond()) { p.cash += 200; addLog(currentPlayer, 'PASSED ASCENSION ACHIEVE — RECEIVED $200 GOLD'); }
            p.pos = tgt;
            const destM = document.getElementById(`s${tgt}`);
            (destM.querySelector('.token-tray') || destM).appendChild(document.getElementById(`token-${p.id}`));
            addLog(currentPlayer, `[${card.title}] Army marches forward`);
            processLanding(p, false);
            break;
        }

        case 'move_back': {
            const newPos = (p.pos - card.amount + 40) % 40;
            p.pos = newPos;
            const destB = document.getElementById(`s${newPos}`);
            (destB.querySelector('.token-tray') || destB).appendChild(document.getElementById(`token-${p.id}`));
            addLog(currentPlayer, `[${card.title}] Vanguard retreats ${card.amount} spaces`);
            processLanding(p, false);
            break;
        }

        case 'nearest_transport': {
            const transports = [5, 15, 25, 35];
            let nearest = transports[0], minDist = 40;
            transports.forEach(t => {
                const dist = (t - p.pos + 40) % 40;
                if (dist > 0 && dist < minDist) { minDist = dist; nearest = t; }
            });
            if (nearest < p.pos && !isInsaneOrBeyond()) { p.cash += 200; addLog(currentPlayer, 'PASSED ASCENSION ACHIEVE — RECEIVED $200 GOLD'); }
            p.pos = nearest;
            const destT = document.getElementById(`s${nearest}`);
            (destT.querySelector('.token-tray') || destT).appendChild(document.getElementById(`token-${p.id}`));
            addLog(currentPlayer, `[${card.title}] Teleported to nearest waypoint`);
            processLanding(p, false);
            break;
        }

        case 'move_transport': {
            const tgt = card.target;
            // Collect $200 for passing Ascension only in Normal mode
            if (tgt < p.pos && !isHardOrBeyond()) { p.cash += 200; addLog(currentPlayer, 'PASSED ASCENSION ACHIEVE — RECEIVED $200 GOLD'); }
            p.pos = tgt;
            const destMT = document.getElementById(`s${tgt}`);
            (destMT.querySelector('.token-tray') || destMT).appendChild(document.getElementById(`token-${p.id}`));
            addLog(currentPlayer, `[${card.title}] Advanced to waypoint`);
            processLanding(p, false);
            break;
        }
    }
}

// =====================================================================
//  TURN MANAGEMENT
// =====================================================================
function finalizeTurn(isDouble) {
    const prevPlayer = currentPlayer;
    isProcessing     = false;
    if (!isDouble) {
        currentPlayer = (currentPlayer + 1) % 4;
        doubleCount   = 0;
        document.getElementById('dome').classList.remove('double-resonance');
    }
    document.getElementById('roll-trigger').disabled = false;
    updateUI();
    if (isDouble) {
        document.getElementById('game-status').innerText = 'ARCANE RESONANCE — ROLL AGAIN!';
    }
    updateActiveTokenPulse();
    if (!isDouble) { flashPlayerBox(currentPlayer); }

    if (typeof mp !== 'undefined' && mp.enabled) {
        if (mp.isHost) {
            broadcastState();
        } else if (prevPlayer === mp.myIndex) {
            broadcastToHost({
                type:         'TURN_DONE',
                state:        serializeState(),
                prevChecksum: typeof mp.lastStateChecksum !== 'undefined' ? mp.lastStateChecksum : 0,
            });
        }
        showTurnLockOverlay();
        if (!players[currentPlayer].bankrupt && currentPlayer === mp.myIndex) {
            startTurnTimer(10, () => { if (!isProcessing) runPhysics(); });
        }
    } else {
        if (!players[currentPlayer].bankrupt) {
            startTurnTimer(10, () => { if (!isProcessing) runPhysics(); });
        }
    }
}
