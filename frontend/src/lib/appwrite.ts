import { Client, Databases, Realtime, Permission, Role } from 'appwrite';

const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://appwrite.run.place/v1')
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID || '');

const databases = new Databases(client);
const realtime = new Realtime(client);

export { client, databases, realtime, Permission, Role };