
import {
    WebGLRenderer,
    Scene,
    PerspectiveCamera,
    Group,
    HemisphereLight,
    DirectionalLight,
    Box3,
    Vector3,
    GLTFLoader,
} from './vendor/three-lite.min.js';

/* ==========================================
   CONFIGURAÇÕES
   ========================================== */

const MODELO_URL = new URL(
    '../models/baymax-robot.glb',
    import.meta.url
).href;

const TEMPO_MAX_CARREGAMENTO_MS = 20000;

const FOV = 30;
const DISTANCIA_CAMERA = 500;

const MARGEM_MODELO = 0.90;

const MOVIMENTO = {
    desktop: {
        yaw: 0.42,
        pitch: 0.12,
        balancoRepouso: 0.07,
    },

    celular: {
        yaw: 0.30,
        pitch: 0.08,
        balancoRepouso: 0.16,
    },

    suavidade: 6,
    voltaAoCentroApos_ms: 4000,
};

/* ==========================================
   ELEMENTOS
   ========================================== */

const html = document.documentElement;

const canvas = document.getElementById('robot-canvas');

const areaRobo = canvas
    ? canvas.closest('.robot-background')
    : null;

const consultaCelular = window.matchMedia(
    '(max-width: 700px), (pointer: coarse)'
);

/* ==========================================
   ESTADO
   ========================================== */

let renderer;
let scene;
let camera;
let pivo;

let alturaModelo = 1;
let proporcaoModelo = 1;

let baseY = 0;
let alturaRoboMundo = 1;

let finalizado = false;
let animando = false;

let idQuadro = 0;
let observador;

const alvo = {
    x: 0,
    y: 0,
};

let atencao = 0;

let ultimoMovimento = -Infinity;

let yaw = 0;
let pitch = 0;

/* ==========================================
   CONTROLE DE ERROS
   ========================================== */

function falhar(motivo, erro) {

    if (finalizado) return;

    finalizado = true;

    console.warn(
        '[Baymax 3D] Robô desativado:',
        motivo,
        erro || ''
    );

    cancelAnimationFrame(idQuadro);

    clearTimeout(temporizador);

    if (observador) {
        observador.disconnect();
    }

    if (renderer) {
        renderer.dispose();
    }

    html.classList.remove(
        'robot-on',
        'robot-ready'
    );

    if (canvas) {
        canvas.remove();
    }
}

/* ==========================================
   TEMPO LIMITE
   ========================================== */

const temporizador = setTimeout(
    () => falhar('tempo esgotado ao carregar o modelo'),
    TEMPO_MAX_CARREGAMENTO_MS
);

/* ==========================================
   INICIALIZAÇÃO
   ========================================== */

function iniciar() {

    if (!canvas || !areaRobo) {
        return falhar(
            'área do robô ou canvas não encontrado'
        );
    }

    try {

        renderer = new WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'low-power',
        });

    } catch (erro) {

        return falhar(
            'WebGL indisponível neste navegador/dispositivo',
            erro
        );
    }

    renderer.setClearColor(0x000000, 0);

    scene = new Scene();

    camera = new PerspectiveCamera(
        FOV,
        1,
        10,
        2000
    );

    camera.position.set(
        0,
        0,
        DISTANCIA_CAMERA
    );

    /* Iluminação principal */

    scene.add(
        new HemisphereLight(
            0xffffff,
            0xf0a9ab,
            1.9
        )
    );

    const principal = new DirectionalLight(
        0xffffff,
        1.9
    );

    principal.position.set(
        -160,
        240,
        360
    );

    scene.add(principal);

    /* Luz de preenchimento */

    const preenchimento = new DirectionalLight(
        0xfff1f1,
        0.9
    );

    preenchimento.position.set(
        60,
        -160,
        300
    );

    scene.add(preenchimento);

    /* Luz de contorno */

    const contorno = new DirectionalLight(
        0xffe3e3,
        0.8
    );

    contorno.position.set(
        220,
        80,
        -240
    );

    scene.add(contorno);

    /* Recuperação do contexto WebGL */

    canvas.addEventListener(
        'webglcontextlost',
        (e) => {

            e.preventDefault();

            parar();
        }
    );

    canvas.addEventListener(
        'webglcontextrestored',
        () => {

            ajustarLayout();

            desenhar();

            iniciarLoop();
        }
    );

    /* Carregamento do modelo */

    new GLTFLoader().load(
        MODELO_URL,

        (gltf) => aoCarregar(gltf),

        undefined,

        (erro) => {
            falhar(
                'não foi possível carregar o modelo 3D',
                erro
            );
        }
    );
}

/* ==========================================
   CARREGAMENTO DO MODELO
   ========================================== */

function aoCarregar(gltf) {

    if (finalizado) return;

    try {

        const modelo = gltf.scene;

        modelo.traverse((obj) => {

            if (obj.isMesh && obj.material) {

                obj.material.roughness = Math.max(
                    obj.material.roughness ?? 0,
                    0.4
                );

                obj.material.metalness = 0;
            }

        });

        /* Dimensões do modelo */

        const caixa = new Box3().setFromObject(modelo);

        const tamanho = caixa.getSize(
            new Vector3()
        );

        const centro = caixa.getCenter(
            new Vector3()
        );

        modelo.position.sub(centro);

        alturaModelo = tamanho.y;

        proporcaoModelo = tamanho.x / tamanho.y;

        /* Pivô para movimentação */

        pivo = new Group();

        pivo.add(modelo);

        scene.add(pivo);

        ajustarLayout();

        desenhar();

    } catch (erro) {

        return falhar(
            'erro ao preparar o modelo',
            erro
        );
    }

    finalizado = true;

    clearTimeout(temporizador);

    html.classList.add('robot-ready');

    canvas.classList.add('pronto');

    /* Observa a área independente do robô */

    if ('ResizeObserver' in window) {

        observador = new ResizeObserver(() => {

            ajustarLayout();

            if (!animando) {
                desenhar();
            }

        });

        observador.observe(areaRobo);

    } else {

        window.addEventListener(
            'resize',
            () => {

                ajustarLayout();

                if (!animando) {
                    desenhar();
                }

            },
            { passive: true }
        );
    }

    /* Detecta mudanças de dispositivo */

    if (consultaCelular.addEventListener) {

        consultaCelular.addEventListener(
            'change',
            () => {

                ajustarLayout();

                if (!animando) {
                    desenhar();
                }

            }
        );
    }

    ligarPonteiro();

    iniciarLoop();
}

/* ==========================================
   AJUSTE DO LAYOUT
   CANVAS INDEPENDENTE À DIREITA
   ========================================== */

function ajustarLayout() {

    if (!renderer || !pivo || !areaRobo) {
        return;
    }

    const largura = areaRobo.clientWidth;

    const altura = areaRobo.clientHeight;

    if (!largura || !altura) {
        return;
    }

    const celular = consultaCelular.matches;

    /* Qualidade de renderização */

    renderer.setPixelRatio(
        Math.min(
            window.devicePixelRatio || 1,
            celular ? 1.5 : 2
        )
    );

    /* Tamanho do canvas */

    renderer.setSize(
        largura,
        altura,
        false
    );

    /* Proporção da câmera */

    camera.aspect = largura / altura;

    camera.updateProjectionMatrix();

    /* Área visível da câmera */

    const alturaVisivel =
        2 *
        DISTANCIA_CAMERA *
        Math.tan(
            (FOV / 2) * Math.PI / 180
        );

    /* Tamanho do robô dentro da área */

    let alturaPx = Math.min(
        altura * MARGEM_MODELO,
        (largura * 0.90) / proporcaoModelo
    );

    alturaPx = Math.max(
        1,
        Math.min(alturaPx, altura * 0.96)
    );

    /* Escala do modelo */

    alturaRoboMundo =
        (alturaPx / altura) * alturaVisivel;

    pivo.scale.setScalar(
        alturaRoboMundo / alturaModelo
    );

    /* Centralização */

    baseY = 0;

    pivo.position.set(
        0,
        baseY,
        0
    );
}

/* ==========================================
   RENDERIZAÇÃO
   ========================================== */

function desenhar() {

    if (renderer && scene && camera) {

        renderer.render(
            scene,
            camera
        );
    }
}

/* ==========================================
   INTERAÇÃO COM MOUSE E TOQUE
   ========================================== */

function ligarPonteiro() {

    const moveu = (e) => {

        const rect = areaRobo.getBoundingClientRect();

        if (!rect.width || !rect.height) {
            return;
        }

        /* Coordenadas relativas à área do robô */

        alvo.x =
            ((e.clientX - rect.left) / rect.width) * 2 - 1;

        alvo.y =
            ((e.clientY - rect.top) / rect.height) * 2 - 1;

        alvo.x = Math.max(
            -1,
            Math.min(1, alvo.x)
        );

        alvo.y = Math.max(
            -1,
            Math.min(1, alvo.y)
        );

        ultimoMovimento = performance.now();
    };

    areaRobo.addEventListener(
        'pointermove',
        moveu,
        { passive: true }
    );

    areaRobo.addEventListener(
        'pointerdown',
        moveu,
        { passive: true }
    );

    const tocou = (e) => {

        if (e.touches.length) {
            moveu(e.touches[0]);
        }
    };

    areaRobo.addEventListener(
        'touchstart',
        tocou,
        { passive: true }
    );

    areaRobo.addEventListener(
        'touchmove',
        tocou,
        { passive: true }
    );

    areaRobo.addEventListener(
        'pointerleave',
        () => {
            ultimoMovimento = -Infinity;
        },
        { passive: true }
    );
}

/* ==========================================
   ANIMAÇÃO
   ========================================== */

function iniciarLoop() {

    if (
        animando ||
        !finalizado ||
        !pivo
    ) {
        return;
    }

    animando = true;

    let ultimo = performance.now();

    let relogio = 0;

    let ultimoDesenho = 0;

    const quadro = (agora) => {

        idQuadro = requestAnimationFrame(quadro);

        if (document.hidden) {

            ultimo = agora;

            return;
        }

        const celular = consultaCelular.matches;

        /* Limita FPS em celulares */

        if (
            celular &&
            agora - ultimoDesenho < 32
        ) {
            return;
        }

        ultimoDesenho = agora;

        const dt = Math.min(
            (agora - ultimo) / 1000,
            0.05
        );

        ultimo = agora;

        relogio += dt;

        const cfg = celular
            ? MOVIMENTO.celular
            : MOVIMENTO.desktop;

        const k =
            1 - Math.exp(
                -dt * MOVIMENTO.suavidade
            );

        const ativo =
            agora - ultimoMovimento <
            MOVIMENTO.voltaAoCentroApos_ms;

        /* Atenção ao ponteiro */

        atencao += (
            (ativo ? 1 : 0) - atencao
        ) * (
            1 - Math.exp(-dt * 1.6)
        );

        /* Rotação horizontal */

        yaw += (
            alvo.x * cfg.yaw * atencao - yaw
        ) * k;

        /* Rotação vertical */

        pitch += (
            alvo.y * cfg.pitch * atencao - pitch
        ) * k;

        /* Balanço natural */

        const balanco =
            Math.sin(relogio * 0.6) *
            cfg.balancoRepouso;

        const cabeceio =
            Math.sin(relogio * 0.8 + 1.3) *
            0.02;

        pivo.rotation.y =
            yaw + balanco;

        pivo.rotation.x =
            pitch + cabeceio;

        /* Movimento vertical */

        pivo.position.y =
            baseY +
            Math.sin(relogio * 1.2) *
            alturaRoboMundo *
            0.008;

        desenhar();
    };

    idQuadro = requestAnimationFrame(quadro);
}

/* ==========================================
   PARAR ANIMAÇÃO
   ========================================== */

function parar() {

    animando = false;

    cancelAnimationFrame(idQuadro);
}

/* ==========================================
   INICIALIZAÇÃO FINAL
   ========================================== */

iniciar();
