// Types
export interface AuthRequest extends Request {
  user: {
    id: string;
    role: string;
  };
}

export interface BadgeBody {
  title: string;
  url: string;
  organisationId: string;
  organisationType: 'Club' | 'Community';
  organisationInfo: {
    name: string;
    [key: string]: any;
  };
}

export interface GetUnusedBadgesQuery {
  organisationType: 'Club' | 'Community';
  organisationId: string;
}
