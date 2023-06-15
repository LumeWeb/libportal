// Pubkey Login Request Interface
export interface PubkeyLoginRequest {
    pubkey: string;
    challenge: string;
    signature: string;
}

// Pubkey Challenge Request Interface
export interface PubkeyChallengeRequest {
    pubkey: string;
}

// Login Request Interface
export interface LoginRequest {
    email: string;
    password: string;
}

// Logout Request Interface
export interface LogoutRequest {
    token: string;
}
