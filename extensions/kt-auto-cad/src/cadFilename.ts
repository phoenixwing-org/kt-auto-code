import {
  pnwInferBomDocumentKinds,
  pnwInferBomFieldsFromFilename,
} from "@phoenix-wing/cad-core";

export interface KtcCadFilenameHint {
  readonly filename: string;
  readonly documentKind: string;
  readonly partKey: string;
  readonly partName: string;
}

export function describeCadFilename(relativePath: string): KtcCadFilenameHint | undefined {
  if (!/\.fcstd$/i.test(relativePath)) return undefined;
  const fields = pnwInferBomFieldsFromFilename(relativePath);
  const kinds = pnwInferBomDocumentKinds(relativePath);
  return {
    filename: fields.filename,
    documentKind: kinds.display,
    partKey: fields.PartNumber && fields.PartVersion
      ? `${fields.PartNumber}.${fields.PartVersion}`
      : "",
    partName: fields.PartName,
  };
}
