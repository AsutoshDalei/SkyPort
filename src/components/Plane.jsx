import React, { useRef, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getHeight } from './Terrain.jsx';

/* ── Constants ───────────────────────────────────────────────── */
const DEFAULT_SPEED = 60;
const MIN_SPEED = 0;
const MAX_SPEED = 200;
const MAX_ALT = 450;
const GROUND_CLEARANCE = 2;
const STALL_SPEED = 30;       // Below this, plane loses lift
const GRAVITY = 12;           // Gentle descent when stalled
const AIR_DRAG = 4;           // Natural speed decay in air (units/s²)
const GROUND_FRICTION = 18;   // Speed decay on ground
const GROUND_BRAKE = 35;      // Brake with S on ground

const PITCH_RATE = 0.8;       // Vertical climb factor (was 1.8 — much slower now)
const PITCH_RESPONSE = 3.5;   // How fast pitch angle changes (smoothing)
const ROLL_RESPONSE = 4.0;    // How fast bank angle changes

const ROLL_YAW_COUPLING = 0.4;
const MAX_BANK = 0.55;        // Max bank angle (~31°)
const MAX_PITCH = 0.35;       // Max pitch angle (~20°)
const THROTTLE_ACCEL = 30;    // Slower throttle response

/* ── Pre-allocated vectors ───────────────────────────────────── */
const _fwd = new THREE.Vector3();

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
    const onGround = useRef(false);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);
        const k = keys.current;

        // Get ground height at current position
        const groundH = getHeight(pos.current.x, pos.current.z) + GROUND_CLEARANCE;
        const isOnGround = pos.current.y <= groundH + 0.5;
        onGround.current = isOnGround;

        /* ── Throttle ────────────────────────────────────────────── */
        if (k['KeyW']) {
            speed.current = Math.min(MAX_SPEED, speed.current + THROTTLE_ACCEL * dt);
        }
        if (k['KeyS']) {
            if (isOnGround) {
                speed.current = Math.max(0, speed.current - GROUND_BRAKE * dt);
            } else {
                speed.current = Math.max(MIN_SPEED, speed.current - THROTTLE_ACCEL * dt);
            }
        }

        // Natural air drag (always slows slightly without throttle)
        if (!isOnGround && !k['KeyW']) {
            speed.current = Math.max(0, speed.current - AIR_DRAG * dt);
        }

        // Ground friction
        if (isOnGround && !k['KeyW']) {
            speed.current = Math.max(0, speed.current - GROUND_FRICTION * dt);
        }

        /* ── Pitch (smooth, gradual) ─────────────────────────────── */
        let pitchInput = 0;
        if (!isOnGround || speed.current > STALL_SPEED) {
            if (k['ArrowUp']) pitchInput = 1;
            if (k['ArrowDown']) pitchInput = -1;
        }
        pitch.current += (pitchInput * MAX_PITCH - pitch.current) * PITCH_RESPONSE * dt;

        /* ── Roll → yaw (smoother coupling) ──────────────────────── */
        let rollInput = 0;
        if (k['ArrowLeft']) rollInput = 1;
        if (k['ArrowRight']) rollInput = -1;

        const rollScale = isOnGround ? 0.25 : 1;
        bank.current += (rollInput * MAX_BANK * rollScale - bank.current) * ROLL_RESPONSE * dt;

        // Yaw from bank (more gradual, speed-dependent)
        const yawCoupling = ROLL_YAW_COUPLING * (speed.current / 100);
        yaw.current += bank.current * yawCoupling * dt;

        /* ── Forward movement ────────────────────────────────────── */
        _fwd.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
        pos.current.addScaledVector(_fwd, speed.current * dt);

        /* ── Altitude (much gentler now) ─────────────────────────── */
        if (!isOnGround) {
            // Climb/descent from pitch — reduced multiplier (0.006 instead of 0.015)
            const climbRate = pitch.current * PITCH_RATE * speed.current * 0.006 * dt * 60;
            pos.current.y += climbRate;

            // Stall: gentle descent when too slow
            if (speed.current < STALL_SPEED) {
                const stallFactor = 1 - (speed.current / STALL_SPEED);
                pos.current.y -= GRAVITY * stallFactor * stallFactor * dt;
            }
        }

        // Terrain following — snap to ground
        if (pos.current.y < groundH) {
            pos.current.y = groundH;
            if (pitch.current < 0) pitch.current *= 0.85;
        }

        pos.current.y = Math.min(MAX_ALT, pos.current.y);

        /* ── Apply to mesh ─────────────────────────────────────── */
        if (groupRef.current) {
            groupRef.current.position.copy(pos.current);
            groupRef.current.rotation.set(pitch.current, yaw.current, bank.current, 'YXZ');
        }

        /* ── HUD ─────────────────────────────────────────────────── */
        hudTimer.current += dt;
        if (hudTimer.current > 0.1 && onHud) {
            hudTimer.current = 0;
            onHud({
                speed: Math.round(speed.current),
                altitude: Math.round(pos.current.y - getHeight(pos.current.x, pos.current.z)),
                x: Math.round(pos.current.x),
                z: Math.round(pos.current.z),
                heading: yaw.current,
                pitch: pitch.current,
                bank: bank.current,
                grounded: isOnGround && speed.current < 2,
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
