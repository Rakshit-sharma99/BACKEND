import admin from 'firebase-admin';
import logger from '../utils/logger';

const config = {
  credential: admin.credential.cert({
    projectId: process.env.PROJECT_ID,
    privateKeyId: process.env.PRIVATE_KEY_ID,
    privateKey: process.env.PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.CLIENT_EMAIL,
    clientId: process.env.CLIENT_ID,
    authUri: process.env.AUTH_URI,
    tokenUri: process.env.TOKEN_URI,
    authProviderX509CertUrl: process.env.AUTH_PROVIDER,
    clientX509CertUrl: process.env.CLIENT,
    universeDomain: process.env.UNIVERSE_DOMAIN,
  }),
};


export const initializeFirebase = async () => {
  try {
    admin.initializeApp(config);
    console.log("Firebase initialized!!");
  } catch (error) {
    logger.error('Firebase initialization failed:', error);
    throw error;
  }
};
