import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Stack, IconButton, CircularProgress } from '@mui/joy';
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';

interface ModelViewer3DProps {
  modelUrl: string;
  fileType: string;
}

export default function ModelViewer3D({
  modelUrl,
  fileType,
}: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-5, -5, -5);
    scene.add(directionalLight2);

    setIsLoading(true);
    setError(null);

    const loadModel = async () => {
      try {
        const loader = getLoader(fileType);
        if (!loader) {
          throw new Error(`Unsupported file type: ${fileType}`);
        }

        const model = await new Promise<THREE.Object3D>((resolve, reject) => {
          loader.load(
            modelUrl,
            (obj) => resolve(obj),
            undefined,
            (err) => reject(err),
          );
        });

        modelRef.current = model;

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 3 / maxDim;
        model.scale.setScalar(scale);

        model.position.x -= center.x * scale;
        model.position.y -= center.y * scale;
        model.position.z -= center.z * scale;

        scene.add(model);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to load 3D model:', err);
        setError(
          `Failed to load 3D model: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
        setIsLoading(false);
      }
    };

    loadModel();

    const animate = () => {
      requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current)
        return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
      if (modelRef.current) {
        modelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            } else if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            }
          }
        });
      }
    };
  }, [modelUrl, fileType]);

  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current) return;
    const distance = 5 / zoom;
    cameraRef.current.position.set(0, 0, distance);
    controlsRef.current.update();
  }, [zoom]);

  const getLoader = (type: string) => {
    switch (type.toLowerCase()) {
      case 'glb':
      case 'gltf':
        return new GLTFLoader();
      case 'obj':
        return new OBJLoader();
      case 'stl':
        return new STLLoader();
      default:
        return null;
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.2, 5));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.2));
  const handleReset = () => {
    setZoom(1);
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, 5);
    }
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        bgcolor: '#1a1a1a',
        borderRadius: 'sm',
      }}
    >
      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            zIndex: 10,
          }}
        >
          <CircularProgress />
          <Typography level="body-sm" sx={{ color: 'white' }}>
            Loading 3D model...
          </Typography>
        </Box>
      )}

      {error && (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography color="danger">{error}</Typography>
        </Box>
      )}

      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          height: '100%',
        }}
      />

      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: 'absolute',
          bottom: 8,
          right: 8,
        }}
      >
        <IconButton
          size="sm"
          variant="soft"
          onClick={handleZoomIn}
          title="Zoom In"
          sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: 'white' }}
        >
          <ZoomIn size={16} />
        </IconButton>
        <IconButton
          size="sm"
          variant="soft"
          onClick={handleZoomOut}
          title="Zoom Out"
          sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: 'white' }}
        >
          <ZoomOut size={16} />
        </IconButton>
        <IconButton
          size="sm"
          variant="soft"
          onClick={handleReset}
          title="Reset View"
          sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: 'white' }}
        >
          <RotateCcw size={16} />
        </IconButton>
      </Stack>

      <Typography
        level="body-xs"
        sx={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          color: 'rgba(255,255,255,0.5)',
        }}
      >
        Drag to rotate • Scroll to zoom • Right-click to pan
      </Typography>
    </Box>
  );
}
