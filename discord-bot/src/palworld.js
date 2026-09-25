import { cleanSingleLine } from './utils.js';

export class PalworldApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', body = '' } = {}) {
    super(message);
    this.name = 'PalworldApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export class PalworldClient {
  constructor({ baseUrl, username = 'admin', password, timeoutMs = 5000 }) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.username = username;
    this.password = password;
    this.timeoutMs = Number(timeoutMs) || 5000;

    if (!this.baseUrl) throw new Error('PALWORLD_API_URL is required.');
    if (!this.password) throw new Error('PALWORLD_ADMIN_PASSWORD is required.');
  }

  authHeader() {
    return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
  }

  async request(method, path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Accept: 'application/json, text/plain;q=0.9',
          Authorization: this.authHeader(),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        const code = response.status === 401 ? 'AUTH' : 'HTTP';
        throw new PalworldApiError(
          `Palworld API returned HTTP ${response.status}.`,
          { status: response.status, code, body: text.slice(0, 1000) },
        );
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json') && text) {
        try {
          return JSON.parse(text);
        } catch {
          throw new PalworldApiError('Palworld API returned invalid JSON.', {
            status: response.status,
            code: 'PARSE',
            body: text.slice(0, 1000),
          });
        }
      }
      return text;
    } catch (error) {
      if (error instanceof PalworldApiError) throw error;
      if (error?.name === 'AbortError') {
        throw new PalworldApiError('Palworld API request timed out.', { code: 'TIMEOUT' });
      }
      throw new PalworldApiError(`Could not reach Palworld API: ${error.message}`, {
        code: 'NETWORK',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  getInfo() {
    return this.request('GET', '/info');
  }

  async getPlayers() {
    const result = await this.request('GET', '/players');
    return Array.isArray(result?.players) ? result.players : [];
  }

  getMetrics() {
    return this.request('GET', '/metrics');
  }

  announce(message) {
    return this.request('POST', '/announce', {
      message: cleanSingleLine(message, 500),
    });
  }

  kick(userId, message = '') {
    return this.request('POST', '/kick', {
      userid: String(userId),
      ...(message ? { message: cleanSingleLine(message, 300) } : {}),
    });
  }

  ban(userId, message = '') {
    return this.request('POST', '/ban', {
      userid: String(userId),
      ...(message ? { message: cleanSingleLine(message, 300) } : {}),
    });
  }

  unban(userId) {
    return this.request('POST', '/unban', { userid: String(userId) });
  }

  save() {
    return this.request('POST', '/save');
  }

  shutdown(waittime, message = '') {
    return this.request('POST', '/shutdown', {
      waittime: Number(waittime),
      ...(message ? { message: cleanSingleLine(message, 300) } : {}),
    });
  }

  async resolveOnlinePlayer(target) {
    const needle = String(target || '').trim().toLowerCase();
    const players = await this.getPlayers();

    const byId = players.find((p) => String(p.userId || '').toLowerCase() === needle);
    if (byId) return byId;

    const exactNameMatches = players.filter(
      (p) => String(p.name || '').toLowerCase() === needle,
    );

    if (exactNameMatches.length === 1) return exactNameMatches[0];
    if (exactNameMatches.length > 1) {
      throw new PalworldApiError(
        'More than one online player has that name. Use the userId instead.',
        { code: 'AMBIGUOUS_PLAYER' },
      );
    }

    throw new PalworldApiError(
      'No online player matched that name or userId.',
      { code: 'PLAYER_NOT_FOUND' },
    );
  }
}
