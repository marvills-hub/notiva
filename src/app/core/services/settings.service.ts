import { Injectable, signal } from '@angular/core';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  DocumentData,
  DocumentReference,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  StorageReference,
  uploadString,
} from 'firebase/storage';
import { firebaseAuth, firebaseStorage, firestore } from '../firebase/firebase.config';
import { AppSettingsModel, DEFAULT_APP_SETTINGS } from '../models/app-settings.model';
interface NotivaBackupDocument {
  id: string;
  data: Record<string, unknown>;
}
interface NotivaBackupNote {
  boardId: string;
  id: string;
  data: Record<string, unknown>;
}
interface NotivaBackupStorageFile {
  path: string;
  dataUrl: string;
}
interface NotivaBackupData {
  boards: NotivaBackupDocument[];
  notes: NotivaBackupNote[];
  drawingBoards: NotivaBackupDocument[];
  settings: Record<string, unknown>;
  storageFiles: NotivaBackupStorageFile[];
}
interface NotivaBackupV2 {
  app: 'Notiva';
  version: 2;
  exportedAt: string;
  data: NotivaBackupData;
}
@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  private readonly storageKey = 'notiva-settings';
  private readonly settingsSignal = signal<AppSettingsModel>(this.loadLocalSettings());
  private readonly loadingSignal = signal(true);
  private readonly initializedSignal = signal(false);
  private readonly clearingDataSignal = signal(false);
  private readonly exportingSignal = signal(false);
  private readonly importingSignal = signal(false);
  readonly settings = this.settingsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly initialized = this.initializedSignal.asReadonly();
  readonly clearingData = this.clearingDataSignal.asReadonly();
  readonly exporting = this.exportingSignal.asReadonly();
  readonly importing = this.importingSignal.asReadonly();
  private currentUid: string | null = null;
  constructor() {
    this.applyInterfaceSettings(this.settingsSignal());
    onAuthStateChanged(firebaseAuth, (user) => {
      void this.handleAuthState(user);
    });
  }
  update<K extends keyof AppSettingsModel>(key: K, value: AppSettingsModel[K]): void {
    this.saveSettings({
      ...this.settingsSignal(),
      [key]: value,
    });
  }
  updateSettings(updates: Partial<AppSettingsModel>): void {
    this.saveSettings({
      ...this.settingsSignal(),
      ...updates,
    });
  }
  resetSettings(): void {
    this.saveSettings({ ...DEFAULT_APP_SETTINGS });
  }
  async reload(): Promise<void> {
    const uid = this.currentUid ?? firebaseAuth.currentUser?.uid ?? null;
    if (!uid) {
      const settings = this.loadLocalSettings();
      this.settingsSignal.set(settings);
      this.applyInterfaceSettings(settings);
      return;
    }
    this.currentUid = uid;
    this.loadingSignal.set(true);
    try {
      await this.loadUserSettings();
    } finally {
      this.loadingSignal.set(false);
    }
  }
  async exportBackup(): Promise<void> {
    if (this.exportingSignal()) return;
    const uid = this.currentUid ?? firebaseAuth.currentUser?.uid ?? null;
    if (!uid) throw new Error('You must be signed in to export your Notiva data.');
    this.exportingSignal.set(true);
    try {
      const backup: NotivaBackupV2 = {
        app: 'Notiva',
        version: 2,
        exportedAt: new Date().toISOString(),
        data: {
          boards: [],
          notes: [],
          drawingBoards: [],
          settings: {},
          storageFiles: [],
        },
      };
      const boardsSnapshot = await getDocs(collection(firestore, 'users', uid, 'boards'));
      for (const boardDocument of boardsSnapshot.docs) {
        backup.data.boards.push({
          id: boardDocument.id,
          data: this.serializeFirestoreValue(boardDocument.data()) as Record<string, unknown>,
        });
        const notesSnapshot = await getDocs(
          collection(firestore, 'users', uid, 'boards', boardDocument.id, 'notes'),
        );
        for (const noteDocument of notesSnapshot.docs) {
          backup.data.notes.push({
            boardId: boardDocument.id,
            id: noteDocument.id,
            data: this.serializeFirestoreValue(noteDocument.data()) as Record<string, unknown>,
          });
        }
      }
      const drawingBoardsSnapshot = await getDocs(
        collection(firestore, 'users', uid, 'drawingBoards'),
      );
      for (const drawingBoardDocument of drawingBoardsSnapshot.docs) {
        backup.data.drawingBoards.push({
          id: drawingBoardDocument.id,
          data: this.serializeFirestoreValue(drawingBoardDocument.data()) as Record<
            string,
            unknown
          >,
        });
      }
      const settingsSnapshot = await getDoc(
        doc(firestore, 'users', uid, 'settings', 'preferences'),
      );
      if (settingsSnapshot.exists()) {
        backup.data.settings = this.serializeFirestoreValue(settingsSnapshot.data()) as Record<
          string,
          unknown
        >;
      } else {
        backup.data.settings = this.serializeFirestoreValue(
          this.sanitizeSettings(this.settingsSignal()),
        ) as Record<string, unknown>;
      }
      backup.data.storageFiles = await this.exportStorageFiles(uid);
      this.downloadBackup(backup);
    } finally {
      this.exportingSignal.set(false);
    }
  }
  async importBackup(file: File): Promise<void> {
    if (this.importingSignal()) return;
    const uid = this.currentUid ?? firebaseAuth.currentUser?.uid ?? null;
    if (!uid) throw new Error('You must be signed in to import a Notiva backup.');
    this.importingSignal.set(true);
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;
      if (!this.isObject(parsed) || parsed['app'] !== 'Notiva') {
        throw new Error('Invalid Notiva backup file.');
      }
      if (parsed['version'] === 2) {
        await this.importVersion2(uid, parsed);
      } else {
        await this.importLegacyBackup(parsed);
      }
      await this.loadUserSettings();
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('Invalid Notiva backup file.');
      throw error;
    } finally {
      this.importingSignal.set(false);
    }
  }
  async clearAllNotivaData(): Promise<void> {
    if (this.clearingDataSignal()) return;
    const uid = this.currentUid ?? firebaseAuth.currentUser?.uid ?? null;
    if (!uid) throw new Error('You must be signed in to erase your Notiva data.');
    this.clearingDataSignal.set(true);
    try {
      await this.deleteUserStorage(uid);
      await this.deleteUserFirestoreData(uid);
      this.clearLocalNotivaData();
      const settings = { ...DEFAULT_APP_SETTINGS };
      this.settingsSignal.set(settings);
      localStorage.setItem(this.storageKey, JSON.stringify(settings));
      this.applyInterfaceSettings(settings);
    } finally {
      this.clearingDataSignal.set(false);
    }
  }
  private async importVersion2(uid: string, value: Record<string, unknown>): Promise<void> {
    const data = value['data'];
    if (!this.isObject(data)) throw new Error('Invalid Notiva backup data.');
    const boards = this.readDocuments(data['boards']);
    const notes = this.readNotes(data['notes']);
    const drawingBoards = this.readDocuments(data['drawingBoards']);
    const settings = this.isObject(data['settings']) ? data['settings'] : {};
    const storageFiles = this.readStorageFiles(data['storageFiles']);
    await this.restoreDocuments(
      boards.map((board) => ({
        ref: doc(firestore, 'users', uid, 'boards', board.id),
        data: this.deserializeFirestoreValue(board.data) as Record<string, unknown>,
      })),
    );
    await this.restoreDocuments(
      notes.map((note) => ({
        ref: doc(firestore, 'users', uid, 'boards', note.boardId, 'notes', note.id),
        data: this.deserializeFirestoreValue(note.data) as Record<string, unknown>,
      })),
    );
    await this.restoreDocuments(
      drawingBoards.map((drawingBoard) => ({
        ref: doc(firestore, 'users', uid, 'drawingBoards', drawingBoard.id),
        data: this.deserializeFirestoreValue(drawingBoard.data) as Record<string, unknown>,
      })),
    );
    if (Object.keys(settings).length) {
      const restoredSettings = this.deserializeFirestoreValue(settings) as Record<string, unknown>;
      await setDoc(doc(firestore, 'users', uid, 'settings', 'preferences'), restoredSettings);
    }
    for (const storageFile of storageFiles) {
      if (!storageFile.path.startsWith(`users/${uid}/`)) continue;
      await uploadString(ref(firebaseStorage, storageFile.path), storageFile.dataUrl, 'data_url');
    }
  }
  private async importLegacyBackup(value: Record<string, unknown>): Promise<void> {
    const data = value['data'];
    if (!this.isObject(data)) throw new Error('Invalid Notiva backup data.');
    for (const [key, item] of Object.entries(data)) {
      if (!key.startsWith('notiva-')) continue;
      localStorage.setItem(key, JSON.stringify(item));
    }
    const importedSettings = this.loadLocalSettings();
    this.settingsSignal.set(importedSettings);
    this.applyInterfaceSettings(importedSettings);
    await this.saveSettingsToFirestore(importedSettings);
  }
  private async exportStorageFiles(uid: string): Promise<NotivaBackupStorageFile[]> {
    const files: NotivaBackupStorageFile[] = [];
    const root = ref(firebaseStorage, `users/${uid}`);
    try {
      await this.collectStorageFiles(root, files);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      if (code !== 'storage/object-not-found') throw error;
    }
    return files;
  }
  private async collectStorageFiles(
    folder: StorageReference,
    files: NotivaBackupStorageFile[],
  ): Promise<void> {
    const result = await listAll(folder);
    for (const item of result.items) {
      files.push({
        path: item.fullPath,
        dataUrl: await this.storageReferenceToDataUrl(item),
      });
    }
    for (const prefix of result.prefixes) {
      await this.collectStorageFiles(prefix, files);
    }
  }
  private async storageReferenceToDataUrl(storageRef: StorageReference): Promise<string> {
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to export "${storageRef.fullPath}".`);
    }
    const blob = await response.blob();
    return this.blobToDataUrl(blob);
  }
  private blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Unable to read Firebase Storage file.'));
      };
      reader.onerror = () =>
        reject(reader.error ?? new Error('Unable to read Firebase Storage file.'));
      reader.readAsDataURL(blob);
    });
  }
  private downloadBackup(backup: NotivaBackupV2): void {
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `notiva-backup-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  private readDocuments(value: unknown): NotivaBackupDocument[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => this.isObject(item))
      .map((item) => ({
        id: this.safeDocumentId(item['id']),
        data: this.isObject(item['data']) ? item['data'] : {},
      }))
      .filter((item) => Boolean(item.id));
  }
  private readNotes(value: unknown): NotivaBackupNote[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => this.isObject(item))
      .map((item) => ({
        boardId: this.safeDocumentId(item['boardId']),
        id: this.safeDocumentId(item['id']),
        data: this.isObject(item['data']) ? item['data'] : {},
      }))
      .filter((item) => Boolean(item.boardId && item.id));
  }
  private readStorageFiles(value: unknown): NotivaBackupStorageFile[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Record<string, unknown> => this.isObject(item))
      .map((item) => ({
        path: typeof item['path'] === 'string' ? item['path'] : '',
        dataUrl: typeof item['dataUrl'] === 'string' ? item['dataUrl'] : '',
      }))
      .filter((item) => Boolean(item.path && item.dataUrl.startsWith('data:')));
  }
  private safeDocumentId(value: unknown): string {
    if (typeof value !== 'string') return '';
    const id = value.trim();
    if (!id || id.includes('/')) return '';
    return id;
  }
  private async restoreDocuments(
    documents: Array<{
      ref: DocumentReference<DocumentData>;
      data: Record<string, unknown>;
    }>,
  ): Promise<void> {
    for (let index = 0; index < documents.length; index += 400) {
      const batch = writeBatch(firestore);
      documents.slice(index, index + 400).forEach((item) => {
        batch.set(item.ref, item.data);
      });
      await batch.commit();
    }
  }
  private serializeFirestoreValue(value: unknown): unknown {
    if (value instanceof Timestamp) {
      return {
        __notivaType: 'timestamp',
        value: value.toDate().toISOString(),
      };
    }
    if (value instanceof Date) {
      return {
        __notivaType: 'timestamp',
        value: value.toISOString(),
      };
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.serializeFirestoreValue(item));
    }
    if (this.isObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.serializeFirestoreValue(item)]),
      );
    }
    return value;
  }
  private deserializeFirestoreValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.deserializeFirestoreValue(item));
    }
    if (this.isObject(value)) {
      if (value['__notivaType'] === 'timestamp' && typeof value['value'] === 'string') {
        const date = new Date(value['value']);
        if (!Number.isNaN(date.getTime())) return Timestamp.fromDate(date);
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, this.deserializeFirestoreValue(item)]),
      );
    }
    return value;
  }
  private async deleteUserFirestoreData(uid: string): Promise<void> {
    await this.deleteBoardData(uid);
    await this.deleteCollectionDocuments(collection(firestore, 'users', uid, 'drawingBoards'));
    await this.deleteCollectionDocuments(collection(firestore, 'users', uid, 'settings'));
    const userRef = doc(firestore, 'users', uid);
    const userSnapshot = await getDoc(userRef);
    if (userSnapshot.exists()) await deleteDoc(userRef);
  }
  private async deleteBoardData(uid: string): Promise<void> {
    const boardsSnapshot = await getDocs(collection(firestore, 'users', uid, 'boards'));
    for (const boardDocument of boardsSnapshot.docs) {
      await this.deleteCollectionDocuments(
        collection(firestore, 'users', uid, 'boards', boardDocument.id, 'notes'),
      );
    }
    await this.deleteDocumentsInBatches(
      boardsSnapshot.docs.map((boardDocument) => boardDocument.ref),
    );
  }
  private async deleteCollectionDocuments(
    collectionRef: ReturnType<typeof collection>,
  ): Promise<void> {
    const snapshot = await getDocs(collectionRef);
    await this.deleteDocumentsInBatches(
      snapshot.docs.map((documentSnapshot) => documentSnapshot.ref),
    );
  }
  private async deleteDocumentsInBatches(
    documentRefs: DocumentReference<DocumentData>[],
  ): Promise<void> {
    for (let index = 0; index < documentRefs.length; index += 400) {
      const batch = writeBatch(firestore);
      documentRefs.slice(index, index + 400).forEach((documentRef) => {
        batch.delete(documentRef);
      });
      await batch.commit();
    }
  }
  private async deleteUserStorage(uid: string): Promise<void> {
    const folders = ['avatars', 'boards', 'notes', 'drawings', 'attachments', 'exports'];
    for (const folder of folders) {
      try {
        await this.deleteStorageFolder(ref(firebaseStorage, `users/${uid}/${folder}`));
      } catch (error) {
        const code = (error as { code?: string })?.code ?? '';
        if (code !== 'storage/object-not-found') throw error;
      }
    }
  }
  private async deleteStorageFolder(folderRef: StorageReference): Promise<void> {
    const result = await listAll(folderRef);
    await Promise.all(result.items.map((item) => deleteObject(item)));
    for (const prefix of result.prefixes) {
      await this.deleteStorageFolder(prefix);
    }
  }
  private clearLocalNotivaData(): void {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith('notiva-')) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  }
  private async handleAuthState(user: User | null): Promise<void> {
    this.loadingSignal.set(true);
    this.initializedSignal.set(false);
    if (!user) {
      this.currentUid = null;
      const settings = this.loadLocalSettings();
      this.settingsSignal.set(settings);
      this.applyInterfaceSettings(settings);
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
      return;
    }
    this.currentUid = user.uid;
    try {
      await this.loadUserSettings();
    } catch (error) {
      console.error('Failed to load settings from Firestore.', error);
      const settings = this.loadLocalSettings();
      this.settingsSignal.set(settings);
      this.applyInterfaceSettings(settings);
    } finally {
      this.loadingSignal.set(false);
      this.initializedSignal.set(true);
    }
  }
  private async loadUserSettings(): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    const settingsRef = doc(firestore, 'users', uid, 'settings', 'preferences');
    const snapshot = await getDoc(settingsRef);
    if (snapshot.exists()) {
      const settings = this.normalizeSettings(snapshot.data());
      this.settingsSignal.set(settings);
      localStorage.setItem(this.storageKey, JSON.stringify(settings));
      this.applyInterfaceSettings(settings);
      return;
    }
    const localSettings = this.loadLocalSettings();
    this.settingsSignal.set(localSettings);
    this.applyInterfaceSettings(localSettings);
    await this.saveSettingsToFirestore(localSettings);
  }
  private saveSettings(settings: AppSettingsModel): void {
    this.settingsSignal.set(settings);
    localStorage.setItem(this.storageKey, JSON.stringify(settings));
    this.applyInterfaceSettings(settings);
    void this.saveSettingsToFirestore(settings);
  }
  private async saveSettingsToFirestore(settings: AppSettingsModel): Promise<void> {
    const uid = this.currentUid;
    if (!uid) return;
    try {
      await setDoc(
        doc(firestore, 'users', uid, 'settings', 'preferences'),
        this.sanitizeSettings(settings),
      );
    } catch (error) {
      console.error('Failed to save settings to Firestore.', error);
    }
  }
  private loadLocalSettings(): AppSettingsModel {
    const stored = localStorage.getItem(this.storageKey);
    if (!stored) return { ...DEFAULT_APP_SETTINGS };
    try {
      return this.normalizeSettings(JSON.parse(stored) as Partial<AppSettingsModel>);
    } catch {
      return { ...DEFAULT_APP_SETTINGS };
    }
  }
  private normalizeSettings(
    value: Partial<AppSettingsModel> | Record<string, unknown>,
  ): AppSettingsModel {
    return {
      ...DEFAULT_APP_SETTINGS,
      ...value,
    } as AppSettingsModel;
  }
  private sanitizeSettings(settings: AppSettingsModel): Record<string, unknown> {
    return Object.fromEntries(Object.entries(settings).filter(([, value]) => value !== undefined));
  }
  private applyInterfaceSettings(settings: AppSettingsModel): void {
    const root = document.documentElement;
    root.dataset['notivaDensity'] = settings.interfaceDensity;
    root.classList.toggle('notiva-reduced-motion', settings.reducedMotion);
  }
  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
