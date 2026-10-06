import * as jwt from 'jsonwebtoken';
import { ENV } from '../config/env';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  dealershipIds: string[];
}

const jwtLib = (jwt as any).default || jwt;

export const signAccessToken = (payload: TokenPayload): string => {
  return jwtLib.sign(payload, ENV.JWT_ACCESS_SECRET, {
    expiresIn: '15m',
  });
};

export const signRefreshToken = (payload: TokenPayload): string => {
  return jwtLib.sign(payload, ENV.JWT_REFRESH_SECRET, {
    expiresIn: '7d',
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwtLib.verify(token, ENV.JWT_ACCESS_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwtLib.verify(token, ENV.JWT_REFRESH_SECRET) as TokenPayload;
};
