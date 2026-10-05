import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';

interface AuthContextValue {
  user: {
    uid: string;
    email: string;
    displayName: string;
    isDemo: boolean;
  } | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInAsDemoOwner: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // Default to Demo Owner active in memory so the portfolio reviewer can immediately test owner controls,
  // or sign out / sign in with real Google Firebase Auth at any time.
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>('DEMO_OWNER_TOKEN');
  const [isDemo, setIsDemo] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          setFirebaseUser(fbUser);
          setToken(idToken);
          setIsDemo(false);
        } catch (err) {
          console.error('Failed to get Firebase ID token:', err);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await cred.user.getIdToken();
      setFirebaseUser(cred.user);
      setToken(idToken);
      setIsDemo(false);
    } catch (err: unknown) {
      console.error('Google Sign-In error:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Google Sign-In failed. You can also use Demo Owner mode.'
      );
    } finally {
      setLoading(false);
    }
  };

  const signInAsDemoOwner = () => {
    setError(null);
    setFirebaseUser(null);
    setToken('DEMO_OWNER_TOKEN');
    setIsDemo(true);
  };

  const signOut = async () => {
    setError(null);
    try {
      if (firebaseUser) {
        await firebaseSignOut(auth);
      }
    } finally {
      setFirebaseUser(null);
      setToken(null);
      setIsDemo(false);
    }
  };

  const user = firebaseUser
    ? {
        uid: firebaseUser.uid,
        email: firebaseUser.email || 'owner@shop.ph',
        displayName: firebaseUser.displayName || 'Shop Owner',
        isDemo: false,
      }
    : isDemo && token === 'DEMO_OWNER_TOKEN'
      ? {
          uid: 'demo-owner-juan-barbershop',
          email: 'juan@barbershop.ph',
          displayName: 'Juan Dela Cruz',
          isDemo: true,
        }
      : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        signInWithGoogle,
        signInAsDemoOwner,
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
