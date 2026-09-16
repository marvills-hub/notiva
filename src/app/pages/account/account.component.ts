import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateEmail,
  updateProfile,
} from 'firebase/auth';
import { AuthService } from '../../core/services/auth.service';
import { firebaseAuth } from '../../core/firebase/firebase.config';
@Component({
  selector: 'app-account',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent {
  readonly authService = inject(AuthService);
  readonly displayName = signal('');
  readonly email = signal('');
  readonly currentPassword = signal('');
  readonly savingProfile = signal(false);
  readonly savingEmail = signal(false);
  readonly sendingReset = signal(false);
  readonly sendingVerification = signal(false);
  readonly profileMessage = signal('');
  readonly profileError = signal('');
  readonly emailMessage = signal('');
  readonly emailError = signal('');
  readonly passwordMessage = signal('');
  readonly passwordError = signal('');
  readonly verificationMessage = signal('');
  readonly verificationError = signal('');
  readonly providers = signal<string[]>([]);
  readonly emailVerified = signal(false);
  readonly creationDate = signal('');
  readonly lastSignInDate = signal('');
  readonly usesPasswordProvider = computed(() => this.providers().includes('password'));
  readonly usesGoogleProvider = computed(() => this.providers().includes('google.com'));
  readonly providerNames = computed(() =>
    this.providers().map((provider) => {
      if (provider === 'google.com') return 'Google';
      if (provider === 'password') return 'Email & Password';
      return provider;
    }),
  );
  readonly initials = computed(() => {
    const value = this.authService.displayName().trim() || this.authService.email().trim();
    if (!value) return 'N';
    const name = value.includes('@') ? value.split('@')[0] : value;
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  });
  constructor() {
    this.refreshAccountState();
  }
  async saveProfile(): Promise<void> {
    const user = firebaseAuth.currentUser;
    const name = this.displayName().trim();
    if (!user || !name || this.savingProfile()) return;
    this.savingProfile.set(true);
    this.profileMessage.set('');
    this.profileError.set('');
    try {
      await updateProfile(user, { displayName: name });
      await this.authService.refreshUser();
      this.refreshAccountState();
      this.profileMessage.set('Profile updated successfully.');
    } catch (error) {
      this.profileError.set(this.authService.getErrorMessage(error));
    } finally {
      this.savingProfile.set(false);
    }
  }
  async saveEmail(): Promise<void> {
    const user = firebaseAuth.currentUser;
    const newEmail = this.email().trim();
    if (!user || !newEmail || this.savingEmail()) return;
    if (newEmail === user.email) {
      this.emailMessage.set('Your email address is already up to date.');
      this.emailError.set('');
      return;
    }
    this.savingEmail.set(true);
    this.emailMessage.set('');
    this.emailError.set('');
    try {
      await this.reauthenticate();
      await updateEmail(user, newEmail);
      await this.authService.refreshUser();
      this.refreshAccountState();
      this.currentPassword.set('');
      this.emailMessage.set('Email address updated successfully.');
    } catch (error) {
      this.emailError.set(this.getAccountErrorMessage(error));
    } finally {
      this.savingEmail.set(false);
    }
  }
  async sendPasswordReset(): Promise<void> {
    const email = firebaseAuth.currentUser?.email;
    if (!email || !this.usesPasswordProvider() || this.sendingReset()) return;
    this.sendingReset.set(true);
    this.passwordMessage.set('');
    this.passwordError.set('');
    try {
      await sendPasswordResetEmail(firebaseAuth, email);
      this.passwordMessage.set(`Password reset instructions were sent to ${email}.`);
    } catch (error) {
      this.passwordError.set(this.authService.getErrorMessage(error));
    } finally {
      this.sendingReset.set(false);
    }
  }
  async sendVerification(): Promise<void> {
    const user = firebaseAuth.currentUser;
    if (!user || user.emailVerified || this.sendingVerification()) return;
    this.sendingVerification.set(true);
    this.verificationMessage.set('');
    this.verificationError.set('');
    try {
      await sendEmailVerification(user);
      this.verificationMessage.set(`Verification email sent to ${user.email}.`);
    } catch (error) {
      this.verificationError.set(this.authService.getErrorMessage(error));
    } finally {
      this.sendingVerification.set(false);
    }
  }
  private refreshAccountState(): void {
    const user = firebaseAuth.currentUser;
    if (!user) return;
    this.displayName.set(user.displayName ?? '');
    this.email.set(user.email ?? '');
    this.providers.set(user.providerData.map((provider) => provider.providerId));
    this.emailVerified.set(user.emailVerified);
    this.creationDate.set(this.formatDate(user.metadata.creationTime));
    this.lastSignInDate.set(this.formatDate(user.metadata.lastSignInTime));
  }
  private async reauthenticate(): Promise<void> {
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('NO_USER');
    if (this.usesPasswordProvider()) {
      const password = this.currentPassword();
      if (!password) throw new Error('CURRENT_PASSWORD_REQUIRED');
      const credential = EmailAuthProvider.credential(user.email || '', password);
      await reauthenticateWithCredential(user, credential);
      return;
    }
    if (this.usesGoogleProvider()) {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await reauthenticateWithPopup(user, provider);
      return;
    }
    throw new Error('REAUTHENTICATION_UNAVAILABLE');
  }
  private formatDate(value?: string): string {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unavailable';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
  private getAccountErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      if (error.message === 'CURRENT_PASSWORD_REQUIRED')
        return 'Enter your current password before changing your email.';
      if (error.message === 'REAUTHENTICATION_UNAVAILABLE')
        return 'This sign-in method cannot be reauthenticated here.';
    }
    const code = (error as { code?: string })?.code ?? '';
    if (code === 'auth/requires-recent-login')
      return 'Please sign in again before changing your email.';
    if (code === 'auth/email-already-in-use') return 'That email address is already in use.';
    if (code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential')
      return 'Your current password is incorrect.';
    return this.authService.getErrorMessage(error);
  }
}
