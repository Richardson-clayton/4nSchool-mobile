const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monitorar pacotes e raiz
config.watchFolders = [
  workspaceRoot,
  path.resolve(workspaceRoot, 'packages'),
];

// Resolução de node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Mapeamento de alias para pacotes internos
config.resolver.extraNodeModules = {
  '@cantina/shared': path.resolve(workspaceRoot, 'packages/shared'),
  '@cantina/ui': path.resolve(workspaceRoot, 'packages/ui'),
};

module.exports = config;