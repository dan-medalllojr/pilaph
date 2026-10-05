import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];

  // Support demo owner session token for portfolio testing alongside real Firebase ID tokens
  if (token === 'DEMO_OWNER_TOKEN') {
    req.user = {
      uid: 'demo-owner-juan-barbershop',
      email: 'juan@barbershop.ph',
      name: 'Juan Dela Cruz (Demo Owner)',
      aud: 'demo',
      auth_time: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
      firebase: { identities: {}, sign_in_provider: 'custom' },
      iat: Math.floor(Date.now() / 1000),
      iss: 'demo',
      sub: 'demo-owner-juan-barbershop',
    };
    return next();
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
