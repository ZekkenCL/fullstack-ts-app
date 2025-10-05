# Backend Notes

## Channel Membership

Added `ChannelMember` join table (composite PK userId+channelId) with a `role` field. After pulling latest changes run:

```
pnpm --filter fullstack-ts-app-backend prisma:migrate
```

Seed assigns the seeded user as `owner` of the `general` channel. Creating a channel while authenticated auto-creates an `owner` membership for the creator. Join a channel: `POST /channels/:id/join` (Bearer token required). Leave a channel: `POST /channels/:id/leave`.

HTTP message creation and listing now require membership; WebSocket joinChannel and sendMessage events enforce membership.

---

## Testing & E2E

E2E tests usan una factoría unificada `createTestingApp()` que aplica:
- Pipes de validación (whitelist)
- Interceptores globales (logging + métricas)
- SocketAdapter (JWT en query / header)
- Puerto efímero (evita colisiones locales)

Helpers en `test/e2e/utils/test-helpers.ts` para registro/login/canales.

Ejecutar:
```
pnpm test:e2e
```

## Environment Variables Clave

| Variable | Descripción | Default |
|----------|-------------|---------|
| DATABASE_URL | Cadena conexión PostgreSQL | (ver .env) |
| JWT_SECRET | Firma de access tokens | dev_secret |
| REFRESH_TOKEN_TTL_DAYS | Días vigencia refresh | 7 |
| REFRESH_TOKEN_MAX_ACTIVE | Máx refresh activos/user | 5 |
| LOGIN_RATE_LIMIT | Intentos login por ventana | 5 |
| LOGIN_RATE_WINDOW_SEC | Ventana (s) rate limit login | 30 |
| REDIS_HOST / REDIS_PORT | Habilita rate limit WS Redis | — |

Para desactivar rate limit de login: `LOGIN_RATE_LIMIT=0`.

## Endpoints Salud / Métricas

| Endpoint | Propósito |
|----------|-----------|
| GET /health | Estado simple + ping DB |
| GET /health/ready | Readiness (DB + métricas) |
| GET /metrics | Exposición Prometheus |

## Métricas Principales

- http_requests_total{method,route,status}
- http_request_duration_seconds_bucket
- ws_events_total{event}
- ws_errors_total{event,type}
- ws_connections
- ws_message_latency_seconds_bucket
- auth_login_attempts_total{result=accepted|blocked}
- auth_login_rate_limited_total{reason}

## Rate Limit Login
Guard in-memory (sliding window). Counters incrementan accepted / blocked + motivo.

## Readiness
Usar `/health/ready` como probe de readiness en despliegues. Respuesta `degraded` indica no enrutar tráfico.

---

## Próximos Mejorables (Opcional)
- Helmet + CORS restrictivo
- Redis adapter para escalar WS
- Índices adicionales para mensajes paginados
- Cobertura Jest (thresholds añadidos en config)
