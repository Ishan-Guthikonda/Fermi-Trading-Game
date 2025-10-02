# Fermi Market Game

An online multiplayer trading game where players trade contracts based on Fermi estimation questions. Players don't know the actual answer but can bid and ask on what they think the contract value will be.

## Features

- **Real-time Trading**: Live order book with bid/ask matching
- **Room-based Multiplayer**: Create or join rooms with unique codes
- **Fermi Questions**: Trade contracts based on estimation questions
- **Order Management**: Place, modify, and cancel orders with locking system
- **Live Leaderboard**: See all players' cash and positions in real-time
- **Trade History**: View recent trades and executions
- **Responsive Design**: Works on desktop and mobile devices

## Game Rules

- Each player starts with $10,000 cash
- Minimum order size: 20 shares
- Minimum price increment: $1
- Players can have maximum 1 bid and 1 ask at a time
- Game duration: 3 minutes
- At game end, contracts settle at the actual answer value
- Players' positions are multiplied by the contract price and added/subtracted from cash

## Technology Stack

- **Backend**: Node.js, Express, Socket.io
- **Frontend**: React, TypeScript
- **Real-time Communication**: WebSocket via Socket.io
- **Styling**: CSS3 with modern design

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm

### Backend Setup
```bash
# Install dependencies
npm install

# Start the server
npm start
```

The server will run on `http://localhost:5000`

### Frontend Setup
```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start the development server
npm start
```

The client will run on `http://localhost:3000`

### Development Mode
To run both backend and frontend simultaneously:
```bash
npm run dev
```

## How to Play

1. **Create or Join a Room**
   - Enter your username
   - Click "Create Room" to host a new game
   - Or enter a room code and click "Join Room"

2. **Start Trading**
   - Host clicks "Start Game" to begin
   - A Fermi question appears (e.g., "How many piano tuners are in NYC?")
   - Players place bids (buy orders) and asks (sell orders)
   - Orders are matched automatically when prices overlap

3. **Order Management**
   - Choose "Buy" or "Sell"
   - Enter price ($1 minimum) and quantity (20 minimum)
   - Click "Place Order" to submit
   - Use "Cancel" buttons to remove existing orders

4. **Game End**
   - After 3 minutes, the game ends
   - Contracts settle at the actual answer value
   - Final balances are calculated and displayed

## Game Mechanics

### Order Book
- **Bids**: Buy orders sorted by price (highest first)
- **Asks**: Sell orders sorted by price (lowest first)
- **Matching**: Orders execute when bid price ≥ ask price
- **Priority**: Older orders have priority at the same price

### Position Tracking
- **Long Position**: Positive number of shares owned
- **Short Position**: Negative number of shares (sold more than owned)
- **Settlement**: Position × contract price added to cash

### Locking System
- Prevents concurrent order placement
- Ensures order integrity and proper matching
- Queue-based system processes orders sequentially

## API Endpoints

### Socket Events

**Client → Server:**
- `createRoom`: Create new game room
- `joinRoom`: Join existing room
- `startGame`: Start the game (host only)
- `placeOrder`: Place bid/ask order
- `cancelOrder`: Cancel existing order

**Server → Client:**
- `roomCreated`: Room successfully created
- `roomJoined`: Successfully joined room
- `gameState`: Current game state update
- `gameStarted`: Game has started
- `orderBookUpdate`: Order book changes
- `tradeExecuted`: Trade execution notification
- `gameEnded`: Game finished with results

## File Structure

```
fermi-market-game/
├── server/
│   └── index.js          # Main server file
├── client/
│   ├── src/
│   │   ├── App.tsx       # Main React component
│   │   ├── App.css       # Styling
│   │   └── index.tsx     # React entry point
│   └── package.json      # Client dependencies
├── package.json          # Server dependencies
└── README.md            # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify as needed.

## Future Enhancements

- [ ] Multiple contract types per game
- [ ] Advanced order types (stop-loss, limit orders)
- [ ] Player statistics and history
- [ ] Tournament mode
- [ ] Mobile app
- [ ] Spectator mode
- [ ] Custom question submission

