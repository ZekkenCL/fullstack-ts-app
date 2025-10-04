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

## Notas futuras
- Añadir refresh tokens
- Roles/permissions
- Rate limiting
- WebSocket events para nuevos mensajes


## Contributing

Feel free to fork the repository and submit pull requests. For any issues or feature requests, please open an issue in the repository.

## License

This project is licensed under the MIT License.