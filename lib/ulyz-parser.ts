import JSZip from 'jszip';

export async function parseUlyzContent(data: Uint8Array): Promise<string> {
  try {
    const zip = new JSZip();
    const contents = await zip.loadAsync(data);

    // Find Content.xml dynamically instead of hardcoding the path
    const files = Object.keys(contents.files);
    const contentXmlFile = files.find(f => f.endsWith('Content.xml'));

    if (!contentXmlFile) {
      return 'Content.xml not found in archive';
    }

    // Extract Content.xml
    const contentXml = await contents.file(contentXmlFile)?.async('string');

    if (!contentXml) {
      return 'Could not read Content.xml';
    }

    // Parse XML in Node.js environment
    if (typeof DOMParser !== 'undefined') {
      // Browser environment
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(contentXml, 'text/xml');
      return extractTextFromXml(xmlDoc);
    } else {
      // Node.js environment - parse multiple tag types
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
            .replace(/<[^>]+>/g, '') // Remove all XML tags
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

      return texts.join('\n\n').trim() || contentXml.substring(0, 1000);
    }
  } catch (error) {
    return `Error parsing .ulyz file: ${error}`;
  }
}


function extractTextFromXml(xmlDoc: Document): string {
  const strings = xmlDoc.getElementsByTagName('string');
  const texts: string[] = [];

  for (let i = 0; i < strings.length; i++) {
    const text = strings[i].textContent?.trim();
    if (text) {
      texts.push(text);
    }
  }

  return texts.join('\n\n') || 'No readable text found';
}