<?php
declare(strict_types=1);

/**
 * Limita quantas requisições uma "chave" (ex.: IP) pode fazer numa janela de tempo.
 * Registra a tentativa e devolve true se o limite JÁ foi excedido.
 * Usa arquivos temporários: simples e suficiente para este projeto
 * (no Render o disco é efêmero, então os contadores zeram a cada deploy).
 */
function rate_limit_excedido(string $chave, int $limite, int $janelaSegundos): bool
{
    $arquivo = sys_get_temp_dir() . '/baymax_rl_' . hash('sha256', $chave);
    $fp = @fopen($arquivo, 'c+');
    if ($fp === false) {
        return false; // se não der para controlar, não bloqueia o uso
    }

    flock($fp, LOCK_EX);
    $agora = time();
    $marcas = array_filter(
        array_map('intval', explode(',', (string) stream_get_contents($fp))),
        static fn(int $t): bool => $t > $agora - $janelaSegundos
    );

    $excedido = count($marcas) >= $limite;
    if (!$excedido) {
        $marcas[] = $agora;
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, implode(',', $marcas));
    }

    flock($fp, LOCK_UN);
    fclose($fp);
    return $excedido;
}

/** IP do visitante (melhor esforço: atrás de proxy, como no Render, usa X-Forwarded-For). */
function ip_cliente(): string
{
    $encaminhado = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($encaminhado !== '') {
        return trim(explode(',', $encaminhado)[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? 'desconhecido';
}
