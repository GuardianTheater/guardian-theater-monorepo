import { Test, TestingModule } from '@nestjs/testing';
import { XboxService } from './xbox.service';

describe('XboxService', () => {
  let service: XboxService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [XboxService],
    }).compile();

    service = module.get<XboxService>(XboxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
