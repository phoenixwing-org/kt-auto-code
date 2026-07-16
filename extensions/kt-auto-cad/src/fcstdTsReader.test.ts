import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { analyzeFcstdBytes, readZipTextEntry } from "./fcstdTsReader.js";

describe("KT Auto CAD TypeScript FCStd reader", () => {
  it("extracts Document.xml objects and XLinks from a deflated FCStd ZIP", () => {
    const xml = `<?xml version="1.0"?>
      <Document>
        <Object type="App::Part" name="Assembly" />
        <Object type="PartDesign::Body" name="Body" />
        <Object name="Assembly"><Properties>
          <Property name="Label"><String value="总成 &amp; A" /></Property>
          <Property name="Linked"><XLink file="parts/100.001-H-Bolt.FCStd" /></Property>
        </Properties></Object>
      </Document>`;
    const analysis = analyzeFcstdBytes(makeZip("Document.xml", Buffer.from(xml), 8));
    expect(analysis.objectCount).toBe(2);
    expect(analysis.xlinks).toEqual([{ file: "parts/100.001-H-Bolt.FCStd", label: "总成 & A" }]);
    expect(analysis.documentXmlBytes).toBe(Buffer.byteLength(xml));
  });

  it("supports stored entries and rejects files without Document.xml", () => {
    expect(readZipTextEntry(makeZip("Document.xml", Buffer.from("<Document />"), 0), "Document.xml"))
      .toBe("<Document />");
    expect(() => analyzeFcstdBytes(makeZip("GuiDocument.xml", Buffer.from("<GuiDocument />"), 0)))
      .toThrow(/Document\.xml/);
  });
});

function makeZip(name: string, content: Buffer, method: 0 | 8): Buffer {
  const filename = Buffer.from(name);
  const compressed = method === 8 ? deflateRawSync(content) : content;
  const local = Buffer.alloc(30 + filename.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(filename.length, 26);
  filename.copy(local, 30);

  const central = Buffer.alloc(46 + filename.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(filename.length, 28);
  filename.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + compressed.length, 16);
  return Buffer.concat([local, compressed, central, eocd]);
}
