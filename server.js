const socket = io();

// Estado del juego
let currentScreen = 'lobby';
let roomId = null;
let playerNumber = null;
let myBoard = [];
let enemyBoard = [];
let myTurn = false;
let gameReady = false;

// Barcos para colocar
const shipsData = [
    { name: 'Portaaviones', length: 4, placed: false },
    { name: 'Acorazado', length: 3, placed: false },
    { name: 'Acorazado 2', length: 3, placed: false },
    { name: 'Destructor', length: 2, placed: false },
    { name: 'Destructor 2', length: 2, placed: false },
    { name: 'Destructor 3', length: 2, placed: false },
    { name: 'Submarino', length: 1, placed: false },
    { name: 'Submarino 2', length: 1, placed: false },
    { name: 'Submarino 3', length: 1, placed: false },
    { name: 'Submarino 4', length: 1, placed: false }
];

let currentShipIndex = 0;
let currentShipOrientation = 'horizontal';
let placedShips = [];

// Canvas y contexto
let placementCanvas, placementCtx;
let myBoardCanvas, myBoardCtx;
let enemyBoardCanvas, enemyBoardCtx;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');
    const joinCodeInput = document.getElementById('joinCodeInput');
    const readyBtn = document.getElementById('readyBtn');
    const rematchBtn = document.getElementById('rematchBtn');
    
    // Canvas
    placementCanvas = document.getElementById('placementBoard');
    if (placementCanvas) placementCtx = placementCanvas.getContext('2d');
    myBoardCanvas = document.getElementById('myBoard');
    if (myBoardCanvas) myBoardCtx = myBoardCanvas.getContext('2d');
    enemyBoardCanvas = document.getElementById('enemyBoard');
    if (enemyBoardCanvas) enemyBoardCtx = enemyBoardCanvas.getContext('2d');
    
    // Eventos de UI
    createRoomBtn.addEventListener('click', () => {
        socket.emit('createRoom');
        showMessage('lobbyMessage', 'Creando sala...', 'info');
    });
    
    joinRoomBtn.addEventListener('click', () => {
        const code = joinCodeInput.value.trim().toUpperCase();
        if (code.length === 4) {
            socket.emit('joinRoom', code);
            showMessage('lobbyMessage', 'Uniéndose a la sala...', 'info');
        } else {
            showMessage('lobbyMessage', 'Ingresa un código de 4 letras', 'error');
        }
    });
    
    readyBtn.addEventListener('click', () => {
        if (placedShips.length === 10) {
            socket.emit('placeShips', { roomId, ships: placedShips, playerNumber });
            showMessage('placementMessage', '¡Barcos colocados! Esperando al oponente...', 'info');
            readyBtn.disabled = true;
        } else {
            showMessage('placementMessage', 'Coloca todos los barcos primero', 'error');
        }
    });
    
    rematchBtn.addEventListener('click', () => {
        socket.emit('rematch', roomId);
    });
    
    // Eventos de socket
    setupSocketEvents();
    
    // Dibujar tableros vacíos inicialmente
    drawEmptyBoard(placementCtx, 500);
});

function setupSocketEvents() {
    socket.on('roomCreated', (data) => {
        roomId = data.roomId;
        playerNumber = data.playerNumber;
        showMessage('lobbyMessage', `Sala creada: ${roomId}. Esperando oponente...`, 'success');
        document.getElementById('joinCodeInput').value = roomId;
        // Mostrar código para compartir
        showLobbyCode(roomId);
    });
    
    socket.on('roomJoined', (data) => {
        roomId = data.roomId;
        playerNumber = data.playerNumber;
        showMessage('lobbyMessage', `Te uniste a la sala ${roomId} como Jugador ${playerNumber}`, 'success');
        switchToPlacementScreen();
        initShipPlacement();
    });
    
    socket.on('opponentJoined', () => {
        showMessage('lobbyMessage', '¡Oponente conectado! Coloca tus barcos', 'success');
        switchToPlacementScreen();
        initShipPlacement();
    });
    
    socket.on('joinError', (message) => {
        showMessage('lobbyMessage', message, 'error');
    });
    
    socket.on('gameStart', (data) => {
        myTurn = data.turn;
        gameReady = true;
        switchToGameScreen();
        updateTurnDisplay();
        drawMyBoard();
        drawEnemyBoard();
        showMessage('gameMessage', '¡La batalla comienza!', 'success');
    });
    
    socket.on('enemyBoardUpdate', (data) => {
        if (data.playerNumber === playerNumber) {
            enemyBoard = data.board;
            drawEnemyBoard();
        }
    });
    
    socket.on('fireResult', (data) => {
        if (enemyBoard[data.row] && enemyBoard[data.row][data.col]) {
            enemyBoard[data.row][data.col].hit = true;
            drawEnemyBoard();
        }
        myTurn = !data.yourTurn;
        updateTurnDisplay();
        
        if (data.hit) {
            let msg = `¡Impacto en (${String.fromCharCode(65+data.row)}${data.col+1})!`;
            if (data.sunkShip) {
                msg += ` ¡Hundiste ${data.sunkShip}!`;
            }
            showMessage('gameMessage', msg, 'success');
        } else {
            showMessage('gameMessage', `¡Agua! Fallaste en (${String.fromCharCode(65+data.row)}${data.col+1})`, 'error');
        }
    });
    
    socket.on('enemyFired', (data) => {
        if (myBoard[data.row] && myBoard[data.row][data.col]) {
            myBoard[data.row][data.col].hit = true;
            drawMyBoard();
        }
        
        if (data.hit) {
            let msg = `¡Tu barco fue impactado en (${String.fromCharCode(65+data.row)}${data.col+1})!`;
            if (data.sunkShip) {
                msg += ` ¡Hundieron tu ${data.sunkShip}!`;
            }
            showMessage('gameMessage', msg, 'error');
        } else {
            showMessage('gameMessage', `El enemigo falló en (${String.fromCharCode(65+data.row)}${data.col+1})`, 'info');
        }
    });
    
    socket.on('turnChange', (data) => {
        myTurn = data.turn;
        updateTurnDisplay();
        if (myTurn) {
            showMessage('gameMessage', '¡Es tu turno! Dispara', 'success');
        } else {
            showMessage('gameMessage', 'Turno del oponente...', 'info');
        }
    });
    
    socket.on('gameOver', (data) => {
        showMessage('gameMessage', `🎉 ¡${data.winner} ha ganado la partida! 🎉`, 'success');
        myTurn = false;
        updateTurnDisplay();
    });
    
    socket.on('resetGame', () => {
        placedShips = [];
        currentShipIndex = 0;
        gameReady = false;
        myTurn = false;
        myBoard = [];
        enemyBoard = [];
        switchToPlacementScreen();
        initShipPlacement();
        showMessage('placementMessage', '¡Revancha! Coloca tus barcos nuevamente', 'info');
    });
    
    socket.on('opponentDisconnected', () => {
        showMessage('gameMessage', '⚠️ El oponente se desconectó. Esperando reconexión...', 'error');
        myTurn = false;
        updateTurnDisplay();
    });
    
    socket.on('invalidFire', (data) => {
        showMessage('gameMessage', data.message, 'error');
    });
    
    socket.on('shipsPlaced', () => {
        showMessage('placementMessage', 'Barcos colocados correctamente. Esperando al oponente...', 'success');
    });
}

function showLobbyCode(code) {
    const lobbyDiv = document.getElementById('lobbyScreen');
    let codeDisplay = document.getElementById('roomCodeDisplay');
    if (!codeDisplay) {
        codeDisplay = document.createElement('div');
        codeDisplay.id = 'roomCodeDisplay';
        codeDisplay.style.cssText = 'text-align: center; margin-top: 20px; padding: 15px; background: #2e7d64; border-radius: 10px;';
        lobbyDiv.appendChild(codeDisplay);
    }
    codeDisplay.innerHTML = `<strong>Código de sala:</strong> <span style="font-size: 2rem; letter-spacing: 5px;">${code}</span><br>
                             <small>Compártelo con tu oponente</small>`;
}

function showMessage(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.className = `message ${type}`;
        setTimeout(() => {
            if (el.textContent === message) {
                el.textContent = '';
                el.className = 'message';
            }
        }, 3000);
    }
}

function switchToPlacementScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('placementScreen').classList.add('active');
    currentScreen = 'placement';
}

function switchToGameScreen() {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('gameScreen').classList.add('active');
    currentScreen = 'game';
}

function initShipPlacement() {
    placedShips = [];
    currentShipIndex = 0;
    myBoard = createEmptyBoardData();
    updateShipsList();
    drawPlacementBoard();
    
    if (placementCanvas) {
        placementCanvas.removeEventListener('click', handlePlacementClick);
        placementCanvas.removeEventListener('contextmenu', handlePlacementRightClick);
        placementCanvas.addEventListener('click', handlePlacementClick);
        placementCanvas.addEventListener('contextmenu', handlePlacementRightClick);
    }
}

function createEmptyBoardData() {
    const board = [];
    for (let i = 0; i < 10; i++) {
        board[i] = [];
        for (let j = 0; j < 10; j++) {
            board[i][j] = { ship: null, hit: false, shipId: null };
        }
    }
    return board;
}

function updateShipsList() {
    const shipsListDiv = document.getElementById('shipsList');
    const readyBtn = document.getElementById('readyBtn');
    
    shipsListDiv.innerHTML = '';
    let allPlaced = true;
    
    shipsData.forEach((ship, idx) => {
        const shipDiv = document.createElement('div');
        shipDiv.className = `ship-item ${ship.placed ? 'placed' : ''}`;
        shipDiv.innerHTML = `
            <span>${ship.name}</span>
            <span class="ship-length">${'■'.repeat(ship.length)}</span>
        `;
        shipsListDiv.appendChild(shipDiv);
        if (!ship.placed) allPlaced = false;
    });
    
    readyBtn.disabled = !allPlaced;
    if (allPlaced) {
        showMessage('placementMessage', '¡Todos los barcos colocados! Haz clic en "Listo para jugar"', 'success');
    }
}

function handlePlacementClick(e) {
    if (currentShipIndex >= shipsData.length) return;
    if (shipsData[currentShipIndex].placed) {
        // Buscar siguiente barco no colocado
        let nextIndex = -1;
        for (let i = 0; i < shipsData.length; i++) {
            if (!shipsData[i].placed) {
                nextIndex = i;
                break;
            }
        }
        if (nextIndex === -1) return;
        currentShipIndex = nextIndex;
    }
    
    const rect = placementCanvas.getBoundingClientRect();
    const scaleX = placementCanvas.width / rect.width;
    const scaleY = placementCanvas.height / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    const cellSize = 500 / 10;
    const row = Math.floor(mouseY / cellSize);
    const col = Math.floor(mouseX / cellSize);
    
    if (row >= 0 && row < 10 && col >= 0 && col < 10) {
        const ship = shipsData[currentShipIndex];
        const canPlace = checkPlacement(row, col, ship.length, currentShipOrientation);
        
        if (canPlace) {
            placeShip(row, col, ship.length, currentShipOrientation, ship.name, currentShipIndex);
            shipsData[currentShipIndex].placed = true;
            
            // Avanzar al siguiente barco no colocado
            let nextIndex = -1;
            for (let i = currentShipIndex + 1; i < shipsData.length; i++) {
                if (!shipsData[i].placed) {
                    nextIndex = i;
                    break;
                }
            }
            if (nextIndex !== -1) {
                currentShipIndex = nextIndex;
            } else {
                currentShipIndex = shipsData.length;
            }
            
            updateShipsList();
            drawPlacementBoard();
        } else {
            showMessage('placementMessage', 'No se puede colocar el barco ahí', 'error');
        }
    }
}

function handlePlacementRightClick(e) {
    e.preventDefault();
    currentShipOrientation = currentShipOrientation === 'horizontal' ? 'vertical' : 'horizontal';
    showMessage('placementMessage', `Orientación: ${currentShipOrientation}`, 'info');
    return false;
}

function checkPlacement(row, col, length, orientation) {
    for (let i = 0; i < length; i++) {
        const r = orientation === 'horizontal' ? row : row + i;
        const c = orientation === 'horizontal' ? col + i : col;
        
        if (r >= 10 || c >= 10) return false;
        if (myBoard[r][c].ship !== null) return false;
        
        // Verificar adyacentes (sin tocar otros barcos)
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
                    if (myBoard[nr][nc].ship !== null && (dr !== 0 || dc !== 0)) {
                        return false;
                    }
                }
            }
        }
    }
    return true;
}

function placeShip(row, col, length, orientation, shipName, shipId) {
    for (let i = 0; i < length; i++) {
        const r = orientation === 'horizontal' ? row : row + i;
        const c = orientation === 'horizontal' ? col + i : col;
        myBoard[r][c].ship = shipName;
        myBoard[r][c].shipId = shipId;
    }
    
    placedShips.push({
        row, col, orientation, length, name: shipName, shipId
    });
}

function drawPlacementBoard() {
    if (!placementCtx) return;
    const cellSize = 500 / 10;
    
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            if (myBoard[i][j] && myBoard[i][j].ship !== null) {
                placementCtx.fillStyle = '#2ecc71';
                placementCtx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
            } else {
                placementCtx.fillStyle = '#0a2a5a';
                placementCtx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
            }
            
            placementCtx.strokeStyle = '#1a4a8a';
            placementCtx.strokeRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
        }
    }
    
    // Dibujar barco actual flotante
    if (currentShipIndex < shipsData.length && !shipsData[currentShipIndex].placed) {
        placementCtx.globalAlpha = 0.5;
        placementCtx.fillStyle = '#f39c12';
        // No dibujar barco flotante sin posición
        placementCtx.globalAlpha = 1;
    }
    
    // Dibujar números y letras
    placementCtx.fillStyle = '#ffd700';
    placementCtx.font = 'bold 16px Arial';
    for (let i = 0; i < 10; i++) {
        placementCtx.fillText(i + 1, 5, i * cellSize + 20);
        placementCtx.fillText(String.fromCharCode(65 + i), i * cellSize + 20, 20);
    }
}

function drawEmptyBoard(ctx, size) {
    if (!ctx) return;
    const cellSize = size / 10;
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            ctx.fillStyle = '#0a2a5a';
            ctx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
            ctx.strokeStyle = '#1a4a8a';
            ctx.strokeRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
        }
    }
}

function drawMyBoard() {
    if (!myBoardCtx) return;
    const cellSize = 450 / 10;
    
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            if (myBoard[i] && myBoard[i][j]) {
                if (myBoard[i][j].ship !== null) {
                    if (myBoard[i][j].hit) {
                        myBoardCtx.fillStyle = '#e74c3c';
                    } else {
                        myBoardCtx.fillStyle = '#2ecc71';
                    }
                } else {
                    if (myBoard[i][j].hit) {
                        myBoardCtx.fillStyle = '#7f8c8d';
                    } else {
                        myBoardCtx.fillStyle = '#0a2a5a';
                    }
                }
            } else {
                myBoardCtx.fillStyle = '#0a2a5a';
            }
            myBoardCtx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
            myBoardCtx.strokeStyle = '#1a4a8a';
            myBoardCtx.strokeRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
        }
    }
    
    myBoardCtx.fillStyle = '#ffd700';
    myBoardCtx.font = 'bold 14px Arial';
    for (let i = 0; i < 10; i++) {
        myBoardCtx.fillText(i + 1, 5, i * cellSize + 18);
        myBoardCtx.fillText(String.fromCharCode(65 + i), i * cellSize + 18, 18);
    }
}

function drawEnemyBoard() {
    if (!enemyBoardCtx) return;
    const cellSize = 450 / 10;
    
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            if (enemyBoard[i] && enemyBoard[i][j]) {
                if (enemyBoard[i][j].hit) {
                    if (enemyBoard[i][j].ship !== null) {
                        enemyBoardCtx.fillStyle = '#e74c3c';
                        enemyBoardCtx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
                        // Dibujar 💥
                        enemyBoardCtx.fillStyle = 'white';
                        enemyBoardCtx.font = `${cellSize * 0.6}px Arial`;
                        enemyBoardCtx.fillText('💥', j * cellSize + cellSize * 0.25, i * cellSize + cellSize * 0.75);
                    } else {
                        enemyBoardCtx.fillStyle = '#7f8c8d';
                        enemyBoardCtx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
                        // Dibujar 💧
                        enemyBoardCtx.fillStyle = '#bdc3c7';
                        enemyBoardCtx.font = `${cellSize * 0.5}px Arial`;
                        enemyBoardCtx.fillText('💧', j * cellSize + cellSize * 0.35, i * cellSize + cellSize * 0.7);
                    }
                } else {
                    enemyBoardCtx.fillStyle = '#0a2a5a';
                    enemyBoardCtx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
                }
            } else {
                enemyBoardCtx.fillStyle = '#0a2a5a';
                enemyBoardCtx.fillRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
            }
            enemyBoardCtx.strokeStyle = '#1a4a8a';
            enemyBoardCtx.strokeRect(j * cellSize, i * cellSize, cellSize - 1, cellSize - 1);
        }
    }
    
    enemyBoardCtx.fillStyle = '#ffd700';
    enemyBoardCtx.font = 'bold 14px Arial';
    for (let i = 0; i < 10; i++) {
        enemyBoardCtx.fillText(i + 1, 5, i * cellSize + 18);
        enemyBoardCtx.fillText(String.fromCharCode(65 + i), i * cellSize + 18, 18);
    }
    
    // Agregar evento de disparo
    if (enemyBoardCanvas) {
        enemyBoardCanvas.removeEventListener('click', handleFireClick);
        if (gameReady && myTurn) {
            enemyBoardCanvas.addEventListener('click', handleFireClick);
        }
    }
}

function handleFireClick(e) {
    if (!myTurn || !gameReady) {
        showMessage('gameMessage', 'No es tu turno', 'error');
        return;
    }
    
    const rect = enemyBoardCanvas.getBoundingClientRect();
    const scaleX = enemyBoardCanvas.width / rect.width;
    const scaleY = enemyBoardCanvas.height / rect.height;
    
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    
    const cellSize = 450 / 10;
    const row = Math.floor(mouseY / cellSize);
    const col = Math.floor(mouseX / cellSize);
    
    if (row >= 0 && row < 10 && col >= 0 && col < 10) {
        if (enemyBoard[row] && enemyBoard[row][col] && !enemyBoard[row][col].hit) {
            socket.emit('fire', { roomId, row, col });
            myTurn = false;
            updateTurnDisplay();
        } else {
            showMessage('gameMessage', 'Ya disparaste ahí', 'error');
        }
    }
}

function updateTurnDisplay() {
    const turnIndicator = document.getElementById('turnIndicator');
    if (turnIndicator) {
        if (myTurn && gameReady) {
            turnIndicator.textContent = '🔫 ¡TU TURNO! Dispara 🔫';
            turnIndicator.className = 'turn-indicator my-turn';
        } else if (gameReady) {
            turnIndicator.textContent = '⏳ Turno del oponente... ⏳';
            turnIndicator.className = 'turn-indicator';
        } else {
            turnIndicator.textContent = 'Esperando inicio...';
            turnIndicator.className = 'turn-indicator';
        }
    }
}

// Prevenir contexto en canvas
document.addEventListener('contextmenu', (e) => {
    if (e.target.tagName === 'CANVAS') {
        e.preventDefault();
    }
});