// ── Frasco 3D da home — Amira ──────────────────────────────────────────
// FONTE do frasco de vidro da seção "Sua essência" (index.html). NÃO é
// servido direto: `bash scripts/3d/build.sh` empacota este arquivo + só as
// partes usadas do three.js em frontend/src/pages/vendor/frasco-3d.js.
//
// O frasco é uma ânfora torneada (LatheGeometry) de vidro com transmissão
// real, líquido âmbar por dentro, gargalo e tampa dourados — e um anel
// dourado fino em volta do corpo: a linha do horizonte do logo, o detalhe
// persistente da marca (docs/design.md).
//
// Custos: só renderiza quando a seção está na tela e a aba está visível;
// pixel ratio limitado; quem chama (services/movimento.js) já decidiu que o
// aparelho aguenta (desktop, sem economia de dados, sem movimento reduzido).

import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Vector2, Mesh, Color,
  LatheGeometry, CylinderGeometry, TorusGeometry, SphereGeometry, PlaneGeometry,
  MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial,
  DirectionalLight, AmbientLight, PMREMGenerator, CanvasTexture,
  ACESFilmicToneMapping, SRGBColorSpace, MathUtils,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const OURO = new Color("#C99A3B");

// Perfil do frasco (raio, altura): base reta e larga, ombro alto e
// arredondado, gargalo curto — silhueta de flacon de perfumaria.
function perfilCorpo(escala = 1, encolher = 0) {
  const p = [
    [0.0, 0.0], [0.66, 0.0], [0.76, 0.03], [0.8, 0.12], [0.81, 0.5],
    [0.8, 1.05], [0.76, 1.38], [0.64, 1.62], [0.44, 1.8], [0.26, 1.9], [0.22, 2.0],
  ];
  return p.map(([r, y]) => new Vector2(Math.max(0.001, r * escala - encolher), y * escala));
}

// Fundo da cena: a cor da página com um sol de luz dourada atrás do frasco.
// O vidro com transmissão refrata o que está ATRÁS dele — sem um fundo na
// própria cena ele sairia branco leitoso.
function fundoNascente(tema) {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  const base = tema === "dark" ? "#110D0B" : "#FBF8F5";
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 1024);
  // A câmera enxerga só ~40% do painel: o brilho precisa caber nesse
  // recorte e terminar na cor da página, senão o canvas vira um retângulo.
  const grad = g.createRadialGradient(512, 560, 0, 512, 560, 175);
  grad.addColorStop(0, tema === "dark" ? "rgba(226,184,79,0.30)" : "rgba(226,184,79,0.42)");
  grad.addColorStop(0.45, tema === "dark" ? "rgba(226,184,79,0.10)" : "rgba(236,193,160,0.22)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function sombraDeContato() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(40,24,16,0.38)");
  grad.addColorStop(0.55, "rgba(40,24,16,0.12)");
  grad.addColorStop(1, "rgba(40,24,16,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/**
 * Monta o frasco dentro de `container` (que ganha um <canvas>).
 * @param {HTMLElement} container
 * @returns {{ definirProgresso: (p:number)=>void, destruir: ()=>void }}
 */
export function montarFrasco(container) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const temaAtual = () => (document.body.dataset.theme === "dark" ? "dark" : "light");
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const cena = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // Painel de fundo (acompanha o tema da página)
  // toneMapped:false — o painel precisa sair com a cor EXATA da página
  const painel = new Mesh(new PlaneGeometry(14, 14), new MeshBasicMaterial({ map: fundoNascente(temaAtual()), depthWrite: false, toneMapped: false }));
  painel.position.set(0, 1.4, -3.2);
  cena.add(painel);
  const aoTrocarTema = new MutationObserver(() => {
    painel.material.map.dispose();
    painel.material.map = fundoNascente(temaAtual());
    painel.material.needsUpdate = true;
    rodar();
  });
  aoTrocarTema.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });

  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 1.25, 7.2);
  camera.lookAt(0, 1.2, 0);

  // Luz de nascer do sol: chave quente lateral + contraluz fria e suave
  const chave = new DirectionalLight("#FFD39A", 2.4);
  chave.position.set(3.5, 3, 2.5);
  const contra = new DirectionalLight("#F6E7DA", 1.2);
  contra.position.set(-3, 2, -3);
  cena.add(chave, contra, new AmbientLight("#FFF4E8", 0.35));

  const frasco = new Group();
  cena.add(frasco);

  // Vidro
  const vidro = new MeshPhysicalMaterial({
    color: "#FFF8F0",
    metalness: 0,
    roughness: 0.02,
    transmission: 1,
    thickness: 0.5,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    envMapIntensity: 1.2,
  });
  const corpo = new Mesh(new LatheGeometry(perfilCorpo(1), 96), vidro);
  frasco.add(corpo);

  // Líquido âmbar, até o ombro. OPACO de propósito: no three.js um objeto
  // com transmissão não aparece através de outro com transmissão — opaco,
  // ele entra na passada de refração e o vidro o distorce de verdade.
  const liquidoPerfil = perfilCorpo(1, 0.06).filter((v) => v.y <= 1.32);
  liquidoPerfil.push(new Vector2(0.001, 1.32));
  const liquido = new Mesh(
    new LatheGeometry(liquidoPerfil, 96),
    new MeshPhysicalMaterial({
      color: "#8E4410",          // âmbar de conhaque
      roughness: 0.4,
      metalness: 0,
      envMapIntensity: 0.55,     // sem as manchas brancas das luzes do ambiente
      emissive: new Color("#3A1604"),
      emissiveIntensity: 0.5,
    })
  );
  liquido.position.y = 0.03;
  frasco.add(liquido);

  const metal = new MeshStandardMaterial({ color: OURO, metalness: 1, roughness: 0.22, envMapIntensity: 1.3 });

  // O horizonte: anel dourado fino na cintura do frasco
  const horizonte = new Mesh(new TorusGeometry(0.815, 0.008, 12, 160), metal);
  horizonte.rotation.x = Math.PI / 2;
  horizonte.position.y = 0.72;
  frasco.add(horizonte);

  // Gargalo + colar + tampa
  const colar = new Mesh(new CylinderGeometry(0.27, 0.27, 0.14, 64), metal);
  colar.position.y = 2.06;
  const tampa = new Mesh(new CylinderGeometry(0.34, 0.3, 0.62, 8, 1), metal); // octogonal: facetas pegam luz
  tampa.position.y = 2.44;
  const topoTampa = new Mesh(new SphereGeometry(0.12, 32, 16), metal);
  topoTampa.position.y = 2.8;
  frasco.add(colar, tampa, topoTampa);

  // Sombra de contato no "pedestal"
  const sombra = new Mesh(
    new PlaneGeometry(2.8, 2.8),
    new MeshBasicMaterial({ map: sombraDeContato(), transparent: true, depthWrite: false, toneMapped: false })
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = -0.01;
  cena.add(sombra);

  frasco.position.y = 0.05;

  // ── Estado e animação ─────────────────────────────────────────────────
  let progresso = 0;        // 0..1 vindo do scroll (ScrollTrigger)
  let alvoMouseX = 0, alvoMouseY = 0, mouseX = 0, mouseY = 0;
  let visivel = false, quadro = 0, inicio = performance.now();

  function ajustar() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(ajustar);
  ro.observe(container);
  ajustar();

  function aoMover(e) {
    const r = container.getBoundingClientRect();
    alvoMouseX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    alvoMouseY = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }
  window.addEventListener("pointermove", aoMover, { passive: true });

  function desenhar(agora) {
    quadro = 0;
    if (!visivel || document.hidden) return;
    const t = (agora - inicio) / 1000;
    mouseX = MathUtils.lerp(mouseX, alvoMouseX, 0.05);
    mouseY = MathUtils.lerp(mouseY, alvoMouseY, 0.05);

    // Gira com o scroll (3/4 de volta ao longo da seção) + respiração lenta
    frasco.rotation.y = progresso * Math.PI * 1.5 + t * 0.12 + mouseX * 0.25;
    frasco.rotation.x = mouseY * 0.06;
    frasco.position.y = 0.05 + Math.sin(t * 0.9) * 0.04;
    camera.position.z = 7.2 - progresso * 0.9;
    camera.position.y = 1.25 + (1 - progresso) * 0.15;
    camera.lookAt(0, 1.2, 0);
    // A luz quente "nasce" conforme a seção avança
    chave.intensity = 1.6 + progresso * 1.4;

    renderer.render(cena, camera);
    quadro = requestAnimationFrame(desenhar);
  }
  function rodar() { if (!quadro && visivel && !document.hidden) quadro = requestAnimationFrame(desenhar); }

  const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; rodar(); }, { rootMargin: "100px" });
  io.observe(container);
  const aoTrocarAba = () => rodar();
  document.addEventListener("visibilitychange", aoTrocarAba);

  return {
    definirProgresso(p) { progresso = MathUtils.clamp(p, 0, 1); rodar(); },
    destruir() {
      cancelAnimationFrame(quadro);
      io.disconnect(); ro.disconnect(); aoTrocarTema.disconnect();
      window.removeEventListener("pointermove", aoMover);
      document.removeEventListener("visibilitychange", aoTrocarAba);
      renderer.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    },
  };
}
