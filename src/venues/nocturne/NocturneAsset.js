import * as THREE from 'three';
import { NocturneLighting } from './NocturneLighting';
import { NocturneScreens } from './NocturneScreens';

// Procedural visual asset extracted from the existing NOCTURNE donor.
// All mutable state (including the seeded generator) belongs to this instance.
// No page bootstrap, camera controls, audio, globals or animation loop.
export function createNocturneAsset(renderer) {
  const T = THREE,
    PI = Math.PI,
    TAU = PI * 2,
    RAD = PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const finite = (v, name) => {
    const n = Number(v);
    if (!Number.isFinite(n))
      throw new TypeError(name + " 必须是有限数值");
    return n;
  };
  const vec = (v) => {
    if (v?.isVector3) return v.clone();
    if (Array.isArray(v) && v.length >= 3)
      return new T.Vector3(
        ...v.slice(0, 3).map((n) => finite(n, "坐标")),
      );
    if (v && "x" in v)
      return new T.Vector3(
        finite(v.x, "x"),
        finite(v.y, "y"),
        finite(v.z, "z"),
      );
    throw new TypeError("需要 Vector3 或 [x,y,z]");
  };
  const color = (v) => {
    if (v?.isColor) return v.clone();
    return new T.Color(v);
  };
  let randomSeed = 87241;
  function rand() {
    randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  }
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  function material(c, roughness = 0.6, metalness = 0.25) {
    return new T.MeshStandardMaterial({ color: c, roughness, metalness });
  }
  function mesh(geo, mat, parent, pos) {
    const m = new T.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    parent.add(m);
    return m;
  }
  function box(parent, size, pos, mat, rot) {
    const m = mesh(new T.BoxGeometry(...size), mat, parent, pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  function cylinder(parent, r, h, pos, mat) {
    return mesh(new T.CylinderGeometry(r, r, h, 16), mat, parent, pos);
  }
  function emissive(c, opacity = 1) {
    return new T.MeshBasicMaterial({
      color: c,
      transparent: opacity < 1,
      opacity,
      toneMapped: false,
    });
  }
  function canvasTexture(c) {
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }
  function labelTexture(
    text,
    w = 512,
    h = 128,
    fg = "#a8b8c8",
    bg = "#0b1018",
  ) {
    const c = canvas(w, h),
      x = c.getContext("2d");
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = "500 " + Math.floor(h * 0.41) + "px sans-serif";
    x.fillStyle = fg;
    x.fillText(text, w / 2, h / 2, w * 0.9);
    return canvasTexture(c);
  }

  // 静态场馆统一实例化：座椅、桁架和结构不会产生数千个 draw call。
  class StaticBatch {
    constructor(scene) {
      this.scene = scene;
      this.items = new Map();
      this.geos = {
        box: new T.BoxGeometry(1, 1, 1),
        rod: new T.CylinderGeometry(1, 1, 1, 8),
        round: new T.CylinderGeometry(1, 1, 1, 20),
      };
      this.dummy = new T.Object3D();
    }
    put(type, mat, pos, scale, rotation) {
      const key = type + mat.uuid;
      if (!this.items.has(key))
        this.items.set(key, { geo: this.geos[type], mat, matrices: [] });
      this.dummy.position.set(...pos);
      this.dummy.scale.set(...scale);
      this.dummy.quaternion.identity();
      if (rotation?.isQuaternion) this.dummy.quaternion.copy(rotation);
      else if (rotation) this.dummy.rotation.set(...rotation);
      this.dummy.updateMatrix();
      this.items.get(key).matrices.push(this.dummy.matrix.clone());
    }
    box(size, pos, mat, rot) {
      this.put("box", mat, pos, size, rot);
    }
    rod(a, b, r, mat) {
      const p = vec(a),
        q = vec(b),
        d = q.clone().sub(p);
      this.put(
        "rod",
        mat,
        p.add(q).multiplyScalar(0.5).toArray(),
        [r, d.length(), r],
        new T.Quaternion().setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          d.normalize(),
        ),
      );
    }
    truss(a, b, size = 0.48) {
      const start = vec(a),
        end = vec(b),
        length = start.distanceTo(end),
        axis = end.clone().sub(start).normalize();
      const basis = new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        axis,
      );
      const pt = (x, y, z) =>
        new T.Vector3(x, y, z)
          .applyQuaternion(basis)
          .add(start)
          .toArray();
      const half = size / 2,
        n = Math.ceil(length / 1.25);
      for (const x of [-half, half])
        for (const z of [-half, half])
          this.rod(
            pt(x, 0, z),
            pt(x, length, z),
            0.044,
            this.scene.userData.mats.truss,
          );
      for (let i = 0; i < n; i++) {
        const y = (i * length) / n,
          y1 = ((i + 1) * length) / n;
        for (const s of [-half, half]) {
          this.rod(
            pt(s, y, -half),
            pt(s, y1, half),
            0.018,
            this.scene.userData.mats.truss,
          );
          this.rod(
            pt(-half, y, s),
            pt(half, y1, s),
            0.018,
            this.scene.userData.mats.truss,
          );
          this.rod(
            pt(s, y, -half),
            pt(s, y, half),
            0.021,
            this.scene.userData.mats.truss,
          );
          this.rod(
            pt(-half, y, s),
            pt(half, y, s),
            0.021,
            this.scene.userData.mats.truss,
          );
        }
      }
    }
    flush() {
      for (const b of this.items.values()) {
        const m = new T.InstancedMesh(b.geo, b.mat, b.matrices.length);
        b.matrices.forEach((v, i) => m.setMatrixAt(i, v));
        m.instanceMatrix.needsUpdate = true;
        m.receiveShadow = true;
        this.scene.add(m);
      }
      this.items.clear();
    }
  }

  // 摄像机：默认是置身场馆的 360° 原地环顾，也可切换目标轨道与自由移动。
  class GlowPass {
    constructor(renderer) {
      this.renderer = renderer;
      const type = renderer.capabilities.isWebGL2
        ? T.HalfFloatType
        : T.UnsignedByteType;
      this.sceneRT = new T.WebGLRenderTarget(1, 1, {
        type,
        depthBuffer: true,
      });
      this.ping = new T.WebGLRenderTarget(1, 1, {
        type,
        depthBuffer: false,
      });
      this.pong = this.ping.clone();
      this.sceneRT.samples = renderer.capabilities.isWebGL2 ? 4 : 0;
      this.scene = new T.Scene();
      this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = mesh(new T.PlaneGeometry(2, 2), null, this.scene);
      const vertex =
        "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}";
      this.extract = new T.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: { source: { value: null } },
        vertexShader: vertex,
        fragmentShader:
          "uniform sampler2D source; varying vec2 vUv;void main(){vec3 c=texture2D(source,vUv).rgb;float l=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.65,1.8,l),1.);}",
      });
      this.blur = new T.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          source: { value: null },
          stepUV: { value: new T.Vector2() },
        },
        vertexShader: vertex,
        fragmentShader:
          "uniform sampler2D source;uniform vec2 stepUV;varying vec2 vUv;void main(){vec3 c=texture2D(source,vUv).rgb*.227027;c+=(texture2D(source,vUv+stepUV*1.384615).rgb+texture2D(source,vUv-stepUV*1.384615).rgb)*.316216;c+=(texture2D(source,vUv+stepUV*3.230769).rgb+texture2D(source,vUv-stepUV*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}",
      });
      this.combine = new T.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          source: { value: this.sceneRT.texture },
          glow: { value: this.ping.texture },
          strength: { value: 0.27 },
          exposure: { value: 1.08 },
        },
        vertexShader: vertex,
        fragmentShader:
          "uniform sampler2D source;uniform sampler2D glow;uniform float strength;uniform float exposure;varying vec2 vUv;vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}void main(){vec3 c=(texture2D(source,vUv).rgb+texture2D(glow,vUv).rgb*strength)*exposure;c=aces(c);c=pow(c,vec3(1./2.2));float v=1.-.14*pow(length((vUv-.5)*vec2(1.05,1.)),1.6);gl_FragColor=vec4(c*v,1.);}",
      });
    }
    resize(w, h, high) {
      this.sceneRT.setSize(w, h);
      this.sceneRT.samples =
        high && this.renderer.capabilities.isWebGL2 ? 4 : 0;
      this.w = Math.max(1, Math.floor(w / 3));
      this.h = Math.max(1, Math.floor(h / 3));
      this.ping.setSize(this.w, this.h);
      this.pong.setSize(this.w, this.h);
    }
    pass(mat, target) {
      this.quad.material = mat;
      this.renderer.setRenderTarget(target);
      this.renderer.render(this.scene, this.camera);
    }
    render(scene, camera) {
      const r = this.renderer;
      r.setRenderTarget(this.sceneRT);
      r.render(scene, camera);
      this.extract.uniforms.source.value = this.sceneRT.texture;
      this.pass(this.extract, this.ping);
      this.blur.uniforms.source.value = this.ping.texture;
      this.blur.uniforms.stepUV.value.set(1.6 / this.w, 0);
      this.pass(this.blur, this.pong);
      this.blur.uniforms.source.value = this.pong.texture;
      this.blur.uniforms.stepUV.value.set(0, 1.6 / this.h);
      this.pass(this.blur, this.ping);
      this.pass(this.combine, null);
    }
  }

  // 场馆建筑 + 开放舞台。结构覆盖镜头前、后、左、右与顶部。
  function buildVenue(app) {
    const s = app.scene,
      m = {
        concrete: material("#262c36", 0.96, 0.02),
        wall: material("#111722", 0.9, 0.05),
        panel: material("#19222e", 0.87, 0.1),
        steel: material("#222d3b", 0.4, 0.72),
        truss: material("#647380", 0.38, 0.68),
        rubber: material("#0b0f16", 0.87, 0.04),
        deck: material("#272e39", 0.69, 0.2),
        fascia: material("#141a25", 0.68, 0.3),
        seat: material("#1c3143", 0.76, 0.1),
        seatAlt: material("#26384b", 0.8, 0.05),
        rail: material("#586473", 0.38, 0.75),
        edge: emissive("#91dce4"),
        aisle: emissive("#ac8251"),
        exit: emissive("#4eac93"),
      };
    s.userData.mats = m;
    app.mats = m;
    const b = new StaticBatch(s);
    const noise = canvas(256, 256),
      nc = noise.getContext("2d");
    nc.fillStyle = "#9fa5ac";
    nc.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 22000; i++) {
      const v = 80 + rand() * 100;
      nc.fillStyle = "rgba(" + v + "," + v + "," + v + ",.09)";
      nc.fillRect(rand() * 256, rand() * 256, 1, 1);
    }
    const tex = canvasTexture(noise);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(28, 35);
    m.concrete.map = tex;
    m.concrete.roughnessMap = tex;
    b.box([61, 0.4, 77], [0, -0.21, 20.5], m.concrete);
    b.box([0.55, 22, 77], [-30.3, 11, 20.5], m.wall);
    b.box([0.55, 22, 77], [30.3, 11, 20.5], m.wall);
    b.box([61, 22, 0.55], [0, 11, -18], m.wall);
    b.box([61, 22, 0.55], [0, 11, 59], m.wall);
    b.box([61, 0.5, 77], [0, 22.25, 20.5], m.wall);
    // 四周吸音板、钢柱、挑台与顶部钢结构。
    for (const side of [-1, 1]) {
      for (let z = -14; z <= 56; z += 3.5) {
        b.box([0.38, 20.7, 0.18], [side * 29.75, 10.35, z], m.steel);
        b.box([0.12, 5.8, 2.85], [side * 29.88, 12.8, z + 1.7], m.panel);
        b.box([0.5, 0.2, 2.85], [side * 29.65, 9.8, z + 1.7], m.steel);
      }
      b.box([1.8, 0.2, 75], [side * 28.7, 16.0, 20.5], m.steel);
      b.rod(
        [side * 27.85, 17.2, -16],
        [side * 27.85, 17.2, 58],
        0.035,
        m.rail,
      );
      b.rod(
        [side * 27.85, 16.65, -16],
        [side * 27.85, 16.65, 58],
        0.022,
        m.rail,
      );
      for (let z = -15; z < 58; z += 3)
        b.rod(
          [side * 27.85, 16, z],
          [side * 27.85, 17.2, z],
          0.03,
          m.rail,
        );
      b.box([0.055, 0.045, 74], [side * 27.82, 16.05, 20.5], m.aisle);
      for (const z of [14, 31, 48]) {
        b.box([0.22, 3.5, 2.4], [side * 29.91, 1.75, z], m.rubber);
        b.box([0.23, 0.08, 2.6], [side * 29.7, 3.55, z], m.steel);
        const sign = mesh(
          new T.PlaneGeometry(1.3, 0.32),
          new T.MeshBasicMaterial({
            map: labelTexture("EXIT  →", 256, 64, "#88e9bd", "#102e29"),
            toneMapped: false,
          }),
          s,
          [side * 29.57, 3.92, z],
        );
        sign.rotation.y = (-side * PI) / 2;
        b.box([0.075, 0.035, 2.4], [side * 29.42, 0.055, z], m.aisle);
      }
    }
    for (let x = -27; x <= 27; x += 3.6) {
      b.box([0.17, 21, 0.3], [x, 10.5, 58.65], m.steel);
      b.box([2.8, 6.0, 0.12], [x, 12.8, 58.61], m.panel);
      b.box([0.2, 20, 0.32], [x, 10, -17.65], m.steel);
    }
    for (let z = -14; z <= 56; z += 10) {
      b.truss([-29, 21.2, z], [29, 21.2, z], 0.62);
      for (const x of [-18, 0, 18])
        b.rod([x, 21.3, z], [x, 22, z], 0.032, m.truss);
    }
    for (let x = -24; x <= 24; x += 8)
      b.truss([x, 21.55, -16], [x, 21.55, 58], 0.42);
    for (const x of [-18, -9, 9, 18])
      for (let z = 15; z < 53; z += 8) {
        b.box([1.3, 0.8, 5.4], [x, 19.8, z], m.panel);
        b.rod([x, 20.2, z - 2], [x, 22, z - 2], 0.015, m.steel);
        b.rod([x, 20.2, z + 2], [x, 22, z + 2], 0.015, m.steel);
      }
    // 舞台 30 × 16 米，中央完全平整。台阶只在最外两侧。
    b.box([30, 1.15, 16], [0, 0.575, 0], m.fascia);
    const floor = box(s, [30, 0.05, 16], [0, 1.175, 0], m.deck);
    floor.castShadow = false;
    for (let x = -15; x <= 15; x += 2.5)
      b.box([0.008, 0.002, 15.98], [x, 1.201, 0], m.fascia);
    for (let z = -8; z <= 8; z += 2)
      b.box([29.98, 0.002, 0.008], [0, 1.202, z], m.fascia);
    b.box([30, 0.055, 0.045], [0, 1.09, 8.035], m.edge);
    b.box([0.045, 0.055, 16], [-15.035, 1.09, 0], m.edge);
    b.box([0.045, 0.055, 16], [15.035, 1.09, 0], m.edge);
    for (let x = -14.5; x <= 14.5; x += 1.45) {
      b.box([0.022, 0.83, 0.035], [x, 0.6, 8.025], m.steel);
      b.put(
        "round",
        m.truss,
        [x, 0.25, 8.05],
        [0.022, 0.012, 0.022],
        [PI / 2, 0, 0],
      );
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const h = (4 - i) * 0.3,
          z = 8.55 + i * 0.6;
        b.box([2.4, h, 0.6], [side * 13.75, h / 2, z], m.deck);
        b.box(
          [2.4, 0.025, 0.032],
          [side * 13.75, h + 0.007, z + 0.28],
          m.aisle,
        );
      }
      b.rod(
        [side * 15.1, 2.25, 7.8],
        [side * 15.1, 1.35, 10.4],
        0.04,
        m.rail,
      );
      for (const z of [8, 9.2, 10.3])
        b.rod(
          [side * 15.1, 0.1, z],
          [side * 15.1, 2.25 - (z - 7.8) * 0.35, z],
          0.032,
          m.rail,
        );
    }
    // 主桁架、吊点与后方技术走道。
    for (const x of [-16, 16])
      for (const z of [-8.7, 7]) {
        b.box([1.1, 0.12, 1.1], [x, 0.06, z], m.steel);
        b.truss([x, 0.13, z], [x, 13.5, z], 0.55);
      }
    b.truss([-16, 13.5, -8.7], [16, 13.5, -8.7], 0.6);
    b.truss([-16, 13.5, 7], [16, 13.5, 7], 0.6);
    b.truss([-16, 13.5, -8.7], [-16, 13.5, 7], 0.6);
    b.truss([16, 13.5, -8.7], [16, 13.5, 7], 0.6);
    b.truss([-13, 12.6, -5.8], [13, 12.6, -5.8], 0.42);
    for (const x of [-13, -6.5, 6.5, 13]) {
      b.rod([x, 13.6, -8.7], [x, 21.3, -8.7], 0.019, m.steel);
      b.box([0.26, 0.4, 0.3], [x, 13.85, -8.7], m.rubber);
    }
    for (const side of [-1, 1]) {
      b.box([1.8, 0.24, 13.5], [side * 17.5, 2.5, -1.5], m.steel);
      b.rod(
        [side * 18.35, 3.75, -8],
        [side * 18.35, 3.75, 5],
        0.04,
        m.rail,
      );
      for (let z = -8; z < 6; z += 2)
        b.rod(
          [side * 18.35, 2.5, z],
          [side * 18.35, 3.75, z],
          0.03,
          m.rail,
        );
    }
    // 后墙为实体，帘幕细褶保持舞台外围的深度。
    for (let x = -19; x <= 19; x += 0.35)
      b.box(
        [0.23, 11.6, 0.2],
        [x, 6.7, -11.8 + Math.sin(x * 9) * 0.07],
        m.rubber,
      );
    // 两侧九单元弯曲线阵 + 地面超低音，扬声器不占用中央空地。
    const grilleC = canvas(64, 64),
      gx = grilleC.getContext("2d");
    gx.fillStyle = "#19212b";
    gx.fillRect(0, 0, 64, 64);
    gx.fillStyle = "#03070c";
    for (let y = 3; y < 64; y += 5)
      for (let x = 3; x < 64; x += 5) {
        gx.beginPath();
        gx.arc(x, y, 1.5, 0, TAU);
        gx.fill();
      }
    const grille = canvasTexture(grilleC);
    grille.wrapS = grille.wrapT = T.RepeatWrapping;
    grille.repeat.set(3, 1.2);
    const grillMat = new T.MeshStandardMaterial({
      map: grille,
      roughness: 0.76,
      metalness: 0.3,
    });
    for (const side of [-1, 1]) {
      const x = side * 17.6;
      b.box([1.6, 0.12, 1.0], [x, 12, -4], m.steel);
      b.rod([x - 0.6, 12.05, -4], [x - 0.6, 21.2, -4], 0.016, m.truss);
      b.rod([x + 0.6, 12.05, -4], [x + 0.6, 21.2, -4], 0.016, m.truss);
      for (let i = 0; i < 9; i++) {
        const y = 11.62 - i * 0.43,
          z = -4 + i * i * 0.014,
          angle = i * 0.022;
        const g = new T.Group();
        g.position.set(x, y, z);
        g.rotation.x = angle;
        s.add(g);
        box(g, [1.58, 0.405, 0.92], [0, 0, 0], m.rubber);
        box(g, [1.47, 0.34, 0.015], [0, 0, 0.468], grillMat);
        box(g, [0.055, 0.14, 0.055], [side * 0.75, 0, 0.49], m.truss);
      }
      for (let k = 0; k < 3; k++) {
        const z = -1.7 + k * 1.38;
        b.box([2.2, 1.05, 1.24], [side * 17.5, 0.54, z], m.rubber);
        b.box(
          [2.03, 0.92, 0.025],
          [side * 17.5, 0.54, z + 0.632],
          grillMat,
        );
        for (const a of [-0.57, 0.57])
          b.put(
            "round",
            m.rubber,
            [side * 17.5 + a, 0.54, z + 0.65],
            [0.38, 0.02, 0.38],
            [PI / 2, 0, 0],
          );
      }
    }
    // 两侧与后方看台；中间保留站席与通道，场馆背后也有完整建筑。
    function seat(x, y, z, a, index) {
      const mat = index % 8 === 0 ? m.seatAlt : m.seat;
      const off = (dx, dy, dz) => [
        x + Math.cos(a) * dx + Math.sin(a) * dz,
        y + dy,
        z - Math.sin(a) * dx + Math.cos(a) * dz,
      ];
      b.box([0.43, 0.1, 0.46], off(0, 0.44, 0), mat, [0, a, 0]);
      b.box([0.44, 0.46, 0.09], off(0, 0.68, 0.22), mat, [-0.1, a, 0]);
      b.box([0.045, 0.4, 0.04], off(-0.16, 0.2, 0.12), m.steel);
      b.box([0.045, 0.4, 0.04], off(0.16, 0.2, 0.12), m.steel);
    }
    for (const side of [-1, 1])
      for (let row = 0; row < 6; row++) {
        const x = side * (22 + row * 1.12),
          h = 0.6 + row * 0.65;
        b.box([1.12, h, 36], [x, h / 2, 31], m.concrete);
        for (let i = 0; i < 44; i++) {
          const z = 13.7 + i * 0.78;
          if (Math.abs(z - 25) < 1.05 || Math.abs(z - 38.2) < 1.05)
            continue;
          seat(x, h, z, (side * PI) / 2, i + row);
        }
        b.box(
          [0.032, 0.025, 36],
          [x - side * 0.53, h + 0.03, 31],
          m.aisle,
        );
      }
    for (let row = 0; row < 6; row++) {
      const z = 51 + row * 1.1,
        h = 0.65 + row * 0.65;
      b.box([42, h, 1.1], [0, h / 2, z], m.concrete);
      for (let i = 0; i < 51; i++) {
        const x = -20 + i * 0.8;
        if (Math.abs(x) < 1.4 || Math.abs(Math.abs(x) - 12) < 0.65)
          continue;
        seat(x, h, z, 0, i + row);
      }
      b.box([41.9, 0.025, 0.035], [0, h + 0.02, z - 0.5], m.aisle);
    }
    for (const side of [-1, 1]) {
      for (const z of [13, 49]) {
        b.rod(
          [side * 21.45, 1.8, z],
          [side * 28, 5.45, z],
          0.035,
          m.rail,
        );
        for (let row = 0; row < 7; row++)
          b.rod(
            [side * (21.45 + row * 1.08), 0.6 + row * 0.6, z],
            [side * (21.45 + row * 1.08), 1.8 + row * 0.6, z],
            0.026,
            m.rail,
          );
      }
      b.box([0.035, 0.025, 36], [side * 20.6, 0.025, 31], m.aisle);
    }
    for (const x of [-10, 10]) {
      b.box([3.4, 3.3, 0.16], [x, 1.65, 58.62], m.rubber);
      const sign = mesh(
        new T.PlaneGeometry(1.65, 0.4),
        new T.MeshBasicMaterial({
          map: labelTexture("EXIT", 256, 64, "#83d5b5", "#122922"),
          toneMapped: false,
        }),
        s,
        [x, 3.8, 58.48],
      );
      sign.rotation.y = PI;
    }
    const venueSign = mesh(
      new T.PlaneGeometry(13, 1.7),
      new T.MeshBasicMaterial({
        map: labelTexture(
          "N O C T U R N E",
          1024,
          128,
          "#6d8197",
          "#101721",
        ),
      }),
      s,
      [0, 10.2, 58.57],
    );
    venueSign.rotation.y = PI;
    // 前场控台，低平台、混音推子与三块显示器，环顾背后可见。
    b.box([7, 0.3, 4.3], [0, 0.15, 41], m.fascia);
    b.box([5.3, 0.14, 1.5], [0, 1.2, 40.9], m.steel, [-0.1, 0, 0]);
    for (const x of [-2.3, 2.3])
      b.box([0.12, 1, 0.9], [x, 0.64, 41], m.rubber);
    const consoleC = canvas(512, 256),
      cx = consoleC.getContext("2d");
    cx.fillStyle = "#08131d";
    cx.fillRect(0, 0, 512, 256);
    cx.fillStyle = "#527186";
    cx.fillRect(14, 14, 484, 24);
    for (let i = 0; i < 30; i++) {
      const h = 30 + rand() * 140;
      cx.fillStyle = i % 4 === 0 ? "#e5c894" : "#73b9be";
      cx.fillRect(16 + i * 16, 229 - h, 7, h);
      cx.fillStyle = "#233b4e";
      cx.fillRect(16 + i * 16, 58, 7, 160 - h);
    }
    const conMat = new T.MeshBasicMaterial({
      map: canvasTexture(consoleC),
      toneMapped: false,
    });
    for (const x of [-1.65, 0, 1.65]) {
      b.box([1.38, 0.83, 0.13], [x, 1.86, 40.45], m.rubber, [-0.2, 0, 0]);
      const d = mesh(new T.PlaneGeometry(1.25, 0.68), conMat, s, [
        x,
        1.87,
        40.535,
      ]);
      d.rotation.x = -0.2;
      b.box([0.08, 0.35, 0.08], [x, 1.34, 40.43], m.steel);
    }
    for (let i = 0; i < 28; i++) {
      const x = -2.2 + i * 0.16;
      b.box([0.016, 0.01, 0.47], [x, 1.24, 41.11], m.rubber);
      b.box(
        [0.065, 0.037, 0.075],
        [x, 1.29, 40.98 + rand() * 0.23],
        i % 7 === 0 ? m.aisle : m.truss,
      );
      for (let j = 0; j < 3; j++)
        b.put(
          "round",
          m.truss,
          [x, 1.28 + j * 0.01, 40.75 - j * 0.12],
          [0.025, 0.025, 0.025],
        );
    }
    for (const side of [-1, 1]) {
      b.rod([side * 3.6, 0.1, 39], [side * 3.6, 1.3, 39], 0.033, m.rail);
      b.rod([side * 3.6, 1.3, 39], [side * 3.6, 1.3, 43], 0.033, m.rail);
      b.rod([side * 3.6, 1.3, 43], [side * 3.6, 0.1, 43], 0.033, m.rail);
    }
    // 两侧护栏、通道线和小型顶灯给空场馆提供尺度。
    for (const side of [-1, 1]) {
      b.rod([side * 2, 1.12, 12], [side * 19, 1.12, 12], 0.035, m.rail);
      b.rod([side * 2, 0.44, 12], [side * 19, 0.44, 12], 0.025, m.steel);
      for (let x = 2; x < 20; x += 1.7)
        b.rod([side * x, 0.02, 12], [side * x, 1.12, 12], 0.025, m.steel);
    }
    for (const x of [-25, 25])
      for (let z = 12; z < 56; z += 8) {
        b.box([0.72, 0.045, 0.33], [x, 19.3, z], m.aisle);
      }
    b.flush();
    // 稳定环境光独立于演出系统，黑场仍能辨认空间。
    app.ambient = new T.HemisphereLight("#9caec7", "#1b1d29", 0.68);
    s.add(app.ambient);
    const fill = new T.DirectionalLight("#c9dcf1", 1.05);
    fill.position.set(-9, 19, 17);
    s.add(fill);
    app.fill = fill;
    const rim = new T.DirectionalLight("#62729c", 0.7);
    rim.position.set(20, 9, -12);
    s.add(rim);
    const roof = new T.PointLight("#bbcfe5", 360, 75, 2);
    roof.position.set(0, 18, 32);
    s.add(roof);
    const back = new T.PointLight("#849cb6", 170, 42, 2);
    back.position.set(0, 12, 52);
    s.add(back);
    // 只有这一盏宽光投射动态阴影，新增乐器可自然落地。
    const key = new T.SpotLight("#dce5ed", 1500, 44, 0.9, 0.85, 2);
    key.position.set(0, 16, 10);
    key.target.position.set(0, 1.2, 0);
    s.add(key, key.target);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.04;
    app.key = key;
    // 程序化环境贴图只用于金属反射；背景由真实场馆建筑组成。
    const ec = canvas(512, 256),
      ex = ec.getContext("2d"),
      gr = ex.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#526175");
    gr.addColorStop(0.45, "#171e2a");
    gr.addColorStop(1, "#04070d");
    ex.fillStyle = gr;
    ex.fillRect(0, 0, 512, 256);
    ex.fillStyle = "#7d8d9f";
    ex.fillRect(50, 46, 170, 10);
    ex.fillRect(300, 52, 110, 8);
    const et = canvasTexture(ec);
    et.mapping = T.EquirectangularReflectionMapping;
    const pm = new T.PMREMGenerator(app.renderer);
    app.envRT = pm.fromEquirectangular(et);
    s.environment = app.envRT.texture;
    pm.dispose();
    et.dispose();
  }
  const BEAM_VERTEX = `varying vec3 vWorld;varying vec3 vNormal;varying float vAlong;void main(){vAlong=position.y;vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
  const BEAM_FRAGMENT = `uniform vec3 tint;uniform float opacity;uniform float clock;varying vec3 vWorld;varying vec3 vNormal;varying float vAlong;void main(){vec3 view=normalize(-(viewMatrix*vec4(vWorld,1.)).xyz);float edge=pow(abs(dot(normalize(vNormal),view)),1.35);float fade=pow(1.-clamp(vAlong,0.,1.),.78);float grain=.92+.08*sin(vWorld.y*9.+vWorld.z*3.-clock*.7);float a=edge*fade*opacity*grain*smoothstep(0.,.025,vAlong);gl_FragColor=vec4(tint,a);}`;
  function glowTexture() {
    const c = canvas(128, 128),
      x = c.getContext("2d"),
      g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.12, "rgba(255,255,255,.72)");
    g.addColorStop(0.38, "rgba(255,255,255,.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    return canvasTexture(c);
  }
  class Fixture {
    constructor(app, id, type, groups, position, target, index) {
      this.app = app;
      this.id = id;
      this.type = type;
      this.groups = new Set(["all", type, ...groups]);
      this.index = index;
      this.demoOwner = true;
      this.demoScan = {
        pan: type === "beam" ? 10 : 0,
        tilt: type === "beam" ? 5 : 0,
        speed: 0.055,
        phase: index * 0.63,
      };
      this.effective = { pan: 0, tilt: 0, intensity: 0 };
      this.state = {
        color: new T.Color("#80dfff"),
        intensity: 0.7,
        enabled: true,
        beam: true,
        angle: type === "beam" ? 3.2 : 23,
        distance: 45,
        pan: 0,
        tilt: -35,
        aim: "target",
        target: vec(target),
        direction: new T.Vector3(0, -1, 0),
        scan: null,
        strobe: 0,
        beatSensitivity: type === "beam" ? 0.25 : 0.1,
      };
      this.root = new T.Group();
      this.root.name = id;
      this.root.position.set(...position);
      app.fixtureRoot.add(this.root);
      this.yaw = new T.Group();
      this.root.add(this.yaw);
      this.head = new T.Group();
      this.yaw.add(this.head);
      const m = app.mats,
        isFloor =
          groups.includes("floor") || groups.includes("front-floor"),
        sign = isFloor ? -1 : 1;
      if (type === "beam") {
        box(this.root, [0.72, 0.21, 0.6], [0, sign * 0.59, 0], m.rubber);
        box(this.root, [0.58, 0.035, 0.45], [0, sign * 0.72, 0], m.steel);
        for (const side of [-1, 1]) {
          box(
            this.yaw,
            [0.105, 0.57, 0.18],
            [side * 0.35, sign * 0.22, 0],
            m.steel,
          );
          const axle = cylinder(
            this.yaw,
            0.13,
            0.12,
            [side * 0.33, 0, 0],
            m.rubber,
          );
          axle.rotation.z = PI / 2;
        }
        box(this.head, [0.48, 0.49, 0.64], [0, 0, -0.04], m.rubber);
        for (let j = 0; j < 5; j++)
          box(
            this.head,
            [0.485, 0.018, 0.21],
            [0, -0.16 + j * 0.08, -0.32],
            m.steel,
          );
        const barrel = cylinder(
          this.head,
          0.229,
          0.17,
          [0, 0, 0.3],
          m.steel,
        );
        barrel.rotation.x = PI / 2;
      } else {
        for (const side of [-1, 1])
          box(
            this.yaw,
            [0.055, 0.32, 0.09],
            [side * 0.245, sign * 0.11, 0],
            m.steel,
          );
        box(this.root, [0.44, 0.065, 0.38], [0, sign * 0.35, 0], m.steel);
        const housing = cylinder(
          this.head,
          0.245,
          0.3,
          [0, 0, 0],
          m.rubber,
        );
        housing.rotation.x = PI / 2;
      }
      this.lensMaterial = new T.MeshBasicMaterial({
        color: "#b3efff",
        toneMapped: false,
      });
      this.lens = mesh(
        new T.CircleGeometry(type === "beam" ? 0.187 : 0.198, 32),
        type === "par" ? m.rubber : this.lensMaterial,
        this.head,
        [0, 0, type === "beam" ? 0.396 : 0.158],
      );
      const bezel = mesh(
        new T.RingGeometry(
          type === "beam" ? 0.19 : 0.2,
          type === "beam" ? 0.229 : 0.243,
          32,
        ),
        m.steel,
        this.head,
        [0, 0, type === "beam" ? 0.397 : 0.159],
      );
      if (type === "par") {
        this.lensMaterial.color.set("#173943");
        for (let j = 0; j < 7; j++) {
          const a = (j * TAU) / 6;
          const x = j === 6 ? 0 : Math.cos(a) * 0.13,
            y = j === 6 ? 0 : Math.sin(a) * 0.13;
          mesh(
            new T.CircleGeometry(0.053, 12),
            this.lensMaterial,
            this.head,
            [x, y, 0.165],
          );
        }
      }
      const spriteMaterial = new T.SpriteMaterial({
        map: app.glowTexture,
        color: "#acecff",
        transparent: true,
        opacity: 0.55,
        blending: T.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.glare = new T.Sprite(spriteMaterial);
      this.glare.position.set(0, 0, type === "beam" ? 0.409 : 0.17);
      this.glare.scale.setScalar(type === "beam" ? 0.9 : 0.6);
      this.head.add(this.glare);
      this.root.traverse((o) => {
        o.castShadow = false;
      });
      this.light = new T.SpotLight(
        "#84d8f9",
        1,
        45,
        this.state.angle * RAD,
        0.45,
        2,
      );
      this.light.name = id + ":light";
      app.scene.add(this.light, this.light.target);
      const geo = new T.ConeGeometry(1, 1, 32, 1, true);
      geo.rotateX(PI);
      geo.translate(0, 0.5, 0);
      this.beamMaterial = new T.ShaderMaterial({
        uniforms: {
          tint: { value: this.state.color.clone() },
          opacity: { value: 0.12 },
          clock: { value: 0 },
        },
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        toneMapped: false,
      });
      this.volume = mesh(geo, this.beamMaterial, app.beamRoot);
      this.volume.frustumCulled = false;
      this.volume.renderOrder = 3;
      this.spillMaterial = new T.MeshBasicMaterial({
        map: app.glowTexture,
        color: "#aaddff",
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
      });
      this.spill = mesh(
        new T.PlaneGeometry(1, 1),
        this.spillMaterial,
        app.beamRoot,
      );
      this.spill.rotation.x = -PI / 2;
      this.spill.renderOrder = 2;
      this.origin = new T.Vector3();
      this.direction = new T.Vector3();
    }
    takeControl() {
      if (this.demoOwner) {
        this.state.pan = this.effective.pan;
        this.state.tilt = this.effective.tilt;
        this.state.aim = "angles";
        this.demoOwner = false;
      }
    }
    set(patch = {}, duration = 0, internal = false) {
      if (!internal) this.takeControl();
      const s = this.state,
        old = {
          color: s.color.clone(),
          intensity: s.intensity,
          pan: this.effective.pan,
          tilt: this.effective.tilt,
        };
      if (patch.color != null) s.color.copy(color(patch.color));
      for (const k of [
        "intensity",
        "angle",
        "distance",
        "pan",
        "tilt",
        "strobe",
        "beatSensitivity",
      ])
        if (patch[k] != null) s[k] = finite(patch[k], k);
      s.intensity = clamp(s.intensity, 0, 2);
      s.angle = clamp(s.angle, 0.6, 55);
      s.distance = clamp(s.distance, 1, 90);
      s.tilt = clamp(s.tilt, -90, 90);
      s.strobe = clamp(s.strobe, 0, 15);
      s.beatSensitivity = clamp(s.beatSensitivity, 0, 2);
      for (const k of ["enabled", "beam"])
        if (patch[k] != null) s[k] = !!patch[k];
      if (patch.position) this.root.position.copy(vec(patch.position));
      if (patch.pan != null || patch.tilt != null) s.aim = "angles";
      if (patch.direction) {
        s.direction.copy(vec(patch.direction));
        if (s.direction.lengthSq() < 1e-10)
          throw new Error("direction 不能为零向量");
        s.direction.normalize();
        s.aim = "direction";
      }
      if (patch.target) {
        s.target.copy(vec(patch.target));
        s.aim = "target";
      }
      if ("scan" in patch) {
        if (!patch.scan) s.scan = null;
        else {
          s.scan = {
            pan: 20,
            tilt: 8,
            speed: 0.12,
            phase: 0,
            ...patch.scan,
          };
          for (const k of ["pan", "tilt", "speed", "phase"])
            s.scan[k] = finite(s.scan[k], k);
          s.scan.speed = clamp(s.scan.speed, 0, 5);
        }
      }
      if (duration > 0) {
        this.transition = {
          from: old,
          to: { color: s.color.clone(), intensity: s.intensity },
          t: 0,
          duration: finite(duration, "duration"),
        };
      } else this.transition = null;
      return this;
    }
    angles() {
      const s = this.state;
      if (s.aim === "angles") return { pan: s.pan, tilt: s.tilt };
      const d =
        s.aim === "target"
          ? s.target.clone().sub(this.root.position).normalize()
          : s.direction;
      return {
        pan: Math.atan2(d.x, d.z) / RAD,
        tilt: Math.asin(clamp(d.y, -1, 1)) / RAD,
      };
    }
    rayLength(origin, d) {
      let len = this.state.distance;
      for (const [axis, bound] of [
        ["x", -29.9],
        ["x", 29.9],
        ["z", -17.6],
        ["z", 58.6],
        ["y", 21.95],
        ["y", 0.015],
      ]) {
        if (Math.abs(d[axis]) < 1e-6) continue;
        const t = (bound - origin[axis]) / d[axis];
        if (t > 0.03) len = Math.min(len, t);
      }
      if (d.y < -0.001) {
        const t = (1.21 - origin.y) / d.y,
          x = origin.x + d.x * t,
          z = origin.z + d.z * t;
        if (t > 0.02 && Math.abs(x) < 15 && Math.abs(z) < 8)
          len = Math.min(len, t);
      }
      return Math.max(0.1, len);
    }
    update(dt) {
      const app = this.app,
        s = this.state;
      let a = this.angles(),
        intensity = s.intensity,
        lightColor = s.color;
      if (this.transition) {
        const tr = this.transition;
        tr.t += dt;
        const k = clamp(tr.t / tr.duration, 0, 1),
          e = k * k * (3 - 2 * k);
        intensity = T.MathUtils.lerp(
          tr.from.intensity,
          tr.to.intensity,
          e,
        );
        lightColor = tr.from.color.clone().lerp(tr.to.color, e);
        let delta = ((a.pan - tr.from.pan + 540) % 360) - 180;
        a.pan = tr.from.pan + delta * e;
        a.tilt = T.MathUtils.lerp(tr.from.tilt, a.tilt, e);
        if (k === 1) this.transition = null;
      }
      const scan = this.demoOwner ? this.demoScan : s.scan,
        t = this.demoOwner ? app.demoTime : app.time;
      if (scan) {
        const phase = t * TAU * scan.speed + scan.phase;
        a.pan += Math.sin(phase) * scan.pan;
        a.tilt += Math.cos(phase * 0.73) * scan.tilt;
      }
      a.tilt = clamp(a.tilt, -89.8, 89.8);
      this.effective.pan = a.pan;
      this.effective.tilt = a.tilt;
      this.yaw.rotation.y = a.pan * RAD;
      this.head.rotation.x = -a.tilt * RAD;
      this.root.updateMatrixWorld(true);
      this.lens.getWorldPosition(this.origin);
      this.direction.set(
        Math.sin(a.pan * RAD) * Math.cos(a.tilt * RAD),
        Math.sin(a.tilt * RAD),
        Math.cos(a.pan * RAD) * Math.cos(a.tilt * RAD),
      );
      const beat = 1 + app.beat.value * s.beatSensitivity,
        gate =
          s.strobe > 0 ? (Math.sin(t * TAU * s.strobe) > 0 ? 1 : 0) : 1;
      const power = s.enabled ? intensity * app.master * beat * gate : 0;
      this.effective.intensity = power;
      const length = this.rayLength(this.origin, this.direction);
      this.light.position.copy(this.origin);
      this.light.target.position.copy(this.origin).add(this.direction);
      this.light.color.copy(lightColor);
      this.light.intensity = power * (this.type === "beam" ? 620 : 200);
      this.light.angle = s.angle * RAD;
      this.light.distance = s.distance;
      this.lensMaterial.color
        .copy(lightColor)
        .multiplyScalar(0.1 + power * 3.6);
      this.glare.material.color.copy(lightColor);
      this.glare.material.opacity = clamp(power * 0.6, 0, 1);
      this.glare.visible = power > 0.001;
      this.volume.visible = s.beam && power > 0.002;
      this.volume.position.copy(this.origin);
      this.volume.quaternion.setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        this.direction,
      );
      const radius = Math.tan(s.angle * RAD) * length;
      this.volume.scale.set(radius, length, radius);
      this.beamMaterial.uniforms.tint.value.copy(lightColor);
      this.beamMaterial.uniforms.opacity.value =
        power *
        (this.type === "beam" ? 0.32 : 0.035) *
        (0.18 + app.haze.density * 2.7);
      this.beamMaterial.uniforms.clock.value = t;
      const end = this.origin
        .clone()
        .addScaledVector(this.direction, length);
      this.spill.visible =
        power > 0.003 &&
        this.direction.y < -0.01 &&
        (Math.abs(end.y - 1.21) < 0.025 ||
          Math.abs(end.y - 0.015) < 0.025);
      if (this.spill.visible) {
        this.spill.position.copy(end);
        this.spill.position.y += 0.012;
        this.spill.scale.set(radius * 3, radius * 3, 1);
        this.spillMaterial.color.copy(lightColor);
        this.spillMaterial.opacity = power * 0.18;
      }
    }
    snapshot() {
      const s = this.state;
      return {
        id: this.id,
        type: this.type,
        groups: [...this.groups],
        color: "#" + s.color.getHexString(),
        intensity: s.intensity,
        enabled: s.enabled,
        pan: this.effective.pan,
        tilt: this.effective.tilt,
        angle: s.angle,
        scan: s.scan ? { ...s.scan } : null,
        demoOwner: this.demoOwner,
      };
    }
  }
  function buildFixtures(app) {
    app.fixtureRoot = new T.Group();
    app.fixtureRoot.name = "Fixtures";
    app.beamRoot = new T.Group();
    app.beamRoot.name = "Volumetric beams";
    app.scene.add(app.fixtureRoot, app.beamRoot);
    app.glowTexture = glowTexture();
    let beam = 0,
      par = 0;
    function add(type, groups, pos, target) {
      const n = type === "beam" ? ++beam : ++par,
        id = type + "-" + String(n).padStart(2, "0"),
        f = new Fixture(app, id, type, groups, pos, target, n - 1);
      app.lights.set(id, f);
      return f;
    }
    for (let i = 0; i < 6; i++) {
      const x = -11 + i * 4.4;
      add(
        "beam",
        ["rear", x < 0 ? "left" : "right"],
        [x, 12.02, -5.8],
        [x * 0.45, 1.2, 5],
      );
    }
    for (const side of [-1, 1])
      for (const z of [-3.2, 4.2])
        add(
          "beam",
          ["side", side < 0 ? "left" : "right"],
          [side * 15.7, 12.87, z],
          [-side * 5, 1.2, z + 2],
        );
    for (let i = 0; i < 6; i++) {
      const x = -11 + i * 4.4;
      const f = add(
        "beam",
        ["floor", x < 0 ? "left" : "right"],
        [x, 1.94, -6.65],
        [x * 1.45, 15, 13],
      );
      f.demoScan = { pan: 7, tilt: 4, speed: 0.07, phase: i * 0.7 };
    }
    for (let i = 0; i < 6; i++) {
      const x = -12 + i * 4.8;
      add(
        "par",
        ["front", x < 0 ? "left" : "right"],
        [x, 12.85, 6.9],
        [x * 0.8, 1.2, -1],
      );
    }
    for (let i = 0; i < 8; i++) {
      const x = -12.6 + i * 3.6;
      add(
        "par",
        ["front", "floor", "front-floor", x < 0 ? "left" : "right"],
        [x, 1.59, 7.55],
        [x * 0.7, 5, -6],
      );
    }
  }
  // LED 内容生产与显示硬件解耦；内置图案只是 registerScreenPattern 的示例实现。
  const SCREEN_VERTEX =
    "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";
  const SCREEN_FRAGMENT = `uniform sampler2D source;uniform vec2 contentScale;uniform vec2 pixels;uniform float brightness;uniform float decodeSRGB;varying vec2 vUv;void main(){vec2 uv=(vUv-.5)*contentScale+.5;float inside=step(0.,min(uv.x,uv.y))*step(max(uv.x,uv.y),1.);vec3 c=texture2D(source,uv).rgb*inside;c=mix(c,pow(max(c,vec3(0.)),vec3(2.2)),decodeSRGB);vec2 cell=fract(vUv*pixels);float grid=smoothstep(.03,.19,cell.x)*smoothstep(.03,.19,cell.y);float weight=mix(.8,1.,grid);gl_FragColor=vec4(c*brightness*1.8*weight,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`;
  function drawTracked(ctx, text, x, y, size, tracking, fill, maxWidth) {
    text = String(text);
    ctx.font = "600 " + size + 'px "Segoe UI",sans-serif';
    const letters = Array.from(text),
      widths = letters.map((l) => ctx.measureText(l).width);
    const width =
      widths.reduce((a, b) => a + b, 0) +
      Math.max(0, letters.length - 1) * tracking;
    const scale = Math.min(1, (maxWidth || 1e9) / Math.max(1, width));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = fill;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let offset = -width / 2;
    letters.forEach((c, i) => {
      ctx.fillText(c, offset, 0);
      offset += widths[i] + tracking;
    });
    ctx.restore();
  }
  function screenBackground(ctx, w, h, palette) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#030a14");
    g.addColorStop(0.5, "#080c1b");
    g.addColorStop(1, "#090618");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  function screenCaption(ctx, f, scale = 1) {
    if (f.params.text === false) return;
    const text = f.params.text ?? "NOCTURNE";
    drawTracked(
      ctx,
      text,
      f.width * 0.5,
      f.height * 0.49,
      f.height * 0.15 * scale,
      f.height * 0.027,
      "#e9f7fc",
      f.width * 0.85,
    );
    if (f.width / f.height > 2.2)
      drawTracked(
        ctx,
        f.params.subtitle ?? "LIVE SESSION",
        f.width * 0.5,
        f.height * 0.625,
        f.height * 0.029,
        f.height * 0.01,
        "#a0b8cb",
        f.width * 0.8,
      );
  }
  const Patterns = {
    orbital(ctx, f) {
      const w = f.width,
        h = f.height,
        t = f.time * 0.16,
        p = f.params.palette ?? ["#67e3fa", "#b486ed", "#547cff"];
      screenBackground(ctx, w, h, p);
      const g = ctx.createLinearGradient(w * 0.12, 0, w * 0.88, h);
      g.addColorStop(0, p[0]);
      g.addColorStop(0.5, p[1]);
      g.addColorStop(1, p[2] ?? p[0]);
      ctx.strokeStyle = g;
      for (let j = 0; j < 28; j++) {
        const k = 0.62 + j * 0.018;
        ctx.globalAlpha = 0.22 + Math.sin(j * 0.37) * 0.12 + j / 55;
        ctx.lineWidth = j % 7 === 0 ? 2.7 : 1.1;
        ctx.beginPath();
        for (let i = 0; i <= 190; i++) {
          const a = (i / 190) * TAU,
            twist = Math.sin(a * 3 + t + j * 0.065) * 0.035;
          const x =
              w * 0.5 + Math.cos(a + t * 0.09) * w * 0.36 * (k + twist),
            y =
              h * 0.51 +
              Math.sin(a) * h * 0.94 * (k + twist) +
              Math.sin(a * 2 - t + j * 0.05) * h * 0.11;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#b9e7f6";
      for (let i = 0; i < 36; i++) {
        const a = i * 2.39996 + t * 0.12,
          r = 0.35 + (i % 7) * 0.019;
        const x = w * 0.5 + Math.cos(a) * w * r,
          y = h * 0.5 + Math.sin(a) * h * 0.98;
        ctx.globalAlpha = 0.2 + 0.45 * (0.5 + 0.5 * Math.sin(t + i));
        ctx.fillRect(x, y, i % 5 === 0 ? 3 : 1.5, i % 5 === 0 ? 3 : 1.5);
      }
      ctx.globalAlpha = 1;
      screenCaption(ctx, f);
      if (f.beat > 0.01) {
        ctx.strokeStyle = p[0];
        ctx.globalAlpha = f.beat * 0.3;
        ctx.lineWidth = 2;
        ctx.strokeRect(w * 0.025, h * 0.055, w * 0.95, h * 0.89);
        ctx.globalAlpha = 1;
      }
    },
    ribbons(ctx, f) {
      const w = f.width,
        h = f.height,
        t = f.time * 0.22,
        p = f.params.palette ?? ["#4cdad8", "#8c72f2", "#ef91c4"];
      screenBackground(ctx, w, h, p);
      const g = ctx.createLinearGradient(0, h, w, 0);
      p.forEach((c, i) => g.addColorStop(i / (p.length - 1 || 1), c));
      ctx.strokeStyle = g;
      for (let j = 0; j < 45; j++) {
        ctx.globalAlpha = 0.3 + (0.55 * j) / 45;
        ctx.lineWidth = j % 9 === 0 ? 3 : 1.35;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const x = (i / 120) * w,
            y =
              h *
                (0.5 +
                  Math.sin((i / 120) * 5.5 + t + j * 0.045) * 0.23 +
                  Math.sin((i / 120) * 8 - t * 0.7) * 0.08) +
              (j - 22) * h * 0.012;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (f.width / f.height > 2) screenCaption(ctx, f, 0.85);
    },
    waveform(ctx, f) {
      const w = f.width,
        h = f.height,
        p = f.params.palette ?? ["#71e8e7", "#a28eff"];
      screenBackground(ctx, w, h, p);
      ctx.strokeStyle = p[0];
      ctx.lineWidth = 3;
      const data = f.audio.waveform;
      for (let pass = 0; pass < 3; pass++) {
        ctx.beginPath();
        ctx.globalAlpha = pass === 0 ? 0.95 : 0.2;
        for (let i = 0; i <= 360; i++) {
          const u = i / 360,
            v = data?.length
              ? data[
                  Math.min(data.length - 1, Math.floor(u * data.length))
                ]
              : Math.sin(u * 45 - f.time * 2) *
                Math.sin(u * PI) *
                (0.55 + 0.23 * Math.sin(u * 16 + f.time));
          const y =
            h * 0.52 + v * h * (0.25 + f.beat * 0.08) * (1 + pass * 0.15);
          i ? ctx.lineTo(u * w, y) : ctx.moveTo(0, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      drawTracked(
        ctx,
        f.params.text ?? "NOCTURNE",
        w * 0.5,
        h * 0.15,
        h * 0.07,
        h * 0.016,
        "#bedce8",
        w * 0.85,
      );
    },
    spectrum(ctx, f) {
      const w = f.width,
        h = f.height,
        p = f.params.palette ?? ["#66dcf4", "#b988f5"];
      screenBackground(ctx, w, h, p);
      const n = 64,
        gap = w * 0.003,
        bw = (w * 0.87) / n;
      const g = ctx.createLinearGradient(0, h * 0.9, 0, h * 0.2);
      g.addColorStop(0, p[1] ?? p[0]);
      g.addColorStop(1, p[0]);
      ctx.fillStyle = g;
      const data = f.audio.spectrum;
      for (let i = 0; i < n; i++) {
        let v = data?.length
          ? data[
              Math.min(data.length - 1, Math.floor((i / n) * data.length))
            ]
          : 0.14 +
            0.4 *
              Math.pow(0.5 + 0.5 * Math.sin(i * 0.17 - f.time * 2), 2) *
              Math.exp(-i * 0.012) +
            f.beat * 0.2;
        if (data?.BYTES_PER_ELEMENT === 1) v /= 255;
        v = clamp(v, 0, 1);
        const bh = Math.max(3, v * h * 0.67),
          x = w * 0.065 + i * bw;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x, h * 0.88 - bh, bw - gap, bh);
        ctx.fillStyle = "#ccf4fc";
        ctx.fillRect(x, h * 0.88 - bh - 5, bw - gap, 2);
        ctx.fillStyle = g;
      }
      ctx.globalAlpha = 1;
      drawTracked(
        ctx,
        f.params.text ?? "NOCTURNE",
        w * 0.5,
        h * 0.17,
        h * 0.08,
        h * 0.025,
        "#dceef9",
        w * 0.85,
      );
    },
    typography(ctx, f) {
      const w = f.width,
        h = f.height;
      ctx.fillStyle = f.params.background ?? "#080d1b";
      ctx.fillRect(0, 0, w, h);
      const text = String(f.params.text ?? "NOCTURNE"),
        lines = text.split("\n"),
        size = Math.min(
          (h * 0.26) / (Math.max(1, lines.length) * 0.65 + 0.35),
          w * 0.16,
        );
      for (let i = 0; i < lines.length; i++)
        drawTracked(
          ctx,
          lines[i],
          w / 2,
          h / 2 + (i - (lines.length - 1) / 2) * size * 1.35,
          size,
          size * 0.12,
          f.params.color ?? "#e2f3fb",
          w * 0.9,
        );
      if (f.params.subtitle)
        drawTracked(
          ctx,
          f.params.subtitle,
          w / 2,
          h * 0.84,
          h * 0.044,
          h * 0.012,
          "#8ca7ba",
          w * 0.9,
        );
    },
    grid(ctx, f) {
      const w = f.width,
        h = f.height,
        p = f.params.palette ?? ["#73e5ec", "#b793ff"];
      screenBackground(ctx, w, h, p);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.sin(f.time * 0.12) * 0.09);
      for (let i = 24; i >= 0; i--) {
        const k = ((i + f.time * 0.5) % 25) / 25,
          sz = Math.pow(k, 1.8);
        ctx.strokeStyle = i % 3 ? p[0] : (p[1] ?? p[0]);
        ctx.globalAlpha = 0.12 + sz * 0.6;
        ctx.lineWidth = i % 5 === 0 ? 3 : 1;
        ctx.strokeRect(
          -w * 0.6 * sz,
          -h * 0.85 * sz,
          w * 1.2 * sz,
          h * 1.7 * sz,
        );
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      screenCaption(ctx, f, 0.7);
    },
    black(ctx, f) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, f.width, f.height);
    },
  };
  class ScreenSurface {
    constructor(
      app,
      { id, position, width, height, rotation = 0, resolution },
    ) {
      this.app = app;
      this.id = id;
      this.width = width;
      this.height = height;
      this.canvas = canvas(...(resolution ?? [1536, 480]));
      this.ctx = this.canvas.getContext("2d", { alpha: false });
      this.texture = new T.CanvasTexture(this.canvas);
      this.texture.colorSpace = T.NoColorSpace;
      this.texture.minFilter = T.LinearFilter;
      this.texture.generateMipmaps = false;
      this.pattern = Patterns.orbital;
      this.patternName = "orbital";
      this.params = {};
      this.brightness = 0.85;
      this.playing = true;
      this.demoOwner = true;
      this.time = 0;
      this.accumulator = 0;
      this.dirty = true;
      this.error = null;
      this.external = null;
      this.source = null;
      this.fit = "contain";
      this.autoClear = true;
      this.node = new T.Group();
      this.node.name = "screen:" + id;
      this.node.position.set(...position);
      this.node.rotation.y = rotation;
      app.screenRoot.add(this.node);
      box(
        this.node,
        [width + 0.16, height + 0.16, 0.22],
        [0, 0, 0],
        app.mats.rubber,
      );
      for (let x = -width / 2; x <= width / 2; x += 1.5)
        box(
          this.node,
          [0.05, height, 0.12],
          [x, 0, -0.17],
          app.mats.steel,
        );
      for (let y = -height / 2; y <= height / 2; y += 1.5)
        box(
          this.node,
          [width, 0.05, 0.12],
          [0, y, -0.18],
          app.mats.steel,
        );
      this.material = new T.ShaderMaterial({
        uniforms: {
          source: { value: this.texture },
          contentScale: { value: new T.Vector2(1, 1) },
          pixels: { value: new T.Vector2(width * 27, height * 27) },
          brightness: { value: 0.85 },
          decodeSRGB: { value: 1 },
        },
        vertexShader: SCREEN_VERTEX,
        fragmentShader: SCREEN_FRAGMENT,
      });
      this.surface = mesh(
        new T.PlaneGeometry(width, height),
        this.material,
        this.node,
        [0, 0, 0.116],
      );
      this.surface.name = "LED:" + id;
      this.glow = new T.PointLight("#6b91db", 10, 26, 2);
      this.glow.position.set(0, -height * 0.32, 1.2);
      this.node.add(this.glow);
      this.frame = {};
    }
    setPattern(pattern, options = {}, internal = false) {
      const fn =
        typeof pattern === "function"
          ? pattern
          : this.app.patterns.get(pattern);
      if (typeof fn !== "function")
        throw new Error("未注册 LED 图案：" + pattern);
      this.pattern = fn;
      this.patternName = typeof pattern === "string" ? pattern : "custom";
      this.source = null;
      this.external = null;
      this.material.uniforms.source.value = this.texture;
      this.material.uniforms.decodeSRGB.value = 1;
      this.params = { ...(options.params ?? {}) };
      this.error = null;
      this.time = options.time ?? 0;
      this.dirty = true;
      this.demoOwner = internal;
      this.autoClear = options.autoClear !== false;
      this.setOptions(options);
      return this;
    }
    setOptions(options = {}) {
      if (options.brightness != null)
        this.brightness = clamp(
          finite(options.brightness, "brightness"),
          0,
          2,
        );
      if (options.playing != null) this.playing = !!options.playing;
      if (options.time != null) this.time = finite(options.time, "time");
      if (options.params)
        this.params = { ...this.params, ...options.params };
      if (options.fit) this.fit = options.fit;
      this.dirty = true;
      return this;
    }
    setContent(content, options = {}) {
      this.demoOwner = false;
      this.error = null;
      this.dirty = true;
      if (typeof content === "function")
        return this.setPattern(content, options);
      if (content?.type === "text")
        return this.setPattern("typography", {
          ...options,
          params: { ...content, ...options.params },
        });
      if (content?.draw)
        return this.setPattern(content.draw, { ...content, ...options });
      if (typeof content === "string")
        return this.setPattern("typography", {
          ...options,
          params: { text: content, ...options.params },
        });
      const src = content?.isTexture
        ? content
        : (content?.source ?? content);
      if (src?.isTexture) {
        this.external = src;
        this.source = null;
        this.material.uniforms.source.value = src;
        this.material.uniforms.decodeSRGB.value = options.decodeSRGB
          ? 1
          : 0;
        this.patternName = "texture";
      } else if (
        src &&
        (src.getContext ||
          src.tagName === "IMG" ||
          src.tagName === "VIDEO" ||
          (typeof SVGImageElement !== "undefined" && src instanceof SVGImageElement) ||
          (typeof VideoFrame !== "undefined" && src instanceof VideoFrame) ||
          (typeof ImageBitmap !== "undefined" &&
            src instanceof ImageBitmap))
      ) {
        this.source = src;
        this.external = null;
        this.material.uniforms.source.value = this.texture;
        this.material.uniforms.decodeSRGB.value = 1;
        this.patternName = src.tagName === "VIDEO" ? "video" : "media";
      } else
        throw new TypeError(
          "LED 内容需为回调、文本、Canvas、Image、Video、ImageBitmap 或 THREE.Texture",
        );
      this.setOptions(options);
      return this;
    }
    update(dt) {
      const app = this.app;
      this.material.uniforms.brightness.value = this.brightness;
      this.glow.intensity = this.brightness * 40;
      const active = this.playing && (!this.demoOwner || app.demo);
      if (active && dt > 0) {
        this.time += dt;
        this.accumulator += dt;
      }
      if (this.external) return;
      if (!this.dirty && (this.accumulator < 1 / 30 || !active)) return;
      const frameDt = this.accumulator;
      this.accumulator = 0;
      this.dirty = false;
      const ctx = this.ctx,
        w = this.canvas.width,
        h = this.canvas.height;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      try {
        if (this.autoClear) {
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, w, h);
        }
        if (this.source) {
          const source = this.source,
            sw = source.displayWidth || source.videoWidth || source.naturalWidth || source.width?.baseVal?.value || source.width,
            sh =
              source.displayHeight || source.videoHeight || source.naturalHeight || source.height?.baseVal?.value || source.height;
          if (sw && sh) {
            const k =
              this.fit === "cover"
                ? Math.max(w / sw, h / sh)
                : Math.min(w / sw, h / sh);
            ctx.drawImage(
              source,
              (w - sw * k) / 2,
              (h - sh * k) / 2,
              sw * k,
              sh * k,
            );
          }
        } else {
          Object.assign(this.frame, {
            time: this.time,
            dt: frameDt,
            width: w,
            height: h,
            beat: app.beat.value,
            beatIndex: app.beat.index,
            bpm: app.bpm,
            section: app.section,
            params: this.params,
            audio: app.audio,
            screen: this,
            stage: app,
          });
          const result = this.pattern(ctx, this.frame);
          if (result && typeof result.then === "function")
            throw new Error("逐帧图案必须是同步绘制函数");
        }
        this.texture.needsUpdate = true;
      } catch (e) {
        this.error = e;
        this.playing = false;
        app.report("LED " + this.id + "：" + e.message);
        console.error(e);
      } finally {
        ctx.restore();
      }
      const p = this.params.palette;
      if (p?.length) this.glow.color.set(p[0]);
    }
    invalidate() {
      this.dirty = true;
    }
  }
  function buildScreens(app) {
    app.screenRoot = new T.Group();
    app.screenRoot.name = "LED hardware";
    app.scene.add(app.screenRoot);
    const configs = [
      {
        id: "main",
        position: [0, 7.1, -8.17],
        width: 24,
        height: 7.5,
        resolution: [1792, 560],
      },
      {
        id: "left",
        position: [-13.6, 7.1, -6.8],
        width: 1.55,
        height: 7.5,
        rotation: 0.16,
        resolution: [192, 928],
      },
      {
        id: "right",
        position: [13.6, 7.1, -6.8],
        width: 1.55,
        height: 7.5,
        rotation: -0.16,
        resolution: [192, 928],
      },
    ];
    for (const cfg of configs)
      app.screens.set(cfg.id, new ScreenSurface(app, cfg));
    const main = app.screens.get("main"),
      b = new StaticBatch(app.scene);
    for (const x of [-10, -5, 5, 10])
      b.rod([x, 10.95, -8.17], [x, 13.25, -8.4], 0.022, app.mats.steel);
    b.flush();
    // 仅反射真实 LED 画布：镜头到地面的反射射线与屏幕平面求交，非贴地假图。
    const refl = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        source: { value: main.texture },
        contentScale: { value: new T.Vector2(1, 1) },
        brightness: { value: 0.85 },
        decodeSRGB: { value: 1 },
      },
      vertexShader:
        "varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}",
      fragmentShader: `uniform sampler2D source;uniform vec2 contentScale;uniform float brightness;uniform float decodeSRGB;varying vec3 world;void main(){vec3 incoming=normalize(world-cameraPosition);vec3 ray=reflect(incoming,vec3(0.,1.,0.));if(ray.z>=-.001)discard;float k=(-8.054-world.z)/ray.z;if(k<0.)discard;vec3 hit=world+ray*k;vec2 uv=vec2((hit.x+12.)/24.,(hit.y-3.35)/7.5);if(min(uv.x,uv.y)<0.||max(uv.x,uv.y)>1.)discard;uv=(uv-.5)*contentScale+.5;if(min(uv.x,uv.y)<0.||max(uv.x,uv.y)>1.)discard;vec3 c=texture2D(source,uv).rgb*.5;c+=(texture2D(source,uv+vec2(.003,.007)).rgb+texture2D(source,uv-vec2(.003,.007)).rgb)*.25;c=mix(c,pow(c,vec3(2.2)),decodeSRGB);float fresnel=pow(1.-abs(incoming.y),3.);float edge=smoothstep(0.,.05,uv.x)*smoothstep(0.,.05,1.-uv.x);gl_FragColor=vec4(c*brightness*1.2,.18*fresnel*edge);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
    });
    const plane = mesh(
      new T.PlaneGeometry(29.95, 15.95),
      refl,
      app.scene,
      [0, 1.21, 0],
    );
    plane.rotation.x = -PI / 2;
    plane.renderOrder = 1;
    app.reflection = refl;
  }
  // 烟雾使用 GPU 软粒子，位置和浓度拥有独立时钟，不包含外部贴图。
  class Haze {
    constructor(app) {
      this.app = app;
      this.density = 0.18;
      this.speed = 0.12;
      this.enabled = true;
      this.animated = true;
      this.demoOwner = true;
      this.time = 0;
      const positions = [],
        sizes = [],
        seeds = [];
      for (let i = 0; i < 130; i++) {
        const near = i < 90;
        positions.push(
          (rand() - 0.5) * (near ? 34 : 52),
          near ? 1.8 + rand() * 5 : 6 + rand() * 10,
          near ? -7 + rand() * 18 : rand() * 60 - 8,
        );
        sizes.push(near ? 3 + rand() * 5 : 5 + rand() * 6);
        seeds.push(rand() * 40);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute(
        "position",
        new T.Float32BufferAttribute(positions, 3),
      );
      geo.setAttribute("size", new T.Float32BufferAttribute(sizes, 1));
      geo.setAttribute("seed", new T.Float32BufferAttribute(seeds, 1));
      this.material = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          clock: { value: 0 },
          density: { value: this.density },
          pixelScale: { value: 600 },
          tint: { value: new T.Color("#94afcd") },
        },
        vertexShader: `attribute float size;attribute float seed;uniform float clock;uniform float pixelScale;varying float vSeed;void main(){vSeed=seed;vec3 p=position;p.x+=sin(clock*.31+seed)*1.9;p.z+=cos(clock*.23+seed)*1.7;p.y+=sin(clock*.17+seed)*.32;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=min(480.,size*pixelScale/max(1.,-mv.z));gl_Position=projectionMatrix*mv;}`,
        fragmentShader: `uniform float clock;uniform float density;uniform vec3 tint;varying float vSeed;float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}void main(){vec2 p=gl_PointCoord-.5;float r=dot(p,p)*4.;float feather=pow(max(0.,1.-r),3.);float n=noise(p*6.+vSeed+vec2(clock*.15,clock*.06));float a=feather*(.4+.6*n)*density*.19;gl_FragColor=vec4(tint,a);}`,
      });
      this.points = new T.Points(geo, this.material);
      this.points.frustumCulled = false;
      this.points.renderOrder = 4;
      app.scene.add(this.points);
    }
    set(patch = {}, internal = false) {
      if (!internal) this.demoOwner = false;
      if (patch.density != null)
        this.density = clamp(finite(patch.density, "density"), 0, 1);
      if (patch.speed != null)
        this.speed = clamp(finite(patch.speed, "speed"), 0, 5);
      for (const k of ["enabled", "animated"])
        if (patch[k] != null) this[k] = !!patch[k];
      if (patch.color)
        this.material.uniforms.tint.value.copy(color(patch.color));
      return this;
    }
    update(dt) {
      if (this.animated && (!this.demoOwner || this.app.demo))
        this.time += dt * this.speed;
      this.points.visible = this.enabled && this.density > 0.001;
      this.material.uniforms.clock.value = this.time;
      this.material.uniforms.density.value = this.density;
      this.material.uniforms.pixelScale.value =
        this.app.renderer.domElement.height * 0.63;
      this.app.scene.fog.density = this.enabled
        ? this.density * 0.045
        : 0;
    }
  }
  const app = {
    scene: new THREE.Scene(), renderer, time: 0, demoTime: 0,
    demo: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    master: 0.85, bpm: 108, section: '', nextDemoBeat: 0,
    beat: {value: 0, index: 0, duration: .38, groups: null},
    audio: {waveform: null, spectrum: null}, lights: new Map(), screens: new Map(),
    patterns: new Map(Object.entries(Patterns)),
    report(message) { console.warn('[NOCTURNE]', message); },
  };
  app.scene.name = 'venue:nocturne';
  app.scene.background = new THREE.Color('#080e19');
  app.scene.fog = new THREE.FogExp2('#0b1322', .009);
  let disposed = false, width = 0, height = 0, lighting, screens;
  const size = new THREE.Vector2();
  function dispose() {
    if (disposed) return;
    disposed = true;
    lighting?.dispose();
    screens?.dispose();
    if (app.reflection) app.reflection.uniforms.source.value = app.screens.get('main').material.uniforms.source.value;
    const resources = new Set();
    const texture = v => { if(v?.isTexture) resources.add(v); };
    app.scene.traverse(o => {
      if(o.geometry) resources.add(o.geometry);
      const materials = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for(const m of materials) {
        resources.add(m); Object.values(m).forEach(texture);
        if(m.uniforms) Object.values(m.uniforms).forEach(u => texture(u.value));
      }
      o.shadow?.dispose();
    });
    for(const r of resources) r.dispose();
    app.envRT?.dispose();
    if(app.glow) for(const key of ['sceneRT','ping','pong','extract','blur','combine']) app.glow[key]?.dispose();
    app.glow?.quad.geometry.dispose();
    app.scene.removeFromParent(); app.scene.clear(); app.lights.clear(); app.screens.clear();
  }
  try {
    app.glow = new GlowPass(renderer);
    buildVenue(app); app.haze = new Haze(app); buildFixtures(app); buildScreens(app);
    const mode = 'nocturne';
    const theme = { palette: ['#67dcf6','#9d74ed','#526deb'], pattern: 'orbital', warm:'#bec9e9' };
  app.mode = mode;
  let i = 0;
  for (const f of app.lights.values()) {
    f.demoOwner = true;
    const floor = f.groups.has("floor"),
      c =
        f.type === "par"
          ? theme.warm
          : theme.palette[i++ % theme.palette.length];
    f.set(
      {
        color: c,
        intensity:
          f.type === "beam"
            ? floor
    ? 0.67
    : 0.83
            : floor
    ? 0.46
    : 0.78,
        enabled: true,
        beam: true,
        scan: null,
        strobe: 0,
        angle: f.type === "beam" ? 3.2 : 23,
      },
      0,
      true,
    );
    if (f.groups.has("rear"))
      f.set({ target: [f.root.position.x * 0.45, 1.2, 5] }, 0, true);
    else if (f.groups.has("side"))
      f.set(
        {
          target: [
            -Math.sign(f.root.position.x) * 5,
            1.2,
            f.root.position.z + 2,
          ],
        },
        0,
        true,
      );
    else if (f.type === "beam" && floor)
      f.set({ target: [f.root.position.x * 1.45, 15, 13] }, 0, true);
    else if (f.type === "par")
      f.set(
        {
          target: floor
            ? [f.root.position.x * 0.7, 5, -6]
            : [f.root.position.x * 0.8, 1.2, -1],
        },
        0,
        true,
      );
  }
  app.screens
    .get("main")
    .setPattern(
      theme.pattern,
      {
        brightness: 0.85,
        playing: true,
        params: {
          palette: theme.palette,
          text: "NOCTURNE",
          subtitle: "LIVE SESSION",
        },
      },
      true,
    );
  app.screens
    .get("left")
    .setPattern(
      "ribbons",
      {
        brightness: 0.65,
        playing: true,
        params: { palette: theme.palette, text: false },
      },
      true,
    );
  app.screens
    .get("right")
    .setPattern(
      "ribbons",
      {
        brightness: 0.65,
        playing: true,
        time: 8,
        params: {
          palette: [...theme.palette].reverse(),
          text: false,
        },
      },
      true,
    );
  app.haze.set(
    {
      density: mode === "amber" ? 0.14 : 0.18,
      enabled: true,
      animated: true,
    },
    true,
  );
  app.haze.demoOwner = true;
  app.key.intensity = 1500 * app.master;
  app.fill.intensity = 1.05;
  app.mats.edge.color.set(theme.palette[0]).multiplyScalar(0.55);
  } catch(error) { dispose(); throw error; }
  lighting = new NocturneLighting(app);
  screens = new NocturneScreens(app.screens);
  return {
    scene: app.scene,
    lighting,
    screens,
    update(dt) {
      if(disposed) return;
      dt = Math.max(0, Math.min(.08, dt));
      if (!lighting.controlled) app.time += dt;
      if(app.demo) app.demoTime += dt;
      app.beat.value *= Math.exp(-dt * 4 / app.beat.duration);
      if(app.beat.value < .001) app.beat.value = 0;
      if(app.demo && app.demoTime >= app.nextDemoBeat) {
        app.beat.value = Math.max(app.beat.value, app.beat.index % 4 === 0 ? .9 : .5);
        app.beat.index++; app.nextDemoBeat = app.demoTime + 60/app.bpm;
        for(const screen of app.screens.values()) if (!screens.controlled(screen.id)) screen.invalidate();
      }
      app.haze.update(dt);
      for(const fixture of app.lights.values()) fixture.update(dt);
      lighting.updateSurfaceLights();
      for(const screen of app.screens.values()) screen.update(dt);
      const main = app.screens.get('main');
      app.reflection.uniforms.source.value = main.material.uniforms.source.value;
      app.reflection.uniforms.brightness.value = main.brightness;
      app.reflection.uniforms.decodeSRGB.value = main.material.uniforms.decodeSRGB.value;
      app.reflection.uniforms.contentScale.value.copy(main.material.uniforms.contentScale.value);
    },
    render(scene, camera) {
      if(disposed) return false;
      renderer.getDrawingBufferSize(size);
      if(width !== size.x || height !== size.y) {
        width=size.x; height=size.y; app.glow.resize(width,height,renderer.domElement.clientWidth>=700);
      }
      app.glow.render(scene,camera); return true;
    },
    dispose,
  };
}
