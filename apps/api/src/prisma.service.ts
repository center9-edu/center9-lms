import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, PrismaPg } from '@center9/database';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }
    super({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
