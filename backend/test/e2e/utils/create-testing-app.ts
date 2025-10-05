import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../src/app.module';
import { RequestLoggerInterceptor } from '../../../src/common/logging/request-logger.interceptor';
import { RequestMetricsInterceptor } from '../../../src/metrics/request-metrics.interceptor';
import { SocketAdapter } from '../../../src/realtime/socket.adapter';

// Factory centralizado para instanciar la app en pruebas e2e de forma consistente
export async function createTestingApp(): Promise<{ app: INestApplication; baseUrl: string; }> {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e_secret';
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/mydatabase?schema=public';
  }
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const loggerInterceptor = app.get(RequestLoggerInterceptor);
  const metricsInterceptor = app.get(RequestMetricsInterceptor);
  app.useGlobalInterceptors(loggerInterceptor, metricsInterceptor);
  app.useWebSocketAdapter(new SocketAdapter(app));
  await app.init();
  await app.listen(0); // puerto efímero
  const addr = (app.getHttpServer() as any).address();
  const baseUrl = `http://localhost:${addr.port}`;
  return { app, baseUrl };
}
