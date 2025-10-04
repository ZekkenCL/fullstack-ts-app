import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const useChannel = (channelId: string) => {
    const [messages, setMessages] = useState<string[]>([]);
    const [socket, setSocket] = useState<Socket | null>(null);

    useEffect(() => {
        const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || '');
        setSocket(newSocket);

        newSocket.emit('joinChannel', channelId);

        newSocket.on('message', (message: string) => {
            setMessages((prevMessages) => [...prevMessages, message]);
        });

        return () => {
            newSocket.disconnect();
        };
    }, [channelId]);

    const sendMessage = (message: string) => {
        if (socket) {
            socket.emit('sendMessage', { channelId, message });
        }
    };

    return { messages, sendMessage };
};

export default useChannel;