module.exports = {
  apps: [
    {
      name: 'api.macbease.com',
      script: './dist/src/server.js',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
