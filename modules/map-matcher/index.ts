// Reexport the native module. On web, it will be resolved to MapMatcherModule.web.ts
// and on native platforms to MapMatcherModule.ts
export { default } from './src/MapMatcherModule';
export { default as MapMatcherView } from './src/MapMatcherView';
export * from  './src/MapMatcher.types';
