import React, { useState, useEffect } from 'react';
import './App.css';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { database, auth } from './firebase';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ref, onValue, set, get } from 'firebase/database';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

interface Player {
  id: string;
  username: string;
  cash: number;
  position: number;
  isHost?: boolean;
  lastSeen?: any;
  totalPoints?: number; // Total points across all rounds
  currentRoundPoints?: number; // Points for current round
}

interface Order {
  price: number;
  quantity: number;
  userId: string;
  timestamp: number;
  orderId: string;
}

interface GameState {
  roomCode: string;
  gameState: 'waiting' | 'active' | 'finished' | 'round_finished' | 'tournament_finished';
  players: Record<string, Player>;
  orderBook: {
    bids: Record<string, Order>;
    asks: Record<string, Order>;
  };
  currentQuestion?: { question: string };
  timeRemaining?: number;
  hostId: string;
  gameStartTime?: any;
  realAssetValue?: number; // The true value of the asset, only revealed at game end
  marketPrice?: number; // The market price used for scoring (average of bid/ask prices)
  currentRound?: number; // Current round (1-5)
  totalRounds?: number; // Total rounds (5)
  roundResults?: Array<{round: number, rankings: Array<{playerId: string, points: number}>}>;
}

interface Trade {
  price: number;
  quantity: number;
  buyer: string;
  seller: string;
  timestamp: number;
}

const mockFermiQuestions = [
  { question: "What's the population of New York City?", answer: 8336817 },
  { question: "How many cars are registered in California?", answer: 15000000 },
  { question: "What's the GDP of Switzerland?", answer: 812900000000 },
  { question: "How many books are sold annually in the US?", answer: 675000000 },
  { question: "What's the height of Mount Everest?", answer: 8849 },
  { question: "How many restaurants are in Tokyo?", answer: 160000 },
  { question: "What's the speed of light in km/h?", answer: 1079252849 },
  { question: "How many airports are in the United States?", answer: 13513 },
  { question: "What's the population of London?", answer: 8982000 },
  { question: "How many McDonald's restaurants are worldwide?", answer: 40000 },
  { question: "What's the distance from Earth to Moon in km?", answer: 384400 },
  { question: "How many Starbucks stores are worldwide?", answer: 33000 },
  { question: "What's the population of Tokyo?", answer: 13960000 },
  { question: "How many cars are sold in the US per year?", answer: 15000000 },
  { question: "How many books are in the Library of Congress?", answer: 170000000 },
  { question: "What's the population of Paris?", answer: 2161000 },
  { question: "How many universities are in the United States?", answer: 4000 },
  { question: "What's the area of Texas in square miles?", answer: 268596 },
  { question: "How many movies are released in Hollywood per year?", answer: 800 },
  { question: "What's the population of Australia?", answer: 25690000 },
  { question: "How many hospitals are in the United States?", answer: 6093 },
  { question: "What's the length of the Great Wall of China in miles?", answer: 13171 },
  { question: "How many smartphones are sold worldwide per year?", answer: 1500000000 },
  { question: "What's the population of Canada?", answer: 38000000 },
  { question: "How many miles of roads are in the United States?", answer: 4000000 },
  { question: "What's the depth of the Mariana Trench in feet?", answer: 36070 },
  { question: "How many people visit Disney World annually?", answer: 58000000 },
  { question: "What's the population of Brazil?", answer: 215300000 },
  { question: "How many satellites orbit Earth?", answer: 6000 },
  { question: "What's the temperature of the Sun's surface in Fahrenheit?", answer: 10000 }
];

const App: React.FC = () => {
  const [username, setUsername] = useState<string>('');
  const [roomCode, setRoomCode] = useState<string>('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [currentView, setCurrentView] = useState<'lobby' | 'game'>('lobby');
  const [userId, setUserId] = useState<string>('');
  const [error, setError] = useState<Error | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [firebaseAuth, setFirebaseAuth] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isHost, setIsHost] = useState(false);
  const isHostRef = React.useRef(false); // Use ref to avoid closure issues

  // Initialize Firebase and user ID
  useEffect(() => {
    const newUserId = Math.random().toString(36).substring(2, 15);
    setUserId(newUserId);
    console.log('User ID generated:', newUserId);
    
    // Try Firebase authentication in background (non-blocking)
    const initializeFirebase = async () => {
      try {
        console.log('Attempting Firebase connection...');
        
        // Anonymous auth (don't block UI if this takes a bit)
        const userCredential = await signInAnonymously(auth);
        console.log('Firebase auth successful:', userCredential.user.uid);
        setFirebaseAuth(true);
        
        // Optional: best-effort liveness ping (no timeout gate)
        try {
          const testRef = ref(database, 'connection-test');
          set(testRef, { t: Date.now(), uid: userCredential.user.uid });
        } catch { /* non-fatal */ }
        
        // Multiplayer can proceed; listener attaches when roomCode is set
        // If rules require auth, the listener will work once auth completes
        console.log('✅ Firebase auth ready');
      } catch (error) {
        // Log but don't disable multiplayer unconditionally—allow retries
        console.error('Firebase init/auth error:', error);
      }
    };
    
    // Run Firebase init in background - don't block UI
    setTimeout(initializeFirebase, 100);
    
    // Watch for auth state changes
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setFirebaseAuth(true);
        console.log('Firebase user detected:', user.uid);
      } else {
        setFirebaseAuth(false);
      }
    });
    
    return () => unsubscribeAuth();
  }, []);

  // Firebase real-time listener for cross-device multiplayer
  useEffect(() => {
    if (!roomCode) {
      console.log('Firebase listener blocked: no roomCode');
      return;
    }
    
    console.log('🔧🔧🔧 Setting up Firebase listener for room:', roomCode, 'isHostRef:', isHostRef.current, 'userId:', userId);
    const gameRef = ref(database, `games/${roomCode}`);
    
    // Test Firebase connection
    console.log('🧪 Testing Firebase read access...');
    get(gameRef).then(snapshot => {
      if (snapshot.exists()) {
        console.log('✅ Firebase read test SUCCESS! Data exists:', {
          state: snapshot.val()?.gameState,
          round: snapshot.val()?.currentRound
        });
      } else {
        console.log('⚠️ Firebase read test: Room does not exist');
      }
    }).catch(error => {
      console.error('❌ Firebase read test FAILED:', error);
    });
    
    const unsubscribe = onValue(gameRef, (snapshot) => {
      console.log('🔔 FIREBASE LISTENER TRIGGERED!', new Date().toLocaleTimeString());
      
      const firebaseGameState = snapshot.val();
      if (firebaseGameState == null) {
        console.warn('⚠️ Room missing/deleted from Firebase');
        return;
      }
      
      console.log('📥 Firebase update received:', {
        state: firebaseGameState.gameState,
        round: firebaseGameState.currentRound,
        timeRemaining: firebaseGameState.timeRemaining,
        isHost: isHostRef.current,
        timestamp: new Date().toLocaleTimeString()
      });
      
      // EVERYONE (host and non-host) accepts Firebase updates unconditionally
      const newState = {
        ...firebaseGameState,
        orderBook: firebaseGameState.orderBook || { bids: {}, asks: {} }
      };
      
      console.log('✅ Accepting Firebase state:', {
        state: newState.gameState,
        round: newState.currentRound,
        hasQuestion: !!newState.currentQuestion?.question,
        timeRemaining: newState.timeRemaining
      });
      
      setGameState(newState);
    }, (error) => {
      console.error('❌ Firebase listener error:', error);
    });
    
    return () => {
      console.log('🔌 Firebase listener unsubscribing for room:', roomCode);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, userId]); // Removed isHost and lastHostAction to prevent re-subscriptions

  // Timer effect - runs for all players when game is active
  useEffect(() => {
    if (!gameState || gameState.gameState !== 'active' || !gameState.timeRemaining || gameState.timeRemaining <= 0) {
      console.log('⏱️ Timer NOT starting:', {
        hasGameState: !!gameState,
        gameState: gameState?.gameState,
        timeRemaining: gameState?.timeRemaining,
        round: gameState?.currentRound
      });
      return;
    }

    console.log('⏱️⏱️⏱️ Timer STARTING for round', gameState.currentRound, 'with:', gameState.timeRemaining, 'ms, isHost:', isHostRef.current);
    let lastSyncTime = Date.now();
    let localTimeRemaining = gameState.timeRemaining;
    let hasEnded = false;
    const startRound = gameState.currentRound;

    // Use a simple countdown timer that decreases every second
    const updateTimer = () => {
      if (hasEnded) {
        console.log('⏱️ Timer already ended, stopping');
        return;
      }
      
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTime;
      
      // Update local timer
      localTimeRemaining = Math.max(0, localTimeRemaining - timeSinceLastSync);
      lastSyncTime = now;
      
      console.log('⏱️ Timer update for round', startRound, ':', Math.floor(localTimeRemaining / 1000), 'seconds remaining');
      
      // Check if time is up
      if (localTimeRemaining <= 0 && !hasEnded) {
        hasEnded = true;
        console.log('⏱️⏱️⏱️ TIME UP for round', startRound, '! Ending game...');
        
        // Only host triggers endGame() which calculates points
        if (isHostRef.current) {
          // Call endGame IMMEDIATELY (no setTimeout to prevent race conditions)
          console.log('🏁 Host calling endGame() IMMEDIATELY');
          endGame();
        } else {
          console.log('👥 Non-host waiting for host to end game');
        }
        return;
      }
      
      // Update local timer state ONLY if still on the same round
      setGameState(prev => {
        if (!prev || prev.gameState !== 'active' || prev.currentRound !== startRound) {
          console.log('⏱️ Stopping timer - round changed or game not active');
          hasEnded = true;
          return prev;
        }
        return { ...prev, timeRemaining: localTimeRemaining };
      });
      
      // Host syncs timer to Firebase every 2 seconds
      if (isHostRef.current && roomCode && localTimeRemaining > 0) {
        const shouldSync = Math.floor(localTimeRemaining / 2000) !== Math.floor((localTimeRemaining + 1000) / 2000);
        if (shouldSync) {
          setTimeout(async () => {
            try {
              const timerRef = ref(database, `games/${roomCode}/timeRemaining`);
              await set(timerRef, localTimeRemaining);
              console.log('✅ Timer synced to Firebase:', Math.floor(localTimeRemaining / 1000), 's');
            } catch (error) {
              console.log('⚠️ Timer sync failed:', error);
            }
          }, 100);
        }
      }
      
      // Continue the timer
      if (localTimeRemaining > 0 && !hasEnded) {
        setTimeout(updateTimer, 1000); // Update every second
      }
    };

    // Start the timer
    const timerId = setTimeout(updateTimer, 1000);
    
    return () => {
      console.log('⏱️ Timer cleanup for round', startRound);
      clearTimeout(timerId);
      hasEnded = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.gameState, gameState?.currentRound, gameState?.timeRemaining, roomCode]); // Include timeRemaining to restart timer properly


  const createRoom = async () => {
    console.log('=== CREATE ROOM START ===');
    console.log('Username:', username);
    console.log('UserId:', userId);
    
    if (!username.trim()) {
      alert('Please enter a username');
      console.log('❌ Username validation failed');
      return;
    }
    
    if (!userId) {
      alert('User ID not ready. Please try again in a moment.');
      console.log('❌ UserId not ready');
      return;
    }
    
    setIsHost(true);
    isHostRef.current = true; // Update ref
    
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    console.log('Generated room code:', newRoomCode);
    
    const newGameState: GameState = {
      roomCode: newRoomCode,
      gameState: 'waiting' as const,
      players: {
        [userId]: { 
          id: userId, 
          username: username, 
          cash: 0, // Start with 0 dollars
          position: 0,
          isHost: true,
          lastSeen: Date.now(),
          totalPoints: 0,
          currentRoundPoints: 0
        }
      },
      orderBook: { bids: {}, asks: {} },
      currentQuestion: { question: "" },
      timeRemaining: 0,
      hostId: userId,
      currentRound: 1,
      totalRounds: 5,
      roundResults: []
    };
    
    console.log('Created game state:', newGameState);
    
    // Always set local state first (instant UI)
    console.log('Setting local state...');
    setGameState(newGameState);
    setCurrentView('game');
    setRoomCode(newRoomCode); // Set roomCode LAST to avoid triggering useEffects prematurely

    console.log('Room created locally:', newRoomCode);
    console.log('Current view set to:', 'game');
    console.log('Firebase auth status:', firebaseAuth);

    // Try Firebase sync (best effort, non-blocking)
    setTimeout(async () => {
      try {
        console.log('Syncing room to Firebase...');
    const gameRef = ref(database, `games/${newRoomCode}`);
        await set(gameRef, newGameState);
        console.log('✅ Room synced to Firebase:', newRoomCode);
      } catch (error) {
        console.log('⚠️ Firebase sync failed, using local only:', error);
      }
    }, 100); // Small delay to ensure local state is set first
    
    console.log('=== CREATE ROOM COMPLETE ===');
  };

  const joinRoom = async () => {
    if (!username.trim() || !roomCode.trim()) {
      alert('Please enter both username and room code');
      return;
    }

    // Try Firebase first (atomic join) - don't require auth
    try {
      console.log('Looking for Firebase room:', roomCode);
      const roomRef = ref(database, `games/${roomCode}`);
      const snapshot = await get(roomRef);
      
      if (!snapshot.exists()) {
        alert(`Room "${roomCode}" not found`);
      return;
    }
    
      const firebaseRoom = snapshot.val();
      
      // ✅ ATOMIC JOIN: Write only the joining player (no room overwrite)
      const playerRef = ref(database, `games/${roomCode}/players/${userId}`);
      await set(playerRef, {
        id: userId,
        username: username.trim(),
        cash: 0, // Start with $0
        position: 0,
        isHost: false,
        lastSeen: Date.now(),
        totalPoints: 0,
        currentRoundPoints: 0
      });

      // Optional: presence clean-up so leaving tab removes you
      try {
        const { onDisconnect } = await import('firebase/database');
        onDisconnect(playerRef).remove();
      } catch (error) {
        console.log('Presence cleanup setup failed:', error);
      }
      
      // Local UI update (merge with existing room)
      const updatedRoom = {
        ...firebaseRoom,
        players: {
          ...(firebaseRoom.players || {}),
          [userId]: {
            id: userId,
            username: username.trim(),
            cash: 0, // Start with $0
            position: 0,
            isHost: false,
            lastSeen: Date.now(),
            totalPoints: 0,
            currentRoundPoints: 0
          }
        },
        // Ensure orderBook is properly initialized
        orderBook: firebaseRoom.orderBook || { bids: {}, asks: {} }
      };
      
      
      setGameState(updatedRoom);
      setCurrentView('game');
      setIsHost(false);
      isHostRef.current = false; // Update ref - non-host
      console.log('✅ Joined Firebase room atomically:', roomCode);
      return;
    } catch (error) {
      console.log('Firebase join failed, trying local:', error);
    }

    // Fallback to local storage
    console.log('Trying local room:', roomCode);
    const activeRooms = JSON.parse(localStorage.getItem('activeRooms') || '{}');
    const existingRoom = activeRooms[roomCode];
    
    if (existingRoom) {
      // Join existing local room
      const updatedRoom = {
        ...existingRoom,
        players: {
          ...existingRoom.players,
        [userId]: {
          id: userId,
          username: username,
          cash: 0, // Start with 0 dollars
          position: 0,
          isHost: false,
          lastSeen: Date.now(),
          totalPoints: 0,
          currentRoundPoints: 0
        }
        }
      };
      
      setGameState(updatedRoom);
      setCurrentView('game');
      console.log('✅ Joined local room:', roomCode);
    } else {
      alert(`Room "${roomCode}" not found. Make sure Firebase rules allow public access or check the room code.`);
    }
  };

  const startGame = () => {
    if (!gameState) return;
    
    if (gameState.players[userId]?.isHost) {
    const randomQuestionData = mockFermiQuestions[Math.floor(Math.random() * mockFermiQuestions.length)];
    const realAssetValue = randomQuestionData.answer; // Use the actual answer as the true value
    const gameStartTime = Date.now();
    
      const updatedState: GameState = {
        ...gameState,
        gameState: 'active' as const,
      currentQuestion: { question: randomQuestionData.question },
      timeRemaining: 60 * 1000, // Changed to 60 seconds
        orderBook: { bids: {}, asks: {} }, // Start with empty order book
        players: gameState.players, // Keep existing players only
        realAssetValue: realAssetValue, // Set the true asset value (hidden during game)
        gameStartTime: gameStartTime // Set the game start time for accurate timing
      };
      
      // Sync to Firebase IMMEDIATELY (host and non-host will both receive the update)
      if (roomCode) {
        (async () => {
          try {
            const gameRef = ref(database, `games/${roomCode}`);
            await set(gameRef, updatedState);
            console.log('✅ Game start synced to Firebase');
          } catch (error) {
            console.log('⚠️ Firebase sync failed:', error);
          }
        })();
      }
      
    }
  };

  const endGame = async () => {
    // DEFENSIVE: Only end if game is currently active (prevent race conditions)
    if (!gameState || !gameState.players[userId]?.isHost || gameState.gameState !== 'active') {
      console.log('⚠️ endGame() called but game is not active:', {
        hasGameState: !!gameState,
        isHost: gameState?.players[userId]?.isHost,
        currentState: gameState?.gameState,
        round: gameState?.currentRound
      });
      return;
    }
    
    console.log('=== END GAME (Round Finished) ===');
    console.log('Current round:', gameState.currentRound);
    console.log('Players before calculation:', gameState.players);
    
    // Calculate round results and market price before ending
    const roundResults = calculateRoundResults(gameState);
    
    console.log('Round results calculated:', roundResults.roundResults);
    console.log('Players after calculation:', roundResults.updatedPlayers);
    
    const finishedState = { 
      ...gameState, 
      gameState: 'finished' as const,
      marketPrice: roundResults.marketPrice,
      players: roundResults.updatedPlayers // Players now have updated totalPoints
    };
    
    // Sync to Firebase IMMEDIATELY (host and non-host will both receive the update)
    if (roomCode) {
      (async () => {
        try {
          const gameRef = ref(database, `games/${roomCode}`);
          await set(gameRef, finishedState);
          console.log('✅ Game ended and synced to Firebase');
          
          // Verification read
          const snapshot = await get(gameRef);
          console.log('🔍 Verification: Firebase state after endGame:', {
            state: snapshot.val()?.gameState,
            round: snapshot.val()?.currentRound
          });
        } catch (error) {
          console.log('⚠️ Firebase sync failed:', error);
        }
      })();
    }
  };

  const endGameEarly = async () => {
    if (!gameState || !gameState.players[userId]?.isHost) return;
    
    if (!window.confirm('Are you sure you want to end the game early for all players?')) {
      return;
    }
    
    // Calculate round results and market price before ending
    const roundResults = calculateRoundResults(gameState);
    
    const endedState = { 
      ...gameState, 
      gameState: 'tournament_finished' as const,
      marketPrice: roundResults.marketPrice,
      players: roundResults.updatedPlayers,
      timeRemaining: 0
    };
    
      // Sync to Firebase IMMEDIATELY (host and non-host will both receive the update)
      if (roomCode) {
        (async () => {
          try {
            const gameRef = ref(database, `games/${roomCode}`);
            await set(gameRef, endedState);
            console.log('✅ Game ended early and synced to Firebase');
          } catch (error) {
            console.log('⚠️ Firebase sync failed:', error);
          }
        })();
      }
  };

  // Calculate round results and assign points
  const calculateRoundResults = (gameState: GameState) => {
    console.log('💰 === CALCULATING ROUND RESULTS ===');
    const players = Object.values(gameState.players);
    console.log('Players:', players.map(p => ({ name: p.username, cash: p.cash, position: p.position, totalPoints: p.totalPoints })));
    
    // Calculate total cash value for each player
    // This includes: cash + (position × current market price)
    // We'll use the average of all bid/ask prices as the market price
    const allPrices: number[] = [];
    
    // Collect all bid prices
    Object.values(gameState.orderBook.bids).forEach(order => {
      allPrices.push(order.price);
    });
    
    // Collect all ask prices
    Object.values(gameState.orderBook.asks).forEach(order => {
      allPrices.push(order.price);
    });
    
    // Calculate average market price (or use true value if no orders)
    const marketPrice = allPrices.length > 0 
      ? allPrices.reduce((sum, price) => sum + price, 0) / allPrices.length
      : (gameState.realAssetValue || 0);
    
    console.log('📊 Market price:', marketPrice, '(from', allPrices.length, 'orders)');
    
    const playerCashValues = players.map(player => {
      const totalCashValue = player.cash + (player.position * marketPrice);
      console.log(`💵 ${player.username}: cash=${player.cash}, position=${player.position}, total=${totalCashValue}`);
      return {
        playerId: player.id,
        username: player.username,
        totalCashValue: totalCashValue,
        cash: player.cash,
        position: player.position,
        marketPrice: marketPrice
      };
    });

    // Sort by total cash value (highest to lowest)
    playerCashValues.sort((a, b) => b.totalCashValue - a.totalCashValue);
    console.log('🏆 Sorted rankings:', playerCashValues.map((p, i) => `${i+1}. ${p.username} ($${p.totalCashValue})`));

    // Assign points (1st place = 1 point, 2nd place = 2 points, etc.)
    const roundResults = playerCashValues.map((player, index) => ({
      playerId: player.playerId,
      points: index + 1,
      totalCashValue: player.totalCashValue,
      cash: player.cash,
      position: player.position,
      marketPrice: player.marketPrice
    }));

    // Update player total points
    const updatedPlayers = { ...gameState.players };
    roundResults.forEach(result => {
      const player = updatedPlayers[result.playerId];
      if (player) {
        const oldTotal = player.totalPoints || 0;
        const newTotal = oldTotal + result.points;
        updatedPlayers[result.playerId] = {
          ...player,
          currentRoundPoints: result.points,
          totalPoints: newTotal
        };
        console.log(`🎯 ${player.username}: +${result.points} points (${oldTotal} → ${newTotal})`);
      }
    });

    console.log('✅ Final updated players:', Object.values(updatedPlayers).map(p => ({ name: p.username, roundPts: p.currentRoundPoints, totalPts: p.totalPoints })));
    
    return {
      roundResults,
      updatedPlayers,
      playerCashValues,
      marketPrice
    };
  };

  // Start next round or end tournament
  const startNextRound = async () => {
    if (!gameState) return;
    
    if (!gameState.players[userId]?.isHost) {
      console.log('Only host can start next round');
      return;
    }

    const currentRound = gameState.currentRound || 1;
    const totalRounds = gameState.totalRounds || 5;

    console.log('=== START NEXT ROUND ===');
    console.log('Current round:', currentRound, 'Total rounds:', totalRounds);

    if (currentRound >= totalRounds) {
      // Tournament finished
      console.log('Tournament finished - ending tournament');
      const finalState = {
        ...gameState,
        gameState: 'tournament_finished' as const
      };
      
      setGameState(finalState);
      
      // Sync to Firebase
      if (roomCode) {
        try {
          const gameRef = ref(database, `games/${roomCode}`);
          await set(gameRef, finalState);
          console.log('✅ Tournament finished and synced to Firebase');
        } catch (error) {
          console.log('⚠️ Firebase sync failed:', error);
        }
      }
    } else {
      // Go back to waiting state (just like before Round 1)
      // Host will manually start the next round with "Start Round X" button
      const nextRound = currentRound + 1;
      console.log('Preparing for round:', nextRound, '- going to WAITING state');
      
      // Reset cash and position for all players, but PRESERVE totalPoints
      const resetPlayers = Object.keys(gameState.players).reduce((acc, playerId) => {
        const player = gameState.players[playerId];
        acc[playerId] = {
          ...player,
          cash: 0, // Reset bankroll to zero
          position: 0, // Reset position to zero
          currentRoundPoints: 0 // Reset current round points
          // totalPoints is preserved from endGame()
        };
        return acc;
      }, {} as Record<string, Player>);

      // Back to waiting state - just like before Round 1!
      const newGameState = {
        ...gameState,
        gameState: 'waiting' as const, // WAITING state, not active
        currentRound: nextRound,
        players: resetPlayers,
        orderBook: { bids: {}, asks: {} },
        currentQuestion: { question: "" },
        timeRemaining: 0,
        realAssetValue: null,
        marketPrice: null,
        gameStartTime: null
        // roundResults is preserved
      };
      
      console.log('🔄🔄🔄 HOST: Transitioning to WAITING for round', nextRound);
      console.log('Players with preserved total points:', resetPlayers);
      console.log('New game state being set:', {
        state: newGameState.gameState,
        round: newGameState.currentRound,
        timeRemaining: newGameState.timeRemaining
      });
      
      // Sync to Firebase IMMEDIATELY (host and non-host will both receive the update)
      if (roomCode) {
        (async () => {
          try {
            const gameRef = ref(database, `games/${roomCode}`);
            await set(gameRef, newGameState);
            console.log('✅✅✅ Round', nextRound, 'WAITING state synced to Firebase');
            
            // Verification read
            const snapshot = await get(gameRef);
            console.log('🔍 Verification: Firebase state after startNextRound:', {
              state: snapshot.val()?.gameState,
              round: snapshot.val()?.currentRound,
              timeRemaining: snapshot.val()?.timeRemaining
            });
          } catch (error) {
            console.error('❌ Firebase sync FAILED:', error);
          }
        })();
      }
    }
  };

  const matchOrders = async (orderBook: GameState['orderBook'], newOrder: Order, isBid: boolean, roomCode: string) => {
    const trades: Trade[] = [];
    let remainingQuantity = newOrder.quantity;
    const otherSide = isBid ? orderBook.asks : orderBook.bids;
    const matchingPrice = isBid ? (order: Order) => order.price <= newOrder.price : (order: Order) => order.price >= newOrder.price;
    
    const sortedOrders = Object.values(otherSide)
      .filter(matchingPrice)
      .sort((a, b) => isBid ? b.price - a.price : a.price - b.price);
    
    for (const existingOrder of sortedOrders) {
      if (remainingQuantity <= 0) break;
      
      const tradeQuantity = Math.min(remainingQuantity, existingOrder.quantity);
      const tradePrice = existingOrder.price;
      
      trades.push({
          price: tradePrice,
          quantity: tradeQuantity,
        buyer: isBid ? newOrder.userId : existingOrder.userId,
        seller: isBid ? existingOrder.userId : newOrder.userId,
          timestamp: Date.now()
        });

      // Update player positions
      const buyerId = isBid ? newOrder.userId : existingOrder.userId;
      const sellerId = isBid ? existingOrder.userId : newOrder.userId;
      
      // Update game state for trades
      setGameState(prev => {
        if (!prev) return prev;
        const updatedPlayers = { ...prev.players };
        if (updatedPlayers[buyerId] && updatedPlayers[sellerId]) {
          updatedPlayers[buyerId].cash -= tradePrice * tradeQuantity;
          updatedPlayers[buyerId].position += tradeQuantity;
          updatedPlayers[sellerId].cash += tradePrice * tradeQuantity;
          updatedPlayers[sellerId].position -= tradeQuantity;
        }
        return { ...prev, players: updatedPlayers };
      });

      // Player position updates will be synced by placeOrder after matchOrders completes
      
      remainingQuantity -= tradeQuantity;
      existingOrder.quantity -= tradeQuantity;
      
      if (existingOrder.quantity <= 0) {
        delete otherSide[existingOrder.orderId];
      }
      // Order book changes will be synced by placeOrder after matchOrders completes
    }
    
    return { trades, remainingQuantity };
  };

  const placeOrder = async (price: number, quantity: number, isBid: boolean) => {
    if (!gameState) {
      console.error('No game state available');
      return;
    }

    const currentPlayer = gameState.players[userId];
    if (!currentPlayer) {
      console.error('Current player not found');
      return;
    }

    // Allow negative cash - players can go into debt
    // const totalCost = isBid ? price * quantity : 0;
    // if (isBid && currentPlayer.cash < totalCost) {
    //   alert('Not enough cash');
    //     return;
    // }

    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const newOrder: Order = {
      price,
      quantity,
      userId,
      timestamp: Date.now(),
      orderId
    };
    
    // Create a copy of the order book for matching to avoid modifying the original
    const orderBookCopy = {
      bids: { ...gameState.orderBook.bids },
      asks: { ...gameState.orderBook.asks }
    };
    const { trades, remainingQuantity } = await matchOrders(orderBookCopy, newOrder, isBid, roomCode || '');
    
    if (trades.length > 0) {
      setRecentTrades(prev => [...prev, ...trades].slice(-20).reverse());
    }
    
    let newGameState: GameState;
    
    if (remainingQuantity > 0) {
      newOrder.quantity = remainingQuantity;
      // Add the remaining order to the modified order book copy
      const bookSide = isBid ? orderBookCopy.bids : orderBookCopy.asks;
      bookSide[orderId] = newOrder;
    }
    
    // Use the modified order book copy (which includes any matching changes)
    newGameState = { 
      ...gameState,
      orderBook: orderBookCopy
    };
    
    setGameState(newGameState);
    
    // Sync to Firebase (entire updated order book and all player positions)
    if (roomCode) {
      try {
        // Sync the entire updated order book to Firebase
        const orderBookRef = ref(database, `games/${roomCode}/orderBook`);
        await set(orderBookRef, newGameState.orderBook);
        
        // Sync all player positions (in case trades affected multiple players)
        const playersRef = ref(database, `games/${roomCode}/players`);
        await set(playersRef, newGameState.players);
        
        console.log('✅ Order book and all player data synced to Firebase');
      } catch (error) {
        console.log('⚠️ Firebase sync failed:', error);
      }
    }
  };

  const getCurrentPlayer = () => {
    if (!gameState?.players) return null;
    return gameState.players[userId] || null;
  };

  if (error) {
    return (
      <div className="container">
        <h1>Fermi Market Game</h1>
        <div className="loading">
          <p>❌ Render Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
          <button onClick={() => {
            setCurrentView('lobby');
            setGameState(null);
            setError(null);
          }}>Restart Game</button>
        </div>
      </div>
    );
  }

  if (currentView === 'lobby') {
    return (
      <div className="container">
        <h1>Fermi Market Game</h1>
        
        <div className="lobby">
          <div className="input-group">
            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          
          <button onClick={createRoom} className="primary-button">
                Create Room
              </button>
          
          <div className="divider">OR JOIN A ROOM</div>
          
          <div className="input-group">
                <input
                  type="text"
              placeholder="Room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                />
          </div>
          
          <button onClick={joinRoom} className="secondary-button">
                  Join Room
                </button>
          
              </div>
            </div>
    );
  }

  const currentPlayer = getCurrentPlayer();
  
  if (!gameState) {
    return (
      <div className="container">
        <h1>Fermi Market Game</h1>
        <div className="loading">
          <p>❌ No game state available</p>
          <button onClick={() => {
            setCurrentView('lobby');
            setIsHost(false);
          }}>Back to Lobby</button>
        </div>
      </div>
    );
  }

  // Get top 5 players by total points (lower is better)
  const topPlayers = Object.values(gameState.players)
    .sort((a, b) => (a.totalPoints || 0) - (b.totalPoints || 0))
    .slice(0, 5);

  return (
    <div className="container">
      <div className="header">
        <h1>Room: {gameState.roomCode}</h1>
        <div className="tournament-info">
          <h2>Round {gameState.currentRound || 1} of {gameState.totalRounds || 5}</h2>
          <p>Tournament Points: Lower is better (1st=1pt, 2nd=2pt, etc.)</p>
          <p>Debug: Game State = '{gameState.gameState}', Round = {gameState.currentRound || 1}</p>
        </div>
        <button onClick={() => {
          setCurrentView('lobby');
          setIsHost(false);
        }} className="back-button">
          Back to Lobby
        </button>
      </div>

      {/* Live Leaderboard */}
      <div className="live-leaderboard">
        <h3>🏆 Leaderboard (Top 5)</h3>
        <div className="leaderboard-list">
          {topPlayers.map((player, index) => (
            <div key={player.id} className={`leaderboard-item ${player.id === userId ? 'current-user' : ''}`}>
              <span className="leaderboard-rank">#{index + 1}</span>
              <span className="leaderboard-name">{player.username}</span>
              <span className="leaderboard-points">{player.totalPoints || 0} pts</span>
            </div>
          ))}
        </div>
      </div>

      {currentPlayer ? (
        <div className="player-info">
          <h2>{currentPlayer.username}</h2>
          <div className="account-details">
            <p>💰 Cash: ${currentPlayer.cash.toLocaleString()}</p>
            <p>📈 Position: {currentPlayer.position} shares</p>
            {gameState.gameState === 'finished' && gameState.marketPrice ? (
              <div>
                <p>💰 Total Cash Value: ${(currentPlayer.cash + currentPlayer.position * gameState.marketPrice).toLocaleString()}</p>
                <p>🔍 True Asset Value: ${gameState.realAssetValue?.toFixed(2) || '???'}</p>
                <p>📊 Market Price Used: ${gameState.marketPrice.toFixed(2)}</p>
              </div>
            ) : (
              <p>💰 Total Cash Value: ??? (revealed at round end)</p>
            )}
            <p>🏆 Round Points: {currentPlayer.currentRoundPoints || 0}</p>
            <p>📊 Total Points: {currentPlayer.totalPoints || 0}</p>
          </div>
        </div>
      ) : (
        <div className="player-info">
          <h2>Debug Info</h2>
          <div className="account-details">
            <p>🔍 Looking for userId: {userId}</p>
            <p>🔍 Game state: {gameState ? 'Available' : 'Missing'}</p>
            <p>🔍 Players: {gameState?.players ? Object.keys(gameState.players).join(', ') : 'None'}</p>
          </div>
        </div>
      )}

      {gameState.gameState === 'waiting' && gameState.players[userId]?.isHost && (
        <div className="host-controls">
          <p>Debug: Game state is 'waiting', Round {gameState.currentRound || 1}</p>
          {gameState.currentRound === 1 && (
            <div className="input-group">
              <label htmlFor="numRounds">Number of Rounds:</label>
              <input 
                type="number" 
                id="numRounds"
                min="1" 
                max="20"
                value={gameState.totalRounds || 5}
                onChange={async (e) => {
                  const newTotal = Math.max(1, Math.min(20, parseInt(e.target.value) || 5));
                  setGameState(prev => prev ? { ...prev, totalRounds: newTotal } : null);
                  // Sync to Firebase
                  if (roomCode) {
                    try {
                      const totalRoundsRef = ref(database, `games/${roomCode}/totalRounds`);
                      await set(totalRoundsRef, newTotal);
                    } catch (error) {
                      console.log('⚠️ Firebase sync failed:', error);
                    }
                  }
                }}
              />
            </div>
          )}
          <button onClick={startGame} className="primary-button">
              Start Round {gameState.currentRound || 1}
          </button>
        </div>
      )}

      {gameState.gameState === 'waiting' && !gameState.players[userId]?.isHost && (
        <div className="waiting-room">
          <p>Waiting for host to start Round {gameState.currentRound || 1} of {gameState.totalRounds || 5}...</p>
          <p>Debug: Game state is 'waiting'</p>
        </div>
      )}

      {gameState.gameState === 'finished' && !gameState.players[userId]?.isHost && (
        <div className="round-finished">
          <h3>Round {gameState.currentRound || 1} Finished!</h3>
          <div className="answer-reveal">
            <h4>🎯 The Answer Was:</h4>
            <p className="answer-text">{gameState.currentQuestion?.question}</p>
            <p className="answer-value">Answer: {gameState.realAssetValue?.toLocaleString()}</p>
            <p className="market-price">Market Price Used: ${gameState.marketPrice?.toLocaleString()}</p>
          </div>
          <p>Waiting for host to start next round...</p>
        </div>
      )}

      {gameState.gameState === 'finished' && gameState.players[userId]?.isHost && (
        <div className="round-finished">
          <h3>Round {gameState.currentRound || 1} Finished!</h3>
          <div className="answer-reveal">
            <h4>🎯 The Answer Was:</h4>
            <p className="answer-text">{gameState.currentQuestion?.question}</p>
            <p className="answer-value">Answer: {gameState.realAssetValue?.toLocaleString()}</p>
            <p className="market-price">Market Price Used: ${gameState.marketPrice?.toLocaleString()}</p>
          </div>
          <p>Round results calculated. Click to start next round or end tournament.</p>
          <button onClick={startNextRound} className="primary-button">
            {gameState.currentRound && gameState.currentRound >= (gameState.totalRounds || 5) ? 
              'End Tournament' : 
              'Start Round ' + ((gameState.currentRound || 1) + 1)
            }
          </button>
        </div>
      )}

      {gameState.gameState === 'tournament_finished' && (
        <div className="tournament-finished">
          <h2>🏆 Tournament Complete! 🏆</h2>
          <h3>Final Results (Lower points = Better)</h3>
          <div className="final-leaderboard">
            {Object.values(gameState.players)
              .sort((a, b) => (a.totalPoints || 0) - (b.totalPoints || 0))
              .map((player, index) => (
                <div key={player.id} className="final-player">
                  <span className="rank">#{index + 1}</span>
                  <span className="name">{player.username}</span>
                  <span className="points">{player.totalPoints || 0} points</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {gameState.gameState === 'active' && (
        <div className="game-info">
          <h3>{gameState.currentQuestion?.question}</h3>
          <p>Time Remaining: {Math.floor((gameState.timeRemaining || 0) / 1000)}s</p>
          
          {gameState.players[userId]?.isHost && (
            <div style={{ marginTop: '10px' }}>
              <button onClick={endGame} className="secondary-button" style={{ marginRight: '10px' }}>
                End Round
              </button>
              <button onClick={endGameEarly} className="secondary-button" style={{ backgroundColor: '#dc3545', borderColor: '#dc3545' }}>
                End Entire Game
              </button>
            </div>
          )}
            </div>
          )}

      {gameState.gameState === 'finished' && (
        <div className="game-complete">
          <h2>Game Complete!</h2>
          <button onClick={() => setCurrentView('lobby')} className="primary-button">
            Back to Lobby
          </button>
        </div>
      )}

      {(gameState.gameState === 'active' || gameState.gameState === 'waiting') && (
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <div style={{ flex: '1' }}>
            <div className="order-form">
              <h3>Place Order</h3>
              <input type="number" placeholder="Price" id="price" />
              <input type="number" placeholder="Quantity" id="quantity" />
              <div className="button-group">
                <button onClick={() => {
                  const price = parseFloat((document.getElementById('price') as HTMLInputElement).value);
                  const quantity = parseInt((document.getElementById('quantity') as HTMLInputElement).value);
                  if (price && quantity) placeOrder(price, quantity, true);
                }}>Buy</button>
                <button onClick={() => {
                  const price = parseFloat((document.getElementById('price') as HTMLInputElement).value);
                  const quantity = parseInt((document.getElementById('quantity') as HTMLInputElement).value);
                  if (price && quantity) placeOrder(price, quantity, false);
                }}>Sell</button>
              </div>
            </div>

            <div className="recent-trades">
              <h3>Recent Trades</h3>
              {recentTrades.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Price</th>
                      <th>Quantity</th>
                      <th>Trade</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                {recentTrades.map((trade, index) => (
                      <tr key={index}>
                        <td>${trade.price}</td>
                        <td>{trade.quantity}</td>
                        <td>{trade.buyer.slice(0, 8)} ↔ {trade.seller.slice(0, 8)}</td>
                        <td>{new Date(trade.timestamp).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No trades yet</p>
              )}
              </div>
            </div>

          <div style={{ flex: '1' }}>
            <div className="order-book">
            <h3>Order Book</h3>
            <div className="book-section">
              <h4>Bids</h4>
              {gameState.orderBook && Object.values(gameState.orderBook.bids || {}).length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Price</th>
                      <th>Quantity</th>
                      <th>User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(gameState.orderBook.bids || {})
                      .sort((a, b) => b.price - a.price)
                      .map((order, index) => (
                        <tr key={order.orderId}>
                          <td>${order.price}</td>
                          <td>{order.quantity}</td>
                          <td>{order.userId.slice(0, 8)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
                    </div>
            <div className="book-section">
              <h4>Asks</h4>
              {gameState.orderBook && Object.values(gameState.orderBook.asks || {}).length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Price</th>
                      <th>Quantity</th>
                      <th>User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(gameState.orderBook.asks || {})
                      .sort((a, b) => a.price - b.price)
                      .map((order, index) => (
                        <tr key={order.orderId}>
                          <td>${order.price}</td>
                          <td>{order.quantity}</td>
                          <td>{order.userId.slice(0, 8)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="players">
        <h3>Players ({Object.keys(gameState.players).length})</h3>
        <div className="player-header">
          <span>Player</span>
          <span>Cash</span>
          <span>Shares</span>
          <span>{gameState.gameState === 'finished' && gameState.marketPrice ? 'Total Cash Value' : 'Total Cash Value'}</span>
          <span>Round Points</span>
          <span>Total Points</span>
            </div>
        {Object.values(gameState.players).map(player => (
          <div key={player.id} className={`player ${player.id === userId ? 'current-player' : ''} ${player.isHost ? 'host' : ''}`}>
            <span>{player.username}</span>
            <span>${player.cash.toLocaleString()}</span>
            <span>{player.position} shares</span>
            <span>
              {gameState.gameState === 'finished' && gameState.marketPrice 
                ? `$${(player.cash + player.position * gameState.marketPrice).toLocaleString()}`
                : '???'
              }
            </span>
            <span>{player.currentRoundPoints || 0}</span>
            <span>{player.totalPoints || 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
