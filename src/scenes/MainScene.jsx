import React, { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import Terrain from '../components/Terrain.jsx';
import Plane from '../components/Plane.jsx';
import CameraController from '../components/CameraController.jsx';

/*
 * MainScene
 *
 * Assembles the 3D world: Terrain + Plane + Camera.
 * Passes a ref from the Plane group to the CameraController
 * so the camera knows what to follow.
 */
export default function MainScene({ onHud }) {
    const planeGroupRef = useRef();

    return (
        <Canvas
            shadows
            camera={{ fov: 65, near: 1, far: 16000, position: [0, 130, 350] }}
            gl={{ antialias: true, toneMapping: 2 /* ACESFilmicToneMapping */ }}
            style={{ width: '100%', height: '100%' }}
        >
            <Terrain />

            {/* Plane – updates planeGroupRef for camera tracking */}
            <Plane onHud={onHud} parentRef={planeGroupRef} />

            {/* Camera follows the planeGroupRef */}
            <CameraController targetRef={planeGroupRef} />
        </Canvas>
    );
}
