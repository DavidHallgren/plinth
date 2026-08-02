import index from "./index.html";
import {
  apiAction,
  handleAddDocument,
  handleApiNotFound,
  handleCreateProject,
  handleDeleteProject,
  handleDuplicateProject,
  handleGetProject,
  handleHealth,
  handleListProjects,
  handleRenameProject,
  handleReservedExportOrAsset,
  handleSaveProject,
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
  "/api/projects/:slug/documents": {
    POST: (request: Request) => apiAction(() => handleAddDocument(request, storage)),
  },
  "/api/projects/:slug/assets": {
    GET: () => handleReservedExportOrAsset(),
    POST: () => handleReservedExportOrAsset(),
  },
  "/api/projects/:slug/assets/*": () => handleReservedExportOrAsset(),
  "/api/projects/:slug/exports": {
    GET: () => handleReservedExportOrAsset(),
    POST: () => handleReservedExportOrAsset(),
  },
  "/api/projects/:slug/exports/*": () => handleReservedExportOrAsset(),
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
