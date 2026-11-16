# 🩺🤖 Baymax – Assistente Virtual de Enfermagem Pediátrica
**(PHP + HTML + CSS + JS + Google Gemini)**

**Baymax** é um chatbot inspirado no personagem de *Operação Big Hero*, que responde dúvidas sobre **enfermagem e saúde infantil** de forma simples, acolhedora e prática, usando o **Google Gemini**.

> ⚠️ O Baymax não faz diagnóstico, não indica medicamentos nem doses e não substitui atendimento médico.

## Estrutura

```
public/        ← única pasta servida ao navegador
  index.html, style.css, script.js, icon.png, fundo.webp
  chat.php               ← endpoint: valida a mensagem, aplica limites e chama a IA
  css/robot.css          ← layout/estilo do robô 3D
  js/robot.js            ← robô 3D (three.js): carregamento, enquadramento, movimento, tratamento de erros
  js/vendor/             ← three.js + GLTFLoader empacotados (ver LEIA-ME.txt dentro da pasta)
  models/baymax-robot.glb← modelo 3D (CC BY-NC 4.0, ver CREDITOS.md)
src/           ← código do servidor (não acessível pelo navegador)
  gemini.php   ← toda a integração com a IA
  prompt.php   ← prompt de sistema do Baymax
  ratelimit.php
CREDITOS.md    ← créditos e licenças (modelo 3D, three.js)
Dockerfile
```

## Robô 3D

- Fica atrás do chat (`pointer-events: none`): não bloqueia cliques nem digitação.
- Acompanha o mouse (desktop) ou o dedo (celular) com suavidade e se mexe levemente quando está parado;
  depois de ~4 s sem movimento volta a olhar para a frente.
- Se o navegador não tiver WebGL, o modelo não carregar ou o JavaScript do robô falhar, a página volta
  sozinha ao visual original (wallpaper + chat centralizado) e o chat continua funcionando.
- Quem usa "reduzir movimento" no sistema recebe o robô parado.
- Ajustes rápidos (tamanho da rotação, tempo de retorno, luz): constantes no topo de `js/robot.js`.
- Para voltar ao wallpaper `fundo.webp`, apague o bloco `background-*` em `css/robot.css`.
- ⚠️ Licença **CC BY-NC**: uso apenas não comercial e com crédito (já no rodapé). Veja `CREDITOS.md`.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | sim | Chave criada no [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | não | Modelo a usar (padrão: `gemini-3.8-flash`). Se o Google aposentar o modelo, troque só esta variável. |

A chave **nunca** vai no código: configure-a no painel do servidor (Render → *Environment*).

## Rodar localmente

```bash
GEMINI_API_KEY=sua_chave php -S localhost:8000 -t public
# abra http://localhost:8000
```

> Abra sempre pelo endereço `http://localhost:8000`. Abrir o `index.html` com duplo clique (`file://`) não
> funciona: o navegador bloqueia módulos JS e o carregamento do modelo 3D, e o chat precisa do PHP.

## Deploy no Render

Serviço *Web Service* com ambiente **Docker** apontando para este repositório; adicione `GEMINI_API_KEY` em *Environment*. O Render fornece a variável `PORT` automaticamente.

## Se o Baymax parar de responder

Veja os *Logs* do serviço: o `chat.php` registra o motivo (modelo aposentado, chave inválida, cota excedida etc.).
