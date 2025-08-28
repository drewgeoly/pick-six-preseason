// src/pages/Profile.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { auth, db, storage } from "../lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return avatarUrl || null;
  }, [file, avatarUrl]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.data();
        if (data) {
          setDisplayName(data.displayName ?? "");
          setAvatarUrl(data.avatarUrl ?? null);
        } else {
          // create a shell doc so future updates always succeed
          await setDoc(doc(db, "users", user.uid), {
            displayName: user.displayName ?? "",
            avatarUrl: user.photoURL ?? null,
            createdAt: serverTimestamp(),
          }, { merge: true });
          setDisplayName(user.displayName ?? "");
          setAvatarUrl(user.photoURL ?? null);
        }
      } catch (e:any) {
        setErr(e.message || "Failed to load profile");
      }
    })();
  }, [user?.uid]);

  async function save() {
    if (!user) return;
    setErr(""); setMsg(""); setSaving(true);
    try {
      let newUrl = avatarUrl;
      if (file) {
        const r = ref(storage, `avatars/${user.uid}/${file.name}`);
        await uploadBytes(r, file);
        newUrl = await getDownloadURL(r);
      }
      await updateProfile(user, { displayName, photoURL: newUrl ?? undefined });
      await setDoc(doc(db, "users", user.uid), {
        displayName,
        email: user.email ?? null,
        avatarUrl: newUrl ?? null,
        updatedAt: serverTimestamp(),
      }, { merge: true }); // <-- create-or-update

      setMsg("Profile updated");
      setFile(null);
    } catch (e:any) {
      setErr(e.message || "Failed to save");
    } finally { setSaving(false); }
  }

  if (!user) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="card">
          <h1 className="text-xl font-semibold mb-2">You’re signed out</h1>
          <p className="text-slate-600 mb-4">Sign in to manage your profile.</p>
          <button className="btn" onClick={() => nav("/login")}>Go to login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Profile</h1>
        <button className="btn" onClick={() => auth.signOut()}>Log out</button>
      </div>

      {err && <div className="rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">{err}</div>}
      {msg && <div className="rounded border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <section className="card md:col-span-1 flex flex-col items-center text-center gap-3">
          <div className="relative">
            {preview ? (
              <img src={preview} alt="avatar" className="w-28 h-28 rounded-full object-cover ring-2 ring-emerald-600" />
            ) : (
              <div className="w-28 h-28 rounded-full bg-slate-200 grid place-items-center text-2xl font-bold text-slate-600">
                {(displayName || user.email || "?").slice(0,1).toUpperCase()}
              </div>
            )}
          </div>
          <label className="text-sm">
            <span className="btn">Upload new avatar</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="text-xs text-slate-500">Recommended: square JPG/PNG</div>
        </section>

        <section className="card md:col-span-2 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Display Name</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={displayName}
              onChange={(e)=>setDisplayName(e.target.value)}
              placeholder="Display name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input className="w-full border rounded px-3 py-2 bg-slate-50" value={user.email ?? ""} readOnly />
          </div>
          <div className="flex justify-end">
            <button className="btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </section>
      </div>
    </div>
  );
}
