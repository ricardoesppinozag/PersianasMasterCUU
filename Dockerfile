# ===================================
# Dockerfile para Cotización de Persianas Enrollables
# ===================================

# Etapa 1: Build del Frontend (Expo Web)
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copiar archivos de dependencias
COPY frontend/package.json frontend/yarn.lock ./

# Instalar dependencias
RUN yarn install --frozen-lockfile

# Copiar código fuente del frontend
COPY frontend/ ./

# Build para web (producción)
RUN yarn expo export:web

# ===================================
# Etapa 2: Backend + Servir Frontend
# ===================================
FROM python:3.11-slim

WORKDIR /app

# Instalar nginx para servir el frontend
RUN apt-get update && apt-get install -y \
    nginx \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements del backend
COPY backend/requirements.txt ./backend/

# Instalar dependencias de Python
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copiar código del backend
COPY backend/ ./backend/

# Copiar el build del frontend desde la etapa anterior
COPY --from=frontend-builder /app/frontend/dist /var/www/html

# Configuración de Nginx
RUN echo 'server { \n\
    listen 80; \n\
    server_name localhost; \n\
    \n\
    # Servir frontend estático \n\
    location / { \n\
        root /var/www/html; \n\
        try_files $uri $uri/ /index.html; \n\
    } \n\
    \n\
    # Proxy para API backend \n\
    location /api/ { \n\
        proxy_pass http://127.0.0.1:8001; \n\
        proxy_http_version 1.1; \n\
        proxy_set_header Upgrade $http_upgrade; \n\
        proxy_set_header Connection "upgrade"; \n\
        proxy_set_header Host $host; \n\
        proxy_set_header X-Real-IP $remote_addr; \n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \n\
        proxy_set_header X-Forwarded-Proto $scheme; \n\
    } \n\
}' > /etc/nginx/sites-available/default

# Configuración de Supervisor
RUN echo '[supervisord] \n\
nodaemon=true \n\
\n\
[program:nginx] \n\
command=nginx -g "daemon off;" \n\
autostart=true \n\
autorestart=true \n\
\n\
[program:backend] \n\
command=uvicorn server:app --host 0.0.0.0 --port 8001 \n\
directory=/app/backend \n\
autostart=true \n\
autorestart=true \n\
environment=MONGO_URL="%(ENV_MONGO_URL)s",DB_NAME="%(ENV_DB_NAME)s" \n\
' > /etc/supervisor/conf.d/supervisord.conf

# Puerto expuesto
EXPOSE 80

# Variables de entorno (deben ser provistas al ejecutar el contenedor)
ENV MONGO_URL=""
ENV DB_NAME="persianas_quotes"

# Comando de inicio
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
