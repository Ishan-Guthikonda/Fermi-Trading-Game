#!/bin/bash

echo "🚀 Starting Fermi Market Game..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🎮 Starting the game server and client..."
echo "   Server will run on: http://localhost:5000"
echo "   Client will run on: http://localhost:3000"
echo ""
echo "   Open your browser and go to http://localhost:3000 to play!"
echo ""

# Start both server and client
npm run dev

