'use client';

import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, XCircle } from 'lucide-react';
import JSZip from 'jszip';

export default function UlyzReader() {
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseUlyzContent = async (data: ArrayBuffer): Promise<any> => {
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(data);

      const files = Object.keys(contents.files);
      const result: any = {
        files: files,
        contentXml: null,
        extractedText: null,
        rawXml: null,
        allFileContents: {}, // Add this to store all file contents
      };

      // Log and extract ALL files
      for (const filename of files) {
        const file = contents.files[filename];
        if (!file.dir) {
          try {
            const content = await file.async('string');
            result.allFileContents[filename] = content;
            console.log(`\n=== ${filename} ===`);
            console.log(content);
            console.log('=== END ===\n');
          } catch (err) {
            console.error(`Failed to read ${filename}:`, err);
          }
        }
      }

      // Try to find and extract Content.xml dynamically
      const contentXmlFile = files.find(f => f.endsWith('Content.xml'));

      if (contentXmlFile) {
        const file = contents.file(contentXmlFile);
        if (file) {
          const contentXml = await file.async('string');
          result.rawXml = contentXml;

          // Extract text from various XML elements (paragraphs, tags, etc.)
          const textPatterns = [
            /<p[^>]*>(.*?)<\/p>/gs,           // Paragraphs
            /<string[^>]*>(.*?)<\/string>/gs, // String elements
            /<element[^>]*>(.*?)<\/element>/gs, // Element tags
          ];

          const texts: string[] = [];

          textPatterns.forEach(pattern => {
            const matches = contentXml.match(pattern) || [];
            matches.forEach(match => {
              const content = match
                .replace(/<[^>]+>/g, '')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .trim();

              if (content) {
                texts.push(content);
              }
            });
          });

          result.extractedText = texts.join('\n\n').trim();
          result.textCount = texts.length;
        }
      }


      return result;
    } catch (error) {
      throw new Error(`Failed to parse .ulyz file: ${error}`);
    }
  };



  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileInfo(null);

    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseUlyzContent(buffer);

      setFileInfo({
        name: file.name,
        size: file.size,
        type: file.type,
        ...parsed,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-purple-700 p-6 text-white">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <FileText className="w-10 h-10" />
              ULYZ File Reader Test
            </h1>
            <p className="text-purple-100 text-sm mt-2">
              Upload a .ulyz file to test the parser
            </p>
          </div>

          <div className="p-6 space-y-6">
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
              <Upload className="w-16 h-16 mx-auto text-gray-400 mb-4" />
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".ulyz"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={loading}
                />
                <span className="inline-block bg-purple-600 text-white px-6 py-3 rounded-xl hover:bg-purple-700 transition-all">
                  {loading ? 'Processing...' : 'Choose .ulyz File'}
                </span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-900">Error</h3>
                  <p className="text-red-700 text-sm mt-1">{error}</p>
                </div>
              </div>
            )}

            {fileInfo && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-green-900">Successfully Parsed</h3>
                    <p className="text-green-700 text-sm mt-1">
                      {fileInfo.name} ({(fileInfo.size / 1024).toFixed(2)} KB)
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Archive Contents</h3>
                  <div className="space-y-1">
                    {fileInfo.files.map((file: string, idx: number) => (
                      <div key={idx} className="text-sm text-gray-700 font-mono">
                        📄 {file}
                      </div>
                    ))}
                  </div>
                </div>

                {fileInfo.extractedText ? (
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">
                      Extracted Text ({fileInfo.textCount} segments)
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono">
                        {fileInfo.extractedText}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <h3 className="font-semibold text-yellow-900">No Text Found</h3>
                    <p className="text-yellow-700 text-sm mt-1">
                      Could not extract text from Content.xml
                    </p>
                  </div>
                )}

                {fileInfo.rawXml && (
                  <details className="bg-gray-50 rounded-xl p-4">
                    <summary className="font-semibold text-gray-900 cursor-pointer">
                      Raw XML Content
                    </summary>
                    <div className="mt-3 bg-white border border-gray-200 rounded-lg p-3 max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-xs text-gray-700 font-mono">
                        {fileInfo.rawXml}
                      </pre>
                    </div>
                  </details>
                )}

                {fileInfo.allFileContents && (
                  <details className="bg-gray-50 rounded-xl p-4">
                    <summary className="font-semibold text-gray-900 cursor-pointer">
                      All File Contents
                    </summary>
                    {Object.entries(fileInfo.allFileContents).map(([filename, content]: [string, any]) => (
                      <div key={filename} className="mt-3 bg-white border border-gray-200 rounded-lg p-3">
                        <h4 className="font-semibold text-sm text-gray-700 mb-2">{filename}</h4>
                        <pre className="whitespace-pre-wrap text-xs text-gray-700 font-mono max-h-64 overflow-y-auto">
                          {content}
                        </pre>
                      </div>
                    ))}
                  </details>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}