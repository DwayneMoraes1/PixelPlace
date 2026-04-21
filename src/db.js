import mongoose from 'mongoose';

export async function connectDb(mongodbUri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongodbUri, {
    autoIndex: true
  });
}

export function getConnectionState() {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  return mongoose.connection.readyState;
}

