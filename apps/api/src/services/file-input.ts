export function toPdfDataUrl(base64Data: string): string {
  return `data:application/pdf;base64,${base64Data}`;
}
