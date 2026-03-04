import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/* ══════════════════════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════════════════════ */
function seededRandom(seed) {
    let s = seed;
    return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

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
            nlerp(dot(xi, yi + 1, xf, yf - 1), dot(xi + 1, yi + 1, xf - 1, yf - 1), u), v
        );
    };
}
const noise = makeNoise2D(999);

/* ══════════════════════════════════════════════════════════════
   LANDING ZONES & SPAWN (unchanged)
   ══════════════════════════════════════════════════════════════ */
export const LANDING_ZONES = [
    { cx: -700, cz: -300, halfLen: 130, halfWid: 18, rotation: 0.15, label: 'Airport' },
    { cx: 600, cz: 500, halfLen: 105, halfWid: 12, rotation: -0.3, label: 'Airstrip' },
];
export function isOnRunway(x, z) {
    for (const zone of LANDING_ZONES) {
        const dx = x - zone.cx, dz = z - zone.cz;
        const c = Math.cos(zone.rotation), s = Math.sin(zone.rotation);
        if (Math.abs(dx * c - dz * s) < zone.halfLen && Math.abs(dx * s + dz * c) < zone.halfWid) return zone.label;
    }
    return null;
}
const _spawnX = -700 + 100 * Math.cos(0.15);
const _spawnZ = -300 - 100 * Math.sin(0.15);
export const SPAWN_POINT = { x: _spawnX, y: 0, z: _spawnZ, yaw: Math.PI / 2 + 0.15, needsGroundSnap: true };

/* ══════════════════════════════════════════════════════════════
   FLAT ZONES & HEIGHT — expanded world
   ══════════════════════════════════════════════════════════════ */
const FLAT_ZONES = [
    { x: 0, z: 0, r: 420 },
    { x: -700, z: -300, r: 300 },
    { x: 600, z: 500, r: 220 },
    { x: 800, z: -600, r: 280 },   // Second city
];

function flatZoneFactor(x, z) {
    let f = 1;
    for (const zone of FLAT_ZONES) {
        const d = Math.sqrt((x - zone.x) ** 2 + (z - zone.z) ** 2) / zone.r;
        if (d < 1) f = Math.min(f, d * d * d * d);
    }
    return f;
}

const MAP_HALF = 2200;
const BOUNDARY_START = 1700;

export function getHeight(x, z) {
    let h = noise(x * 0.0015, z * 0.0015) * 50
        + noise(x * 0.005, z * 0.005) * 20
        + noise(x * 0.018, z * 0.018) * 6;
    const mid = Math.sqrt(x * x + z * z);
    if (mid > 350 && mid < 1200) h += noise(x * 0.01, z * 0.01) * 15;
    h *= flatZoneFactor(x, z);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > BOUNDARY_START) {
        const t = Math.min(1, (edge - BOUNDARY_START) / (MAP_HALF - BOUNDARY_START));
        h += t * t * 200 + noise(x * 0.008, z * 0.008) * 45 * t;
    }
    return Math.max(-1, h);
}

/* ══════════════════════════════════════════════════════════════
   MODULE-LEVEL DATA — buildings, villages, trees (for collision grid + instancing)
   ══════════════════════════════════════════════════════════════ */
const BODY_COLORS = ['#c8c0b8', '#b0a898', '#d0ccc4', '#a8a098', '#8890a0', '#90989c', '#b8b0a0', '#989088', '#707880', '#a0a8b0'];

// ── Buildings (both cities) ────────────────────────────────────
const CITY_DEFS = [
    { cx: 0, cz: 0, grid: 4 },
    { cx: 800, cz: -600, grid: 2 },
];
const ALL_BUILDINGS = (() => {
    const rng = seededRandom(123);
    const arr = [];
    for (const city of CITY_DEFS) {
        for (let bx = -city.grid; bx <= city.grid; bx++) {
            for (let bz = -city.grid; bz <= city.grid; bz++) {
                const cx = city.cx + bx * 70, cz = city.cz + bz * 70;
                const dist = Math.sqrt(bx * bx + bz * bz);
                const num = Math.max(1, Math.floor(5 - dist * 0.5) + Math.floor(rng() * 3));
                const maxH = dist < 2 ? 120 : dist < 3 ? 80 : 50;
                for (let i = 0; i < num; i++) {
                    const x = cx + (rng() - 0.5) * 50;
                    const z = cz + (rng() - 0.5) * 50;
                    const w = 7 + rng() * 12, h = 15 + rng() * maxH, d = 7 + rng() * 12;
                    arr.push({ x, z, baseH: getHeight(x, z), w, h, d, color: pick(BODY_COLORS, rng) });
                }
            }
        }
    }
    return arr;
})();

// ── Collision grid (spatial hash, 50-unit cells) ──────────────
const CELL = 50;
const _grid = new Map();
for (const b of ALL_BUILDINGS) {
    const key = `${Math.floor(b.x / CELL)},${Math.floor(b.z / CELL)}`;
    if (!_grid.has(key)) _grid.set(key, []);
    _grid.get(key).push(b);
}
export function checkBuildingCollision(px, py, pz) {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const cell = _grid.get(`${cx + dx},${cz + dz}`);
        if (!cell) continue;
        for (const b of cell) {
            if (Math.abs(px - b.x) < b.w / 2 + 2 && Math.abs(pz - b.z) < b.d / 2 + 2 && py < b.baseH + b.h + 2) return true;
        }
    }
    return false;
}

// ── Village data ──────────────────────────────────────────────
const VILLAGE_DEFS = [
    { cx: 600, cz: 500, count: 12, spread: 100 },
    { cx: -700, cz: 500, count: 8, spread: 80 },
    { cx: 500, cz: -500, count: 10, spread: 90 },
    { cx: -400, cz: -600, count: 6, spread: 60 },
    { cx: 800, cz: 0, count: 7, spread: 70 },
    { cx: 1000, cz: -800, count: 6, spread: 65 },
];
const HOUSE_COLORS = ['#c8b8a0', '#b8a888', '#a89878', '#d0c0a8', '#e0d0b8'];
const ROOF_COLORS = ['#8a4030', '#6a5040', '#905838', '#7a6050'];

const ALL_HOUSES = (() => {
    const rng = seededRandom(789);
    const arr = [];
    // Scattered individual homes
    for (let i = 0; i < 50; i++) {
        const x = (rng() - 0.5) * 3600, z = (rng() - 0.5) * 3600;
        if (Math.sqrt(x * x + z * z) < 400) continue;
        if (Math.sqrt((x - 800) ** 2 + (z + 600) ** 2) < 300) continue;
        if (Math.max(Math.abs(x), Math.abs(z)) > 1600) continue;
        const bH = getHeight(x, z);
        if (bH > 80) continue;
        const w = 4 + rng() * 4, h = 3 + rng() * 4, d = 4 + rng() * 4;
        arr.push({ x, z, baseH: bH, w, h, d, color: pick(HOUSE_COLORS, rng), roofColor: pick(ROOF_COLORS, rng) });
    }
    // Village clusters
    for (const v of VILLAGE_DEFS) {
        for (let i = 0; i < v.count; i++) {
            const x = v.cx + (rng() - 0.5) * v.spread, z = v.cz + (rng() - 0.5) * v.spread;
            const bH = getHeight(x, z);
            if (bH > 80) continue;
            const w = 4 + rng() * 5, h = 3 + rng() * 5, d = 4 + rng() * 5;
            arr.push({ x, z, baseH: bH, w, h, d, color: pick(HOUSE_COLORS, rng), roofColor: pick(ROOF_COLORS, rng) });
        }
    }
    return arr;
})();

// ── Tree data ─────────────────────────────────────────────────
const ALL_TREES = (() => {
    const rng = seededRandom(456);
    const trunks = [], cones = [], spheres = [];
    for (let i = 0; i < 700; i++) {
        const x = (rng() - 0.5) * 4000, z = (rng() - 0.5) * 4000;
        // Exclude flat zones
        if (Math.sqrt(x * x + z * z) < 320) continue;
        if (Math.sqrt((x + 700) ** 2 + (z + 300) ** 2) < 280) continue;
        if (Math.sqrt((x - 600) ** 2 + (z - 500) ** 2) < 160) continue;
        if (Math.sqrt((x - 800) ** 2 + (z + 600) ** 2) < 260) continue;
        if (Math.max(Math.abs(x), Math.abs(z)) > 1800) continue;
        const bH = getHeight(x, z);
        if (bH > 100) continue;
        const type = rng() < 0.45 ? 'pine' : rng() < 0.7 ? 'oak' : 'bush';
        const h = type === 'pine' ? 8 + rng() * 10 : type === 'oak' ? 5 + rng() * 7 : 2 + rng() * 3;
        const r = type === 'pine' ? 2 + rng() * 3 : type === 'oak' ? 3.5 + rng() * 4 : 1.5 + rng() * 2.5;
        const green = type === 'pine' ? '#1a5a20' : type === 'oak' ? '#2a7a30' : '#3a8a28';
        if (type === 'pine') {
            trunks.push({ x, z, y: bH + h * 0.25, sy: h * 0.5, color: '#4a3020' });
            cones.push({ x, z, y: bH + h * 0.55, r, h: h * 0.5, color: green });
            cones.push({ x, z, y: bH + h * 0.78, r: r * 0.65, h: h * 0.3, color: green });
        } else if (type === 'oak') {
            trunks.push({ x, z, y: bH + h * 0.3, sy: h * 0.6, color: '#5a3a1a' });
            spheres.push({ x, z, y: bH + h * 0.65, r, color: green });
        } else {
            spheres.push({ x, z, y: bH + h * 0.5, r, color: green });
        }
    }
    return { trunks, cones, spheres };
})();

/* ══════════════════════════════════════════════════════════════
   INSTANCED COMPONENTS
   ══════════════════════════════════════════════════════════════ */
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

// ── Instanced Buildings ───────────────────────────────────────
function InstancedBuildings() {
    const bodyRef = useRef();
    const roofRef = useRef();

    useEffect(() => {
        if (!bodyRef.current) return;
        ALL_BUILDINGS.forEach((b, i) => {
            _dummy.position.set(b.x, b.baseH + b.h / 2, b.z);
            _dummy.scale.set(b.w, b.h, b.d);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            bodyRef.current.setMatrixAt(i, _dummy.matrix);
            bodyRef.current.setColorAt(i, _color.set(b.color));
            // Roof ledge
            _dummy.position.set(b.x, b.baseH + b.h + 0.4, b.z);
            _dummy.scale.set(b.w + 0.6, 0.8, b.d + 0.6);
            _dummy.updateMatrix();
            roofRef.current.setMatrixAt(i, _dummy.matrix);
            roofRef.current.setColorAt(i, _color.set('#505060'));
        });
        bodyRef.current.instanceMatrix.needsUpdate = true;
        bodyRef.current.instanceColor.needsUpdate = true;
        roofRef.current.instanceMatrix.needsUpdate = true;
        roofRef.current.instanceColor.needsUpdate = true;
    }, []);

    return (
        <group>
            <instancedMesh ref={bodyRef} args={[null, null, ALL_BUILDINGS.length]} castShadow receiveShadow frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial roughness={0.7} metalness={0.1} />
            </instancedMesh>
            <instancedMesh ref={roofRef} args={[null, null, ALL_BUILDINGS.length]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial roughness={0.6} />
            </instancedMesh>
        </group>
    );
}

// ── Instanced Villages ────────────────────────────────────────
function InstancedVillages() {
    const bodyRef = useRef();
    const roofRef = useRef();

    useEffect(() => {
        if (!bodyRef.current) return;
        ALL_HOUSES.forEach((h, i) => {
            // Body
            _dummy.position.set(h.x, h.baseH + h.h / 2, h.z);
            _dummy.scale.set(h.w, h.h, h.d);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            bodyRef.current.setMatrixAt(i, _dummy.matrix);
            bodyRef.current.setColorAt(i, _color.set(h.color));
            // Roof
            const roofR = Math.max(h.w, h.d) * 0.75;
            _dummy.position.set(h.x, h.baseH + h.h + 1.25, h.z);
            _dummy.scale.set(roofR, 2.5, roofR);
            _dummy.updateMatrix();
            roofRef.current.setMatrixAt(i, _dummy.matrix);
            roofRef.current.setColorAt(i, _color.set(h.roofColor));
        });
        bodyRef.current.instanceMatrix.needsUpdate = true;
        bodyRef.current.instanceColor.needsUpdate = true;
        roofRef.current.instanceMatrix.needsUpdate = true;
        roofRef.current.instanceColor.needsUpdate = true;
    }, []);

    return (
        <group>
            <instancedMesh ref={bodyRef} args={[null, null, ALL_HOUSES.length]} castShadow receiveShadow frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial roughness={0.85} />
            </instancedMesh>
            <instancedMesh ref={roofRef} args={[null, null, ALL_HOUSES.length]} castShadow frustumCulled={false}>
                <coneGeometry args={[1, 1, 4]} />
                <meshStandardMaterial roughness={0.8} />
            </instancedMesh>
        </group>
    );
}

// ── Instanced Trees ───────────────────────────────────────────
function InstancedTrees() {
    const trunkRef = useRef();
    const coneRef = useRef();
    const sphereRef = useRef();

    useEffect(() => {
        if (!trunkRef.current) return;
        const { trunks, cones, spheres } = ALL_TREES;
        trunks.forEach((t, i) => {
            _dummy.position.set(t.x, t.y, t.z);
            _dummy.scale.set(0.4, t.sy, 0.4);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            trunkRef.current.setMatrixAt(i, _dummy.matrix);
            trunkRef.current.setColorAt(i, _color.set(t.color));
        });
        trunkRef.current.instanceMatrix.needsUpdate = true;
        trunkRef.current.instanceColor.needsUpdate = true;

        cones.forEach((c, i) => {
            _dummy.position.set(c.x, c.y, c.z);
            _dummy.scale.set(c.r, c.h, c.r);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            coneRef.current.setMatrixAt(i, _dummy.matrix);
            coneRef.current.setColorAt(i, _color.set(c.color));
        });
        coneRef.current.instanceMatrix.needsUpdate = true;
        coneRef.current.instanceColor.needsUpdate = true;

        spheres.forEach((s, i) => {
            _dummy.position.set(s.x, s.y, s.z);
            _dummy.scale.set(s.r, s.r, s.r);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            sphereRef.current.setMatrixAt(i, _dummy.matrix);
            sphereRef.current.setColorAt(i, _color.set(s.color));
        });
        sphereRef.current.instanceMatrix.needsUpdate = true;
        sphereRef.current.instanceColor.needsUpdate = true;
    }, []);

    return (
        <group>
            <instancedMesh ref={trunkRef} args={[null, null, ALL_TREES.trunks.length]} castShadow frustumCulled={false}>
                <cylinderGeometry args={[0.3, 0.5, 1, 5]} />
                <meshStandardMaterial roughness={0.9} />
            </instancedMesh>
            <instancedMesh ref={coneRef} args={[null, null, ALL_TREES.cones.length]} castShadow frustumCulled={false}>
                <coneGeometry args={[1, 1, 6]} />
                <meshStandardMaterial roughness={0.8} />
            </instancedMesh>
            <instancedMesh ref={sphereRef} args={[null, null, ALL_TREES.spheres.length]} castShadow frustumCulled={false}>
                <sphereGeometry args={[1, 6, 5]} />
                <meshStandardMaterial roughness={0.85} />
            </instancedMesh>
        </group>
    );
}

// ── Instanced Clouds ──────────────────────────────────────────
function InstancedClouds() {
    const ref = useRef();
    const cloudData = useMemo(() => {
        const rng = seededRandom(42);
        return Array.from({ length: 80 }, () => ({
            x: (rng() - 0.5) * 4400,
            y: 220 + rng() * 220,
            z: (rng() - 0.5) * 4400,
            sx: 40 + rng() * 80,
            sy: 5 + rng() * 8,
            sz: 25 + rng() * 50,
            speed: 0.3 + rng() * 1.2,
            opacity: 0.3 + rng() * 0.35,
        }));
    }, []);

    useEffect(() => {
        if (!ref.current) return;
        cloudData.forEach((c, i) => {
            _dummy.position.set(c.x, c.y, c.z);
            _dummy.scale.set(c.sx, c.sy, c.sz);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            ref.current.setMatrixAt(i, _dummy.matrix);
        });
        ref.current.instanceMatrix.needsUpdate = true;
    }, [cloudData]);

    useFrame(({ clock }) => {
        if (!ref.current) return;
        const t = clock.elapsedTime;
        cloudData.forEach((c, i) => {
            _dummy.position.set(c.x + Math.sin(t * 0.015 * c.speed) * 30, c.y, c.z);
            _dummy.scale.set(c.sx, c.sy, c.sz);
            _dummy.rotation.set(0, 0, 0);
            _dummy.updateMatrix();
            ref.current.setMatrixAt(i, _dummy.matrix);
        });
        ref.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={ref} args={[null, null, 80]} frustumCulled={false}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#e8e8f4" transparent opacity={0.4} roughness={1} />
        </instancedMesh>
    );
}

/* ══════════════════════════════════════════════════════════════
   STATIC GEOMETRY COMPONENTS
   ══════════════════════════════════════════════════════════════ */

// ── Sky Dome ──────────────────────────────────────────────────
function SkyDome() {
    const mat = useMemo(() => {
        const c = document.createElement('canvas');
        c.width = 4; c.height = 512;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, '#0a0e1a'); g.addColorStop(0.08, '#0f1528');
        g.addColorStop(0.20, '#1a2844'); g.addColorStop(0.35, '#2a4a70');
        g.addColorStop(0.50, '#4a80b0'); g.addColorStop(0.65, '#80b8e0');
        g.addColorStop(0.76, '#d0a870'); g.addColorStop(0.84, '#e8c088');
        g.addColorStop(0.92, '#f0d8a0'); g.addColorStop(1, '#ffeedd');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 512);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    }, []);
    const ref = useRef();
    useFrame(({ camera }) => { if (ref.current) ref.current.position.copy(camera.position); });
    return (<mesh ref={ref} material={mat} renderOrder={-1}><sphereGeometry args={[6000, 32, 48]} /></mesh>);
}

// ── Ground ────────────────────────────────────────────────────
function Ground() {
    const geometry = useMemo(() => {
        const size = 4400, seg = 300;
        const geo = new THREE.PlaneGeometry(size, size, seg, seg);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const gL = new THREE.Color('#3a6a30'), gH = new THREE.Color('#5a8a40');
        const dirt = new THREE.Color('#7a6a4a'), rock = new THREE.Color('#8a8a80'), snow = new THREE.Color('#e0e0e8');
        const tmp = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i), h = getHeight(x, z);
            pos.setY(i, h);
            if (h < 3) tmp.copy(gL);
            else if (h < 30) tmp.lerpColors(gL, gH, h / 30);
            else if (h < 60) tmp.lerpColors(gH, dirt, (h - 30) / 30);
            else if (h < 120) tmp.lerpColors(dirt, rock, (h - 60) / 60);
            else tmp.lerpColors(rock, snow, Math.min(1, (h - 120) / 80));
            const n = noise(x * 0.05, z * 0.05) * 0.06;
            tmp.r = Math.max(0, Math.min(1, tmp.r + n));
            tmp.g = Math.max(0, Math.min(1, tmp.g + n));
            tmp.b = Math.max(0, Math.min(1, tmp.b + n));
            colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
        }
        geo.computeVertexNormals();
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geo;
    }, []);
    return (<mesh geometry={geometry} receiveShadow><meshStandardMaterial vertexColors roughness={0.9} /></mesh>);
}

// ── Roads ─────────────────────────────────────────────────────
function Roads() {
    const roads = useMemo(() => {
        const arr = [];
        // Main city grid
        for (let i = -4; i <= 4; i++) {
            arr.push({ pos: [0, 0.4, i * 70], rot: 0, len: 650, w: 9 });
            arr.push({ pos: [i * 70, 0.4, 0], rot: Math.PI / 2, len: 650, w: 9 });
        }
        // Second city grid
        for (let i = -2; i <= 2; i++) {
            arr.push({ pos: [800, 0.4, -600 + i * 70], rot: 0, len: 380, w: 8 });
            arr.push({ pos: [800 + i * 70, 0.4, -600], rot: Math.PI / 2, len: 380, w: 8 });
        }
        // Inter-city highway
        arr.push({ pos: [400, 0.4, -300], rot: Math.atan2(-600, 800), len: 700, w: 10 });
        // Road to airport
        arr.push({ pos: [-350, 0.4, -150], rot: Math.atan2(-300, -700) + Math.PI / 2, len: 500, w: 7 });
        // Road to airstrip village
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

// ── Airport ───────────────────────────────────────────────────
function Airport({ position, rotation = 0 }) {
    const baseH = getHeight(position[0], position[2]);
    return (
        <group position={[position[0], baseH + 0.1, position[2]]} rotation={[0, rotation, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[250, 28]} /><meshStandardMaterial color="#2a2a2e" roughness={0.85} /></mesh>
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[230, 0.8]} /><meshStandardMaterial color="#e0e0e0" roughness={0.8} /></mesh>
            {[-115, 115].map((xOff, i) => (
                <group key={`th-${i}`}>
                    {Array.from({ length: 5 }, (_, j) => (
                        <mesh key={j} position={[xOff, 0.05, -6 + j * 3]} rotation={[-Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[6, 1]} /><meshStandardMaterial color="#e0e0e0" roughness={0.8} />
                        </mesh>
                    ))}
                </group>
            ))}
            <mesh position={[0, 0.03, 22]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[160, 12]} /><meshStandardMaterial color="#383838" roughness={0.9} /></mesh>
            <mesh position={[0, 0.08, 22]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[160, 0.35]} /><meshStandardMaterial color="#d0b020" roughness={0.8} /></mesh>
            <mesh position={[0, 10, 44]} castShadow receiveShadow><boxGeometry args={[60, 20, 28]} /><meshStandardMaterial color="#b8b8c0" roughness={0.6} metalness={0.1} /></mesh>
            <mesh position={[0, 12, 30]}><planeGeometry args={[52, 10]} /><meshStandardMaterial color="#80b8e0" emissive="#80b8e0" emissiveIntensity={0.08} roughness={0.2} metalness={0.5} /></mesh>
            <mesh position={[0, 20.5, 44]}><boxGeometry args={[64, 1, 32]} /><meshStandardMaterial color="#606068" roughness={0.5} /></mesh>
            {[-50, 50].map((xOff, i) => (
                <group key={`h-${i}`} position={[xOff, 0, 50]}>
                    <mesh position={[0, 7, 0]} castShadow receiveShadow><boxGeometry args={[24, 14, 20]} /><meshStandardMaterial color="#808890" roughness={0.7} /></mesh>
                    <mesh position={[0, 5.5, -10.1]}><planeGeometry args={[20, 11]} /><meshStandardMaterial color="#504830" roughness={0.9} /></mesh>
                </group>
            ))}
            <mesh position={[42, 13, 38]} castShadow><cylinderGeometry args={[2.5, 3.5, 26, 8]} /><meshStandardMaterial color="#a0a0a0" roughness={0.6} /></mesh>
            <mesh position={[42, 28, 38]} castShadow><cylinderGeometry args={[4, 3.5, 4, 8]} /><meshStandardMaterial color="#70a8d0" roughness={0.3} metalness={0.4} transparent opacity={0.8} /></mesh>
            <mesh position={[42, 30.5, 38]}><cylinderGeometry args={[4.5, 4.5, 0.8, 8]} /><meshStandardMaterial color="#606060" roughness={0.5} /></mesh>
            {Array.from({ length: 16 }, (_, i) => {
                const xP = -120 + i * 16;
                return (
                    <group key={`rl-${i}`}>
                        <mesh position={[xP, 0.4, 14.5]}><sphereGeometry args={[0.2, 4, 4]} /><meshStandardMaterial color="#80e080" emissive="#80e080" emissiveIntensity={0.5} /></mesh>
                        <mesh position={[xP, 0.4, -14.5]}><sphereGeometry args={[0.2, 4, 4]} /><meshStandardMaterial color="#80e080" emissive="#80e080" emissiveIntensity={0.5} /></mesh>
                    </group>
                );
            })}
            {Array.from({ length: 6 }, (_, i) => (
                <mesh key={`ap-${i}`} position={[-130 - i * 10, 0.5, 0]}><sphereGeometry args={[0.3, 4, 4]} /><meshStandardMaterial color="#f0f0f0" emissive="#f0f0f0" emissiveIntensity={0.5} /></mesh>
            ))}
        </group>
    );
}

// ── Airstrip ──────────────────────────────────────────────────
function Airstrip({ position, rotation = 0 }) {
    const baseH = getHeight(position[0], position[2]);
    return (
        <group position={[position[0], baseH + 0.1, position[2]]} rotation={[0, rotation, 0]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[200, 16]} /><meshStandardMaterial color="#4a5a3a" roughness={0.95} /></mesh>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[190, 8]} /><meshStandardMaterial color="#505050" roughness={0.9} /></mesh>
            {Array.from({ length: 15 }, (_, i) => (
                <mesh key={`d-${i}`} position={[-90 + i * 13, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6, 0.3]} /><meshStandardMaterial color="#d0d0d0" roughness={0.8} /></mesh>
            ))}
            <mesh position={[-92, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4, 4]} /><meshStandardMaterial color="#d0d0d0" roughness={0.8} /></mesh>
            <mesh position={[92, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4, 4]} /><meshStandardMaterial color="#d0d0d0" roughness={0.8} /></mesh>
            <mesh position={[30, 4, 16]} castShadow receiveShadow><boxGeometry args={[14, 8, 12]} /><meshStandardMaterial color="#909898" roughness={0.8} /></mesh>
            <mesh position={[30, 4, 9.9]}><planeGeometry args={[10, 6]} /><meshStandardMaterial color="#504830" roughness={0.9} /></mesh>
            <mesh position={[-50, 4, 12]}><cylinderGeometry args={[0.1, 0.1, 8, 4]} /><meshStandardMaterial color="#808080" /></mesh>
            <mesh position={[-49, 7.5, 12]} rotation={[0, 0, Math.PI / 6]}><coneGeometry args={[0.5, 2, 4]} /><meshStandardMaterial color="#f06030" roughness={0.8} /></mesh>
            {Array.from({ length: 12 }, (_, i) => {
                const xP = -90 + i * 16.4;
                return (
                    <group key={`em-${i}`}>
                        <mesh position={[xP, 0.3, 8.5]}><sphereGeometry args={[0.2, 4, 4]} /><meshStandardMaterial color="#f0f0f0" emissive="#f0e0a0" emissiveIntensity={0.3} /></mesh>
                        <mesh position={[xP, 0.3, -8.5]}><sphereGeometry args={[0.2, 4, 4]} /><meshStandardMaterial color="#f0f0f0" emissive="#f0e0a0" emissiveIntensity={0.3} /></mesh>
                    </group>
                );
            })}
        </group>
    );
}

// ── Water ─────────────────────────────────────────────────────
function Water() {
    const ref = useRef();
    useFrame(({ clock }) => { if (ref.current) ref.current.position.y = -2 + Math.sin(clock.elapsedTime * 0.3) * 0.4; });
    return (
        <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[-700, -2, 500]} receiveShadow>
            <circleGeometry args={[60, 20]} />
            <meshStandardMaterial color="#1a4a7a" transparent opacity={0.65} roughness={0.2} metalness={0.3} />
        </mesh>
    );
}

/* ══════════════════════════════════════════════════════════════
   MAIN TERRAIN EXPORT
   ══════════════════════════════════════════════════════════════ */
export default function Terrain() {
    return (
        <group>
            <SkyDome />
            <InstancedClouds />

            <ambientLight color="#6080a0" intensity={0.5} />
            <directionalLight color="#f0c080" intensity={1.4} position={[400, 300, -300]}
                castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
                shadow-camera-far={3000} shadow-camera-left={-1200} shadow-camera-right={1200}
                shadow-camera-top={1200} shadow-camera-bottom={-1200} />
            <directionalLight color="#4060a0" intensity={0.3} position={[-200, 100, 200]} />
            <hemisphereLight skyColor="#6090c0" groundColor="#3a4a30" intensity={0.5} />
            <fog attach="fog" args={['#8aaccc', 800, 4500]} />

            <Ground />
            <Roads />
            <InstancedBuildings />
            <InstancedVillages />
            <InstancedTrees />
            <Water />

            <Airport position={[-700, 0, -300]} rotation={0.15} />
            <Airstrip position={[600, 0, 500]} rotation={-0.3} />
        </group>
    );
}
