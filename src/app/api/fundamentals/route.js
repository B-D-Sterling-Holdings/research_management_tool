import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers');
    if (!tickers) {
      return NextResponse.json({ error: 'tickers param required' }, { status: 400 });
    }

    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_fundamentals.py');
    const cmd = `python3 "${scriptPath}" ${tickerList.join(' ')}`;

    const { stdout } = await execAsync(cmd, { timeout: 60000 });
    const fundamentals = JSON.parse(stdout);

    return NextResponse.json({ fundamentals });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
