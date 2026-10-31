import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.disable('x-powered-by');
app.enableShutdownHooks();
await app.listen(process.env.PORT ?? 3001);
