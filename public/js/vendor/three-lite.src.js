// Entrada do bundle enxuto do three.js: exporta SÓ o que js/robot.js usa.
// Para regenerar (ver js/vendor/LEIA-ME.txt):
//   npx esbuild three-lite.src.js --bundle --minify --format=esm --legal-comments=eof --outfile=three-lite.min.js
export {
    WebGLRenderer,
    Scene,
    PerspectiveCamera,
    Group,
    HemisphereLight,
    DirectionalLight,
    Box3,
    Vector3,
} from 'three';
export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
