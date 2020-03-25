import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppService } from './app.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const appService = app.get(AppService);
  while (true) {
    await appService
      .startHarvestQueue()
      .catch(() => appService.logger.error(`Error running harvestActivityHistory`));
  }
}
bootstrap();
