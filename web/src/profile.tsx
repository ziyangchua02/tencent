import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../../shared/flow.ts';
import { useApp } from './state.tsx';
import { Avatar, Icon } from './ui.tsx';

/** Crop a photo to a centred square and shrink it to a small JPEG, so it is cheap to store and send. */
async function squareJpeg(file: File, size = 160): Promise<string> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const WHEN = {
  engineer: 'when the manager approves or returns one of my pills',
  manager: 'when an engineer issues a pill for my approval',
};

export function ProfilePage() {
  const { user, post } = useApp();
  const [saved, setSaved] = useState<Profile | null>(null);
  const [form, setForm] = useState<Profile | null>(null);
  const [emailReady, setEmailReady] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [note, setNote] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    void fetch('/api/profile', { headers: { 'x-demo-user': userId } })
      .then((r) => r.json())
      .then((d: { profile: Profile; emailReady: boolean }) => { setSaved(d.profile); setForm(d.profile); setEmailReady(d.emailReady); })
      .catch(() => setNote("Couldn't load your profile. Reload the page to try again."));
  }, [userId]);

  if (!user) return null;
  if (!form || !saved) return <div className="page"><p className="lead">{note || 'Loading your profile…'}</p></div>;

  const dirty = form.email.trim() !== saved.email || form.notify !== saved.notify || form.photo !== saved.photo;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setForm({ ...form, photo: await squareJpeg(f) }); setNote(''); } catch { setNote("That file couldn't be read as an image."); }
  };
  const save = async () => {
    setBusy('save');
    const r = await post('/api/profile', { email: form.email.trim(), notify: form.notify, photo: form.photo ?? null });
    setBusy(null);
    if (r.ok) { const p = r.data!.profile as Profile; setSaved(p); setForm(p); setNote('Saved.'); }
  };
  const test = async () => {
    setBusy('test');
    const r = await post('/api/profile/test');
    setBusy(null);
    if (r.ok) setNote(`Test email sent to ${saved.email}. Check your inbox, and your spam folder the first time.`);
  };

  return (
    <div className="page profile">
      <div className="page-head">
        <div>
          <h1>Profile</h1>
          <p className="lead">How you appear in the app, and where it emails you.</p>
        </div>
      </div>

      <section className="profile-card" aria-label="Your profile">
        <div className="profile-who">
          <Avatar user={{ name: user.name, photo: form.photo }} size="xl" />
          <div>
            <h2>{user.name}</h2>
            <p className="muted">{user.title} · {user.scope}</p>
            <div className="profile-photo-actions">
              <button type="button" className="btn" onClick={() => file.current?.click()}>{form.photo ? 'Change photo' : 'Upload a photo'}</button>
              {form.photo && <button type="button" className="link-btn" onClick={() => setForm({ ...form, photo: undefined })}>Remove photo</button>}
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden
                onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
            <p className="field-help">Shown in the top bar and on the sign-in page, cropped to a square.</p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="profile-email">Email</label>
          <p className="field-help" id="profile-email-help">Where the app sends your notifications. Leave it empty for no emails.</p>
          <input id="profile-email" type="email" autoComplete="email" spellCheck={false} aria-describedby="profile-email-help"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <label className="profile-check">
          <input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} />
          <span>Email me {WHEN[user.role]}</span>
        </label>

        {!emailReady && (
          <div className="callout callout--warn" role="status">
            <Icon name="alert" size={18} />
            <p>This server has no email key (RESEND_API_KEY), so nothing will be sent until one is set.</p>
          </div>
        )}

        <div className="profile-actions">
          <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || !!busy}>{busy === 'save' ? 'Saving…' : 'Save changes'}</button>
          <button type="button" className="btn" onClick={test} disabled={dirty || !saved.email || !emailReady || !!busy}
            title={dirty ? 'Save your changes first' : !saved.email ? 'Add your email first' : undefined}>
            <Icon name="mail" size={16} />{busy === 'test' ? 'Sending…' : 'Send me a test email'}
          </button>
          <p className="muted" role="status">{dirty ? 'Unsaved changes.' : note}</p>
        </div>
      </section>
    </div>
  );
}
