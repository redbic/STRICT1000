# STRICT Adventure ⚔️

A browser-based top-down adventure game inspired by Realm of the Mad God, Undertale, and Inscryption with exploration, combat, NPCs, and multiplayer support.

## Features

- **Top-down 2D Exploration**: Realm of the Mad God-style perspective
- **Shared Hub**: A central gathering space for players
- **Ability System**:
  - ⚔️ Sword Strike - Melee attack
  - 🛡️ Shield Block - Temporary defense
  - 💫 Dash - Quick dodge movement
  - 🔥 Fireball - Ranged magic attack
- **Single Player**: Explore and battle against enemies
- **Multiplayer**: Real-time co-op with WebSocket support
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
- PostgreSQL (optional, for player registration)

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

**Single Player**: Explore zones and fight enemies

**Multiplayer**: Co-op with friends in real-time

### Tips

- Explore zones to find items
- Use abilities strategically
- Avoid enemy attacks
- Use the shield when overwhelmed
- Discover secrets in each zone

## Project Structure

```
STRICT/
├── public/
│   ├── css/
│   │   └── style.css          # Game styling
│   ├── js/
│   │   ├── game.js            # Main game engine
│   │   ├── player.js          # Player/character mechanics
│   │   ├── track.js           # Zone definitions
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
- `POST /api/player`: Register/update player
- `WebSocket`: Real-time multiplayer communication

## Database Schema

### Players Table
- `id`: Serial primary key
- `username`: Unique player name
- `created_at`: Timestamp

## Future Enhancements

- Additional areas
- More abilities
- Boss battles
- Real-time strategic combat encounters inspired by Wii Play Tanks
- Story/dialogue system (Undertale style)
- Sound effects and music
- Mobile touch controls
- Ability balance adjustments

## Narrative & Design Direction (Current)

### Core Pillars

- **Uneasy intimacy**: The game should feel like it is watching or listening to the player.
- **Tactile strategy**: Board objects, movement, and interactions should feel physical and consequential.
- **Rule instability**: Players should gradually learn that the rules are not fixed.
- **Meta-layer mystery**: There is always a hidden game behind the visible one.

### Structure

- Follow a three-act, Inscryption-inspired structure:
  - **Act 1**: A contained ritual-like loop.
  - **Act 2**: A reframing where prior assumptions are challenged.
  - **Act 3**: Systemic collapse/recombination where story and mechanics converge.

### World Hook

- The central hub is a **hotel lobby**.
- Each room in the hotel is a self-contained ruleset/game variant.
- The host/curator role is unreliable and deceptive.

### Prototype Focus

- Build toward a first playable slice centered on:
  - Real-time strategic combat (instead of card combat)
  - Room-based ruleset variation
  - Early narrative manipulation from the narrator

### Narrative Reveal

- The player slowly realizes the narrator is intentionally preventing access to the hotel's presidential suite.

## License

MIT

## Credits

Inspired by Realm of the Mad God, Undertale, and Inscryption.
