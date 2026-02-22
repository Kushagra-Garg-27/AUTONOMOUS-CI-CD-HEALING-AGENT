import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 800;
const FIELD_SIZE = 30;

const ParticleField = () => {
  const meshRef = useRef<THREE.Points>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * FIELD_SIZE;
      arr[i * 3 + 1] = (Math.random() - 0.5) * FIELD_SIZE;
      arr[i * 3 + 2] = (Math.random() - 0.5) * FIELD_SIZE * 0.5;
    }
    return arr;
  }, []);

  const velocities = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 0.003;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 0.003;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 0.001;
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const geo = meshRef.current.geometry;
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const t = clock.getElapsedTime();

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 3;
      posArr[ix] += velocities[ix] + Math.sin(t * 0.2 + i * 0.01) * 0.001;
      posArr[ix + 1] +=
        velocities[ix + 1] + Math.cos(t * 0.15 + i * 0.01) * 0.001;
      posArr[ix + 2] += velocities[ix + 2];

      // wrap bounds
      const halfSize = FIELD_SIZE / 2;
      if (posArr[ix] > halfSize) posArr[ix] = -halfSize;
      if (posArr[ix] < -halfSize) posArr[ix] = halfSize;
      if (posArr[ix + 1] > halfSize) posArr[ix + 1] = -halfSize;
      if (posArr[ix + 1] < -halfSize) posArr[ix + 1] = halfSize;
    }

    posAttr.needsUpdate = true;
    meshRef.current.rotation.y = t * 0.015;
    meshRef.current.rotation.x = Math.sin(t * 0.05) * 0.05;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={PARTICLE_COUNT}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color="#00FF7F"
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

const GridPlane = () => {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
      <planeGeometry args={[60, 60, 60, 60]} />
      <meshBasicMaterial color="#00FF7F" wireframe transparent opacity={0.02} />
    </mesh>
  );
};

export const ParticleBackground = () => {
  return (
    <div className="fixed inset-0 -z-10" style={{ willChange: "transform" }}>
      {/* Radial glow underlays */}
      <div className="absolute inset-0">
        <div
          className="absolute"
          style={{
            width: "80vw",
            height: "80vh",
            left: "10%",
            top: "-20%",
            background:
              "radial-gradient(ellipse, rgba(0, 255, 127, 0.06) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
        <div
          className="absolute"
          style={{
            width: "60vw",
            height: "60vh",
            right: "-10%",
            bottom: "-10%",
            background:
              "radial-gradient(ellipse, rgba(0, 229, 255, 0.04) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* Three.js canvas */}
      <Canvas
        camera={{ position: [0, 0, 12], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ParticleField />
        <GridPlane />
      </Canvas>

      {/* CSS grid overlay */}
      <div className="absolute inset-0 cyber-grid-bg opacity-40" />
    </div>
  );
};
