FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/public/ ./public/

FROM nginx:alpine
COPY --from=builder /app/public /usr/share/nginx/html
COPY infra/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
