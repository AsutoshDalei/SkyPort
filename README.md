# SkyPort

SkyPort is an in-browser 3D flight sandbox and multiplayer dogfight arena. Built entirely with web technologies, it allows players to explore an expansive 8000x8000 unit world or engage in fast-paced 8-player tactical combat directly within an internet browser.

## Motivation & Origin

This project was heavily inspired by the classic Ace Combat series. The goal was to recreate the feeling of arcade-style aerial combat—the speed, the tension of dogfighting, and the satisfaction of mastering flight mechanics—but making it instantly accessible through a web browser without any installations. The physics are intentionally tuned to balance realism with intuitive, engaging arcade gameplay, encouraging dramatic low-altitude maneuvers and high-speed pursuits.

SkyPort was "vibe-coded" in collaboration with AI assistance, utilizing Google DeepMind's Antigravity and Anthropic's Claude to rapidly prototype, build, and refine the 3D environment, the multiplayer networking stack, and the flight physics.

## Features

- Massive Sandbox World: An 8000x8000 environment featuring two major cities, a highway system, a challenging river canyon, towering snow peaks, and five distinct landing zones.
- Custom Flight Physics: Aerodynamics tailored for arcade dogfighting, including intuitive stall mechanics, stall wobbles, and responsive pitch/roll controls.
- Multiplayer Arena: Persistent WebSocket-based multiplayer supporting up to 8 players simultaneously with auto-team assignment (Team A vs Team B).
- Tactical Radar: A real-time, heading-up radar minimap that actively tracks the relative positions of teammates and hostile targets.
- Zero-Rerender Architecture: Built for high-frame-rate performance using React refs, completely bypassing React's render cycle for physics and network interpolation.

## Technology Stack

The project relies on a modern web development stack optimized for 3D graphics and real-time networking:

- Frontend UI: React 19, Vite 6
- 3D Engine: Three.js (r183), React Three Fiber 9, Drei 10
- Performance Tech: Heavy use of InstancedMesh (rendering 1000+ objects in under 10 draw calls) and O(1) spatial hashing for rapid collision detection.
- Backend / Networking: Node.js WebSocket (ws) server with 20Hz state synchronization and exponential client-side lerping for smooth remote player movement.
- Infrastructure: Configured for Docker and Docker Compose for instant, reproducible local environments.

## Quick Start

The easiest way to run the entire stack (both the Vite frontend dev server and the Node.js WebSocket backend) is via Docker.

```bash
# Build and start both the game and the multiplayer server
docker compose up --build
```

- Game Client: http://localhost:5173
- WebSocket Server: ws://localhost:3001

To test multiplayer locally, open multiple tabs or multiple web browsers pointed to http://localhost:5173. To play with friends on your local network, find your local IP address (e.g., 192.168.1.50) and have them navigate to `http://192.168.1.50:5173`.

## Flight Controls

| Key | Action |
|-----|--------|
| W | Pitch down (dive) |
| S | Pitch up (climb) |
| A | Roll left |
| D | Roll right |
| Up Arrow | Throttle up |
| Down Arrow | Throttle down / Ground brake |
| Space | Shoot primary weapon (Multiplayer only) |

Flight Warning: Monitor your airspeed to avoid stalling. Aircraft can only land safely on designated runways (as indicated by the RWY HUD). Contact with any other terrain or structures will result in an immediate crash sequence and respawn.