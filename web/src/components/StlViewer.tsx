import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

interface Props {
  url: string;
}

/**
 * Viewer 3D per file .stl. Carica il file via fetch con cookie (credentials)
 * e lo parsa con STLLoader. Centratura automatica + framing della camera in
 * base alla bounding box. OrbitControls per ruotare/zoomare con il mouse.
 */
export function StlViewer({ url }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1ebde);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.1,
      5000,
    );
    camera.position.set(0, 0, 200);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Illuminazione: ambient + 2 direzionali per dare volume al modello
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(1, 1, 1);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-1, -0.5, 0.7);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    let mesh: THREE.Mesh | null = null;
    let cancelled = false;
    let frameId = 0;

    function animate() {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(container);

    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buffer) => {
        if (cancelled) return;
        const loader = new STLLoader();
        const geometry = loader.parse(buffer);

        // Centra la geometria sull'origine
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox!;
        const size = new THREE.Vector3();
        bbox.getSize(size);
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
        geometry.computeVertexNormals();

        // Frame della camera in modo che il modello entri tutto
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        const cameraZ = Math.max(1, Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.6);
        camera.position.set(cameraZ, cameraZ * 0.6, cameraZ);
        camera.near = cameraZ / 100;
        camera.far = cameraZ * 100;
        camera.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        const material = new THREE.MeshPhongMaterial({
          color: 0xb0bcd2,
          specular: 0x222222,
          shininess: 80,
          flatShading: false,
        });
        mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Errore nel caricamento');
        setLoading(false);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      ro.disconnect();
      controls.dispose();
      if (mesh) {
        mesh.geometry.dispose();
        const m = mesh.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [url]);

  return (
    <div className="stl-viewer-wrap">
      <div ref={containerRef} className="stl-viewer" />
      {loading && !error && <div className="stl-status muted">Caricamento modello…</div>}
      {error && <div className="stl-status error">Errore: {error}</div>}
      <div className="stl-hint muted">Trascina per ruotare · scroll per zoom · click destro per traslare</div>
    </div>
  );
}
