import * as dns from 'dns';
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // ignore if restricted in serverless environment
}

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import express, { Express } from 'express';
import { AppModule } from './app.module';
import { ENV } from './config/env';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

let cachedApp: INestApplication | null = null;
const expressServer: Express = express();

export async function bootstrapServer(): Promise<Express> {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(expressServer), {
      logger: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn', 'log'],
    });

    app.setGlobalPrefix('api');

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

    await app.init();
    cachedApp = app;
  }

  return expressServer;
}
