import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import Terrain from '../components/Terrain.jsx';
import Plane from '../components/Plane.jsx';
import CameraController from '../components/CameraController.jsx';
import RemotePlanes from '../components/RemotePlanes.jsx';
import Projectiles from '../components/Projectiles.jsx';

/* ══════════════════════════════════════════════════════════════
   DogfightScene — Multiplayer arena
   ══════════════════════════════════════════════════════════════ */
export default function DogfightScene({ onHud, networkRef, spawnPoint }) {
    const planeGroupRef = useRef();

    return (
        <Canvas
            shadows
            camera={{ fov: 65, near: 1, far: 8000, position: [0, 130, 350] }}
            gl={{ antialias: true, toneMapping: 2 }}
            style={{ width: '100%', height: '100%' }}
        >
            <Terrain />

            <Plane
                onHud={onHud}
                parentRef={planeGroupRef}
                networkRef={networkRef}
                spawnPoint={spawnPoint}
            />

            <RemotePlanes
                networkPlayers={networkRef.players}
                hitEvents={networkRef.hitEvents}
            />

            <Projectiles
                networkRef={networkRef}
                localPlaneRef={planeGroupRef}
            />

            <CameraController targetRef={planeGroupRef} />
        </Canvas>
    );
}
