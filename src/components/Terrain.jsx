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
   LANDING ZONES & SPAWN — expanded
   ══════════════════════════════════════════════════════════════ */
export const LANDING_ZONES = [
    { cx: -700, cz: -300, halfLen: 130, halfWid: 18, rotation: 0.15, label: 'Airport' },
    { cx: 600, cz: 500, halfLen: 105, halfWid: 12, rotation: -0.3, label: 'Airstrip' },
    { cx: 2600, cz: -2200, halfLen: 80, halfWid: 10, rotation: 0.1, label: 'Mesa Strip' },
    { cx: -2800, cz: 2400, halfLen: 100, halfWid: 14, rotation: -0.2, label: 'Harbor Runway' },
    { cx: -1800, cz: -1800, halfLen: 70, halfWid: 9, rotation: 0.4, label: 'Mountain Strip' },
];
export function isOnRunway(x, z) {
    for (const zone of LANDING_ZONES) {
        const dx = x - zone.cx, dz = z - zone.cz;
        const c = Math.cos(zone.rotation), s = Math.sin(zone.rotation);
        const along = Math.abs(dx * c - dz * s);
        const across = Math.abs(dx * s + dz * c);
        // Exact runway
        if (along < zone.halfLen && across < zone.halfWid) return zone.label;
        // Safe ground margin: 200 units beyond ends, 30 units wider on sides
        if (along < zone.halfLen + 200 && across < zone.halfWid + 30) return 'Taxiway';
    }
    return null;
}

// Runway clear zone check — returns flatten factor (0 = completely flat for runway)
function runwayFlatFactor(x, z) {
    for (const zone of LANDING_ZONES) {
        const dx = x - zone.cx, dz = z - zone.cz;
        const c = Math.cos(zone.rotation), s = Math.sin(zone.rotation);
        const along = dx * c - dz * s;  // signed: positive = one end, negative = other
        const across = Math.abs(dx * s + dz * c);
        const absAlong = Math.abs(along);

        // Inner runway zone: completely flat
        if (absAlong < zone.halfLen + 20 && across < zone.halfWid + 15) {
            const edgeAlong = Math.max(0, absAlong - zone.halfLen) / 20;
            const edgeAcross = Math.max(0, across - zone.halfWid) / 15;
            const edge = Math.max(edgeAlong, edgeAcross);
            return edge * edge;
        }

        // Approach corridor: flatten terrain ahead of each runway end
        // Extends 400 units beyond runway ends, widens gradually
        const approachLen = 400;
        if (absAlong > zone.halfLen && absAlong < zone.halfLen + approachLen) {
            const approachDist = absAlong - zone.halfLen;
            const approachWidthAtDist = zone.halfWid + 10 + approachDist * 0.15; // Widens slightly
            if (across < approachWidthAtDist) {
                // Gradual flatten: strongest near runway, fades to normal
                const t = approachDist / approachLen;
                return t * t; // 0 near runway end, ramps to 1 at max distance
            }
        }
    }
    return 1;
}

// Check if point is on or near any runway (for excluding buildings/houses/trees)
function isNearRunway(x, z, margin) {
    for (const zone of LANDING_ZONES) {
        const dx = x - zone.cx, dz = z - zone.cz;
        const c = Math.cos(zone.rotation), s = Math.sin(zone.rotation);
        const along = Math.abs(dx * c - dz * s);
        const across = Math.abs(dx * s + dz * c);
        // Check runway + approach corridor
        if (along < zone.halfLen + 300 && across < zone.halfWid + margin) return true;
    }
    return false;
}

const _spawnX = -700 + 100 * Math.cos(0.15);
const _spawnZ = -300 - 100 * Math.sin(0.15);
export const SPAWN_POINT = { x: _spawnX, y: 0, z: _spawnZ, yaw: Math.PI / 2 + 0.15, needsGroundSnap: true };

/* ── Team spawns for dogfight mode ──────────────────────────── */
const airportYaw = Math.PI / 2 + 0.15;
const airstripYaw = Math.PI / 2 + (-0.3);
export const TEAM_SPAWNS = {
    A: [0, 1, 2, 3].map(i => ({
        x: -700 + (60 + i * 30) * Math.cos(0.15),
        y: 0, z: -300 - (60 + i * 30) * Math.sin(0.15),
        yaw: airportYaw, needsGroundSnap: true,
    })),
    B: [0, 1, 2, 3].map(i => ({
        x: 600 + (40 + i * 25) * Math.cos(-0.3),
        y: 0, z: 500 - (40 + i * 25) * Math.sin(-0.3),
        yaw: airstripYaw, needsGroundSnap: true,
    })),
};

/* ══════════════════════════════════════════════════════════════
   FLAT ZONES & HEIGHT — expanded world
   ══════════════════════════════════════════════════════════════ */
const FLAT_ZONES = [
    { x: 0, z: 0, r: 420 },
    { x: -700, z: -300, r: 300 },
    { x: 600, z: 500, r: 220 },
    { x: 800, z: -600, r: 280 },       // Second city
    { x: -2800, z: 2400, r: 350 },     // Harbor City
    { x: 2600, z: -2200, r: 300 },     // Mesa Town
    { x: -1800, z: -1800, r: 180 },    // Mountain Strip
];

function flatZoneFactor(x, z) {
    let f = 1;
    for (const zone of FLAT_ZONES) {
        const d = Math.sqrt((x - zone.x) ** 2 + (z - zone.z) ** 2) / zone.r;
        if (d < 1) f = Math.min(f, d * d * d * d);
    }
    return f;
}

const MAP_HALF = 4000;
const BOUNDARY_START = 3200;

/* ── Hills — NW quadrant snow-capped peaks ─────────────────── */
const HILL_DEFS = [
    { cx: -1600, cz: -1200, peak: 200, radius: 500 },
    { cx: -2100, cz: -1500, peak: 180, radius: 420 },
    { cx: -1300, cz: -1650, peak: 160, radius: 360 },
];

function hillHeight(x, z) {
    let h = 0;
    for (const hill of HILL_DEFS) {
        const d = Math.sqrt((x - hill.cx) ** 2 + (z - hill.cz) ** 2);
        if (d < hill.radius) {
            const t = 1 - d / hill.radius;
            // Smooth bell-curve shape with some noise for realism
            const base = t * t * (3 - 2 * t) * hill.peak;
            const detail = noise(x * 0.008 + hill.cx * 0.001, z * 0.008 + hill.cz * 0.001) * 25 * t;
            h = Math.max(h, base + detail);
        }
    }
    return h;
}

/* ── Canyon — SE quadrant, curving path ────────────────────── */
// Canyon follows a curved centerline with S-bends
function canyonCenterline(t) {
    // Main direction: (1200,1200) to (2800,2800) with sinusoidal curves
    const sx = 1200 + t * 1600;
    const sz = 1200 + t * 1600;
    // Add S-curves perpendicular to the main direction
    const curve1 = Math.sin(t * Math.PI * 2.5) * 180;
    const curve2 = Math.sin(t * Math.PI * 4.0 + 1.2) * 80;
    // Perpendicular direction to (1,1) is (-1,1)/sqrt(2)
    const perpScale = (curve1 + curve2) * 0.7071;
    return { x: sx - perpScale, z: sz + perpScale };
}

const CANYON_SAMPLES = 200; // Fine sampling for smooth distance checks

function canyonCarve(x, z) {
    // Find closest point on curving centerline via sampling
    let minDist = Infinity;
    let bestT = 0;
    for (let i = 0; i <= CANYON_SAMPLES; i++) {
        const t = i / CANYON_SAMPLES;
        const c = canyonCenterline(t);
        const d = (x - c.x) ** 2 + (z - c.z) ** 2;
        if (d < minDist) { minDist = d; bestT = t; }
    }
    const perp = Math.sqrt(minDist);

    // Canyon width varies along its length
    const baseWidth = 55 + 25 * Math.sin(bestT * Math.PI * 3) + noise(bestT * 2000 * 0.005, 0.5) * 15;
    const depth = 200 + noise(bestT * 2000 * 0.003, 1.0) * 50;

    // Taper at ends
    const endTaper = Math.min(1, bestT * 8, (1 - bestT) * 8);

    if (perp > baseWidth + 40) return 0;

    let carve;
    if (perp < baseWidth * 0.45) {
        // Flat canyon floor
        carve = -depth;
    } else if (perp < baseWidth) {
        // Steep inner walls
        const wallT = (perp - baseWidth * 0.45) / (baseWidth * 0.55);
        carve = -depth * (1 - wallT * wallT);
    } else {
        // Smooth transition to surface
        const outerT = (perp - baseWidth) / 40;
        carve = -depth * (1 - outerT) * (1 - outerT) * 0.25;
    }
    return carve * endTaper;
}

export function getHeight(x, z) {
    // Base terrain noise
    let h = noise(x * 0.0015, z * 0.0015) * 50
        + noise(x * 0.005, z * 0.005) * 20
        + noise(x * 0.018, z * 0.018) * 6;
    const mid = Math.sqrt(x * x + z * z);
    if (mid > 350 && mid < 1200) h += noise(x * 0.01, z * 0.01) * 15;

    // Flatten city/airport zones
    h *= flatZoneFactor(x, z);

    // Add hills
    h += hillHeight(x, z);

    // Add canyon carving
    h += canyonCarve(x, z);

    // Boundary walls
    const edge = Math.max(Math.abs(x), Math.abs(z));
    if (edge > BOUNDARY_START) {
        const t = Math.min(1, (edge - BOUNDARY_START) / (MAP_HALF - BOUNDARY_START));
        h += t * t * 200 + noise(x * 0.008, z * 0.008) * 45 * t;
    }

    // Flatten runways — ensure ground doesn't poke through
    h *= runwayFlatFactor(x, z);

    return Math.max(-1, h);
}

/* ══════════════════════════════════════════════════════════════
   MODULE-LEVEL DATA — buildings, villages, trees
   ══════════════════════════════════════════════════════════════ */
const BODY_COLORS = ['#c8c0b8', '#b0a898', '#d0ccc4', '#a8a098', '#8890a0', '#90989c', '#b8b0a0', '#989088', '#707880', '#a0a8b0'];

// ── Buildings (all cities) ────────────────────────────────────
const CITY_DEFS = [
    { cx: 0, cz: 0, grid: 4 },
    { cx: 800, cz: -600, grid: 2 },
    { cx: -2800, cz: 2400, grid: 3 },   // Harbor City
    { cx: 2600, cz: -2200, grid: 2 },   // Mesa Town
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
                    // Skip if on or near any runway
                    if (isNearRunway(x, z, 30)) continue;
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
    // New villages near new cities
    { cx: -2600, cz: 2100, count: 10, spread: 100 },
    { cx: -3000, cz: 2600, count: 8, spread: 85 },
    { cx: 2400, cz: -2000, count: 8, spread: 80 },
    { cx: 2800, cz: -2400, count: 7, spread: 75 },
    // Scattered remote villages
    { cx: -1500, cz: 1200, count: 5, spread: 55 },
    { cx: 1500, cz: -1000, count: 6, spread: 60 },
    { cx: 0, cz: 1800, count: 5, spread: 50 },
    { cx: 0, cz: -1800, count: 4, spread: 50 },
];
const HOUSE_COLORS = ['#c8b8a0', '#b8a888', '#a89878', '#d0c0a8', '#e0d0b8'];
const ROOF_COLORS = ['#8a4030', '#6a5040', '#905838', '#7a6050'];

const ALL_HOUSES = (() => {
    const rng = seededRandom(789);
    const arr = [];
    // Scattered individual homes
    for (let i = 0; i < 100; i++) {
        const x = (rng() - 0.5) * 7000, z = (rng() - 0.5) * 7000;
        if (Math.sqrt(x * x + z * z) < 400) continue;
        if (Math.sqrt((x - 800) ** 2 + (z + 600) ** 2) < 300) continue;
        if (Math.sqrt((x + 2800) ** 2 + (z - 2400) ** 2) < 350) continue;
        if (Math.sqrt((x - 2600) ** 2 + (z + 2200) ** 2) < 300) continue;
        if (Math.max(Math.abs(x), Math.abs(z)) > 3200) continue;
        // Skip if on or near any runway
        if (isNearRunway(x, z, 25)) continue;
        const bH = getHeight(x, z);
        if (bH > 80 || bH < -10) continue;
        const w = 4 + rng() * 4, h = 3 + rng() * 4, d = 4 + rng() * 4;
        arr.push({ x, z, baseH: bH, w, h, d, color: pick(HOUSE_COLORS, rng), roofColor: pick(ROOF_COLORS, rng) });
    }
    // Village clusters
    for (const v of VILLAGE_DEFS) {
        for (let i = 0; i < v.count; i++) {
            const x = v.cx + (rng() - 0.5) * v.spread, z = v.cz + (rng() - 0.5) * v.spread;
            if (isNearRunway(x, z, 25)) continue;
            const bH = getHeight(x, z);
            if (bH > 80 || bH < -10) continue;
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
    for (let i = 0; i < 1200; i++) {
        const x = (rng() - 0.5) * 7000, z = (rng() - 0.5) * 7000;
        // Exclude flat zones (cities, airports)
        if (Math.sqrt(x * x + z * z) < 320) continue;
        if (Math.sqrt((x + 700) ** 2 + (z + 300) ** 2) < 280) continue;
        if (Math.sqrt((x - 600) ** 2 + (z - 500) ** 2) < 160) continue;
        if (Math.sqrt((x - 800) ** 2 + (z + 600) ** 2) < 260) continue;
        if (Math.sqrt((x + 2800) ** 2 + (z - 2400) ** 2) < 330) continue;
        if (Math.sqrt((x - 2600) ** 2 + (z + 2200) ** 2) < 280) continue;
        if (Math.sqrt((x + 1800) ** 2 + (z + 1800) ** 2) < 160) continue;
        if (Math.max(Math.abs(x), Math.abs(z)) > 3400) continue;
        // Skip if on or near any runway
        if (isNearRunway(x, z, 20)) continue;
        const bH = getHeight(x, z);
        if (bH > 140 || bH < -15) continue; // Skip canyon floors and high peaks
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
        return Array.from({ length: 140 }, () => ({
            x: (rng() - 0.5) * 8000,
            y: 220 + rng() * 280,
            z: (rng() - 0.5) * 8000,
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
        <instancedMesh ref={ref} args={[null, null, 140]} frustumCulled={false}>
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
    return (<mesh ref={ref} material={mat} renderOrder={-1}><sphereGeometry args={[7500, 32, 48]} /></mesh>);
}

// ── Ground ────────────────────────────────────────────────────
function Ground() {
    const geometry = useMemo(() => {
        const size = 8000, seg = 450;
        const geo = new THREE.PlaneGeometry(size, size, seg, seg);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const gL = new THREE.Color('#3a6a30'), gH = new THREE.Color('#5a8a40');
        const dirt = new THREE.Color('#7a6a4a'), rock = new THREE.Color('#8a8a80'), snow = new THREE.Color('#e0e0e8');
        const canyonWall = new THREE.Color('#7a5a38'), canyonFloor = new THREE.Color('#8a6a42');
        const canyonDeep = new THREE.Color('#5a3a22');
        const tmp = new THREE.Color();
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i), h = getHeight(x, z);
            pos.setY(i, h);
            if (h < -20) {
                // Deep canyon — brown/tan tones
                const cDepth = Math.min(1, (-h - 20) / 140);
                if (cDepth > 0.5) tmp.lerpColors(canyonFloor, canyonDeep, (cDepth - 0.5) * 2);
                else tmp.lerpColors(canyonWall, canyonFloor, cDepth * 2);
            } else if (h < 3) tmp.copy(gL);
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
        // Harbor City grid
        for (let i = -3; i <= 3; i++) {
            arr.push({ pos: [-2800, 0.4, 2400 + i * 70], rot: 0, len: 500, w: 8 });
            arr.push({ pos: [-2800 + i * 70, 0.4, 2400], rot: Math.PI / 2, len: 500, w: 8 });
        }
        // Mesa Town grid
        for (let i = -2; i <= 2; i++) {
            arr.push({ pos: [2600, 0.4, -2200 + i * 70], rot: 0, len: 380, w: 8 });
            arr.push({ pos: [2600 + i * 70, 0.4, -2200], rot: Math.PI / 2, len: 380, w: 8 });
        }
        // Inter-city highways
        arr.push({ pos: [400, 0.4, -300], rot: Math.atan2(-600, 800), len: 700, w: 10 });
        arr.push({ pos: [-350, 0.4, -150], rot: Math.atan2(-300, -700) + Math.PI / 2, len: 500, w: 7 });
        arr.push({ pos: [300, 0.4, 250], rot: Math.atan2(500, 600), len: 400, w: 5 });
        // Highway from downtown to Harbor City (SW)
        arr.push({ pos: [-1400, 0.4, 1200], rot: Math.atan2(2400, -2800), len: 2200, w: 10 });
        // Highway from city 2 to Mesa Town (NE corner)
        arr.push({ pos: [1700, 0.4, -1400], rot: Math.atan2(-2200 + 600, 2600 - 800), len: 1400, w: 9 });
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
        <group position={[position[0], baseH + 0.2, position[2]]} rotation={[0, rotation, 0]}>
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
        <group position={[position[0], baseH + 0.2, position[2]]} rotation={[0, rotation, 0]}>
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

// ── Canyon River (follows curved centerline) ─────────────────
function CanyonRiver() {
    const ref = useRef();
    const segments = useMemo(() => {
        const arr = [];
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const c = canyonCenterline(t);
            const h = getHeight(c.x, c.z);
            const baseWidth = 55 + 25 * Math.sin(t * Math.PI * 3) + noise(t * 2000 * 0.005, 0.5) * 15;
            arr.push({ x: c.x, z: c.z, y: h + 1.5, width: baseWidth * 0.3, t });
        }
        return arr;
    }, []);

    useFrame(({ clock }) => {
        if (!ref.current) return;
        const t = clock.elapsedTime;
        ref.current.position.y = Math.sin(t * 0.4) * 0.3;
    });

    return (
        <group ref={ref}>
            {segments.map((seg, i) => {
                if (i === segments.length - 1) return null;
                const next = segments[i + 1];
                const cx = (seg.x + next.x) / 2;
                const cz = (seg.z + next.z) / 2;
                const cy = (seg.y + next.y) / 2;
                const dx = next.x - seg.x, dz = next.z - seg.z;
                const len = Math.sqrt(dx * dx + dz * dz) + 2; // slight overlap
                const rot = Math.atan2(dx, dz);
                const w = (seg.width + next.width) / 2;
                return (
                    <mesh key={`rv-${i}`} position={[cx, cy, cz]} rotation={[-Math.PI / 2, 0, rot]} receiveShadow>
                        <planeGeometry args={[w, len]} />
                        <meshStandardMaterial
                            color="#1a5a8a"
                            transparent
                            opacity={0.65}
                            roughness={0.15}
                            metalness={0.4}
                        />
                    </mesh>
                );
            })}
        </group>
    );
}

// ── Water (original small lake) ───────────────────────────────
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
                shadow-camera-far={5000} shadow-camera-left={-2500} shadow-camera-right={2500}
                shadow-camera-top={2500} shadow-camera-bottom={-2500} />
            <directionalLight color="#4060a0" intensity={0.3} position={[-200, 100, 200]} />
            <hemisphereLight skyColor="#6090c0" groundColor="#3a4a30" intensity={0.5} />
            <fog attach="fog" args={['#8aaccc', 800, 7000]} />

            <Ground />
            <Roads />
            <InstancedBuildings />
            <InstancedVillages />
            <InstancedTrees />
            <Water />
            <CanyonRiver />

            <Airport position={[-700, 0, -300]} rotation={0.15} />
            <Airstrip position={[600, 0, 500]} rotation={-0.3} />
            <Airstrip position={[2600, 0, -2200]} rotation={0.1} />
            <Airstrip position={[-2800, 0, 2400]} rotation={-0.2} />
            <Airstrip position={[-1800, 0, -1800]} rotation={0.4} />
        </group>
    );
}
