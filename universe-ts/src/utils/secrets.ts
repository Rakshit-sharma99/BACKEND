import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import dotenv from 'dotenv';

dotenv.config(); // Load .env by default

export const initializeSecrets = async (): Promise<void> => {
  if (process.env.NODE_ENV !== 'production') return;

  const secretName = 'macbease-test-backend-env-sms';
  const client = new SecretsManagerClient({ region: 'us-east-1' });
  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName, VersionStage: 'AWSCURRENT' }),
    );

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      Object.entries(secrets).forEach(([key, value]) => {
        process.env[key] = value as string;
      });
      console.log('Secrets loaded successfully');
    }
  } catch (error) {
    console.error('Error fetching secrets:', error);
    throw error;
  }
};
