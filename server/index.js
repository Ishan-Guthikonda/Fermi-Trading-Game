const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configure CORS for production
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ["https://fermi-market-game.vercel.app", "https://fermi-market-game-git-main.vercel.app"]
      : "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ["https://fermi-market-game.vercel.app", "https://fermi-market-game-git-main.vercel.app"]
    : "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Serve static files from React build
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Game state
const games = new Map(); // roomCode -> game state
const userSessions = new Map(); // socketId -> user info

// Fermi questions database
const fermiQuestions = [
  {
    question: "How many piano tuners are there in New York City?",
    answer: 200,
    explanation: "Based on population, piano ownership rates, and tuning frequency"
  },
  {
    question: "How many gas stations are there in the United States?",
    answer: 150000,
    explanation: "Based on population density, car ownership, and fuel consumption patterns"
  },
  {
    question: "How many tennis balls can fit in a Boeing 747?",
    answer: 10000000,
    explanation: "Based on volume calculations of tennis balls vs aircraft cargo space"
  },
  {
    question: "How many smartphones are sold worldwide each year?",
    answer: 1500000000,
    explanation: "Based on market research and global population statistics"
  },
  {
    question: "How many McDonald's restaurants are there globally?",
    answer: 40000,
    explanation: "Based on official McDonald's corporate data"
  },
  {
    question: "How many steps does the average person take in a lifetime?",
    answer: 216000000,
    explanation: "Based on average daily steps, life expectancy, and walking patterns"
  },
  {
    question: "How many books are in the Library of Congress?",
    answer: 40000000,
    explanation: "Based on official Library of Congress statistics"
  },
  {
    question: "How many grains of sand are on a typical beach?",
    answer: 5000000000000,
    explanation: "Based on beach area, sand depth, and grain size calculations"
  },
  {
    question: "How many trees are there in the Amazon rainforest?",
    answer: 390000000000,
    explanation: "Based on satellite data and forest density measurements"
  },
  {
    question: "How many heartbeats does a person have in their lifetime?",
    answer: 3000000000,
    explanation: "Based on average heart rate and life expectancy"
  },
  {
    question: "How many stars are visible to the naked eye on a clear night?",
    answer: 5000,
    explanation: "Based on atmospheric conditions and human visual acuity"
  },
  {
    question: "How many hairs are on the average human head?",
    answer: 100000,
    explanation: "Based on medical studies and hair density measurements"
  }
];

class Game {
  constructor(roomCode, hostId) {
    this.roomCode = roomCode;
    this.hostId = hostId;
    this.players = new Map(); // userId -> player data
    this.orderBook = {
      bids: [], // [{price, quantity, userId, timestamp, orderId}]
      asks: []  // [{price, quantity, userId, timestamp, orderId}]
    };
    this.gameState = 'waiting'; // waiting, active, ended
    this.currentQuestion = null;
    this.gameStartTime = null;
    this.gameDuration = 3 * 60 * 1000; // 3 minutes in milliseconds
    this.tradingLock = false;
    this.lockQueue = [];
  }

  addPlayer(userId, username, socketId) {
    this.players.set(userId, {
      id: userId,
      username,
      socketId,
      cash: 10000, // Starting cash
      position: 0, // Long/short position
      orders: {
        bid: null,
        ask: null
      }
    });
  }

  removePlayer(userId) {
    // Cancel any open orders
    const player = this.players.get(userId);
    if (player) {
      this.cancelOrder(userId, 'bid');
      this.cancelOrder(userId, 'ask');
      this.players.delete(userId);
    }
  }

  startGame() {
    if (this.gameState !== 'waiting') return false;
    
    // Select random Fermi question
    const randomIndex = Math.floor(Math.random() * fermiQuestions.length);
    this.currentQuestion = fermiQuestions[randomIndex];
    
    this.gameState = 'active';
    this.gameStartTime = Date.now();
    
    // Schedule game end
    setTimeout(() => {
      this.endGame();
    }, this.gameDuration);
    
    return true;
  }

  endGame() {
    this.gameState = 'ended';
    
    // Calculate final settlements
    const contractPrice = this.currentQuestion.answer;
    
    for (const [userId, player] of this.players) {
      const settlement = player.position * contractPrice;
      player.cash += settlement;
      player.position = 0; // Reset position
    }
    
    // Clear all orders
    this.orderBook.bids = [];
    this.orderBook.asks = [];
    
    // Notify all players
    this.broadcastToRoom('gameEnded', {
      contractPrice,
      explanation: this.currentQuestion.explanation,
      finalBalances: Array.from(this.players.values()).map(p => ({
        username: p.username,
        cash: p.cash,
        position: p.position
      }))
    });
  }

  async placeOrder(userId, type, price, quantity) {
    return new Promise((resolve) => {
      const lockRequest = { userId, type, price, quantity, resolve };
      this.lockQueue.push(lockRequest);
      this.processLockQueue();
    });
  }

  processLockQueue() {
    if (this.tradingLock || this.lockQueue.length === 0) return;
    
    this.tradingLock = true;
    const request = this.lockQueue.shift();
    
    try {
      const result = this.executeOrder(request.userId, request.type, request.price, request.quantity);
      request.resolve(result);
    } catch (error) {
      request.resolve({ success: false, error: error.message });
    } finally {
      this.tradingLock = false;
      // Process next request after a short delay
      setTimeout(() => this.processLockQueue(), 100);
    }
  }

  executeOrder(userId, type, price, quantity) {
    const player = this.players.get(userId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Validate order
    if (price < 1 || quantity < 20) {
      throw new Error('Minimum price is $1 and minimum quantity is 20 shares');
    }

    if (type === 'bid') {
      // Check if player has enough cash
      const totalCost = price * quantity;
      if (player.cash < totalCost) {
        throw new Error('Insufficient cash');
      }

      // Cancel existing bid
      this.cancelOrder(userId, 'bid');

      // Add new bid
      const orderId = uuidv4();
      const order = {
        price,
        quantity,
        userId,
        timestamp: Date.now(),
        orderId
      };

      this.orderBook.bids.push(order);
      this.orderBook.bids.sort((a, b) => b.price - a.price); // Sort by price descending
      player.orders.bid = orderId;

      // Try to match with asks
      this.matchOrders();

    } else if (type === 'ask') {
      // Check if player has enough shares to sell
      if (player.position < quantity) {
        throw new Error('Insufficient shares to sell');
      }

      // Cancel existing ask
      this.cancelOrder(userId, 'ask');

      // Add new ask
      const orderId = uuidv4();
      const order = {
        price,
        quantity,
        userId,
        timestamp: Date.now(),
        orderId
      };

      this.orderBook.asks.push(order);
      this.orderBook.asks.sort((a, b) => a.price - b.price); // Sort by price ascending
      player.orders.ask = orderId;

      // Try to match with bids
      this.matchOrders();
    }

    this.broadcastOrderBook();
    return { success: true };
  }

  cancelOrder(userId, type) {
    const player = this.players.get(userId);
    if (!player) return;

    if (type === 'bid' && player.orders.bid) {
      this.orderBook.bids = this.orderBook.bids.filter(order => order.orderId !== player.orders.bid);
      player.orders.bid = null;
    } else if (type === 'ask' && player.orders.ask) {
      this.orderBook.asks = this.orderBook.asks.filter(order => order.orderId !== player.orders.ask);
      player.orders.ask = null;
    }

    this.broadcastOrderBook();
  }

  matchOrders() {
    while (this.orderBook.bids.length > 0 && this.orderBook.asks.length > 0) {
      const bestBid = this.orderBook.bids[0];
      const bestAsk = this.orderBook.asks[0];

      if (bestBid.price >= bestAsk.price) {
        // Match found
        const tradeQuantity = Math.min(bestBid.quantity, bestAsk.quantity);
        const tradePrice = bestAsk.timestamp < bestBid.timestamp ? bestAsk.price : bestBid.price;

        // Execute trade
        const bidPlayer = this.players.get(bestBid.userId);
        const askPlayer = this.players.get(bestAsk.userId);

        // Update positions
        bidPlayer.position += tradeQuantity;
        askPlayer.position -= tradeQuantity;

        // Update cash
        const tradeValue = tradePrice * tradeQuantity;
        bidPlayer.cash -= tradeValue;
        askPlayer.cash += tradeValue;

        // Update order quantities
        bestBid.quantity -= tradeQuantity;
        bestAsk.quantity -= tradeQuantity;

        // Remove filled orders
        if (bestBid.quantity === 0) {
          this.orderBook.bids.shift();
          bidPlayer.orders.bid = null;
        }
        if (bestAsk.quantity === 0) {
          this.orderBook.asks.shift();
          askPlayer.orders.ask = null;
        }

        // Broadcast trade
        this.broadcastToRoom('tradeExecuted', {
          price: tradePrice,
          quantity: tradeQuantity,
          bidder: bidPlayer.username,
          asker: askPlayer.username,
          timestamp: Date.now()
        });

      } else {
        break; // No more matches possible
      }
    }
  }

  broadcastOrderBook() {
    this.broadcastToRoom('orderBookUpdate', {
      bids: this.orderBook.bids.slice(0, 10), // Top 10 bids
      asks: this.orderBook.asks.slice(0, 10)  // Top 10 asks
    });
  }

  broadcastToRoom(event, data) {
    for (const [userId, player] of this.players) {
      io.to(player.socketId).emit(event, data);
    }
  }

  getGameState() {
    return {
      roomCode: this.roomCode,
      gameState: this.gameState,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        cash: p.cash,
        position: p.position
      })),
      orderBook: {
        bids: this.orderBook.bids.slice(0, 10),
        asks: this.orderBook.asks.slice(0, 10)
      },
      currentQuestion: this.currentQuestion ? {
        question: this.currentQuestion.question
      } : null,
      timeRemaining: this.gameState === 'active' ? 
        Math.max(0, this.gameDuration - (Date.now() - this.gameStartTime)) : 0
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (data) => {
    const roomCode = generateRoomCode();
    const game = new Game(roomCode, socket.id);
    games.set(roomCode, game);
    
    game.addPlayer(socket.id, data.username, socket.id);
    socket.join(roomCode);
    
    userSessions.set(socket.id, {
      userId: socket.id,
      username: data.username,
      roomCode: roomCode,
      isHost: true
    });

    socket.emit('roomCreated', { roomCode });
    socket.emit('gameState', game.getGameState());
  });

  socket.on('joinRoom', (data) => {
    const game = games.get(data.roomCode);
    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (game.gameState !== 'waiting') {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    game.addPlayer(socket.id, data.username, socket.id);
    socket.join(data.roomCode);
    
    userSessions.set(socket.id, {
      userId: socket.id,
      username: data.username,
      roomCode: data.roomCode,
      isHost: false
    });

    socket.emit('roomJoined', { roomCode: data.roomCode });
    game.broadcastToRoom('playerJoined', {
      username: data.username,
      playerCount: game.players.size
    });
    socket.emit('gameState', game.getGameState());
  });

  socket.on('startGame', () => {
    const session = userSessions.get(socket.id);
    if (!session || !session.isHost) {
      socket.emit('error', { message: 'Only host can start the game' });
      return;
    }

    const game = games.get(session.roomCode);
    if (game && game.startGame()) {
      game.broadcastToRoom('gameStarted', {
        question: game.currentQuestion.question,
        timeRemaining: game.gameDuration
      });
    }
  });

  socket.on('placeOrder', async (data) => {
    const session = userSessions.get(socket.id);
    if (!session) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }

    const game = games.get(session.roomCode);
    if (!game || game.gameState !== 'active') {
      socket.emit('error', { message: 'Game not active' });
      return;
    }

    try {
      const result = await game.placeOrder(socket.id, data.type, data.price, data.quantity);
      socket.emit('orderResult', result);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('cancelOrder', (data) => {
    const session = userSessions.get(socket.id);
    if (!session) return;

    const game = games.get(session.roomCode);
    if (game) {
      game.cancelOrder(socket.id, data.type);
    }
  });

  socket.on('disconnect', () => {
    const session = userSessions.get(socket.id);
    if (session) {
      const game = games.get(session.roomCode);
      if (game) {
        game.removePlayer(socket.id);
        game.broadcastToRoom('playerLeft', {
          username: session.username,
          playerCount: game.players.size
        });
        
        // Clean up empty games
        if (game.players.size === 0) {
          games.delete(session.roomCode);
        }
      }
      userSessions.delete(socket.id);
    }
    console.log('User disconnected:', socket.id);
  });
});

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app for all other routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;

// Only start server if not in Vercel environment
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;