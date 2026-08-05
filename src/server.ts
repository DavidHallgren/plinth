import index from "./index.html";
import {
  apiAction,
  handleAddDeck,
  handleAddScreen,
  handleApiNotFound,
  handleCreateProject,
  handleDeleteProject,
  handleDuplicateProject,
  handleGetProject,
  handleGetAsset,
  handleGetExport,
  handleHealth,
  handleListAssets,
  handleListProjects,
  handleRenameProject,
  handleCreateExport,
  handleCreateExportRun,
  handleListExports,
  handleSaveProject,
  handleUploadAsset,
  handleRenameAsset,
  handleDeleteAsset,
} from "./lib/api";
import { ProjectStorage } from "./lib/storage";

const storage = new ProjectStorage(Bun.env.PLINTH_DATA_ROOT ?? undefined);

const routes = {
  "/api/health": {
    GET: () => apiAction(() => handleHealth()),
  },
  "/api/projects": {
    GET: () => apiAction(() => handleListProjects(storage)),
    POST: (request: Request) => apiAction(() => handleCreateProject(request, storage)),
  },
  "/api/projects/:slug": {
    GET: (request: Request) => apiAction(() => handleGetProject(request, storage)),
    PUT: (request: Request) => apiAction(() => handleSaveProject(request, storage)),
    DELETE: (request: Request) => apiAction(() => handleDeleteProject(request, storage)),
  },
  "/api/projects/:slug/rename": {
    POST: (request: Request) => apiAction(() => handleRenameProject(request, storage)),
  },
  "/api/projects/:slug/duplicate": {
    POST: (request: Request) => apiAction(() => handleDuplicateProject(request, storage)),
  },
  "/api/projects/:slug/decks": {
    POST: (request: Request) => apiAction(() => handleAddDeck(request, storage)),
  },
  "/api/projects/:slug/decks/:deckId/screens": {
    POST: (request: Request) => apiAction(() => handleAddScreen(request, storage)),
  },
  "/api/projects/:slug/assets": {
    GET: (request: Request) => apiAction(() => handleListAssets(request, storage)),
    POST: (request: Request) => apiAction(() => handleUploadAsset(request, storage)),
  },
  "/api/projects/:slug/assets/*": {
    GET: (request: Request) => apiAction(() => handleGetAsset(request, storage)),
    PATCH: (request: Request) => apiAction(() => handleRenameAsset(request, storage)),
    DELETE: (request: Request) => apiAction(() => handleDeleteAsset(request, storage)),
  },
  "/api/projects/:slug/exports": {
    GET: (request: Request) => apiAction(() => handleListExports(request, storage)),
    POST: (request: Request) => apiAction(() => handleCreateExport(request, storage)),
  },
  "/api/projects/:slug/export-runs": {
    POST: (request: Request) => apiAction(() => handleCreateExportRun(request, storage)),
  },
  "/api/projects/:slug/exports/*": (request: Request) => apiAction(() => handleGetExport(request, storage)),
  "/api/*": () => handleApiNotFound(),
  "/": index,
  "/*": index,
};

export const server = Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  hostname: Bun.env.HOST ?? "127.0.0.1",
  development: Bun.env.NODE_ENV !== "production",
  routes,
  fetch: () => new Response("Not found", { status: 404 }),
  error(error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  },
});

if (import.meta.main) {
  console.log(`Plinth running at ${server.url}`);
}
