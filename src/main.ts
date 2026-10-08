import * as dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // ignore if restricted
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ENV } from './config/env';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // Handle both default and namespace export for cookie-parser
  const cookieMiddleware = (cookieParser as any).default || cookieParser;
  app.use(cookieMiddleware());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.vercel.app') ||
        (ENV.FRONTEND_URL && origin.startsWith(ENV.FRONTEND_URL.replace(/\/$/, '')))
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    })
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(ENV.PORT);
  console.log(`[NestJS Server] Running on http://localhost:${ENV.PORT}/api`);
}

// Only listen if not running in Vercel serverless environment
if (process.env.VERCEL !== '1' && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  bootstrap();
}

export default bootstrap;
