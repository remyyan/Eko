/**
 * Firestore helpers for saving / loading user mixes.
 *
 * Collection layout:
 *   mixes/{docId}  — one document per saved mix
 *     userId        string   (Clerk user id)
 *     title         string
 *     createdAt     Timestamp
 *     isPublic      boolean
 *     tracks        SavedTrack[]
 *     transitionBeats number
 *     transitionType  string
 */

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/app/firebase/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedTrack {
  id: string;
  name: string;
  artist: string;
  albumArt: string;
  bpm: number;
  key: string;       // e.g. "8B"
  energy: number;    // 0-100
  /** Where the outgoing crossfade fires on this track (ms from start) */
  outgoingCueMs?: number;
  /** Where the incoming track should seek to when it's cued in (seconds) */
  incomingStartSec?: number;
}

export interface SavedMix {
  id: string;        // Firestore doc id
  userId: string;
  authorName: string;
  title: string;
  createdAt: Date;
  isPublic: boolean;
  tracks: SavedTrack[];
  transitionBeats: number;
  transitionType: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MIXES = "mixes";

/** Save a new mix; returns the new Firestore doc id. */
export async function saveMix(
  userId: string,
  payload: Omit<SavedMix, "id" | "userId" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, MIXES), {
    userId,
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Fetch all mixes for a given user, newest first. */
export async function getUserMixes(userId: string): Promise<SavedMix[]> {
  // No orderBy — avoids needing a composite index. Sort client-side instead.
  const q = query(
    collection(db, MIXES),
    where("userId", "==", userId)
  );
  const snap = await getDocs(q);
  const mixes = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId,
      authorName: data.authorName ?? "",
      title: data.title,
      createdAt: (data.createdAt as Timestamp)?.toDate?.() ?? new Date(),
      isPublic: data.isPublic ?? false,
      tracks: data.tracks ?? [],
      transitionBeats: data.transitionBeats ?? 16,
      transitionType: data.transitionType ?? "Crossfade",
    } as SavedMix;
  });
  // Sort newest first client-side
  return mixes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Fetch all public mixes, newest first (community feed). */
export async function getPublicMixes(): Promise<SavedMix[]> {
  // No orderBy — avoids composite index requirement. Sort client-side.
  const q = query(
    collection(db, MIXES),
    where("isPublic", "==", true)
  );
  const snap = await getDocs(q);
  const mixes = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId,
      authorName: data.authorName ?? "",
      title: data.title,
      createdAt: (data.createdAt as Timestamp)?.toDate?.() ?? new Date(),
      isPublic: true,
      tracks: data.tracks ?? [],
      transitionBeats: data.transitionBeats ?? 16,
      transitionType: data.transitionType ?? "Crossfade",
    } as SavedMix;
  });
  return mixes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Toggle a mix's public visibility. */
export async function setMixPublic(mixId: string, isPublic: boolean): Promise<void> {
  await updateDoc(doc(db, MIXES, mixId), { isPublic });
}

/** Delete a mix by doc id. */
export async function deleteMix(mixId: string): Promise<void> {
  await deleteDoc(doc(db, MIXES, mixId));
}

