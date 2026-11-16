<?php
declare(strict_types=1);

// Toda a integração com a IA fica neste arquivo.
// Para trocar de modelo, basta definir GEMINI_MODEL no servidor (sem mexer no código).

const GEMINI_MODELO_PADRAO = 'gemini-3.8-flash';
const GEMINI_URL_PADRAO = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Envia a conversa ao Gemini e devolve:
 *  ['ok' => true,  'texto' => string]
 *  ['ok' => false, 'status' => int HTTP para o navegador, 'erro' => string para o usuário, 'log' => string técnica]
 *
 * @param array<int, array{papel: string, texto: string}> $historico Mensagens anteriores ('usuario' ou 'bot')
 */
function gemini_gerar_resposta(array $historico, string $mensagem, string $apiKey, string $modelo): array
{
    static $prompt = null;
    $prompt ??= require __DIR__ . '/prompt.php';

    $conteudos = [];
    foreach ($historico as $item) {
        $conteudos[] = [
            'role' => $item['papel'] === 'bot' ? 'model' : 'user',
            'parts' => [['text' => $item['texto']]],
        ];
    }
    $conteudos[] = ['role' => 'user', 'parts' => [['text' => $mensagem]]];

    $payload = [
        'systemInstruction' => ['parts' => [['text' => $prompt]]],
        'contents' => $conteudos,
        'generationConfig' => [
            'temperature' => 0.7,
            // Margem folgada: modelos com "raciocínio" gastam parte deste limite pensando.
            'maxOutputTokens' => 1024,
        ],
    ];

    $base = rtrim(getenv('GEMINI_API_BASE') ?: GEMINI_URL_PADRAO, '/');
    $url = $base . '/models/' . rawurlencode($modelo) . ':generateContent';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            // Chave no cabeçalho (e não na URL) para não aparecer em logs.
            'x-goog-api-key: ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
    ]);

    $corpo = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $erroCurl = curl_error($ch);
    curl_close($ch);

    if ($corpo === false) {
        return gemini_falha(502, 'Não consegui falar com o BayMax agora. Tente novamente em instantes.', "falha de conexão: $erroCurl");
    }

    $json = json_decode($corpo, true);
    if (!is_array($json)) {
        return gemini_falha(502, 'O BayMax enviou uma resposta inesperada. Tente novamente.', "resposta não é JSON (HTTP $status)");
    }

    if ($status >= 400) {
        $detalhe = (string) ($json['error']['message'] ?? 'sem detalhes');
        return match (true) {
            $status === 429 => gemini_falha(429, 'Estou recebendo muitas perguntas agora 😅 Tente novamente em instantes.', "cota/limite excedido (429): $detalhe"),
            $status === 404 => gemini_falha(500, 'O BayMax está indisponível no momento.', "modelo '$modelo' não encontrado (404). Ele pode ter sido aposentado: ajuste GEMINI_MODEL. Detalhe: $detalhe"),
            $status >= 500 => gemini_falha(502, 'O serviço de IA está instável. Tente novamente em instantes.', "erro do Gemini ($status): $detalhe"),
            default => gemini_falha(500, 'O BayMax está indisponível no momento.', "requisição recusada ($status), verifique GEMINI_API_KEY e GEMINI_MODEL: $detalhe"),
        };
    }

    $bloqueio = $json['promptFeedback']['blockReason'] ?? null;
    if ($bloqueio !== null) {
        return gemini_falha(422, 'Não consegui responder a essa mensagem. Tente reformular a pergunta.', "mensagem bloqueada: $bloqueio");
    }

    $candidato = $json['candidates'][0] ?? [];
    $texto = '';
    foreach ($candidato['content']['parts'] ?? [] as $parte) {
        // Ignora partes de "raciocínio" interno, se o modelo as devolver.
        if (!empty($parte['thought'])) {
            continue;
        }
        $texto .= (string) ($parte['text'] ?? '');
    }
    $texto = trim($texto);

    if ($texto === '') {
        $motivo = (string) ($candidato['finishReason'] ?? 'desconhecido');
        return gemini_falha(502, 'Não consegui formular uma resposta. Tente reformular a pergunta.', "resposta vazia (finishReason: $motivo)");
    }

    return ['ok' => true, 'texto' => $texto];
}

function gemini_falha(int $status, string $erroUsuario, string $log): array
{
    return ['ok' => false, 'status' => $status, 'erro' => $erroUsuario, 'log' => $log];
}
