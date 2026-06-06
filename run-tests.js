const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { StringDecoder } = require('string_decoder');

// 1. Resolve Jest entry point
const jestPath = require.resolve('jest/bin/jest');

// 2. Parse command arguments
const args = process.argv.slice(2);
const jestArgs = ['--runInBand', '--detectOpenHandles', '--forceExit', ...args];

// 3. Write header block to log files
const timestamp = new Date().toLocaleString();
const commandStr = `npm test ${args.join(' ')}`;
const header = `\n` +
`=========================================\n` +
`TEST RUN START: ${timestamp}\n` +
`Command: ${commandStr}\n` +
`=========================================\n\n`;

const logPaths = [
  path.resolve(__dirname, 'test_run.log'),
  path.resolve(__dirname, 'test_output.log')
];

for (const logPath of logPaths) {
  try {
    fs.appendFileSync(logPath, header);
  } catch (err) {
    console.error(`Failed to write header to ${logPath}:`, err.message);
  }
}

// Helper function to strip ANSI escape codes
function stripAnsi(str) {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

// 4. Line stream logger to process output line by line and avoid splitting ANSI escape codes or UTF-8 characters across chunks
class LineStreamLogger {
  constructor(paths) {
    this.paths = paths;
    this.buffer = '';
    this.decoder = new StringDecoder('utf8');
  }

  write(chunk) {
    this.buffer += this.decoder.write(chunk);
    let lineEndIndex;
    while ((lineEndIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, lineEndIndex + 1);
      this.buffer = this.buffer.slice(lineEndIndex + 1);
      this.logLine(line);
    }
  }

  end() {
    this.buffer += this.decoder.end();
    if (this.buffer) {
      this.logLine(this.buffer + '\n');
      this.buffer = '';
    }
  }

  logLine(line) {
    const cleanLine = stripAnsi(line);
    for (const logPath of this.paths) {
      try {
        fs.appendFileSync(logPath, cleanLine);
      } catch (err) {
        // Ignore write failures to avoid breaking tests
      }
    }
  }
}

const logger = new LineStreamLogger(logPaths);

// 5. Spawn Jest process
const jestProcess = spawn(process.execPath, [jestPath, ...jestArgs], {
  env: { ...process.env, FORCE_COLOR: 'true' },
  stdio: ['pipe', 'pipe', 'pipe']
});

// Pipe stdin to allow interactive inputs if any
if (process.stdin.isTTY) {
  process.stdin.pipe(jestProcess.stdin);
}

// Process stdout
jestProcess.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  logger.write(chunk);
});

// Process stderr
jestProcess.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  logger.write(chunk);
});

// Process exit
jestProcess.on('close', (code) => {
  logger.end();
  
  // Write footer to indicate run complete
  const footer = `\nTEST RUN FINISHED WITH EXIT CODE: ${code}\n` +
  `=========================================\n\n`;
  
  for (const logPath of logPaths) {
    try {
      fs.appendFileSync(logPath, footer);
    } catch (err) {
      // Ignore
    }
  }
  
  process.exit(code);
});
