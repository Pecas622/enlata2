import React from "react";
import { CARBON, CARD, CARD2, BORDER, OFFWHITE, GREEN, GRAY, RED, AMBER } from "./theme.js";

const BADGE_TONES = {
  neutral: { bg: "#232327", color: OFFWHITE },
  green: { bg: "rgba(184,255,61,0.15)", color: GREEN },
  gray: { bg: "rgba(138,138,138,0.15)", color: GRAY },
  red: { bg: "rgba(255,107,107,0.15)", color: RED },
  amber: { bg: "rgba(255,201,61,0.15)", color: AMBER },
};

export function Badge({ children, tone = "gray" }) {
  const t = BADGE_TONES[tone] || BADGE_TONES.gray;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 999,
      background: t.bg, color: t.color, fontSize: 12, fontWeight: 600,
      fontFamily: "Inter", letterSpacing: 0.2,
    }}>{children}</span>
  );
}

const BTN_SIZES = {
  md: { fontSize: 13, padding: "10px 15px", borderRadius: 8 },
  lg: { fontSize: 14, padding: "13px 22px", borderRadius: 9 },
};

export function Btn({ children, onClick, variant = "primary", size = "md", type = "button", disabled, href, style = {} }) {
  const base = {
    fontFamily: "Inter", fontWeight: variant === "primary" || size === "lg" ? 700 : 600,
    cursor: disabled ? "not-allowed" : "pointer", border: "none",
    transition: "opacity .15s", opacity: disabled ? 0.4 : 1,
    textDecoration: "none", display: "inline-block",
    ...BTN_SIZES[size],
  };
  const variants = {
    primary: { background: GREEN, color: CARBON },
    secondary: { background: "transparent", color: OFFWHITE, border: `1px solid ${BORDER}` },
    danger: { background: "transparent", color: RED, border: "1px solid #3A1F1F" },
    ghost: { background: "transparent", color: GRAY, border: "none", padding: "6px 8px" },
  };
  const El = href ? "a" : "button";
  return (
    <El
      href={href}
      target={href ? "_blank" : undefined}
      rel={href ? "noopener noreferrer" : undefined}
      type={href ? undefined : type}
      onClick={disabled ? undefined : onClick}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.opacity = 0.8; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.opacity = disabled ? 0.4 : 1; }}
    >
      {children}
    </El>
  );
}

export function Field({ label, children, required, minWidth = 140 }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontFamily: "Inter", fontSize: 12, color: GRAY, flex: 1, minWidth }}>
      {label}{required && <span style={{ color: GREEN }}> *</span>}
      {children}
    </label>
  );
}

export const inputStyle = {
  background: CARD2, border: `1px solid ${BORDER}`, borderRadius: 8, color: OFFWHITE,
  padding: "9px 10px", fontFamily: "Inter", fontSize: 13, outline: "none",
};

export function Input(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

export function Select(props) {
  return <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>{props.children}</select>;
}

export function Card({ children, style = {} }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

export function EmptyState({ text }) {
  return (
    <div style={{ padding: "36px 20px", textAlign: "center", color: GRAY, fontFamily: "Inter", fontSize: 13 }}>
      {text}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 22, color: OFFWHITE }}>{title}</div>
        {subtitle && <div style={{ fontFamily: "Inter", fontSize: 13, color: GRAY, marginTop: 4 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

export function FilterChips({ options, value, onChange, counts }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      {options.map((o) => (
        <div key={o} onClick={() => onChange(o)} style={{
          padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontFamily: "Inter", fontSize: 12, fontWeight: 600,
          background: value === o ? GREEN : "transparent", color: value === o ? CARBON : GRAY,
          border: `1px solid ${value === o ? GREEN : BORDER}`,
          display: "flex", alignItems: "center", gap: 6,
        }}>{o}{counts && <span style={{ opacity: 0.7, fontSize: 11 }}>{counts[o] ?? 0}</span>}</div>
      ))}
    </div>
  );
}

export function StatCard({ label, value, onClick, tone }) {
  return (
    <Card style={{ cursor: onClick ? "pointer" : "default" }}>
      <div onClick={onClick}>
        <div style={{ fontFamily: "Inter", fontSize: 12, color: GRAY, marginBottom: 8 }}>{label}</div>
        <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 22, color: tone || OFFWHITE }}>{value}</div>
      </div>
    </Card>
  );
}
