import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface UserProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const [profileResult, phoneResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, city, avatar_url')
        .eq('id', userId)
        .single(),
      supabase.rpc('get_my_phone'),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (phoneResult.error) throw phoneResult.error;
    setProfile({ ...profileResult.data, phone: phoneResult.data });
  };

  const refreshProfile = async () => {
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }
  };

  useEffect(() => {
    let active = true;
    let authEventVersion = 0;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      authEventVersion += 1;
      setSession(newSession);
      if (newSession?.user) {
        void fetchProfile(newSession.user.id).catch((error: unknown) => {
          console.error('[Becho] Failed to load profile after auth change:', error);
        });
      } else {
        setProfile(null);
      }
    });

    const initialVersion = authEventVersion;
    void supabase.auth
      .getSession()
      .then(async ({ data: { session: currentSession }, error }) => {
        if (error) throw error;
        if (!active || authEventVersion !== initialVersion) return;
        setSession(currentSession);
        if (currentSession?.user) {
          try {
            await fetchProfile(currentSession.user.id);
          } catch (profileError) {
            console.error('[Becho] Failed to load current profile:', profileError);
          }
        } else {
          setProfile(null);
        }
      })
      .catch((error: unknown) => {
        console.error('[Becho] Failed to restore the current session:', error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export function isPlatformOwner(user: User | null): boolean {
  return user?.app_metadata?.role === 'platform_owner';
}