import { JwtPayload } from 'jsonwebtoken';

export interface AdminPayload extends JwtPayload {
  id: string;
}

export interface RegisterAdminBody {
  name: string;
  adminKey: string;
  email: string;
  password: string;
}

export interface LoginAdminBody {
  email: string;
  password: string;
}

export interface SetNewPasswordBody {
  otp: number;
  newPass: string;
  adminEmail: string;
}

export interface RegisterUserBody {
  name: string;
  email: string;
  password: string;
  course: string;
  reg: number;
  interests: string[];
  cards: string[];
  image: string;
  field: string;
  passoutYear: number;
  level: string;
  incompleteProfile: boolean;
  profession?: string;
}

export interface SetNewPasswordBody {
  otp: number;
  newPass: string;
  userEmail: string;
}

export interface PushTokenQuery {
  userId: string;
}

export interface UserNameAvailableQuery {
  userName: string;
  email: string;
  reg: string;
  profession: string;
}

export interface ReactivateAccountBody {
  email: string;
  password: string;
}
