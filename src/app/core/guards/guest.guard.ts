import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { onAuthStateChanged } from 'firebase/auth';
import { firebaseAuth } from '../firebase/firebase.config';
export const guestGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const user = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      unsubscribe();
      resolve(currentUser);
    });
  });
  return user ? router.createUrlTree(['/notes']) : true;
};
