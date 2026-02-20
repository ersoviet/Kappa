# ─────────────────────────────────────────────
#  EFT Tracker — Dockerfile
#  Imagen base: Node.js 20 LTS (Alpine = ligera)
# ─────────────────────────────────────────────

FROM node:20-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar package.json primero (para aprovechar la caché de capas de Docker)
COPY package*.json ./

# Instalar dependencias de producción únicamente
RUN npm install --omit=dev

# Copiar el resto del código fuente
COPY . .

# Exponer el puerto de la app
EXPOSE 3000

# Variable de entorno para producción
ENV NODE_ENV=production

# Arrancar el servidor
CMD ["node", "server.js"]
