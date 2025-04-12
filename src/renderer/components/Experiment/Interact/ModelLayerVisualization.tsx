import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  IconButton,
  Sheet,
  Slider,
  Stack,
  Typography,
  Select,
  Option,
} from '@mui/joy';
import {
  SendIcon,
  StopCircle,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  ConstructionIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as chatAPI from '../../../lib/transformerlab-api-sdk';
import ChatSettingsOnLeftHandSide from './ChatSettingsOnLeftHandSide';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import useSWR from 'swr';
import { Bar, ResponsiveBar } from '@nivo/bar';
import { ResponsiveLine } from '@nivo/line';

// write a fetcher that uses POST:
const fetcher = (url: string, body: Record<string, unknown>) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).then((res) => res.json());

function SingleLayerHistogram({
  modelName,
  layerName,
}: {
  modelName: string;
  layerName: string;
}) {
  const url = `${chatAPI.INFERENCE_SERVER_URL()}v1/layer_details`;
  const { data } = useSWR(
    [url, { model_name: modelName, layer_name: layerName }],
    ([url, body]) => fetcher(url, body),
  );

  if (!data || !data.histogram) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '150px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        &nbsp;
      </Box>
    );
  }

  const histogramData = data.histogram.map((value: number, index: number) => ({
    bin: `${data.bin_edges[index].toFixed(2)} - ${data.bin_edges[index + 1].toFixed(2)}`,
    count: Math.log10(value + 1), // Convert value to logarithmic scale
  }));

  return (
    <Box
      sx={{
        width: '100%',
        borderRadius: 'md',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Typography level="title-md" sx={{ mb: 1 }}>
        Layer Weights Distribution (log scale):
      </Typography>
      <Bar
        data={histogramData}
        keys={['count']}
        width={300}
        height={150}
        indexBy="bin"
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        padding={0.0}
        colors={{ scheme: 'nivo' }}
        axisBottom={null}
        axisLeft={null}
        enableLabel={false}
        gridXValues={[]}
        gridYValues={[]}
      />
    </Box>
  );
}

export default function ModelLayerVisualization({
  tokenCount,
  stopStreaming,
  generationParameters,
  setGenerationParameters,
  defaultPromptConfigForModel,
  conversations,
  conversationsIsLoading,
  conversationsMutate,
  setChats,
  setConversationId,
  conversationId,
  experimentInfo,
  experimentInfoMutate,
  currentModel,
  currentAdaptor,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modelLayers, setModelLayers] = useState([]);
  const [elevation, setElevation] = useState(30);
  const [azimuth, setAzimuth] = useState(45);
  const [zoom, setZoom] = useState(1.0);
  const [selectedLayer, setSelectedLayer] = useState(null);

  // Canvas ref for Three.js
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const layerCanvasRef = useRef(null);
  // Add these near the top of your component
  const [hoveredLayer, setHoveredLayer] = useState(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const layerMeshesRef = useRef([]);

  let hoveredLayerSavedBeforeNextFrame = null;

  // Add this function to your component
  const updateHoveredLayer = () => {
    if (
      !raycasterRef.current ||
      !mouseRef.current ||
      !cameraRef.current ||
      !sceneRef.current
    )
      return;

    // Update the raycaster with the current mouse position
    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // Calculate intersections with layer objects
    const intersects = raycasterRef.current.intersectObjects(
      layerMeshesRef.current,
    );

    if (intersects.length > 0) {
      // Found a hovered layer
      const hoveredMesh = intersects[0].object as THREE.Mesh;
      hoveredLayerSavedBeforeNextFrame = hoveredMesh;
      setHoveredLayer({
        name: hoveredMesh.userData?.name || '',
        original_name: hoveredMesh.userData?.original_name || '',
        paramCount: hoveredMesh.userData?.paramCount || 0,
        type: hoveredMesh.userData?.type || '',
        index: hoveredMesh.userData?.index || 0,
      });

      // Reset opacity of other layers
      sceneRef.current?.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child !== hoveredMesh) {
          child.material.opacity = 0.4;
          child.material.color.set(child.userData.color);
          child.material.needsUpdate = true;
        } else if (child instanceof THREE.Mesh && child === hoveredMesh) {
          child.material.opacity = 0.9;
          child.material.color.set(child.userData.color);
          child.material.needsUpdate = true;
        }
      });
    } else {
      // No layer being hovered
      // Reset opacity of other layers
      sceneRef.current?.children.forEach((child) => {
        if (child instanceof THREE.Mesh) {
          child.material.opacity = 0.9;
          child.material.color.set(child.userData.color);
          child.material.needsUpdate = true;
        }
      });
      hoveredLayerSavedBeforeNextFrame = null;
      setHoveredLayer(null);
    }
  };

  const handleClick = () => {
    if (hoveredLayerSavedBeforeNextFrame !== null) {
      setSelectedLayer(hoveredLayerSavedBeforeNextFrame);
    } else {
      setSelectedLayer(null);
    }
  };

  // Get current model
  if (!currentModel) {
    currentModel = experimentInfo?.config?.foundation;
  }

  // const currentModel = experimentInfo?.config?.foundation;
  // console.log('FOUNDATION', experimentInfo?.config);

  // Fetch model layer data
  const fetchModelArchitecture = async () => {
    if (!currentModel) return;

    setIsLoading(true);
    setError(null);

    console.log('Fetching model architecture for:', currentModel);

    try {
      const url = `${chatAPI.INFERENCE_SERVER_URL()}v1/model_architecture`;
      console.log(
        'REQUEST BODY',
        JSON.stringify({
          model: currentModel,
          adaptor: currentAdaptor || '',
        }),
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: currentModel,
          adaptor: currentAdaptor || '',
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Server responded with ${response.status}: ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log('DATA', data);
      setModelLayers(data.layers || []);
    } catch (err) {
      setError(`Failed to fetch model architecture: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize 3D visualization
  const initVisualization = () => {
    if (!canvasRef.current || modelLayers.length === 0) return;

    // Clean up existing renderer
    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (
        canvasRef.current instanceof HTMLElement &&
        rendererRef.current?.domElement instanceof HTMLElement &&
        canvasRef.current.contains(rendererRef.current.domElement)
      ) {
        canvasRef.current.removeChild(rendererRef.current.domElement);
      }
    }

    // Create scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    sceneRef.current = scene;

    // Create camera
    const canvas = canvasRef.current;
    const camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );
    // Position camera to view horizontal layout from above
    camera.position.set(0, 5, 10);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.shadowMap.enabled = true; // Enable shadow mapping
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Use soft shadows
    canvasRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.maxDistance = 200; // Set a reasonable max zoom out distance
    controls.update();
    controlsRef.current = controls;

    // Setup raycaster for hover detection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    raycasterRef.current = raycaster;
    mouseRef.current = mouse;

    // Find min/max parameter sizes for scaling
    const paramSizes = modelLayers.map((layer) => layer.param_count);
    const maxParamSize = Math.max(...paramSizes);
    const minParamSize = Math.min(...paramSizes);
    const minWidth = 0.5;
    const maxWidth = 5.0; // Length based on param count
    const thickness = 0.2; // Thickness of the rectangle
    const spacing = 0.05; // Minimal spacing between components for stacked look

    // Create rectangles for each layer - vertical stack layout
    let yOffset = 0;

    // Calculate colors for layers based on their type
    const uniqueTypes = [
      ...new Set(
        modelLayers.map((layer) => layer.name.split('.').slice(-2)[0]),
      ),
    ];

    // Color map for layer types
    const colorMap = {};
    uniqueTypes.forEach((type, index) => {
      colorMap[type] = `hsl(${(index / uniqueTypes.length) * 360}, 70%, 60%)`;
    });

    // Create vertical stack of layers
    modelLayers.forEach((layer, index) => {
      // Calculate width based on parameter count (logarithmic scale)
      const paramCount = layer.param_count;
      const width =
        minWidth +
        ((Math.log(paramCount) - Math.log(minParamSize)) /
          (Math.log(maxParamSize) - Math.log(minParamSize))) *
          (maxWidth - minWidth);

      // Create box geometry and material
      const height = 0.25; // Fixed height for each layer in the stack
      const geometry = new THREE.BoxGeometry(width, height, width);

      // Get color based on layer type
      const layerType = layer.name.split('.').slice(-2)[0];
      const color =
        colorMap[layerType] ||
        `hsl(${(index / modelLayers.length) * 360}, 70%, 60%)`;

      const material = new THREE.MeshLambertMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
      });

      // Create mesh and position it in the stack
      const box = new THREE.Mesh(geometry, material);
      // box.castShadow = true; // Enable shadow casting for the object
      // box.receiveShadow = true; // Enable shadow receiving for the object

      // Position vertically stacked from bottom to top
      box.position.set(0, yOffset + height / 2, 0);

      // console.log('Layer:', layer);

      box.userData = {
        name: layer.name,
        original_name: layer?.original_name,
        paramCount: layer.param_count,
        type: layerType,
        index: index,
        shape: layer?.shape,
      };

      scene.add(box);
      layerMeshesRef.current.push(box);
      yOffset += height + spacing; // Move to next position vertically
    });

    // Add input arrow below the first layer
    if (modelLayers.length > 0) {
      const inputArrowGroup = new THREE.Group();

      // Shaft of the arrow
      const inputShaftGeometry = new THREE.CylinderGeometry(
        0.05,
        0.05,
        0.5,
        16,
      );
      const inputShaftMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      });
      const inputShaft = new THREE.Mesh(inputShaftGeometry, inputShaftMaterial);
      inputShaft.position.y = -0.25; // Center the shaft vertically
      inputArrowGroup.add(inputShaft);

      // Arrowhead
      const inputHeadGeometry = new THREE.ConeGeometry(0.1, 0.2, 16);
      const inputHeadMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      });
      const inputHead = new THREE.Mesh(inputHeadGeometry, inputHeadMaterial);
      inputHead.position.y = -0.6; // Position the arrowhead below the shaft
      inputHead.rotation.x = Math.PI; // Flip the cone to point upward
      inputArrowGroup.add(inputHead);

      inputArrowGroup.rotation.x = Math.PI; // Point the arrow upward
      inputArrowGroup.position.set(0, -0.75, 0); // Position below the first layer
      scene.add(inputArrowGroup);
    }

    // Add output arrow after the last layer
    if (modelLayers.length > 0) {
      const outputArrowGroup = new THREE.Group();

      // Shaft of the arrow
      const outputShaftGeometry = new THREE.CylinderGeometry(
        0.05,
        0.05,
        0.5,
        16,
      );
      const outputShaftMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      });
      const outputShaft = new THREE.Mesh(
        outputShaftGeometry,
        outputShaftMaterial,
      );
      outputShaft.position.y = 0.25; // Center the shaft vertically
      outputArrowGroup.add(outputShaft);

      // Arrowhead
      const outputHeadGeometry = new THREE.ConeGeometry(0.1, 0.2, 16);
      const outputHeadMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
      });
      const outputHead = new THREE.Mesh(outputHeadGeometry, outputHeadMaterial);
      outputHead.position.y = 0.6; // Position the arrowhead above the shaft
      outputArrowGroup.add(outputHead);

      outputArrowGroup.position.set(0, yOffset + 0.5, 0); // Position above the last layer
      scene.add(outputArrowGroup);
    }

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 30); // Increased intensity to brighten up the objects
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Slightly increased intensity
    directionalLight.position.set(1, yOffset + 5, 4);
    // directionalLight.castShadow = true; // Enable shadow casting for the light
    directionalLight.shadow.mapSize.width = 1024; // Shadow map resolution
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = yOffset * 2;
    // scene.add(directionalLight);

    // Add a visible representation for the directional light
    const lightHelperGeometry = new THREE.SphereGeometry(3, 16, 16); // Small sphere
    const lightHelperMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
    });
    const lightHelper = new THREE.Mesh(
      lightHelperGeometry,
      lightHelperMaterial,
    );
    lightHelper.position.copy(directionalLight.position); // Match the light's position
    // scene.add(lightHelper);

    // Add ground plane to receive shadows
    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.5 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to lie flat
    ground.position.y = 0; // Position at the base of the stack
    ground.receiveShadow = true; // Enable shadow receiving
    scene.add(ground);

    // Adjust camera position for better viewing of vertical stack
    const totalHeight = yOffset;
    camera.position.set(8, totalHeight / 2, 8);
    camera.lookAt(new THREE.Vector3(0, totalHeight / 2, 0)); // Look at the middle of the stack
    controls.target.set(0, totalHeight / 2, 0);
    controls.update();

    // Add hover detection
    const handleMouseMove = (event) => {
      // Calculate mouse position in normalized device coordinates
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update the hoveredLayer state
      updateHoveredLayer();
    };

    // Add hover detection events
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('click', handleClick);

    // Animation function with hover detection
    const animate = () => {
      requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    // Start animation
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current)
        return;

      const canvas = canvasRef.current;
      cameraRef.current.aspect = canvas.clientWidth / canvas.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(canvas.clientWidth, canvas.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('click', handleClick);
      layerMeshesRef.current = [];
    };
  };

  // Update camera view based on elevation and azimuth
  const updateCameraView = () => {
    if (!controlsRef.current || !cameraRef.current) return;

    // Convert degrees to radians
    const elevRad = (elevation * Math.PI) / 180;
    const azimRad = (azimuth * Math.PI) / 180;

    // Calculate new camera position
    const distance = 10 / zoom;
    const x = distance * Math.sin(azimRad) * Math.cos(elevRad);
    const y = distance * Math.sin(elevRad);
    const z = distance * Math.cos(azimRad) * Math.cos(elevRad);

    // Update camera position
    cameraRef.current.position.set(x, y, z);
    cameraRef.current.lookAt(0, 0, 0);
    controlsRef.current.update();
  };

  // Effect to fetch data when model changes
  useEffect(() => {
    if (currentModel) {
      fetchModelArchitecture();
    }
  }, [currentModel]);

  // Effect to initialize visualization when data is loaded
  useEffect(() => {
    if (modelLayers.length > 0) {
      initVisualization();
    }
  }, [modelLayers]);

  // Effect to update camera when controls change
  useEffect(() => {
    updateCameraView();
  }, [elevation, azimuth, zoom]);

  const renderSelectedLayer = () => {
    if (!layerCanvasRef.current || !selectedLayer) return;

    // Clear the canvas
    while (layerCanvasRef.current.firstChild) {
      layerCanvasRef.current.removeChild(layerCanvasRef.current.firstChild);
    }

    // Create a new scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Create a camera
    const canvas = layerCanvasRef.current;
    const camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 2, 0.5);

    // Create a renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    layerCanvasRef.current.appendChild(renderer.domElement);

    // Add orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Get the grid size from the shape of layer in the userData?.shape:
    const shape = selectedLayer?.userData?.shape;
    // break the shape text which looks like (576, 192) to width and length.
    // If the shape looks like (415,) then set the width to 415 and length to 1.
    const shapeArray = shape.replace(/[()]/g, '').split(',').map(Number);
    let width = shapeArray[0] || 1;
    let length = shapeArray[1] || 1;
    width = Math.ceil(Math.sqrt(width));
    length = Math.ceil(Math.sqrt(length));
    // clamp width and length to max 40:
    const maxSize = 40;
    width = Math.min(width, maxSize);
    length = Math.min(length, maxSize);

    const boxSize = 0.1;
    const spacing = 0.0; // Space between boxes
    const color = selectedLayer?.material?.color || 0x0077ff;
    // change opacity to match the selected layer:
    const opacity = selectedLayer?.material?.opacity || 0.5;
    const transparent = selectedLayer?.material?.transparent || true;

    const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const material = new THREE.MeshLambertMaterial({
      color,
      opacity,
      transparent,
    });

    for (let i = 0; i < width; i++) {
      for (let j = 0; j < length; j++) {
        const box = new THREE.Mesh(geometry, material);
        box.position.set(
          i * (boxSize + spacing) - (width * (boxSize + spacing)) / 2,
          0,
          j * (boxSize + spacing) - (length * (boxSize + spacing)) / 2,
        );
        scene.add(box);
      }
    }

    // Point the camera at the center of the grid
    camera.lookAt(0, 0, 0);

    // zoom out the camera to fit the entire grid:
    const maxDimension = Math.max(width, length);
    const cameraDistance = maxDimension * (boxSize + spacing) * 0.75;
    camera.position.set(0, cameraDistance, cameraDistance);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);

    controls.update();

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // Render the scene
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };

    animate();
  };

  // Effect to render the selected layer when it changes
  useEffect(() => {
    renderSelectedLayer();
  }, [selectedLayer]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchModelArchitecture();
  };

  // Handle zoom controls
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev * 1.2, 5.0));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev / 1.2, 0.5));
  };

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        overflow: 'hidden',
        gap: 2,
      }}
    >
      {/* <ChatSettingsOnLeftHandSide
        generationParameters={generationParameters}
        setGenerationParameters={setGenerationParameters}
        tokenCount={tokenCount}
        defaultPromptConfigForModel={defaultPromptConfigForModel}
        conversations={conversations}
        conversationsIsLoading={conversationsIsLoading}
        conversationsMutate={conversationsMutate}
        setChats={setChats}
        setConversationId={setConversationId}
        conversationId={conversationId}
        experimentInfo={experimentInfo}
        experimentInfoMutate={experimentInfoMutate}
      /> */}

      <Sheet
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            overflow: 'hidden',
            marginBottom: 1,
          }}
        >
          <Typography level="h2">Model Layer Visualization</Typography>

          <Stack direction="row" spacing={1}>
            {/* <IconButton
              color="neutral"
              onClick={handleZoomOut}
              aria-label="Zoom out"
            >
              <ZoomOut />
            </IconButton>

            <IconButton
              color="neutral"
              onClick={handleZoomIn}
              aria-label="Zoom in"
            >
              <ZoomIn />
            </IconButton> */}

            <Button
              color="neutral"
              variant="plain"
              size="sm"
              startDecorator={
                isLoading ? (
                  <CircularProgress thickness={2} size="sm" color="neutral" />
                ) : (
                  <RotateCcw size="20px" />
                )
              }
              onClick={handleRefresh}
              disabled={isLoading}
            >
              Refresh
            </Button>
          </Stack>
        </Box>

        {error && (
          <Alert color="danger" sx={{ mx: 2, mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box
          sx={{
            flexGrow: 1,
            pt: 0,
            pb: 1,
            display: 'flex',
            flexDirection: 'row',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <CircularProgress size="lg" />
            </Box>
          ) : (
            <Box
              sx={{ width: '100%', height: '100%', display: 'flex', gap: 2 }}
            >
              {/* Add this after the canvas box in your return statement */}
              {hoveredLayer && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: '1rem',
                    left: '1rem',
                    width: '300px',
                    bgcolor: 'rgba(255,255,255,0.9)',
                    p: 2,
                    borderRadius: 'md',
                    backdropFilter: 'blur(5px)',
                    boxShadow: 'sm',
                    zIndex: 1000,
                  }}
                >
                  <Typography
                    level="title-md"
                    sx={{ mb: 1, color: 'primary.500' }}
                  >
                    Layer Information
                  </Typography>
                  <Typography level="body-sm" sx={{ mb: 0.5 }}>
                    <strong>Name:</strong> {hoveredLayer.original_name}
                  </Typography>
                  <Typography level="body-sm" sx={{ mb: 0.5 }}>
                    <strong>Type:</strong> {hoveredLayer.type}
                  </Typography>
                  <Typography level="body-sm" sx={{ mb: 0.5 }}>
                    <strong>Parameters:</strong>{' '}
                    {hoveredLayer.paramCount.toLocaleString()}
                  </Typography>
                  <Typography level="body-sm">
                    <strong>Layer Index:</strong> {hoveredLayer.index + 1} of{' '}
                    {modelLayers.length}
                  </Typography>
                </Box>
              )}
              <Box
                ref={canvasRef}
                sx={{
                  flexGrow: 1,
                  height: '100%',
                  bgcolor: 'background.level1',
                  borderRadius: 'md',
                  overflow: 'hidden',
                }}
              />
              <Box
                sx={{
                  width: '300px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
                id="detailed-layer"
              >
                <Typography level="title-md" sx={{ mb: 1 }}>
                  Layer Details
                </Typography>
                <Box
                  ref={layerCanvasRef}
                  sx={{
                    width: '100%',
                    height: '200px',
                    bgcolor: 'background.level1',
                    borderRadius: 'md',
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                />
                {selectedLayer && (
                  <>
                    <SingleLayerHistogram
                      modelName={currentModel}
                      layerName={selectedLayer?.userData?.original_name}
                    />
                    <Typography level="body-md">
                      Name: {selectedLayer?.userData?.original_name}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography level="body-md">
                          <strong>Type:</strong> {selectedLayer?.userData?.type}
                        </Typography>
                        <Typography level="body-md">
                          <strong>Parameters:</strong>{' '}
                          {selectedLayer?.userData?.paramCount}
                        </Typography>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography level="body-md">
                          <strong>Index:</strong>{' '}
                          {selectedLayer?.userData?.index}
                        </Typography>
                        <Typography level="body-md">
                          <strong>Shape:</strong>{' '}
                          {selectedLayer?.userData?.shape}
                        </Typography>
                      </Box>
                    </Box>
                  </>
                )}
              </Box>
            </Box>
          )}

          {modelLayers.length > 0 && (
            <Box
              sx={{
                position: 'absolute',
                bottom: '1rem',
                left: '1rem',
                maxWidth: '300px',
                bgcolor: 'rgba(255,255,255,0.8)',
                p: 2,
                borderRadius: 'md',
                backdropFilter: 'blur(5px)',
              }}
            >
              <Typography level="body-sm" sx={{ mb: 1 }}>
                <strong>Model:</strong> {currentModel.split('/').pop()}
              </Typography>
              <Typography level="body-sm">
                <strong>Total Layers:</strong> {modelLayers.length}
              </Typography>
            </Box>
          )}
        </Box>
      </Sheet>
    </Sheet>
  );
}
