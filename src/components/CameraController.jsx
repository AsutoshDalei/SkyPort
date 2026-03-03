import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* ── Pre-allocated vectors ───────────────────────────────────── */
const _camOffset = new THREE.Vector3();
const _idealCamPos = new THREE.Vector3();
const _idealLook = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();

/*
 * CameraController
 *
 * Third-person camera that follows a target group (the plane).
 * Uses smooth lerp interpolation for natural, cinematic feel.
 *
 * Props:
 *   targetRef  – React ref to the plane's <group>
 */
export default function CameraController({ targetRef }) {
    const { camera } = useThree();

    // Smoothed camera state
    const camPos = useRef(new THREE.Vector3(0, 130, 350));
    const camLook = useRef(new THREE.Vector3(0, 100, 300));
    const initialized = useRef(false);

    useFrame((_, delta) => {
        if (!targetRef.current) return;
        const dt = Math.min(delta, 0.05);

        const target = targetRef.current;
        const planePos = target.position;
        const planeRot = target.rotation;

        // Extract yaw from the plane's YXZ euler rotation
        const yaw = planeRot.y;

        // Camera sits behind and above the plane
        const camDist = 40;
        const camHeight = 18;

        _camOffset.set(0, camHeight, camDist);
        _camOffset.applyAxisAngle(_yAxis, yaw);

        _idealCamPos.copy(planePos).add(_camOffset);

        // Look target: slightly ahead of the plane
        _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        _idealLook.copy(planePos).addScaledVector(_fwd, 10);
        _idealLook.y += 3;

        // On first frame, snap camera to position
        if (!initialized.current) {
            camPos.current.copy(_idealCamPos);
            camLook.current.copy(_idealLook);
            camera.position.copy(camPos.current);
            camera.lookAt(camLook.current);
            initialized.current = true;
            return;
        }

        // Smooth interpolation with different rates for position and look
        const posLerpXZ = 3.0 * dt;
        const posLerpY = 2.5 * dt;
        const lookLerp = 5.0 * dt;

        camPos.current.x += (_idealCamPos.x - camPos.current.x) * posLerpXZ;
        camPos.current.z += (_idealCamPos.z - camPos.current.z) * posLerpXZ;
        camPos.current.y += (_idealCamPos.y - camPos.current.y) * posLerpY;

        camLook.current.lerp(_idealLook, lookLerp);

        camera.position.copy(camPos.current);
        camera.lookAt(camLook.current);
    });

    return null; // This component only manipulates the camera, no mesh output
}
