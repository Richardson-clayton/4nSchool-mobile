const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Monitorar exclusivamente a pasta do projeto mobile
config.watchFolders = [projectRoot];

// Garantir busca de módulos na pasta local
config.resolver.nodeModulesPaths = [
  `${projectRoot}/node_modules`,
];

module.exports = config;