import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { log } from './common/logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  // The panel needs to read Idempotent-Replayed to show when a purchase was a retry.
  app.enableCors({ exposedHeaders: ['Idempotent-Replayed'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  log(null, `escuchando en el puerto ${port}`);
}

void bootstrap();
