import http from 'node:http';
import crypto from 'node:crypto';
import { cleanSingleLine } from './utils.js';

function secureEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function readBody(req, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createBridgeServer({ bind, port, secret, onEvent, logger = console }) {
  if (!secret || secret.length < 16) {
    throw new Error('BRIDGE_SECRET must be at least 16 characters.');
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'GET' && req.url === '/healthz') {
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, service: 'nexium-palbridge' }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/bridge/event') {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
      return;
    }

    const supplied = req.headers['x-nexium-bridge-key'];
    if (!secureEqual(supplied, secret)) {
      res.statusCode = 401;
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }

    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw);

      if (payload?.version !== 1 || payload?.event !== 'chat') {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'unsupported_event' }));
        return;
      }

      const event = {
        event: 'chat',
        server: cleanSingleLine(payload.server || 'Palworld Server', 100),
        sender: cleanSingleLine(payload.sender, 100),
        message: cleanSingleLine(payload.message, 1500),
        sequence: Number(payload.sequence) || 0,
      };

      if (!event.sender || !event.message) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'invalid_chat_event' }));
        return;
      }

      await onEvent(event);
      res.statusCode = 202;
      res.end(JSON.stringify({ ok: true }));
    } catch (error) {
      logger.warn?.(`[bridge] ${error.message}`);
      if (!res.headersSent) res.statusCode = 400;
      if (!res.writableEnded) {
        res.end(JSON.stringify({ ok: false, error: 'bad_request' }));
      }
    }
  });

  return {
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, bind, () => {
          server.off('error', reject);
          resolve();
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
