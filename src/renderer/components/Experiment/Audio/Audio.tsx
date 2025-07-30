import * as React from 'react';
import {
  Sheet,
  FormControl,
  Button,
  Typography,
  Box,
  Select,
  Option,
  Input,
} from '@mui/joy';

// Import Three.js and useEffect for visualization
import * as THREE from 'three';

const voices = [
  'af_bella', 'af_heart', 'af_nicole', 'af_nova', 'af_sarah', 'af_sky',
  'am_adam', 'am_michael', 'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis'
];
const models = [
  'mlx-community/Kokoro-82M-4bit',
  'mlx-community/Kokoro-82M-6bit',
  'mlx-community/Kokoro-82M-8bit',
  'mlx-community/Kokoro-82M-bf16'
];

export default function Audio() {
  // State for UI controls
  const [tab, setTab] = React.useState<'tts' | 'upload' | 's2s'>('tts');
  const [text, setText] = React.useState('');
  const [voice, setVoice] = React.useState(voices[0]);
  const [model, setModel] = React.useState(models[0]);
  const [speed, setSpeed] = React.useState(1.0);
  const threeMountRef = React.useRef<HTMLDivElement>(null);

  // Three.js orb setup (dummy visualization)
  React.useEffect(() => {
    const mount = threeMountRef.current;
    if (!mount) return;
    const width = mount.clientWidth || 400;
    const height = 300;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 80;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000);

    mount.appendChild(renderer.domElement);

    const sphereGeom = new THREE.IcosahedronGeometry(30, 4);
    const sphereMat = new THREE.MeshPhongMaterial({ color: 0x0088ff, shininess: 30 });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    scene.add(sphere);

    scene.add(new THREE.AmbientLight(0x404040));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    let frameId: number;
    function animate() {
      frameId = requestAnimationFrame(animate);
      sphere.rotation.y += 0.01;
      sphere.rotation.x += 0.002;
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <Sheet
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '100%',
        overflow: 'hidden',
        bgcolor: 'background.level1',
      }}
    >
      {/* Top Bar Title */}
      <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography level="h4" sx={{ color: 'primary.400' }}>
          3D Orb Audio Visualization
        </Typography>
      </Box>

      {/* Main content area */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        gap: 3,
        p: 3,
        height: '100%',
        bgcolor: 'background.body',
      }}>
        {/* Controls pane */}
        <Sheet sx={{
          minWidth: 340,
          maxWidth: 370,
          bgcolor: 'background.level2',
          borderRadius: 'md',
          p: 3,
          boxShadow: 'md',
        }}>
          <Typography level="h5" sx={{ mb: 2 }}>MLX-Audio Player</Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              size="sm"
              variant={tab === 'tts' ? "solid" : "soft"}
              color={tab === 'tts' ? "primary" : "neutral"}
              onClick={() => setTab('tts')}
            >Text to Speech</Button>
            <Button
              size="sm"
              variant={tab === 'upload' ? "solid" : "soft"}
              color={tab === 'upload' ? "primary" : "neutral"}
              onClick={() => setTab('upload')}
            >File Upload</Button>
            <Button
              size="sm"
              variant={tab === 's2s' ? "solid" : "soft"}
              color={tab === 's2s' ? "primary" : "neutral"}
              onClick={() => setTab('s2s')}
            >Speech to Speech</Button>
          </Box>

          {/* Tab: Text to Speech */}
          {tab === 'tts' && (
            <Box>
              <FormControl sx={{ mb: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>Text to convert:</Typography>
                <Input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="Enter text here..."
                  sx={{ width: '100%' }}
                />
              </FormControl>
              <FormControl sx={{ mb: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>Voice:</Typography>
                <Select value={voice} onChange={(_, v) => setVoice(v!)} sx={{ width: '100%' }}>
                  {voices.map(v => <Option key={v} value={v}>{v}</Option>)}
                </Select>
              </FormControl>
              <FormControl sx={{ mb: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>Model:</Typography>
                <Select value={model} onChange={(_, v) => setModel(v!)} sx={{ width: '100%' }}>
                  {models.map(m => <Option key={m} value={m}>{m}</Option>)}
                </Select>
              </FormControl>
              <FormControl sx={{ mb: 2 }}>
                <Typography level="body-sm">Speech Speed: <b>{speed}x</b></Typography>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Button color="primary">Generate Speech</Button>
                <Button color="info">Open Output Folder</Button>
              </Box>
            </Box>
          )}

          {/* Tab: File Upload */}
          {tab === 'upload' && (
            <Box>
              <FormControl sx={{ mb: 2 }}>
                <Input type="file" sx={{ width: '100%' }} />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button color="success" disabled>Play</Button>
                <Button color="danger" disabled>Stop</Button>
              </Box>
              <Typography level="body-sm" sx={{ mt: 2 }}>Upload an audio file to begin visualization</Typography>
            </Box>
          )}

          {/* Tab: Speech to Speech */}
          {tab === 's2s' && (
            <Box>
              <Typography level="body-md" sx={{ mb: 2 }}>Real-time Speech Conversion</Typography>
              <FormControl sx={{ mb: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>Voice:</Typography>
                <Select sx={{ width: '100%' }}>
                  {voices.map(v => <Option key={v} value={v}>{v}</Option>)}
                </Select>
              </FormControl>
              <FormControl sx={{ mb: 2 }}>
                <Typography level="body-sm" sx={{ mb: 1 }}>Model:</Typography>
                <Select sx={{ width: '100%' }}>
                  <Option value="kokoro_82m_4bit">Kokoro 82M 4bit</Option>
                </Select>
              </FormControl>
              <FormControl sx={{ mb: 2 }}>
                <Typography level="body-sm">Speech Speed: <b>1.0x</b></Typography>
                <input type="range" min={0.5} max={2.0} step={0.1} defaultValue={1.0} style={{ width: '100%' }} />
              </FormControl>
              <Button color="primary">Start Stream</Button>
              <Typography level="body-sm" sx={{ mt: 2, color: 'success.500' }}></Typography>
            </Box>
          )}

        </Sheet>

        {/* Visualization pane */}
        <Box
          sx={{
            flex: 1,
            minWidth: 320,
            minHeight: 320,
            bgcolor: 'background.level1',
            borderRadius: 'md',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'sm',
          }}
        >
          <div ref={threeMountRef} style={{ width: '380px', height: '300px', background: '#111', borderRadius: '10px' }} />
        </Box>
      </Box>
    </Sheet>
  );
}