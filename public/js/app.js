// ===== Race Card Game - Client App =====
const socket = io();

let myPlayerId = null;
let myRoomCode = null;
let isHost = false;
let gameState = null;
let selectedCard = null;
let hasDrawn = false;
let selectingTarget = false;
let coupFourreCardUid = null;

// ===== STATS =====
function getStats() {
    const s = localStorage.getItem('race_stats');
    return s ? JSON.parse(s) : { games: 0, wins: 0 };
}

function saveStats(stats) {
    localStorage.setItem('race_stats', JSON.stringify(stats));
}

function updateStatsDisplay() {
    const stats = getStats();
    document.getElementById('stat-games').textContent = stats.games;
    document.getElementById('stat-wins').textContent = stats.wins;
    document.getElementById('stat-winrate').textContent =
        stats.games > 0 ? Math.round((stats.wins / stats.games) * 100) + '%' : '0%';
}

function toggleStats() {
    const panel = document.getElementById('stats-panel');
    panel.classList.toggle('hidden');
    updateStatsDisplay();
}

// ===== I18N REFRESH =====
function refreshUI() {
    // Update all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    // Update language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === getCurrentLang());
    });
    // Re-render game if active
    if (gameState) renderGame(gameState);
    updateStatsDisplay();
}

// ===== SCREEN MANAGEMENT =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ===== TOAST =====
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(errorKey) {
    const message = t('error_' + errorKey) || errorKey;
    showToast(message, 'error');
}

// ===== LOBBY =====
function createRoom() {
    const name = document.getElementById('player-name').value.trim();
    if (!name) {
        showToast(t('enter_name'), 'error');
        return;
    }

    socket.emit('create-room', { playerName: name }, (res) => {
        if (res.success) {
            myPlayerId = res.playerId;
            myRoomCode = res.roomCode;
            isHost = true;
            showWaitingRoom(res.roomCode, res.players);
        } else {
            showError(res.error);
        }
    });
}

function joinRoom() {
    const name = document.getElementById('player-name').value.trim();
    const code = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!name) {
        showToast(t('enter_name'), 'error');
        return;
    }
    if (!code || code.length !== 4) {
        showToast(t('enter_code'), 'error');
        return;
    }

    socket.emit('join-room', { roomCode: code, playerName: name }, (res) => {
        if (res.success) {
            myPlayerId = res.playerId;
            myRoomCode = res.roomCode;
            isHost = false;
            showWaitingRoom(res.roomCode, res.players);
        } else {
            showError(res.error);
        }
    });
}

function showWaitingRoom(roomCode, players) {
    document.getElementById('lobby-actions-main').classList.add('hidden');
    document.getElementById('waiting-room').classList.remove('hidden');
    document.getElementById('display-room-code').textContent = roomCode;
    updatePlayersList(players);

    if (isHost) {
        document.getElementById('btn-start').style.display = '';
        document.getElementById('host-hint').style.display = '';
        document.getElementById('waiting-hint').style.display = 'none';
        updateStartButton(players.length);
    }
}

function updatePlayersList(players) {
    const ul = document.getElementById('players-list');
    ul.innerHTML = '';
    players.forEach((p, i) => {
        const li = document.createElement('li');
        const colors = ['🔴', '🔵', '🟢', '🟡'];
        li.innerHTML = `${colors[i] || '⚪'} ${p.name}`;
        if (i === 0) {
            li.innerHTML += `<span class="host-badge">HOST</span>`;
        }
        ul.appendChild(li);
    });
}

function updateStartButton(count) {
    const btn = document.getElementById('btn-start');
    btn.disabled = count < 2;
    btn.style.opacity = count < 2 ? '0.5' : '1';
}

function copyRoomCode() {
    navigator.clipboard.writeText(myRoomCode).then(() => {
        const btn = document.getElementById('btn-copy');
        btn.querySelector('[data-i18n]').textContent = t('copied');
        setTimeout(() => {
            btn.querySelector('[data-i18n]').textContent = t('copy_code');
        }, 2000);
    });
}

function startGame() {
    socket.emit('start-game', null, (res) => {
        if (!res.success) showError(res.error);
    });
}

// ===== SOCKET EVENTS =====
socket.on('player-joined', ({ players }) => {
    updatePlayersList(players);
    if (isHost) updateStartButton(players.length);
    showToast(players[players.length - 1].name + ' joined!', 'info');
});

socket.on('player-left', ({ players, leftPlayerId }) => {
    updatePlayersList(players);
    if (isHost) updateStartButton(players.length);
});

socket.on('game-started', () => {
    hasDrawn = false;
    selectedCard = null;
    selectingTarget = false;
    showScreen('game-screen');
});

socket.on('game-state', (state) => {
    gameState = state;
    renderGame(state);

    if (state.gameOver) {
        showGameOver(state);
    }
});

socket.on('coup-fourre-opportunity', ({ hazardType }) => {
    showCoupFourrePopup(hazardType);
});

socket.on('back-to-lobby', ({ players }) => {
    showScreen('lobby-screen');
    document.getElementById('lobby-actions-main').classList.add('hidden');
    document.getElementById('waiting-room').classList.remove('hidden');
    updatePlayersList(players);
    hasDrawn = false;
    selectedCard = null;
    gameState = null;
    if (isHost) updateStartButton(players.length);
});

// ===== GAME RENDERING =====
function renderGame(state) {
    const isMyTurn = state.currentPlayer === myPlayerId;

    // Top bar
    document.getElementById('room-code-badge').textContent = state.roomCode;
    document.getElementById('deck-count').textContent = state.drawPileCount;
    document.getElementById('my-distance').textContent = state.you.distance;

    const turnInd = document.getElementById('turn-indicator');
    if (isMyTurn) {
        turnInd.textContent = t('your_turn');
        turnInd.className = 'my-turn';
    } else {
        const currentName = state.playerNames[state.currentPlayer] || '...';
        turnInd.textContent = currentName;
        turnInd.className = 'waiting';
    }

    // Progress bar
    const pct = Math.min(100, (state.you.distance / 1000) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-text').textContent = state.you.distance + ' / 1000';

    // Opponents
    renderOpponents(state);

    // My board
    renderMyBoard(state.you);

    // My status
    const statusEl = document.getElementById('my-status-text');
    if (state.you.isStopped) {
        statusEl.textContent = t('stopped');
        statusEl.style.color = 'var(--color-hazard)';
    } else if (state.you.hasSpeedLimit) {
        statusEl.textContent = t('speed_limited');
        statusEl.style.color = 'var(--color-warning)';
    } else if (state.you.isRolling) {
        statusEl.textContent = t('rolling');
        statusEl.style.color = 'var(--color-success)';
    } else {
        statusEl.textContent = t('stopped');
        statusEl.style.color = 'var(--color-hazard)';
    }

    // Action bar
    const actionBar = document.getElementById('action-bar');
    if (isMyTurn && !hasDrawn && !state.gameOver) {
        actionBar.classList.remove('hidden');
    } else {
        actionBar.classList.add('hidden');
    }

    // Hand
    renderHand(state.you.hand, isMyTurn && hasDrawn);
}

function renderOpponents(state) {
    const area = document.getElementById('opponents-area');
    area.innerHTML = '';

    for (const [pid, opp] of Object.entries(state.opponents)) {
        const card = document.createElement('div');
        card.className = 'opponent-card';
        card.id = 'opponent-' + pid;

        let statusClass = 'stopped';
        let statusText = t('stopped');
        if (opp.isStopped) {
            statusClass = 'stopped';
            statusText = t('stopped');
        } else if (opp.isRolling) {
            statusClass = 'rolling';
            statusText = t('rolling');
        }

        let speedHtml = '';
        if (opp.hasSpeedLimit) {
            speedHtml = `<span class="opponent-status speed-limited">${t('speed_limited')}</span>`;
        }

        let safetiesHtml = '';
        if (opp.safetyArea.length > 0) {
            safetiesHtml = `<div class="opponent-safeties">
        ${opp.safetyArea.map(s => `<span class="safety-icon">${s.emoji}</span>`).join('')}
      </div>`;
        }

        card.innerHTML = `
      <div class="opponent-name">${state.playerNames[pid] || pid}</div>
      <div class="opponent-distance">${opp.distance} <small>/ 1000 ${t('km')}</small></div>
      <span class="opponent-status ${statusClass}">${statusText}</span>
      ${speedHtml}
      ${safetiesHtml}
      <div class="opponent-cards-count">🃏 ${opp.handCount}</div>
    `;

        area.appendChild(card);
    }
}

function renderMyBoard(me) {
    // Battle pile
    const battleCards = document.getElementById('my-battle-cards');
    battleCards.innerHTML = '';
    if (me.battlePile) {
        const mini = createMiniCard(me.battlePile);
        battleCards.appendChild(mini);
    }

    // Speed pile
    const speedCards = document.getElementById('my-speed-cards');
    speedCards.innerHTML = '';
    if (me.speedPile) {
        const mini = createMiniCard(me.speedPile);
        speedCards.appendChild(mini);
    }

    // Safety area
    const safetyCards = document.getElementById('my-safety-cards');
    safetyCards.innerHTML = '';
    me.safetyArea.forEach(card => {
        const mini = createMiniCard(card);
        safetyCards.appendChild(mini);
    });
}

function createMiniCard(card) {
    const el = document.createElement('div');
    el.className = `board-card-mini ${card.type}`;
    el.textContent = card.emoji;
    el.title = t(card.nameKey);
    return el;
}

function renderHand(hand, canPlay) {
    const container = document.getElementById('hand-cards');
    container.innerHTML = '';

    hand.forEach((card, i) => {
        const el = document.createElement('div');
        el.className = `card ${card.type} dealing`;
        el.style.animationDelay = (i * 0.05) + 's';

        if (card.type === 'distance') {
            el.innerHTML = `
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-value">${card.value}</span>
        <span class="card-name">${t(card.nameKey)}</span>
      `;
        } else {
            el.innerHTML = `
        <span class="card-emoji">${card.emoji}</span>
        <span class="card-name">${t(card.nameKey)}</span>
      `;
        }

        if (canPlay) {
            el.onclick = () => selectCard(card);
        } else {
            el.classList.add('disabled');
        }

        container.appendChild(el);
    });
}

// ===== CARD ACTIONS =====
function selectCard(card) {
    selectedCard = card;
    showCardPopup(card);
}

function showCardPopup(card) {
    const popup = document.getElementById('card-action-popup');
    const preview = document.getElementById('popup-card-preview');
    const targetSel = document.getElementById('target-selector');

    // Preview card
    const el = document.createElement('div');
    el.className = `card ${card.type}`;
    if (card.type === 'distance') {
        el.innerHTML = `
      <span class="card-emoji">${card.emoji}</span>
      <span class="card-value">${card.value}</span>
      <span class="card-name">${t(card.nameKey)}</span>
    `;
    } else {
        el.innerHTML = `
      <span class="card-emoji">${card.emoji}</span>
      <span class="card-name">${t(card.nameKey)}</span>
    `;
    }
    preview.innerHTML = '';
    preview.appendChild(el);

    // Show target selector for hazard cards
    if (card.type === 'hazard') {
        targetSel.classList.remove('hidden');
        const btns = document.getElementById('target-buttons');
        btns.innerHTML = '';
        for (const [pid, opp] of Object.entries(gameState.opponents)) {
            const btn = document.createElement('button');
            btn.className = 'target-btn';
            btn.innerHTML = `
        <span>${gameState.playerNames[pid]}</span>
        <span class="target-dist">${opp.distance} ${t('km')}</span>
      `;
            btn.onclick = () => {
                playCardOnTarget(card.uid, pid);
            };
            btns.appendChild(btn);
        }
    } else {
        targetSel.classList.add('hidden');
    }

    popup.classList.remove('hidden');
}

function closeCardPopup() {
    document.getElementById('card-action-popup').classList.add('hidden');
    selectedCard = null;
}

function playSelectedCard() {
    if (!selectedCard) return;

    if (selectedCard.type === 'hazard') {
        // Need target — popup already shows targets
        return;
    }

    socket.emit('play-card', {
        cardUid: selectedCard.uid,
        targetPlayerId: null
    }, (res) => {
        if (res.success) {
            hasDrawn = false;
            closeCardPopup();
            if (res.gameOver) {
                // handled by game-state event
            }
        } else {
            showError(res.error);
        }
    });
}

function playCardOnTarget(cardUid, targetId) {
    socket.emit('play-card', {
        cardUid: cardUid,
        targetPlayerId: targetId
    }, (res) => {
        if (res.success) {
            hasDrawn = false;
            closeCardPopup();
        } else {
            showError(res.error);
        }
    });
}

function discardSelectedCard() {
    if (!selectedCard) return;

    socket.emit('discard-card', { cardUid: selectedCard.uid }, (res) => {
        if (res.success) {
            hasDrawn = false;
            closeCardPopup();
        } else {
            showError(res.error);
        }
    });
}

// ===== DRAW =====
function drawCard() {
    socket.emit('draw-card', null, (res) => {
        if (res.success) {
            hasDrawn = true;
            // State will update via game-state event
        } else {
            showError(res.error);
        }
    });
}

// ===== COUP FOURRÉ =====
function showCoupFourrePopup(hazardType) {
    // Find the safety card in hand
    const safetyMap = {
        red_light: 'right_of_way',
        flat_tire: 'puncture_proof',
        accident: 'driving_ace',
        out_of_gas: 'extra_tank',
        speed_limit: 'right_of_way'
    };
    const safetyId = safetyMap[hazardType];
    const card = gameState.you.hand.find(c => c.id === safetyId);
    if (card) {
        coupFourreCardUid = card.uid;
        document.getElementById('coup-fourre-popup').classList.remove('hidden');
    }
}

function playCoupFourre() {
    if (!coupFourreCardUid) return;

    socket.emit('coup-fourre', { cardUid: coupFourreCardUid }, (res) => {
        if (res.success) {
            showToast(t('coup_fourre'), 'success');
            hasDrawn = false;
        } else {
            showError(res.error);
        }
        document.getElementById('coup-fourre-popup').classList.add('hidden');
        coupFourreCardUid = null;
    });
}

function passCoupFourre() {
    socket.emit('pass-coup-fourre', null, (res) => {
        document.getElementById('coup-fourre-popup').classList.add('hidden');
        coupFourreCardUid = null;
    });
}

// ===== GAME OVER =====
function showGameOver(state) {
    // Update stats
    const stats = getStats();
    stats.games++;
    if (state.winner === myPlayerId) stats.wins++;
    saveStats(stats);
    updateStatsDisplay();

    // Show screen
    const title = document.getElementById('gameover-title');
    const winnerEl = document.getElementById('gameover-winner');
    const scoresEl = document.getElementById('gameover-scores');

    title.textContent = t('game_over');

    if (state.winner === myPlayerId) {
        winnerEl.textContent = t('you_won');
        document.getElementById('gameover-trophy').textContent = '🏆';
    } else if (state.winner) {
        winnerEl.textContent = `${t('winner')}: ${state.playerNames[state.winner]}`;
        document.getElementById('gameover-trophy').textContent = '😢';
    } else {
        winnerEl.textContent = t('no_winner');
        document.getElementById('gameover-trophy').textContent = '🤷';
    }

    // Build scores
    const allPlayers = { [state.you.id]: state.you, ...state.opponents };
    const sorted = Object.entries(allPlayers).sort((a, b) => b[1].distance - a[1].distance);

    scoresEl.innerHTML = `<h3 style="margin-bottom:10px;color:var(--text-secondary);font-size:14px;">${t('final_scores')}</h3>`;
    sorted.forEach(([pid, p]) => {
        const row = document.createElement('div');
        row.className = `score-row ${pid === state.winner ? 'winner-row' : ''}`;
        row.innerHTML = `
      <span class="score-name">${state.playerNames[pid] || pid} ${pid === myPlayerId ? '(You)' : ''}</span>
      <span class="score-distance">${p.distance} ${t('km')}</span>
    `;
        scoresEl.appendChild(row);
    });

    setTimeout(() => showScreen('gameover-screen'), 1500);
}

function playAgain() {
    socket.emit('play-again', null, (res) => {
        if (res.success) {
            // handled by back-to-lobby event
        }
    });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    // Set initial language
    const savedLang = localStorage.getItem('race_lang') || 'he';
    setLanguage(savedLang);
    refreshUI();
    updateStatsDisplay();

    // Enter key handlers
    document.getElementById('player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            if (document.getElementById('room-code-input').value) {
                joinRoom();
            }
        }
    });

    document.getElementById('room-code-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinRoom();
    });
});
