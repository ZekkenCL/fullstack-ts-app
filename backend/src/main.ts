import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { RequestLoggerInterceptor } from './common/logging/request-logger.interceptor';
import { RequestMetricsInterceptor } from './metrics/request-metrics.interceptor';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { logger } from './common/logging/logger';
import { SocketAdapter } from './realtime/socket.adapter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

  await app.listen(4000);
  logger.info('Server listening on port 4000');
}
bootstrap();