import { NextResponse } from 'next/server';
import { database } from '@/shared/database';

export async function GET() {
  try {
    await database().query('SELECT 1');
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }
}
