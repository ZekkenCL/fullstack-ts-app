import { AppProps } from 'next/app';
import '../styles/globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore, useAuthHydrated } from '../store/authStore';
import { api } from '../lib/apiClient';
import Notifications from '../components/Notifications';

const PROTECTED = new Set(['/channels']);

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, user, setUser, clear } = useAuthStore();
  const hydrated = useAuthHydrated();

  useEffect(() => {
    if (!hydrated) return;
    const path = router.pathname;
    const needsAuth = PROTECTED.has(path);
    if (needsAuth && !accessToken) {
      router.replace('/login');
      return;
    }
    if (accessToken && !user) {
      api.profile().then(data => {
        const username = data.username || data.user?.username || data.name || '';
        setUser({ username });
      }).catch(() => {
        clear();
        if (needsAuth) router.replace('/login');
      });
    }
  }, [hydrated, accessToken, user, router, setUser, clear]);

  return <>{children}</>;
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <AuthBootstrap>
      <Component {...pageProps} />
      <Notifications />
    </AuthBootstrap>
  );
}

export default MyApp;