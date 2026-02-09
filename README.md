# STRICT Racing 🏁

A browser-based party racing game inspired by SNES Super Mario Kart with top-down 2D perspective, power-ups, multiple tracks, and multiplayer support.

## Features

- **Top-down 2D Racing**: Classic SNES Mario Kart-style perspective
- **Multiple Tracks**: Speed Circuit and Forest Path with unique layouts
- **Power-up System**: 
  - 🚀 Speed Boost - Temporary speed increase
  - 🐚 Shell - Stun nearest opponent
  - ⭐ Star - Invincibility
  - 🍌 Banana - Place hazard on track
- **Single Player**: Race against AI opponents
- **Multiplayer**: Real-time racing with WebSocket support
- **Leaderboard**: Track your best times and wins
- **Responsive Controls**: WASD or Arrow keys + Space for items

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

- **Arrow Keys** or **WASD**: Steer and accelerate
- **Space**: Use current power-up
- **ESC**: Pause (in development)

### Game Modes

**Single Player**: Race against 3 AI opponents on your chosen track

**Multiplayer**: Create or join a room and race with friends in real-time

### Tips

- Collect item boxes (?) to get power-ups
- Use power-ups strategically to gain advantage
- Complete 3 laps to finish the race
- Hit checkpoints to track your progress
- Avoid banana hazards and opponent shells
- Use the star for invincibility when in tight situations

## Project Structure

```
STRICT/
├── public/
│   ├── css/
│   │   └── style.css          # Game styling
│   ├── js/
│   │   ├── game.js            # Main game engine
│   │   ├── player.js          # Player/kart mechanics
│   │   ├── track.js           # Track definitions
│   │   ├── items.js           # Power-up system
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
- `POST /api/race-result`: Submit race results
- `WebSocket`: Real-time multiplayer communication

## Database Schema

### Players Table
- `id`: Serial primary key
- `username`: Unique player name
- `total_races`: Total races completed
- `wins`: Number of first place finishes
- `best_time`: Best lap time in milliseconds
- `created_at`: Timestamp

### Race Results Table
- `id`: Serial primary key
- `player_id`: Foreign key to players
- `track_name`: Name of the track
- `race_time`: Time in milliseconds
- `position`: Finish position
- `created_at`: Timestamp

## Future Enhancements

- Additional tracks
- More power-ups
- Ghost racing (race against your best time)
- Tournament mode
- Custom kart selection
- Sound effects and music
- Mobile touch controls
- Power-up balance adjustments

## License

MIT

## Credits

Inspired by SNES Super Mario Kart and modern browser-based racing games.
