import { WebSocketServer } from 'ws';

/* ══════════════════════════════════════════════════════════════
   SkyPort Dogfight Server
   - Max 8 players, 2 teams of 4
   - 20Hz state broadcast
   - Shot + hit relay
   ══════════════════════════════════════════════════════════════ */

const PORT = 3001;
const MAX_PLAYERS = 8;
const TICK_RATE = 50; // ms (20Hz)

const wss = new WebSocketServer({ port: PORT });
const players = new Map(); // id → { ws, name, team, spawnIndex, state }
let nextId = 1;

function broadcast(msg, excludeId = null) {
    const data = JSON.stringify(msg);
    for (const [id, p] of players) {
        if (id !== excludeId && p.ws.readyState === 1) {
            p.ws.send(data);
        }
    }
}

function assignTeam() {
    let teamA = 0, teamB = 0;
    for (const p of players.values()) {
        if (p.team === 'A') teamA++;
        else teamB++;
    }
    if (teamA <= teamB) return { team: 'A', spawnIndex: teamA };
    return { team: 'B', spawnIndex: teamB };
}

function getPlayerList() {
    const list = [];
    for (const [id, p] of players) {
        list.push({ id, name: p.name, team: p.team });
    }
    return list;
}

wss.on('connection', (ws) => {
    if (players.size >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ type: 'error', msg: 'Server full' }));
        ws.close();
        return;
    }

    const playerId = nextId++;
    let joined = false;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {
            case 'join': {
                const { team, spawnIndex } = assignTeam();
                const name = (msg.name || `Pilot ${playerId}`).slice(0, 16);
                players.set(playerId, {
                    ws, name, team, spawnIndex,
                    state: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, bank: 0, speed: 0 },
                });
                joined = true;

                // Send welcome to this player
                ws.send(JSON.stringify({
                    type: 'welcome',
                    id: playerId,
                    team,
                    spawnIndex,
                    players: getPlayerList(),
                }));

                // Broadcast join to others
                broadcast({ type: 'player_joined', id: playerId, name, team }, playerId);
                console.log(`[+] ${name} joined (Team ${team}, slot ${spawnIndex}) — ${players.size} players`);
                break;
            }

            case 'state': {
                if (!joined) return;
                const p = players.get(playerId);
                if (p) {
                    p.state = {
                        x: msg.x, y: msg.y, z: msg.z,
                        yaw: msg.yaw, pitch: msg.pitch, bank: msg.bank,
                        speed: msg.speed,
                    };
                }
                break;
            }

            case 'shoot': {
                if (!joined) return;
                broadcast({
                    type: 'shot_fired',
                    playerId,
                    ox: msg.ox, oy: msg.oy, oz: msg.oz,
                    dx: msg.dx, dy: msg.dy, dz: msg.dz,
                }, playerId); // don't echo back to shooter
                break;
            }

            case 'hit': {
                if (!joined) return;
                broadcast({
                    type: 'player_hit',
                    targetId: msg.targetId,
                    byId: playerId,
                });
                break;
            }
        }
    });

    ws.on('close', () => {
        if (joined) {
            const p = players.get(playerId);
            console.log(`[-] ${p?.name || playerId} left — ${players.size - 1} players`);
            players.delete(playerId);
            broadcast({ type: 'player_left', id: playerId });
        }
    });

    ws.on('error', () => {
        players.delete(playerId);
    });
});

// ── 20Hz state broadcast tick ──────────────────────────────────
setInterval(() => {
    if (players.size === 0) return;
    const states = {};
    for (const [id, p] of players) {
        states[id] = p.state;
    }
    const msg = JSON.stringify({ type: 'states', players: states });
    for (const p of players.values()) {
        if (p.ws.readyState === 1) p.ws.send(msg);
    }
}, TICK_RATE);

console.log(`🛩️  SkyPort Dogfight Server running on ws://0.0.0.0:${PORT}`);
