import React, { useState, useCallback, useRef, useEffect } from 'react';
import MainScene from './scenes/MainScene.jsx';
import DogfightScene from './scenes/DogfightScene.jsx';
import useNetwork from './hooks/useNetwork.js';
import { TEAM_SPAWNS } from './components/Terrain.jsx';

/* ══════════════════════════════════════════════════════════════
   HUD Components (shared)
   ══════════════════════════════════════════════════════════════ */
function HudBar({ data }) {
    const headingDeg = data.heading ? ((-data.heading * 180 / Math.PI) % 360 + 360) % 360 : 0;
    const pct = ((data.speed) / 200) * 100;
    let statusText = 'FLY', statusClass = 'flying';
    if (data.crashed) { statusText = 'CRASH'; statusClass = 'crashed'; }
    else if (data.grounded) { statusText = 'GND'; statusClass = 'grounded'; }
    else if (data.speed < 30) { statusText = 'STALL'; statusClass = 'stall'; }

    return (
        <div id="hud-bar">
            <div className={`hud-status ${statusClass}`}>{statusText}</div>
            <div className="hud-cell"><span className="hud-lbl">SPD</span><span className="hud-val">{data.speed}</span><span className="hud-unit">kts</span></div>
            <div className="hud-cell throttle-cell">
                <span className="hud-lbl">THR</span>
                <div className="thr-track"><div className="thr-fill" style={{ width: `${pct}%` }} /></div>
            </div>
            <div className="hud-cell"><span className="hud-lbl">ALT</span><span className="hud-val">{data.altitude}</span><span className="hud-unit">m</span></div>
            <div className="hud-cell"><span className="hud-lbl">HDG</span><span className="hud-val">{headingDeg.toFixed(0)}</span><span className="hud-unit">°</span></div>
            {data.onRunway && <div className="hud-cell runway-cell"><span className="runway-tag">RWY</span></div>}
            <div className="hud-cell att-cell">
                <div className="att-mini">
                    <div className="att-horizon" style={{ transform: `rotate(${-(data.bank || 0) * (180 / Math.PI)}deg) translateY(${(data.pitch || 0) * 30}px)` }} />
                    <div className="att-cross" />
                </div>
            </div>
        </div>
    );
}

function CrashOverlay({ visible }) {
    if (!visible) return null;
    return (
        <div id="crash-overlay">
            <div className="crash-text">CRASH</div>
            <div className="crash-sub">Respawning...</div>
        </div>
    );
}

function ControlsHint({ multiplayer }) {
    return (
        <div id="controls-hint">
            <span className="ch-key">W</span><span className="ch-key">S</span> Pitch
            <span className="ch-sep">|</span>
            <span className="ch-key">A</span><span className="ch-key">D</span> Roll
            <span className="ch-sep">|</span>
            <span className="ch-key">↑</span><span className="ch-key">↓</span> Throttle
            {multiplayer && <>
                <span className="ch-sep">|</span>
                <span className="ch-key">Space</span> Shoot
            </>}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════
   Multiplayer UI
   ══════════════════════════════════════════════════════════════ */
function PlayerList({ players, myId }) {
    if (!players || players.length === 0) return null;
    return (
        <div id="player-list">
            <div className="pl-header">PILOTS</div>
            {players.map(p => (
                <div key={p.id} className={`pl-row ${p.id === myId ? 'pl-me' : ''}`}>
                    <span className={`pl-team team-${p.team}`}>{p.team}</span>
                    <span className="pl-name">{p.name}</span>
                    {p.id === myId && <span className="pl-you">YOU</span>}
                </div>
            ))}
        </div>
    );
}

function HitToast({ events, players }) {
    if (!events || events.length === 0) return null;
    const getName = (id) => {
        const p = players.find(pl => pl.id === id);
        return p ? p.name : `Pilot ${id}`;
    };
    return (
        <div id="hit-toasts">
            {events.slice(-4).map((ev, i) => (
                <div key={i} className="hit-toast">
                    <span className="ht-by">{getName(ev.byId)}</span>
                    <span className="ht-arrow">→</span>
                    <span className="ht-target">{getName(ev.targetId)}</span>
                </div>
            ))}
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════
   Radar Minimap
   ══════════════════════════════════════════════════════════════ */
function RadarMap({ hudData, networkRef }) {
    const canvasRef = React.useRef(null);
    const RADAR_SIZE = 160;
    const RADAR_RANGE = 2000; // World units visible on radar

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let animFrame;

        const draw = () => {
            const px = hudData.x || 0;
            const pz = hudData.z || 0;
            const heading = hudData.heading || 0;

            ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE);

            // Background
            ctx.fillStyle = 'rgba(0, 30, 10, 0.85)';
            ctx.fillRect(0, 0, RADAR_SIZE, RADAR_SIZE);

            // Grid lines
            ctx.strokeStyle = 'rgba(0, 180, 60, 0.2)';
            ctx.lineWidth = 0.5;
            for (let i = 1; i < 4; i++) {
                const p = (i / 4) * RADAR_SIZE;
                ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, RADAR_SIZE); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(RADAR_SIZE, p); ctx.stroke();
            }

            // Range rings
            const cx = RADAR_SIZE / 2, cy = RADAR_SIZE / 2;
            ctx.strokeStyle = 'rgba(0, 180, 60, 0.15)';
            ctx.lineWidth = 0.5;
            for (let r = 1; r <= 3; r++) {
                ctx.beginPath();
                ctx.arc(cx, cy, (r / 3) * (RADAR_SIZE / 2 - 4), 0, Math.PI * 2);
                ctx.stroke();
            }

            // Border
            ctx.strokeStyle = '#00cc44';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(0, 0, RADAR_SIZE, RADAR_SIZE);

            // Draw other players using canvas transforms
            const myTeam = networkRef.myTeam.current;
            const playersMap = networkRef.players.current;
            const scale = RADAR_SIZE / (RADAR_RANGE * 2);

            if (playersMap) {
                // Save context, move to center, rotate by heading
                ctx.save();
                ctx.translate(cx, cy);
                // We rotate the CANVAS by the player's heading.
                // If player heading is 90° (facing +X/Right), we rotate canvas -90° so +X points UP.
                // In Three.js, positive yaw is turning left (CCW).
                ctx.rotate(heading);

                for (const [id, p] of playersMap.entries()) {
                    if (!p.state) continue;
                    // Raw offset from local player
                    const dx = p.state.x - px;
                    const dz = p.state.z - pz;

                    // Apply scale
                    const sx = dx * scale;
                    const sz = dz * scale;

                    // Skip if out of circular radar range
                    if (sx * sx + sz * sz > (RADAR_SIZE / 2) ** 2) continue;

                    // Color: blue = teammate, red = enemy
                    const isTeammate = p.team === myTeam;
                    ctx.fillStyle = isTeammate ? '#4488ff' : '#ff4444';
                    ctx.beginPath();
                    // World X -> Canvas X. World Z -> Canvas Y.
                    ctx.arc(sx, sz, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            // Draw self (center) — white triangle always pointing UP (canvas -Y)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(cx, cy - 6);
            ctx.lineTo(cx - 4, cy + 4);
            ctx.lineTo(cx + 4, cy + 4);
            ctx.closePath();
            ctx.fill();

            // Heading indicator text
            const hdeg = ((-heading * 180 / Math.PI) % 360 + 360) % 360;
            ctx.fillStyle = '#00cc44';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${hdeg.toFixed(0)}°`, cx, 12);

            animFrame = requestAnimationFrame(draw);
        };
        draw();
        return () => cancelAnimationFrame(animFrame);
    }, [hudData, networkRef, RADAR_SIZE, RADAR_RANGE]);

    return (
        <div id="radar-map">
            <canvas ref={canvasRef} width={RADAR_SIZE} height={RADAR_SIZE} />
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════
   Connection Screen
   ══════════════════════════════════════════════════════════════ */
function ConnectScreen({ onSolo, onConnect }) {
    const [name, setName] = useState('');
    const [server, setServer] = useState(`ws://${window.location.hostname}:3001`);

    return (
        <div id="connect-screen">
            <div className="cs-panel">
                <div className="cs-title">
                    <span className="cs-icon">✈</span>
                    <span>SKYPORT</span>
                </div>
                <div className="cs-subtitle">DOGFIGHT ARENA</div>

                <input
                    className="cs-input"
                    type="text"
                    placeholder="Callsign"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    maxLength={16}
                    autoFocus
                />
                <input
                    className="cs-input cs-input-sm"
                    type="text"
                    placeholder="Server URL"
                    value={server}
                    onChange={e => setServer(e.target.value)}
                />

                <button className="cs-btn cs-btn-primary" onClick={() => onConnect(name || 'Maverick', server)}>
                    JOIN DOGFIGHT
                </button>
                <button className="cs-btn cs-btn-secondary" onClick={onSolo}>
                    SOLO FLIGHT
                </button>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════
   App
   ══════════════════════════════════════════════════════════════ */
export default function App() {
    const appRef = useRef();
    const [mode, setMode] = useState('menu'); // 'menu' | 'solo' | 'dogfight'
    const [hudData, setHudData] = useState({
        speed: 0, altitude: 0, x: 0, z: 0,
        heading: 0, pitch: 0, bank: 0,
        grounded: true, crashed: false, onRunway: false,
    });
    const [playerListState, setPlayerListState] = useState([]);
    const [hitEventState, setHitEventState] = useState([]);
    const [connected, setConnected] = useState(false);

    const networkRef = useNetwork();
    const spawnPointRef = useRef(null);

    const handleHud = useCallback((data) => setHudData(data), []);

    // Wire up network callbacks to React state (for UI only)
    useEffect(() => {
        networkRef.onConnectChange.current = (c) => setConnected(c);
        networkRef.onPlayerListChange.current = (list) => setPlayerListState(list);
        networkRef.onHitEvent.current = (ev) => {
            setHitEventState(prev => [...prev.slice(-5), ev]);
            // Auto-remove after 3s
            setTimeout(() => setHitEventState(prev => prev.slice(1)), 3000);
        };
    }, [networkRef]);

    const handleSolo = useCallback(() => {
        setMode('solo');
    }, []);

    const handleConnect = useCallback((name, serverUrl) => {
        // Override network URL if different
        const net = networkRef;
        net.connect(name, serverUrl);

        // Wait for welcome to get team + spawn
        const checkInterval = setInterval(() => {
            if (net.myId.current) {
                const team = net.myTeam.current;
                const idx = net.mySpawnIndex.current;
                spawnPointRef.current = TEAM_SPAWNS[team]?.[idx] || TEAM_SPAWNS.A[0];
                setMode('dogfight');
                clearInterval(checkInterval);
            }
        }, 100);

        // Timeout after 5s
        setTimeout(() => clearInterval(checkInterval), 5000);
    }, [networkRef]);

    useEffect(() => {
        if (appRef.current) appRef.current.focus();
    }, [mode]);

    if (mode === 'menu') {
        return <ConnectScreen onSolo={handleSolo} onConnect={handleConnect} />;
    }

    return (
        <div className="app" ref={appRef} tabIndex={-1} style={{ outline: 'none' }}>
            {mode === 'solo' ? (
                <MainScene onHud={handleHud} />
            ) : (
                <DogfightScene
                    onHud={handleHud}
                    networkRef={networkRef}
                    spawnPoint={spawnPointRef.current}
                />
            )}

            <CrashOverlay visible={hudData.crashed} />

            <div id="title-mark">
                <span className="tm-icon">✈</span>
                <span className="tm-text">SKYPORT</span>
                {mode === 'dogfight' && (
                    <span className="tm-mode">DOGFIGHT</span>
                )}
            </div>

            <ControlsHint multiplayer={mode === 'dogfight'} />
            <HudBar data={hudData} />

            {mode === 'dogfight' && (
                <>
                    <PlayerList players={playerListState} myId={networkRef.myId.current} />
                    <HitToast events={hitEventState} players={playerListState} />
                    <RadarMap hudData={hudData} networkRef={networkRef} />
                    {!connected && (
                        <div id="connection-status">RECONNECTING...</div>
                    )}
                </>
            )}
        </div>
    );
}
