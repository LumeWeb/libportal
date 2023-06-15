// Challenge Response Interface
export interface PubkeyChallengeResponse {
  challenge: string;
}

// Login Response Interface
export interface LoginResponse {
  token: string;
}

export interface AuthStatusResponse {
  status: boolean;
}
