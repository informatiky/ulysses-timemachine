// app/api/storage/load/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { loadSession } from '@/lib/storage';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId' },
        { status: 400 }
      );
    }

    const sessionData = await loadSession(sessionId);

    return NextResponse.json({ success: true, sessionData });
  } catch (error) {
    console.error('Error loading session:', error);
    return NextResponse.json(
      { error: 'Session not found', details: String(error) },
      { status: 404 }
    );
  }
}