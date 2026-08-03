import { FilePlus2 } from "lucide-react";
import { Stage } from "react-konva";
import type { Document } from "../../lib/schema";
import type { AssetMetadata } from "../../lib/schema";
import { thumbnailSize } from "../../devices/geometry";
import { SceneRenderer } from "../../canvas/scene-renderer";
import { Button } from "../ui/button";

type DocumentStripProps = {
  documents: Document[];
  activeDocumentId: string;
  onSelect: (documentId: string) => void;
  onAdd: () => void;
  projectSlug: string;
  assets: readonly AssetMetadata[];
};

export function DocumentStrip({ documents, activeDocumentId, onSelect, onAdd, projectSlug, assets }: DocumentStripProps) {
  return (
    <footer className="flex h-[76px] shrink-0 items-center gap-2 border-t border-white/[0.08] bg-[#11141b] px-3">
      <div className="mr-1 hidden shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted lg:flex"><span className="h-1.5 w-1.5 rounded-full bg-violet" />Frames</div>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
        {documents.map((document, index) => (
          <button className={`group flex h-12 min-w-[156px] max-w-[220px] items-center gap-2 rounded-lg border px-2.5 text-left ${document.id === activeDocumentId ? "border-violet/40 bg-violet/[0.11]" : "border-white/[0.08] bg-white/[0.025] hover:border-white/20"}`} key={document.id} onClick={() => onSelect(document.id)} type="button">
            <div className={`grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md border ${document.id === activeDocumentId ? "border-violet/30 bg-violet/15 text-violet-soft" : "border-white/10 bg-black/15 text-muted"}`}><DocumentThumbnail assets={assets} document={document} projectSlug={projectSlug} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink/90">{index + 1}. {document.name}</p>
              <p className="mt-0.5 truncate text-[10px] text-muted">{document.width} × {document.height}</p>
            </div>
          </button>
        ))}
      </div>
      <Button aria-label="Add document" onClick={onAdd} size="icon" variant="secondary"><FilePlus2 size={16} /></Button>
    </footer>
  );
}

function DocumentThumbnail({ document, projectSlug, assets }: { document: Document; projectSlug: string; assets: readonly AssetMetadata[] }) {
  const size = thumbnailSize(document.width, document.height, 28, 28);
  return <Stage height={size.height} listening={false} scaleX={size.scale} scaleY={size.scale} width={size.width}><SceneRenderer assets={assets} document={document} projectSlug={projectSlug} /></Stage>;
}
