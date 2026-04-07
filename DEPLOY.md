# Frontend deploy

Push в `main` запускает workflow `.github/workflows/deploy.yml`.

## Required GitHub secrets

- `DEPLOY_HOST` (или `SSH_HOST`)
- `DEPLOY_PORT` (или `SSH_PORT`, по умолчанию `22`)
- `DEPLOY_USERNAME` (или `SSH_USERNAME`)
- `DEPLOY_SSH_PRIVATE_KEY` (или `SSH_PRIVATE_KEY`)
- `DEPLOY_PATH` (опционально, по умолчанию `/opt/fizon/frontend`)
- `APP_ENV_FILE` (обязательно, содержимое `.env.production`)

## APP_ENV_FILE example

```env
APP_BIND_PORT=18081
VITE_API_BASE=https://api.example.com
VITE_WS_EVENTS=wss://api.example.com
VITE_FRAME_API_BASE=https://tracking.example.com
VITE_WS_BASE=wss://tracking.example.com
```
