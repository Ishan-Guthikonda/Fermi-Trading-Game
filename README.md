# Fermi Market Game

An online multiplayer trading game where players trade contracts based on 
Fermi estimation questions. Players don't know the actual answer to the 
question but can bid and ask on what they think the contract value will 
be. At the end of each round, the number of contracts a player is long or 
short times the true value of the contract is added to the player's 
bankroll.

# Link
https://fermi-market-game.vercel.app/

## Features

- **Real-time Trading**: Live order book with bid/ask matching using 
price-time priority
- **Room-based Multiplayer**: Create or join rooms with unique codes
- **Fermi Questions**: Trade contracts based on estimation questions
- **Order Management**: Place, modify, and cancel orders
- **Live Leaderboard**: See players' cash and positions in real-time
- **Trade History**: View recent trades

## Game Rules

- Each player starts with 0 cash
- Minimum order size: 20 shares
- Minimum price increment: $1
- Players can have maximum 1 bid and 1 ask at a time
- Game duration: 1 minutes per round
- At game end, contracts settle at the actual answer value
- Players' positions are multiplied by the contract price and added/subtracted from cash

## Technology Stack

- **Backend**: Firebase Realtime Database, Firebase Authentication
- **Frontend**: React, TypeScript (contains all game logic)
- **Server**: Minimal Express server (static file serving only)
- **Real-time Communication**: Firebase Realtime Database with live listeners
- **Styling**: CSS3 with modern design

## Architecture

This app uses a **serverless architecture** where all game logic runs in the client:

1. **Firebase Realtime Database**: Central source of truth for multiplayer state
   - Game rooms, players, order books, and game state
   - Real-time synchronization across all connected clients
   - Host writes updates, non-hosts listen for changes

2. **Client-side Game Logic** (`App.tsx`):
   - Order matching algorithm (price-time priority)
   - Position and cash calculations
   - Round scoring and tournament management
   - Timer synchronization (host broadcasts, others receive)

3. **Express Server**: Minimal role
   - Serves production build files
   - Health check endpoint for deployment platforms
   - No game logic or WebSocket handling

4. **Deployment Options**:
   - Firebase Hosting (recommended)
   - Vercel (frontend + serverless functions)
   - Any static hosting + Firebase backend

## Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- npm
- Firebase account (for production deployment)

### Firebase Setup (Optional for Development)
The app is configured to work with Firebase but can run locally for single-device testing:

1. **For Production/Multi-device:**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Firebase Realtime Database
   - Enable Firebase Authentication (Anonymous sign-in)
   - Update `client/src/firebase.ts` with your Firebase config
   - Set up Firebase database rules

2. **For Local Development (Single Device):**
   - The app will work locally with fallback to localStorage
   - Firebase connection attempts are non-blocking

### Installation

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### Running the App

**Development Mode (Frontend Only):**
```bash
cd client
npm start
```
The client will run on `http://localhost:3000`

**Production Mode (Frontend + Backend):**
```bash
# Build the client
cd client
npm run build
cd ..

# Start the Express server
npm start
```
The server will run on `http://localhost:3001` and serve the built React app

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
   - After rounds are over, the game ends
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

## Firebase Database Structure

The app uses Firebase Realtime Database with the following structure:

```
games/
└── {roomCode}/
    ├── roomCode: string
    ├── gameState: 'waiting' | 'active' | 'finished' | 'tournament_finished'
    ├── hostId: string
    ├── currentRound: number
    ├── totalRounds: number
    ├── timeRemaining: number (milliseconds)
    ├── currentQuestion: { question: string }
    ├── realAssetValue: number (revealed at round end)
    ├── marketPrice: number (calculated at round end)
    ├── players/
    │   └── {userId}/
    │       ├── id: string
    │       ├── username: string
    │       ├── cash: number
    │       ├── position: number
    │       ├── isHost: boolean
    │       ├── totalPoints: number
    │       └── currentRoundPoints: number
    ├── orderBook/
    │   ├── bids/
    │   │   └── {orderId}/
    │   │       ├── price: number
    │   │       ├── quantity: number
    │   │       ├── userId: string
    │   │       ├── timestamp: number
    │   │       └── orderId: string
    │   └── asks/
    │       └── {orderId}/
    │           ├── price: number
    │           ├── quantity: number
    │           ├── userId: string
    │           ├── timestamp: number
    │           └── orderId: string
    └── roundResults: Array<{round: number, rankings: Array}>
```

### Express API Endpoints

- `GET /api/health` - Health check endpoint (returns `{ status: 'ok', timestamp: ISO string }`)
- `GET *` - Serves React build files in production

## File Structure

```
fermi-market-game/
├── server/
│   └── index.js              # Express server (static file serving)
├── client/
│   ├── src/
│   │   ├── App.tsx           # Main React component (all game logic)
│   │   ├── App.css           # Styling
│   │   ├── firebase.ts       # Firebase configuration & initialization
│   │   ├── index.tsx         # React entry point
│   │   └── react-app-env.d.ts
│   ├── build/                # Production build files
│   ├── public/               # Static assets
│   ├── package.json          # Client dependencies
│   └── tsconfig.json         # TypeScript configuration
├── firebase.json             # Firebase hosting configuration
├── .firebaserc               # Firebase project settings
├── package.json              # Root dependencies
├── vercel.json               # Vercel deployment config
└── README.md                 # This file
```

### Key Files

- **`client/src/App.tsx`**: Contains all game logic including order matching, room management, and state updates
- **`client/src/firebase.ts`**: Firebase SDK initialization and configuration
- **`server/index.js`**: Minimal Express server for production static file serving
- **`firebase.json`**: Firebase hosting configuration and database rules reference

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
- [ ] Player statistics and history
- [ ] Tournament mode
- [ ] Mobile app
- [ ] Spectator mode
- [ ] Custom question submission

