// Robô 3D do Baymax (three.js + GLTFLoader).
//
// Modelo: "DAY19: ROBOT" por binrong (CC BY-NC 4.0) — créditos em CREDITOS.md e no rodapé da página.
// O robô é só decoração: o canvas não recebe cliques (CSS: pointer-events: none) e, se algo
// falhar (WebGL indisponível, GLB não carrega...), a página volta ao visual original e o chat segue normal.

import {
    WebGLRenderer, Scene, PerspectiveCamera, Group,
    HemisphereLight, DirectionalLight, Box3, Vector3, GLTFLoader,
} from './vendor/three-lite.min.js';

// ---------- Configuração (ajuste aqui) ----------
const MODELO_URL = new URL('../models/baymax-robot.glb', import.meta.url).href;
const TEMPO_MAX_CARREGAMENTO_MS = 20000;

const FOV = 30;                 // abertura vertical da câmera (graus)
const DISTANCIA_CAMERA = 500;   // longe = pouca distorção de perspectiva; o tamanho na tela vem do layout
const CABECA = 0.52;            // fração aproximada da altura do robô ocupada pela cabeça
const MARGEM_TOPO_PX = 14;
const FOLGA_PERSPECTIVA = 0.05; // a parte da frente do robô aparece um pouco maior; reserva essa folga

const MOVIMENTO = {
    // Quanto o corpo gira (radianos) quando o mouse vai até a borda da janela.
    desktop: { yaw: 0.42, pitch: 0.12, balancoRepouso: 0.07 },
    // Celular: sem mouse, então segue o toque e balança um pouco mais em repouso.
    celular: { yaw: 0.30, pitch: 0.08, balancoRepouso: 0.16 },
    suavidade: 6,               // maior = acompanha mais rápido
    voltaAoCentroApos_ms: 4000, // sem mexer o mouse/dedo, o robô volta a olhar para a frente
};
// ------------------------------------------------

const html = document.documentElement;
const canvas = document.getElementById('robot-canvas');

const consultaCelular = window.matchMedia('(max-width: 700px), (pointer: coarse)');
const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer, scene, camera, pivo;
let alturaModelo = 1, proporcaoModelo = 1;
let baseY = 0, alturaRoboMundo = 1;
let finalizado = false;          // já deu certo ou já falhou: ignora eventos tardios
let animando = false;
let idQuadro = 0;

// Estado do movimento
const alvo = { x: 0, y: 0 };     // posição do ponteiro, de -1 a 1
let atencao = 0;                 // 0 = olha para a frente, 1 = segue o ponteiro
let ultimoMovimento = -Infinity;
let yaw = 0, pitch = 0;

function falhar(motivo, erro) {
    if (finalizado) return;
    finalizado = true;
    console.warn('[Baymax 3D] Robô desativado:', motivo, erro || '');
    cancelAnimationFrame(idQuadro);
    clearTimeout(temporizador);
    if (renderer) renderer.dispose();
    // Volta ao visual original da página; o chat não é afetado.
    html.classList.remove('robot-on', 'robot-ready');
    if (canvas) canvas.remove();
}

const temporizador = setTimeout(() => falhar('tempo esgotado ao carregar o modelo'), TEMPO_MAX_CARREGAMENTO_MS);

function iniciar() {
    if (!canvas) return falhar('elemento #robot-canvas não encontrado');

    try {
        renderer = new WebGLRenderer({
            canvas,
            alpha: true,            // fundo transparente: aparece o fundo da página
            antialias: true,
            powerPreference: 'low-power',
        });
    } catch (erro) {
        return falhar('WebGL indisponível neste navegador/dispositivo', erro);
    }
    renderer.setClearColor(0x000000, 0);

    scene = new Scene();
    camera = new PerspectiveCamera(FOV, 1, 10, 2000);
    camera.position.set(0, 0, DISTANCIA_CAMERA);

    // Luz suave: o "chão" da luz ambiente é avermelhado, como o fundo, para o robô branco não parecer colado.
    scene.add(new HemisphereLight(0xffffff, 0xf0a9ab, 1.9));
    const principal = new DirectionalLight(0xffffff, 1.9);
    principal.position.set(-160, 240, 360);
    scene.add(principal);
    const preenchimento = new DirectionalLight(0xfff1f1, 0.9);   // clareia a parte de baixo da cabeça
    preenchimento.position.set(60, -160, 300);
    scene.add(preenchimento);
    const contorno = new DirectionalLight(0xffe3e3, 0.8);
    contorno.position.set(220, 80, -240);
    scene.add(contorno);

    // Se o contexto WebGL for perdido (comum em celulares), pausa e retoma sozinho.
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); parar(); });
    canvas.addEventListener('webglcontextrestored', () => { ajustarLayout(); desenhar(); iniciarLoop(); });

    new GLTFLoader().load(
        MODELO_URL,
        (gltf) => aoCarregar(gltf),
        undefined,
        (erro) => falhar('não foi possível carregar ' + MODELO_URL, erro),
    );
}

function aoCarregar(gltf) {
    if (finalizado) return;  // chegou depois do tempo limite

    try {
        const modelo = gltf.scene;

        // Brilho do material original (roughness 0 = espelho) suavizado para um branco fosco/macio.
        modelo.traverse((obj) => {
            if (obj.isMesh && obj.material) {
                obj.material.roughness = Math.max(obj.material.roughness ?? 0, 0.4);
                obj.material.metalness = 0;
            }
        });

        // Centraliza o modelo em um "pivô": a rotação acontece em torno do centro do robô.
        const caixa = new Box3().setFromObject(modelo);
        const tamanho = caixa.getSize(new Vector3());
        const centro = caixa.getCenter(new Vector3());
        modelo.position.sub(centro);
        alturaModelo = tamanho.y;
        proporcaoModelo = tamanho.x / tamanho.y;

        pivo = new Group();
        pivo.add(modelo);
        scene.add(pivo);

        ajustarLayout();
        desenhar();
    } catch (erro) {
        return falhar('erro ao preparar o modelo', erro);
    }

    finalizado = true;
    clearTimeout(temporizador);
    html.classList.add('robot-ready');
    canvas.classList.add('pronto');   // fade-in (CSS)

    new ResizeObserver(() => { ajustarLayout(); if (!animando) desenhar(); }).observe(document.body);

   // quem pediu menos movimento recebe o robô parado
    ligarPonteiro();
    iniciarLoop();
}

// Tamanho e posição do robô: a cabeça fica logo acima do cartão do chat; o corpo fica atrás dele.
function ajustarLayout() {
    if (!renderer || !pivo) return;
    const largura = canvas.clientWidth;
    const altura = canvas.clientHeight;
    if (!largura || !altura) return;

    const celular = consultaCelular.matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, celular ? 1.5 : 2));
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();

    const alturaVisivel = 2 * DISTANCIA_CAMERA * Math.tan((FOV / 2) * Math.PI / 180);

    const cartao = document.querySelector('.container');
    const topoCartao = cartao ? cartao.getBoundingClientRect().top : altura * 0.55;

    let alturaPx, topoPx;
    if (topoCartao < 140) {
        // Pouco espaço acima do cartão (ex.: celular deitado): robô maior, centralizado, atrás do chat.
        alturaPx = Math.min(altura * 0.8, (largura * 0.84) / proporcaoModelo);
        topoPx = (altura - alturaPx) / 2;
    } else {
        alturaPx = Math.min(altura * 0.88, (topoCartao - MARGEM_TOPO_PX) / CABECA);
        alturaPx = Math.min(alturaPx, (largura * 0.84) / proporcaoModelo); // não estoura em telas estreitas
        topoPx = Math.max(MARGEM_TOPO_PX + FOLGA_PERSPECTIVA * alturaPx, topoCartao - CABECA * alturaPx - 8);
    }

    const centroPx = topoPx + alturaPx / 2;
    alturaRoboMundo = (alturaPx / altura) * alturaVisivel;
    pivo.scale.setScalar(alturaRoboMundo / alturaModelo);
    baseY = ((altura / 2) - centroPx) / altura * alturaVisivel;
    pivo.position.y = baseY;
}

function desenhar() {
    if (renderer && scene && camera) renderer.render(scene, camera);
}

// ---------- Interação ----------
function ligarPonteiro() {
    const moveu = (e) => {
        alvo.x = (e.clientX / window.innerWidth) * 2 - 1;
        alvo.y = (e.clientY / window.innerHeight) * 2 - 1;
        ultimoMovimento = performance.now();
    };
    window.addEventListener('pointermove', moveu, { passive: true });
    window.addEventListener('pointerdown', moveu, { passive: true });
    // No celular, o navegador cancela os eventos "pointer" quando entende o gesto como rolagem;
    // os eventos "touch" continuam chegando, então o robô segue o dedo o tempo todo.
    const tocou = (e) => { if (e.touches.length) moveu(e.touches[0]); };
    window.addEventListener('touchstart', tocou, { passive: true });
    window.addEventListener('touchmove', tocou, { passive: true });
    // Mouse saiu da janela: volta a olhar para a frente.
    html.addEventListener('mouseleave', () => { ultimoMovimento = -Infinity; });
}

function iniciarLoop() {
    if (animando || !finalizado || reduzirMovimento) return;
    animando = true;
    let ultimo = performance.now();
    let relogio = 0;
    let ultimoDesenho = 0;

    const quadro = (agora) => {
        idQuadro = requestAnimationFrame(quadro);
        if (document.hidden) { ultimo = agora; return; }

        const celular = consultaCelular.matches;
        if (celular && agora - ultimoDesenho < 32) return;  // ~30 fps no celular: economiza bateria
        ultimoDesenho = agora;

        const dt = Math.min((agora - ultimo) / 1000, 0.05);
        ultimo = agora;
        relogio += dt;

        const cfg = celular ? MOVIMENTO.celular : MOVIMENTO.desktop;
        const k = 1 - Math.exp(-dt * MOVIMENTO.suavidade);       // suavização independente do fps
        const ativo = agora - ultimoMovimento < MOVIMENTO.voltaAoCentroApos_ms;
        atencao += ((ativo ? 1 : 0) - atencao) * (1 - Math.exp(-dt * 1.6));

        yaw += (alvo.x * cfg.yaw * atencao - yaw) * k;
        pitch += (alvo.y * cfg.pitch * atencao - pitch) * k;

        // Movimento natural em repouso: leve balanço, "respiração" e flutuação.
        const balanco = Math.sin(relogio * 0.6) * cfg.balancoRepouso;
        const cabeceio = Math.sin(relogio * 0.8 + 1.3) * 0.02;

        pivo.rotation.y = yaw + balanco;
        pivo.rotation.x = pitch + cabeceio;
        pivo.position.y = baseY + Math.sin(relogio * 1.2) * alturaRoboMundo * 0.008;

        desenhar();
    };
    idQuadro = requestAnimationFrame(quadro);
}

function parar() {
    animando = false;
    cancelAnimationFrame(idQuadro);
}

iniciar();
