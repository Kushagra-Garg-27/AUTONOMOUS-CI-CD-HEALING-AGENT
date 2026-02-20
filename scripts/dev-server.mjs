import 'dotenv/config';
import net from 'node:net';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT ?? 8080);

const isPortOpen = (targetPort) =>
  new Promise((resolve) => {
    const socket = new net.Socket();

    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(targetPort, '127.0.0.1');
  });

const isAgentApiHealthy = async (targetPort) => {
  try {
    const response = await fetch(`http://localhost:${targetPort}/api/agent/health`, {
      signal: AbortSignal.timeout(1200),
    });
    if (!response.ok) {
      return false;
    }
    const payload = await response.json();
    return payload?.ok === true;
  } catch {
    return false;
  }
};

const startServer = () => {
  const command = process.platform === 'win32' ? 'npx' : 'npx';
  const child = spawn(command, ['tsx', 'backend/server.ts'], {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (error) => {
    console.error('Failed to start backend server:', error.message);
    process.exit(1);
  });
};

const main = async () => {
  const healthy = await isAgentApiHealthy(port);
  if (healthy) {
    console.log(`Agent API is already running on http://localhost:${port}`);
    process.exit(0);
  }

  const portOpen = await isPortOpen(port);
  if (portOpen) {
    console.error(
      `Port ${port} is already in use by another process. Free the port or set PORT to a different value.`,
    );
    process.exit(1);
  }

  startServer();
};

main();