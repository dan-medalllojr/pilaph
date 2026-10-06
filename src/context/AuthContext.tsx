import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';

const NOT_CONFIGURED_ERROR =
  'Sign-in is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the server.';

interface AuthContextValue {
  user: {
    uid: string;
    email: string;
    displayName: string;
  } | null;
  token: string | null;
  // True until the saved session (if any) has been restored on page load.
  initializing: boolean;
  loading: boolean;
  error: string | null;
  notice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState<boolean>(!!supabase);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    // Fires once with the restored session (INITIAL_SESSION), then on every
    // sign-in, sign-out and token refresh.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setInitializing(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    setError(null);
    setNotice(null);
    if (!supabase) {
      setError(NOT_CONFIGURED_ERROR);
      return;
    }
    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) setError(signInError.message);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setError(null);
    setNotice(null);
    if (!supabase) {
      setError(NOT_CONFIGURED_ERROR);
      return;
    }
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (signUpError) {
        setError(signUpError.message);
      } else if (!data.session) {
        // Email confirmation is on: no session until the link is clicked.
        setNotice(
          `We sent a confirmation link to ${email}. Open it, then sign in here.`
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setNotice(null);
    if (!supabase) {
      setError(NOT_CONFIGURED_ERROR);
      return;
    }
    setLoading(true);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    // On success the browser leaves for Google; the session is picked up by
    // onAuthStateChange when it returns to /dashboard.
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  };

  const signOut = async () => {
    setError(null);
    setNotice(null);
    if (supabase) {
      await supabase.auth.signOut();
    }
    setSession(null);
  };

  const user = useMemo(() => {
    if (!session) return null;
    const email = session.user.email || '';
    const metadata = session.user.user_metadata ?? {};
    return {
      uid: session.user.id,
      email,
      displayName:
        metadata.full_name || metadata.name || email.split('@')[0] || 'Owner',
    };
  }, [session]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token: session?.access_token ?? null,
        initializing,
        loading,
        error,
        notice,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
