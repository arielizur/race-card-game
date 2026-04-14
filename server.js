const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const GameEngine = require('./game/GameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(express.static('public'));

// Room management
const rooms = new Map();

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function broadcastGameState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !room.game) return;

    for (const player of room.players) {
        const state = room.game.getFullStateForPlayer(player.id);
        state.playerNames = {};
        for (const p of room.players) {
            state.playerNames[p.id] = p.name;
        }
        state.roomCode = roomCode;
        io.to(player.socketId).emit('game-state', state);
    }
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('create-room', ({ playerName }, callback) => {
        let roomCode;
        do {
            roomCode = generateRoomCode();
        } while (rooms.has(roomCode));

        const playerId = uuidv4();
        const room = {
            code: roomCode,
            players: [{ id: playerId, name: playerName, socketId: socket.id }],
            game: null,
            maxPlayers: 4,
            state: 'waiting'
        };
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.playerId = playerId;
        socket.roomCode = roomCode;

        callback({
            success: true,
            roomCode,
            playerId,
            players: room.players.map(p => ({ id: p.id, name: p.name }))
        });

        console.log(`Room ${roomCode} created by ${playerName}`);
    });

    socket.on('join-room', ({ roomCode, playerName }, callback) => {
        roomCode = roomCode.toUpperCase();
        const room = rooms.get(roomCode);

        if (!room) {
            return callback({ success: false, error: 'room_not_found' });
        }
        if (room.state !== 'waiting') {
            return callback({ success: false, error: 'game_in_progress' });
        }
        if (room.players.length >= room.maxPlayers) {
            return callback({ success: false, error: 'room_full' });
        }

        const playerId = uuidv4();
        room.players.push({ id: playerId, name: playerName, socketId: socket.id });
        socket.join(roomCode);
        socket.playerId = playerId;
        socket.roomCode = roomCode;

        const playerList = room.players.map(p => ({ id: p.id, name: p.name }));
        callback({ success: true, roomCode, playerId, players: playerList });

        // Notify all players in room
        io.to(roomCode).emit('player-joined', { players: playerList });
        console.log(`${playerName} joined room ${roomCode}`);
    });

    socket.on('start-game', (_, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback({ success: false, error: 'room_not_found' });
        if (room.players.length < 2) return callback({ success: false, error: 'need_more_players' });
        if (room.state !== 'waiting') return callback({ success: false, error: 'game_already_started' });

        // Check if the requester is the host (first player)
        if (room.players[0].socketId !== socket.id) {
            return callback({ success: false, error: 'not_host' });
        }

        const playerIds = room.players.map(p => p.id);
        room.game = new GameEngine(playerIds);
        room.state = 'playing';

        callback({ success: true });
        io.to(socket.roomCode).emit('game-started');
        broadcastGameState(socket.roomCode);
        console.log(`Game started in room ${socket.roomCode}`);
    });

    socket.on('draw-card', (_, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.game) return callback({ success: false, error: 'no_game' });
        if (room.game.getCurrentPlayerId() !== socket.playerId) {
            return callback({ success: false, error: 'not_your_turn' });
        }

        const card = room.game.drawCard(socket.playerId);
        if (!card) {
            // Deck empty — game over
            room.game.gameOver = true;
            room.game.winner = room.game._getPlayerWithMostDistance();
            broadcastGameState(socket.roomCode);
            return callback({ success: true, gameOver: true });
        }

        callback({ success: true, card });
        broadcastGameState(socket.roomCode);
    });

    socket.on('play-card', ({ cardUid, targetPlayerId }, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.game) return callback({ success: false, error: 'no_game' });

        const result = room.game.playCard(socket.playerId, cardUid, targetPlayerId);
        callback(result);

        if (result.success) {
            // Check for coup fourré opportunity
            if (room.game.coupFourreWindow) {
                const targetId = room.game.coupFourreWindow.targetPlayerId;
                if (room.game.canCoupFourre(targetId)) {
                    // Notify the target player
                    const targetSocket = room.players.find(p => p.id === targetId);
                    if (targetSocket) {
                        io.to(targetSocket.socketId).emit('coup-fourre-opportunity', {
                            hazardType: room.game.coupFourreWindow.hazardType
                        });
                    }
                    // Set a timeout — if no response in 10 seconds, auto-pass
                    setTimeout(() => {
                        if (room.game.coupFourreWindow && room.game.coupFourreWindow.targetPlayerId === targetId) {
                            room.game.passCoupFourre(targetId);
                            broadcastGameState(socket.roomCode);
                        }
                    }, 10000);
                } else {
                    room.game.passCoupFourre(room.game.coupFourreWindow.targetPlayerId);
                }
            }
            broadcastGameState(socket.roomCode);
        }
    });

    socket.on('discard-card', ({ cardUid }, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.game) return callback({ success: false, error: 'no_game' });

        const result = room.game.discardCard(socket.playerId, cardUid);
        callback(result);
        if (result.success) broadcastGameState(socket.roomCode);
    });

    socket.on('coup-fourre', ({ cardUid }, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.game) return callback({ success: false, error: 'no_game' });

        const result = room.game.playCoupFourre(socket.playerId, cardUid);
        callback(result);
        if (result.success) broadcastGameState(socket.roomCode);
    });

    socket.on('pass-coup-fourre', (_, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room || !room.game) return callback({ success: false, error: 'no_game' });

        const result = room.game.passCoupFourre(socket.playerId);
        callback(result);
        if (result.success) broadcastGameState(socket.roomCode);
    });

    socket.on('play-again', (_, callback) => {
        const room = rooms.get(socket.roomCode);
        if (!room) return callback({ success: false, error: 'room_not_found' });

        room.state = 'waiting';
        room.game = null;

        const playerList = room.players.map(p => ({ id: p.id, name: p.name }));
        callback({ success: true });
        io.to(socket.roomCode).emit('back-to-lobby', { players: playerList });
    });

    socket.on('disconnect', () => {
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                room.players = room.players.filter(p => p.socketId !== socket.id);
                if (room.players.length === 0) {
                    rooms.delete(socket.roomCode);
                    console.log(`Room ${socket.roomCode} deleted (empty)`);
                } else {
                    const playerList = room.players.map(p => ({ id: p.id, name: p.name }));
                    io.to(socket.roomCode).emit('player-left', { players: playerList, leftPlayerId: socket.playerId });
                    if (room.game) {
                        room.game.gameOver = true;
                        room.game.winner = null;
                        broadcastGameState(socket.roomCode);
                    }
                }
            }
        }
        console.log('Player disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Race game server running on http://localhost:${PORT}`);
});
