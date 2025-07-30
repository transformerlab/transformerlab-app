import React, { useRef, useState, useEffect } from "react";

// You need to install three.js as a dependency:
// npm install three

import * as THREE from "three";

const voices = [
  "af_bella", "af_heart", "af_nicole", "af_nova", "af_sarah", "af_sky",
  "am_adam", "am_michael", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"
];
const models = [
  "mlx-community/Kokoro-82M-4bit",
  "mlx-community/Kokoro-82M-6bit",
  "mlx-community/Kokoro-82M-8bit",
  "mlx-community/Kokoro-82M-bf16"
];

export default function Audio() {
  const [tab, setTab] = useState<"tts"|"upload"|"s2s">("tts");
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(voices[0]);
  const [model, setModel] = useState(models[0]);
  const [speed, setSpeed] = useState(1.0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [status, setStatus] = useState("Upload an audio file to begin visualization");
  const audioRef = useRef<HTMLAudioElement>(null);
  const threeCanvasRef = useRef<HTMLDivElement>(null);

  // --- Three.js setup (simple orb with pulsing animation) ---
  useEffect(() => {
    if (!threeCanvasRef.current) return;
    let mount = threeCanvasRef.current;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000);

    mount.appendChild(renderer.domElement);

    camera.position.z = 100;
    // Simple light
    scene.add(new THREE.AmbientLight(0x404040));
    const sphereGeom = new THREE.IcosahedronGeometry(30, 4);
    const sphereMat = new THREE.MeshPhongMaterial({ color: 0x0088ff, shininess: 30 });
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    scene.add(sphere);

    let animationId: number;
    function animate() {
      animationId = requestAnimationFrame(animate);
      sphere.rotation.y += 0.01;
      sphere.rotation.x += 0.002;
      renderer.render(scene, camera);
    }
    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
      background: "#000", fontFamily: "Arial, sans-serif"
    }}>
      <div id="controls"
        style={{
          position: "fixed", top: 20, left: 20, zIndex: 10, color: "white",
          background: "rgba(0,0,0,0.5)", padding: 15, borderRadius: 10, maxWidth: 350
        }}>
        <h1>MLX-Audio Player</h1>
        <div style={{
          display: "flex", gap: 4, marginBottom: 12, borderBottom: "1px solid #444"
        }}>
          <button
            className={tab === "tts" ? "active" : ""}
            onClick={() => setTab("tts")}
            style={{ background: tab === "tts" ? "#4CAF50" : "#333", color: "white", border: "none", padding: "8px 16px", borderRadius: "5px 5px 0 0" }}
          >Text to Speech</button>
          <button
            className={tab === "upload" ? "active" : ""}
            onClick={() => setTab("upload")}
            style={{ background: tab === "upload" ? "#4CAF50" : "#333", color: "white", border: "none", padding: "8px 16px", borderRadius: "5px 5px 0 0" }}
          >File Upload</button>
          <button
            className={tab === "s2s" ? "active" : ""}
            onClick={() => setTab("s2s")}
            style={{ background: tab === "s2s" ? "#4CAF50" : "#333", color: "white", border: "none", padding: "8px 16px", borderRadius: "5px 5px 0 0" }}
          >Speech to Speech</button>
        </div>

        {/* Text to speech tab */}
        {tab === "tts" && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label>Text to convert:</label>
              <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Enter text here..." style={{ width: "100%" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Voice:</label>
              <select value={voice} onChange={e => setVoice(e.target.value)} style={{ width: "100%" }}>
                {voices.map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Model:</label>
              <select value={model} onChange={e => setModel(e.target.value)} style={{ width: "100%" }}>
                {models.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label>Speech Speed: <span>{speed}x</span></label>
              <input type="range" min={0.5} max={2.0} step={0.1} value={speed}
                onChange={e => setSpeed(Number(e.target.value))} />
            </div>
            <button style={{ background: "#4CAF50", color: "white", borderRadius: 4, border: "none", padding: "8px 16px", marginRight: 8 }}>Generate Speech</button>
            <button style={{ background: "#2196F3", color: "white", borderRadius: 4, border: "none", padding: "8px 16px" }}>Open Output Folder</button>
          </div>
        )}

        {/* File upload tab */}
        {tab === "upload" && (
          <div>
            <input type="file" accept="audio/*" onChange={e => {
              if (e.target.files && e.target.files[0]) setUploadFile(e.target.files[0]);
            }} />
            <div style={{ marginTop: 10 }}>
              <button disabled={!uploadFile} style={{ background: "#4CAF50", color: "white", borderRadius: 4, border: "none", padding: "8px 16px", marginRight: 8 }}>Play</button>
              <button disabled style={{ background: "#f44336", color: "white", borderRadius: 4, border: "none", padding: "8px 16px" }}>Stop</button>
            </div>
            <div>{status}</div>
          </div>
        )}

        {/* Speech to speech tab */}
        {tab === "s2s" && (
          <div>
            <h3>Real-time Speech Conversion</h3>
            <div>
              <label>Voice:</label>
              <select style={{ width: "100%" }}>{voices.map(v => <option key={v}>{v}</option>)}</select>
            </div>
            <div>
              <label>Model:</label>
              <select style={{ width: "100%" }}><option value="kokoro_82m_4bit">Kokoro 82M 4bit</option></select>
            </div>
            <div>
              <label>Speech Speed: <span>1.0x</span></label>
              <input type="range" min={0.5} max={2.0} step={0.1} defaultValue={1.0} />
            </div>
            <button style={{ background: "#4CAF50", color: "white", borderRadius: 4, border: "none", padding: "8px 16px" }}>Start Stream</button>
            <div style={{ marginTop: 10, color: "#4CAF50", fontWeight: "bold" }}></div>
          </div>
        )}

        <audio ref={audioRef} autoPlay style={{ display: "none" }} />
      </div>
      <div ref={threeCanvasRef} style={{
        position: "absolute", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 1
      }} />
    </div>
  );
}