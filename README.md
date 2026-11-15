# 🩺🤖 Baymax – Assistente Virtual de Enfermagem Pediátrica
**(PHP + HTML + CSS + JS + Google Gemini)**

**Baymax** é um chatbot inspirado no personagem de *Operação Big Hero*, que responde dúvidas sobre **enfermagem e saúde infantil** de forma simples, acolhedora e prática, usando o **Google Gemini**.

> ⚠️ O Baymax não faz diagnóstico, não indica medicamentos nem doses e não substitui atendimento médico.

## Estrutura

```
public/        ← única pasta servida ao navegador
  index.html, style.css, script.js, icon.png, fundo.webp
  chat.php     ← endpoint: valida a mensagem, aplica limites e chama a IA
src/           ← código do servidor (não acessível pelo navegador)
  gemini.php   ← toda a integração com a IA
  prompt.php   ← prompt de sistema do Baymax
  ratelimit.php
Dockerfile
```

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

## Deploy no Render

Serviço *Web Service* com ambiente **Docker** apontando para este repositório; adicione `GEMINI_API_KEY` em *Environment*. O Render fornece a variável `PORT` automaticamente.

## Se o Baymax parar de responder

Veja os *Logs* do serviço: o `chat.php` registra o motivo (modelo aposentado, chave inválida, cota excedida etc.).
