#!/bin/bash
# Roda na VPS (chamado pelo deploy.ps1). Recebe em /root/EBOOK-APP/incoming:
#   backend.tgz, frontend-dist.tgz, nginx-frontend.conf
# e o arquivo de ambiente /root/EBOOK-APP/backend.env (já gravado pelo deploy.ps1).
set -euo pipefail

TAG="$1"
APP=/root/EBOOK-APP
IN="$APP/incoming"
API_SERVICE=ebook_api
WEB_SERVICE=ebook_frontend

mkdir -p "$APP/uploads" "$APP/frontend/dist" "$APP/deploy"

echo "== Backend: build da imagem ebook-api:$TAG"
rm -rf "$APP/backend-src"
mkdir -p "$APP/backend-src"
tar -xzf "$IN/backend.tgz" -C "$APP/backend-src"
docker build -q -t "ebook-api:$TAG" "$APP/backend-src"

if docker service inspect "$API_SERVICE" >/dev/null 2>&1; then
    echo "== Backend: atualizando serviço"
    ENV_ARGS=()
    while IFS= read -r line || [ -n "$line" ]; do
        [[ -z "$line" || "$line" == \#* ]] && continue
        ENV_ARGS+=(--env-add "$line")
    done < "$APP/backend.env"
    # Desmonta pastas de modelos de voz antigas (/models/...), que a API não usa mais
    MOUNT_ARGS=()
    for target in $(docker service inspect "$API_SERVICE" --format '{{range .Spec.TaskTemplate.ContainerSpec.Mounts}}{{.Target}} {{end}}'); do
        [[ "$target" == /models/* ]] && MOUNT_ARGS+=(--mount-rm "$target")
    done
    docker service update --quiet --detach=false --image "ebook-api:$TAG" "${ENV_ARGS[@]}" "${MOUNT_ARGS[@]}" "$API_SERVICE"
else
    echo "== Backend: criando serviço"
    docker service create --quiet --detach=false \
        --name "$API_SERVICE" \
        --network GTP \
        --env-file "$APP/backend.env" \
        --mount "type=bind,source=$APP/uploads,target=/app/uploads" \
        --label 'traefik.enable=true' \
        --label 'traefik.http.routers.ebook-api.rule=Host(`backend-api.iagtp.com.br`)' \
        --label 'traefik.http.routers.ebook-api.entrypoints=websecure' \
        --label 'traefik.http.routers.ebook-api.tls.certresolver=letsencryptresolver' \
        --label 'traefik.http.services.ebook-api.loadbalancer.server.port=5000' \
        "ebook-api:$TAG"
fi

echo "== Frontend: publicando arquivos"
rm -rf "$APP/frontend/dist.new"
mkdir -p "$APP/frontend/dist.new"
tar -xzf "$IN/frontend-dist.tgz" -C "$APP/frontend/dist.new"
cp "$IN/nginx-frontend.conf" "$APP/deploy/nginx-frontend.conf"
# Copia por cima da mesma pasta: o container enxerga a pasta montada, não uma pasta renomeada
find "$APP/frontend/dist" -mindepth 1 -delete
cp -a "$APP/frontend/dist.new/." "$APP/frontend/dist/"
rm -rf "$APP/frontend/dist.new"

if docker service inspect "$WEB_SERVICE" >/dev/null 2>&1; then
    docker service update --quiet --detach=false --force "$WEB_SERVICE"
else
    echo "== Frontend: criando serviço"
    docker service create --quiet --detach=false \
        --name "$WEB_SERVICE" \
        --network GTP \
        --mount "type=bind,source=$APP/frontend/dist,target=/usr/share/nginx/html,readonly" \
        --mount "type=bind,source=$APP/deploy/nginx-frontend.conf,target=/etc/nginx/conf.d/default.conf,readonly" \
        --label 'traefik.enable=true' \
        --label 'traefik.http.routers.ebook-frontend.rule=Host(`ebook.iagtp.com.br`)' \
        --label 'traefik.http.routers.ebook-frontend.entrypoints=websecure' \
        --label 'traefik.http.routers.ebook-frontend.tls.certresolver=letsencryptresolver' \
        --label 'traefik.http.services.ebook-frontend.loadbalancer.server.port=80' \
        nginx:alpine
fi

# Imagens antigas do backend (mantém as 2 mais recentes)
docker images ebook-api --format '{{.Tag}}' | sort -r | tail -n +3 | xargs -r -I{} docker rmi "ebook-api:{}" >/dev/null 2>&1 || true

rm -rf "$IN"
echo "== Deploy $TAG concluído"
