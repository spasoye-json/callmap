const SVG = 'http://www.w3.org/2000/svg';

export const svgOf = <Name extends keyof SVGElementTagNameMap>(
  name: Name,
  attributes: Readonly<Record<string, string | number>> = {},
  ...children: readonly (SVGElement | string)[]
): SVGElementTagNameMap[Name] => {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  element.append(...children);
  return element;
};
