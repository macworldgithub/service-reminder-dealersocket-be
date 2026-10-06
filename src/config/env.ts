import * as dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '7000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/service-reminder-dealersocket',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dealersocket_jwt_access_secret_super_secure_key_2026_xyz!',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dealersocket_jwt_refresh_secret_super_secure_key_2026_abc!',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:7001',
  UPLOAD_MAX_SIZE: parseInt(process.env.UPLOAD_MAX_SIZE || '26214400', 10), // 25MB
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
};
