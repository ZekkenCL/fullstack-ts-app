import 'dotenv/config';
// Load .env.test automatically for e2e runs (JEST_E2E=true) before anything else
import { config as loadDotEnv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
if (process.env.JEST_E2E === 'true') {
  const testEnvPath = path.join(__dirname, '..', '.env.test');
  const examplePath = path.join(__dirname, '..', '.env.test.example');
  if (existsSync(testEnvPath)) {
    loadDotEnv({ path: testEnvPath });
  } else if (existsSync(examplePath)) {
    // fallback to example if a dedicated .env.test not present
    loadDotEnv({ path: examplePath });
  }
}
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { RequestLoggerInterceptor } from './common/logging/request-logger.interceptor';
import { RequestMetricsInterceptor } from './metrics/request-metrics.interceptor';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { logger } from './common/logging/logger';
import { SocketAdapter } from './realtime/socket.adapter';
import { validateEnv } from './config/env.validation';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

async function bootstrap() {
  // Validate environment early (fail-fast)
  validateEnv(process.env);
  const server = express();
  // Static assets for uploaded avatars
  const avatarDir = join(__dirname, '..', 'uploads', 'avatars');
  try { mkdirSync(avatarDir, { recursive: true }); } catch {}
  server.use('/uploads/avatars', express.static(avatarDir));
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  // Seguridad HTTP
  app.use(helmet({
    crossOriginEmbedderPolicy: false, // compatibilidad si usas iframes o CDNs
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  }));

  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Authorization,Content-Type,Accept',
    exposedHeaders: 'Content-Length,Content-Type',
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  const loggerInterceptor = app.get(RequestLoggerInterceptor);
  const metricsInterceptor = app.get(RequestMetricsInterceptor);
  app.useGlobalInterceptors(loggerInterceptor, metricsInterceptor);
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.useWebSocketAdapter(new SocketAdapter(app));
  const config = new DocumentBuilder()
    .setTitle('Chat API')
    .setDescription('Endpoints de autenticación, canales y mensajes')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, { swaggerOptions: { persistAuthorization: true } });

  const port = parseInt(process.env.PORT || '4000', 10);
  await app.listen(port);
  logger.info(`Server listening on port ${port}`);
}
bootstrap();