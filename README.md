# Ulysses Time Machine

A web application that analyzes git repository history of Ulysses writing files to prove gradual development and authentic authorship.

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Visit `http://localhost:3000`

### Build

```bash
npm run build
npm start
```

## Routes

- **`/`** - Main time machine interface
- **`/test`** - ULYZ file parser test tool

## Features

### 1. Git History Analysis
- Processes complete git repository
- Extracts all versions of .ulyz files
- Shows commit-by-commit evolution
- Proves gradual development

### 2. Shareable Sessions
- Process once, share link with teacher
- No re-upload needed
- Instant access via URL
- Persistent storage

### 3. Smart File Selection
- Choose which files to process
- Skip Archive/Private folders
- Dramatically faster processing

### 4. Comprehensive Logging
- Real-time progress updates
- Detailed operation logs
- Copy logs for debugging

### 5. Export Options
- Download JSON report
- Share URL link
- Copy logs to clipboard

## Usage

### For Students

1. **Upload Repository**
    - Click "Choose Folder"
    - Select your git repository root (containing .git)

2. **Select Files**
    - Review discovered .ulyz files
    - Deselect any you don't want to include
    - Click "Process Selected Files"

3. **Wait for Processing**
    - Monitor progress bar
    - Check logs for details
    - Takes 1-10 minutes depending on size

4. **Share with Teacher**
    - Click "Share" button
    - URL copied to clipboard
    - Send URL to teacher

5. **Download Report** (optional)
    - Click "Report" button
    - JSON file downloads
    - Contains all analysis data

### For Teachers

1. **Open Shared Link**
    - Click URL from student
    - No upload needed
    - Instant access

2. **Review History**
    - View individual files or combined timeline
    - Navigate between versions
    - Check commit dates and authors

3. **Verify Authenticity**
    - Look for gradual development
    - Check commit frequency
    - Review content evolution

## Testing ULYZ Parser

If files aren't showing up:

1. Go to `/test` route
2. Upload a single .ulyz file
3. Verify text extraction works
4. Check raw XML if needed

## Configuration

### Ignored Folders

By default, these folders are skipped:
- `Archive/`
- `Private/`
- `.automation/`

To modify, edit `lib/git-parser.ts`:

```typescript
function shouldIgnorePath(filepath: string): boolean {
  const ignoredDirs = ['Archive', 'Private', '.automation'];
  // Add or remove folders here
}
```

### Processing Limits

Current settings (for 2-core, 2GB RAM VPS):
- Commit batch size: 10
- File concurrency: 4

To adjust, edit `lib/git-parser.ts`:

```typescript
const BATCH_SIZE = 10; // Increase for more powerful servers
const FILE_CONCURRENCY = 4; // Increase for more CPU cores
```

## Troubleshooting

### Files Not Showing

**Check**:
1. Files are in git history: `git ls-tree -r HEAD | grep .ulyz`
2. Not in ignored folders: `git ls-tree -r HEAD | grep -E "(Archive|Private)"`
3. Test parser at `/test` route

### Slow Processing

**Solutions**:
1. Select fewer files
2. Choose files with fewer commits
3. Increase batch size (if you have resources)
4. Check logs for bottlenecks

### Session Won't Load

**Possible Causes**:
- Invalid session ID
- Storage quota exceeded
- Browser blocking storage

**Fix**:
- Re-process and create new session
- Check browser console
- Try different browser

## Performance

**Expected Processing Times**:

| Repository Size | Discovery | Full Processing | Selected (10 files) |
|----------------|-----------|-----------------|---------------------|
| Small (20 files, 100 commits) | 5s | 30-60s | 10-20s |
| Medium (50 files, 300 commits) | 10s | 2-4min | 30-90s |
| Large (100 files, 500 commits) | 15s | 5-10min | 2-4min |

**Session Loading**: Instant (< 1s)

## Security Notes

- Shared sessions are **public** (anyone with link can view)
- Don't share sensitive information
- Storage is persistent (doesn't expire)
- No authentication required

## Tech Stack

- **Framework**: Next.js 16
- **UI**: React 19, Tailwind CSS
- **Git Operations**: isomorphic-git
- **File Parsing**: JSZip
- **Storage**: Filesystem or Postgres
- **Icons**: Lucide React

## License

MIT

## Support

For issues or questions:
1. Check logs in the app
2. Test parser at `/test`
3. Review console errors
4. Check git repository structure