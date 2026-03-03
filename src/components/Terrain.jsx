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

/* ── Heightmap (Perlin-ish noise) ────────────────────────────── */
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }

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

        return lerp(
            lerp(dot(xi, yi, xf, yf), dot(xi + 1, yi, xf - 1, yf), u),
            lerp(dot(xi, yi + 1, xf, yf - 1), dot(xi + 1, yi + 1, xf - 1, yf - 1), u),
            v
        );
    };
}

/* ── Height function ─────────────────────────────────────────── */
const noise = makeNoise2D(999);

function getHeight(x, z) {
    // Multi-octave noise for natural terrain
    let h = 0;
    h += noise(x * 0.002, z * 0.002) * 80;     // broad hills
    h += noise(x * 0.006, z * 0.006) * 30;     // medium bumps
    h += noise(x * 0.02, z * 0.02) * 8;        // fine detail

    // Mountain ridge on the north side (z < -400)
    const mFactor = Math.max(0, (-z - 400) / 300);
    if (mFactor > 0) {
        h += mFactor * mFactor * 200;
        h += noise(x * 0.01, z * 0.01) * 60 * mFactor;
    }

    // Valley in center-east (x > 200, z around 0)
    const vDist = Math.sqrt(Math.pow((x - 300) / 200, 2) + Math.pow(z / 300, 2));
    if (vDist < 1) {
        h -= (1 - vDist) * (1 - vDist) * 40;
    }

    // Flatten city area (around origin)
    const cityDist = Math.sqrt(x * x + z * z) / 300;
    if (cityDist < 1) {
        h *= cityDist * cityDist;
    }

    // Flatten airport 1 area (x=-500, z=200)
    const ap1Dist = Math.sqrt(Math.pow(x + 500, 2) + Math.pow(z - 200, 2)) / 200;
    if (ap1Dist < 1) {
        h *= ap1Dist;
    }

    // Flatten airport 2 area (x=400, z=400)
    const ap2Dist = Math.sqrt(Math.pow(x - 400, 2) + Math.pow(z - 400, 2)) / 180;
    if (ap2Dist < 1) {
        h *= ap2Dist;
    }

    return h;
}

/* ── Sky Dome ────────────────────────────────────────────────── */
function SkyDome() {
    const mat = useMemo(() => {
        const c = document.createElement('canvas');
        c.width = 4;
        c.height = 512;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 512);
        // Dawn/golden-hour sky
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
            <sphereGeometry args={[4500, 32, 48]} />
        </mesh>
    );
}

/* ── Clouds ──────────────────────────────────────────────────── */
function Clouds() {
    const clouds = useMemo(() => {
        const rng = seededRandom(42);
        const arr = [];
        for (let i = 0; i < 60; i++) {
            const x = (rng() - 0.5) * 3000;
            const z = (rng() - 0.5) * 3000;
            const y = 200 + rng() * 200;
            const sx = 40 + rng() * 80;
            const sy = 6 + rng() * 10;
            const sz = 25 + rng() * 50;
            const opacity = 0.3 + rng() * 0.4;
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
    const { geometry, colorAttr } = useMemo(() => {
        const size = 3000;
        const seg = 200;
        const geo = new THREE.PlaneGeometry(size, size, seg, seg);
        geo.rotateX(-Math.PI / 2);

        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const grassLow = new THREE.Color('#3a6a30');
        const grassHigh = new THREE.Color('#5a8a40');
        const dirt = new THREE.Color('#6a5a3a');
        const rock = new THREE.Color('#7a7a7a');
        const snow = new THREE.Color('#e8e8f0');
        const tmp = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const h = getHeight(x, z);
            pos.setY(i, h);

            // Color by altitude
            if (h < 5) {
                tmp.copy(grassLow);
            } else if (h < 40) {
                tmp.lerpColors(grassLow, grassHigh, h / 40);
            } else if (h < 80) {
                tmp.lerpColors(grassHigh, dirt, (h - 40) / 40);
            } else if (h < 160) {
                tmp.lerpColors(dirt, rock, (h - 80) / 80);
            } else {
                tmp.lerpColors(rock, snow, Math.min(1, (h - 160) / 120));
            }
            // Slight noise variation
            const n = noise(x * 0.05, z * 0.05) * 0.08;
            tmp.r = Math.max(0, Math.min(1, tmp.r + n));
            tmp.g = Math.max(0, Math.min(1, tmp.g + n));
            tmp.b = Math.max(0, Math.min(1, tmp.b + n));

            colors[i * 3] = tmp.r;
            colors[i * 3 + 1] = tmp.g;
            colors[i * 3 + 2] = tmp.b;
        }

        geo.computeVertexNormals();
        const colorAttr = new THREE.BufferAttribute(colors, 3);
        geo.setAttribute('color', colorAttr);

        return { geometry: geo, colorAttr };
    }, []);

    return (
        <mesh geometry={geometry} receiveShadow>
            <meshStandardMaterial vertexColors roughness={0.9} />
        </mesh>
    );
}

/* ── Realistic Buildings ─────────────────────────────────────── */
function Buildings() {
    const buildings = useMemo(() => {
        const rng = seededRandom(123);
        const arr = [];

        // Building color palettes (realistic urban tones)
        const bodyColors = [
            '#c8c0b8', '#b0a898', '#d0ccc4', '#a8a098', '#8890a0',
            '#90989c', '#b8b0a0', '#989088', '#707880', '#a0a8b0',
        ];
        const accentColors = ['#405060', '#304050', '#505848', '#604840', '#384858'];
        const windowColors = ['#a0c0e0', '#b8d0e8', '#90b0d0', '#c8d8e8'];

        // City blocks with varied building types
        for (let bx = -2; bx <= 2; bx++) {
            for (let bz = -2; bz <= 2; bz++) {
                const cx = bx * 80;
                const cz = bz * 80;
                const numBuildings = 2 + Math.floor(rng() * 4);

                for (let i = 0; i < numBuildings; i++) {
                    const x = cx + (rng() - 0.5) * 60;
                    const z = cz + (rng() - 0.5) * 60;
                    const baseH = getHeight(x, z);

                    // Building dimensions
                    const w = 8 + rng() * 14;
                    const h = 20 + rng() * 100;
                    const d = 8 + rng() * 14;
                    const bodyColor = pick(bodyColors, rng);
                    const accentColor = pick(accentColors, rng);
                    const windowColor = pick(windowColors, rng);
                    const type = rng() < 0.3 ? 'skyscraper' : rng() < 0.6 ? 'office' : 'low';
                    const actualH = type === 'skyscraper' ? h * 1.5 : type === 'office' ? h * 0.8 : h * 0.4;

                    arr.push({ x, z, baseH, w, h: actualH, d, bodyColor, accentColor, windowColor, type });
                }
            }
        }
        return arr;
    }, []);

    return (
        <group>
            {buildings.map((b, i) => (
                <group key={i} position={[b.x, b.baseH + b.h / 2, b.z]}>
                    {/* Main body */}
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[b.w, b.h, b.d]} />
                        <meshStandardMaterial color={b.bodyColor} roughness={0.7} metalness={0.1} />
                    </mesh>

                    {/* Window strips (front & back) */}
                    {Array.from({ length: Math.floor(b.h / 6) }, (_, fi) => (
                        <group key={`wf-${fi}`}>
                            <mesh position={[0, -b.h / 2 + 4 + fi * 6, b.d / 2 + 0.05]}>
                                <planeGeometry args={[b.w * 0.8, 1.8]} />
                                <meshStandardMaterial
                                    color={b.windowColor}
                                    emissive={b.windowColor}
                                    emissiveIntensity={0.15}
                                    roughness={0.2}
                                    metalness={0.6}
                                />
                            </mesh>
                            <mesh position={[0, -b.h / 2 + 4 + fi * 6, -b.d / 2 - 0.05]} rotation={[0, Math.PI, 0]}>
                                <planeGeometry args={[b.w * 0.8, 1.8]} />
                                <meshStandardMaterial
                                    color={b.windowColor}
                                    emissive={b.windowColor}
                                    emissiveIntensity={0.15}
                                    roughness={0.2}
                                    metalness={0.6}
                                />
                            </mesh>
                        </group>
                    ))}

                    {/* Roof accent / ledge */}
                    <mesh position={[0, b.h / 2 + 0.5, 0]}>
                        <boxGeometry args={[b.w + 0.8, 1, b.d + 0.8]} />
                        <meshStandardMaterial color={b.accentColor} roughness={0.6} />
                    </mesh>

                    {/* Antenna on tall buildings */}
                    {b.type === 'skyscraper' && (
                        <mesh position={[0, b.h / 2 + 8, 0]}>
                            <cylinderGeometry args={[0.15, 0.15, 15, 4]} />
                            <meshStandardMaterial color="#606060" metalness={0.7} roughness={0.3} />
                        </mesh>
                    )}

                    {/* AC units or rooftop structures */}
                    {b.type === 'office' && (
                        <mesh position={[b.w * 0.2, b.h / 2 + 2, b.d * 0.2]}>
                            <boxGeometry args={[3, 3, 3]} />
                            <meshStandardMaterial color="#808080" roughness={0.8} />
                        </mesh>
                    )}
                </group>
            ))}
        </group>
    );
}

/* ── Trees (varied) ──────────────────────────────────────────── */
function Trees() {
    const trees = useMemo(() => {
        const rng = seededRandom(456);
        const arr = [];

        for (let i = 0; i < 300; i++) {
            const x = (rng() - 0.5) * 2400;
            const z = (rng() - 0.5) * 2400;

            // Skip city area and airports
            const cityDist = Math.sqrt(x * x + z * z);
            if (cityDist < 250) continue;
            const ap1 = Math.sqrt((x + 500) ** 2 + (z - 200) ** 2);
            if (ap1 < 220) continue;
            const ap2 = Math.sqrt((x - 400) ** 2 + (z - 400) ** 2);
            if (ap2 < 200) continue;

            const baseH = getHeight(x, z);
            if (baseH > 120) continue; // no trees on high mountains

            const type = rng() < 0.5 ? 'pine' : rng() < 0.7 ? 'oak' : 'bush';
            const h = type === 'pine' ? (8 + rng() * 10) : type === 'oak' ? (6 + rng() * 8) : (2 + rng() * 3);
            const r = type === 'pine' ? (2 + rng() * 3) : type === 'oak' ? (4 + rng() * 5) : (2 + rng() * 3);
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
                                <coneGeometry args={[t.r * 0.7, t.h * 0.35, 6]} />
                                <meshStandardMaterial color={t.green} roughness={0.8} />
                            </mesh>
                        </>
                    )}
                    {t.type === 'oak' && (
                        <>
                            <mesh position={[0, t.h * 0.3, 0]} castShadow>
                                <cylinderGeometry args={[0.4, 0.6, t.h * 0.6, 5]} />
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
        // City grid roads
        for (let i = -2; i <= 2; i++) {
            arr.push({ pos: [0, 0.3, i * 80], rot: 0, len: 500, width: 10 });
            arr.push({ pos: [i * 80, 0.3, 0], rot: Math.PI / 2, len: 500, width: 10 });
        }
        // Road to airport 1
        arr.push({ pos: [-250, 0.3, 100], rot: Math.atan2(200, -500) + Math.PI / 2, len: 350, width: 8 });
        // Road to airport 2
        arr.push({ pos: [200, 0.3, 200], rot: Math.atan2(400, 400) + Math.PI / 2, len: 350, width: 8 });
        return arr;
    }, []);

    return (
        <group>
            {roads.map((r, i) => (
                <group key={i}>
                    <mesh position={r.pos} rotation={[-Math.PI / 2, 0, r.rot]} receiveShadow>
                        <planeGeometry args={[r.len, r.width]} />
                        <meshStandardMaterial color="#3a3a42" roughness={0.95} />
                    </mesh>
                    {/* Center line */}
                    <mesh position={[r.pos[0], r.pos[1] + 0.05, r.pos[2]]} rotation={[-Math.PI / 2, 0, r.rot]} receiveShadow>
                        <planeGeometry args={[r.len, 0.4]} />
                        <meshStandardMaterial color="#e0c840" roughness={0.8} />
                    </mesh>
                </group>
            ))}
        </group>
    );
}

/* ── Airport ─────────────────────────────────────────────────── */
function Airport({ position, rotation = 0, name }) {
    const baseH = getHeight(position[0], position[2]) + 0.2;

    return (
        <group position={[position[0], baseH, position[2]]} rotation={[0, rotation, 0]}>
            {/* Main runway */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[300, 30]} />
                <meshStandardMaterial color="#2a2a2e" roughness={0.9} />
            </mesh>

            {/* Runway center line */}
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[280, 1]} />
                <meshStandardMaterial color="#e0e0e0" roughness={0.8} />
            </mesh>

            {/* Runway threshold markings */}
            {[-135, 135].map((xOff, i) => (
                <group key={`thresh-${i}`}>
                    {Array.from({ length: 6 }, (_, j) => (
                        <mesh key={j} position={[xOff, 0.05, -8 + j * 3.2]} rotation={[-Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[8, 1.2]} />
                            <meshStandardMaterial color="#e0e0e0" roughness={0.8} />
                        </mesh>
                    ))}
                </group>
            ))}

            {/* Taxiway */}
            <mesh position={[0, 0.02, 25]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[200, 14]} />
                <meshStandardMaterial color="#383838" roughness={0.9} />
            </mesh>

            {/* Taxiway center line (yellow) */}
            <mesh position={[0, 0.07, 25]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[200, 0.4]} />
                <meshStandardMaterial color="#d0b020" roughness={0.8} />
            </mesh>

            {/* Terminal building */}
            <mesh position={[0, 10, 50]} castShadow receiveShadow>
                <boxGeometry args={[80, 20, 30]} />
                <meshStandardMaterial color="#b8b8c0" roughness={0.6} metalness={0.1} />
            </mesh>
            {/* Terminal windows */}
            <mesh position={[0, 12, 34.6]}>
                <planeGeometry args={[70, 10]} />
                <meshStandardMaterial color="#80b8e0" emissive="#80b8e0" emissiveIntensity={0.1} roughness={0.2} metalness={0.5} />
            </mesh>
            {/* Terminal roof */}
            <mesh position={[0, 20.5, 50]}>
                <boxGeometry args={[84, 1, 34]} />
                <meshStandardMaterial color="#606068" roughness={0.5} />
            </mesh>

            {/* Hangars */}
            {[-60, 60].map((xOff, i) => (
                <group key={`hangar-${i}`} position={[xOff, 0, 55]}>
                    <mesh position={[0, 8, 0]} castShadow receiveShadow>
                        <boxGeometry args={[30, 16, 24]} />
                        <meshStandardMaterial color="#808890" roughness={0.7} />
                    </mesh>
                    {/* Hangar door */}
                    <mesh position={[0, 6, -12.1]}>
                        <planeGeometry args={[24, 12]} />
                        <meshStandardMaterial color="#504830" roughness={0.9} />
                    </mesh>
                </group>
            ))}

            {/* Control tower */}
            <mesh position={[50, 15, 40]} castShadow>
                <cylinderGeometry args={[3, 4, 30, 8]} />
                <meshStandardMaterial color="#a0a0a0" roughness={0.6} />
            </mesh>
            {/* Tower cab */}
            <mesh position={[50, 32, 40]} castShadow>
                <cylinderGeometry args={[5, 4, 5, 8]} />
                <meshStandardMaterial color="#70a8d0" roughness={0.3} metalness={0.4} transparent opacity={0.8} />
            </mesh>
            <mesh position={[50, 35, 40]}>
                <cylinderGeometry args={[5.5, 5.5, 1, 8]} />
                <meshStandardMaterial color="#606060" roughness={0.5} />
            </mesh>

            {/* Runway edge lights (simplified) */}
            {Array.from({ length: 20 }, (_, i) => {
                const xPos = -140 + i * 14.7;
                return (
                    <group key={`rlight-${i}`}>
                        <mesh position={[xPos, 0.5, 15.5]}>
                            <sphereGeometry args={[0.3, 4, 4]} />
                            <meshStandardMaterial color="#80e080" emissive="#80e080" emissiveIntensity={0.5} />
                        </mesh>
                        <mesh position={[xPos, 0.5, -15.5]}>
                            <sphereGeometry args={[0.3, 4, 4]} />
                            <meshStandardMaterial color="#80e080" emissive="#80e080" emissiveIntensity={0.5} />
                        </mesh>
                    </group>
                );
            })}

            {/* Approach lights */}
            {Array.from({ length: 8 }, (_, i) => (
                <mesh key={`approach-${i}`} position={[-150 - i * 10, 0.8, 0]}>
                    <sphereGeometry args={[0.4, 4, 4]} />
                    <meshStandardMaterial color="#f0f0f0" emissive="#f0f0f0" emissiveIntensity={0.6} />
                </mesh>
            ))}
        </group>
    );
}

/* ── Water bodies ────────────────────────────────────────────── */
function Water() {
    const ref = useRef();
    useFrame(({ clock }) => {
        if (ref.current) {
            ref.current.position.y = -2 + Math.sin(clock.elapsedTime * 0.3) * 0.5;
        }
    });

    return (
        <group>
            {/* Lake in the valley area */}
            <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[350, -2, 0]} receiveShadow>
                <circleGeometry args={[80, 24]} />
                <meshStandardMaterial color="#1a4a7a" transparent opacity={0.7} roughness={0.2} metalness={0.3} />
            </mesh>
            {/* River */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[500, -1, -100]} receiveShadow>
                <planeGeometry args={[30, 600]} />
                <meshStandardMaterial color="#1a4a7a" transparent opacity={0.6} roughness={0.2} metalness={0.3} />
            </mesh>
        </group>
    );
}

/* ── Main Terrain Component ──────────────────────────────────── */
export default function Terrain() {
    return (
        <group>
            {/* Sky */}
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
                shadow-camera-far={2000}
                shadow-camera-left={-600}
                shadow-camera-right={600}
                shadow-camera-top={600}
                shadow-camera-bottom={-600}
            />
            <directionalLight color="#4060a0" intensity={0.3} position={[-200, 100, 200]} />
            <hemisphereLight skyColor="#6090c0" groundColor="#3a4a30" intensity={0.5} />

            {/* Fog */}
            <fog attach="fog" args={['#8aaccc', 400, 2500]} />

            {/* Heightmapped ground */}
            <Ground />

            {/* Scene elements */}
            <Roads />
            <Buildings />
            <Trees />
            <Water />

            {/* Airports */}
            <Airport position={[-500, 0, 200]} rotation={0.3} name="SkyPort Intl" />
            <Airport position={[400, 0, 400]} rotation={-0.6} name="Valley Regional" />
        </group>
    );
}
