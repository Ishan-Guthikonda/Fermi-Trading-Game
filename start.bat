@echo off
echo 🚀 Starting Fermi Market Game...
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js first.
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm is not installed. Please install npm first.
    pause
    exit /b 1
)

echo 📦 Installing dependencies...
npm install

echo.
echo 🎮 Starting the game server and client...
echo    Server will run on: http://localhost:5000
echo    Client will run on: http://localhost:3000
echo.
echo    Open your browser and go to http://localhost:3000 to play!
echo.

REM Start both server and client
npm run dev

pause

