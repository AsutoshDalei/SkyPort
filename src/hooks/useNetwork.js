import { useRef, useEffect, useCallback } from 'react';

/* ══════════════════════════════════════════════════════════════
   useNetwork — WebSocket multiplayer hook
   All state in useRef to avoid React re-renders.
   ══════════════════════════════════════════════════════════════ */

export default function useNetwork() {
    const ws = useRef(null);
    const myId = useRef(null);
    const myTeam = useRef(null);
    const mySpawnIndex = useRef(0);
    const connected = useRef(false);
    const players = useRef(new Map()); // id → { name, team, state, prevState, lastUpdate }
    const playerList = useRef([]); // [{ id, name, team }]
    const hitEvents = useRef([]); // [{ targetId, byId, time }]
    const remoteShots = useRef([]); // [{ playerId, ox,oy,oz, dx,dy,dz, time }]
    const joinedRef = useRef(false);
    const nameRef = useRef('');
    const urlRef = useRef('');
    const reconnectTimer = useRef(null);

    // Callbacks for UI state updates (called from React)
    const onConnectChange = useRef(null);
    const onPlayerListChange = useRef(null);
    const onHitEvent = useRef(null);

    const connect = useCallback((playerName, serverUrl) => {
        if (ws.current && ws.current.readyState <= 1) return; // already connected/connecting
        nameRef.current = playerName;
        if (serverUrl) urlRef.current = serverUrl;

        const socket = new WebSocket(urlRef.current);
        ws.current = socket;

        socket.onopen = () => {
            connected.current = true;
            socket.send(JSON.stringify({ type: 'join', name: playerName }));
            if (onConnectChange.current) onConnectChange.current(true);
        };

        socket.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }

            switch (msg.type) {
                case 'welcome':
                    myId.current = msg.id;
                    myTeam.current = msg.team;
                    mySpawnIndex.current = msg.spawnIndex;
                    joinedRef.current = true;
                    // Initialize player list
                    playerList.current = msg.players;
                    for (const p of msg.players) {
                        if (p.id !== msg.id) {
                            players.current.set(p.id, {
                                name: p.name, team: p.team,
                                state: null, prevState: null, lastUpdate: 0,
                            });
                        }
                    }
                    if (onPlayerListChange.current) onPlayerListChange.current([...playerList.current]);
                    break;

                case 'player_joined':
                    players.current.set(msg.id, {
                        name: msg.name, team: msg.team,
                        state: null, prevState: null, lastUpdate: 0,
                    });
                    playerList.current = [...playerList.current, { id: msg.id, name: msg.name, team: msg.team }];
                    if (onPlayerListChange.current) onPlayerListChange.current([...playerList.current]);
                    break;

                case 'player_left':
                    players.current.delete(msg.id);
                    playerList.current = playerList.current.filter(p => p.id !== msg.id);
                    if (onPlayerListChange.current) onPlayerListChange.current([...playerList.current]);
                    break;

                case 'states':
                    for (const [idStr, state] of Object.entries(msg.players)) {
                        const id = Number(idStr);
                        if (id === myId.current) continue;
                        const p = players.current.get(id);
                        if (p) {
                            p.prevState = p.state ? { ...p.state } : null;
                            p.state = state;
                            p.lastUpdate = performance.now();
                        }
                    }
                    break;

                case 'shot_fired':
                    remoteShots.current.push({
                        playerId: msg.playerId,
                        ox: msg.ox, oy: msg.oy, oz: msg.oz,
                        dx: msg.dx, dy: msg.dy, dz: msg.dz,
                        time: performance.now(),
                    });
                    // Prune old shots (>4s)
                    const now = performance.now();
                    remoteShots.current = remoteShots.current.filter(s => now - s.time < 4000);
                    break;

                case 'player_hit':
                    hitEvents.current.push({
                        targetId: msg.targetId,
                        byId: msg.byId,
                        time: performance.now(),
                    });
                    // Prune old events (>3s)
                    hitEvents.current = hitEvents.current.filter(e => performance.now() - e.time < 3000);
                    if (onHitEvent.current) onHitEvent.current(msg);
                    break;

                case 'error':
                    console.warn('[SkyPort]', msg.msg);
                    break;
            }
        };

        socket.onclose = () => {
            connected.current = false;
            joinedRef.current = false;
            if (onConnectChange.current) onConnectChange.current(false);
            // Auto-reconnect after 2s
            reconnectTimer.current = setTimeout(() => {
                if (nameRef.current) connect(nameRef.current, urlRef.current);
            }, 2000);
        };

        socket.onerror = () => { /* onclose will fire */ };
    }, []);

    const disconnect = useCallback(() => {
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        if (ws.current) ws.current.close();
        connected.current = false;
        joinedRef.current = false;
        myId.current = null;
        players.current.clear();
        playerList.current = [];
    }, []);

    // Send local plane state (called at 20Hz from useFrame)
    const sendState = useCallback((x, y, z, yaw, pitch, bank, speed) => {
        if (!ws.current || ws.current.readyState !== 1 || !joinedRef.current) return;
        ws.current.send(JSON.stringify({ type: 'state', x, y, z, yaw, pitch, bank, speed }));
    }, []);

    // Send shot (called on spacebar/click)
    const sendShot = useCallback((ox, oy, oz, dx, dy, dz) => {
        if (!ws.current || ws.current.readyState !== 1 || !joinedRef.current) return;
        ws.current.send(JSON.stringify({ type: 'shoot', ox, oy, oz, dx, dy, dz }));
    }, []);

    // Send hit notification
    const sendHit = useCallback((targetId) => {
        if (!ws.current || ws.current.readyState !== 1 || !joinedRef.current) return;
        ws.current.send(JSON.stringify({ type: 'hit', targetId }));
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
            if (ws.current) ws.current.close();
        };
    }, []);

    return {
        connect,
        disconnect,
        sendState,
        sendShot,
        sendHit,
        myId,
        myTeam,
        mySpawnIndex,
        connected,
        players,        // Map<id, { name, team, state, prevState, lastUpdate }>
        playerList,     // ref to array
        hitEvents,      // ref to array
        remoteShots,    // ref to array
        onConnectChange,
        onPlayerListChange,
        onHitEvent,
    };
}
