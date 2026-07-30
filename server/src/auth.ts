// Single shared login for the whole app (REQUIREMENTS.md 4 — no per-tenant accounts). Plain
// HTTP Basic auth against one username/password pair from env; see index.ts for where those
// come from.
import type { Request, Response, NextFunction } from 'express';

const crypto = require('crypto');

export interface Credentials {
  username: string;
  password: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Buffers of different lengths would throw in crypto.timingSafeEqual; comparing against a
  // same-length dummy first keeps the whole check constant-time either way.
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function basicAuth(credentials: Credentials) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Basic ')) {
      // Deliberately no `WWW-Authenticate: Basic` header: the frontend has its own login form
      // and sends its own Authorization header on every request. Sending that header makes
      // browsers pop their native HTTP-auth dialog on any 401 from a fetch()/XHR call — which
      // then hangs the request until someone deals with a dialog the app never expects.
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    const user = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
    const pass = separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1);

    if (!timingSafeEqual(user, credentials.username) || !timingSafeEqual(pass, credentials.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    next();
  };
}

module.exports = { basicAuth };
