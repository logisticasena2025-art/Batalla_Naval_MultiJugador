const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(__dirname));

// Almacenamiento de salas
const rooms = new Map(); // roomId -> { players: [], board1, board2, turn, gameStarted }

// Generar código de sala aleatorio (4 letras)
function generateRoomId() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return result;
}

// Crear tablero vacío
function createEmptyBoard() {
  const board = [];
  for (let i = 0; i < 10; i++) {
    board[i] = [];
    for (let j = 0; j < 10; j++) {
      board[i][j] = {
        ship: null,
        hit: false,
        shipId: null
      };
    }
  }
  return board;
}

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Crear nueva sala
  socket.on('createRoom', () => {
    const roomId = generateRoomId();
    rooms.set(roomId, {
      players: [socket.id],
      board1: createEmptyBoard(),
      board2: createEmptyBoard(),
      turn: socket.id,
      gameStarted: false,
      readyCount: 0,
      player1Ready: false,
      player2Ready: false,
      winner: null
    });
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerNumber: 1 });
    console.log(`Sala creada: ${roomId} por ${socket.id}`);
  });

  // Unirse a sala existente
  socket.on('joinRoom', (roomId) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('joinError', 'La sala no existe');
      return;
    }
    
    if (room.players.length >= 2) {
      socket.emit('joinError', 'La sala está llena');
      return;
    }
    
    if (room.gameStarted) {
      socket.emit('joinError', 'La partida ya comenzó');
      return;
    }
    
    room.players.push(socket.id);
    socket.join(roomId);
    
    const playerNumber = room.players.length;
    socket.emit('roomJoined', { roomId, playerNumber });
    
    // Notificar al jugador 1 que el jugador 2 se unió
    io.to(room.players[0]).emit('opponentJoined');
    
    console.log(`Jugador ${playerNumber} se unió a sala ${roomId}`);
  });

  // Colocar barcos
  socket.on('placeShips', ({ roomId, ships, playerNumber }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const board = playerNumber === 1 ? room.board1 : room.board2;
    
    // Limpiar tablero
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        board[i][j].ship = null;
        board[i][j].shipId = null;
      }
    }
    
    // Colocar barcos
    ships.forEach((ship, index) => {
      const { row, col, orientation, length } = ship;
      for (let i = 0; i < length; i++) {
        const r = orientation === 'horizontal' ? row : row + i;
        const c = orientation === 'horizontal' ? col + i : col;
        if (r < 10 && c < 10) {
          board[r][c].ship = ship.name;
          board[r][c].shipId = index;
        }
      }
    });
    
    if (playerNumber === 1) {
      room.player1Ready = true;
    } else {
      room.player2Ready = true;
    }
    
    socket.emit('shipsPlaced');
    
    // Verificar si ambos están listos
    if (room.player1Ready && room.player2Ready && !room.gameStarted) {
      room.gameStarted = true;
      room.turn = room.players[0]; // Jugador 1 empieza
      
      io.to(room.players[0]).emit('gameStart', { turn: true, playerNumber: 1 });
      io.to(room.players[1]).emit('gameStart', { turn: false, playerNumber: 2 });
      
      // Enviar los tableros enemigos iniciales
      io.to(room.players[0]).emit('enemyBoardUpdate', { board: room.board2, playerNumber: 1 });
      io.to(room.players[1]).emit('enemyBoardUpdate', { board: room.board1, playerNumber: 2 });
    }
  });

  // Realizar disparo
  socket.on('fire', ({ roomId, row, col }) => {
    const room = rooms.get(roomId);
    if (!room || !room.gameStarted || room.winner) return;
    if (room.turn !== socket.id) return;
    
    const isPlayer1 = socket.id === room.players[0];
    const enemyBoard = isPlayer1 ? room.board2 : room.board1;
    const myBoard = isPlayer1 ? room.board1 : room.board2;
    const enemyPlayerId = isPlayer1 ? room.players[1] : room.players[0];
    
    // Verificar si ya disparó aquí
    if (enemyBoard[row][col].hit) {
      socket.emit('invalidFire', { message: 'Ya disparaste ahí' });
      return;
    }
    
    // Realizar disparo
    const hit = enemyBoard[row][col].ship !== null;
    enemyBoard[row][col].hit = true;
    
    // Verificar si se hundió un barco
    let sunkShip = null;
    if (hit) {
      const shipId = enemyBoard[row][col].shipId;
      // Verificar si todas las partes del barco están hundidas
      let allHit = true;
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          if (enemyBoard[i][j].shipId === shipId && !enemyBoard[i][j].hit) {
            allHit = false;
            break;
          }
        }
      }
      if (allHit) {
        sunkShip = enemyBoard[row][col].ship;
      }
    }
    
    // Enviar resultado al atacante
    socket.emit('fireResult', {
      hit,
      row,
      col,
      sunkShip,
      yourTurn: false
    });
    
    // Enviar actualización al defensor
    io.to(enemyPlayerId).emit('enemyFired', {
      row,
      col,
      hit,
      sunkShip
    });
    
    // Verificar victoria
    let allShipsHit = true;
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        if (enemyBoard[i][j].ship !== null && !enemyBoard[i][j].hit) {
          allShipsHit = false;
          break;
        }
      }
    }
    
    if (allShipsHit) {
      room.winner = socket.id;
      const winnerName = isPlayer1 ? 'Jugador 1' : 'Jugador 2';
      io.to(room.players[0]).emit('gameOver', { winner: winnerName });
      io.to(room.players[1]).emit('gameOver', { winner: winnerName });
      return;
    }
    
    // Cambiar turno
    room.turn = enemyPlayerId;
    io.to(room.players[0]).emit('turnChange', { turn: room.turn === room.players[0] });
    io.to(room.players[1]).emit('turnChange', { turn: room.turn === room.players[1] });
  });
  
  // Solicitar actualización del tablero enemigo
  socket.on('requestEnemyBoard', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const isPlayer1 = socket.id === room.players[0];
    const enemyBoard = isPlayer1 ? room.board2 : room.board1;
    const playerNumber = isPlayer1 ? 1 : 2;
    
    socket.emit('enemyBoardUpdate', { board: enemyBoard, playerNumber });
  });

  // Reiniciar juego
  socket.on('rematch', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    
    // Reiniciar tableros
    room.board1 = createEmptyBoard();
    room.board2 = createEmptyBoard();
    room.gameStarted = false;
    room.player1Ready = false;
    room.player2Ready = false;
    room.winner = null;
    room.turn = null;
    
    io.to(room.players[0]).emit('resetGame');
    io.to(room.players[1]).emit('resetGame');
  });

  // Desconexión
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
    
    // Buscar sala donde estaba el jugador
    for (const [roomId, room] of rooms.entries()) {
      const playerIndex = room.players.indexOf(socket.id);
      if (playerIndex !== -1) {
        const otherPlayerId = room.players[playerIndex === 0 ? 1 : 0];
        if (otherPlayerId) {
          io.to(otherPlayerId).emit('opponentDisconnected');
        }
        rooms.delete(roomId);
        console.log(`Sala ${roomId} eliminada por desconexión`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});