import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const body = await request.json();
    const { holdings } = body;
    if (!holdings || !holdings.length) {
      return NextResponse.json({ error: 'holdings required' }, { status: 400 });
    }

    const scriptPath = path.join(process.cwd(), 'scripts', 'fetch_risk.py');
    const holdingsJson = JSON.stringify(holdings).replace(/'/g, "\\'");
    const cmd = `python3 "${scriptPath}" '${holdingsJson}'`;

    const { stdout } = await execAsync(cmd, { timeout: 120000 });
    const result = JSON.parse(stdout);

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
