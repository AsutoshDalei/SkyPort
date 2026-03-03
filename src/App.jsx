import React, { useState, useCallback, useRef, useEffect } from 'react';
import MainScene from './scenes/MainScene.jsx';

/* ── Compass ─────────────────────────────────────────────────── */
function Compass({ heading }) {
    const rotation = -heading * (180 / Math.PI);
    return (
        <div className="compass">
            <div className="compass-ring">
                <div className="compass-face" style={{ transform: `rotate(${rotation}deg)` }}>
                    <span className="compass-n">N</span>
                    <span className="compass-e">E</span>
                    <span className="compass-s">S</span>
                    <span className="compass-w">W</span>
                    <div className="compass-needle" />
                </div>
                <div className="compass-center-dot" />
            </div>
        </div>
    );
}

/* ── Artificial Horizon ──────────────────────────────────────── */
function ArtificialHorizon({ pitch, bank }) {
    return (
        <div className="attitude-indicator">
            <div className="ai-label">ATT</div>
            <div className="ai-frame">
                <div
                    className="ai-sky-ground"
                    style={{
                        transform: `rotate(${-bank * (180 / Math.PI)}deg) translateY(${pitch * 60}px)`,
                    }}
                />
                <div className="ai-crosshair" />
                <div className="ai-bank-marks" style={{ transform: `rotate(${-bank * (180 / Math.PI)}deg)` }}>
                    <div className="ai-bank-top" />
                </div>
            </div>
        </div>
    );
}

/* ── Throttle Bar ────────────────────────────────────────────── */
function ThrottleBar({ speed, min, max }) {
    const pct = ((speed - min) / (max - min)) * 100;
    return (
        <div className="throttle-bar">
            <div className="throttle-label">THR</div>
            <div className="throttle-track">
                <div className="throttle-fill" style={{ height: `${pct}%` }} />
            </div>
            <div className="throttle-value">{speed}</div>
        </div>
    );
}

/* ── HUD Overlay ─────────────────────────────────────────────── */
function HUD({ data }) {
    return (
        <div className="hud">
            {/* Top center: speed + altitude */}
            <div className="hud-top-bar">
                <div className="hud-metric">
                    <div className="hud-metric-label">SPD</div>
                    <div className="hud-metric-value">{data.speed}<span className="hud-metric-unit">kts</span></div>
                </div>
                <Compass heading={data.heading || 0} />
                <div className="hud-metric">
                    <div className="hud-metric-label">ALT</div>
                    <div className="hud-metric-value">{data.altitude}<span className="hud-metric-unit">m</span></div>
                </div>
            </div>

            {/* Left: attitude indicator */}
            <ArtificialHorizon pitch={data.pitch || 0} bank={data.bank || 0} />

            {/* Right: throttle */}
            <ThrottleBar speed={data.speed} min={20} max={200} />

            {/* Bottom center: coordinates */}
            <div className="hud-bottom-bar">
                <span className="hud-coord">X {data.x}</span>
                <span className="hud-coord-sep">•</span>
                <span className="hud-coord">Z {data.z}</span>
            </div>

            {/* Controls hint — minimal, bottom right */}
            <div className="hud-controls">
                <div><kbd>W</kbd><kbd>S</kbd> Throttle</div>
                <div><kbd>↑</kbd><kbd>↓</kbd> Pitch</div>
                <div><kbd>←</kbd><kbd>→</kbd> Roll</div>
            </div>
        </div>
    );
}

/* ── App ─────────────────────────────────────────────────────── */
export default function App() {
    const appRef = useRef();
    const [hudData, setHudData] = useState({
        speed: 60,
        altitude: 100,
        x: 0,
        z: 300,
        heading: 0,
        pitch: 0,
        bank: 0,
    });

    const handleHud = useCallback((data) => {
        setHudData(data);
    }, []);

    useEffect(() => {
        if (appRef.current) appRef.current.focus();
    }, []);

    return (
        <div className="app" ref={appRef} tabIndex={-1} style={{ outline: 'none' }}>
            <MainScene onHud={handleHud} />
            <HUD data={hudData} />

            {/* Title */}
            <div className="title-bar">
                <span className="title-logo">✈</span>
                <span className="title-text">SKYPORT</span>
            </div>
        </div>
    );
}
