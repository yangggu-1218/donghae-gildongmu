// 마스코트 동이의 말풍선. pose: neutral | wave | ask | think | happy | worry | thanks (public/dongi/*.webp)
export default function Dongi({ pose = "neutral", name = "동이", children }: { pose?: string; name?: string; children: React.ReactNode }) {
  return (
    <div className="says">
      <img src={`/dongi/${pose}.webp`} alt="" />
      <div className="bubble" aria-live="polite"><b>{name}</b>{children}</div>
    </div>
  );
}
