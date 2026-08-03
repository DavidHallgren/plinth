import type { Document, Project, SceneElement } from "../lib/schema";

export function selectActiveDocument(project: Project, documentId: string | null | undefined): Document {
  return project.documents.find((document) => document.id === documentId) ?? project.documents[0] as Document;
}

export function selectSelectedElements(document: Document, selectedIds: readonly string[]): SceneElement[] {
  const selected = new Set(selectedIds);
  return document.elements.filter((element) => selected.has(element.id));
}

export function selectSortedLayers(document: Document): SceneElement[] {
  return document.elements
    .map((element, index) => ({ element, index }))
    .sort((left, right) => left.element.zIndex - right.element.zIndex || left.index - right.index)
    .map(({ element }) => element);
}

export function selectAssetReferences(project: Project, documentId?: string): Map<string, number> {
  const documents = documentId ? project.documents.filter((document) => document.id === documentId) : project.documents;
  const references = new Map<string, number>();
  for (const document of documents) {
    for (const element of document.elements) {
      const assetPath = element.type === "image" ? element.assetPath : element.type === "device" ? element.screenshotPath : null;
      if (!assetPath) continue;
      references.set(assetPath, (references.get(assetPath) ?? 0) + 1);
    }
  }
  return references;
}

export type AssetUsage = {
  documentId: string;
  documentName: string;
  elementId: string;
  elementName: string;
  elementType: "image" | "device";
};

export function selectAssetUsages(project: Project, assetPath: string): AssetUsage[] {
  const usages: AssetUsage[] = [];
  for (const document of project.documents) {
    for (const element of document.elements) {
      const referencedPath = element.type === "image" ? element.assetPath : element.type === "device" ? element.screenshotPath : null;
      if (referencedPath !== assetPath || (element.type !== "image" && element.type !== "device")) continue;
      usages.push({
        documentId: document.id,
        documentName: document.name,
        elementId: element.id,
        elementName: element.name,
        elementType: element.type,
      });
    }
  }
  return usages;
}

export function selectElementById(document: Document, elementId: string | null | undefined): SceneElement | undefined {
  return elementId ? document.elements.find((element) => element.id === elementId) : undefined;
}
