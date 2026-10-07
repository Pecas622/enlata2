// Ilustración del equipo por tipo y color, portada de DeviceArt del prototipo (sin foto real).
export const COLOR_HEX: Record<string, string> = {
  Negro: "#2E2E30", Blanco: "#F0F0F0", Plata: "#D9DADC", Azul: "#9DB7D0", Rojo: "#BF2C3A", Verde: "#B3CBB6",
  Rosa: "#F2CFD6", "Titanio natural": "#BDB3A6", "Titanio negro": "#3E3E41", Dorado: "#E3CFA8",
};

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, v + amt));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("");
}

export function DeviceArt({ kind, color }: { kind: string; color: string }) {
  const hex = COLOR_HEX[color] || "#BDBDBD";
  const dark = shade(hex, -38);
  const light = shade(hex, 22);
  let body;
  if (kind === "iPad") body = <g><rect x="20" y="16" width="80" height="88" rx="9" fill={hex} /><rect x="24" y="20" width="72" height="80" rx="6" fill="#111" /><rect x="24" y="20" width="72" height="80" rx="6" fill="url(#sheen)" /></g>;
  else if (kind === "Mac") body = <g><rect x="24" y="30" width="72" height="46" rx="4" fill={hex} /><rect x="27" y="33" width="66" height="40" rx="2" fill="#111" /><path d="M12 78h96l-6 7H18z" fill={dark} /></g>;
  else if (kind === "Watch") body = <g><rect x="46" y="8" width="28" height="22" rx="6" fill={dark} /><rect x="46" y="90" width="28" height="22" rx="6" fill={dark} /><rect x="36" y="28" width="48" height="64" rx="14" fill={hex} /><rect x="40" y="32" width="40" height="56" rx="11" fill="#111" /><rect x="84" y="46" width="4" height="12" rx="2" fill={dark} /></g>;
  else if (kind === "AirPods") body = <g><rect x="34" y="40" width="52" height="46" rx="16" fill={hex} /><path d="M34 60h52" stroke={dark} strokeWidth="1.5" /><circle cx="60" cy="72" r="3" fill={dark} /><rect x="42" y="14" width="12" height="30" rx="6" fill="#fff" stroke={light} /><rect x="66" y="14" width="12" height="30" rx="6" fill="#fff" stroke={light} /></g>;
  else body = <g><rect x="34" y="8" width="52" height="104" rx="13" fill={hex} /><rect x="34" y="8" width="52" height="104" rx="13" fill="url(#sheen)" /><rect x="39" y="13" width="23" height="23" rx="7" fill={dark} /><circle cx="46" cy="20" r="4.2" fill="#15151a" /><circle cx="55" cy="29" r="4.2" fill="#15151a" /><circle cx="46" cy="30" r="2" fill="#15151a" /><circle cx="73" cy="20" r="3" fill={light} opacity=".9" /></g>;
  return (
    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }} aria-hidden="true">
      <defs><linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".12" /></linearGradient></defs>
      <ellipse cx="60" cy="112" rx="30" ry="3.2" fill="#000" opacity=".08" />
      {body}
    </svg>
  );
}
