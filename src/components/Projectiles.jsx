import React, { useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ══════════════════════════════════════════════════════════════
   Projectiles — bullet pool with InstancedMesh
   ══════════════════════════════════════════════════════════════ */

const MAX_PROJECTILES = 60;
const BULLET_SPEED = 300;    // units/s
const BULLET_TTL = 3.0;      // seconds
const HIT_RADIUS = 6;        // distance for hit detection
const COOLDOWN = 0.15;       // seconds between shots
const _dummy = new THREE.Object3D();

export default function Projectiles({ networkRef, localPlaneRef }) {
    const meshRef = useRef();
    const bullets = useRef([]); // [{ pos: Vector3, dir: Vector3, age, ownerId, active }]
    const cooldown = useRef(0);
    const keys = useRef({});

    // Keyboard listener for spacebar
    React.useEffect(() => {
        const down = (e) => { keys.current[e.code] = true; };
        const up = (e) => { keys.current[e.code] = false; };
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
        };
    }, []);

    // Initialize bullet pool
    React.useEffect(() => {
        const pool = [];
        for (let i = 0; i < MAX_PROJECTILES; i++) {
            pool.push({
                pos: new THREE.Vector3(0, -9999, 0),
                dir: new THREE.Vector3(0, 0, -1),
                age: 999,
                ownerId: -1,
                active: false,
            });
        }
        bullets.current = pool;

        // Hide all instances initially
        if (meshRef.current) {
            for (let i = 0; i < MAX_PROJECTILES; i++) {
                _dummy.position.set(0, -9999, 0);
                _dummy.scale.set(0, 0, 0);
                _dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, _dummy.matrix);
            }
            meshRef.current.instanceMatrix.needsUpdate = true;
        }
    }, []);

    const spawnBullet = useCallback((ox, oy, oz, dx, dy, dz, ownerId) => {
        // Find inactive slot
        const pool = bullets.current;
        for (let i = 0; i < pool.length; i++) {
            if (!pool[i].active) {
                pool[i].pos.set(ox, oy, oz);
                pool[i].dir.set(dx, dy, dz).normalize();
                pool[i].age = 0;
                pool[i].ownerId = ownerId;
                pool[i].active = true;
                return;
            }
        }
    }, []);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.05);
        const net = networkRef;

        // ── Local shooting (spacebar) ─────────────────────────
        cooldown.current -= dt;
        if (keys.current['Space'] && cooldown.current <= 0 && localPlaneRef?.current) {
            cooldown.current = COOLDOWN;
            const plane = localPlaneRef.current;
            const pos = plane.position;
            const rot = plane.rotation;
            const yaw = rot.y;
            const pitch = rot.x;

            // Bullet direction = plane forward + slight upward from pitch
            const dx = -Math.sin(yaw) * Math.cos(pitch);
            const dy = Math.sin(pitch);
            const dz = -Math.cos(yaw) * Math.cos(pitch);

            // Offset spawn slightly ahead of plane
            const ox = pos.x + dx * 5;
            const oy = pos.y + dy * 5 + 1;
            const oz = pos.z + dz * 5;

            spawnBullet(ox, oy, oz, dx, dy, dz, net.myId.current);
            net.sendShot(ox, oy, oz, dx, dy, dz);
        }

        // ── Spawn remote shots ────────────────────────────────
        if (net.remoteShots.current.length > 0) {
            const now = performance.now();
            for (const shot of net.remoteShots.current) {
                if (now - shot.time < 100) { // only spawn recent shots
                    spawnBullet(shot.ox, shot.oy, shot.oz, shot.dx, shot.dy, shot.dz, shot.playerId);
                }
            }
            // Remove processed
            net.remoteShots.current = net.remoteShots.current.filter(s => now - s.time < 100);
        }

        // ── Update bullets ────────────────────────────────────
        if (!meshRef.current) return;
        const pool = bullets.current;
        let needsUpdate = false;

        for (let i = 0; i < pool.length; i++) {
            const b = pool[i];
            if (!b.active) continue;

            b.age += dt;
            if (b.age > BULLET_TTL) {
                b.active = false;
                _dummy.position.set(0, -9999, 0);
                _dummy.scale.set(0, 0, 0);
                _dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, _dummy.matrix);
                needsUpdate = true;
                continue;
            }

            // Move bullet
            b.pos.addScaledVector(b.dir, BULLET_SPEED * dt);

            // Update instance matrix
            _dummy.position.copy(b.pos);
            _dummy.scale.set(0.3, 0.3, 1.5);
            _dummy.lookAt(b.pos.x + b.dir.x, b.pos.y + b.dir.y, b.pos.z + b.dir.z);
            _dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, _dummy.matrix);
            needsUpdate = true;

            // ── Hit detection against remote planes ───────────
            if (b.ownerId === net.myId.current) {
                // Only local player checks hits (client-authoritative)
                for (const [id, pData] of net.players.current) {
                    if (!pData.state || id === net.myId.current) continue;
                    const s = pData.state;
                    const dx = b.pos.x - s.x, dy = b.pos.y - s.y, dz = b.pos.z - s.z;
                    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (dist < HIT_RADIUS) {
                        net.sendHit(id);
                        b.active = false;
                        _dummy.position.set(0, -9999, 0);
                        _dummy.scale.set(0, 0, 0);
                        _dummy.updateMatrix();
                        meshRef.current.setMatrixAt(i, _dummy.matrix);
                        break;
                    }
                }
            }
        }

        if (needsUpdate) meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, null, MAX_PROJECTILES]} frustumCulled={false}>
            <sphereGeometry args={[1, 4, 3]} />
            <meshStandardMaterial
                color="#f0e060"
                emissive="#f0c020"
                emissiveIntensity={2}
                toneMapped={false}
            />
        </instancedMesh>
    );
}
