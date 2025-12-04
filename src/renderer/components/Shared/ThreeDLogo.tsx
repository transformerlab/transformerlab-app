import React, { useRef, useState, useMemo, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useColorScheme } from '@mui/joy/styles';
import * as THREE from 'three';

// --- Configuration ---
const CUBE_SIZE = 2.4;
const TUBE_RADIUS = 0.12;
const BORDER_THICKNESS = 0.12;

const ROTATION_DELAY = 2500;
const ROTATION_SPEED = 3.2;

const INNER_SCALE = 0.5;

// Extension distance to reach the outer wall
const EXTENSION_LENGTH = 0.55 * (CUBE_SIZE / 2);

function useDynamicGeometry() {
  return useMemo(() => {
    // 1. Define Vertices (Corners of the Inner Cube)
    const r = (CUBE_SIZE / 2) * INNER_SCALE;
    const vertices = [
      new THREE.Vector3(r, r, r),
      new THREE.Vector3(r, r, -r),
      new THREE.Vector3(r, -r, r),
      new THREE.Vector3(r, -r, -r),
      new THREE.Vector3(-r, r, r),
      new THREE.Vector3(-r, r, -r),
      new THREE.Vector3(-r, -r, r),
      new THREE.Vector3(-r, -r, -r),
    ];

    // 2. Define Edges
    const edges = [
      // X-Axis
      { v: [0, 4], rot: [0, 0, Math.PI / 2] },
      { v: [1, 5], rot: [0, 0, Math.PI / 2] },
      { v: [2, 6], rot: [0, 0, Math.PI / 2] },
      { v: [3, 7], rot: [0, 0, Math.PI / 2] },
      // Y-Axis
      { v: [0, 2], rot: [0, 0, 0] },
      { v: [1, 3], rot: [0, 0, 0] },
      { v: [4, 6], rot: [0, 0, 0] },
      { v: [5, 7], rot: [0, 0, 0] },
      // Z-Axis
      { v: [0, 1], rot: [Math.PI / 2, 0, 0] },
      { v: [2, 3], rot: [Math.PI / 2, 0, 0] },
      { v: [4, 5], rot: [Math.PI / 2, 0, 0] },
      { v: [6, 7], rot: [Math.PI / 2, 0, 0] },
    ];

    return { vertices, edges };
  }, []);
}

function LogoObject({ isDark }: { isDark: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const barRefs = useRef<(THREE.Mesh | null)[]>([]);

  const { vertices, edges } = useDynamicGeometry();

  const [targetQuat, setTargetQuat] = useState(() => new THREE.Quaternion());
  const lastTumbleRef = useRef(0);

  const viewDir = useMemo(() => new THREE.Vector3(1, 1, 1).normalize(), []);
  const tempVec = useMemo(() => new THREE.Vector3(), []);
  const tempQuat = useMemo(() => new THREE.Quaternion(), []);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // --- 1. ROTATION LOGIC ---
    const now = state.clock.elapsedTime * 1000;
    if (now - lastTumbleRef.current > ROTATION_DELAY) {
      lastTumbleRef.current = now;
      const axes = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1),
      ];
      const randomAxis = axes[Math.floor(Math.random() * axes.length)];
      const angle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 2);
      const step = new THREE.Quaternion().setFromAxisAngle(randomAxis, angle);
      setTargetQuat(targetQuat.clone().multiply(step));
    }
    // Slerp towards target
    groupRef.current.quaternion.slerp(targetQuat, ROTATION_SPEED * delta);

    // --- 2. OPTIMIZED "BREATHING" LOGIC ---
    // Transform view direction into local space
    tempQuat.copy(groupRef.current.quaternion).invert();
    const localView = tempVec.copy(viewDir).applyQuaternion(tempQuat);

    edges.forEach((edge, i) => {
      const mesh = barRefs.current[i];
      if (!mesh) return;

      // Calculate alignment of both ends relative to the camera
      // High Dot (~1.0) = Pointing at camera (Center)
      // Low Dot (~0.33) = Perpendicular (Rim)
      const dotA = Math.abs(
        vertices[edge.v[0]].clone().normalize().dot(localView),
      );
      const dotB = Math.abs(
        vertices[edge.v[1]].clone().normalize().dot(localView),
      );

      const factorA = 1.0 - THREE.MathUtils.smoothstep(dotA, 0.6, 0.9);
      const factorB = 1.0 - THREE.MathUtils.smoothstep(dotB, 0.6, 0.9);

      // Only extend if BOTH ends are moving towards Rim status
      const extensionFactor = factorA * factorB;

      const currentExtension = extensionFactor * EXTENSION_LENGTH;

      // Apply Transformation
      const vA = vertices[edge.v[0]];
      const vB = vertices[edge.v[1]];
      const dir = new THREE.Vector3().subVectors(vB, vA).normalize();

      const tipA = vA.clone().addScaledVector(dir, -currentExtension);
      const tipB = vB.clone().addScaledVector(dir, currentExtension);

      mesh.position.copy(tipA).add(tipB).multiplyScalar(0.5);
      const len = tipA.distanceTo(tipB);
      mesh.scale.set(1, len, 1);
    });
  });

  const mainColor = isDark ? '#ffffff' : '#000000';
  const bgColor = isDark ? '#1a1b1e' : '#ffffff';

  return (
    <group ref={groupRef}>
      <mesh>
        <boxGeometry
          args={[
            CUBE_SIZE * (1 + BORDER_THICKNESS),
            CUBE_SIZE * (1 + BORDER_THICKNESS),
            CUBE_SIZE * (1 + BORDER_THICKNESS),
          ]}
        />
        <meshBasicMaterial color={mainColor} side={THREE.BackSide} />
      </mesh>

      {/* BACKGROUND MASK */}
      <mesh>
        <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
        <meshBasicMaterial color={bgColor} side={THREE.BackSide} />
      </mesh>

      {/* PIPES */}
      {edges.map((edge, i) => (
        <mesh
          key={i}
          ref={(el) => (barRefs.current[i] = el)}
          rotation={edge.rot as any}
        >
          <cylinderGeometry args={[TUBE_RADIUS, TUBE_RADIUS, 1.0, 12]} />
          <meshBasicMaterial color={mainColor} />
        </mesh>
      ))}
    </group>
  );
}

function IsometricCamera({ size }: { size: number }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = size / 5.5;
    cam.position.set(10, 10, 10);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

export default function ThreeDLogo({ size = 160 }: { size?: number }) {
  const { mode } = useColorScheme();
  const isDark = mode === 'dark';

  return (
    <div style={{ width: size, height: size, margin: '0 auto' }}>
      <Canvas orthographic dpr={[1, 2]}>
        <IsometricCamera size={size} />
        <LogoObject isDark={isDark} />
      </Canvas>
    </div>
  );
}
