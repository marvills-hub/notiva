import { Injectable, computed, signal } from '@angular/core';
import {
  AuthError,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { firebaseAuth } from '../firebase/firebase.config';
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly userState = signal<User | null>(null);
  private readonly initializedState = signal(false);
  readonly user = this.userState.asReadonly();
  readonly initialized = this.initializedState.asReadonly();
  readonly authenticated = computed(() => !!this.userState());
  readonly uid = computed(() => this.userState()?.uid ?? null);
  readonly displayName = computed(() => this.userState()?.displayName ?? '');
  readonly email = computed(() => this.userState()?.email ?? '');
  readonly photoURL = computed(() => this.userState()?.photoURL ?? null);
  constructor() {
    onAuthStateChanged(firebaseAuth, (user) => {
      this.userState.set(user);
      this.initializedState.set(true);
    });
  }
  async login(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
    this.userState.set(credential.user);
    return credential.user;
  }
  async register(name: string, email: string, password: string): Promise<User> {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
    const displayName = name.trim();
    if (displayName) {
      await updateProfile(credential.user, { displayName });
      await credential.user.reload();
    }
    this.userState.set(firebaseAuth.currentUser);
    return credential.user;
  }
  async loginWithGoogle(): Promise<User> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(firebaseAuth, provider);
    this.userState.set(credential.user);
    return credential.user;
  }
  async logout(): Promise<void> {
    await signOut(firebaseAuth);
    this.userState.set(null);
  }
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(firebaseAuth, email.trim());
  }
  async refreshUser(): Promise<User | null> {
    const user = firebaseAuth.currentUser;
    if (!user) {
      this.userState.set(null);
      return null;
    }
    await user.reload();
    const refreshedUser = firebaseAuth.currentUser;
    this.userState.set(null);
    this.userState.set(refreshedUser);
    return refreshedUser;
  }
  syncCurrentUser(): void {
    const user = firebaseAuth.currentUser;
    this.userState.set(null);
    this.userState.set(user);
  }
  getErrorMessage(error: unknown): string {
    const code = (error as AuthError)?.code ?? '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password.';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in was cancelled.';
      case 'auth/popup-blocked':
        return 'The sign-in popup was blocked by your browser.';
      case 'auth/network-request-failed':
        return 'Unable to connect. Check your internet connection.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'auth/requires-recent-login':
        return 'Please sign in again before making this change.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
