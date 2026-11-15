const MAX_HISTORICO = 10;       // mensagens anteriores enviadas ao servidor
const TIMEOUT_MS = 40000;       // tempo máximo de espera pela resposta
const FONTE_MIN = 10;
const FONTE_MAX = 28;

const chat = document.getElementById('chat');
const campo = document.getElementById('CampoMensagem');
const btnEnviar = document.getElementById('btnEnviar');

let historico = [];             // [{ papel: 'usuario' | 'bot', texto }]
let aguardando = false;
let tamanhoFonte = 16;

function mostrarMensagem(texto, classe) {
    const p = document.createElement('p');
    p.className = classe;
    p.textContent = texto;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
    return p;
}

function limparChat() {
    chat.innerHTML = '';
    historico = [];
}

function definirAguardando(valor) {
    aguardando = valor;
    btnEnviar.disabled = valor;
}

async function enviarMensagem() {
    if (aguardando) return;

    const msg = campo.value.trim();
    if (msg === '') return;

    mostrarMensagem(msg, 'mensagem-usuario');
    campo.value = '';
    definirAguardando(true);

    const carregando = mostrarMensagem('BayMax está digitando...', 'mensagem-bot mensagem-carregando');
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);

    try {
        const res = await fetch('chat.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensagem: msg, historico: historico.slice(-MAX_HISTORICO) }),
            signal: controle.signal
        });

        let dados = null;
        try {
            dados = await res.json();
        } catch (_) {
            // corpo não era JSON: tratado abaixo
        }

        if (!res.ok || !dados || !dados.resposta) {
            throw new Error((dados && dados.erro) || 'Ocorreu um erro ao processar sua mensagem.');
        }

        carregando.remove();
        mostrarMensagem(dados.resposta, 'mensagem-bot');
        // Só guarda no histórico quando a troca deu certo, para manter usuário/bot alternados.
        historico.push({ papel: 'usuario', texto: msg }, { papel: 'bot', texto: dados.resposta });
    } catch (erro) {
        carregando.remove();
        let texto = erro.message;
        if (erro.name === 'AbortError') {
            texto = 'A resposta demorou demais. Tente novamente.';
        } else if (erro instanceof TypeError) {
            texto = 'Não consegui me conectar. Verifique sua internet e tente de novo.';
        }
        mostrarMensagem('BayMax: ❌ ' + texto, 'mensagem-bot');
    } finally {
        clearTimeout(timer);
        definirAguardando(false);
        campo.focus();
    }
}

function aumentarFonte() {
    tamanhoFonte = Math.min(tamanhoFonte + 2, FONTE_MAX);
    chat.style.fontSize = tamanhoFonte + 'px';
}

function diminuirFonte() {
    tamanhoFonte = Math.max(tamanhoFonte - 2, FONTE_MIN);
    chat.style.fontSize = tamanhoFonte + 'px';
}

btnEnviar.addEventListener('click', enviarMensagem);
document.getElementById('btnLimpar').addEventListener('click', limparChat);
document.getElementById('btnMais').addEventListener('click', aumentarFonte);
document.getElementById('btnMenos').addEventListener('click', diminuirFonte);
campo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enviarMensagem();
});
