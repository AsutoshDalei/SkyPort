import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/* ── Seeded random ───────────────────────────────────────────── */
function seededRandom(seed) {
    let s = seed;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
}

/* ── Perlin-style noise ──────────────────────────────────────── */
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function nlerp(a, b, t) { return a + t * (b - a); }

function makeNoise2D(seed) {
    const rng = seededRandom(seed);
    const perm = Array.from({ length: 512 }, () => Math.floor(rng() * 256));
    const grad = Array.from({ length: 256 }, () => {
        const a = rng() * Math.PI * 2;
        return [Math.cos(a), Math.sin(a)];
    });

    return (x, y) => {
        const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255;
        const xf = x - Math.floor(x), yf = y - Math.floor(y);
        const u = fade(xf), v = fade(yf);
        const dot = (ix, iy, fx, fy) => {
            const g = grad[perm[(perm[ix & 255] + iy) & 255] & 255];
            return g[0] * fx + g[1] * fy;
        };
        return nlerp(
            nlerp(dot(xi, yi, xf, yf), dot(xi + 1, yi, xf - 1, yf), u),
            nlerp(dot(xi, yi + 1, xf, yf - 1), dot(xi + 1, yi + 1, xf - 1, yf - 1), u),
            v
        );
    };
}

const noise = makeNoise2D(999);

/* ── Landing zones (runways where safe landing is allowed) ──── */
// Each zone: center position + half-extents along the runway's local axes
// Airport at (-450, -100) rotation 0.15 — runway 350×32
// Airstrip at (600, 500) rotation -0.3 — strip 200×16
export const LANDING_ZONES = [
    { cx: -450, cz: -100, halfLen: 180, halfWid: 20, rotation: 0.15, label: 'Airport' },
    { cx: 600, cz: 500, halfLen: 105, halfWid: 12, rotation: -0.3, label: 'Airstrip' },
];

export function isOnRunway(x, z) {
    for (const zone of LANDING_ZONES) {
        // Rotate point into runway's local space
        const dx = x - zone.cx;
        const dz = z - zone.cz;
        const cos = Math.cos(-zone.rotation);
        const sin = Math.sin(-zone.rotation);
        const localX = dx * cos - dz * sin;
        const localZ = dx * sin + dz * cos;
        if (Math.abs(localX) < zone.halfLen && Math.abs(localZ) < zone.halfWid) {
            return zone.label;
        }
    }
    return null;
}

/* ── Spawn point (airport runway start) ──────────────────────── */
export const SPAWN_POINT = { x: -450 + 140 * Math.cos(0.15), y: 50, z: -100 - 140 * Math.sin(0.15), yaw: -0.15 };

/* ── Flat zones (airports, city center) ──────────────────────── */
const FLAT_ZONES = [
    { x: 0, z: 0, r: 420 },          // City center
    { x: -450, z: -100, r: 350 },     // Airport — larger radius
    { x: 600, z: 500, r: 220 },       // Airstrip
];

function flatZoneFactor(x, z) {
    let minFactor = 1;
    for (const zone of FLAT_ZONES) {
        const dist = Math.sqrt((x - zone.x) ** 2 + (z - zone.z) ** 2) / zone.r;
        if (dist < 1) {
            // Quartic ease — extremely flat in core, smooth transition at edge
            const f = dist * dist * dist * dist;
            minFactor = Math.min(minFactor, f);
        }
    }
    return minFactor;
}

/* ── Height function ─────────────────────────────────────────── */
const MAP_HALF = 1500;
const BOUNDARY_START = 1100;

export function getHeight(x, z) {
    let h = 0;

    // Multi-octave terrain noise
    h += noise(x * 0.0015, z * 0.0015) * 50;
    h += noise(x * 0.005, z * 0.005) * 20;
    h += noise(x * 0.018, z * 0.018) * 6;

    // Gentle hills between city and villages
    const midDist = Math.sqrt(x * x + z * z);
    if (midDist > 350 && midDist < 900) {
        h += noise(x * 0.01, z * 0.01) * 15;
    }

    // Apply flat zone AFTER all terrain features (so nothing bleeds through)
    h *= flatZoneFactor(x, z);

    // Boundary mountains (ring around the edge)
    const edgeDist = Math.max(Math.abs(x), Math.abs(z));
    if (edgeDist > BOUNDARY_START) {
        const t = (edgeDist - BOUNDARY_START) / (MAP_HALF - BOUNDARY_START);
        const clampedT = Math.min(1, t);
        const boundaryH = clampedT * clampedT * 180;
        const bnoise = noise(x * 0.008, z * 0.008) * 40 * clampedT;
        h += boundaryH + bnoise;
    }

    return Math.max(-1, h);
}

/* ── Sky Dome ────────────────────────────────────────────────── */
function SkyDome() {
    const mat = useMemo(() => {
        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 512;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, '#0a0e1a');
        g.addColorStop(0.08, '#0f1528');
        g.addColorStop(0.20, '#1a2844');
        g.addColorStop(0.35, '#2a4a70');
        g.addColorStop(0.50, '#4a80b0');
        g.addColorStop(0.65, '#80b8e0');
        g.addColorStop(0.76, '#d0a870');
        g.addColorStop(0.84, '#e8c088');
        g.addColorStop(0.92, '#f0d8a0');
        g.addColorStop(1, '#ffeedd');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 4, 512);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    }, []);

    const meshRef = useRef();
    useFrame(({ camera }) => {
        if (meshRef.current) meshRef.current.position.copy(camera.position);
    });

    return (
        <mesh ref={meshRef} material={mat} renderOrder={-1}>
            <sphereGeometry args={[5000, 32, 48]} />
        </mesh>
    );
}

/* ── Clouds ──────────────────────────────────────────────────── */
function Clouds() {
    const clouds = useMemo(() => {
        const rng = seededRandom(42);
        const arr = [];
        for (let i = 0; i < 60; i++) {
            const x = (rng() - 0.5) * 3200;
            const z = (rng() - 0.5) * 3200;
            const y = 220 + rng() * 200;
            const sx = 40 + rng() * 80;
            const sy = 5 + rng() * 8;
            const sz = 25 + rng() * 50;
            const opacity = 0.3 + rng() * 0.35;
            arr.push({ pos: [x, y, z], scale: [sx, sy, sz], speed: 0.3 + rng() * 1.2, opacity });
        }
        return arr;
    }, []);

    const groupRef = useRef();
    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        groupRef.current.children.forEach((c, i) => {
            c.position.x = clouds[i].pos[0] + Math.sin(clock.elapsedTime * 0.015 * clouds[i].speed) * 30;
        });
    });

    return (
        <group ref={groupRef}>
            {clouds.map((c, i) => (
                <mesh key={i} position={c.pos}>
                    <boxGeometry args={c.scale} />
                    <meshStandardMaterial color="#e8e8f4" transparent opacity={c.opacity} roughness={1} />
                </mesh>
            ))}
        </group>
    );
}

/* ── Heightmapped Ground ─────────────────────────────────────── */
function Ground() {
    const geometry = useMemo(() => {
        const size = 3000;
        const seg = 250;
        const geo = new THREE.PlaneGeometry(size, size, seg, seg);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const grassLow = new THREE.Color('#3a6a30');
        const grassHigh = new THREE.Color('#5a8a40');
        const dirt = new THREE.Color('#7a6a4a');
        const rock = new THREE.Color('#8a8a80');
        const snow = new THREE.Color('#e0e0e8');
        const tmp = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const h = getHeight(x, z);
            pos.setY(i, h);

            if (h < 3) {
                tmp.copy(grassLow);
            } else if (h < 30) {
                tmp.lerpColors(grassLow, grassHigh, h / 30);
            } else if (h < 60) {
                tmp.lerpColors(grassHigh, dirt, (h - 30) / 30);
            } else if (h < 120) {
                tmp.lerpColors(dirt, rock, (h - 60) / 60);
            } else {
                tmp.lerpColors(rock, snow, Math.min(1, (h - 120) / 80));
            }
            const n = noise(x * 0.05, z * 0.05) * 0.06;
            tmp.r = Math.max(0, Math.min(1, tmp.r + n));
            tmp.g = Math.max(0, Math.min(1, tmp.g + n));
            tmp.b = Math.max(0, Math.min(1, tmp.b + n));

            colors[i * 3] = tmp.r;
            colors[i * 3 + 1] = tmp.g;
            colors[i * 3 + 2] = tmp.b;
        }

        geo.computeVertexNormals();
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geo;
    }, []);

    return (
        <mesh geometry={geometry} receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.9} />
        </mesh>
    );
}

/* ── City Buildings (bigger city) ────────────────────────────── */
function Buildings() {
    const buildings = useMemo(() => {
        const rng = seededRandom(123);
        const arr = [];

        const bodyColors = [
            '#c8c0b8', '#b0a898', '#d0ccc4', '#a8a098', '#8890a0',
            '#90989c', '#b8b0a0', '#989088', '#707880', '#a0a8b0',
        ];
        const accentColors = ['#405060', '#304050', '#505848', '#604840', '#384858'];
        const windowColors = ['#a0c0e0', '#b8d0e8', '#90b0d0', '#c8d8e8'];

        // Bigger city grid: 4x4 blocks
        for (let bx = -4; bx <= 4; bx++) {
            for (let bz = -4; bz <= 4; bz++) {
                const cx = bx * 70;
                const cz = bz * 70;

                // More buildings in center, fewer at edges
                const distFromCenter = Math.sqrt(bx * bx + bz * bz);
                const numBuildings = Math.max(1, Math.floor(5 - distFromCenter * 0.5) + Math.floor(rng() * 3));
                const maxH = distFromCenter < 2 ? 120 : distFromCenter < 3 ? 80 : 50;

                for (let i = 0; i < numBuildings; i++) {
                    const x = cx + (rng() - 0.5) * 50;
                    const z = cz + (rng() - 0.5) * 50;
                    const baseH = getHeight(x, z);

                    const w = 7 + rng() * 12;
                    const h = 15 + rng() * maxH;
                    const d = 7 + rng() * 12;
                    const bodyColor = pick(bodyColors, rng);
                    const accentColor = pick(accentColors, rng);
                    const windowColor = pick(windowColors, rng);
                    const type = h > 80 ? 'skyscraper' : h > 40 ? 'office' : 'low';

                    arr.push({ x, z, baseH, w, h, d, bodyColor, accentColor, windowColor, type });
                }
            }
        }
        return arr;
    }, []);

    return (
        <group>
            {buildings.map((b, i) => (
                <group key={i} position={[b.x, b.baseH + b.h / 2, b.z]}>
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[b.w, b.h, b.d]} />
                        <meshStandardMaterial color={b.bodyColor} roughness={0.7} metalness={0.1} />
                    </mesh>

                    {/* Window rows */}
                    {Array.from({ length: Math.min(Math.floor(b.h / 6), 14) }, (_, fi) => (
                        <group key={`w-${fi}`}>
                            <mesh position={[0, -b.h / 2 + 4 + fi * 6, b.d / 2 + 0.05]}>
                                <planeGeometry args={[b.w * 0.8, 1.6]} />
                                <meshStandardMaterial color={b.windowColor} emissive={b.windowColor} emissiveIntensity={0.12} roughness={0.2} metalness={0.5} />
                            </mesh>
                            <mesh position={[0, -b.h / 2 + 4 + fi * 6, -b.d / 2 - 0.05]} rotation={[0, Math.PI, 0]}>
                                <planeGeometry args={[b.w * 0.8, 1.6]} />
                                <meshStandardMaterial color={b.windowColor} emissive={b.windowColor} emissiveIntensity={0.12} roughness={0.2} metalness={0.5} />
                            </mesh>
                        </group>
                    ))}

                    {/* Roof ledge */}
                    <mesh position={[0, b.h / 2 + 0.4, 0]}>
                        <boxGeometry args={[b.w + 0.6, 0.8, b.d + 0.6]} />
                        <meshStandardMaterial color={b.accentColor} roughness={0.6} />
                    </mesh>

                    {b.type === 'skyscraper' && (
                        <mesh position={[0, b.h / 2 + 7, 0]}>
                            <cylinderGeometry args={[0.12, 0.12, 13, 4]} />
                            <meshStandardMaterial color="#606060" metalness={0.7} roughness={0.3} />
                        </mesh>
                    )}
                    {b.type === 'office' && (
                        <mesh position={[b.w * 0.2, b.h / 2 + 1.5, b.d * 0.2]}>
                            <boxGeometry args={[2.5, 2.5, 2.5]} />
                            <meshStandardMaterial color="#808080" roughness={0.8} />
                        </mesh>
                    )}
                </group>
            ))}
        </group>
    );
}

/* ── Villages / scattered homes ──────────────────────────────── */
function Villages() {
    const homes = useMemo(() => {
        const rng = seededRandom(789);
        const arr = [];

        // Village clusters at specific locations
        const villages = [
            { cx: 600, cz: 500, count: 12, spread: 100, label: 'Hillside Village' },
            { cx: -700, cz: 500, count: 8, spread: 80, label: 'Lake Village' },
            { cx: 500, cz: -500, count: 10, spread: 90, label: 'Valley Hamlet' },
            { cx: -400, cz: -600, count: 6, spread: 60, label: 'Mountain View' },
            { cx: 800, cz: 0, count: 7, spread: 70, label: 'Eastside' },
        ];

        // Scattered individual homes
        for (let i = 0; i < 35; i++) {
            const x = (rng() - 0.5) * 2200;
            const z = (rng() - 0.5) * 2200;
            const cityDist = Math.sqrt(x * x + z * z);
            if (cityDist < 400) continue;
            const edgeDist = Math.max(Math.abs(x), Math.abs(z));
            if (edgeDist > 1050) continue;
            const baseH = getHeight(x, z);
            if (baseH > 80) continue;

            const w = 4 + rng() * 4;
            const h = 3 + rng() * 4;
            const d = 4 + rng() * 4;
            const color = pick(['#c8b8a0', '#b8a888', '#a89878', '#d0c0a8', '#e0d0b8'], rng);
            const roofColor = pick(['#8a4030', '#6a5040', '#905838', '#7a6050'], rng);

            arr.push({ x, z, baseH, w, h, d, color, roofColor });
        }

        // Village clusters
        for (const v of villages) {
            for (let i = 0; i < v.count; i++) {
                const x = v.cx + (rng() - 0.5) * v.spread;
                const z = v.cz + (rng() - 0.5) * v.spread;
                const baseH = getHeight(x, z);
                if (baseH > 80) continue;

                const w = 4 + rng() * 5;
                const h = 3 + rng() * 5;
                const d = 4 + rng() * 5;
                const color = pick(['#c8b8a0', '#b8a888', '#d0c0a8', '#e0d0b8'], rng);
                const roofColor = pick(['#8a4030', '#6a5040', '#905838', '#7a6050'], rng);

                arr.push({ x, z, baseH, w, h, d, color, roofColor });
            }
        }
        return arr;
    }, []);

    return (
        <group>
            {homes.map((h, i) => (
                <group key={i} position={[h.x, h.baseH, h.z]}>
                    {/* House body */}
                    <mesh position={[0, h.h / 2, 0]} castShadow receiveShadow>
                        <boxGeometry args={[h.w, h.h, h.d]} />
                        <meshStandardMaterial color={h.color} roughness={0.85} />
                    </mesh>
                    {/* Pitched roof */}
                    <mesh position={[0, h.h + 1, 0]} castShadow rotation={[0, 0, 0]}>
                        <coneGeometry args={[Math.max(h.w, h.d) * 0.75, 2.5, 4]} />
                        <meshStandardMaterial color={h.roofColor} roughness={0.8} />
                    </mesh>
                    {/* Door */}
                    <mesh position={[0, h.h * 0.25, h.d / 2 + 0.05]}>
                        <planeGeometry args={[1.2, h.h * 0.5]} />
                        <meshStandardMaterial color="#4a3020" roughness={0.9} />
                    </mesh>
                    {/* Windows */}
                    <mesh position={[h.w * 0.25, h.h * 0.6, h.d / 2 + 0.05]}>
                        <planeGeometry args={[1, 1]} />
                        <meshStandardMaterial color="#a8c8e0" emissive="#a8c8e0" emissiveIntensity={0.1} roughness={0.3} />
                    </mesh>
                    <mesh position={[-h.w * 0.25, h.h * 0.6, h.d / 2 + 0.05]}>
                        <planeGeometry args={[1, 1]} />
                        <meshStandardMaterial color="#a8c8e0" emissive="#a8c8e0" emissiveIntensity={0.1} roughness={0.3} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

/* ── Trees ───────────────────────────────────────────────────── */
function Trees() {
    const trees = useMemo(() => {
        const rng = seededRandom(456);
        const arr = [];
        for (let i = 0; i < 400; i++) {
            const x = (rng() - 0.5) * 2600;
            const z = (rng() - 0.5) * 2600;

            // Skip flat zones
            const cityDist = Math.sqrt(x * x + z * z);
            if (cityDist < 320) continue;
            const ap1 = Math.sqrt((x + 450) ** 2 + (z + 100) ** 2);
            if (ap1 < 240) continue;
            const ap2 = Math.sqrt((x - 600) ** 2 + (z - 500) ** 2);
            if (ap2 < 160) continue;
            const edgeDist = Math.max(Math.abs(x), Math.abs(z));
            if (edgeDist > 1200) continue;

            const baseH = getHeight(x, z);
            if (baseH > 100) continue;

            const type = rng() < 0.45 ? 'pine' : rng() < 0.7 ? 'oak' : 'bush';
            const h = type === 'pine' ? (8 + rng() * 10) : type === 'oak' ? (5 + rng() * 7) : (2 + rng() * 3);
            const r = type === 'pine' ? (2 + rng() * 3) : type === 'oak' ? (3.5 + rng() * 4) : (1.5 + rng() * 2.5);
            const green = type === 'pine' ? '#1a5a20' : type === 'oak' ? '#2a7a30' : '#3a8a28';

            arr.push({ x, z, baseH, h, r, type, green });
        }
        return arr;
    }, []);

    return (
        <group>
            {trees.map((t, i) => (
                <group key={i} position={[t.x, t.baseH, t.z]}>
                    {t.type === 'pine' && (
                        <>
                            <mesh position={[0, t.h * 0.25, 0]} castShadow>
                                <cylinderGeometry args={[0.3, 0.5, t.h * 0.5, 5]} />
                                <meshStandardMaterial color="#4a3020" roughness={0.9} />
                            </mesh>
                            <mesh position={[0, t.h * 0.55, 0]} castShadow>
                                <coneGeometry args={[t.r, t.h * 0.5, 6]} />
                                <meshStandardMaterial color={t.green} roughness={0.8} />
                            </mesh>
                            <mesh position={[0, t.h * 0.78, 0]} castShadow>
                                <coneGeometry args={[t.r * 0.65, t.h * 0.3, 6]} />
                                <meshStandardMaterial color={t.green} roughness={0.8} />
                            </mesh>
                        </>
                    )}
                    {t.type === 'oak' && (
                        <>
                            <mesh position={[0, t.h * 0.3, 0]} castShadow>
                                <cylinderGeometry args={[0.35, 0.55, t.h * 0.6, 5]} />
                                <meshStandardMaterial color="#5a3a1a" roughness={0.9} />
                            </mesh>
                            <mesh position={[0, t.h * 0.65, 0]} castShadow>
                                <sphereGeometry args={[t.r, 6, 5]} />
                                <meshStandardMaterial color={t.green} roughness={0.85} />
                            </mesh>
                        </>
                    )}
                    {t.type === 'bush' && (
                        <mesh position={[0, t.h * 0.5, 0]} castShadow>
                            <sphereGeometry args={[t.r, 5, 4]} />
                            <meshStandardMaterial color={t.green} roughness={0.9} />
                        </mesh>
                    )}
                </group>
            ))}
        </group>
    );
}

/* ── Roads ───────────────────────────────────────────────────── */
function Roads() {
    const roads = useMemo(() => {
        const arr = [];
        // City grid
        for (let i = -4; i <= 4; i++) {
            arr.push({ pos: [0, 0.4, i * 70], rot: 0, len: 650, w: 9 });
            arr.push({ pos: [i * 70, 0.4, 0], rot: Math.PI / 2, len: 650, w: 9 });
        }
        // Road to airport
        arr.push({ pos: [-225, 0.4, -50], rot: Math.atan2(-100, -450) + Math.PI / 2, len: 280, w: 7 });
        // Road to eastern village (toward airstrip)
        arr.push({ pos: [300, 0.4, 250], rot: Math.atan2(500, 600), len: 400, w: 5 });
        return arr;
    }, []);

    return (
        <group>
            {roads.map((r, i) => (
                <group key={i}>
                    <mesh position={r.pos} rotation={[-Math.PI / 2, 0, r.rot]} receiveShadow>
                        <planeGeometry args={[r.len, r.w]} />
                        <meshStandardMaterial color="#3a3a42" roughness={0.95} />
                    </mesh>
                    <mesh position={[r.pos[0], r.pos[1] + 0.05, r.pos[2]]} rotation={[-Math.PI / 2, 0, r.rot]}>
                        <planeGeometry args={[r.len, 0.35]} />
                        <meshStandardMaterial color="#e0c840" roughness={0.8} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

/* ── Airport (full, near city) ───────────────────────────────── */
function Airport({ position, rotation = 0 }) {
    const baseH = getHeight(position[0], position[2]);

    return (
        <group position={[position[0], baseH + 0.1, position[2]]} rotation={[0, rotation, 0]}>
            {/* Main runway */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[350, 32]} />
                <meshStandardMaterial color="#2a2a2e" roughness={0.85} />
            </mesh>
            {/* Center line */}
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[330, 1]} />
                <meshStandardMaterial color="#e0e0e0" roughness={0.8} />
            </mesh>
            {/* Threshold markings */}
            {[-160, 160].map((xOff, i) => (
                <group key={`th-${i}`}>
                    {Array.from({ length: 6 }, (_, j) => (
                        <mesh key={j} position={[xOff, 0.05, -8 + j * 3.2]} rotation={[-Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[8, 1.2]} />
                            <meshStandardMaterial color="#e0e0e0" roughness={0.8} />
                        </mesh>
                    ))}
                </group>
            ))}
            {/* Taxiway */}
            <mesh position={[0, 0.03, 28]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[220, 14]} />
                <meshStandardMaterial color="#383838" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.08, 28]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[220, 0.4]} />
                <meshStandardMaterial color="#d0b020" roughness={0.8} />
            </mesh>
            {/* Terminal */}
            <mesh position={[0, 12, 55]} castShadow receiveShadow>
                <boxGeometry args={[90, 24, 35]} />
                <meshStandardMaterial color="#b8b8c0" roughness={0.6} metalness={0.1} />
            </mesh>
            <mesh position={[0, 14, 37.1]}>
                <planeGeometry args={[80, 12]} />
                <meshStandardMaterial color="#80b8e0" emissive="#80b8e0" emissiveIntensity={0.08} roughness={0.2} metalness={0.5} />
            </mesh>
            <mesh position={[0, 24.5, 55]}>
                <boxGeometry args={[94, 1, 39]} />
                <meshStandardMaterial color="#606068" roughness={0.5} />
            </mesh>
            {/* Hangars */}
            {[-65, 65].map((xOff, i) => (
                <group key={`h-${i}`} position={[xOff, 0, 60]}>
                    <mesh position={[0, 9, 0]} castShadow receiveShadow>
                        <boxGeometry args={[32, 18, 26]} />
                        <meshStandardMaterial color="#808890" roughness={0.7} />
                    </mesh>
                    <mesh position={[0, 7, -13.1]}>
                        <planeGeometry args={[26, 14]} />
                        <meshStandardMaterial color="#504830" roughness={0.9} />
                    </mesh>
                </group>
            ))}
            {/* Control tower */}
            <mesh position={[55, 16, 45]} castShadow>
                <cylinderGeometry args={[3, 4, 32, 8]} />
                <meshStandardMaterial color="#a0a0a0" roughness={0.6} />
            </mesh>
            <mesh position={[55, 34, 45]} castShadow>
                <cylinderGeometry args={[5, 4, 5, 8]} />
                <meshStandardMaterial color="#70a8d0" roughness={0.3} metalness={0.4} transparent opacity={0.8} />
            </mesh>
            <mesh position={[55, 37, 45]}>
                <cylinderGeometry args={[5.5, 5.5, 1, 8]} />
                <meshStandardMaterial color="#606060" roughness={0.5} />
            </mesh>
            {/* Runway lights */}
            {Array.from({ length: 22 }, (_, i) => {
                const xP = -168 + i * 16;
                return (
                    <group key={`rl-${i}`}>
                        <mesh position={[xP, 0.4, 16.5]}>
                            <sphereGeometry args={[0.25, 4, 4]} />
                            <meshStandardMaterial color="#80e080" emissive="#80e080" emissiveIntensity={0.5} />
                        </mesh>
                        <mesh position={[xP, 0.4, -16.5]}>
                            <sphereGeometry args={[0.25, 4, 4]} />
                            <meshStandardMaterial color="#80e080" emissive="#80e080" emissiveIntensity={0.5} />
                        </mesh>
                    </group>
                );
            })}
            {/* Approach lights */}
            {Array.from({ length: 8 }, (_, i) => (
                <mesh key={`ap-${i}`} position={[-175 - i * 10, 0.6, 0]}>
                    <sphereGeometry args={[0.35, 4, 4]} />
                    <meshStandardMaterial color="#f0f0f0" emissive="#f0f0f0" emissiveIntensity={0.5} />
                </mesh>
            ))}
        </group>
    );
}

/* ── Airstrip (small, near village) ──────────────────────────── */
function Airstrip({ position, rotation = 0 }) {
    const baseH = getHeight(position[0], position[2]);

    return (
        <group position={[position[0], baseH + 0.1, position[2]]} rotation={[0, rotation, 0]}>
            {/* Grass runway */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[200, 16]} />
                <meshStandardMaterial color="#4a5a3a" roughness={0.95} />
            </mesh>
            {/* Paved center strip */}
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[190, 8]} />
                <meshStandardMaterial color="#505050" roughness={0.9} />
            </mesh>
            {/* Center dashes */}
            {Array.from({ length: 15 }, (_, i) => (
                <mesh key={`d-${i}`} position={[-90 + i * 13, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[6, 0.3]} />
                    <meshStandardMaterial color="#d0d0d0" roughness={0.8} />
                </mesh>
            ))}
            {/* Threshold numbers */}
            <mesh position={[-92, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[4, 4]} />
                <meshStandardMaterial color="#d0d0d0" roughness={0.8} />
            </mesh>
            <mesh position={[92, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[4, 4]} />
                <meshStandardMaterial color="#d0d0d0" roughness={0.8} />
            </mesh>
            {/* Small shed/hangar */}
            <mesh position={[30, 4, 16]} castShadow receiveShadow>
                <boxGeometry args={[14, 8, 12]} />
                <meshStandardMaterial color="#909898" roughness={0.8} />
            </mesh>
            <mesh position={[30, 4, 9.9]}>
                <planeGeometry args={[10, 6]} />
                <meshStandardMaterial color="#504830" roughness={0.9} />
            </mesh>
            {/* Windsock pole */}
            <mesh position={[-50, 4, 12]}>
                <cylinderGeometry args={[0.1, 0.1, 8, 4]} />
                <meshStandardMaterial color="#808080" />
            </mesh>
            <mesh position={[-49, 7.5, 12]} rotation={[0, 0, Math.PI / 6]}>
                <coneGeometry args={[0.5, 2, 4]} />
                <meshStandardMaterial color="#f06030" roughness={0.8} />
            </mesh>
            {/* Edge markers */}
            {Array.from({ length: 12 }, (_, i) => {
                const xP = -90 + i * 16.4;
                return (
                    <group key={`em-${i}`}>
                        <mesh position={[xP, 0.3, 8.5]}>
                            <sphereGeometry args={[0.2, 4, 4]} />
                            <meshStandardMaterial color="#f0f0f0" emissive="#f0e0a0" emissiveIntensity={0.3} />
                        </mesh>
                        <mesh position={[xP, 0.3, -8.5]}>
                            <sphereGeometry args={[0.2, 4, 4]} />
                            <meshStandardMaterial color="#f0f0f0" emissive="#f0e0a0" emissiveIntensity={0.3} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
}

/* ── Water ───────────────────────────────────────────────────── */
function Water() {
    const ref = useRef();
    useFrame(({ clock }) => {
        if (ref.current) ref.current.position.y = -2 + Math.sin(clock.elapsedTime * 0.3) * 0.4;
    });

    return (
        <group>
            <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[-700, -2, 500]} receiveShadow>
                <circleGeometry args={[60, 20]} />
                <meshStandardMaterial color="#1a4a7a" transparent opacity={0.65} roughness={0.2} metalness={0.3} />
            </mesh>
        </group>
    );
}

/* ── Main Terrain ────────────────────────────────────────────── */
export default function Terrain() {
    return (
        <group>
            <SkyDome />
            <Clouds />

            {/* Lighting */}
            <ambientLight color="#6080a0" intensity={0.5} />
            <directionalLight
                color="#f0c080"
                intensity={1.4}
                position={[400, 300, -300]}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-far={2500}
                shadow-camera-left={-800}
                shadow-camera-right={800}
                shadow-camera-top={800}
                shadow-camera-bottom={-800}
            />
            <directionalLight color="#4060a0" intensity={0.3} position={[-200, 100, 200]} />
            <hemisphereLight skyColor="#6090c0" groundColor="#3a4a30" intensity={0.5} />

            <fog attach="fog" args={['#8aaccc', 500, 3000]} />

            <Ground />
            <Roads />
            <Buildings />
            <Villages />
            <Trees />
            <Water />

            {/* Airport near city */}
            <Airport position={[-450, 0, -100]} rotation={0.15} />

            {/* Airstrip near eastern village */}
            <Airstrip position={[600, 0, 500]} rotation={-0.3} />
        </group>
    );
}
