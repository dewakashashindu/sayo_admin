'use client';
// src/components/UserName.tsx
// ─────────────────────────────────────────────────────────────────────────────
// The signed-in person's name, for the panel header.
//
// Every screen used to print a hard-coded “MR. SAYO”, which is neither the
// person who is signed in nor a name — it is a title. This reads the name the
// server sent with the access payload (tbl_userdetails.UserName, minus any
// MR./MRS./DR. prefix — see src/lib/displayName.ts) and prints that.
//
// While the answer is on its way it prints nothing rather than a wrong name,
// and if the account has neither a user name nor a login name it falls back to
// “Admin”, never to a specific person's name.
import { useMyAccess } from '@/lib/useMyAccess';

export default function UserName({ upper = false }: { upper?: boolean }) {
  const { displayName, loaded } = useMyAccess();
  const text = loaded && displayName ? displayName : loaded ? 'Admin' : '';
  return <>{upper ? text.toUpperCase() : text}</>;
}

/** The letter inside the round avatar — same source, first letter. */
export function UserInitial() {
  const { initial, loaded } = useMyAccess();
  return <>{loaded ? initial : ''}</>;
}
