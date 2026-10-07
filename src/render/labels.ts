import { CanvasTexture, Group, Mesh, MeshBasicNodeMaterial, PlaneGeometry, SRGBColorSpace, type Camera } from 'three/webgpu';
import { texture, vec4 } from 'three/tsl';

const COLUMNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const textures = new Map<string, CanvasTexture>();
function labelTexture(text: string) {
  let t = textures.get(text);
  if (!t) textures.set(text, (t = makeLabelTexture(text)));
  return t;
}

function makeLabelTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 84px "Helvetica Neue", Arial, sans-serif';
  g.shadowColor = 'rgba(0,0,0,0.55)';
  g.shadowBlur = 10;
  g.shadowOffsetY = 4;
  g.fillStyle = '#f3f7fa';
  g.fillText(text, 64, 68);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * Column letters along the far edge and row numbers down the left edge,
 * floating just above the water and turned to face the camera.
 */
export function createBoardLabels(initialSize: number) {
  const group = new Group();
  group.name = 'board-labels';
  const geo = new PlaneGeometry(0.62, 0.62);
  let half = initialSize / 2;
  const add = (text: string, x: number, z: number) => {
    const tex = texture(labelTexture(text));
    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    m.colorNode = vec4(tex.rgb.mul(1.15), 1);
    m.opacityNode = tex.a.mul(0.92);
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, 0.22, z);
    mesh.renderOrder = 1;
    group.add(mesh);
  };
  /** Rebuild the letters and numbers for an n × n board. */
  function setSize(size: number) {
    for (const m of [...group.children] as Mesh[]) {
      (m.material as MeshBasicNodeMaterial).dispose();
      group.remove(m);
    }
    half = size / 2;
    for (let i = 0; i < size; i++) {
      add(COLUMNS[i], i - half + 0.5, -half - 0.55);
      add(String(i + 1), -half - 0.6, i - half + 0.5);
    }
  }
  setSize(initialSize);
  /** Face the camera from any orbit angle (yaw and pitch, no roll). */
  function update(camera: Camera) {
    for (const m of group.children) m.quaternion.copy(camera.quaternion);
  }

  return { group, update, setSize };
}
