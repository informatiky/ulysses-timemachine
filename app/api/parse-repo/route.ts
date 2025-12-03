import { NextRequest } from 'next/server';
import { parseGitRepo } from '@/lib/git-parser';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files: File[] = [];
    let selectedFiles: string[] | undefined;

    for (const [key, value] of formData.entries()) {
      if (key === 'selectedFiles' && typeof value === 'string') {
        selectedFiles = JSON.parse(value);
      } else if (value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No files uploaded' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Create a TransformStream for Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start processing in background
    (async () => {
      try {
        await parseGitRepo(files, (event) => {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          writer.write(encoder.encode(data));
        }, selectedFiles);
      } catch (error) {
        const errorData = `data: ${JSON.stringify({
          type: 'error',
          data: { message: String(error) },
        })}\n\n`;
        writer.write(encoder.encode(errorData));
      } finally {
        writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in parse-repo API:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to parse repository', details: String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}