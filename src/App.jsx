import React, { useState, useCallback, useRef, useEffect } from 'react';
import MainScene from './scenes/MainScene.jsx';

/* ── Bottom HUD Bar ──────────────────────────────────────────── */
function HudBar({ data }) {
    const headingDeg = data.heading ? ((-data.heading * 180 / Math.PI) % 360 + 360) % 360 : 0;
    const pct = ((data.speed) / 200) * 100;

    return (
        <div id="hud-bar">
            {/* Status light */}
            <div className={`hud-status ${data.grounded ? 'grounded' : data.speed < 30 ? 'stall' : 'flying'}`}>
                {data.grounded ? 'GND' : data.speed < 30 ? 'STALL' : 'FLY'}
            </div>

            {/* Speed */}
            <div className="hud-cell">
                <span className="hud-lbl">SPD</span>
                <span className="hud-val">{data.speed}</span>
                <span className="hud-unit">kts</span>
            </div>

            {/* Throttle mini-bar */}
            <div className="hud-cell throttle-cell">
                <span className="hud-lbl">THR</span>
                <div className="thr-track">
                    <div className="thr-fill" style={{ width: `${pct}%` }} />
                </div>
            </div>

            {/* Altitude */}
            <div className="hud-cell">
                <span className="hud-lbl">ALT</span>
                <span className="hud-val">{data.altitude}</span>
                <span className="hud-unit">m</span>
            </div>

            {/* Heading */}
            <div className="hud-cell">
                <span className="hud-lbl">HDG</span>
                <span className="hud-val">{headingDeg.toFixed(0)}</span>
                <span className="hud-unit">°</span>
            </div>

            {/* Mini attitude */}
            <div className="hud-cell att-cell">
                <div className="att-mini">
                    <div
                        className="att-horizon"
                        style={{
                            transform: `rotate(${-(data.bank || 0) * (180 / Math.PI)}deg) translateY(${(data.pitch || 0) * 30}px)`,
                        }}
                    />
                    <div className="att-cross" />
                </div>
            </div>
        </div>
    );
}

/* ── Controls hint (tiny, top-right corner) ──────────────────── */
function ControlsHint() {
    return (
        <div id="controls-hint">
            <span className="ch-key">W</span><span className="ch-key">S</span> Throttle
            <span className="ch-sep">|</span>
            <span className="ch-key">↑</span><span className="ch-key">↓</span> Pitch
            <span className="ch-sep">|</span>
            <span className="ch-key">←</span><span className="ch-key">→</span> Roll
        </div>
    );
}

/* ── App ─────────────────────────────────────────────────────── */
export default function App() {
    const appRef = useRef();
    const [hudData, setHudData] = useState({
        speed: 60, altitude: 100, x: 0, z: 300,
        heading: 0, pitch: 0, bank: 0, grounded: false,
    });

    const handleHud = useCallback((data) => setHudData(data), []);

    useEffect(() => {
        if (appRef.current) appRef.current.focus();
    }, []);

    return (
        <div className="app" ref={appRef} tabIndex={-1} style={{ outline: 'none' }}>
            <MainScene onHud={handleHud} />

            {/* Title — tiny, top-left */}
            <div id="title-mark">
                <span className="tm-icon">✈</span>
                <span className="tm-text">SKYPORT</span>
            </div>

            <ControlsHint />
            <HudBar data={hudData} />
        </div>
    );
}
