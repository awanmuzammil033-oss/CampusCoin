import mongoose from 'mongoose';
import env from './env.js';

mongoose.set('strictQuery', true);

/**
 * One connection for the whole process. We wait for it in server.js
 * so the app never serves requests against a dead database.
 */
export async function connectDb() {
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

export { mongoose };
