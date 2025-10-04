import { useState, useEffect } from 'react';
import { useUserStore } from '../store/useUserStore';
import { login, logout, getCurrentUser } from '../lib/auth';

const useAuth = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const setUser = useUserStore((state) => state.setUser);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const user = await getCurrentUser();
                setUser(user);
            } catch (err) {
                setError(err);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, [setUser]);

    const handleLogin = async (credentials) => {
        setLoading(true);
        try {
            const user = await login(credentials);
            setUser(user);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        try {
            await logout();
            setUser(null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        error,
        handleLogin,
        handleLogout,
    };
};

export default useAuth;