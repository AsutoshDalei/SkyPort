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
            {/* Fuselage — rounded cylinder */}
            <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.55, 0.55, 5.5, 8]} />
                <meshStandardMaterial color="#c8ccd4" metalness={0.35} roughness={0.45} />
            </mesh>

            {/* Nose cone — tapered */}
            <mesh position={[0, 0, -3.2]} castShadow rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[0.55, 1.5, 8]} />
                <meshStandardMaterial color="#b8c0cc" metalness={0.4} roughness={0.4} />
            </mesh>

            {/* Cockpit windshield */}
            <mesh position={[0, 0.35, -2.0]} castShadow>
                <boxGeometry args={[0.7, 0.35, 1.0]} />
                <meshStandardMaterial color="#2080c8" metalness={0.6} roughness={0.2} transparent opacity={0.75} />
            </mesh>

            {/* Main wings — swept back, tapered */}
            <mesh position={[0, -0.05, 0.2]} castShadow>
                <boxGeometry args={[12, 0.1, 2.0]} />
                <meshStandardMaterial color="#d0d4dc" metalness={0.25} roughness={0.55} />
            </mesh>
            {/* Wing tips — tapered outer sections */}
            <mesh position={[-6.3, -0.02, 0.4]} castShadow>
                <boxGeometry args={[1, 0.08, 1.4]} />
                <meshStandardMaterial color="#d0d4dc" metalness={0.25} roughness={0.55} />
            </mesh>
            <mesh position={[6.3, -0.02, 0.4]} castShadow>
                <boxGeometry args={[1, 0.08, 1.4]} />
                <meshStandardMaterial color="#d0d4dc" metalness={0.25} roughness={0.55} />
            </mesh>

            {/* Wing tip nav lights */}
            <mesh position={[-6.9, 0, 0.4]}>
                <sphereGeometry args={[0.12, 6, 6]} />
                <meshStandardMaterial color="#ff2020" emissive="#ff2020" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[6.9, 0, 0.4]}>
                <sphereGeometry args={[0.12, 6, 6]} />
                <meshStandardMaterial color="#20ff20" emissive="#20ff20" emissiveIntensity={0.8} />
            </mesh>

            {/* Underwing flaps */}
            <mesh position={[-2.5, -0.15, 0.9]} castShadow>
                <boxGeometry args={[3, 0.06, 0.5]} />
                <meshStandardMaterial color="#a8b0b8" roughness={0.6} />
            </mesh>
            <mesh position={[2.5, -0.15, 0.9]} castShadow>
                <boxGeometry args={[3, 0.06, 0.5]} />
                <meshStandardMaterial color="#a8b0b8" roughness={0.6} />
            </mesh>

            {/* Vertical stabilizer (tail fin) */}
            <mesh position={[0, 1.1, 2.5]} castShadow>
                <boxGeometry args={[0.1, 2.2, 1.4]} />
                <meshStandardMaterial color="#c8ccd4" metalness={0.25} roughness={0.55} />
            </mesh>
            {/* Rudder accent */}
            <mesh position={[0, 1.5, 2.9]}>
                <boxGeometry args={[0.12, 1.2, 0.4]} />
                <meshStandardMaterial color="#d04040" roughness={0.5} />
            </mesh>

            {/* Horizontal stabilizers */}
            <mesh position={[0, 0.2, 2.5]} castShadow>
                <boxGeometry args={[4.5, 0.08, 0.9]} />
                <meshStandardMaterial color="#d0d4dc" metalness={0.25} roughness={0.55} />
            </mesh>

            {/* Engine pods — turbofan style */}
            {[-2.8, 2.8].map((xOff, i) => (
                <group key={`eng-${i}`} position={[xOff, -0.45, 0]}>
                    {/* Nacelle body */}
                    <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[0.38, 0.32, 1.8, 8]} />
                        <meshStandardMaterial color="#505860" metalness={0.5} roughness={0.35} />
                    </mesh>
                    {/* Intake ring */}
                    <mesh position={[0, 0, -0.95]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[0.35, 0.05, 6, 12]} />
                        <meshStandardMaterial color="#404850" metalness={0.6} roughness={0.3} />
                    </mesh>
                    {/* Fan face */}
                    <mesh position={[0, 0, -0.9]} rotation={[0, 0, 0]}>
                        <circleGeometry args={[0.32, 8]} />
                        <meshStandardMaterial color="#303840" metalness={0.4} roughness={0.5} />
                    </mesh>
                    {/* Pylon (connects engine to wing) */}
                    <mesh position={[0, 0.25, 0]}>
                        <boxGeometry args={[0.08, 0.4, 1.0]} />
                        <meshStandardMaterial color="#b0b8c0" roughness={0.5} />
                    </mesh>
                </group>
            ))}

            {/* Landing gear — nose */}
            <mesh position={[0, -0.7, -1.8]}>
                <cylinderGeometry args={[0.04, 0.04, 0.5, 4]} />
                <meshStandardMaterial color="#606060" />
            </mesh>
            <mesh position={[0, -0.95, -1.8]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.12, 0.12, 0.15, 8]} />
                <meshStandardMaterial color="#303030" roughness={0.9} />
            </mesh>

            {/* Landing gear — main (under wings) */}
            {[-1.5, 1.5].map((xOff, i) => (
                <group key={`gear-${i}`}>
                    <mesh position={[xOff, -0.65, 0.3]}>
                        <cylinderGeometry args={[0.04, 0.04, 0.6, 4]} />
                        <meshStandardMaterial color="#606060" />
                    </mesh>
                    <mesh position={[xOff, -0.95, 0.3]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[0.15, 0.15, 0.18, 8]} />
                        <meshStandardMaterial color="#303030" roughness={0.9} />
                    </mesh>
                </group>
            ))}

            {/* Belly panel stripe */}
            <mesh position={[0, -0.55, 0]} rotation={[0, 0, 0]}>
                <boxGeometry args={[1.0, 0.02, 4.5]} />
                <meshStandardMaterial color="#a0a8b0" roughness={0.6} />
            </mesh>

            {/* Tail strobe light */}
            <mesh position={[0, 0, 2.9]}>
                <sphereGeometry args={[0.08, 4, 4]} />
                <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.0} />
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

        /* ── Altitude — gravity + lift + pitch ────────────────────── */
        if (!isOnGround) {
            // Constant gravity pull
            const CONST_GRAVITY = 8;
            pos.current.y -= CONST_GRAVITY * dt;

            // Lift from speed — counteracts gravity
            const liftFactor = Math.min(1, speed.current / 80); // full lift at 80 kts
            pos.current.y += CONST_GRAVITY * liftFactor * dt;

            // Pitch-based climb/descent
            const climbRate = pitch.current * PITCH_RATE * speed.current * 0.006 * dt * 60;
            pos.current.y += climbRate;

            // Extra stall sink when very slow
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
