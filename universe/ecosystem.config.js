module.exports = {
    apps: [
        {
            name: "api.macbease.com",
            script: "./app.js",
            env: {
                NODE_ENV: "development",
            },
            env_production: {
                NODE_ENV: "production",
            },
        },
    ],
};
