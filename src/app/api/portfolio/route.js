import { NextResponse } from 'next/server';
import { loadPortfolio } from '@/lib/portfolio';

export async function GET() {
  const portfolio = loadPortfolio();
  return NextResponse.json(portfolio);
}
