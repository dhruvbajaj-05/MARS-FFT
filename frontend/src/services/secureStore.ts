import * as SecureStore from 'expo-secure-store';

// Secure persistence for the JWT (Keychain on iOS, Keystore-backed on Android).
// Only the token is stored secretly; non-sensitive user profile is cached in the
// auth store and re-validated against /auth/me on launch.
const TOKEN_KEY = 'fft.auth.token';

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
