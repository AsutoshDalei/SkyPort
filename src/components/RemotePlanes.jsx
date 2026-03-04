import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

/* ══════════════════════════════════════════════════════════════
   RemotePlanes — renders other players with lerp interpolation
   ══════════════════════════════════════════════════════════════ */

const TEAM_COLORS = { A: '#4488ff', B: '#ff4444' };
const LERP_SPEED = 12; // interpolation rate

// Simple low-poly plane shape (matches AirplaneMesh style)
function RemotePlaneMesh({ teamColor }) {
    return (
        <group>
            {/* Fuselage */}
            <mesh>
                <cylinderGeometry args={[0.4, 0.5, 6, 6]} />
                <meshStandardMaterial color="#b0b8c0" roughness={0.5} metalness={0.3} />
            </mesh>
            {/* Nose */}
            <mesh position={[0, 0, -3.5]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.45, 1.5, 6]} />
                <meshStandardMaterial color="#909aa0" roughness={0.4} metalness={0.4} />
            </mesh>
            {/* Wings */}
            <mesh rotation={[0, 0, 0]}>
                <boxGeometry args={[12, 0.12, 1.8]} />
                <meshStandardMaterial color="#a0a8b0" roughness={0.5} metalness={0.2} />
            </mesh>
            {/* Tail vertical */}
            <mesh position={[0, 1.2, 2.5]}>
                <boxGeometry args={[0.1, 2, 1.2]} />
                <meshStandardMaterial color="#a0a8b0" roughness={0.5} />
            </mesh>
            {/* Tail horizontal */}
            <mesh position={[0, 0.3, 2.5]}>
                <boxGeometry args={[4, 0.08, 0.9]} />
                <meshStandardMaterial color="#a0a8b0" roughness={0.5} />
            </mesh>
            {/* Team color stripe */}
            <mesh position={[0, 0.55, 0]}>
                <boxGeometry args={[0.6, 0.05, 5]} />
                <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={0.3} />
            </mesh>
            {/* Nav lights */}
            <pointLight color="#ff0000" intensity={0.6} distance={10} position={[-6, 0, 0]} />
            <pointLight color="#00ff00" intensity={0.6} distance={10} position={[6, 0, 0]} />
        </group>
    );
}

// Individual remote plane with interpolation
function RemotePlane({ playerId, playerData }) {
    const groupRef = useRef();
    const targetPos = useRef(new THREE.Vector3());
    const targetRot = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
    const currentPos = useRef(new THREE.Vector3());
    const currentRot = useRef({ yaw: 0, pitch: 0, bank: 0 });
    const initialized = useRef(false);
    const hitFlash = useRef(0);

    useFrame((_, delta) => {
        if (!groupRef.current || !playerData.state) return;
        const dt = Math.min(delta, 0.05);
        const s = playerData.state;

        targetPos.current.set(s.x, s.y, s.z);

        if (!initialized.current) {
            currentPos.current.copy(targetPos.current);
            currentRot.current = { yaw: s.yaw, pitch: s.pitch, bank: s.bank };
            initialized.current = true;
        }

        // Lerp position
        const lerpFactor = 1 - Math.exp(-LERP_SPEED * dt);
        currentPos.current.lerp(targetPos.current, lerpFactor);

        // Lerp rotation
        currentRot.current.yaw += (s.yaw - currentRot.current.yaw) * lerpFactor;
        currentRot.current.pitch += (s.pitch - currentRot.current.pitch) * lerpFactor;
        currentRot.current.bank += (s.bank - currentRot.current.bank) * lerpFactor;

        groupRef.current.position.copy(currentPos.current);
        groupRef.current.rotation.set(currentRot.current.pitch, currentRot.current.yaw, currentRot.current.bank, 'YXZ');

        // Hit flash decay
        if (hitFlash.current > 0) {
            hitFlash.current -= dt * 3;
        }
    });

    const teamColor = TEAM_COLORS[playerData.team] || '#ffffff';

    return (
        <group ref={groupRef}>
            <RemotePlaneMesh teamColor={teamColor} />
            {/* Player name label */}
            <Html position={[0, 4, 0]} center distanceFactor={80} style={{ pointerEvents: 'none' }}>
                <div style={{
                    background: 'rgba(0,0,0,0.6)',
                    color: teamColor,
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontFamily: 'Consolas, Monaco, monospace',
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.5px',
                }}>
                    {playerData.name}
                </div>
            </Html>
        </group>
    );
}

// Main component that renders all remote planes
export default function RemotePlanes({ networkPlayers, hitEvents }) {
    const frameCount = useRef(0);
    const visiblePlayers = useRef([]);

    // Update visible player list periodically (not every frame)
    useFrame(() => {
        frameCount.current++;
        if (frameCount.current % 10 === 0) {
            const arr = [];
            for (const [id, data] of networkPlayers.current) {
                if (data.state) arr.push({ id, data });
            }
            visiblePlayers.current = arr;
        }
    });

    // We need to render a fixed number of slots and show/hide them
    // Use the players map directly for rendering
    const [, forceUpdate] = React.useState(0);
    useEffect(() => {
        const interval = setInterval(() => forceUpdate(v => v + 1), 500);
        return () => clearInterval(interval);
    }, []);

    const entries = [];
    for (const [id, data] of networkPlayers.current) {
        if (data.state) entries.push({ id, data });
    }

    return (
        <group>
            {entries.map(({ id, data }) => (
                <RemotePlane key={id} playerId={id} playerData={data} />
            ))}
        </group>
    );
}
