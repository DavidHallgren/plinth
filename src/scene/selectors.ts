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
      if (element.type !== "image") continue;
      references.set(element.assetId, (references.get(element.assetId) ?? 0) + 1);
    }
  }
  return references;
}

export function selectElementById(document: Document, elementId: string | null | undefined): SceneElement | undefined {
  return elementId ? document.elements.find((element) => element.id === elementId) : undefined;
}
