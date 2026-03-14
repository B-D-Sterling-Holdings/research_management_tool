import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(request) {
  try {
    const body = await request.json();
    const { ticker } = body;

    if (!ticker) {
      return NextResponse.json({ error: 'ticker is required' }, { status: 400 });
    }

    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ALPHA_VANTAGE_API_KEY not set in .env.local' }, { status: 500 });
    }

    const upper = ticker.toUpperCase();
    const dataDir = path.join(process.cwd(), 'data');
    const scriptPath = path.join(process.cwd(), 'scripts', 'generate_data.py');

    // Ensure data dir exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Run the Python data generator script
    const cmd = `python3 "${scriptPath}" --ticker ${upper} --data-dir "${dataDir}" --api-key "${apiKey}"`;

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 120000, // 2 min timeout (API rate limiting)
      env: { ...process.env, ALPHA_VANTAGE_API_KEY: apiKey },
    });

    return NextResponse.json({
      success: true,
      ticker: upper,
      output: stdout,
      warnings: stderr || null,
    });
  } catch (e) {
    return NextResponse.json({
      error: e.message,
      output: e.stdout || null,
      stderr: e.stderr || null,
    }, { status: 500 });
  }
}
