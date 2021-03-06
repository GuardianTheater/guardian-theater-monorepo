import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService } from './app.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const appService = app.get(AppService);
  await appService.startHarvestQueue();
  throw `Error harvesting videos`;
}
bootstrap();
