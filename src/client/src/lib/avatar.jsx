import { useRef, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';
import { t } from './i18n.jsx';
import { Icon } from '../icons.jsx';

const initial = (user) => user?.name?.trim()[0]?.toUpperCase() || '?';

/** The student's picture, or the first letter of their name */
export function Avatar({ user, className = 'avatar' }) {
  if (user?.avatar) return <img className={`${className} has-pic`} src={user.avatar} alt="" draggable="false" />;
  return <span className={className}>{initial(user)}</span>;
}

/**
 * Make a small square picture in the browser: the middle of the photo, 256 x 256,
 * so the account only stores about 20-60 KB.
 */
export async function squarePicture(file, size = 256) {
  if (!file.type.startsWith('image/')) throw new Error(t('Choose a picture (JPG, PNG, WebP or GIF).'));
  if (file.size > 25 * 1024 * 1024) throw new Error(t('That picture is too big (over 25 MB).'));
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(t('That file could not be opened as a picture.')));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const q of [0.86, 0.75, 0.6, 0.45]) {
      let data = canvas.toDataURL('image/webp', q);
      if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', q);   // Safari
      if (data.length <= 110_000) return data;
    }
    throw new Error(t('That picture is too big. Try another one.'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Settings › Account: change or remove the profile picture */
export function AvatarPicker({ flash }) {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const save = async (avatar) => {
    setBusy(true);
    try {
      const r = await api.patch('/auth/me', { avatar });
      setUser(r.user);
      flash?.(avatar ? t('Profile picture saved') : t('Profile picture removed'));
    } catch (err) {
      flash?.(err.message, 'err');
    } finally {
      setBusy(false);
    }
  };
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { await save(await squarePicture(file)); } catch (err) { flash?.(err.message, 'err'); }
  };
  return (
    <div className="avatar-pick">
      <button type="button" className="avatar-edit" onClick={() => input.current?.click()} disabled={busy}
        aria-label={user.avatar ? 'Change profile picture' : 'Add a profile picture'} title={user.avatar ? 'Change profile picture' : 'Add a profile picture'}>
        <Avatar user={user} className="set-avatar" />
        <span className="avatar-cam" aria-hidden="true"><Icon name="camera" size={15} /></span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
      <div className="avatar-btns">
        <button className="btn sm" type="button" onClick={() => input.current?.click()} disabled={busy}>{user.avatar ? 'Change picture' : 'Upload picture'}</button>
        {user.avatar && <button className="btn sm ghost" type="button" onClick={() => save('')} disabled={busy}>Remove</button>}
      </div>
    </div>
  );
}
