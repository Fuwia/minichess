# MiniChess ♟️

MiniChess is a fast-paced, competitive 6x6 chess variant inspired by the "Minihouse" variant from chess.com. It combines the rules of traditional chess on a smaller board with "Crazyhouse" mechanics, meaning captured pieces can be dropped back onto the board as your own!

## 🌟 Features

- **Real-Time Multiplayer:** Play against other users online with live matchmaking via Socket.IO.
- **Game Modes:** 
  - **Standard MiniChess:** 6x6 Crazyhouse gameplay.
  - **Dice Mode:** Roll a dice each turn to determine which piece type you must move or drop.
- **Competitive Ranking:** ELO-based rating system, global leaderboards, and detailed match history.
- **Bot Integration:** Practice your skills against an integrated AI opponent.
- **Progression System:** Earn XP, level up your Battlepass, and unlock exclusive titles and rewards.
- **Shop & Customizations:** Spend earned coins on board themes, avatars, and username colors.
- **Social Features:** Add friends, track their online status, and create private rooms to play with them.
- **Admin Dashboard:** Manage users, reset stats, and monitor server activity.

## 🛠️ Technologies Used

- **Backend:** Node.js, Express.js
- **Real-time Communication:** Socket.IO
- **Database:** SQLite (via `sql.js` with local file persistence)
- **Authentication:** Session-based authentication with `bcryptjs` for password hashing
- **Frontend:** HTML5, CSS3, Vanilla JavaScript (No heavy frameworks)

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Fuwia/minichess.git
   cd minichess
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the server:**
   ```bash
   npm start
   ```
   *The server will start on `http://localhost:3000` by default.*

4. **Play:**
   Open your browser and navigate to `http://localhost:3000`. Create an account and start playing!

## 🎮 How to Play

- **Board Size:** The game is played on a 6x6 board.
- **Crazyhouse Rules:** When you capture an opponent's piece, it goes into your "pocket" (inventory). On your turn, instead of moving a piece on the board, you can drop a piece from your pocket onto any empty square.
- **Pawn Promotion:** Pawns promote when they reach the last rank (rank 6 for White, rank 1 for Black). 
- **No Castling:** Castling is not allowed in this 6x6 variant.
- **Winning:** Checkmate the opponent's king or win if the opponent runs out of time!

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](../../issues).

## 📝 License

This project is open-source and available under the MIT License.
