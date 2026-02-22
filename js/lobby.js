// =====================================================================
//  LUMENPOLY · LOBBY + MULTIPLAYER + CHAT + ANTI-CHEAT
//  Loaded second; depends on globals from game.js.
// =====================================================================

'use strict';

// ─── AVATAR UPLOAD STATE ──────────────────────────────────────────────
let lobbyAvatarData = null; // base64 data URL set by file upload

// ─── PROFILE (set on cover page, used in host/join) ───────────────────
let lobbyProfile = { name: '', avatar: null };

// ─── MULTIPLAYER STATE ────────────────────────────────────────────────
let mp = {
    enabled:           false,
    isHost:            false,
    myIndex:           0,
    numPlayers:        4,
    peer:              null,
    hostConn:          null,    // guest only
    guestConns:        [],      // host only: [{conn, name, slot}]
    roomCode:          null,
    nameMap:           {},      // slot index → player name
    avatarMap:         {},      // slot index → avatar image URL (optional)
    lastStateChecksum: 0,       // anti-cheat: checksum of last confirmed state
};

// ─── SLOT COLORS ─────────────────────────────────────────────────────
const SLOT_COLORS = ['#ff4444', '#44dd44', '#4488ff', '#ffee22'];

// ─── AVATAR HELPER ────────────────────────────────────────────────────
/** Returns the best available avatar URL for a slot/name combo. */
function getAvatarUrl(slot, name) {
    const custom = mp.avatarMap && mp.avatarMap[slot];
    if (custom) return custom;
    return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name || slot)}`;
}

// =====================================================================
//  ANTI-CHEAT HELPERS
// =====================================================================

/**
 * Lightweight deterministic checksum over cash totals, ownership,
 * and whose turn it is. Not cryptographically strong, but catches
 * accidental or simple tampering.
 */
function stateChecksum(s) {
    const cashSum  = s.players.reduce((a, p) => a + p.cash, 0);
    const ownerSum = Object.values(s.propertyData)
        .reduce((a, pr) => a + (pr.owner || 0) * (pr.pos + 1), 0);
    return (cashSum * 31337 + ownerSum * 1337 + s.currentPlayer * 7) | 0;
}

/**
 * Host-side validation of a TURN_DONE message from a guest.
 * Returns { ok: true } or { ok: false, reason: string }.
 */
function validateTurnDone(prevState, data) {
    // 1. State-chain check: guest must have started from the same state
    if (data.prevChecksum !== undefined &&
        data.prevChecksum !== stateChecksum(prevState)) {
        return { ok: false, reason: 'State chain broken — possible desync or tampering' };
    }

    const s = data.state;

    // 2. Cash conservation: total cash must not increase (banks create no money)
    const prevTotal = prevState.players.reduce((a, p) => a + p.cash, 0);
    const newTotal  = s.players.reduce((a, p) => a + p.cash, 0);
    if (newTotal > prevTotal + 200) {   // +200 tolerance for GO bonus
        return { ok: false, reason: 'Impossible cash increase detected' };
    }

    // 3. Ownership integrity: only the active player may change ownership
    const activeId = prevState.currentPlayer + 1;
    for (const [key, prop] of Object.entries(s.propertyData)) {
        const prev = prevState.propertyData[key];
        if (prev && prop.owner !== prev.owner) {
            if (prop.owner !== activeId && prev.owner !== activeId) {
                return { ok: false, reason: `Unauthorized territory transfer: ${prop.name}` };
            }
        }
    }

    return { ok: true };
}

// =====================================================================
//  CHAT HELPERS
// =====================================================================

function appendLobbyChatMsg(data) {
    const msgs = document.getElementById('lobby-chat-msgs');
    if (!msgs) return;
    // Hide empty-state placeholder on first message
    const empty = msgs.querySelector('.lobby-chat-empty');
    if (empty) empty.remove();

    const slotIdx   = Object.entries(mp.nameMap).find(([, v]) => v === data.name)?.[0] ?? 0;
    const avatarUrl = getAvatarUrl(+slotIdx, data.name);
    const color     = SLOT_COLORS[slotIdx] || '#aaa';
    const row       = document.createElement('div');
    row.className   = 'lobby-chat-row';
    row.innerHTML   =
        `<img src="${avatarUrl}" class="lobby-chat-avatar" alt="">`
        + `<span style="color:${color};font-weight:700;margin-right:6px;">${data.name}:</span>`
        + `<span style="color:#999;">${data.msg}</span>`;
    msgs.appendChild(row);
    msgs.scrollTop = msgs.scrollHeight;
}

function broadcastLobbyChat(data, except) {
    mp.guestConns.forEach(g => {
        if (g === except) return;
        if (g.conn.open) g.conn.send(data);
    });
}

function lobbyChatSend() {
    const input = document.getElementById('lobby-chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    const myName = mp.nameMap[mp.myIndex] || 'Unknown';
    const data   = { type: 'CHAT', name: myName, msg, ts: Date.now() };
    appendLobbyChatMsg(data);
    if (mp.isHost) broadcastLobbyChat(data, null);
    else broadcastToHost(data);
}

// ─── In-game chat ─────────────────────────────────────────────────────

function appendChatMsg(data) {
    const msgs = document.getElementById('chat-msgs');
    if (!msgs) return;
    const slotIdx   = Object.entries(mp.nameMap).find(([, v]) => v === data.name)?.[0] ?? 0;
    const avatarUrl = getAvatarUrl(+slotIdx, data.name);
    const color     = SLOT_COLORS[slotIdx] || '#aaa';
    const el        = document.createElement('div');
    el.className    = 'chat-msg';
    el.innerHTML    =
        `<img class="chat-msg-avatar" src="${avatarUrl}" alt="">`
        + `<div class="chat-msg-bubble">`
        + `<div class="chat-msg-name" style="color:${color}">${data.name}</div>`
        + `<div class="chat-msg-text">${data.msg}</div>`
        + `</div>`;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;

    // Show unread badge if panel is closed
    const panel = document.getElementById('chat-panel');
    if (panel && !panel.classList.contains('open')) {
        const badge = document.getElementById('chat-badge');
        if (badge) badge.style.display = 'inline';
    }
}

function chatSend() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    const myName = mp.nameMap[mp.myIndex] || 'SOLO';
    const data   = { type: 'CHAT', name: myName, msg, ts: Date.now() };
    appendChatMsg(data);
    if (mp.isHost) broadcastLobbyChat(data, null);
    else broadcastToHost(data);
}

function toggleChat() {
    const panel = document.getElementById('chat-panel');
    if (panel) panel.classList.toggle('open');
    const badge = document.getElementById('chat-badge');
    if (badge) badge.style.display = 'none';
}

// =====================================================================
//  LOBBY INIT
// =====================================================================
function initLobby() {
    // If an invite link was followed, pre-fill the join code (step1 is hidden
    // initially; user still goes through the cover page first).
    const hash = window.location.hash;
    if (hash && hash.toLowerCase().startsWith('#lp-')) {
        const codeInput = document.getElementById('lobby-code-input');
        if (codeInput) codeInput.value = hash.slice(1).toUpperCase();
    }
}

// ── Cover page → Lobby browser transition ────────────────────────────
function enterLobby() {
    const name = document.getElementById('lobby-name').value.trim();
    if (!name) { lobbyErr0('Please enter your Marshal name first.'); return; }
    lobbyErr0('');

    lobbyProfile.name   = name;
    lobbyProfile.avatar = lobbyAvatarData;

    // Populate profile bar in step1
    const avatarSrc = lobbyAvatarData
        || `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`;
    const elAvatar = document.getElementById('lobby-browser-avatar');
    const elName   = document.getElementById('lobby-browser-name');
    if (elAvatar) elAvatar.src       = avatarSrc;
    if (elName)   elName.textContent = name;

    document.getElementById('lobby-step0').style.display = 'none';
    document.getElementById('lobby-step1').style.display = 'flex';
}

function lobbyGoBack() {
    lobbyErr('');
    document.getElementById('lobby-step1').style.display = 'none';
    document.getElementById('lobby-step0').style.display = 'flex';
}

function lobbyErr0(msg) { const el = document.getElementById('lobby-error0'); if (el) el.textContent = msg; }
function lobbyShowJoin() {} // legacy no-op — join is always visible in the lobby browser

// ─── AVATAR FILE UPLOAD ───────────────────────────────────────────────
function lobbyHandleAvatarUpload(input) {
    if (!input.files || !input.files[0]) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('lobby-avatar-canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            // Center-crop to square then scale to 128×128
            const side = Math.min(img.width, img.height);
            const sx = (img.width  - side) / 2;
            const sy = (img.height - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, 128, 128);
            lobbyAvatarData = canvas.toDataURL('image/jpeg', 0.85);
            const preview  = document.getElementById('lobby-avatar-img');
            const ph       = document.getElementById('lobby-avatar-placeholder');
            const clearBtn = document.getElementById('lobby-avatar-clear');
            if (preview)  { preview.src = lobbyAvatarData; preview.style.display = 'block'; }
            if (ph)       ph.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
}

function lobbyClearAvatar() {
    lobbyAvatarData = null;
    const preview   = document.getElementById('lobby-avatar-img');
    const ph        = document.getElementById('lobby-avatar-placeholder');
    const clearBtn  = document.getElementById('lobby-avatar-clear');
    const fileInput = document.getElementById('lobby-avatar-file');
    if (preview)   { preview.src = ''; preview.style.display = 'none'; }
    if (ph)        ph.style.display = 'flex';
    if (clearBtn)  clearBtn.style.display = 'none';
    if (fileInput) fileInput.value = '';
}

function lobbyErr(msg)  { const el = document.getElementById('lobby-error');  if (el) el.textContent = msg; }
function lobbyErr2(msg) { const el = document.getElementById('lobby-error2'); if (el) el.textContent = msg; }

// =====================================================================
//  HOST SETUP
// =====================================================================
function lobbyClickHost() {
    const name = lobbyProfile.name;
    if (!name) { lobbyErr('Return to cover page and enter your Marshal name.'); return; }
    if (typeof Peer === 'undefined') { lobbyErr('PeerJS unavailable — check internet connection.'); return; }
    lobbyErr('');

    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let code = 'lp-';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];

    mp.roomCode   = code;
    mp.isHost     = true;
    mp.enabled    = true;
    mp.nameMap    = { 0: name };
    mp.avatarMap  = lobbyProfile.avatar ? { 0: lobbyProfile.avatar } : {};
    mp.guestConns = [];

    history.replaceState(null, '', '#' + code);
    document.getElementById('lobby-code-display').textContent = code.toUpperCase();
    document.getElementById('lobby-step1').style.display = 'none';
    document.getElementById('lobby-step2').style.display = 'block';
    document.getElementById('lobby-start-btn').style.display   = 'block';
    document.getElementById('lobby-waiting-msg').style.display = 'none';
    lobbyRenderPlayers();

    mp.peer = new Peer(code);
    mp.peer.on('error', err => lobbyErr2('Host error: ' + err.type));
    mp.peer.on('connection', conn => {
        if (mp.guestConns.length >= 3) { conn.close(); return; }
        const slot  = mp.guestConns.length + 1;
        const entry = { conn, name: '?', slot };
        mp.guestConns.push(entry);
        conn.on('open',  () => conn.send({ type: 'LOBBY_ACK', slot }));
        conn.on('data',  data => handleHostData(data, entry));
        conn.on('close', () => {
            const idx = mp.guestConns.indexOf(entry);
            if (idx !== -1) {
                mp.guestConns.splice(idx, 1);
                delete mp.nameMap[entry.slot];
                lobbyRenderPlayers();
                broadcastLobbyUpdate();
            }
        });
    });
}

// =====================================================================
//  GUEST JOIN
// =====================================================================
function lobbyClickJoin() {
    const name = lobbyProfile.name;
    let   code = document.getElementById('lobby-code-input').value.trim().toLowerCase().replace(/\s/g, '');
    if (!name) { lobbyErr('Return to cover page and enter your Marshal name.'); return; }
    if (!code) { lobbyErr('Enter the campaign code.'); return; }
    if (typeof Peer === 'undefined') { lobbyErr('PeerJS unavailable — check internet connection.'); return; }
    if (!code.startsWith('lp-')) code = 'lp-' + code.replace(/^lp-?/i, '');
    lobbyErr('Connecting to War Council...');

    mp.enabled = true;
    mp.isHost  = false;
    mp.peer    = new Peer();
    mp.peer.on('open', () => {
        mp.hostConn = mp.peer.connect(code);
        mp.hostConn.on('open',  () => { mp.hostConn.send({ type: 'LOBBY_JOIN', name, avatarUrl: lobbyProfile.avatar || '' }); lobbyErr(''); });
        mp.hostConn.on('data',  handleGuestData);
        mp.hostConn.on('close', () => lobbyErr('Disconnected from host.'));
    });
    mp.peer.on('error', err => lobbyErr('Connection failed: ' + err.type));
}

// =====================================================================
//  DATA HANDLERS
// =====================================================================

/** Host receives messages from guests */
function handleHostData(data, entry) {
    if (data.type === 'LOBBY_JOIN') {
        entry.name             = data.name;
        mp.nameMap[entry.slot] = data.name;
        if (data.avatarUrl) mp.avatarMap[entry.slot] = data.avatarUrl;
        lobbyRenderPlayers();
        broadcastLobbyUpdate();

    } else if (data.type === 'CHAT') {
        // Relay chat to all (lobby + in-game)
        appendLobbyChatMsg(data);
        broadcastLobbyChat(data, entry);
        appendChatMsg(data);

    } else if (data.type === 'TURN_DONE') {
        // Anti-cheat: validate before applying
        const prevState = serializeState();
        const result    = validateTurnDone(prevState, data);
        if (!result.ok) {
            console.warn('[Anti-cheat]', result.reason);
            if (entry.conn.open) {
                entry.conn.send({ type: 'KICKED', reason: result.reason });
                entry.conn.close();
            }
            const idx = mp.guestConns.indexOf(entry);
            if (idx !== -1) {
                mp.guestConns.splice(idx, 1);
                delete mp.nameMap[entry.slot];
                lobbyRenderPlayers();
            }
            broadcastState();
            return;
        }
        applyState(data.state);
        broadcastState();
        showTurnLockOverlay();
    }
}

/** Guest receives messages from host */
function handleGuestData(data) {
    if (data.type === 'LOBBY_ACK') {
        mp.myIndex = data.slot;
        document.getElementById('lobby-step1').style.display  = 'none';
        document.getElementById('lobby-step2').style.display  = 'block';
        document.getElementById('lobby-start-btn').style.display   = 'none';
        document.getElementById('lobby-waiting-msg').style.display = 'block';
        document.getElementById('lobby-code-section').style.display = 'none';

    } else if (data.type === 'LOBBY_UPDATE') {
        mp.nameMap   = data.nameMap;
        mp.avatarMap = data.avatarMap || {};
        lobbyRenderPlayers();

    } else if (data.type === 'GAME_START') {
        mp.nameMap    = data.nameMap;
        mp.avatarMap  = data.avatarMap || {};
        mp.myIndex    = data.myIndex;
        mp.numPlayers = data.numPlayers;
        launchGame();

    } else if (data.type === 'STATE') {
        mp.lastStateChecksum = data.checksum || 0;
        applyState(data.state);
        showTurnLockOverlay();

    } else if (data.type === 'CHAT') {
        appendLobbyChatMsg(data);
        appendChatMsg(data);

    } else if (data.type === 'KICKED') {
        alert(`Removed from game: ${data.reason}`);
        window.location.reload();
    }
}

// =====================================================================
//  BROADCAST HELPERS
// =====================================================================
function broadcastLobbyUpdate() {
    const msg = { type: 'LOBBY_UPDATE', nameMap: mp.nameMap, avatarMap: mp.avatarMap };
    mp.guestConns.forEach(g => { if (g.conn.open) g.conn.send(msg); });
}

function broadcastState() {
    const state    = serializeState();
    const checksum = stateChecksum(state);
    mp.lastStateChecksum = checksum;
    const msg = { type: 'STATE', state, checksum };
    mp.guestConns.forEach(g => { if (g.conn.open) g.conn.send(msg); });
}

function broadcastToHost(data) {
    if (mp.hostConn && mp.hostConn.open) mp.hostConn.send(data);
}

// =====================================================================
//  LOBBY UI
// =====================================================================
function lobbyRenderPlayers() {
    const list = document.getElementById('lobby-player-list');
    if (!list) return;
    list.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const slot  = document.createElement('div');
        slot.className = 'lobby-player-slot';
        const name = mp.nameMap[i];
        if (name) {
            const avatarUrl = getAvatarUrl(i, name);
            slot.innerHTML =
                `<img class="lobby-avatar" src="${avatarUrl}" alt="${name}"
                      style="border:2px solid ${SLOT_COLORS[i]};">`
                + `<span style="color:${SLOT_COLORS[i]}">${name}</span>`
                + (i === 0
                    ? `<span style="color:#333;font-size:9px;margin-left:auto;letter-spacing:2px;">HOST</span>`
                    : '');
        } else {
            slot.innerHTML =
                `<div class="lobby-player-dot" style="background:transparent;border:1px solid #1a1a1a;"></div>`
                + `<span style="color:#1a1a1a;letter-spacing:1px;">Awaiting Marshal...</span>`;
        }
        list.appendChild(slot);
    }
}

function lobbyCopyLink() {
    const url = window.location.href.split('#')[0] + '#' + mp.roomCode;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
            const btn = document.querySelector('[onclick="lobbyCopyLink()"]');
            if (btn) { const t = btn.textContent; btn.textContent = 'COPIED!'; setTimeout(() => btn.textContent = t, 2000); }
        });
    } else {
        prompt('Share this link with your allies:', url);
    }
}

function lobbyStartGame() {
    const count = 1 + mp.guestConns.length;
    if (count < 2) { lobbyErr2('At least 2 Marshals must join before you can begin.'); return; }
    lobbyErr2('');

    // Fisher-Yates shuffle of slot indices
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
    }

    const newNameMap   = {};
    const newAvatarMap = {};
    for (let t = 0; t < count; t++) {
        newNameMap[t]   = mp.nameMap[slots[t]];
        if (mp.avatarMap[slots[t]]) newAvatarMap[t] = mp.avatarMap[slots[t]];
    }
    mp.nameMap    = newNameMap;
    mp.avatarMap  = newAvatarMap;
    mp.numPlayers = count;
    mp.myIndex    = slots.indexOf(0);

    mp.guestConns.forEach(g => {
        const guestTurnIdx = slots.indexOf(g.slot);
        g.conn.send({ type: 'GAME_START', nameMap: newNameMap, avatarMap: newAvatarMap, myIndex: guestTurnIdx, numPlayers: count });
    });

    launchGame();
}

// =====================================================================
//  GAME LAUNCH
// =====================================================================
function startSinglePlayer() {
    document.getElementById('lobby-screen').style.display = 'none';
    initGame();
}

function launchGame() {
    document.getElementById('lobby-screen').style.display = 'none';

    // Name + avatar are set by setupPlayerUI() inside initGame(),
    // which reads from mp.nameMap / mp.avatarMap — already populated.
    initGame();

    for (let i = mp.numPlayers; i < 4; i++) {
        players[i].bankrupt = true;
        players[i].cash     = 0;
    }
    updateUI();
    showTurnLockOverlay();
}

// =====================================================================
//  TURN LOCK OVERLAY
// =====================================================================
function showTurnLockOverlay() {
    const overlay = document.getElementById('turn-lock-overlay');
    if (!overlay) return;
    if (!mp.enabled) { overlay.style.display = 'none'; return; }
    if (players[currentPlayer].bankrupt || currentPlayer === mp.myIndex) {
        overlay.style.display = 'none';
    } else {
        const label = (mp.nameMap[currentPlayer] || `MARSHAL ${romanNum[currentPlayer]}`).toUpperCase();
        document.getElementById('turn-lock-name').textContent = label;
        overlay.style.display = 'flex';
    }
}

// =====================================================================
//  STATE SERIALIZATION
// =====================================================================
function serializeState() {
    return {
        players:      players.map(p => ({ ...p })),
        propertyData: Object.fromEntries(Object.entries(propertyData).map(([k, v]) => [k, { ...v }])),
        currentPlayer,
        isProcessing,
        doubleCount,
        gameStartTime,
    };
}

function applyState(state) {
    state.players.forEach((sp, i) => Object.assign(players[i], sp));
    Object.entries(state.propertyData).forEach(([k, v]) => {
        propertyData[k] ? Object.assign(propertyData[k], v) : (propertyData[k] = { ...v });
    });
    currentPlayer = state.currentPlayer;
    isProcessing  = state.isProcessing;
    doubleCount   = state.doubleCount;
    gameStartTime = state.gameStartTime;

    // Refresh board visuals
    Object.values(propertyData).forEach(prop => {
        const el  = document.getElementById(`s${prop.pos}`);
        if (!el) return;
        const ind = el.querySelector('.owner-indicator');
        if (ind) ind.style.borderColor = prop.owner ? players[prop.owner - 1].hex : 'transparent';
        updateBuildingDisplay(prop.pos, prop);
    });
    players.forEach(p => {
        const token = document.getElementById(`token-${p.id}`);
        const dest  = document.getElementById(`s${p.pos}`);
        if (token && dest) (dest.querySelector('.token-tray') || dest).appendChild(token);
    });

    updateUI();

    if (!isProcessing && currentPlayer === mp.myIndex && !players[currentPlayer].bankrupt) {
        startTurnTimer(10, () => { if (!isProcessing) runPhysics(); });
    }
}

// =====================================================================
//  RULES PANEL TOGGLE
// =====================================================================
function toggleRules() {
    const panel = document.getElementById('rules-panel');
    const btn   = document.getElementById('rules-toggle-btn');
    if (!panel) return;
    const open = panel.style.display === 'block';
    panel.style.display = open ? 'none' : 'block';
    if (btn) btn.textContent = open ? '▼ GAME RULES' : '▲ HIDE RULES';
}

// =====================================================================
//  BOOT
// =====================================================================
window.onload = initLobby;
