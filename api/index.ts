import { bootstrapServer } from '../src/server';

export default async function handler(req: any, res: any) {
  const app = await bootstrapServer();
  return app(req, res);
}
