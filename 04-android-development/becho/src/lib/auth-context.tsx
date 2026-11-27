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
    let profileResult = await supabase
      .from('profiles')
      .select('id, full_name, city, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    // First sign-in / missing row: create a minimal profile so settings & listings work.
    if (!profileResult.error && !profileResult.data) {
      const { data: sessionData } = await supabase.auth.getUser();
      const metaName =
        (sessionData.user?.user_metadata?.full_name as string | undefined) ||
        (sessionData.user?.email?.split('@')[0] ?? 'Becho member');
      const upsert = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            full_name: metaName,
          },
          { onConflict: 'id' }
        )
        .select('id, full_name, city, avatar_url')
        .single();
      if (upsert.error) throw upsert.error;
      profileResult = upsert;
    }

    if (profileResult.error) throw profileResult.error;

    const phoneResult = await supabase.rpc('get_my_phone');
    // Phone helper is optional — do not block the whole profile if RPC is missing.
    if (phoneResult.error) {
      console.warn('[Becho] get_my_phone unavailable:', phoneResult.error.message);
    }

    setProfile({
      ...(profileResult.data as { id: string; full_name: string | null; city: string | null; avatar_url: string | null }),
      phone: phoneResult.error ? null : phoneResult.data,
    });
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