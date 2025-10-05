import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

interface ReceivedMessage { id?: string; content?: string; message?: string; user?: any; createdAt?: string; raw?: any }

export function useChannel(channelId: number | null) {
    const { accessToken } = useAuthStore();
    const [messages, setMessages] = useState<ReceivedMessage[]>([]);
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        if (!channelId || !accessToken) return;
        const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
        const newSocket = io(url, { auth: { token: accessToken } });
        setSocket(newSocket);

        newSocket.emit('joinChannel', channelId);

        newSocket.on('message', (payload: any) => {
            setMessages(prev => [...prev, { raw: payload, content: payload.content || payload.message, ...payload }]);
        });

        return () => { newSocket.disconnect(); };
    }, [channelId, accessToken]);

    const sendMessage = useCallback((content: string) => {
        if (!socket || !channelId) return;
        socket.emit('sendMessage', { channelId, content });
    }, [socket, channelId]);

    return { messages, sendMessage, connected: !!socket };
}

export default useChannel;