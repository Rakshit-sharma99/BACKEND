import { Server, Socket } from 'socket.io';

export const handleSocketConnections = (io: Server): void => {
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    // Add other socket event handlers here
  });
};
