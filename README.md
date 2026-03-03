# SkyPort — Single-Player Flying Sandbox

A minimal 3D flying sandbox where you control a plane and soar over a low-poly landscape with cities, villages, mountains, airports, and airstrips.

Built with **React**, **Three.js**, **React Three Fiber**, and **Vite**, containerized with **Docker**.

![Preview](https://img.shields.io/badge/status-Phase%201-88c0d0?style=flat-square)

---

## Quick Start

```bash
# With Docker (recommended)
docker compose up --build
# → http://localhost:5173

# Without Docker
npm install
npm run dev
```

## Controls

| Key | Action |
|-----|--------|
| `W` | Pitch up (nose up) |
| `S` | Pitch down (nose down) |
| `A` | Roll left |
| `D` | Roll right |
| `↑` | Throttle up |
| `↓` | Throttle down / brake (on ground) |

## Rules

- **Land only on runways** — the airport runway or the village airstrip
- Landing anywhere else = **crash** → 2 second crash screen → respawn at airport
- Hitting a building = **crash** → respawn
- HUD shows **RWY** when you're over a runway
- You spawn at the airport runway facing the takeoff direction

## What's Inside

### Flight
- Arcade-style flight physics with gravity, lift, and stall
- Speed-based lift: full lift at 80 kts, sinks below that
- Stall below 30 kts — plane descends under gravity
- Landing: touch down on any flat surface, brake to stop
- Ground friction, air drag, smooth pitch/roll interpolation

### World
- **Perlin noise heightmap** — rolling hills, vertex-colored by altitude (grass → dirt → rock → snow)
- **Boundary mountains** — ring of mountains closes off the airspace at map edges
- **City** — 9×9 block grid with skyscrapers, office buildings, window strips, antennas, AC units
- **5 Villages** — scattered homes with pitched roofs, doors, windows
- **Airport** — full runway with threshold markings, taxiway, terminal, 2 hangars, control tower, edge/approach lights
- **Airstrip** — grass/paved strip near a village with shed, windsock, edge markers
- 400 trees (pine, oak, bush), roads with center lines, lake, sky dome, animated clouds, fog

### HUD
- Compact bottom bar: status indicator, speed, throttle, altitude, heading, mini attitude indicator
- SpaceX-inspired dark monospace telemetry styling

### Plane Model
- Procedural low-poly mesh: cylindrical fuselage, tapered nose cone, cockpit windshield
- Swept wings with nav lights (red port / green starboard)
- Turbofan engine pods with intake rings
- Landing gear (nose + mains), rudder accent, tail strobe, underwing flaps

## Project Structure

```
Skyport/
├── Dockerfile / docker-compose.yml
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── index.jsx
    ├── index.css
    ├── App.jsx          # HUD + app shell
    ├── components/
    │   ├── Terrain.jsx  # World generation (heightmap, buildings, airports, trees, etc.)
    │   ├── Plane.jsx    # Airplane mesh + flight physics
    │   └── CameraController.jsx
    └── scenes/
        └── MainScene.jsx
```

## Docker

```bash
docker compose up --build       # Build & run
docker compose up --build -d    # Detached
docker compose logs -f          # Follow logs
docker compose down             # Stop
```

Hot-reload enabled via volume mounts for `src/`, `public/`, `index.html`, `vite.config.js`.

## Tech Stack

- [React 19](https://react.dev/) + [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Three.js](https://threejs.org/) + [@react-three/drei](https://github.com/pmndrs/drei)
- [Vite](https://vitejs.dev/) dev server
- Docker (Node 20 Alpine)

## License

MIT