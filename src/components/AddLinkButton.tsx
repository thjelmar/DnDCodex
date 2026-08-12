import { useNavigate } from 'react-router-dom'

// Shown in place of an empty link picker: there's nothing of this kind to link
// yet, so offer a shortcut to the section where you'd create one.
export function AddLinkButton({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" className="btn small" onClick={() => navigate(to)}>
      ＋ Add {label}
    </button>
  )
}
