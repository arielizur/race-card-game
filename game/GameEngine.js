const { CARD_TYPES, HAZARD_TYPES, HAZARD_REMEDY_MAP, HAZARD_SAFETY_MAP, buildDeck, shuffleDeck } = require('./Card');

class GameEngine {
    constructor(playerIds) {
        this.players = {};
        this.playerOrder = [...playerIds];
        this.currentPlayerIndex = 0;
        this.drawPile = [];
        this.discardPile = [];
        this.gameOver = false;
        this.winner = null;
        this.lastAction = null;
        this.coupFourreWindow = null; // { targetPlayerId, hazardType, cardUid }

        // Initialize player states
        for (const pid of playerIds) {
            this.players[pid] = {
                id: pid,
                hand: [],
                distance: 0,
                distanceCards: [],
                battlePile: [],     // top card determines status
                speedPile: [],      // speed limit pile
                safetyArea: [],     // played safety cards
                isRolling: false,   // has played green light / right of way
                isStopped: false,   // has an active hazard (not speed limit)
                hasSpeedLimit: false,
                count200: 0         // number of 200km cards played
            };
        }

        // Build and shuffle deck
        this.drawPile = shuffleDeck(buildDeck());

        // Deal 6 cards to each player
        for (const pid of playerIds) {
            for (let i = 0; i < 6; i++) {
                if (this.drawPile.length > 0) {
                    this.players[pid].hand.push(this.drawPile.pop());
                }
            }
        }
    }

    getCurrentPlayerId() {
        return this.playerOrder[this.currentPlayerIndex];
    }

    getPlayerState(playerId) {
        const p = this.players[playerId];
        return {
            id: p.id,
            handCount: p.hand.length,
            distance: p.distance,
            distanceCards: p.distanceCards,
            battlePile: p.battlePile.length > 0 ? p.battlePile[p.battlePile.length - 1] : null,
            speedPile: p.speedPile.length > 0 ? p.speedPile[p.speedPile.length - 1] : null,
            safetyArea: p.safetyArea,
            isRolling: p.isRolling,
            isStopped: p.isStopped,
            hasSpeedLimit: p.hasSpeedLimit,
            count200: p.count200
        };
    }

    getFullStateForPlayer(playerId) {
        const opponents = {};
        for (const pid of this.playerOrder) {
            if (pid !== playerId) {
                opponents[pid] = this.getPlayerState(pid);
            }
        }

        return {
            you: {
                ...this.getPlayerState(playerId),
                hand: this.players[playerId].hand
            },
            opponents,
            currentPlayer: this.getCurrentPlayerId(),
            drawPileCount: this.drawPile.length,
            discardPileTop: this.discardPile.length > 0 ? this.discardPile[this.discardPile.length - 1] : null,
            gameOver: this.gameOver,
            winner: this.winner,
            lastAction: this.lastAction,
            coupFourreWindow: this.coupFourreWindow && this.coupFourreWindow.targetPlayerId === playerId
                ? this.coupFourreWindow : null
        };
    }

    drawCard(playerId) {
        if (this.drawPile.length === 0) return null;
        const card = this.drawPile.pop();
        this.players[playerId].hand.push(card);
        return card;
    }

    // Validate and play a card
    playCard(playerId, cardUid, targetPlayerId = null) {
        if (this.gameOver) return { success: false, error: 'game_over' };
        if (this.getCurrentPlayerId() !== playerId) return { success: false, error: 'not_your_turn' };

        const player = this.players[playerId];
        const cardIndex = player.hand.findIndex(c => c.uid === cardUid);
        if (cardIndex === -1) return { success: false, error: 'card_not_in_hand' };

        const card = player.hand[cardIndex];
        let result;

        switch (card.type) {
            case CARD_TYPES.DISTANCE:
                result = this._playDistanceCard(player, card);
                break;
            case CARD_TYPES.HAZARD:
                if (!targetPlayerId || targetPlayerId === playerId) {
                    return { success: false, error: 'need_target' };
                }
                result = this._playHazardCard(player, card, this.players[targetPlayerId]);
                break;
            case CARD_TYPES.REMEDY:
                result = this._playRemedyCard(player, card);
                break;
            case CARD_TYPES.SAFETY:
                result = this._playSafetyCard(player, card);
                break;
            default:
                return { success: false, error: 'unknown_card_type' };
        }

        if (result.success) {
            // Remove card from hand
            player.hand.splice(cardIndex, 1);
            this.lastAction = {
                playerId,
                card,
                targetPlayerId,
                actionType: card.type
            };

            // Check win condition
            if (player.distance >= 1000) {
                this.gameOver = true;
                this.winner = playerId;
                return { success: true, gameOver: true, winner: playerId };
            }

            // Safety cards grant extra turn
            if (card.type !== CARD_TYPES.SAFETY) {
                this._nextTurn();
            }

            // Check if draw pile empty => game over
            if (this.drawPile.length === 0 && this._allHandsEmpty()) {
                this.gameOver = true;
                this.winner = this._getPlayerWithMostDistance();
                return { success: true, gameOver: true, winner: this.winner };
            }
        }

        return result;
    }

    discardCard(playerId, cardUid) {
        if (this.gameOver) return { success: false, error: 'game_over' };
        if (this.getCurrentPlayerId() !== playerId) return { success: false, error: 'not_your_turn' };

        const player = this.players[playerId];
        const cardIndex = player.hand.findIndex(c => c.uid === cardUid);
        if (cardIndex === -1) return { success: false, error: 'card_not_in_hand' };

        const card = player.hand.splice(cardIndex, 1)[0];
        this.discardPile.push(card);
        this.lastAction = { playerId, card, actionType: 'discard' };
        this._nextTurn();

        if (this.drawPile.length === 0 && this._allHandsEmpty()) {
            this.gameOver = true;
            this.winner = this._getPlayerWithMostDistance();
        }

        return { success: true, gameOver: this.gameOver, winner: this.winner };
    }

    // Coup Fourré: play safety in response to hazard
    playCoupFourre(playerId, cardUid) {
        if (!this.coupFourreWindow) return { success: false, error: 'no_coup_fourre_window' };
        if (this.coupFourreWindow.targetPlayerId !== playerId) return { success: false, error: 'not_your_coup_fourre' };

        const player = this.players[playerId];
        const cardIndex = player.hand.findIndex(c => c.uid === cardUid);
        if (cardIndex === -1) return { success: false, error: 'card_not_in_hand' };

        const card = player.hand[cardIndex];
        if (card.type !== CARD_TYPES.SAFETY) return { success: false, error: 'not_safety_card' };

        const hazardType = this.coupFourreWindow.hazardType;
        if (!card.protectsAgainst.includes(hazardType)) {
            return { success: false, error: 'wrong_safety_card' };
        }

        // Remove the hazard that was just played
        if (hazardType === HAZARD_TYPES.SPEED_LIMIT) {
            player.speedPile.pop();
            player.hasSpeedLimit = false;
        } else {
            player.battlePile.pop();
            player.isStopped = false;
            player.isRolling = true;
        }

        // Play the safety card
        player.hand.splice(cardIndex, 1);
        player.safetyArea.push(card);

        this.lastAction = {
            playerId,
            card,
            actionType: 'coup_fourre',
            hazardType
        };

        this.coupFourreWindow = null;

        // Coup Fourré gives the player the turn
        this.currentPlayerIndex = this.playerOrder.indexOf(playerId);

        return { success: true, coupFourre: true };
    }

    // Skip coup fourré window
    passCoupFourre(playerId) {
        if (this.coupFourreWindow && this.coupFourreWindow.targetPlayerId === playerId) {
            this.coupFourreWindow = null;
            return { success: true };
        }
        return { success: false, error: 'no_coup_fourre_window' };
    }

    // Check if player can play coup fourré
    canCoupFourre(playerId) {
        if (!this.coupFourreWindow || this.coupFourreWindow.targetPlayerId !== playerId) return false;
        const player = this.players[playerId];
        const hazardType = this.coupFourreWindow.hazardType;
        const safetyId = HAZARD_SAFETY_MAP[hazardType];
        return player.hand.some(c => c.id === safetyId);
    }

    // --- Private methods ---

    _playDistanceCard(player, card) {
        // Must be rolling (green light played)
        if (!player.isRolling) {
            return { success: false, error: 'not_rolling' };
        }
        // Must not be stopped
        if (player.isStopped) {
            return { success: false, error: 'stopped' };
        }
        // Speed limit check
        if (player.hasSpeedLimit && card.value > 50) {
            return { success: false, error: 'speed_limit' };
        }
        // 200km limit
        if (card.value === 200 && player.count200 >= 2) {
            return { success: false, error: 'max_200' };
        }
        // Cannot exceed 1000
        if (player.distance + card.value > 1000) {
            return { success: false, error: 'exceed_1000' };
        }

        player.distance += card.value;
        player.distanceCards.push(card);
        if (card.value === 200) player.count200++;

        return { success: true };
    }

    _playHazardCard(player, card, target) {
        const hazardType = card.hazardType;

        // Check if target has immunity
        if (target.safetyArea.some(s => s.protectsAgainst && s.protectsAgainst.includes(hazardType))) {
            return { success: false, error: 'target_immune' };
        }

        if (hazardType === HAZARD_TYPES.SPEED_LIMIT) {
            // Can play speed limit even if stopped
            if (target.hasSpeedLimit) {
                return { success: false, error: 'already_speed_limited' };
            }
            target.speedPile.push(card);
            target.hasSpeedLimit = true;
        } else {
            // Cannot play hazard on already stopped player
            if (target.isStopped) {
                return { success: false, error: 'already_stopped' };
            }
            // Target must be rolling for red light (any hazard stops them)
            target.battlePile.push(card);
            target.isStopped = true;
            target.isRolling = false;
        }

        // Open coup fourré window
        this.coupFourreWindow = {
            targetPlayerId: target.id,
            hazardType: hazardType,
            cardUid: card.uid
        };

        return { success: true };
    }

    _playRemedyCard(player, card) {
        if (card.id === 'green_light') {
            // Green light: can play if stopped (after fixing hazard) or at start
            if (player.isStopped) {
                return { success: false, error: 'must_fix_hazard_first' };
            }
            if (player.isRolling) {
                return { success: false, error: 'already_rolling' };
            }
            player.isRolling = true;
            player.battlePile.push(card);
            return { success: true };
        }

        if (card.id === 'end_of_limit') {
            if (!player.hasSpeedLimit) {
                return { success: false, error: 'no_speed_limit' };
            }
            player.hasSpeedLimit = false;
            player.speedPile.push(card);
            return { success: true };
        }

        // Other remedy cards - must match current hazard
        if (!player.isStopped) {
            return { success: false, error: 'not_stopped' };
        }

        const topBattle = player.battlePile[player.battlePile.length - 1];
        if (!topBattle || topBattle.type !== CARD_TYPES.HAZARD) {
            return { success: false, error: 'no_hazard_to_fix' };
        }

        const expectedRemedy = HAZARD_REMEDY_MAP[topBattle.hazardType];
        if (card.id !== expectedRemedy) {
            return { success: false, error: 'wrong_remedy' };
        }

        player.isStopped = false;
        player.battlePile.push(card);
        // Note: player still needs to play green light to resume (isRolling stays false)

        return { success: true };
    }

    _playSafetyCard(player, card) {
        player.safetyArea.push(card);

        // If the safety protects against a current hazard, clear it
        if (card.protectsAgainst) {
            for (const hazardType of card.protectsAgainst) {
                if (hazardType === HAZARD_TYPES.SPEED_LIMIT && player.hasSpeedLimit) {
                    player.hasSpeedLimit = false;
                }
                if (hazardType === HAZARD_TYPES.RED_LIGHT) {
                    // Right of Way also acts as permanent green light
                    player.isRolling = true;
                    if (player.isStopped) {
                        const topBattle = player.battlePile[player.battlePile.length - 1];
                        if (topBattle && topBattle.hazardType === HAZARD_TYPES.RED_LIGHT) {
                            player.isStopped = false;
                        }
                    }
                }
                // Clear stop if the current hazard matches this safety
                if (player.isStopped) {
                    const topBattle = player.battlePile[player.battlePile.length - 1];
                    if (topBattle && topBattle.hazardType === hazardType) {
                        player.isStopped = false;
                        player.isRolling = true;
                    }
                }
            }
        }

        return { success: true, extraTurn: true };
    }

    _nextTurn() {
        this.coupFourreWindow = null;
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.playerOrder.length;
    }

    _allHandsEmpty() {
        return this.playerOrder.every(pid => this.players[pid].hand.length === 0);
    }

    _getPlayerWithMostDistance() {
        let maxDist = -1;
        let winner = null;
        for (const pid of this.playerOrder) {
            if (this.players[pid].distance > maxDist) {
                maxDist = this.players[pid].distance;
                winner = pid;
            }
        }
        return winner;
    }

    // Get valid plays for a player
    getValidPlays(playerId) {
        const player = this.players[playerId];
        const validPlays = [];

        for (const card of player.hand) {
            switch (card.type) {
                case CARD_TYPES.DISTANCE:
                    if (player.isRolling && !player.isStopped) {
                        if (player.hasSpeedLimit && card.value > 50) continue;
                        if (card.value === 200 && player.count200 >= 2) continue;
                        if (player.distance + card.value > 1000) continue;
                        validPlays.push({ card, targets: [playerId] });
                    }
                    break;

                case CARD_TYPES.HAZARD: {
                    const targets = [];
                    for (const pid of this.playerOrder) {
                        if (pid === playerId) continue;
                        const target = this.players[pid];
                        if (target.safetyArea.some(s => s.protectsAgainst && s.protectsAgainst.includes(card.hazardType))) continue;
                        if (card.hazardType === HAZARD_TYPES.SPEED_LIMIT) {
                            if (!target.hasSpeedLimit) targets.push(pid);
                        } else {
                            if (!target.isStopped) targets.push(pid);
                        }
                    }
                    if (targets.length > 0) validPlays.push({ card, targets });
                    break;
                }

                case CARD_TYPES.REMEDY:
                    if (card.id === 'green_light' && !player.isRolling && !player.isStopped) {
                        validPlays.push({ card, targets: [playerId] });
                    } else if (card.id === 'end_of_limit' && player.hasSpeedLimit) {
                        validPlays.push({ card, targets: [playerId] });
                    } else if (player.isStopped) {
                        const topBattle = player.battlePile[player.battlePile.length - 1];
                        if (topBattle && topBattle.type === CARD_TYPES.HAZARD) {
                            const expectedRemedy = HAZARD_REMEDY_MAP[topBattle.hazardType];
                            if (card.id === expectedRemedy) {
                                validPlays.push({ card, targets: [playerId] });
                            }
                        }
                    }
                    break;

                case CARD_TYPES.SAFETY:
                    validPlays.push({ card, targets: [playerId] });
                    break;
            }
        }

        return validPlays;
    }
}

module.exports = GameEngine;
