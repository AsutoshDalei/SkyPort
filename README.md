# ✈ SkyPort — Multiplayer Dogfight Arena

A 3D flying sandbox with multiplayer dogfight mode built with React, Three.js, and WebSockets.

## Quick Start

```bash
docker compose up --build
```

- **Game**: http://localhost:5173
- **WS Server**: ws://localhost:3001

## Game Modes

### Solo Flight
Click **SOLO FLIGHT** on the menu. Free-fly around the terrain, land at airports/airstrips. No networking.

### Dogfight (Multiplayer)
1. Start the server: `docker compose up --build`
2. Open http://localhost:5173 in **multiple tabs/browsers**
3. Enter a callsign and click **JOIN DOGFIGHT**
4. Players are auto-assigned to Team A (Airport) or Team B (Airstrip)
5. Max 8 players per server

## Controls

| Key | Action |
|-----|--------|
| `W` | Pitch up (nose up) |
| `S` | Pitch down (nose down) |
| `A` | Roll left |
| `D` | Roll right |
| `↑` | Throttle up |
| `↓` | Throttle down / brake (on ground) |
| `Space` | Shoot (dogfight mode) |

## Rules

- **Land only on runways** — airport or village airstrip
- Landing elsewhere or hitting buildings = **crash** → respawn
- HUD shows **RWY** when over a runway
- Projectiles are **visible tracers** — hits cause knockback + visual flash
- No health/death system yet — just visual hits

## World

- **Two cities** (main + eastern) with buildings, roads, and connecting highway
- **Airport** (Team A spawn) with full terminal, hangars, control tower
- **Airstrip** (Team B spawn) near eastern village
- **5 village clusters**, 700 trees, boundary mountains, lake, clouds
- **4400×4400** map with fog and sky dome

## Architecture

```
Skyport/
├─ server/
│   ├─ server.js          # WebSocket game server (ws)
│   ├─ package.json
│   └─ Dockerfile
├─ src/
│   ├─ components/
│   │   ├─ Plane.jsx       # Flight physics + network sync
│   │   ├─ Terrain.jsx     # World (InstancedMesh for performance)
│   │   ├─ CameraController.jsx
│   │   ├─ RemotePlanes.jsx # Other players with lerp interpolation
│   │   └─ Projectiles.jsx  # Bullet pool (InstancedMesh)
│   ├─ hooks/
│   │   └─ useNetwork.js   # WebSocket client (zero re-renders)
│   ├─ scenes/
│   │   ├─ MainScene.jsx   # Solo mode
│   │   └─ DogfightScene.jsx # Multiplayer mode
│   ├─ App.jsx             # Connection UI + mode switching
│   └─ index.css
├─ docker-compose.yml      # Both services
└─ Dockerfile              # Client (Vite dev server)
```

## Performance

- **InstancedMesh** for buildings, trees, clouds, villages (~8 draw calls vs ~3000+)
- **Spatial hash collision** grid (50-unit cells) — O(1) building collision
- **useRef-only physics** — no React state re-renders in the render loop
- **20Hz network sync** with exponential lerp interpolation

## Tech Stack

React 19 · Three.js r183 · React Three Fiber 9 · Drei 10 · Vite 6 · WebSocket (ws) · Docker