# STRICT Adventure ⚔️

A browser-based top-down adventure game inspired by Realm of the Mad God, Undertale, and Inscryption with exploration, combat, NPCs, and multiplayer support.

## Features

- **Top-down 2D Exploration**: Realm of the Mad God-style perspective
- **Multiple Areas**: Dark Forest and Ancient Dungeon with unique layouts
- **Ability System**:
  - ⚔️ Sword Strike - Melee attack
  - 🛡️ Shield Block - Temporary defense
  - 💫 Dash - Quick dodge movement
  - 🔥 Fireball - Ranged magic attack
- **Single Player**: Explore and battle against enemies
- **Multiplayer**: Real-time co-op with WebSocket support
- **Leaderboard**: Track your scores and progress
- **Responsive Controls**: WASD or Arrow keys + Space for abilities

## Tech Stack

- **Frontend**: Vanilla JavaScript with HTML5 Canvas
- **Backend**: Node.js + Express
- **Real-time**: WebSocket (ws library)
- **Database**: PostgreSQL (Neon.tech)
- **Hosting**: Render.com

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL (optional, for leaderboard features)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/redbic/STRICT.git
cd STRICT
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and set your database URL (optional):
```
DATABASE_URL=postgresql://user:password@host/dbname
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to `http://localhost:3000`

## Deployment

### Render.com Setup

1. **Create a Web Service**:
   - Connect your GitHub repository
   - Select "Web Service"
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`

2. **Configure Environment Variables**:
   - `NODE_ENV`: production
   - `DATABASE_URL`: Your Neon.tech PostgreSQL connection string

### Neon.tech Database Setup

1. Create a free account at [Neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string
4. Add it as `DATABASE_URL` environment variable in Render.com
5. The database tables will be created automatically on first run

## How to Play

### Controls

- **Arrow Keys** or **WASD**: Movement
- **Space**: Use ability
- **ESC**: Pause

### Game Modes

**Single Player**: Explore areas and fight enemies

**Multiplayer**: Co-op with friends in real-time

### Tips

- Explore areas to find items
- Use abilities strategically
- Defeat enemies to earn points
- Avoid enemy attacks
- Use the shield when overwhelmed
- Discover secrets in each area

## Project Structure

```
STRICT/
├── public/
│   ├── css/
│   │   └── style.css          # Game styling
│   ├── js/
│   │   ├── game.js            # Main game engine
│   │   ├── player.js          # Player/character mechanics
│   │   ├── track.js           # World/area definitions
│   │   ├── items.js           # Ability system
│   │   ├── network.js         # WebSocket client
│   │   └── main.js            # UI and app logic
│   └── index.html             # Main HTML
├── server.js                  # Express + WebSocket server
├── package.json               # Dependencies
├── render.yaml                # Render.com config
└── README.md                  # This file
```

## API Endpoints

- `GET /`: Serve the game
- `GET /api/leaderboard`: Get top 10 players
- `POST /api/player`: Register/update player
- `POST /api/game-result`: Submit game results
- `WebSocket`: Real-time multiplayer communication

## Database Schema

### Players Table
- `id`: Serial primary key
- `username`: Unique player name
- `total_games`: Total games completed
- `high_score`: Cumulative high score across all games
- `best_score`: Best score in a single game session
- `created_at`: Timestamp

### Game Results Table
- `id`: Serial primary key
- `player_id`: Foreign key to players
- `area_name`: Name of the area
- `score`: Points earned
- `level_reached`: Furthest level reached
- `created_at`: Timestamp

## Future Enhancements

- Additional areas
- More abilities
- Boss battles
- Card-based encounters (Inscryption style)
- Story/dialogue system (Undertale style)
- Sound effects and music
- Mobile touch controls
- Ability balance adjustments

## License

MIT

## Credits

Inspired by Realm of the Mad God, Undertale, and Inscryption.
