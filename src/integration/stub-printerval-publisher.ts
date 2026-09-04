import type { PrintervalPublisher } from "../monetization/publish-service";

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export function createStubPrintervalPublisher(): PrintervalPublisher {
  return {
    async publish(request) {
      const publicationId = `printerval-stub-${stableHash(request.idempotencyKey)}`;
      return {
        ok: true,
        publicationId,
        status: "published",
        publishedUrl: `https://printerval.example/stub/${publicationId}`,
      };
    },
  };
}
