# Fullstack TypeScript Application

This project is a full-stack application built with TypeScript, utilizing modern frameworks and libraries for both the frontend and backend. Below are the details for setting up and running the application.

## Project Structure

```
fullstack-ts-app
├── README.md
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── docker-compose.yml
├── .env.example
├── frontend
│   └── (Next.js application)
├── backend
│   └── (NestJS application)
└── shared
    └── (Shared resources)
```

## Frontend

The frontend is built using **Next.js** and **Tailwind CSS**. It includes features for user authentication, chat functionality, and channel management.

### Setup

1. Navigate to the `frontend` directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

3. Run the development server:
   ```
   pnpm dev
   ```

## Backend

The backend is built using **NestJS** and **Prisma** for database interactions. It provides RESTful APIs for the frontend to consume.

### Setup

1. Navigate to the `backend` directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

3. Run the database migrations:
   ```
   pnpm migrate
   ```

4. Start the backend server:
   ```
   pnpm start
   ```

## Shared Resources

The `shared` directory contains common DTOs, types, and constants that are used across both the frontend and backend.

## Environment Variables

Copy the `.env.example` file to `.env` and fill in the required environment variables for both the frontend and backend.

## Docker

### Solo base de datos (desarrollo rápido)
Levanta únicamente Postgres para que el backend corra localmente en modo watch:
```
docker compose -f docker-compose.db.yml up -d
```

Luego en otra terminal:
```
cd backend
pnpm install
pnpm prisma:generate
pnpm prisma:migrate  # o pnpm prisma:migrate --name init si es la primera
pnpm run start:dev
```

### Stack completo (cuando lo necesites)
```
docker compose up --build
```

> Nota: El archivo principal `docker-compose.yml` incluye frontend y backend. Para desarrollo iterativo no es obligatorio.

## API Reference (Resumen)

Autenticación:
- POST /auth/register { username, email, password }
- POST /auth/login { username, password }
- GET /auth/profile (Bearer token)

Channels (todas requieren JWT):
- GET /channels
- GET /channels/:id
- POST /channels { name }
- PATCH /channels/:id { name? }
- DELETE /channels/:id

Messages (todas requieren JWT):
- POST /messages { content, channelId, senderId }
- GET /messages?channelId=#: optional &page=&limit=
- DELETE /messages/:id

Responses paginadas de mensajes:
```
{
   "page": 1,
   "limit": 50,
   "total": 123,
   "items": [ { ...message } ]
}
```

## Desarrollo Local Rápido

1. Levantar DB: `docker compose -f docker-compose.db.yml up -d`
2. Backend:
```
cd backend
pnpm install
pnpm prisma migrate dev --name init
pnpm dev
```
3. Frontend (en otra terminal):
```
cd frontend
pnpm install
pnpm dev
```

## Archivo de ejemplo para pruebas (REST Client)
Ver `backend/rest.http` para ejemplos listos.

## Características Implementadas Backend
- Autenticación JWT + refresh tokens rotatorios (hash, revocación, TTL configurable)
- Límite configurable de refresh tokens activos por usuario
- Limpieza programada (cron diario) de tokens expirados
- Canales y membresías (owner/member) + validación en HTTP y WebSocket
- Mensajería tiempo real (Socket.IO)
- Rate limiting WebSocket (Redis si disponible, fallback in-memory)
- Logging estructurado (pino) + interceptor + filtro global de excepciones
- Métricas Prometheus: HTTP + WebSocket (conexiones, eventos)
- Endpoint admin para cambiar nivel de log en caliente `/admin/log-level`

## Próximos Pasos Sugeridos
- Métricas adicionales de errores WS / latencia mensajes
- Tests adicionales (gateways, casos negativos auth, canales)
- Roles/permissions avanzados (moderadores, etc.)
- Persistencia de presencia (Redis pub/sub) para escalado horizontal
- Documentar esquema de eventos WebSocket en OpenAPI o AsyncAPI


## Contributing

Feel free to fork the repository and submit pull requests. For any issues or feature requests, please open an issue in the repository.

## License

This project is licensed under the MIT License.