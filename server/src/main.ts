import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync } from 'fs';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  // 健康检查
  app.getHttpAdapter().get('/api/health', (req: any, res: any) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // 托管前端静态资源（生产模式：web 构建产物拷贝到 public）
  const publicDir = join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir, { maxAge: '1h', index: false }));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      if (req.method !== 'GET') return next();
      res.sendFile(join(publicDir, 'index.html'));
    });
  }

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`[freshmeal] 服务已启动: http://0.0.0.0:${port}`);
}
bootstrap();
