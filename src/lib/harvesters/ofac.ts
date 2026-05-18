import { XMLParser } from "fast-xml-parser";
import {
  upsertAttributionsBatch,
  resolveChainAlias,
  resolveChainFromAddressShape,
  type AttributionClaim,
} from "../address-attribution";

/**
 * OFAC SDN list harvester.
 *
 * Source: US Treasury Office of Foreign Assets Control "Specially Designated
 * Nationals and Blocked Persons" list. Digital-currency wallet addresses are
 * published as `<id>` elements with idType "Digital Currency Address - <SYMBOL>".
 *
 * Authoritative URL: https://www.treasury.gov/ofac/downloads/sdn.xml
 * Mirror (CORS-friendly): https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML
 *
 * The full SDN.XML is ~30MB. We fetch, parse, and only persist Digital
 * Currency entries — a few hundred wallets at last count. Re-running is
 * idempotent thanks to the (address_id, source, source_ref) unique key.
 */

const OFAC_SDN_URL =
  process.env.OFAC_SDN_URL ??
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";

const DIGITAL_CURRENCY_PREFIX = "Digital Currency Address - ";

type SdnEntry = {
  uid?: string | number;
  firstName?: string;
  lastName?: string;
  title?: string;
  sdnType?: string;
  remarks?: string;
  programList?: {
    program?: string | string[];
  };
  idList?: {
    id?: SdnId | SdnId[];
  };
};

type SdnId = {
  uid?: string | number;
  idType?: string;
  idNumber?: string;
  idCountry?: string;
};

export type OfacHarvestResult = {
  fetchedAt: string;
  totalSdnEntries: number;
  digitalCurrencyEntries: number;
  claimsAttempted: number;
  addressesTouched: number;
  rowsWritten: number;
  unmappedChains: string[];
};

export async function harvestOfac(): Promise<OfacHarvestResult> {
  const fetchedAt = new Date().toISOString();
  const xml = await fetchXml(OFAC_SDN_URL);

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml) as {
    sdnList?: { sdnEntry?: SdnEntry | SdnEntry[] };
  };

  const sdnEntries = toArray<SdnEntry>(parsed.sdnList?.sdnEntry);
  const claims: AttributionClaim[] = [];
  const unmappedChains = new Set<string>();
  let digitalCurrencyEntries = 0;

  for (const entry of sdnEntries) {
    const ids = toArray<SdnId>(entry.idList?.id);
    const cryptoIds = ids.filter(
      (id) => id.idType?.startsWith(DIGITAL_CURRENCY_PREFIX) && id.idNumber,
    );
    if (cryptoIds.length === 0) continue;
    digitalCurrencyEntries += 1;

    const ownerName = buildOwnerName(entry);
    const ownerKind = mapSdnTypeToOwnerKind(entry.sdnType);
    const programs = toArray<string>(entry.programList?.program)
      .filter(Boolean)
      .join(", ");
    const notes = [
      entry.title ? `Title: ${entry.title}` : null,
      programs ? `Programs: ${programs}` : null,
      entry.remarks ? `Remarks: ${entry.remarks}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    for (const id of cryptoIds) {
      const symbol = id.idType!.slice(DIGITAL_CURRENCY_PREFIX.length).trim();
      const address = id.idNumber!.trim();
      // Shape-detect override: OFAC SDN entries tag wallets by token
      // symbol (USDT, USDC, etc.) — without this, TRC-20 USDT wallets get
      // routed to ethereum and disappear from chain="tron" investigative
      // queries. Trust the address shape over the (ambiguous) token tag.
      const chain =
        resolveChainFromAddressShape(address) ?? resolveChainAlias(symbol);
      if (!chain) {
        unmappedChains.add(symbol);
        continue;
      }
      claims.push({
        chain,
        address,
        source: "ofac",
        sourceRef: id.uid ? String(id.uid) : String(entry.uid ?? ""),
        sourceUrl: `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=${entry.uid}`,
        category: "sanctioned",
        ownerName,
        ownerKind,
        label: ownerName,
        notes: notes || null,
        confidence: 100,
        reportedAt: new Date(),
      });
    }
  }

  const { addressIds, rows } = await upsertAttributionsBatch(claims);

  return {
    fetchedAt,
    totalSdnEntries: sdnEntries.length,
    digitalCurrencyEntries,
    claimsAttempted: claims.length,
    addressesTouched: addressIds.length,
    rowsWritten: rows,
    unmappedChains: [...unmappedChains],
  };
}

// Hard cap on the SDN.XML download. Actual file is ~30MB; the cap is 4×
// that as headroom for OFAC ever growing. A buggy redirect or upstream
// outage that returned an unbounded stream would otherwise OOM the cron
// function and never error visibly.
const OFAC_MAX_BYTES = 120 * 1024 * 1024;

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "RexIntel/1.0 (intel graph harvester; rexintelservices@proton.me)",
      Accept: "application/xml,text/xml,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`OFAC fetch failed: ${res.status} ${res.statusText}`);
  }
  return readWithCap(res, OFAC_MAX_BYTES, "OFAC");
}

async function readWithCap(
  res: Response,
  maxBytes: number,
  label: string,
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error(
          `${label} fetch exceeded ${maxBytes} byte cap (got >${total})`,
        );
      }
      chunks.push(value);
    }
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

function buildOwnerName(entry: SdnEntry): string {
  // Individuals: "Last, First" → "First Last"; entities: just lastName.
  const first = entry.firstName?.trim();
  const last = entry.lastName?.trim();
  if (first && last) return `${first} ${last}`;
  return last ?? first ?? "(unnamed OFAC entity)";
}

function mapSdnTypeToOwnerKind(
  sdnType: string | undefined,
): AttributionClaim["ownerKind"] {
  switch ((sdnType ?? "").toLowerCase()) {
    case "individual":
      return "individual";
    case "entity":
      return "criminal-group";
    case "vessel":
    case "aircraft":
      return "unknown";
    default:
      return "unknown";
  }
}

function toArray<T>(input: T | T[] | undefined | null): T[] {
  if (input == null) return [];
  return Array.isArray(input) ? input : [input];
}
