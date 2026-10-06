import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'DealerSocket Campaign Operations Hub API',
      timestamp: new Date().toISOString(),
    };
  }
}
