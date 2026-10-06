import { Request, Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../lib/supabase-admin.ts';

export interface AuthUser {
  uid: string;
  email?: string;
  name?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
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

  try {
    const { data, error } = await getSupabaseAdmin().auth.getClaims(token);
    const claims = data?.claims;
    // Only signed-in users carry `sub` + the `authenticated` role; the public
    // anon key is also a valid project JWT and must not pass as an owner.
    if (error || !claims?.sub || claims.role !== 'authenticated') {
      throw error ?? new Error('Token is not a signed-in user session.');
    }

    const metadata = claims.user_metadata ?? {};
    req.user = {
      uid: claims.sub,
      email: claims.email,
      name: metadata.full_name || metadata.name,
    };
    next();
  } catch (error) {
    console.error('Error verifying Supabase access token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
