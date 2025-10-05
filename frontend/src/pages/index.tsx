import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuthStore } from '../store/authStore';

const Home: React.FC = () => {
    const { accessToken } = useAuthStore();
    const router = useRouter();
    useEffect(() => {
        if (accessToken) router.replace('/channels');
    }, [accessToken, router]);
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
            <h1 className="text-3xl font-semibold">Bienvenido</h1>
            <p className="mt-2 text-sm text-gray-600">Inicia sesión o regístrate para continuar.</p>
        </div>
    );
};

export default Home;