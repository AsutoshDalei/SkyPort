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
   Connection Screen
   ══════════════════════════════════════════════════════════════ */
function ConnectScreen({ onSolo, onConnect }) {
    const [name, setName] = useState('');
    const [server, setServer] = useState('ws://localhost:3001');

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
        net.connect(name);

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
                    {!connected && (
                        <div id="connection-status">RECONNECTING...</div>
                    )}
                </>
            )}
        </div>
    );
}
