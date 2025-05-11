// Type declarations for modules without built-in type definitions
declare module 'express';

// Declare global process variable
declare const process: {
  env: Record<string, string | undefined>;
};
