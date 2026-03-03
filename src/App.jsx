import React, { useState, useCallback, useRef, useEffect } from 'react';
import MainScene from './scenes/MainScene.jsx';

/* ── Telemetry Panel (SpaceX-inspired) ───────────────────────── */
function TelemetryPanel({ data }) {
    const headingDeg = data.heading ? ((-data.heading * 180 / Math.PI) % 360 + 360) % 360 : 0;
    const pitchDeg = data.pitch ? (data.pitch * 180 / Math.PI) : 0;
    const bankDeg = data.bank ? (data.bank * 180 / Math.PI) : 0;

    return (
        <div id="telemetry-panel" className="hud-panel">
            <h3>TELEMETRY</h3>
            <div className="hud-row">
                <span className="hud-label">ALTITUDE</span>
                <span className="hud-value"><span className="val-num">{data.altitude}</span> m</span>
            </div>
            <div className="hud-row">
                <span className="hud-label">SPEED</span>
                <span className="hud-value"><span className="val-num">{data.speed}</span> kts</span>
            </div>
            <div className="hud-row">
                <span className="hud-label">HEADING</span>
                <span className="hud-value"><span className="val-num">{headingDeg.toFixed(0)}</span>°</span>
            </div>

            <div className="hud-divider" />

            <div className="hud-row">
                <span className="hud-label">PITCH</span>
                <span className="hud-value">{pitchDeg.toFixed(1)}°</span>
            </div>
            <div className="hud-row">
                <span className="hud-label">BANK</span>
                <span className="hud-value">{bankDeg.toFixed(1)}°</span>
            </div>

            <div className="hud-divider" />

            <div className="hud-row">
                <span className="hud-label">POSITION</span>
                <span className="hud-value hud-coords">{data.x}, {data.z}</span>
            </div>

            <div className="hud-row">
                <span className="hud-label">STATUS</span>
                <span className={`hud-value ${data.grounded ? 'status-grounded' : 'status-flying'}`}>
                    {data.grounded ? 'GROUNDED' : data.speed < 25 ? 'STALL' : 'FLYING'}
                </span>
            </div>
        </div>
    );
}

/* ── Throttle Bar ────────────────────────────────────────────── */
function ThrottleBar({ speed, min, max }) {
    const pct = ((speed - min) / (max - min)) * 100;
    return (
        <div id="throttle-bar-container">
            <div id="throttle-label">THR</div>
            <div id="throttle-bar-bg">
                <div id="throttle-bar-fill" style={{ height: `${pct}%` }} />
            </div>
            <div id="throttle-val">{speed}</div>
        </div>
    );
}

/* ── Attitude Indicator ──────────────────────────────────────── */
function AttitudeIndicator({ pitch, bank }) {
    return (
        <div id="attitude-panel" className="hud-panel">
            <h3>ATTITUDE</h3>
            <div className="ai-frame">
                <div
                    className="ai-horizon"
                    style={{
                        transform: `rotate(${-(bank || 0) * (180 / Math.PI)}deg) translateY(${(pitch || 0) * 50}px)`,
                    }}
                />
                <div className="ai-wings" />
                <div className="ai-center-dot" />
            </div>
        </div>
    );
}

/* ── Controls Legend ─────────────────────────────────────────── */
function ControlsPanel() {
    return (
        <div id="controls-panel" className="hud-panel">
            <h3>FLIGHT CONTROLS</h3>
            <div className="key-row"><span className="key">W</span> <span className="key">S</span> THROTTLE</div>
            <div className="key-row"><span className="key">↑</span> <span className="key">↓</span> PITCH</div>
            <div className="key-row"><span className="key">←</span> <span className="key">→</span> ROLL</div>
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

            <div id="ui-layer">
                <TelemetryPanel data={hudData} />
                <AttitudeIndicator pitch={hudData.pitch} bank={hudData.bank} />
                <ThrottleBar speed={hudData.speed} min={0} max={200} />
                <ControlsPanel />

                {/* Title */}
                <div id="title-bar">
                    <span className="title-icon">✈</span>
                    <span className="title-text">SKYPORT</span>
                </div>
            </div>
        </div>
    );
}
