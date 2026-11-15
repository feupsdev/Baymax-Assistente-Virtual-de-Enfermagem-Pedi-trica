FROM php:8.2-cli

WORKDIR /app

COPY . .

# Vários processos para que uma resposta lenta da IA não trave os outros visitantes.
ENV PHP_CLI_SERVER_WORKERS=4

EXPOSE 10000

# O Render define PORT; localmente usa 10000. Só a pasta public/ é servida.
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-10000} -t public"]
