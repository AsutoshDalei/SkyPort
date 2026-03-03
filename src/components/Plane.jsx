import React, { useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ── Constants ───────────────────────────────────────────────── */
const DEFAULT_SPEED = 60;
const MIN_SPEED = 20;
const MAX_SPEED = 200;
const MIN_ALT = 15;
const MAX_ALT = 600;

const PITCH_RATE = 1.8;     // radians/s
const ROLL_RATE = 2.2;      // radians/s

const ROLL_YAW_COUPLING = 0.6; // roll induces yaw
const MAX_BANK = 0.7;       // max visual bank angle
const MAX_PITCH = 0.6;      // max visual pitch angle
const THROTTLE_ACCEL = 40;  // speed units/s

/* ── Pre-allocated vectors ───────────────────────────────────── */
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/* ── Procedural Airplane Mesh ────────────────────────────────── */
function AirplaneMesh() {
    return (
        <group>
            {/* Fuselage */}
            <mesh castShadow>
                <boxGeometry args={[1.2, 0.8, 5]} />
                <meshStandardMaterial color="#c0c8d0" metalness={0.3} roughness={0.5} />
            </mesh>

            {/* Cockpit */}
            <mesh position={[0, 0.5, -1.5]} castShadow>
                <boxGeometry args={[0.8, 0.5, 1.2]} />
                <meshStandardMaterial color="#2080d0" metalness={0.5} roughness={0.3} transparent opacity={0.8} />
            </mesh>

            {/* Wings */}
            <mesh position={[0, 0, 0]} castShadow>
                <boxGeometry args={[10, 0.15, 1.8]} />
                <meshStandardMaterial color="#d0d8e0" metalness={0.2} roughness={0.6} />
            </mesh>

            {/* Wing tips (red) */}
            <mesh position={[-5.2, 0, 0]}>
                <boxGeometry args={[0.5, 0.15, 1.6]} />
                <meshStandardMaterial color="#e04040" />
            </mesh>
            <mesh position={[5.2, 0, 0]}>
                <boxGeometry args={[0.5, 0.15, 1.6]} />
                <meshStandardMaterial color="#40e040" />
            </mesh>

            {/* Tail vertical stabilizer */}
            <mesh position={[0, 1, 2.3]} castShadow>
                <boxGeometry args={[0.15, 2, 1.2]} />
                <meshStandardMaterial color="#c0c8d0" metalness={0.2} roughness={0.6} />
            </mesh>

            {/* Tail horizontal stabilizer */}
            <mesh position={[0, 0.3, 2.3]} castShadow>
                <boxGeometry args={[4, 0.12, 0.8]} />
                <meshStandardMaterial color="#d0d8e0" metalness={0.2} roughness={0.6} />
            </mesh>

            {/* Engine nacelles */}
            <mesh position={[-2.5, -0.3, -0.5]} castShadow>
                <cylinderGeometry args={[0.35, 0.35, 1.5, 8]} />
                <meshStandardMaterial color="#505860" metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[2.5, -0.3, -0.5]} castShadow>
                <cylinderGeometry args={[0.35, 0.35, 1.5, 8]} />
                <meshStandardMaterial color="#505860" metalness={0.5} roughness={0.4} />
            </mesh>

            {/* Propeller discs (decorative) */}
            <mesh position={[-2.5, -0.3, -1.35]} rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.5, 16]} />
                <meshStandardMaterial color="#303840" transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[2.5, -0.3, -1.35]} rotation={[Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.5, 16]} />
                <meshStandardMaterial color="#303840" transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

/* ── Plane Component ─────────────────────────────────────────── */
export default function Plane({ onHud, parentRef }) {
    const internalRef = useRef();
    const groupRef = parentRef || internalRef;
    const keys = useRef({});

    // Flight state
    const yaw = useRef(0);
    const pitch = useRef(0);
    const bank = useRef(0);
    const speed = useRef(DEFAULT_SPEED);
    const pos = useRef(new THREE.Vector3(0, 100, 300));

    // Keyboard input — attach to window, prevent default for arrow keys
    useEffect(() => {
        const down = (e) => {
            keys.current[e.code] = true;
            // Prevent arrow keys from scrolling the page
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
        };
        const up = (e) => { keys.current[e.code] = false; };
        window.addEventListener('keydown', down, { capture: true });
        window.addEventListener('keyup', up, { capture: true });
        return () => {
            window.removeEventListener('keydown', down, { capture: true });
            window.removeEventListener('keyup', up, { capture: true });
        };
    }, []);

    // HUD update throttle
    const hudTimer = useRef(0);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05); // cap delta to avoid spiral of death
        const k = keys.current;

        /* ── Throttle (W / S) ──────────────────────────────────── */
        if (k['KeyW']) speed.current = Math.min(MAX_SPEED, speed.current + THROTTLE_ACCEL * dt);
        if (k['KeyS']) speed.current = Math.max(MIN_SPEED, speed.current - THROTTLE_ACCEL * dt);

        /* ── Pitch (Arrow Up / Down) ───────────────────────────── */
        let pitchInput = 0;
        if (k['ArrowUp']) pitchInput = 1;
        if (k['ArrowDown']) pitchInput = -1;
        pitch.current += (pitchInput * MAX_PITCH - pitch.current) * 5 * dt;

        /* ── Roll (Arrow Left / Right) → coupled yaw ───────────── */
        let rollInput = 0;
        if (k['ArrowLeft']) rollInput = 1;
        if (k['ArrowRight']) rollInput = -1;
        bank.current += (rollInput * MAX_BANK - bank.current) * 5 * dt;

        // Roll induces yaw turn
        yaw.current += bank.current * ROLL_YAW_COUPLING * dt;



        /* ── Compute forward vector and move ───────────────────── */
        _fwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));

        // Altitude change from pitch
        pos.current.y += pitch.current * PITCH_RATE * speed.current * 0.015 * dt * 60;
        pos.current.y = Math.max(MIN_ALT, Math.min(MAX_ALT, pos.current.y));

        // Forward movement
        pos.current.addScaledVector(_fwd, speed.current * dt);

        /* ── Apply to mesh ─────────────────────────────────────── */
        if (groupRef.current) {
            groupRef.current.position.copy(pos.current);
            groupRef.current.rotation.set(pitch.current, yaw.current, bank.current, 'YXZ');
        }

        /* ── HUD callback (throttled to ~10Hz) ─────────────────── */
        hudTimer.current += dt;
        if (hudTimer.current > 0.1 && onHud) {
            hudTimer.current = 0;
            onHud({
                speed: Math.round(speed.current),
                altitude: Math.round(pos.current.y),
                x: Math.round(pos.current.x),
                z: Math.round(pos.current.z),
                heading: yaw.current,
                pitch: pitch.current,
                bank: bank.current,
            });
        }
    });

    return (
        <group ref={groupRef} position={[0, 100, 300]}>
            <AirplaneMesh />
            {/* point light on plane for night visibility */}
            <pointLight color="#ffffff" intensity={2} distance={30} position={[0, 1, -3]} />
            {/* Navigation lights */}
            <pointLight color="#ff0000" intensity={1} distance={15} position={[-5, 0, 0]} />
            <pointLight color="#00ff00" intensity={1} distance={15} position={[5, 0, 0]} />
        </group>
    );
}
