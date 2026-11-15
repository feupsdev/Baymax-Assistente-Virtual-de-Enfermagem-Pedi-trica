<?php
declare(strict_types=1);

// Nunca mostrar avisos/erros do PHP no corpo da resposta (quebraria o JSON). Vão para o log.
ini_set('display_errors', '0');

require __DIR__ . '/../src/gemini.php';
require __DIR__ . '/../src/ratelimit.php';

const MAX_CARACTERES = 1000;       // tamanho máximo de cada mensagem
const MAX_HISTORICO = 10;          // mensagens anteriores enviadas à IA
const LIMITE_POR_IP = 15;          // requisições por minuto, por visitante
const LIMITE_GLOBAL = 300;         // requisições por hora, no site todo (protege a cota da API)

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder(int $status, array $dados): never
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    responder(405, ['erro' => 'Método não permitido.']);
}

if (rate_limit_excedido('ip:' . ip_cliente(), LIMITE_POR_IP, 60)
    || rate_limit_excedido('global', LIMITE_GLOBAL, 3600)) {
    responder(429, ['erro' => 'Muitas mensagens em pouco tempo 😅 Aguarde um instante e tente de novo.']);
}

$entrada = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($entrada)) {
    responder(400, ['erro' => 'Requisição inválida.']);
}

$mensagem = is_string($entrada['mensagem'] ?? null) ? trim($entrada['mensagem']) : '';
if ($mensagem === '') {
    responder(400, ['erro' => 'Envie uma mensagem antes de perguntar. — BayMax']);
}
if (mb_strlen($mensagem) > MAX_CARACTERES) {
    responder(400, ['erro' => 'Mensagem muito longa. Tente resumir em até ' . MAX_CARACTERES . ' caracteres.']);
}

// Histórico vindo do navegador: só aceita itens bem formados e limita o tamanho.
$historico = [];
foreach (is_array($entrada['historico'] ?? null) ? $entrada['historico'] : [] as $item) {
    $papel = is_array($item) ? ($item['papel'] ?? null) : null;
    $texto = is_array($item) ? ($item['texto'] ?? null) : null;
    if (($papel === 'usuario' || $papel === 'bot') && is_string($texto) && trim($texto) !== '') {
        $historico[] = ['papel' => $papel, 'texto' => mb_substr($texto, 0, MAX_CARACTERES * 2)];
    }
}
$historico = array_slice($historico, -MAX_HISTORICO);
while ($historico !== [] && $historico[0]['papel'] === 'bot') {
    array_shift($historico); // a conversa enviada à IA deve começar por uma fala do usuário
}

$apiKey = getenv('GEMINI_API_KEY');
if (!$apiKey) {
    error_log('[BayMax] GEMINI_API_KEY não configurada no servidor.');
    responder(500, ['erro' => 'O BayMax está indisponível no momento.']);
}
$modelo = getenv('GEMINI_MODEL') ?: GEMINI_MODELO_PADRAO;

$resultado = gemini_gerar_resposta($historico, $mensagem, $apiKey, $modelo);

if (!$resultado['ok']) {
    error_log('[BayMax] ' . $resultado['log']);
    responder($resultado['status'], ['erro' => $resultado['erro']]);
}

responder(200, ['resposta' => $resultado['texto']]);
