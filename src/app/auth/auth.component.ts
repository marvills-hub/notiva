import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
type AuthMode = 'login' | 'register';
@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly mode = signal<AuthMode>('login');
  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly loading = signal(false);
  readonly googleLoading = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly isRegister = computed(() => this.mode() === 'register');
  setMode(mode: AuthMode): void {
    if (this.loading() || this.googleLoading()) return;
    this.mode.set(mode);
    this.error.set('');
    this.message.set('');
    this.password.set('');
    this.confirmPassword.set('');
  }
  updateName(value: string): void {
    this.name.set(value);
  }
  updateEmail(value: string): void {
    this.email.set(value);
  }
  updatePassword(value: string): void {
    this.password.set(value);
  }
  updateConfirmPassword(value: string): void {
    this.confirmPassword.set(value);
  }
  togglePassword(): void {
    this.showPassword.update((visible) => !visible);
  }
  toggleConfirmPassword(): void {
    this.showConfirmPassword.update((visible) => !visible);
  }
  async submit(): Promise<void> {
    if (this.loading() || this.googleLoading()) return;
    this.error.set('');
    this.message.set('');
    const email = this.email().trim();
    const password = this.password();
    if (!email) {
      this.error.set('Enter your email address.');
      return;
    }
    if (!password) {
      this.error.set('Enter your password.');
      return;
    }
    if (this.isRegister()) {
      const name = this.name().trim();
      if (!name) {
        this.error.set('Enter your name.');
        return;
      }
      if (password.length < 6) {
        this.error.set('Password must be at least 6 characters.');
        return;
      }
      if (password !== this.confirmPassword()) {
        this.error.set('Passwords do not match.');
        return;
      }
    }
    this.loading.set(true);
    try {
      if (this.isRegister()) {
        await this.authService.register(this.name(), email, password);
      } else {
        await this.authService.login(email, password);
      }
      await this.router.navigateByUrl('/notes');
    } catch (error) {
      this.error.set(this.authService.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  async loginWithGoogle(): Promise<void> {
    if (this.loading() || this.googleLoading()) return;
    this.error.set('');
    this.message.set('');
    this.googleLoading.set(true);
    try {
      await this.authService.loginWithGoogle();
      await this.router.navigateByUrl('/notes');
    } catch (error) {
      this.error.set(this.authService.getErrorMessage(error));
    } finally {
      this.googleLoading.set(false);
    }
  }
  async forgotPassword(): Promise<void> {
    if (this.loading() || this.googleLoading()) return;
    const email = this.email().trim();
    this.error.set('');
    this.message.set('');
    if (!email) {
      this.error.set('Enter your email first so we know where to send the reset link.');
      return;
    }
    this.loading.set(true);
    try {
      await this.authService.resetPassword(email);
      this.message.set('Password reset email sent. Check your inbox.');
    } catch (error) {
      this.error.set(this.authService.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
