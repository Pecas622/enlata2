import type { Channel, Format } from "./channels";

// Link al generador con una idea precargada (marca, red, formato, objetivo y tema).
export function generatorHref(brandId: string, i: { topic: string; channel: Channel; format: Format; goal: string }) {
  const q = new URLSearchParams({ marca: brandId, red: i.channel, formato: i.format, objetivo: i.goal, tema: i.topic });
  return `/generar?${q}`;
}
