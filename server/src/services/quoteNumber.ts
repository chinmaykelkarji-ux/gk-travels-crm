import { prisma } from '../lib/prisma.js';

export async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.salesQuote.count({
    where: {
      createdAt: {
        gte: new Date(`${year}-01-01`),
        lte: new Date(`${year}-12-31`),
      },
    },
  });
  return `GK-Q-${year}-${String(count + 1).padStart(4, '0')}`;
}
