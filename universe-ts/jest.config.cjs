module.exports = {
    transform: {
        '^.+\\.(t|j)sx?$': '@swc/jest',
    },
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    testEnvironment: "node",
    silent: true, // ✅ Hide unnecessary logs
    verbose: false, // ✅ Disable extra output
    errorOnDeprecated: true,  // ✅ Fail on deprecated features
}