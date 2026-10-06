import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyAccessToken } from '../../utils/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    let token = '';

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (request.cookies && request.cookies.accessToken) {
      token = request.cookies.accessToken;
    } else if (request.query && request.query.token) {
      token = request.query.token;
    }

    if (!token) {
      throw new UnauthorizedException('Authentication token missing');
    }

    try {
      const payload = verifyAccessToken(token);
      request.user = payload;
      return true;
    } catch (err: any) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }
}
