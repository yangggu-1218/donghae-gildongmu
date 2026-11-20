// 마스코트 동이의 말풍선. pose: neutral | wave | ask | think | happy | worry | thanks (public/dongi/*.webp)
// face=false: 이어지는 말풍선은 얼굴을 숨겨 화면을 덜 어지럽게 (자리는 그대로 두어 줄이 맞음)
export default function Dongi({ pose = "neutral", name = "동이", face = true, children }: { pose?: string; name?: string; face?: boolean; children: React.ReactNode }) {
  return (
    <div className={`says${face ? "" : " quiet"}`}>
      <img src={`/dongi/${pose}.webp`} alt="" />
      <div className="bubble"><b>{name}</b>{children}</div>
    </div>
  );
}
