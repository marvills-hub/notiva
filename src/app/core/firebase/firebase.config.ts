import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
const firebaseConfig = {
  apiKey: 'AIzaSyBZ1ImTKGU480ROPJjbjqfcQ9-lvfiqM-k',
  authDomain: 'notiva-b07f7.firebaseapp.com',
  projectId: 'notiva-b07f7',
  storageBucket: 'notiva-b07f7.firebasestorage.app',
  messagingSenderId: '46106616647',
  appId: '1:46106616647:web:5f4f5f007c79b584b76262',
  measurementId: 'G-J7RR08JDFH',
};
export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);
