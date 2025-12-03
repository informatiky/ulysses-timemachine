// app/api/storage/save/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { saveSession } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { sessionId, sessionData } = data;

    if (!sessionId || !sessionData) {
      return NextResponse.json(
        { error: 'Missing sessionId or sessionData' },
        { status: 400 }
      );
    }

    await saveSession(sessionId, sessionData);

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                    `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('host')}`;

    return NextResponse.json({
      success: true,
      sessionId,
      url: `${baseUrl}/?session=${sessionId}`
    });
  } catch (error) {
    console.error('Error saving session:', error);
    return NextResponse.json(
      { error: 'Failed to save session', details: String(error) },
      { status: 500 }
    );
  }
}

