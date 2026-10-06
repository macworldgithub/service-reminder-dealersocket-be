import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../models/User.model';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsNotEmpty({ message: 'Password is required' })
  password!: string;
}

export class RegisterDto {
  @IsNotEmpty({ message: 'Name is required' })
  name!: string;

  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  @IsOptional()
  role?: UserRole;

  @IsOptional()
  dealershipIds?: string[];
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;
}

export class ResetPasswordDto {
  @IsNotEmpty()
  token!: string;

  @MinLength(6)
  newPassword!: string;
}
